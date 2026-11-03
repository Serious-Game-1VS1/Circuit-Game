/**
 * Nivel 3 «Experto»: código de colores de las resistencias y marcado de los fusibles. Lógica pura, sin Phaser (prueba en test/colores.test.ts).
 * La tabla de colores se enseña en el tutorial y en Aprender > Tabla de colores; durante la partida no se muestra ningún valor.
 */
export interface Color { nombre: string; hex: number; /** Cifra (0-9) cuando es banda de cifra; undefined en oro/plata. */ cifra?: number }

/** Orden = cifra: negro 0 … blanco 9; oro (×0,1, ±5 %) y plata (×0,01, ±10 %) solo como multiplicador o tolerancia. */
export const COLORES: readonly Color[] = [
  { nombre: "negro", hex: 0x1a1a1f, cifra: 0 }, { nombre: "marrón", hex: 0x8a5a2b, cifra: 1 }, { nombre: "rojo", hex: 0xe0402c, cifra: 2 },
  { nombre: "naranja", hex: 0xf08a24, cifra: 3 }, { nombre: "amarillo", hex: 0xf2d03a, cifra: 4 }, { nombre: "verde", hex: 0x3cb04c, cifra: 5 },
  { nombre: "azul", hex: 0x3e6af0, cifra: 6 }, { nombre: "violeta", hex: 0x8a4fd0, cifra: 7 }, { nombre: "gris", hex: 0x8a94a6, cifra: 8 },
  { nombre: "blanco", hex: 0xf4f4f4, cifra: 9 },
];
export const ORO: Color = { nombre: "oro", hex: 0xd9a21b };
const porNombre = new Map([...COLORES, ORO].map((c) => [c.nombre, c]));
export const colorDe = (nombre: string): Color => porNombre.get(nombre)!;

/** Las 4 bandas (nombres) de una resistencia de `ohms` Ω (E12, 10 Ω a 99 MΩ): cifra, cifra, multiplicador y tolerancia oro (±5 %). */
export function bandas(ohms: number): string[] {
  const dec = Math.floor(Math.log10(ohms) + 1e-9), dos = Math.round(ohms / 10 ** (dec - 1)), mult = dec - 1;
  return [COLORES[Math.floor(dos / 10)]!.nombre, COLORES[dos % 10]!.nombre, COLORES[mult]!.nombre, ORO.nombre];
}
/** Lectura inversa de 4 bandas (la usan los tutoriales y los tests): null si alguna banda no corresponde. */
export function ohmiosDe(b: readonly string[]): number | null {
  const [a, c, m] = b.slice(0, 3).map((n) => COLORES.findIndex((x) => x.nombre === n));
  return a === undefined || c === undefined || m === undefined || a < 0 || c < 0 || m < 0 ? null : (a * 10 + c) * 10 ** m;
}
/** «1 kΩ», «2,2 kΩ», «470 Ω»: el valor para la tabla y los tutoriales (nunca en la gaveta de nivel 3). */
export const textoOhmios = (o: number) => (o >= 1e6 ? `${o / 1e6} MΩ` : o >= 1000 ? `${o / 1000} kΩ` : `${o} Ω`).replace(".", ",");

/** Fusibles de cuchilla de coche: el color dice los amperios. */
export const CUCHILLAS: Record<string, Color> = {
  "5": { nombre: "beige", hex: 0xd8b890 }, "7.5": { nombre: "marrón", hex: 0x8a5a2b }, "10": { nombre: "rojo", hex: 0xe0402c }, "15": { nombre: "azul claro", hex: 0x6cc4f0 },
  "20": { nombre: "amarillo", hex: 0xf2d03a }, "25": { nombre: "blanco", hex: 0xf4f4f4 }, "30": { nombre: "verde", hex: 0x3cb04c },
};
export interface InfoFusible { tipo: "vidrio" | "cuchilla"; amperios: number; /** Vidrio: 6,3x32 (true) o 5x20 (false). */ grande: boolean; /** Vidrio: F (rápido) o T (lento). */ letra: "F" | "T" | null; color: Color | null; /** Marcado impreso en el vidrio («T2», «F0,5»); vacío en la cuchilla (solo color). */ marca: string }
/** Qué se ve de un fusible del nivel 3 (id «forma:amperios»); null si el id no es de nivel 3. */
export function infoFusible(id: string): InfoFusible | null {
  const m = /^(5x20|6x32|car)([FT])?:(\d+(?:\.\d+)?)$/.exec(id);
  if (!m) return null;
  const amperios = Number(m[3]), vidrio = m[1] !== "car", letra = vidrio ? (m[2] as "F" | "T") : null;
  return { tipo: vidrio ? "vidrio" : "cuchilla", amperios, grande: m[1] === "6x32", letra, color: vidrio ? null : CUCHILLAS[m[3]!] ?? null, marca: vidrio ? `${letra}${m[3]!.replace(".", ",")}` : "" };
}
