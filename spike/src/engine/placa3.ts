/**
 * Nivel 3, «placa experta» (familia `placa3`). Biblioteca pura (árbitro, generador, bot y cliente).
 *
 * Protoboard real reducida: 4 filas; cada fila tiene una TIRA de 5 agujeros conectados a cada lado del canal central
 * (columnas 0-4 = izquierda «I», 5-9 = derecha «D»; el canal aísla los dos lados) y dos rieles largos: + a la izquierda y − a la derecha
 * (8 agujeros cada uno, k = 0..7, dos por fila). La batería está fija en los rieles.
 *
 * Una pieza ocupa dos agujeros en vertical: (f, c) y (f+1, c); sus dos patas quedan en tiras distintas. LED y diodo tienen polaridad:
 * el ánodo va arriba salvo que la pieza esté girada (`g`). Un cable une dos agujeros. Cada agujero admite una sola pata o punta de cable.
 *
 * La jugada viaja como texto: «id@f,c[^];…|h1>h2;…» (piezas | cables), p. ej. «R:470:1@0,0;L:rojo:1@1,1^|+0>0,4;2,4>-2».
 * El árbitro la decodifica (dato no fiable: se valida todo), arma el netlist con la conectividad de la placa, lo resuelve con circuit.ts
 * y comprueba el OBJETIVO del problema, no posiciones: vale cualquier montaje que lo cumpla.
 *
 * Modelo DC (supuestos documentados): todos los LED caen 2 V (circuit.ts), interruptor y pulsador cerrados = cable y abiertos = nada,
 * capacitor = circuito abierto (CC estacionaria), LED dañado si soporta > 5 V en inversa; para eso, solo al probar la batería invertida,
 * cada LED fuga 1 MΩ y cada diodo 100 MΩ (el diodo en serie se queda casi toda la tensión inversa).
 */
import { classify, solve, type Part, type SolveResult } from "./circuit.js";
import type { Verdict } from "../protocol.js";

export const FILAS = 4, COLUMNAS = 10, MITAD = 5, RIEL = 8;
export const LED_INVERSA_MAX = 5;
export type Hoyo = string;
export interface Puesta { id: string; f: number; c: number; g: boolean }
export interface Montaje3 { piezas: Puesta[]; cables: [Hoyo, Hoyo][] }

/** Catálogo: «tipo:valor:n». R = resistencia (Ω), L = LED (color), D = diodo, S = interruptor («int») o pulsador («pul»), C = capacitor. */
export const VALORES_R = [100, 150, 220, 330, 470, 560, 680, 1000, 1500, 2200] as const;
export const CATALOGO: readonly string[] = [
  ...VALORES_R.flatMap((v) => [1, 2].map((n) => `R:${v}:${n}`)),
  "L:rojo:1", "L:rojo:2", "L:verde:1", "L:amarillo:1", "D:1N4007:1", "S:int:1", "S:pul:1", "C:100uF:1",
];
export const tipoDe = (id: string) => id[0] as "R" | "L" | "D" | "S" | "C";
export const valorDe = (id: string) => id.split(":")[1]!;
export const polar = (id: string) => tipoDe(id) === "L" || tipoDe(id) === "D";

const RE_HOYO = /^(?:([0-3]),([0-9])|([+-])([0-7]))$/;
export const esHoyo = (h: unknown): h is Hoyo => typeof h === "string" && RE_HOYO.test(h);
/** Nodo eléctrico de un agujero: «+», «-» o la tira «fI» / «fD». */
export function nodoDe(h: Hoyo): string {
  const m = RE_HOYO.exec(h)!;
  return m[3] ? m[3] : `${m[1]}${Number(m[2]) < MITAD ? "I" : "D"}`;
}
/** Índice de nodo para el motor: − = 0 (tierra), + = 1, tiras 2..9. */
const indice = (n: string) => (n === "-" ? 0 : n === "+" ? 1 : 2 + Number(n[0]) * 2 + (n[1] === "D" ? 1 : 0));
export const patas = (p: Puesta): [Hoyo, Hoyo] => {
  const arriba = `${p.f},${p.c}`, abajo = `${p.f + 1},${p.c}`;
  return p.g ? [abajo, arriba] : [arriba, abajo];
};

export const codificar = (m: Montaje3) =>
  `${m.piezas.map((p) => `${p.id}@${p.f},${p.c}${p.g ? "^" : ""}`).join(";")}|${m.cables.map(([a, b]) => `${a}>${b}`).join(";")}`;

const RE_PIEZA = /^([RLDSC]:[\w.]+:\d)@([0-2]),([0-9])(\^?)$/;
const MAX_JUGADA = 2000, MAX_CABLES = 24;
/** Jugada del cliente → montaje; null si no es válida (formato, piezas fuera de la gaveta, repetidas, agujeros ocupados dos veces). */
export function decodificar(s: unknown, opciones: readonly string[]): Montaje3 | null {
  if (typeof s !== "string" || s.length > MAX_JUGADA) return null;
  const partes = s.split("|");
  if (partes.length !== 2) return null;
  const piezas: Puesta[] = [], cables: [Hoyo, Hoyo][] = [], usados = new Set<string>();
  const ocupar = (h: Hoyo) => !usados.has(h) && !!usados.add(h);
  for (const t of partes[0] ? partes[0].split(";") : []) {
    const m = RE_PIEZA.exec(t);
    if (!m || !opciones.includes(m[1]!) || piezas.some((p) => p.id === m[1])) return null;
    const p = { id: m[1]!, f: Number(m[2]), c: Number(m[3]), g: m[4] === "^" };
    if (!patas(p).every(ocupar)) return null;
    piezas.push(p);
  }
  for (const t of partes[1] ? partes[1].split(";") : []) {
    const [a, b, ...resto] = t.split(">");
    if (resto.length || !esHoyo(a) || !esHoyo(b) || a === b || !ocupar(a) || !ocupar(b) || cables.length >= MAX_CABLES) return null;
    cables.push([a, b]);
  }
  return { piezas, cables };
}

interface Red { parts: Part[]; leds: Map<string, number> }
/** Netlist del montaje. `abiertos`: interruptores abiertos; `inversa`: batería al revés con las fugas de LED y diodo. */
function red(m: Montaje3, volts: number, o: { abiertos?: boolean; inversa?: boolean } = {}): Red {
  const parts: Part[] = [o.inversa ? { kind: "battery", a: 0, b: 1, volts } : { kind: "battery", a: 1, b: 0, volts }];
  const leds = new Map<string, number>();
  for (const p of m.piezas) {
    const [a, b] = patas(p).map((h) => indice(nodoDe(h))) as [number, number], t = tipoDe(p.id);
    if (t === "R") parts.push({ kind: "resistor", a, b, ohms: Number(valorDe(p.id)) });
    else if (t === "L" || t === "D") {
      if (t === "L") leds.set(p.id, parts.length);
      parts.push({ kind: t === "L" ? "led" : "diode", a, b });
      if (o.inversa) parts.push({ kind: "resistor", a, b, ohms: t === "L" ? 1e6 : 1e8 });
    } else if (t === "S" && !o.abiertos) parts.push({ kind: "wire", a, b });
    // C: abierto en CC; S abierto: nada
  }
  for (const [x, y] of m.cables) parts.push({ kind: "wire", a: indice(nodoDe(x)), b: indice(nodoDe(y)) });
  return { parts, leds };
}

/** Objetivo eléctrico de un problema (lo arma `objetivoDe`; no viaja: se deduce del enunciado y de la gaveta). */
export interface Objetivo {
  /** LED que deben encender bien (10-20 mA) con los interruptores cerrados. */
  leds: string[];
  /** Con los interruptores abiertos estos LED se apagan (< 1 mA) y los demás de `leds` siguen bien. */
  apaga?: string[];
  /** Los LED de `leds` en serie (quitar uno apaga al otro). */
  serie?: boolean;
  /** Cada LED de `leds` con su propia rama: quitar uno no cambia la corriente de los demás más de un 10 %. */
  independientes?: boolean;
  /** Con la batería invertida ningún LED soporta más de 5 V en inversa. */
  inversa?: boolean;
}

const RANGO: Verdict[] = ["correcto", "poco", "mal", "demasiado", "se quema", "corto"];
const ma = (r: SolveResult & { short: false }, i: number) => Math.abs(r.parts[i]!.amps) * 1000;

/** Veredicto del montaje contra el objetivo: corto > se quema > demasiado > mal (conectado) > poco > correcto. Sin decir qué conexión falla. */
export function evaluarMontaje(m: Montaje3, volts: number, obj: Objetivo): Verdict {
  let peor: Verdict = "correcto";
  const subir = (v: Verdict) => { if (RANGO.indexOf(v) > RANGO.indexOf(peor)) peor = v; };
  const quemados = (n: Red, r: SolveResult & { short: false }) => {
    for (const i of n.leds.values()) { const l = r.parts[i]!.label; if (l === "se quema" || l === "demasiado") subir(l); }
  };
  const base = red(m, volts), r = solve(base.parts);
  if (r.short) return "corto";
  quemados(base, r);
  const idx = obj.leds.map((id) => base.leds.get(id));
  for (const i of idx) {
    if (i === undefined || ma(r, i) < 0.5) subir("mal");
    else if (ma(r, i) < 10) subir("poco");
  }
  const todos = idx.every((i) => i !== undefined) ? (idx as number[]) : null;
  if (obj.apaga) {
    const ab = red(m, volts, { abiertos: true }), ra = solve(ab.parts);
    if (ra.short) return "corto";
    quemados(ab, ra);
    for (const id of obj.leds) {
      const i = ab.leds.get(id);
      if (i === undefined) continue;
      if (obj.apaga.includes(id) ? ma(ra, i) >= 1 : ra.parts[i]!.label !== "correcto") subir("mal");
    }
  }
  if (obj.serie && todos && classify(base.parts, todos) !== "serie") subir("mal");
  if (obj.independientes && todos) {
    for (const i of todos) {
      const sin = solve(base.parts.filter((_, k) => k !== i));
      if (sin.short) return "corto";
      for (const j of todos) if (j !== i && Math.abs(ma(sin, j > i ? j - 1 : j) - ma(r, j)) > 0.1 * ma(r, j)) subir("mal");
    }
  }
  if (obj.inversa) {
    const inv = red(m, volts, { inversa: true }), ri = solve(inv.parts);
    if (ri.short) return "corto";
    for (const i of inv.leds.values()) {
      const p = inv.parts[i]!;
      if (ri.parts[i]!.label === "se quema") subir("se quema");
      if (ri.nodes[p.b]! - ri.nodes[p.a]! > LED_INVERSA_MAX) subir("mal");
    }
  }
  return peor;
}

// ---------------------------------------------------------------- Problemas-plantilla

export type Plantilla = "led" | "interruptor" | "dosR" | "serie2" | "paralelo2" | "protegido" | "soloRojo";
/** Enunciados (lo único del problema que viaja, junto a batería y piezas). Orden = dificultad creciente. */
export const ENUNCIADOS: Record<Plantilla, string> = {
  led: "Enciende el LED sin quemarlo",
  interruptor: "Enciende el LED con el interruptor",
  dosR: "Con dos resistencias, enciende el LED",
  serie2: "Dos LED en serie, con una resistencia",
  paralelo2: "Dos LED en paralelo, cada uno con su resistencia",
  protegido: "Protege el LED de la polaridad invertida",
  soloRojo: "El interruptor debe apagar solo el LED rojo",
};
export const PLANTILLAS = Object.keys(ENUNCIADOS) as Plantilla[];
export const plantillaDe = (enunciado: string | undefined): Plantilla | undefined =>
  PLANTILLAS.find((p) => ENUNCIADOS[p] === enunciado);

/** Objetivo a partir de la plantilla y de la gaveta (los LED que trae): lo mismo que entiende un jugador al leer el enunciado. */
export function objetivoDe(p: Plantilla, opciones: readonly string[]): Objetivo {
  const leds = opciones.filter((o) => tipoDe(o) === "L");
  switch (p) {
    case "led": case "dosR": return { leds };
    case "interruptor": return { leds, apaga: leds };
    case "serie2": return { leds, serie: true };
    case "paralelo2": return { leds, independientes: true };
    case "protegido": return { leds, inversa: true };
    case "soloRojo": return { leds, apaga: leds.filter((o) => valorDe(o) === "rojo") };
  }
}

// Montajes de referencia: cadena de piezas en serie en una mitad (pieza k en la columna k, filas k y k+1), del riel + a la tira de arriba y de la de abajo al −.
type Elem = string | [string, string]; // pieza o dos en paralelo (mismas tiras)
/** Rama en serie desde + hasta −, en la mitad izquierda (lado 0) o derecha (1). `g`: ids que van girados. */
export function rama(elems: Elem[], lado: 0 | 1, g: string[] = []): Montaje3 {
  const piezas: Puesta[] = [];
  let col = lado ? MITAD : 0;
  elems.forEach((e, f) => { for (const id of typeof e === "string" ? [e] : e) piezas.push({ id, f, c: col++, g: g.includes(id) }); });
  const borne = lado ? COLUMNAS - 1 : MITAD - 1;
  return { piezas, cables: [[`+${lado}`, `0,${borne}`], [`${elems.length},${borne}`, `-${2 * elems.length + lado}`]] };
}
export const unir = (...ms: Montaje3[]): Montaje3 => ({ piezas: ms.flatMap((m) => m.piezas), cables: ms.flatMap((m) => m.cables) });

export interface Problema {
  plantilla: Plantilla; volts: number; opciones: string[];
  /** Montaje de referencia (codificado): cumple el objetivo con la batería ±5 %. Nunca viaja. */
  solucion: string;
  /** Montajes trampa (codificados): nunca cumplen el objetivo, con ningún margen. Solo para validar el sorteo. */
  trampas: string[];
}

type Rnd = () => number;
const pick = <T>(rnd: Rnd, xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
function shuffle<T>(rnd: Rnd, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}
export const MARGEN = [1, 0.95, 1.05] as const;
const sirve = (m: Montaje3, v: number, obj: Objetivo) => MARGEN.every((f) => evaluarMontaje(m, v * f, obj) === "correcto");
const nunca = (m: Montaje3, v: number, obj: Objetivo) => MARGEN.every((f) => evaluarMontaje(m, v * f, obj) !== "correcto");

const R = (v: number, n = 1) => `R:${v}:${n}`;
const L1 = "L:rojo:1", L2 = "L:rojo:2", LV = "L:verde:1", D = "D:1N4007:1", C = "C:100uF:1";

/** Valores de R que sirven (todos los márgenes) y que nunca sirven en el montaje `armar(r)`. */
function partir(v: number, obj: Objetivo, armar: (r: number) => Montaje3) {
  const ok = VALORES_R.filter((r) => sirve(armar(r), v, obj)), no = VALORES_R.filter((r) => nunca(armar(r), v, obj));
  return { ok, no };
}

/** Sortea un problema de la plantilla: batería, piezas (con sobrantes y trampas), solución de referencia y trampas. null = este sorteo no sirve (se repite). */
function intentar(rnd: Rnd, p: Plantilla): Problema | null {
  const V = pick(rnd, p === "dosR" || p === "serie2" ? [9, 12] : p === "protegido" ? [6, 9, 12] : [5, 9, 12]);
  const sobra = (xs: string[]) => shuffle(rnd, xs).slice(0, 1 + Math.floor(rnd() * xs.length)); // 1..n sobrantes
  let opciones: string[], ref: Montaje3, trampas: Montaje3[];
  const obj = (ops: string[]) => objetivoDe(p, ops);
  switch (p) {
    case "led": {
      const o = obj([L1]), { ok, no } = partir(V, o, (r) => rama([R(r), L1], 0));
      if (!ok.length || no.length < 2) return null;
      const r = pick(rnd, ok), bajo = no.filter((x) => x < r), alto = no.filter((x) => x > r);
      if (!bajo.length || !alto.length) return null;
      const malas = [pick(rnd, bajo), pick(rnd, alto)];
      opciones = [R(r), ...malas.map((x) => R(x)), L1, ...sobra([C, "S:int:1"])];
      ref = rama([R(r), L1], 0);
      trampas = [...malas.map((x) => rama([R(x), L1], 0)), rama([R(r), L1], 0, [L1]), rama([C, L1], 0)];
      break;
    }
    case "interruptor": {
      const S = pick(rnd, ["S:int:1", "S:pul:1"]), o = obj([L1]), { ok, no } = partir(V, o, (r) => rama([S, R(r), L1], 0));
      if (!ok.length || !no.length) return null;
      const r = pick(rnd, ok), mala = pick(rnd, no);
      opciones = [S, R(r), R(mala), L1, ...sobra([C, D])];
      ref = rama([S, R(r), L1], 0);
      trampas = [
        rama([S, R(mala), L1], 0), rama([R(r), L1], 0), rama([C, R(r), L1], 0),
        { piezas: [...rama([R(r), L1], 0).piezas, { id: S, f: 1, c: 2, g: false }], cables: rama([R(r), L1], 0).cables }, // en paralelo con el LED
      ];
      break;
    }
    case "dosR": {
      const o = obj([L1]), solo = (r: number) => rama([R(r), L1], 0);
      const pares: { a: number; b: number; m: Montaje3 }[] = [];
      for (const a of VALORES_R) for (const b of VALORES_R) {
        if (b < a || !nunca(solo(a), V, o) || !nunca(solo(b), V, o)) continue;
        const na = a === b ? 2 : 1;
        for (const m of [rama([R(a), R(b, na), L1], 0), rama([[R(a), R(b, na)], L1], 0)]) if (sirve(m, V, o)) pares.push({ a, b, m });
      }
      if (!pares.length) return null;
      const par = pick(rnd, pares), ids = [R(par.a), R(par.b, par.a === par.b ? 2 : 1)];
      const extra = VALORES_R.filter((x) => x !== par.a && x !== par.b && nunca(solo(x), V, o));
      if (!extra.length) return null;
      const e = pick(rnd, extra);
      opciones = [...ids, R(e), L1, ...sobra([C, D])];
      ref = par.m;
      trampas = [par.a, par.b, e].map(solo);
      break;
    }
    case "serie2": {
      const o = obj([L1, L2]), { ok, no } = partir(V, o, (r) => rama([R(r), L1, L2], 0));
      if (!ok.length || !no.length) return null;
      const r = pick(rnd, ok), mala = pick(rnd, no);
      opciones = [R(r), R(mala), L1, L2, ...sobra([C, D, "S:int:1"])];
      ref = rama([R(r), L1, L2], 0);
      trampas = [rama([R(mala), L1, L2], 0), rama([R(r), [L1, L2]], 0), rama([R(r), L1, L2], 0, [L2])];
      break;
    }
    case "paralelo2": {
      const o = obj([L1, L2]), { ok, no } = partir(V, o, (r) => unir(rama([R(r), L1], 0), rama([R(r, 2), L2], 1)));
      if (!ok.length || !no.length) return null;
      const r = pick(rnd, ok), mala = pick(rnd, no.filter((x) => x !== r));
      opciones = [R(r), R(r, 2), R(mala), L1, L2, ...sobra([C, "S:int:1"])];
      ref = unir(rama([R(r), L1], 0), rama([R(r, 2), L2], 1));
      // trampas: una rama con la R mala, los dos LED compartiendo una R (no son independientes) y los dos en serie
      trampas = [unir(rama([R(mala), L1], 0), rama([R(r, 2), L2], 1)), rama([R(r), [L1, L2]], 0), rama([R(r), L1, L2], 0)];
      break;
    }
    case "protegido": {
      const o = obj([L1]), { ok, no } = partir(V, o, (r) => rama([R(r), D, L1], 0));
      if (!ok.length || !no.length) return null;
      const r = pick(rnd, ok), mala = pick(rnd, no);
      opciones = [R(r), R(mala), D, L1, ...sobra([C, "S:int:1"])];
      ref = rama([R(r), D, L1], 0);
      trampas = [rama([R(mala), D, L1], 0), rama([R(r), L1], 0), rama([R(r), D, L1], 0, [D]), rama([R(r), C, L1], 0)];
      break;
    }
    case "soloRojo": {
      const S = "S:int:1", o = obj([L1, LV]);
      const armar = (r: number) => unir(rama([S, R(r), L1], 0), rama([R(r, 2), LV], 1));
      const { ok, no } = partir(V, o, armar);
      if (!ok.length || !no.length) return null;
      const r = pick(rnd, ok), mala = pick(rnd, no.filter((x) => x !== r));
      opciones = [S, R(r), R(r, 2), R(mala), L1, LV, ...sobra([C, D])];
      ref = armar(r);
      // interruptor común a las dos ramas: tras S, un cable lleva la tira de abajo de S a la rama verde
      const comun: Montaje3 = { piezas: [...rama([S, R(r), L1], 0).piezas, { id: R(r, 2), f: 0, c: 5, g: false }, { id: LV, f: 1, c: 6, g: false }],
        cables: [["+0", "0,4"], ["1,4", "0,9"], ["3,4", "-6"], ["2,9", "-5"]] };
      trampas = [comun, unir(rama([R(r), L1], 0), rama([S, R(r, 2), LV], 1)), unir(rama([S, R(mala), L1], 0), rama([R(r, 2), LV], 1)), unir(rama([C, R(r), L1], 0), rama([R(r, 2), LV], 1))];
      break;
    }
  }
  opciones = shuffle(rnd, opciones);
  trampas = trampas.filter((t) => t.piezas.every((x) => opciones.includes(x.id))); // la trampa del capacitor solo si salió de sobrante
  const objetivo = obj(opciones);
  if (!sirve(ref, V, objetivo) || !trampas.every((t) => nunca(t, V, objetivo))) return null;
  return { plantilla: p, volts: V, opciones, solucion: codificar(ref), trampas: trampas.map(codificar) };
}

export function sortearProblema(rnd: Rnd, p: Plantilla = pick(rnd, PLANTILLAS)): Problema {
  for (let i = 0; i < 200; i++) { const x = intentar(rnd, p); if (x) return x; }
  throw new Error(`sin problema válido para placa3/${p}`);
}

/** null si el problema es válido: piezas del catálogo y sin repetir, la referencia cumple con ±5 % y ninguna trampa cumple con ningún margen. */
export function validarProblema(z: { volts: number; opciones: readonly string[]; solucion: string; trampas?: readonly string[]; plantilla?: string }): string | null {
  const p = z.plantilla as Plantilla | undefined;
  if (!p || !(p in ENUNCIADOS)) return "plantilla desconocida";
  if (new Set(z.opciones).size !== z.opciones.length || !z.opciones.every((o) => CATALOGO.includes(o))) return "piezas repetidas o fuera de catálogo";
  const obj = objetivoDe(p, z.opciones), ref = decodificar(z.solucion, z.opciones);
  if (!ref || !sirve(ref, z.volts, obj)) return `placa3/${p} ${z.volts} V: la referencia no cumple`;
  for (const t of z.trampas ?? []) {
    const m = decodificar(t, z.opciones);
    if (!m || !nunca(m, z.volts, obj)) return `placa3/${p} ${z.volts} V: una trampa valida (${t})`;
  }
  return null;
}

/** Veredicto de una jugada (lo que hace el árbitro con TestMsg.pieza). Jugada no decodificable = «mal». */
export function evaluarPlaca3(z: { volts: number; plantilla?: string; opciones?: readonly string[] }, jugada: string): Verdict {
  const p = z.plantilla as Plantilla | undefined, m = decodificar(jugada, z.opciones ?? []);
  return !p || !m ? "mal" : evaluarMontaje(m, z.volts, objetivoDe(p, z.opciones ?? []));
}

/**
 * Montajes que prueba el bot (cliente/src/contraBot.ts), solo con lo visible: entiende la FORMA que pide el enunciado (como un estudiante que
 * lee el problema) y busca con el solver qué piezas de la gaveta poner en cada papel; añade las variantes de forma típicas de un error
 * (pieza girada, interruptor en paralelo, sin diodo, una R común…). Son pocas decenas o cientos de combinaciones.
 */
export function candidatosPlaca3(p: Plantilla | undefined, opciones: readonly string[]): Montaje3[] {
  const de = (t: string) => opciones.filter((o) => tipoDe(o) === t), Rs = de("R"), Ls = de("L"), Ss = [...de("S"), ...de("C")], Ds = [...de("D"), ...de("C")];
  const out: Montaje3[] = [], L = Ls[0];
  if (!L) return out;
  const pares = Rs.flatMap((a, i) => Rs.slice(i + 1).map((b) => [a, b] as const));
  switch (p) {
    case "led": for (const r of [...Rs, ...de("C")]) out.push(rama([r, L], 0), rama([r, L], 0, [L])); break;
    case "interruptor": for (const r of Rs) { out.push(rama([r, L], 0)); for (const s of Ss) out.push(rama([s, r, L], 0), { piezas: [...rama([r, L], 0).piezas, { id: s, f: 1, c: 2, g: false }], cables: rama([r, L], 0).cables }); } break;
    case "dosR": for (const r of Rs) out.push(rama([r, L], 0)); for (const [a, b] of pares) out.push(rama([a, b, L], 0), rama([[a, b], L], 0)); break;
    case "serie2": if (Ls[1]) for (const r of Rs) out.push(rama([r, L, Ls[1]], 0), rama([r, [L, Ls[1]]], 0)); break;
    case "paralelo2": if (Ls[1]) { for (const r of Rs) out.push(rama([r, [L, Ls[1]]], 0)); for (const [a, b] of pares) out.push(unir(rama([a, L], 0), rama([b, Ls[1]], 1))); } break;
    case "protegido": for (const r of Rs) { out.push(rama([r, L], 0)); for (const d of Ds) out.push(rama([r, d, L], 0), rama([r, d, L], 0, [d])); } break;
    case "soloRojo": {
      const rojo = Ls.find((o) => valorDe(o) === "rojo"), otro = Ls.find((o) => o !== rojo);
      if (rojo && otro) for (const s of Ss) for (const [a, b] of [...pares, ...pares.map(([x, y]) => [y, x] as const)]) out.push(unir(rama([s, a, rojo], 0), rama([b, otro], 1)), unir(rama([a, rojo], 0), rama([s, b, otro], 1)));
      break;
    }
  }
  return out;
}

/** Probador de continuidad: 3 V con 1 kΩ en serie (igual que medir.ts). */
const PROBADOR_V = 3, PROBADOR_OHMS = 1000, PASA_A = 1e-6;
export type LecturaPlaca = { pasa: boolean; dial?: "poco" | "correcto" | "demasiado" } | { tension: "nada" | "parte" | "toda"; fraccion: number; voltios: number; dial?: "poco" | "correcto" | "demasiado" };
/**
 * Multímetro entre dos agujeros («h1~h2», rojo y negro) con los interruptores cerrados. `dial` = el del veredicto (correcto / poco / demasiado,
 * corto y quemado = demasiado) cuando el circuito cumple la forma del problema; «mal conectado» = sin dial (gris). null = punto no válido.
 */
export function medirPlaca3(z: { volts: number; plantilla?: string; opciones?: readonly string[] }, jugada: string, modo: "continuidad" | "tension", punto: string): LecturaPlaca | null {
  const m = decodificar(jugada, z.opciones ?? []), [ha, hb, ...resto] = punto.split("~");
  if (!m || resto.length || !esHoyo(ha) || !esHoyo(hb)) return null;
  const v = evaluarPlaca3(z, jugada), dial = v === "mal" ? undefined : v === "correcto" || v === "poco" ? v : "demasiado";
  const n = red(m, z.volts), a = indice(nodoDe(ha)), b = indice(nodoDe(hb));
  if (modo === "continuidad") {
    const extra = 1 + Math.max(...n.parts.flatMap((p) => [p.a, p.b]), 9);
    const r = solve([...n.parts.slice(1), { kind: "battery", a, b: extra, volts: PROBADOR_V }, { kind: "resistor", a: extra, b, ohms: PROBADOR_OHMS }]);
    return { pasa: !r.short && Math.abs(r.parts.at(-1)!.amps) > PASA_A, ...(dial && { dial }) };
  }
  const r = solve(n.parts);
  if (r.short) return { tension: "nada", fraccion: 0, voltios: 0, dial: "demasiado" };
  // una tira sin nada conectado no entra en la matriz: flota a 0 V
  const volt = Math.abs((r.nodes[a] ?? 0) - (r.nodes[b] ?? 0)), fr = Math.min(1, volt / z.volts), sin = Math.abs(r.parts[0]!.amps) < 1e-4;
  return { tension: fr < 0.05 ? "nada" : fr > 0.6 && sin ? "toda" : "parte", fraccion: Math.round(fr * 10) / 10, voltios: Math.round(Math.min(volt, z.volts) * 100) / 100, ...(dial && { dial }) };
}
