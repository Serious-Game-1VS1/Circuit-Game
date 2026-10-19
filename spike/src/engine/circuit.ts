/**
 * Motor DC de CircuitSync (RF-04). Biblioteca pura: sin red ni motor gráfico,
 * compartida por árbitro y cliente. Unidades SI (V, Ω, A).
 *
 * Método: análisis nodal modificado. Cada fuente real (batería con su 0,5 Ω,
 * LED encendido con su caída de 2 V) se estampa como equivalente de Norton, así
 * que la matriz solo tiene incógnitas de nodo y no se vuelve singular con
 * cables en paralelo. Nodo 0 = tierra.
 */

export const R_INTERNA = 0.5;
export const LED_VF = 2;
export const LAMP_OHMS = 90; // foco 9 V / 0,1 A
export const MOTOR_OHMS = 45;
export const BATTERY_VOLTS = [3.7, 4.5, 9, 18] as const;
export const RESISTOR_OHMS = [100, 220, 470, 1000] as const;

const G_ON = 1e6; // cable, fusible o LED encendido: 1 µΩ
const G_MIN = 1e-9; // fuga a tierra para que un nodo suelto no deje la matriz singular
const METER_OHMS = 1e7; // voltímetro

/** a = borne positivo (batería) o ánodo (LED). */
export type Part =
  | { kind: "battery"; a: number; b: number; volts: number }
  | { kind: "resistor"; a: number; b: number; ohms: number }
  | { kind: "lamp" | "motor" | "led" | "wire"; a: number; b: number }
  | { kind: "heater"; a: number; b: number; ohms: number; maxA: number }
  | { kind: "fuse"; a: number; b: number; maxA: number };

export type Label = "poco" | "correcto" | "demasiado" | "se quema";

export interface Reading {
  /** Corriente de a hacia b por la pieza; en la batería, la que entrega. */
  amps: number;
  /** Va − Vb. */
  volts: number;
  label?: Label;
  blown?: boolean;
}

/** Cortocircuito: solo el veredicto, sin cifras. */
export type SolveResult = { short: true } | { short: false; nodes: number[]; parts: Reading[] };

/** Etiqueta del LED rojo (20 mA nominal). */
export function ledLabel(amps: number): Label {
  const ma = amps * 1000;
  if (ma < 10) return "poco";
  if (ma <= 20) return "correcto";
  if (ma <= 30) return "demasiado";
  return "se quema";
}

/** Conductancia y fem (caída a→b en vacío) de cada pieza; null = abierta. */
function stamp(p: Part, ledOn: boolean, blown: boolean): { g: number; e: number } | null {
  switch (p.kind) {
    case "battery": return { g: 1 / R_INTERNA, e: p.volts };
    case "resistor": case "heater": return { g: 1 / p.ohms, e: 0 };
    case "lamp": return { g: 1 / LAMP_OHMS, e: 0 };
    case "motor": return { g: 1 / MOTOR_OHMS, e: 0 };
    case "wire": return { g: G_ON, e: 0 };
    case "fuse": return blown ? null : { g: G_ON, e: 0 };
    case "led": return ledOn ? { g: G_ON, e: LED_VF } : null;
  }
}

function nodal(parts: Part[], ledOn: boolean[], blown: boolean[]) {
  const n = Math.max(0, ...parts.flatMap((p) => [p.a, p.b])); // incógnitas: nodos 1..n
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? G_MIN : 0)));
  const z = new Array<number>(n).fill(0);
  const st = parts.map((p, i) => stamp(p, ledOn[i]!, blown[i]!));
  parts.forEach((p, i) => {
    const s = st[i];
    if (!s) return;
    const a = p.a - 1, b = p.b - 1;
    if (a >= 0) { A[a]![a]! += s.g; z[a]! += s.g * s.e; }
    if (b >= 0) { A[b]![b]! += s.g; z[b]! -= s.g * s.e; }
    if (a >= 0 && b >= 0) { A[a]![b]! -= s.g; A[b]![a]! -= s.g; }
  });
  const nodes = [0, ...gauss(A, z)];
  const ab = parts.map((p, i) => {
    const s = st[i];
    const v = nodes[p.a]! - nodes[p.b]!;
    return { v, i: s ? s.g * (v - s.e) : 0 };
  });
  return { nodes, ab };
}

/** Eliminación gaussiana con pivoteo parcial (modifica A y z). */
function gauss(A: number[][], z: number[]): number[] {
  const n = z.length;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    [z[c], z[piv]] = [z[piv]!, z[c]!];
    const rc = A[c]!;
    for (let r = c + 1; r < n; r++) {
      const row = A[r]!;
      const f = row[c]! / rc[c]!;
      if (f === 0) continue;
      for (let k = c; k < n; k++) row[k]! -= f * rc[k]!;
      z[r]! -= f * z[c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = z[r]!;
    for (let k = r + 1; k < n; k++) s -= A[r]![k]! * x[k]!;
    x[r] = s / A[r]![r]!;
  }
  return x;
}

export function solve(parts: Part[]): SolveResult {
  const ledOn = parts.map((p) => p.kind === "led");
  const blown = parts.map(() => false);
  let sol = nodal(parts, ledOn, blown);
  // Estados discretos: primero se asientan los LED, luego se funden fusibles.
  for (let iter = 0; iter < 4 * parts.length + 4; iter++) {
    let changed = false;
    parts.forEach((p, i) => {
      if (p.kind !== "led") return;
      const want = ledOn[i] ? sol.ab[i]!.i >= 0 : sol.ab[i]!.v > LED_VF;
      if (want !== ledOn[i]) { ledOn[i] = want; changed = true; }
    });
    if (!changed) {
      parts.forEach((p, i) => {
        if (p.kind === "fuse" && !blown[i] && Math.abs(sol.ab[i]!.i) > p.maxA) { blown[i] = true; changed = true; }
      });
    }
    if (!changed) break;
    sol = nodal(parts, ledOn, blown);
  }

  // Cortocircuito: algún borne de batería cae por debajo del 10 % de su voltaje.
  const short = parts.some((p, i) => p.kind === "battery" && sol.ab[i]!.v < 0.1 * p.volts);
  if (short) return { short: true };

  return {
    short: false,
    nodes: sol.nodes,
    parts: parts.map((p, i) => {
      const { v, i: amps } = sol.ab[i]!;
      const r: Reading = { amps: p.kind === "battery" ? -amps : amps, volts: v };
      if (p.kind === "led") r.label = ledLabel(amps);
      if (p.kind === "heater" && Math.abs(amps) > p.maxA) r.label = "se quema";
      if (p.kind === "fuse") r.blown = blown[i]!;
      return r;
    }),
  };
}

/** Voltímetro entre dos nodos (p. ej. los extremos de un circuito abierto). */
export function measureVolts(parts: Part[], a: number, b: number): number | null {
  const r = solve([...parts, { kind: "resistor", a, b, ohms: METER_OHMS }]);
  return r.short ? null : r.nodes[a]! - r.nodes[b]!;
}

export type Topology = "serie" | "paralelo" | "mixto";

/**
 * Se quita cada carga por turno: si las demás siempre se apagan es serie, si
 * siempre siguen es paralelo; cualquier otra cosa (o < 2 cargas) es mixto.
 */
export function classify(parts: Part[], loads: number[]): Topology {
  const lit = (r: SolveResult, j: number) => !r.short && Math.abs(r.parts[j]!.amps) > 1e-3;
  const base = solve(parts);
  if (loads.length < 2 || !loads.every((j) => lit(base, j))) return "mixto";
  let serie = true, paralelo = true;
  for (const i of loads) {
    const r = solve(parts.filter((_, k) => k !== i));
    for (const j of loads) {
      if (j === i) continue;
      if (lit(r, j > i ? j - 1 : j)) serie = false;
      else paralelo = false;
    }
  }
  return serie ? "serie" : paralelo ? "paralelo" : "mixto";
}
