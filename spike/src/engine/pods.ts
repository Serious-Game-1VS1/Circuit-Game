/**
 * Circuitos de ejemplo del taller (solo del lado del árbitro: aquí se decide qué es correcto).
 * No es el banco de 38 circuitos ni el generador de sorteos; son los dos retos del anteproyecto.
 */
import { RESISTOR_OHMS, solve, type Label, type Part } from "./circuit.js";
import type { Circuito, Verdict } from "../protocol.js";

/** Reto 1: 9 V → R → LED rojo. Cabina: 9 V → R → dos LED en paralelo (la corriente se reparte). */
export function build(c: Circuito, ohms: number): Part[] {
  const parts: Part[] = [
    { kind: "battery", a: 1, b: 0, volts: 9 },
    { kind: "resistor", a: 1, b: 2, ohms },
    { kind: "led", a: 2, b: 0 },
  ];
  if (c === "cabina") parts.push({ kind: "led", a: 2, b: 0 });
  return parts;
}

const LEDS: Record<Circuito, number[]> = { led: [2], cabina: [2, 3] };
const RANK: Label[] = ["correcto", "poco", "demasiado", "se quema"];

/** Veredicto de la zona: el peor LED manda. Sin cifras. */
export function verdict(c: Circuito, ohms: number): Verdict {
  const r = solve(build(c, ohms));
  if (r.short) return "corto";
  return LEDS[c].map((i) => r.parts[i]!.label!).reduce((a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a));
}

// supuesto: los 5 pods repiten las mismas dos zonas dañadas (0 = LED, 1 = cabina); el sorteo justo queda fuera.
export const POD_ZONES: readonly { zona: number; circuito: Circuito }[] = [
  { zona: 0, circuito: "led" },
  { zona: 1, circuito: "cabina" },
];

/** Respuesta correcta (para bots de simulación y pruebas; nunca se envía a un cliente). */
export const answer = (c: Circuito) => RESISTOR_OHMS.find((o) => verdict(c, o) === "correcto")!;
