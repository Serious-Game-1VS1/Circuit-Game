/**
 * Generador de pods (RF-06). Determinista: la misma (semilla, nivel) regenera los mismos 5 pods.
 * Ambos jugadores reciben la misma secuencia, así que el presupuesto de dificultad es igual para los dos.
 * Cada zona se valida con el motor al generarla; `validarPartida` repite la validación completa
 * (lo usa `npm run validar:sorteos`, 10 000 sorteos por nivel).
 */
import type { Circuito, Nivel, ZonaNombre } from "../protocol.js";
import { PIEZAS, evaluar } from "./pods.js";

export const ZONAS: readonly ZonaNombre[] = ["radar", "cabina", "turbina", "reactor"];
export const PODS_POR_PARTIDA = 5;
// supuesto: 18 V queda para el nivel 3; los niveles 1 y 2 sortean entre 3,7, 4,5 y 9 V.
export const VOLTS_SORTEO = [3.7, 4.5, 9] as const;
// supuesto: focos, motor y calefactor siempre a 9 V (son sus valores nominales).
const VOLTS_FIJO = 9;
/** Margen: la solución sigue siendo la única correcta con la batería ±5 %. */
const MARGEN = [1, 0.95, 1.05];

export interface ZonaPod { zona: number; nombre: ZonaNombre; circuito: Circuito; volts: number; opciones: string[]; solucion: string }
export interface Pod { numero: number; zonas: ZonaPod[] }

/**
 * Familia de falla por zona y nivel. supuesto (la Tabla 25 no está en el texto): una familia por zona;
 * nivel 1 = resistencia y LED en las 4 zonas (Cabina con 2 LED en paralelo); nivel 2 = Cabina con
 * focos en paralelo, Turbina con interruptor y motor y Reactor con fusible. Los pods 1 a 3 no piden
 * cables, así que en ellos Cabina y Turbina usan su familia de nivel 1.
 */
export function familia(zona: number, nivel: Nivel, cables: boolean): Circuito {
  const n1: Circuito[] = ["led", "cabina", "led", "led"];
  const n2: Circuito[] = ["led", cables ? "luces" : "cabina", cables ? "interruptor" : "led", "fusible"];
  return (nivel === 1 ? n1 : n2)[zona]!;
}

/** Familias que deben aparecer en toda partida del nivel (cobertura de conceptos). */
export const COBERTURA: Record<Nivel, Circuito[]> = {
  1: ["led", "cabina"],
  2: ["led", "luces", "interruptor", "fusible"],
};

// supuesto: presupuesto de dificultad = 1 por zona de resistencia y 2 por zona de cableado o fusible.
const DIFICULTAD: Record<Circuito, number> = { led: 1, cabina: 1, luces: 2, interruptor: 2, fusible: 2 };
export const presupuesto = (p: Pod) => p.zonas.reduce((s, z) => s + DIFICULTAD[z.circuito], 0);

/** PRNG mulberry32: 32 bits de estado, misma secuencia en Node y en el navegador. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rnd = () => number;
const pick = <T>(rnd: Rnd, xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
function shuffle<T>(rnd: Rnd, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const MAX_INTENTOS = 1000;

/**
 * Modos demo (para mostrar una sola mecánica; las reglas son las mismas):
 *  - "cableado" (`npm run serve -- --demo`): cada pod trae Cabina (2 focos, montaje "luces") y/o
 *    Turbina (motor + interruptor, montaje "interruptor"); el jugador arrastra las piezas a la placa
 *    y las une con cables. Pods 1 a 3: una zona; pods 4 y 5: una o dos. Batería de 9 V.
 *  - "radar" (`npm run serve -- --demo radar`): los 5 pods solo con Radar (LED + resistencia), con
 *    las 4 resistencias en la gaveta; solo varía la batería.
 * Apagado (false), todo sigue como antes.
 */
export type Demo = false | "cableado" | "radar";
// supuesto: el demo Radar usa 4,5 y 9 V (sin 3,7 V), como pidió el usuario.
export const VOLTS_DEMO = [4.5, 9] as const;
/** Zonas del demo de cableado: Cabina (1) y Turbina (2), con la familia de nivel 2 de cada una. */
const ZONAS_CABLEADO: Record<number, Circuito> = { 1: "luces", 2: "interruptor" };

/** Sortea una zona válida: voltaje, 3 de las 4 resistencias (o todo el cableado/fusibles) en orden aleatorio. En demo, las 4. */
function sortearZona(rnd: Rnd, zona: number, circuito: Circuito, demo = false): ZonaPod {
  const resistencias = circuito === "led" || circuito === "cabina";
  for (let i = 0; i < MAX_INTENTOS; i++) {
    const volts = resistencias ? pick(rnd, demo ? VOLTS_DEMO : VOLTS_SORTEO) : VOLTS_FIJO;
    const z = { circuito, volts };
    const solucion = PIEZAS[circuito].find((p) => evaluar(z, p) === "correcto");
    if (!solucion) continue;
    const distractores = shuffle(rnd, PIEZAS[circuito].filter((p) => p !== solucion)).slice(0, resistencias && !demo ? 2 : undefined);
    const cand: ZonaPod = { zona, nombre: ZONAS[zona]!, circuito, volts, opciones: shuffle(rnd, [solucion, ...distractores]), solucion };
    if (!validarZona(cand)) return cand;
  }
  throw new Error(`sin zona válida para ${circuito}`);
}

/** Los 5 pods de una partida. Pods 1 a 3: una zona sin cables; pods 4 y 5: de 1 a 4 zonas. Ver `Demo` para los modos demo. */
export function generar(semilla: number, nivel: Nivel, demo: Demo = false): Pod[] {
  const rnd = mulberry32(semilla);
  if (demo === "radar") return Array.from({ length: PODS_POR_PARTIDA }, (_, p) => ({ numero: p + 1, zonas: [sortearZona(rnd, 0, "led", true)] }));
  if (demo === "cableado") {
    for (let i = 0; i < MAX_INTENTOS; i++) {
      // Pods 1-3: Cabina o Turbina; pods 4-5: una o las dos.
      const zonasPorPod = [0, 1, 2, 3, 4].map((p) => shuffle(rnd, [1, 2]).slice(0, p < 3 ? 1 : 1 + Math.floor(rnd() * 2)).sort((a, b) => a - b));
      // Las dos mecánicas deben salir en la partida (si no, se vuelve a sortear; sigue siendo determinista).
      if (![1, 2].every((z) => zonasPorPod.some((zs) => zs.includes(z)))) continue;
      return zonasPorPod.map((zs, p) => ({ numero: p + 1, zonas: zs.map((z) => sortearZona(rnd, z, ZONAS_CABLEADO[z]!)) }));
    }
    throw new Error("sin partida demo con Cabina y Turbina");
  }
  for (let i = 0; i < MAX_INTENTOS; i++) {
    const primeras = shuffle(rnd, [0, 1, 2, 3]).slice(0, 3);
    const zonasPorPod = [
      ...primeras.map((z) => [z]),
      ...[0, 1].map(() => shuffle(rnd, [0, 1, 2, 3]).slice(0, 1 + Math.floor(rnd() * 4)).sort((a, b) => a - b)),
    ];
    const familias = zonasPorPod.flatMap((zs, p) => zs.map((z) => familia(z, nivel, p >= 3)));
    if (!COBERTURA[nivel].every((f) => familias.includes(f))) continue; // se vuelve a sortear; sigue siendo determinista
    return zonasPorPod.map((zs, p) => ({
      numero: p + 1,
      zonas: zs.map((z) => sortearZona(rnd, z, familia(z, nivel, p >= 3))),
    }));
  }
  throw new Error("sin partida con cobertura completa");
}

/** null si la zona es válida; si no, el motivo. */
export function validarZona(z: ZonaPod): string | null {
  if (z.opciones.length < 2 || new Set(z.opciones).size !== z.opciones.length) return "opciones repetidas o insuficientes";
  if (!z.opciones.every((p) => PIEZAS[z.circuito].includes(p))) return "pieza fuera de catálogo";
  for (const f of MARGEN) {
    const correctas = z.opciones.filter((p) => evaluar({ circuito: z.circuito, volts: z.volts * f }, p) === "correcto");
    if (correctas.length !== 1 || correctas[0] !== z.solucion) {
      return `${f === 1 ? "solución no única" : "sin margen"}: ${z.circuito} ${z.volts} V [${z.opciones}] → [${correctas}]`;
    }
  }
  return null;
}

/** null si la partida cumple estructura, unicidad, márgenes, cobertura y presupuesto; si no, el motivo. */
export function validarPartida(pods: Pod[], nivel: Nivel, demo: Demo = false): string | null {
  if (pods.length !== PODS_POR_PARTIDA) return "no son 5 pods";
  if (demo === "cableado") {
    for (const [i, p] of pods.entries()) {
      const zs = p.zonas.map((z) => z.zona);
      if (p.numero !== i + 1) return `demo, pod ${i + 1}: número ${p.numero}`;
      if (i < 3 ? zs.length !== 1 : zs.length < 1 || zs.length > 2) return `demo, pod ${i + 1}: ${zs.length} zonas`;
      if (new Set(zs).size !== zs.length) return `demo, pod ${i + 1}: zonas repetidas`;
      for (const z of p.zonas) {
        if (ZONAS_CABLEADO[z.zona] !== z.circuito || z.nombre !== ZONAS[z.zona]) return `demo, pod ${i + 1}: no es Cabina/Turbina con cableado`;
        if (z.volts !== VOLTS_FIJO || z.opciones.length !== PIEZAS[z.circuito].length) return `demo, pod ${i + 1}: batería u opciones`;
        const e = validarZona(z);
        if (e) return `demo, pod ${i + 1}: ${e}`;
      }
    }
    const familias = pods.flatMap((p) => p.zonas.map((z) => z.circuito));
    return familias.includes("luces") && familias.includes("interruptor") ? null : "demo: falta Cabina o Turbina";
  }
  if (demo === "radar") {
    for (const [i, p] of pods.entries()) {
      const z = p.zonas[0];
      if (p.numero !== i + 1 || p.zonas.length !== 1 || !z || z.zona !== 0 || z.nombre !== "radar" || z.circuito !== "led") return `demo, pod ${i + 1}: no es solo Radar con LED`;
      if (!VOLTS_DEMO.includes(z.volts as 4.5 | 9) || z.opciones.length !== PIEZAS.led.length) return `demo, pod ${i + 1}: batería u opciones`;
      const e = validarZona(z);
      if (e) return `demo, pod ${i + 1}: ${e}`;
    }
    return null;
  }
  for (const [i, p] of pods.entries()) {
    const zs = p.zonas.map((z) => z.zona);
    if (p.numero !== i + 1) return `pod ${i + 1}: número ${p.numero}`;
    if (i < 3 ? zs.length !== 1 : zs.length < 1 || zs.length > 4) return `pod ${p.numero}: ${zs.length} zonas`;
    if (new Set(zs).size !== zs.length || zs.some((z) => !ZONAS[z])) return `pod ${p.numero}: zonas inválidas`;
    if (presupuesto(p) > (i < 3 ? 2 : 7)) return `pod ${p.numero}: presupuesto ${presupuesto(p)}`;
    for (const z of p.zonas) {
      if (z.circuito !== familia(z.zona, nivel, i >= 3) || z.nombre !== ZONAS[z.zona]) return `pod ${p.numero}: familia ${z.circuito}`;
      const e = validarZona(z);
      if (e) return `pod ${p.numero}: ${e}`;
    }
  }
  const familias = pods.flatMap((p) => p.zonas.map((z) => z.circuito));
  const falta = COBERTURA[nivel].find((f) => !familias.includes(f));
  return falta ? `falta la familia ${falta}` : null;
}
