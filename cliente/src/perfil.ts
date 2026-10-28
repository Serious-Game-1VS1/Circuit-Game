/**
 * Perfil local por alias (SCRUM-166, fases Progreso y Recompensa acumulativas): XP, rango, nivel desbloqueado
 * e insignias, guardados en el dispositivo (localStorage; si falla, solo memoria). Sin cuentas ni datos personales.
 * La lógica es pura (aplicarPartida, resultadoDe, progresoRango); el almacenamiento está al final. Prueba en test/perfil.test.ts.
 * PROVISIONAL: rangos e insignias se afinarán con el tutor.
 */
import type { End, Nivel } from "../../spike/src/protocol";
import { terminada, type Pantalla } from "./pantalla";
import { cambios, habilidad, unir, type Cambio, type Conteo, type Dominio } from "./dominio";
import { puntosDe } from "./progreso";

/** PROVISIONAL: rangos por XP acumulada. Único sitio donde se cambian. */
export const RANGOS = [
  { nombre: "Aprendiz", xp: 0 },
  { nombre: "Técnico", xp: 300 },
  { nombre: "Experto", xp: 800 },
  { nombre: "Maestro", xp: 1500 },
] as const;

/** PROVISIONAL: medalla de un pod según su tiempo frente a tu mejor marca (1 = igualarla o mejorarla). Único sitio donde se cambian. */
export const UMBRALES_MEDALLA = { oro: 1, plata: 1.25, bronce: 1.5 } as const;
export type Medalla = keyof typeof UMBRALES_MEDALLA;

export interface Perfil { alias: string; xp: number; partidas: number; ganadas: number; pods: number; limpios: number; nivelDesbloqueado: 1 | 2; insignias: string[];
  /** Ids de mini-tutoriales completados (ver marcarTutorial). */
  tutoriales: string[];
  /** Aciertos y fallos por concepto (ver dominio.ts). */
  dominio: Dominio;
  /** Mejor tiempo (ms) por pod, con clave "nivel-pod" (ver registrarTiempo). */
  records: Record<string, number>;
  /** Mejor número de pods despachados en Oleadas, por nivel. */
  oleadas: Record<string, number>;
  /** Mejor tiempo total (ms) de una práctica de 5 pods, por nivel (la carrera contra tu récord). */
  totales: Record<string, number>;
  /** Firma del último fin de duelo aplicado: si el árbitro reenvía el mismo End tras recargar, no se suma dos veces. */
  ultimoEnd?: string }

/** Lo que dejó una partida. En práctica no hay carrera: `limpios` es 0 (y no se gana). */
export interface Resultado { puntos: number; pods: number; total: number; quemadas: number; limpios: number; gano: boolean; nivel: Nivel;
  /** Lo contado en la partida por concepto (net.dominio); sin él, la partida no mueve habilidades. */
  dominio?: Dominio }

export interface Insignia { id: string; nombre: string; descripcion: string; cumple: (p: Perfil, r: Resultado) => boolean }

/** `cumple` recibe el perfil ya actualizado con la partida. Una insignia se gana una sola vez. */
export const INSIGNIAS: readonly Insignia[] = [
  { id: "primer-pod", nombre: "Primer pod", descripcion: "Despacha tu primer pod", cumple: (p) => p.pods >= 1 },
  { id: "sin-quemadas", nombre: "Sin quemadas", descripcion: "Partida con pods y sin quemar piezas", cumple: (_, r) => r.pods >= 1 && r.quemadas === 0 },
  { id: "racha-limpia", nombre: "Racha limpia", descripcion: "3 pods limpios en una partida", cumple: (_, r) => r.limpios >= 3 },
  { id: "ganador", nombre: "Ganador", descripcion: "Gana un duelo", cumple: (_, r) => r.gano },
  { id: "constante", nombre: "Constante", descripcion: "Juega 5 partidas", cumple: (p) => p.partidas >= 5 },
  { id: "dominio", nombre: "Dominio", descripcion: "3 estrellas en un concepto", cumple: (p) => Object.values(p.dominio).some((c) => habilidad(c).estrellas === 3) },
  { id: "nivel-2", nombre: "Nivel 2 abierto", descripcion: "Despacha todos los pods del nivel 1", cumple: (p) => p.nivelDesbloqueado === 2 },
];

/** Criterio de desbloqueo (SCRUM-166): una partida de nivel 1, práctica o duelo, que despacha todos sus pods (sin Oleadas, donde total es Infinity). */
export const completoNivel1 = (r: Resultado) => r.nivel === 1 && r.pods >= r.total;

/** Selector de nivel de la práctica: el 2 sale con candado hasta desbloquearlo. El duelo no lo usa (el servidor fija el nivel con --nivel/NIVEL). */
export const textoNivel = (p: Perfil, sel: Nivel) => p.nivelDesbloqueado === 2 ? `Nivel de práctica: ${sel} (toca para cambiar)` : "Nivel de práctica: 1\nNivel 2: bloqueado. Completa el nivel 1 para abrirlo";
export const nivelElegido = (p: Perfil, sel: Nivel): Nivel => (p.nivelDesbloqueado === 2 ? sel : 1);
export const cambiarNivel = (p: Perfil, sel: Nivel): Nivel => (p.nivelDesbloqueado === 2 && sel === 1 ? 2 : 1);

/** Saludo del menú (ajusta al ancho): primer uso, XP que falta para el siguiente rango y aviso del nivel 2. */
export function bienvenida(p: Perfil): string {
  if (!p.partidas && !p.xp) return "Bienvenido al taller. Tu primer pod te espera.";
  const r = progresoRango(p.xp);
  return `Hola, ${p.alias}. Rango ${r.actual}. ${r.siguiente ? `Te faltan ${r.m - r.n} XP para ${r.siguiente}.` : "Eres de lo mejor del taller."}${p.nivelDesbloqueado === 2 ? " Nivel 2 abierto." : ""}`;
}

/** PROVISIONAL: naves por número de pod (sprites del kit; se cambiarán por los propios). Rangos 1-4 abren las naves 1-4; la 5 pide todas las insignias. */
export const NAVES = [
  { nombre: "Cometa", condicion: "Rango Aprendiz (al empezar)" },
  { nombre: "Burbuja", condicion: "Llega a Técnico" },
  { nombre: "Aguijón", condicion: "Llega a Experto" },
  { nombre: "Yunque", condicion: "Llega a Maestro" },
  { nombre: "Raya", condicion: "Consigue todas las insignias" },
] as const;

/** Números de nave (1-5) abiertos: tantas como el índice del rango + 1; la 5 con todas las insignias del catálogo. */
export const navesDesbloqueadas = (p: Perfil): number[] => {
  const n = RANGOS.indexOf(rangoDe(p.xp)) + 1;
  return [...Array.from({ length: n }, (_, i) => i + 1), ...(INSIGNIAS.every((i) => p.insignias.includes(i.id)) ? [5] : [])];
};
export const mejorNave = (p: Perfil) => Math.max(...navesDesbloqueadas(p));

/** Resumen de Oleadas (lo añade main.ts): pods despachados, mejor racha de llamas, récord y diagnósticos premiados (falla encadenada). */
export interface ResumenOleada { pods: number; racha: number; record: number; nuevo: boolean; diag?: number }
export interface Eventos { oleada?: ResumenOleada; xp: number; insignias: Insignia[]; rango: string | null; habilidades: Cambio[]; naves: string[]; nivel2?: boolean }

export const perfilNuevo = (alias: string): Perfil => ({ alias, xp: 0, partidas: 0, ganadas: 0, pods: 0, limpios: 0, nivelDesbloqueado: 1, insignias: [], tutoriales: [], dominio: {}, records: {}, oleadas: {}, totales: {} });

/** Medalla del tiempo de un pod frente a tu mejor marca; la primera vez (sin marca) no hay medalla. */
export const medallaDe = (ms: number, mejor?: number): Medalla | null =>
  mejor === undefined ? null : (Object.keys(UMBRALES_MEDALLA) as Medalla[]).find((m) => ms <= mejor * UMBRALES_MEDALLA[m]) ?? null;

/** Registra el tiempo de un pod (si es la primera vez o mejora la marca) y devuelve la medalla frente a la marca anterior. */
export function registrarTiempo(perfil: Perfil, nivel: Nivel, pod: number, ms: number): { perfil: Perfil; medalla: Medalla | null } {
  const k = `${nivel}-${pod}`, mejor = perfil.records[k];
  return { perfil: mejor === undefined || ms < mejor ? { ...perfil, records: { ...perfil.records, [k]: ms } } : perfil, medalla: medallaDe(ms, mejor) };
}

/** Récord de Oleadas por nivel: guarda los pods de esta partida si superan la marca y dice si es récord. */
export function registrarOleada(perfil: Perfil, nivel: Nivel, pods: number) {
  const k = String(nivel), previo = perfil.oleadas[k] ?? 0, nuevo = pods > previo;
  return { perfil: nuevo ? { ...perfil, oleadas: { ...perfil.oleadas, [k]: pods } } : perfil, record: Math.max(pods, previo), nuevo };
}

/** Mejor tiempo total por nivel: guarda `ms` si es la primera marca o la mejora; `previo` es la marca anterior (undefined = primera). */
export function registrarTotal(perfil: Perfil, nivel: Nivel, ms: number) {
  const k = String(nivel), previo = perfil.totales[k];
  return { perfil: previo === undefined || ms < previo ? { ...perfil, totales: { ...perfil.totales, [k]: ms } } : perfil, previo };
}

/** Marca un mini-tutorial como completado: sin duplicar, y un id vacío no cuenta. No guarda: quien llama usa guardarPerfil. */
export function marcarTutorial(p: Perfil, id: string): Perfil {
  if (typeof id !== "string" || !id.trim() || p.tutoriales.includes(id)) return p;
  return { ...p, tutoriales: [...p.tutoriales, id] };
}
export const tutorialCompletado = (p: Perfil, id: string): boolean => p.tutoriales.includes(id);

export const rangoDe =(xp: number) => RANGOS.reduce((r, x) => (xp >= x.xp ? x : r), RANGOS[0]);

/** Progreso hacia el siguiente rango: n/m de XP (en el último rango, siguiente = null y n = m = 0). */
export function progresoRango(xp: number) {
  const actual = rangoDe(xp), siguiente = RANGOS[RANGOS.indexOf(actual) + 1] ?? null;
  return { actual: actual.nombre, siguiente: siguiente?.nombre ?? null, n: siguiente ? xp - actual.xp : 0, m: siguiente ? siguiente.xp - actual.xp : 0 };
}

/** Firma de un End de duelo: sala + motivo + puntajes (en práctica no se usa: no se reenvía). */
export const firmaEnd = (e: End, sala: string) => `${sala}|${e.reason}|${JSON.stringify(e.score)}|${JSON.stringify(e.carrera ?? null)}`;

export function aplicarPartida(perfil: Perfil, r: Resultado, firma?: string): { perfil: Perfil; eventos: Eventos } {
  const p: Perfil = {
    ...perfil, xp: perfil.xp + r.puntos, partidas: perfil.partidas + 1, ganadas: perfil.ganadas + Number(r.gano),
    pods: perfil.pods + r.pods, limpios: perfil.limpios + r.limpios,
    nivelDesbloqueado: perfil.nivelDesbloqueado === 2 || completoNivel1(r) ? 2 : 1,
    ultimoEnd: firma ?? perfil.ultimoEnd, dominio: unir(perfil.dominio, r.dominio ?? {}),
  };
  const nuevas = INSIGNIAS.filter((i) => !perfil.insignias.includes(i.id) && i.cumple(p, r));
  p.insignias = [...perfil.insignias, ...nuevas.map((i) => i.id)];
  const antes = rangoDe(perfil.xp).nombre, ahora = rangoDe(p.xp).nombre;
  const antesN = navesDesbloqueadas(perfil), naves = navesDesbloqueadas(p).filter((n) => !antesN.includes(n)).map((n) => NAVES[n - 1]!.nombre);
  return { perfil: p, eventos: { xp: r.puntos, insignias: nuevas, rango: ahora !== antes ? ahora : null, habilidades: cambios(perfil.dominio, p.dominio), naves, nivel2: p.nivelDesbloqueado > perfil.nivelDesbloqueado } };
}

/**
 * Resultado de la partida que acaba de terminar al pasar de `prev` a `next`, o null. Cuenta el duelo
 * (End "fin") y la práctica que termina con sus 5 pods; una práctica abandonada con «salir» no cuenta.
 * El tutorial no suma (lo decide quien llama).
 */
export function resultadoDe(prev: Pantalla, next: Pantalla): Resultado | null {
  const e = next.end;
  if (!e || e === prev.end || e.phase !== "fin" || terminada(prev)) return null;
  const est = prev.station ?? next.station ?? (e.score.A ? "A" : "B"), s = e.score[est];
  if (!s) return null;
  const c = e.carrera?.[est];
  // gano: la práctica termina con winner "A" del árbitro y no es victoria
  return { puntos: puntosDe(s, c), pods: s.despachados, total: prev.oleadas ? Infinity : prev.total, quemadas: s.quemadas, limpios: c?.llamas ?? 0, gano: !prev.practica && e.winner === est, nivel: prev.nivel };
}

// --- Almacenamiento: localStorage dentro de try/catch; si falla, solo memoria de la página ---
export interface Almacen { getItem(k: string): string | null; setItem(k: string, v: string): void }
const memoria = new Map<string, string>();
const disco = (): Almacen | null => { try { return localStorage; } catch { return null; } };
const clave = (alias: string) => `circuitsync.perfil.${alias.trim().toLowerCase()}`;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

const limpiarDominio = (d: unknown): Dominio =>
  Object.fromEntries(Object.entries(d && typeof d === "object" ? d : {}).map(([k, v]) => [k, { aciertos: num((v as Conteo)?.aciertos), fallos: num((v as Conteo)?.fallos) }]));

export function cargarPerfil(alias: string, almacen: Almacen | null = disco()): Perfil {
  let raw: string | null | undefined = memoria.get(clave(alias)); // lo último guardado en esta página gana si el disco falló (cuota)
  if (raw == null) { try { raw = almacen?.getItem(clave(alias)); } catch { /* sin disco */ } }
  try {
    const o = JSON.parse(raw ?? "{}") as Partial<Perfil>;
    return {
      alias: alias.trim(), xp: num(o.xp), partidas: num(o.partidas), ganadas: num(o.ganadas), pods: num(o.pods), limpios: num(o.limpios),
      nivelDesbloqueado: o.nivelDesbloqueado === 2 ? 2 : 1, insignias: Array.isArray(o.insignias) ? o.insignias.filter((x) => typeof x === "string") : [],
      tutoriales: Array.isArray(o.tutoriales) ? Array.from(new Set(o.tutoriales.filter((x): x is string => typeof x === "string" && x.trim() !== ""))) : [],
      dominio: limpiarDominio(o.dominio),
      records: Object.fromEntries(Object.entries(o.records && typeof o.records === "object" ? o.records : {}).filter(([, v]) => num(v) > 0) as [string, number][]),
      oleadas: Object.fromEntries(Object.entries(o.oleadas && typeof o.oleadas === "object" ? o.oleadas : {}).filter(([, v]) => num(v) > 0) as [string, number][]),
      totales: Object.fromEntries(Object.entries(o.totales && typeof o.totales === "object" ? o.totales : {}).filter(([, v]) => num(v) > 0) as [string, number][]),
      ultimoEnd: typeof o.ultimoEnd === "string" ? o.ultimoEnd : undefined,
    };
  } catch { return perfilNuevo(alias.trim()); }
}

/** Último alias usado en este dispositivo: el menú lo rellena (sin cuentas; solo localStorage, o memoria si falla). */
export function ultimoAlias(almacen: Almacen | null = disco()): string {
  try { return memoria.get("circuitsync.alias") ?? almacen?.getItem("circuitsync.alias") ?? ""; } catch { return memoria.get("circuitsync.alias") ?? ""; }
}
export function recordarAlias(alias: string, almacen: Almacen | null = disco()): void {
  memoria.set("circuitsync.alias", alias.trim());
  try { almacen?.setItem("circuitsync.alias", alias.trim()); } catch { /* sin disco */ }
}

export function guardarPerfil(p: Perfil, almacen: Almacen | null = disco()): void {
  const json = JSON.stringify(p);
  memoria.set(clave(p.alias), json);
  try { almacen?.setItem(clave(p.alias), json); } catch { /* cuota o modo privado: queda en memoria */ }
}
