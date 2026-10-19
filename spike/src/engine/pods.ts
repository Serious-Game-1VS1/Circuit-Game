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
};

const RANK: Label[] = ["correcto", "poco", "demasiado", "se quema"];
const worst = (ls: Label[]) => ls.reduce((a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a));

/** Veredicto de una zona con la pieza `pieza` y la batería `volts`. Sin cifras. */
export function evaluar(z: { circuito: Circuito; volts: number }, pieza: string): Verdict {
  const bat: Part = { kind: "battery", a: 1, b: 0, volts: z.volts };
  switch (z.circuito) {
    case "led":
    case "cabina": {
      // Radar (y luz testigo): R → LED. Cabina de nivel 1: R → dos LED en paralelo.
      const parts: Part[] = [bat, { kind: "resistor", a: 1, b: 2, ohms: Number(pieza) }, { kind: "led", a: 2, b: 0 }];
      if (z.circuito === "cabina") parts.push({ kind: "led", a: 2, b: 0 });
      const r = solve(parts);
      return r.short ? "corto" : worst(r.parts.slice(2).map((p) => p.label!));
    }
    case "luces": {
      // Meta: paralelo, para que si una luz se funde la otra siga encendida (RF-04: se quita cada carga por turno).
      const lamps: Part[] = pieza === "serie"
        ? [{ kind: "lamp", a: 1, b: 2 }, { kind: "lamp", a: 2, b: 0 }]
        : [{ kind: "lamp", a: 1, b: 0 }, { kind: "lamp", a: 1, b: 0 }];
      const parts = [bat, ...lamps, ...(pieza === "puente" ? [{ kind: "wire", a: 1, b: 0 } as Part] : [])];
      if (solve(parts).short) return "corto";
      return classify(parts, [1, 2]) === "paralelo" ? "correcto" : "poco";
    }
    case "interruptor": {
      // Interruptor cerrado (= cable) en serie con el motor; en paralelo, al cerrarlo cortocircuita la batería.
      const parts: Part[] = pieza === "serie"
        ? [bat, { kind: "wire", a: 1, b: 2 }, { kind: "motor", a: 2, b: 0 }]
        : [bat, { kind: "motor", a: 1, b: 0 }, { kind: "wire", a: 1, b: 0 }];
      const r = solve(parts);
      if (r.short) return "corto";
      return Math.abs(r.parts[2]!.amps) >= 0.9 * (z.volts / (MOTOR_OHMS + R_INTERNA)) ? "correcto" : "poco";
    }
    case "fusible": {
      const run = (ohms: number) => solve([
        bat, { kind: "fuse", a: 1, b: 2, maxA: Number(pieza) }, { kind: "heater", a: 2, b: 0, ohms, maxA: HEATER_MAX_A },
      ]);
      const falla = run(HEATER_OHMS.falla);
      if (falla.short) return "corto";
      if (falla.parts[2]!.label === "se quema") return "se quema"; // fusible grueso: no corta la falla
      const normal = run(HEATER_OHMS.normal);
      if (normal.short) return "corto";
      return normal.parts[1]!.blown ? "poco" : "correcto"; // fusible fino: corta también el consumo normal
    }
  }
}
