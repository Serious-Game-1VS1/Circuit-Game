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
 * `dial` = zona del dial (poco / correcto / demasiado) de la pieza puesta en el circuito; solo en tensión, y ausente si la lectura no la distingue.
 */
export type Lectura = { pasa: boolean; ohmios?: number; dial?: Dial } | { tension: Tramo; fraccion: number; voltios: number; dial?: Dial };

/**
 * ÚNICA regla del color del multímetro (verde = correcto, ámbar = poco, rojo = demasiado), solo en TENSIÓN (la continuidad se mide con la pieza fuera y no la lleva) y en cualquier
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

/** Texto del rechazo del árbitro y del aviso del cliente: la continuidad se mide sin tensión, con la pieza fuera del circuito. */
export const QUITA_PIEZA = "Quita la pieza para medir continuidad.";
// Sin hueco de gaveta que vaciar: la placa de cables (luces, interruptor) y la protoboard (placa3) siguen midiéndose con el montaje puesto.
export const SIN_HUECO: readonly string[] = ["luces", "interruptor", "placa3"];

/**
 * ¿La continuidad pedida mide una pieza que sigue puesta (y por tanto no da lectura)? Solo depende de lo que manda el cliente: no revela nada.
 * Cadena: el repuesto puesto en el hueco medido; el resto de huecos son las piezas originales de una línea sin batería (ya aisladas).
 * Demás familias con gaveta: hay que declarar `fuera` (pieza quitada del hueco; `pieza` = la quitada o «ninguna»).
 */
export function piezaPuesta(z: ZonaCircuito, pieza: string, modo: ModoMedir, punto: string, fuera: boolean): boolean {
  if (modo !== "continuidad" || SIN_HUECO.includes(z.circuito)) return false;
  return z.circuito === "cadena" ? pieza !== "ninguna" && punto === `t${pieza[0]}` : !fuera;
}

/** Hueco de la gaveta vacío: el circuito sin la pieza elegida (en invertido y abierto, tal como viene de fábrica: LED girado y cable cortado). */
function sinPieza(z: ZonaCircuito): Montaje {
  const abre = (m: Montaje): Montaje => ({ ...m, parts: m.parts.map((p, i): Part => (i === 1 ? { kind: "resistor", a: p.a, b: p.b, ohms: 1e9 } : p)) });
  switch (z.circuito) {
    case "invertido": return montar(z, "inversa");
    case "abierto": return montar(z, "dejar");
    case "combinar": return abre(montar(z, "una"));
    case "fusible":
    case "fusible3": return abre(montar(z, "0", calefactor(z).normal));
    default: return montar(z, "1000000000"); // led, cabina, protegido, divisor: resistencia abierta (1e9 Ω)
  }
}

/** La pieza suelta sobre la mesa (sin circuito): lo único que dice es si conduce y cuántos Ω tiene; nunca si es la correcta. */
function piezaSuelta(z: ZonaCircuito, pieza: string): Lectura | undefined {
  switch (z.circuito) {
    case "led": case "cabina": case "protegido": case "divisor": return { pasa: true, ohmios: Number(pieza) };
    case "combinar": return { pasa: true, ohmios: ({ una: 220, serie: 440, paralelo: 110 } as Record<string, number>)[pieza] };
    case "fusible": case "fusible3": return { pasa: true };
    default: return undefined; // invertido, abierto: la «pieza» es una acción, no un objeto
  }
}

/**
 * null si el punto no existe en ese circuito. Continuidad: el que llama ya comprobó `piezaPuesta`; sin tensión y con la pieza fuera, mide los
 * tramos que quedan (o la pieza suelta, punto «pieza»). Nunca lleva `dial`: no hay pieza puesta que juzgar.
 */
export function medir(z: ZonaCircuito, pieza: string, modo: ModoMedir, punto: string): Lectura | null {
  if (z.circuito === "placa3") return medirPlaca3(z, pieza, modo, punto); // entre dos agujeros de la placa
  const cadena = z.circuito === "cadena", hueco = modo === "continuidad" && !SIN_HUECO.includes(z.circuito) && !cadena;
  if (hueco && punto === "pieza" && pieza !== "ninguna") { const l = piezaSuelta(z, pieza); if (l) return l; }
  // supuesto: el Reactor se mide con el calefactor en consumo normal: el fusible de 0,5 A ya cortó (lee «toda») y el de 1 A o 3 A no, así que se distinguen.
  const m = hueco ? sinPieza(z) : montar(z, pieza, z.circuito === "fusible" || z.circuito === "fusible3" ? calefactor(z).normal : undefined);
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
    const ohmios = (objetivo.kind === "resistor" || objetivo.kind === "heater") && objetivo.ohms < 1e6 ? { ohmios: objetivo.ohms } : {}; // los 1e9 Ω del corte se leen «abierto»; calefactor: su consumo normal, para I = V/R
    return { pasa: !r.short && Math.abs(r.parts.at(-1)!.amps) > PASA_A, ...ohmios };
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
