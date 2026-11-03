/**
 * Placa experta (nivel 3, familia «placa3»), sin Phaser (se prueba en test/placa3.test.ts). Geometría de la protoboard de 4 filas
 * (tiras de 5 agujeros a cada lado del canal y rieles + y −, ver spike/src/engine/placa3.ts), gavetas por tipo de pieza y edición
 * del montaje (poner, mover, girar y quitar piezas; tender y quitar cables). El cliente no decide si está bien: manda el montaje.
 *
 * Coordenadas locales del tablero (300 × 236): tiras de 114 × 55 px (≥ 44 px en pantalla a 360 × 640), agujeros cada 22 px.
 */
import { COLUMNAS, FILAS, MITAD, RIEL, esHoyo, nodoDe, patas, polar, tipoDe, valorDe, type Hoyo, type Montaje3, type Puesta } from "../../spike/src/engine/placa3";

export { codificar } from "../../spike/src/engine/placa3";
export type { Hoyo, Montaje3, Puesta } from "../../spike/src/engine/placa3";

export const ANCHO3 = 300, ALTO3 = 236, PASO = 55, Y0 = 8;
export const RIEL_MAS = 13, RIEL_MENOS = 287, CANAL = 150;
export const VACIO: Montaje3 = { piezas: [], cables: [] };

export const filaY = (f: number) => Y0 + PASO * f + PASO / 2;
export const colX = (c: number) => (c < MITAD ? 38 + 22 * c : 174 + 22 * (c - MITAD));
export interface P2 { x: number; y: number }
/** Centro de un agujero. Riel: dos agujeros por fila (k par arriba, impar abajo). */
export function coordHoyo(h: Hoyo): P2 {
  if (h[0] === "+" || h[0] === "-") { const k = Number(h.slice(1)); return { x: h[0] === "+" ? RIEL_MAS : RIEL_MENOS, y: filaY(Math.floor(k / 2)) + (k % 2 ? 13 : -13) }; }
  const [f, c] = h.split(",").map(Number) as [number, number];
  return { x: colX(c), y: filaY(f) };
}
export const TODOS: Hoyo[] = [
  ...Array.from({ length: FILAS }, (_, f) => Array.from({ length: COLUMNAS }, (_, c) => `${f},${c}`)).flat(),
  ...["+", "-"].flatMap((r) => Array.from({ length: RIEL }, (_, k) => `${r}${k}`)),
];

export const ocupados = (m: Montaje3) => new Set([...m.piezas.flatMap(patas), ...m.cables.flat()]);

/** Tira (o riel) bajo (x, y): sus agujeros. null fuera de la placa. */
export function tiraEn(x: number, y: number): Hoyo[] | null {
  if (y < Y0 - 6 || y > Y0 + PASO * FILAS + 6 || x < -8 || x > ANCHO3 + 8) return null;
  const f = Math.max(0, Math.min(FILAS - 1, Math.floor((y - Y0) / PASO)));
  if (x < 30) return Array.from({ length: RIEL }, (_, k) => `+${k}`);
  if (x > ANCHO3 - 30) return Array.from({ length: RIEL }, (_, k) => `-${k}`);
  if (Math.abs(x - CANAL) < 6) return null; // el canal no conecta
  const c0 = x < CANAL ? 0 : MITAD;
  return Array.from({ length: MITAD }, (_, i) => `${f},${c0 + i}`);
}
const cerca = (hs: Hoyo[], x: number, y: number) => [...hs].sort((a, b) => Math.hypot(coordHoyo(a).x - x, coordHoyo(a).y - y) - Math.hypot(coordHoyo(b).x - x, coordHoyo(b).y - y));
/** Agujero libre más cercano de la tira bajo (x, y) (para la punta de un cable); null si no hay tira o está llena. */
export function hoyoLibre(m: Montaje3, x: number, y: number): Hoyo | null {
  const t = tiraEn(x, y), us = ocupados(m);
  return t ? cerca(t.filter((h) => !us.has(h)), x, y)[0] ?? null : null;
}
/** Agujero más cercano (libre u ocupado) de la tira bajo (x, y): para medir. */
export const hoyoCerca = (x: number, y: number): Hoyo | null => { const t = tiraEn(x, y); return t ? cerca(t, x, y)[0]! : null; };
/** Nodo de un agujero, para decir «misma tira». */
export const mismaTira = (a: Hoyo, b: Hoyo) => nodoDe(a) === nodoDe(b);

/** Ranura (fila y columna de la pata de arriba) para una pieza cuyo centro se suelta en (x, y): la columna libre más cercana de esa mitad. */
export function ranuraPieza(m: Montaje3, id: string, x: number, y: number): { f: number; c: number } | null {
  if (y < Y0 - 10 || y > Y0 + PASO * FILAS + 10 || x < 26 || x > ANCHO3 - 26 || Math.abs(x - CANAL) < 6) return null;
  const f = Math.max(0, Math.min(FILAS - 2, Math.round((y - Y0) / PASO - 1)));
  const us = ocupados({ ...m, piezas: m.piezas.filter((p) => p.id !== id) }), c0 = x < CANAL ? 0 : MITAD;
  const libres = Array.from({ length: MITAD }, (_, i) => c0 + i).filter((c) => !us.has(`${f},${c}`) && !us.has(`${f + 1},${c}`));
  return libres.sort((a, b) => Math.abs(colX(a) - x) - Math.abs(colX(b) - x)).map((c) => ({ f, c }))[0] ?? null;
}
/** Pone (o mueve) la pieza en la ranura; conserva su giro si ya estaba. */
export const poner3 = (m: Montaje3, id: string, r: { f: number; c: number }): Montaje3 => {
  const g = m.piezas.find((p) => p.id === id)?.g ?? false;
  return { ...m, piezas: [...m.piezas.filter((p) => p.id !== id), { id, ...r, g }] };
};
export const quitar3 = (m: Montaje3, id: string): Montaje3 => ({ ...m, piezas: m.piezas.filter((p) => p.id !== id) });
export const girar3 = (m: Montaje3, id: string): Montaje3 => ({ ...m, piezas: m.piezas.map((p) => (p.id === id ? { ...p, g: !p.g } : p)) });
/** Cable nuevo; null si une un agujero consigo mismo o alguno está ocupado. */
export function ponerCable3(m: Montaje3, a: Hoyo, b: Hoyo): Montaje3 | null {
  const us = ocupados(m);
  return a === b || !esHoyo(a) || !esHoyo(b) || us.has(a) || us.has(b) ? null : { ...m, cables: [...m.cables, [a, b]] };
}
export const quitarCable3 = (m: Montaje3, i: number): Montaje3 => ({ ...m, cables: m.cables.filter((_, k) => k !== i) });

/** Pieza cuyo cuerpo (entre sus dos patas) está bajo (x, y). */
export const piezaEn3 = (m: Montaje3, x: number, y: number): Puesta | null =>
  m.piezas.find((p) => Math.abs(x - colX(p.c)) <= 12 && y >= filaY(p.f) + 6 && y <= filaY(p.f + 1) - 6) ?? null;

/** Ruta del cable: en L (primero horizontal, luego vertical); si sale de un riel, primero en vertical por el borde. */
export function ruta(a: Hoyo, b: Hoyo): P2[] {
  const A = coordHoyo(a), B = coordHoyo(b);
  return a[0] === "+" || a[0] === "-" ? [A, { x: A.x, y: B.y }, B] : [A, { x: B.x, y: A.y }, B];
}
const distSeg = (o: P2, p: P2, q: P2) => {
  const l2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2, t = l2 ? Math.max(0, Math.min(1, ((o.x - p.x) * (q.x - p.x) + (o.y - p.y) * (q.y - p.y)) / l2)) : 0;
  return Math.hypot(o.x - (p.x + t * (q.x - p.x)), o.y - (p.y + t * (q.y - p.y)));
};
/** Cable bajo (x, y) (a ≤ 14 px de su ruta y lejos de sus puntas); -1 si no hay. */
export function cableEn3(m: Montaje3, x: number, y: number): number {
  let mejor = -1, dMin = 14;
  m.cables.forEach(([a, b], i) => {
    const r = ruta(a, b), A = r[0]!, B = r.at(-1)!;
    if (Math.hypot(A.x - x, A.y - y) < 10 || Math.hypot(B.x - x, B.y - y) < 10) return;
    const d = Math.min(...r.slice(0, -1).map((p, k) => distSeg({ x, y }, p, r[k + 1]!)));
    if (d < dMin) { dMin = d; mejor = i; }
  });
  return mejor;
}
/** Color del cable: rojo si toca el +, azul si toca el −, verde entre tiras. */
export const colorCable3 = ([a, b]: [Hoyo, Hoyo]) => (a[0] === "+" || b[0] === "+" ? 0xe8363c : a[0] === "-" || b[0] === "-" ? 0x3e6af0 : 0x4cc764);

/** Gavetas (pestañas): cada pieza va a la de su tipo; «Medir» muestra el multímetro. */
export type Gaveta = "R" | "LD" | "S" | "C" | "cable" | "medir";
export const GAVETAS: { id: Gaveta; titulo: string }[] = [
  { id: "R", titulo: "Resist." }, { id: "LD", titulo: "LED/Diodo" }, { id: "S", titulo: "Interr." },
  { id: "C", titulo: "Otros" }, { id: "cable", titulo: "Cables" }, { id: "medir", titulo: "Medir" },
];
export const gavetaDe = (id: string): Gaveta => { const t = tipoDe(id); return t === "R" ? "R" : t === "L" || t === "D" ? "LD" : t === "S" ? "S" : "C"; };
/** Piezas de una gaveta que siguen en ella (las puestas en la placa no). */
export const enGaveta = (opciones: readonly string[], m: Montaje3, g: Gaveta) => opciones.filter((o) => gavetaDe(o) === g && !m.piezas.some((p) => p.id === o));
export const AYUDA_CABLES = "Arrastra de una tira a otra (o tócalas una y otra) para tender un cable. Toca un cable para quitarlo.";

/** Nombre de la pieza (sin el valor de las resistencias: en nivel 3 se leen por sus bandas). */
export function nombrePieza(id: string): string {
  const v = valorDe(id);
  switch (tipoDe(id)) {
    case "R": return "Resistencia";
    case "L": return `LED ${v}`;
    case "D": return "Diodo";
    case "S": return v === "pul" ? "Pulsador" : "Interruptor";
    case "C": return "Capacitor";
  }
}
export const COLOR_LED: Record<string, number> = { rojo: 0xff3b3b, verde: 0x3cdc5a, amarillo: 0xffd23f };
export { polar, tipoDe, valorDe };

/** Qué falta para poder validar (null = se puede pulsar CHECK). */
export const faltaPlaca3 = (m: Montaje3): string | null =>
  !m.piezas.length ? "Abre una gaveta y arrastra a la placa las piezas que pide el problema." : null;
