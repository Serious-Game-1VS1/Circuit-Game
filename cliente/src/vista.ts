/**
 * Lógica de vista del pod de ejemplo (reto 1), sin Phaser: decide qué ve el
 * jugador a partir de solve(). Nunca expone cifras (amperios, voltios).
 */
import { solve, RESISTOR_OHMS, type Part, type SolveResult } from "../../spike/src/engine/circuit";
import type { Verdict } from "../../spike/src/protocol";

export type Aguja = "poco" | "correcto" | "demasiado";

export interface Vista {
  /** null = sin aguja (cortocircuito). */
  aguja: Aguja | null;
  quemado: boolean;
  cortocircuito: boolean;
  mensaje: string;
}

export const OPCIONES = RESISTOR_OHMS;

export const textoOpcion = (ohms: number) => `${ohms} Ω`;

const LED = 2; // índice del LED en retoLed()

/** Reto 1: batería 9 V → resistencia → LED rojo → batería. */
export function retoLed(ohms: number): Part[] {
  return [
    { kind: "battery", a: 1, b: 0, volts: 9 },
    { kind: "resistor", a: 1, b: 2, ohms },
    { kind: "led", a: 2, b: 0 },
  ];
}

export function vistaDe(r: SolveResult, led = LED): Vista {
  return vistaDeVeredicto(r.short ? "corto" : r.parts[led]?.label ?? "poco");
}

/** Lo que se muestra a partir del veredicto que manda el árbitro (SCRUM-90): el cliente no decide. */
export function vistaDeVeredicto(label: Verdict): Vista {
  if (label === "corto") return { aguja: null, quemado: false, cortocircuito: true, mensaje: "¡Cortocircuito!" };
  if (label === "se quema") return { aguja: "demasiado", quemado: true, cortocircuito: false, mensaje: "¡El LED se quemó!" };
  const mensaje = { poco: "Poco: el LED casi no brilla", correcto: "¡Correcto!", demasiado: "Demasiado: el LED sufre" }[label];
  return { aguja: label, quemado: false, cortocircuito: false, mensaje };
}

export const probar = (ohms: number): Vista => vistaDe(solve(retoLed(ohms)));
