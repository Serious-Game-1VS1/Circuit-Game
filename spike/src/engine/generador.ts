/**
 * Generador de pods (RF-06). Determinista: la misma (semilla, nivel) regenera los mismos 5 pods.
 * Ambos jugadores reciben la misma secuencia, así que el presupuesto de dificultad es igual para los dos.
 * Cada zona se valida con el motor al generarla; `validarPartida` repite la validación completa
 * (lo usa `npm run validar:sorteos`, 10 000 sorteos por nivel).
 */
import type { Circuito, Nivel, ZonaNombre } from "../protocol.js";
import { PIEZAS, evaluar, jugadas } from "./pods.js";

export const ZONAS: readonly ZonaNombre[] = ["radar", "cabina", "turbina", "reactor"];
export const PODS_POR_PARTIDA = 5;
// supuesto: 18 V queda para el nivel 3; los niveles 1 y 2 sortean entre 3,7, 4,5 y 9 V.
export const VOLTS_SORTEO = [3.7, 4.5, 9] as const;
// supuesto: focos, motor y calefactor siempre a 9 V (son sus valores nominales).
const VOLTS_FIJO = 9;
// supuesto: con diodo (2,7 V de caídas) 3,7 y 4,5 V no tienen solución única con margen ±5 % (el 100 Ω queda en 9,9 o 20,1 mA); 6 y 9 V sí.
const VOLTS_PROTEGIDO = [6, 9] as const;
const R1_DIVISOR = [220, 470, 1000] as const;
/** Margen: la solución sigue siendo la única correcta con la batería ±5 %. */
const MARGEN = [1, 0.95, 1.05];

export interface ZonaPod { zona: number; nombre: ZonaNombre; circuito: Circuito; volts: number; opciones: string[]; solucion: string; r1?: number;
  /** Cadena: piezas en serie ("cable", "led", "r220"), cuál (1..n) está muerta por dentro y por lo tanto la solución «hueco:repuesto». */
  cadena?: string[]; muerta?: number }
/** `encadenada` (solo Oleadas): segunda falla escondida en una de las zonas; sale al reparar la primera. */
export interface Pod { numero: number; zonas: ZonaPod[]; encadenada?: ZonaPod }

import FAMILIAS from "./familias.json";

/**
 * Familias de falla por zona y nivel, definidas en `familias.json` (la Tabla 25 no está en el texto; ver el supuesto allí).
 * Los pods 1 a 3 no piden cables, así que usan la columna `sinCables`.
 */
export function familias(zona: number, nivel: Nivel, cables: boolean): readonly Circuito[] {
  return FAMILIAS.zonas[nivel][cables ? "conCables" : "sinCables"][zona]! as Circuito[];
}

/** Familias que deben aparecer en toda partida del nivel (cobertura de conceptos). */
export const COBERTURA = FAMILIAS.cobertura as Record<Nivel, Circuito[]>;

// supuesto: presupuesto de dificultad = 1 por zona de resistencia, LED invertido o circuito abierto, y 2 por zona de cableado o fusible.
const DIFICULTAD = FAMILIAS.dificultad as Record<Circuito, number>;
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
/** Sortea la familia de una zona; con una sola no gasta el PRNG. */
const familiaDe = (rnd: Rnd, zona: number, nivel: Nivel, cables: boolean) => {
  const fs = familias(zona, nivel, cables);
  return fs.length > 1 ? pick(rnd, fs) : fs[0]!;
};

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

/**
 * Perfil de niveles de la partida: 1 o 2 (los 5 pods del mismo nivel) o "mixto" (el del duelo por defecto en `npm run serve`), con rampa:
 * pods 1-2 de nivel 1 en Radar/Reactor/Turbina (LED + resistencia), pod 3 de nivel 1 en Cabina (2 LED) y pods 4-5 de nivel 2
 * (cables/placa, interruptor, fusible, LED invertido, circuito abierto; 1-4 zonas, al menos 3 familias distintas entre los dos).
 * Ambos jugadores reciben los mismos pods, como siempre.
 */
export type Perfil = Nivel | "mixto";
/** Nivel del pod `i` (desde 0) según el perfil. */
export const nivelDePod = (perfil: Perfil, i: number): Nivel => (perfil !== "mixto" ? perfil : i >= 3 ? 2 : 1);
/** Familias que solo existen en el nivel 2; el perfil "mixto" pide al menos `MIN_N2` distintas en los pods 4 y 5. */
const SOLO_N2: readonly Circuito[] = ["luces", "interruptor", "fusible", "invertido", "abierto", "combinar", "divisor", "protegido", "cadena"];
const MIN_N2 = 3;
/** null si los circuitos por pod cumplen la cobertura del perfil; si no, el motivo. */
function faltaCobertura(perfil: Perfil, cs: Circuito[][]): string | null {
  const usadas = cs.flat();
  if (perfil !== "mixto") { const f = COBERTURA[perfil].find((x) => !usadas.includes(x)); return f ? `falta la familia ${f}` : null; }
  if (!cs.slice(0, 3).flat().includes("cabina")) return "falta la familia cabina";
  return new Set(cs.slice(3).flat().filter((c) => SOLO_N2.includes(c))).size < MIN_N2 ? "pods 4-5: pocas familias de nivel 2" : null;
}

/** Sortea una zona válida: voltaje, 3 de las 4 resistencias (o todo el cableado/fusibles) en orden aleatorio. En demo, las 4. `excluir`: solución que no puede repetirse (falla encadenada). */
function sortearZona(rnd: Rnd, zona: number, circuito: Circuito, demo = false, excluir?: string): ZonaPod {
  if (circuito === "cadena") return sortearCadena(rnd, zona);
  const resistencias = circuito === "led" || circuito === "cabina" || circuito === "divisor" || circuito === "protegido";
  const voltios: readonly number[] = circuito === "led" || circuito === "cabina" || circuito === "combinar" ? (demo ? VOLTS_DEMO : VOLTS_SORTEO) : circuito === "protegido" ? VOLTS_PROTEGIDO : [VOLTS_FIJO];
  for (let i = 0; i < MAX_INTENTOS; i++) {
    const volts = voltios.length > 1 ? pick(rnd, voltios) : voltios[0]!;
    const r1 = circuito === "divisor" ? pick(rnd, R1_DIVISOR) : undefined;
    const z = { circuito, volts, r1 };
    const solucion = PIEZAS[circuito].find((p) => evaluar(z, p) === "correcto");
    if (!solucion || solucion === excluir) continue;
    const distractores = shuffle(rnd, PIEZAS[circuito].filter((p) => p !== solucion)).slice(0, resistencias && !demo ? 2 : undefined);
    const cand: ZonaPod = { zona, nombre: ZONAS[zona]!, circuito, volts, opciones: shuffle(rnd, [solucion, ...distractores]), solucion, ...(r1 && { r1 }) };
    if (!validarZona(cand)) return cand;
  }
  throw new Error(`sin zona válida para ${circuito}`);
}

/**
 * Cadena de 3 o 4 piezas en serie (cable, LED, resistencia del valor justo para ese LED y, a veces, un segundo cable) con UNA muerta por dentro.
 * La solución es «hueco:repuesto» (el repuesto es la misma pieza que murió); la gaveta lleva 4 repuestos: ese y 3 distractores, con al menos
 * uno del mismo tipo pero equivocado (otro valor de R, o el LED girado). Se repite hasta que validarZona (±5 %) encuentre una sola jugada correcta.
 */
function sortearCadena(rnd: Rnd, zona: number): ZonaPod {
  for (let i = 0; i < MAX_INTENTOS; i++) {
    const volts = pick(rnd, VOLTS_SORTEO);
    const rOk = PIEZAS.led.find((r) => evaluar({ circuito: "led", volts }, r) === "correcto");
    if (!rOk) continue;
    const cadena = shuffle(rnd, ["cable", "led", `r${rOk}`, ...(rnd() < 0.5 ? ["cable"] : [])]);
    const muerta = 1 + Math.floor(rnd() * cadena.length), buena = cadena[muerta - 1]!;
    const otros = PIEZAS.cadena.filter((p) => p !== buena);
    const parecido = buena === "led" ? ["ledInv"] : buena.startsWith("r") ? otros.filter((p) => p.startsWith("r")) : [];
    const forzado = parecido.length ? [pick(rnd, parecido)] : [];
    const distractores = [...forzado, ...shuffle(rnd, otros.filter((p) => !forzado.includes(p)))].slice(0, 3);
    const cand: ZonaPod = { zona, nombre: ZONAS[zona]!, circuito: "cadena", volts, opciones: shuffle(rnd, [buena, ...distractores]), solucion: `${muerta}:${buena}`, cadena, muerta };
    if (!validarZona(cand)) return cand;
  }
  throw new Error("sin zona válida para cadena");
}

/** Los 5 pods de una partida. Pods 1 a 3: una zona sin cables; pods 4 y 5: de 1 a 4 zonas. Ver `Demo` para los modos demo. */
export function generar(semilla: number, nivel: Perfil, demo: Demo = false): Pod[] {
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
    // "mixto": pods 1-2 en zonas de LED (Radar, Turbina, Reactor) y pod 3 en Cabina; si no, 3 zonas distintas al azar.
    const primeras = nivel === "mixto" ? [...shuffle(rnd, [0, 2, 3]).slice(0, 2), 1] : shuffle(rnd, [0, 1, 2, 3]).slice(0, 3);
    const zonasPorPod = [
      ...primeras.map((z) => [z]),
      ...[0, 1].map(() => shuffle(rnd, [0, 1, 2, 3]).slice(0, 1 + Math.floor(rnd() * 4)).sort((a, b) => a - b)),
    ];
    const circuitos = zonasPorPod.map((zs, p) => zs.map((z) => familiaDe(rnd, z, nivelDePod(nivel, p), p >= 3)));
    if (faltaCobertura(nivel, circuitos)) continue; // se vuelve a sortear; sigue siendo determinista
    return zonasPorPod.map((zs, p) => ({
      numero: p + 1,
      zonas: zs.map((z, k) => sortearZona(rnd, z, circuitos[p]![k]!)),
    }));
  }
  throw new Error("sin partida con cobertura completa");
}

/**
 * Pod `numero` (desde 1) del modo Oleadas, determinista por (semilla, nivel, numero): cada 3 pods sube un escalón
 * (1 zona, 2, 3 y tope de 4). Cada zona se valida igual que en `generar`; no hay cobertura ni presupuesto de partida.
 */
export function generarOleada(semilla: number, nivel: Nivel, numero: number): Pod {
  const rnd = mulberry32(semilla + Math.imul(numero, 0x9e3779b1));
  const zonas = shuffle(rnd, [0, 1, 2, 3]).slice(0, Math.min(4, 1 + Math.floor((numero - 1) / 3))).sort((a, b) => a - b);
  const pod: Pod = { numero, zonas: zonas.map((z) => sortearZona(rnd, z, familiaDe(rnd, z, nivel, numero > 3))) };
  if (encadena(semilla, numero)) {
    // supuesto: solo las zonas de resistencia (Radar y Cabina simple) se encadenan: su solución cambia con la batería; el cableado y el fusible tienen una sola solución.
    const base = pod.zonas.filter((z) => z.circuito === "led" || z.circuito === "cabina");
    if (base.length) {
      const b = pick(rnd, base);
      pod.encadenada = sortearZona(rnd, b.zona, b.circuito, false, b.solucion);
    }
  }
  return pod;
}

/**
 * Rampa de la falla encadenada en Oleadas (una oleada = 3 pods): nada en las oleadas 1 y 2; desde la oleada 3, un pod de cada 3;
 * desde la oleada 5, uno de cada 2. Cuál pod de cada grupo lo decide la semilla. Único sitio donde se cambia.
 */
export const ENCADENADAS = [{ oleada: 5, cada: 2 }, { oleada: 3, cada: 3 }] as const;
export const oleadaDe = (numero: number) => Math.floor((numero - 1) / 3) + 1;
export function encadena(semilla: number, numero: number): boolean {
  const r = ENCADENADAS.find((e) => oleadaDe(numero) >= e.oleada);
  if (!r) return false;
  const i = numero - ((r.oleada - 1) * 3 + 1), grupo = Math.floor(i / r.cada);
  return i % r.cada === Math.floor(mulberry32((semilla ^ Math.imul(grupo + 1, 0x85ebca6b)) >>> 0)() * r.cada);
}

/** null si el pod de Oleadas es válido (sus zonas y, si trae, la falla encadenada); si no, el motivo. */
export function validarPodOleada(p: Pod, nivel: Nivel): string | null {
  for (const z of p.zonas) {
    if (!familias(z.zona, nivel, p.numero > 3).includes(z.circuito)) return `pod ${p.numero}: familia ${z.circuito}`;
    const e = validarZona(z);
    if (e) return `pod ${p.numero}: ${e}`;
  }
  const c = p.encadenada;
  if (!c) return null;
  const b = p.zonas.find((z) => z.zona === c.zona);
  if (!b || b.circuito !== c.circuito || (c.circuito !== "led" && c.circuito !== "cabina")) return `pod ${p.numero}: encadenada en zona o familia distinta`;
  if (c.solucion === b.solucion) return `pod ${p.numero}: encadenada con la misma solución`;
  const e = validarZona(c);
  return e && `pod ${p.numero}: encadenada, ${e}`;
}

/** null si la zona es válida; si no, el motivo. */
export function validarZona(z: ZonaPod): string | null {
  if (z.opciones.length < 2 || new Set(z.opciones).size !== z.opciones.length) return "opciones repetidas o insuficientes";
  if (!z.opciones.every((p) => PIEZAS[z.circuito].includes(p))) return "pieza fuera de catálogo";
  // Cadena: la jugada es «hueco:repuesto»; se prueban todas (y no poner nada) y debe quedar una sola correcta.
  const todas = z.circuito === "cadena" ? ["ninguna", ...jugadas(z)] : z.opciones;
  if (z.circuito === "cadena" && (!z.cadena || !z.muerta || z.solucion !== `${z.muerta}:${z.cadena[z.muerta - 1]}`)) return "cadena mal formada";
  for (const f of MARGEN) {
    const correctas = todas.filter((p) => evaluar({ ...z, volts: z.volts * f }, p) === "correcto");
    if (correctas.length !== 1 || correctas[0] !== z.solucion) {
      return `${f === 1 ? "solución no única" : "sin margen"}: ${z.circuito} ${z.volts} V [${z.opciones}] → [${correctas}]`;
    }
  }
  return null;
}

/** null si la partida cumple estructura, unicidad, márgenes, cobertura y presupuesto; si no, el motivo. */
export function validarPartida(pods: Pod[], nivel: Perfil, demo: Demo = false): string | null {
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
    const usadas = pods.flatMap((p) => p.zonas.map((z) => z.circuito));
    return usadas.includes("luces") && usadas.includes("interruptor") ? null : "demo: falta Cabina o Turbina";
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
      if (!familias(z.zona, nivelDePod(nivel, i), i >= 3).includes(z.circuito) || z.nombre !== ZONAS[z.zona]) return `pod ${p.numero}: familia ${z.circuito}`;
      const e = validarZona(z);
      if (e) return `pod ${p.numero}: ${e}`;
    }
  }
  if (nivel === "mixto" && (pods[2]!.zonas[0]!.zona !== 1 || pods[0]!.zonas[0]!.zona === 1 || pods[1]!.zonas[0]!.zona === 1)) return "pods 1-3: la rampa mixta es LED, LED, Cabina";
  return faltaCobertura(nivel, pods.map((p) => p.zonas.map((z) => z.circuito)));
}

/**
 * Valida `familias.json` con el motor: forma, familias conocidas, dificultad definida, cobertura dentro de lo sorteable
 * y que cada falla sea reproducible (el motor sortea una zona con solución única y margen ±5 %). Lanza con el motivo.
 */
export function validarFamilias(d: typeof FAMILIAS): void {
  const bad = (m: string): never => { throw new Error(`familias.json inválido: ${m}`); };
  const usadas = new Set<string>();
  for (const nivel of ["1", "2"] as const) {
    for (const col of ["sinCables", "conCables"] as const) {
      const zs = d.zonas?.[nivel]?.[col];
      if (!Array.isArray(zs) || zs.length !== ZONAS.length) bad(`zonas.${nivel}.${col} debe tener ${ZONAS.length} zonas`);
      zs.forEach((fs: string[], z: number) => {
        if (!Array.isArray(fs) || fs.length === 0) bad(`zonas.${nivel}.${col}[${z}] vacía`);
        for (const c of fs) {
          if (!(c in PIEZAS)) bad(`familia desconocida "${c}" en zonas.${nivel}.${col}[${z}]`);
          if (typeof d.dificultad?.[c as Circuito] !== "number") bad(`falta dificultad de "${c}"`);
          try { for (let s = 0; s < 5; s++) sortearZona(mulberry32(s), z, c as Circuito); } catch { bad(`el motor no reproduce la falla "${c}" (zona ${z})`); }
          usadas.add(c);
        }
      });
    }
    for (const c of d.cobertura?.[nivel] ?? bad(`falta cobertura.${nivel}`)) if (!usadas.has(c)) bad(`cobertura.${nivel}: "${c}" no está en ninguna zona`);
  }
}
validarFamilias(FAMILIAS);
