import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { dirDatos, escribirJsonAtomico, leerJson } from "./almacen.js";
import { idAlumnoValido } from "./alumnos.js";
import type { Partida, Sesion } from "./types.js";

/** Meses que se conservan los datos de jugadores (aviso de privacidad, S-11). RETENCION_MESES para pruebas. */
export const retencionMeses = () => Number(process.env.RETENCION_MESES) || 12;

const partidasJson = (dir: string) => {
  try { return readdirSync(join(dir, "partidas")).filter((f) => f.endsWith(".json")); } catch { return []; }
};
const borrarPartida = (dir: string, archivo: string) => {
  rmSync(join(dir, "partidas", archivo), { force: true });
  rmSync(join(dir, "partidas", archivo.replace(/\.json$/, ".csv")), { force: true });
};

/**
 * Borra partidas (json + csv) y sesiones con más de `meses` meses; devuelve cuántos registros eliminó.
 * Solo toca partidas/*.json|csv y sesiones.json: nunca alumnos.json ni otros archivos. Un json ilegible o sin fecha se conserva.
 */
export function purgarVencidos(dir: string = dirDatos(), ahora: Date = new Date(), meses: number = retencionMeses()): number {
  const corte = new Date(ahora); corte.setMonth(corte.getMonth() - meses);
  const vencido = (iso: unknown) => typeof iso === "string" && new Date(iso) < corte;
  let n = 0;
  for (const f of partidasJson(dir)) {
    if (vencido(leerJson<Partida | null>(join(dir, "partidas", f), null)?.inicio)) { borrarPartida(dir, f); n++; }
  }
  const archivo = join(dir, "sesiones.json");
  const sesiones = leerJson<unknown>(archivo, []);
  if (Array.isArray(sesiones)) {
    const quedan = (sesiones as Sesion[]).filter((s) => !vencido(s?.creada));
    if (quedan.length < sesiones.length) { escribirJsonAtomico(archivo, quedan); n += sesiones.length - quedan.length; }
  }
  return n;
}

/**
 * El árbitro escribe un CSV por partida en `bench-out/` (con la semilla en el nombre y la pieza correcta dentro): se borra por fecha
 * de modificación pasados `meses` meses. Solo toca `intentos-*.csv`. Devuelve cuántos borró.
 */
export function purgarBench(dir = "bench-out", ahora: Date = new Date(), meses: number = retencionMeses()): number {
  const corte = new Date(ahora); corte.setMonth(corte.getMonth() - meses);
  let n = 0;
  try {
    for (const f of readdirSync(dir)) {
      if (!/^intentos-.*\.csv$/.test(f)) continue;
      if (statSync(join(dir, f)).mtime < corte) { rmSync(join(dir, f), { force: true }); n++; }
    }
  } catch { /* sin carpeta: nada que purgar */ }
  return n;
}

/**
 * Derecho de supresión: borra las partidas (json + csv) en las que jugó `id`. Borra la partida entera
 * (el rival también pierde ese registro) porque el CSV no separa por persona. Devuelve cuántas borró; 0 si el id es inválido.
 */
export function eliminarDatosDeAlumno(dir: string, id: string): number {
  if (!idAlumnoValido(id)) return 0;
  let n = 0;
  for (const f of partidasJson(dir)) {
    const p = leerJson<Partida | null>(join(dir, "partidas", f), null);
    if (p?.jugadores?.some((j) => j.alumnoId === id)) { borrarPartida(dir, f); n++; }
  }
  return n;
}

/** Al arrancar y luego cada 24 h. Registra solo el número eliminado. */
export function iniciarRetencion(): void {
  const correr = () => {
    try { console.log(`retención: ${purgarVencidos() + purgarBench()} registros eliminados`); }
    catch (e) { console.error(`retención: falló: ${(e as Error).message}`); }
  };
  correr();
  setInterval(correr, 24 * 3600 * 1000).unref();
}
