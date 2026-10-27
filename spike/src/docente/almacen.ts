import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EstadoVivo, Partida, Sesion } from "./types.js";

/** Directorio de datos: DOCENTE_DATA o spike/data/docente (ignorado por git). Se lee en cada llamada. */
export const dirDatos = () => process.env.DOCENTE_DATA?.trim() || resolve(import.meta.dirname, "../../data/docente");
const ruta = (...p: string[]) => join(dirDatos(), ...p);

/** Escribe a un temporal y renombra: el lector ve el archivo viejo o el nuevo, nunca a medias. */
export function escribirAtomico(destino: string, texto: string): void {
  mkdirSync(resolve(destino, ".."), { recursive: true });
  const tmp = `${destino}.${process.pid}.tmp`;
  writeFileSync(tmp, texto);
  renameSync(tmp, destino);
}
export const escribirJsonAtomico = (destino: string, datos: unknown) => escribirAtomico(destino, JSON.stringify(datos, null, 2));

/** Lee un JSON; si falta o está dañado devuelve `defecto`. */
export function leerJson<T>(archivo: string, defecto: T): T {
  try { return JSON.parse(readFileSync(archivo, "utf8")) as T; } catch { return defecto; }
}

const listar = <T>(sub: string): T[] => {
  try {
    return readdirSync(ruta(sub)).filter((f) => f.endsWith(".json")).flatMap((f) => {
      const v = leerJson<T | null>(ruta(sub, f), null);
      return v ? [v] : [];
    });
  } catch { return []; }
};

export function guardarPartida(p: Partida, csv: string): void {
  escribirAtomico(ruta("partidas", `${p.id}.csv`), csv);
  escribirJsonAtomico(ruta("partidas", `${p.id}.json`), p);
}
/** Más recientes primero. */
export const listarPartidas = (): Partida[] => listar<Partida>("partidas").sort((a, b) => b.inicio.localeCompare(a.inicio));
export const leerPartida = (id: string): Partida | null => (/^[\w-]+$/.test(id) ? leerJson<Partida | null>(ruta("partidas", `${id}.json`), null) : null);
export const rutaCsv = (id: string) => ruta("partidas", `${id}.csv`);

export const guardarVivo = (v: EstadoVivo) => escribirJsonAtomico(ruta("vivo", `${v.sala}.json`), v);
export const borrarVivo = (sala: string) => rmSync(ruta("vivo", `${sala}.json`), { force: true });
export const listarVivo = (): EstadoVivo[] => listar<EstadoVivo>("vivo");

export const leerSesiones = (): Sesion[] => leerJson<Sesion[]>(ruta("sesiones.json"), []);
export const guardarSesiones = (s: Sesion[]) => escribirJsonAtomico(ruta("sesiones.json"), s);
