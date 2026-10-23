/**
 * Multímetro del taller (solo árbitro): mide el circuito que armó el jugador con su pieza o montaje.
 * Devuelve solo lo que mostraría un multímetro real (continuidad o tensión aproximada), nunca el
 * veredicto, la corriente ni cuál opción es la correcta. Medir no es «Probar»: no penaliza.
 */
import { solve, type Part } from "./circuit.js";
import { montar } from "./pods.js";
import type { Circuito, ModoMedir, Tramo } from "../protocol.js";

export type Lectura = { pasa: boolean } | { tension: Tramo; fraccion: number };

// Probador de continuidad: 3 V con 1 kΩ en serie (≤ 3 mA: no funde fusibles y enciende un LED en directa).
const PROBADOR_V = 3, PROBADOR_OHMS = 1000, PASA_A = 1e-6;

/** null si el punto no existe en ese circuito. */
export function medir(z: { circuito: Circuito; volts: number }, pieza: string, modo: ModoMedir, punto: string): Lectura | null {
  // supuesto: en el Reactor se mide el pod tal como llega, con el calefactor en falla.
  const m = montar(z, pieza);
  const i = m.puntos[punto];
  if (i === undefined) return null;
  const objetivo = m.parts[i]!;

  if (modo === "continuidad") {
    // Batería desconectada: se quita y se pone el probador entre los bornes de la pieza.
    const n = Math.max(...m.parts.flatMap((p) => [p.a, p.b])) + 1;
    const partes: Part[] = [
      ...m.parts.slice(1),
      { kind: "battery", a: objetivo.a, b: n, volts: PROBADOR_V },
      { kind: "resistor", a: n, b: objetivo.b, ohms: PROBADOR_OHMS },
    ];
    const r = solve(partes);
    return { pasa: !r.short && Math.abs(r.parts.at(-1)!.amps) > PASA_A };
  }

  const r = solve(m.parts);
  if (r.short) return { tension: "nada", fraccion: 0 }; // la batería se hunde: no queda tensión en ningún tramo
  const fr = Math.min(1, Math.abs(r.nodes[objetivo.a]! - r.nodes[objetivo.b]!) / z.volts);
  const sinCorriente = Math.abs(r.parts[0]!.amps) < 1e-4;
  // Mismos tramos que el prototipo v3: «toda» solo con el camino cortado (toda la batería en el hueco).
  const tension: Tramo = fr < 0.05 ? "nada" : fr > 0.6 && sinCorriente ? "toda" : "parte";
  return { tension, fraccion: Math.round(fr * 10) / 10 };
}
