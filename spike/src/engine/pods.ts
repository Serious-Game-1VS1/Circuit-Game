/**
 * Circuitos de las zonas del taller (solo del lado del árbitro: aquí se decide qué es correcto).
 * Cada familia de falla (`Circuito`) arma su circuito con la pieza elegida y lo resuelve con el motor.
 * Cifras del anteproyecto (Figura 8 y Anexo 5); el voltaje lo elige el generador (generador.ts).
 */
import { MOTOR_OHMS, R_INTERNA, classify, solve, type Label, type Part } from "./circuit.js";
import type { Circuito, Verdict } from "../protocol.js";

// supuesto: calefactor del Reactor de 12,4 Ω (0,698 A a 9 V) que en falla baja a 3,1 Ω (2,50 A) y aguanta 1,5 A.
export const HEATER_OHMS = { normal: 12.4, falla: 3.1 } as const;
export const HEATER_MAX_A = 1.5;

/** Qué piezas puede ofrecer la gaveta de cada familia (id de pieza = lo que manda el cliente). */
export const PIEZAS: Record<Circuito, readonly string[]> = {
  led: ["100", "220", "470", "1000"],
  cabina: ["100", "220", "470", "1000"],
  // supuesto: el cableado libre de la placa se reduce a elegir entre tres montajes.
  luces: ["serie", "paralelo", "puente"],
  interruptor: ["serie", "paralelo"],
  // supuesto: tercer fusible de 0,5 A, que se funde con el consumo normal.
  fusible: ["0.5", "1", "3"],
  // nivel 2: LED montado al revés (se corrige girándolo) y camino cortado (se empalma).
  invertido: ["directa", "inversa"],
  abierto: ["empalmar", "dejar"],
  // nivel 2: LED con dos resistencias de 220 Ω (una = 220, serie = 440, paralelo = 110); divisor R1 → R2; R + diodo + LED.
  combinar: ["una", "serie", "paralelo"],
  divisor: ["100", "220", "470", "1000"],
  protegido: ["100", "220", "470", "1000"],
};

/** Zona tal como la ven montar/evaluar/medir; `r1` es la resistencia fija del divisor (Ω). */
export interface ZonaCircuito { circuito: Circuito; volts: number; r1?: number }
/** Divisor del Reactor: la tensión del nodo medio entra a un pin de Arduino (máx. 5 V). */
export const DIVISOR_V = { poco: 4, correcto: 5, quema: 5.5 } as const;

const RANK: Label[] = ["correcto", "poco", "demasiado", "se quema"];
const worst = (ls: Label[]) => ls.reduce((a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a));

/**
 * Circuito de una zona con la pieza `pieza` (la batería es siempre parts[0]). `puntos` nombra las
 * piezas que el multímetro puede medir: "pieza" (la elegida en la gaveta), "carga1" y "carga2".
 */
export interface Montaje { parts: Part[]; puntos: Record<string, number> }
export function montar(z: ZonaCircuito, pieza: string, calefactorOhms: number = HEATER_OHMS.falla): Montaje {
  const bat: Part = { kind: "battery", a: 1, b: 0, volts: z.volts };
  switch (z.circuito) {
    case "led":
    case "cabina": {
      // Radar (y luz testigo): R → LED. Cabina de nivel 1: R → dos LED en paralelo.
      const parts: Part[] = [bat, { kind: "resistor", a: 1, b: 2, ohms: Number(pieza) }, { kind: "led", a: 2, b: 0 }];
      if (z.circuito === "cabina") parts.push({ kind: "led", a: 2, b: 0 });
      return { parts, puntos: z.circuito === "cabina" ? { pieza: 1, carga1: 2, carga2: 3 } : { pieza: 1, carga1: 2 } };
    }
    case "combinar": { // LED con dos resistencias de 220 Ω: una sola, en serie o en paralelo.
      const n = pieza === "serie" ? 3 : 2;
      const rs: Part[] = (pieza === "una" ? [[1, 2]] : pieza === "serie" ? [[1, 2], [2, 3]] : [[1, 2], [1, 2]]).map(([a, b]) => ({ kind: "resistor", a: a!, b: b!, ohms: 220 }));
      const parts: Part[] = [bat, ...rs, { kind: "led", a: n, b: 0 }];
      return { parts, puntos: { pieza: 1, carga1: parts.length - 1 } };
    }
    case "divisor": // batería → R1 (fija) → R2 (elegida) → masa; pieza = R2, carga1 = R1; el nodo medio es la tensión de R2.
      return { parts: [bat, { kind: "resistor", a: 1, b: 2, ohms: z.r1 ?? 470 }, { kind: "resistor", a: 2, b: 0, ohms: Number(pieza) }], puntos: { pieza: 2, carga1: 1 } };
    case "protegido": // R → diodo de protección → LED: cada pieza en serie se come su tensión.
      return { parts: [bat, { kind: "resistor", a: 1, b: 2, ohms: Number(pieza) }, { kind: "diode", a: 2, b: 3 }, { kind: "led", a: 3, b: 0 }], puntos: { pieza: 1, carga1: 3, carga2: 2 } };
    case "invertido": // R → LED; "inversa" = el LED con el ánodo a tierra (no conduce).
      return { parts: [bat, { kind: "resistor", a: 1, b: 2, ohms: 470 }, pieza === "inversa" ? { kind: "led", a: 0, b: 2 } : { kind: "led", a: 2, b: 0 }], puntos: { pieza: 1, carga1: 2 } };
    case "abierto": // R → hueco → LED; "empalmar" cierra el hueco con un cable, "dejar" lo deja (resistencia enorme).
      return {
        parts: [bat, pieza === "empalmar" ? { kind: "wire", a: 1, b: 2 } : { kind: "resistor", a: 1, b: 2, ohms: 1e9 }, { kind: "resistor", a: 2, b: 3, ohms: 470 }, { kind: "led", a: 3, b: 0 }],
        puntos: { pieza: 1, carga1: 3 },
      };
    case "luces": {
      const lamps: Part[] = pieza === "serie"
        ? [{ kind: "lamp", a: 1, b: 2 }, { kind: "lamp", a: 2, b: 0 }]
        : [{ kind: "lamp", a: 1, b: 0 }, { kind: "lamp", a: 1, b: 0 }];
      return { parts: [bat, ...lamps, ...(pieza === "puente" ? [{ kind: "wire", a: 1, b: 0 } as Part] : [])], puntos: { carga1: 1, carga2: 2 } };
    }
    case "interruptor":
      // Interruptor cerrado (= cable) en serie con el motor; en paralelo, al cerrarlo cortocircuita la batería.
      // carga1 = motor, carga2 = interruptor (columnas 1 y 2 de la placa del cliente).
      return pieza === "serie"
        ? { parts: [bat, { kind: "wire", a: 1, b: 2 }, { kind: "motor", a: 2, b: 0 }], puntos: { carga1: 2, carga2: 1 } }
        : { parts: [bat, { kind: "motor", a: 1, b: 0 }, { kind: "wire", a: 1, b: 0 }], puntos: { carga1: 1, carga2: 2 } };
    case "fusible":
      return {
        parts: [bat, { kind: "fuse", a: 1, b: 2, maxA: Number(pieza) }, { kind: "heater", a: 2, b: 0, ohms: calefactorOhms, maxA: HEATER_MAX_A }],
        puntos: { pieza: 1, carga1: 2 },
      };
  }
}

/** Veredicto de una zona con la pieza `pieza` y la batería `volts`. Sin cifras. */
export function evaluar(z: ZonaCircuito, pieza: string): Verdict {
  switch (z.circuito) {
    case "led":
    case "cabina": {
      const r = solve(montar(z, pieza).parts);
      return r.short ? "corto" : worst(r.parts.slice(2).map((p) => p.label!));
    }
    case "divisor": {
      const { parts, puntos } = montar(z, pieza);
      const r = solve(parts);
      if (r.short) return "corto";
      const v = r.parts[puntos.pieza!]!.volts;
      return v < DIVISOR_V.poco ? "poco" : v <= DIVISOR_V.correcto ? "correcto" : v <= DIVISOR_V.quema ? "demasiado" : "se quema";
    }
    case "invertido":
    case "abierto":
    case "combinar":
    case "protegido": {
      const r = solve(montar(z, pieza).parts);
      return r.short ? "corto" : r.parts.at(-1)!.label!;
    }
    case "luces": {
      // Meta: paralelo, para que si una luz se funde la otra siga encendida (RF-04: se quita cada carga por turno).
      const { parts } = montar(z, pieza);
      if (solve(parts).short) return "corto";
      return classify(parts, [1, 2]) === "paralelo" ? "correcto" : "poco";
    }
    case "interruptor": {
      const { parts, puntos } = montar(z, pieza);
      const r = solve(parts);
      if (r.short) return "corto";
      return Math.abs(r.parts[puntos.carga1!]!.amps) >= 0.9 * (z.volts / (MOTOR_OHMS + R_INTERNA)) ? "correcto" : "poco";
    }
    case "fusible": {
      const run = (ohms: number) => solve(montar(z, pieza, ohms).parts);
      const falla = run(HEATER_OHMS.falla);
      if (falla.short) return "corto";
      if (falla.parts[2]!.label === "se quema") return "se quema"; // fusible grueso: no corta la falla
      const normal = run(HEATER_OHMS.normal);
      if (normal.short) return "corto";
      return normal.parts[1]!.blown ? "poco" : "correcto"; // fusible fino: corta también el consumo normal
    }
  }
}
