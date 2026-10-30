/**
 * Multímetro del taller (solo árbitro): mide el circuito que armó el jugador con su pieza o montaje.
 * Devuelve solo lo que mostraría un multímetro real (continuidad o tensión aproximada), nunca el
 * veredicto, la corriente ni cuál opción es la correcta. Medir no es «Probar»: no penaliza.
 */
import { solve, type Part } from "./circuit.js";
import { HEATER_OHMS, montar, type ZonaCircuito } from "./pods.js";
import type { ModoMedir, Tramo } from "../protocol.js";

/** `voltios`/`ohmios` son aditivos: lo que mostraría el aparato (V entre los bornes, Ω de una resistencia); nunca el veredicto. */
export type Lectura = { pasa: boolean; ohmios?: number } | { tension: Tramo; fraccion: number; voltios: number };

// Probador de continuidad: 3 V con 1 kΩ en serie (≤ 3 mA: no funde fusibles y enciende un LED en directa).
const PROBADOR_V = 3, PROBADOR_OHMS = 1000, PASA_A = 1e-6;

/** null si el punto no existe en ese circuito. */
export function medir(z: ZonaCircuito, pieza: string, modo: ModoMedir, punto: string): Lectura | null {
  // supuesto: el Reactor se mide con el calefactor en consumo normal: el fusible de 0,5 A ya cortó (lee «toda») y el de 1 A o 3 A no, así que se distinguen.
  const m = montar(z, pieza, z.circuito === "fusible" ? HEATER_OHMS.normal : undefined);
  const i = m.puntos[punto];
  if (i === undefined) return null;
  const objetivo = m.parts[i]!;

  if (modo === "continuidad") {
    // Batería desconectada: se quita y se pone el probador entre los bornes de la pieza.
    const n = Math.max(...m.parts.flatMap((p) => [p.a, p.b])) + 1;
    // El probador entra por el borne que en el circuito real está más cerca del + de la batería: un LED girado bloquea y «no pasa».
    const base = solve(m.parts);
    const [alto, bajo] = base.short || base.nodes[objetivo.a]! >= base.nodes[objetivo.b]! ? [objetivo.a, objetivo.b] : [objetivo.b, objetivo.a];
    const partes: Part[] = [
      ...m.parts.slice(1),
      { kind: "battery", a: alto, b: n, volts: PROBADOR_V },
      { kind: "resistor", a: n, b: bajo, ohms: PROBADOR_OHMS },
    ];
    const r = solve(partes);
    const ohmios = objetivo.kind === "resistor" && objetivo.ohms < 1e6 ? { ohmios: objetivo.ohms } : {}; // los 1e9 Ω del corte se leen «abierto»
    return { pasa: !r.short && Math.abs(r.parts.at(-1)!.amps) > PASA_A, ...ohmios };
  }

  const r = solve(m.parts);
  if (r.short) return { tension: "nada", fraccion: 0, voltios: 0 }; // la batería se hunde: no queda tensión en ningún tramo
  const v = Math.abs(r.nodes[objetivo.a]! - r.nodes[objetivo.b]!), fr = Math.min(1, v / z.volts);
  const sinCorriente = Math.abs(r.parts[0]!.amps) < 1e-4;
  // Mismos tramos que el prototipo v3: «toda» solo con el camino cortado (toda la batería en el hueco).
  const tension: Tramo = fr < 0.05 ? "nada" : fr > 0.6 && sinCorriente ? "toda" : "parte";
  return { tension, fraccion: Math.round(fr * 10) / 10, voltios: Math.round(Math.min(v, z.volts) * 100) / 100 };
}
