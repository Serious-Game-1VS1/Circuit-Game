/**
 * Multímetro del taller (solo árbitro): mide el circuito que armó el jugador con su pieza o montaje.
 * Devuelve solo lo que mostraría un multímetro real (continuidad o tensión aproximada), nunca el
 * veredicto, la corriente ni cuál opción es la correcta. Medir no es «Probar»: no penaliza.
 */
import { MOTOR_OHMS, R_INTERNA, solve, type Part, type SolveResult } from "./circuit.js";
import { DIVISOR_V, calefactor, montar, type Montaje, type ZonaCircuito } from "./pods.js";
import type { Dial, ModoMedir, Tramo } from "../protocol.js";
import { medirPlaca3 } from "./placa3.js";

/**
 * `voltios`/`ohmios` son aditivos: lo que mostraría el aparato (V entre los bornes, Ω de una resistencia); nunca el veredicto.
 * `dial` = zona del dial (poco / correcto / demasiado) de la pieza puesta en el circuito; ausente si la lectura no la distingue.
 */
export type Lectura = { pasa: boolean; ohmios?: number; dial?: Dial } | { tension: Tramo; fraccion: number; voltios: number; dial?: Dial };

/**
 * ÚNICA regla del color del multímetro (verde = correcto, ámbar = poco, rojo = demasiado), igual en tensión y continuidad y en cualquier
 * punto: el estado del circuito montado con la pieza puesta, medido con el criterio físico de cada familia (corriente del LED 10-20 mA, tensión
 * en la pieza, motor, luces). Se calcula sobre lo que hay puesto, nunca sobre la solución; la prueba spike/test/dial.test.ts lo compara con `evaluar`.
 * undefined = la medición física no distingue (fusible de 1 A y de 3 A leen igual con el consumo normal: solo la falla los separa).
 */
function dialDe(z: ZonaCircuito, m: Montaje, r: SolveResult): Dial | undefined {
  if (r.short) return "demasiado";
  switch (z.circuito) {
    case "fusible":
    case "fusible3": return r.parts[1]!.blown ? "poco" : undefined;
    case "luces": return [1, 2].every((i) => Math.abs(r.parts[i]!.volts) >= 0.9 * z.volts) ? "correcto" : "poco";
    case "interruptor": return Math.abs(r.parts[m.puntos.carga1!]!.amps) >= 0.9 * (z.volts / (MOTOR_OHMS + R_INTERNA)) ? "correcto" : "poco";
    case "divisor": { const v = r.parts[m.puntos.pieza!]!.volts; return v < DIVISOR_V.poco ? "poco" : v <= DIVISOR_V.correcto ? "correcto" : "demasiado"; }
    default: { // familias de LED: el peor LED manda; sin LED (cadena sin repuesto de LED) no hay luz
      const ls = m.parts.flatMap((p, i) => (p.kind === "led" ? [r.parts[i]!.label!] : []));
      return ls.some((l) => l === "demasiado" || l === "se quema") ? "demasiado" : ls.length && ls.every((l) => l === "correcto") ? "correcto" : "poco";
    }
  }
}

// Probador de continuidad: 3 V con 1 kΩ en serie (≤ 3 mA: no funde fusibles y enciende un LED en directa).
const PROBADOR_V = 3, PROBADOR_OHMS = 1000, PASA_A = 1e-6;

/** null si el punto no existe en ese circuito. */
export function medir(z: ZonaCircuito, pieza: string, modo: ModoMedir, punto: string): Lectura | null {
  if (z.circuito === "placa3") return medirPlaca3(z, pieza, modo, punto); // entre dos agujeros de la placa
  // supuesto: el Reactor se mide con el calefactor en consumo normal: el fusible de 0,5 A ya cortó (lee «toda») y el de 1 A o 3 A no, así que se distinguen.
  const m = montar(z, pieza, z.circuito === "fusible" || z.circuito === "fusible3" ? calefactor(z).normal : undefined);
  const i = Object.hasOwn(m.puntos, punto) ? m.puntos[punto] : undefined; // `punto` viene de la red: nada de `__proto__`/`constructor`
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
    // Cadena: una pieza original sana no juzga nada (solo «pasa»); la muerta sin cambiar es el circuito abierto.
    const k = z.circuito === "cadena" && pieza !== "ninguna" ? Number(pieza[0]) : 0, cad = z.circuito === "cadena" && i !== k;
    const dial = cad ? (i === z.muerta ? "poco" : undefined) : dialDe(z, m, solve(m.parts));
    const ohmios = objetivo.kind === "resistor" && objetivo.ohms < 1e6 ? { ohmios: objetivo.ohms } : {}; // los 1e9 Ω del corte se leen «abierto»
    return { pasa: !r.short && Math.abs(r.parts.at(-1)!.amps) > PASA_A, ...ohmios, ...(dial && { dial }) };
  }

  const r = solve(m.parts);
  if (r.short) return { tension: "nada", fraccion: 0, voltios: 0, dial: "demasiado" }; // la batería se hunde: no queda tensión en ningún tramo
  const v = Math.abs(r.nodes[objetivo.a]! - r.nodes[objetivo.b]!), fr = Math.min(1, v / z.volts);
  const sinCorriente = Math.abs(r.parts[0]!.amps) < 1e-4;
  // Mismos tramos que el prototipo v3: «toda» solo con el camino cortado (toda la batería en el hueco).
  const tension: Tramo = fr < 0.05 ? "nada" : fr > 0.6 && sinCorriente ? "toda" : "parte";
  const dial = dialDe(z, m, r);
  return { tension, fraccion: Math.round(fr * 10) / 10, voltios: Math.round(Math.min(v, z.volts) * 100) / 100, ...(dial && { dial }) };
}
