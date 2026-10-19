import { describe, expect, it } from "vitest";
import { classify, ledLabel, measureVolts, solve, type Part, type Reading } from "../src/engine/circuit.js";

/** RNF-01: error relativo < 1 %. */
const within1pct = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThan(0.01);

/** Lecturas sin cortocircuito: ok(partes)(i) = lectura de la pieza i. */
const ok = (parts: Part[]) => {
  const r = solve(parts);
  if (r.short) throw new Error("cortocircuito inesperado");
  return (i: number): Reading => r.parts[i]!;
};

/** Batería 1(+)–0, resistencia 1–2, LED 2–0. */
const ledLoop = (volts: number, ohms: number): Part[] => [
  { kind: "battery", a: 1, b: 0, volts },
  { kind: "resistor", a: 1, b: 2, ohms },
  { kind: "led", a: 2, b: 0 },
];

describe("LED rojo: I = (V − 2) / (R + 0,5)", () => {
  it.each([
    [9, 100, 69.7, "se quema"],
    [9, 470, 14.9, "correcto"],
    [9, 1000, 7.0, "poco"],
    [3.7, 100, 16.9, "correcto"],
    [4.5, 220, 11.3, "correcto"],
    [18, 1000, 16.0, "correcto"],
  ] as const)("%s V con %s Ω → %s mA (%s)", (v, r, ma, label) => {
    const led = ok(ledLoop(v, r))(2);
    within1pct(led.amps * 1000, ma);
    expect(led.label).toBe(label);
  });

  it("umbrales de etiqueta", () => {
    expect(ledLabel(0.0099)).toBe("poco");
    expect(ledLabel(0.01)).toBe("correcto");
    expect(ledLabel(0.02)).toBe("correcto");
    expect(ledLabel(0.025)).toBe("demasiado");
    expect(ledLabel(0.0301)).toBe("se quema");
  });

  it("LED invertido no conduce", () => {
    const led = ok([{ kind: "battery", a: 1, b: 0, volts: 9 }, { kind: "resistor", a: 1, b: 2, ohms: 470 }, { kind: "led", a: 0, b: 2 }])(2);
    expect(led.amps).toBe(0);
    expect(led.label).toBe("poco");
  });
});

describe("cortocircuito y circuito abierto", () => {
  it("cable entre bornes → cortocircuito sin cifras", () => {
    const r = solve([{ kind: "battery", a: 1, b: 0, volts: 9 }, { kind: "wire", a: 1, b: 0 }, { kind: "lamp", a: 1, b: 0 }]);
    expect(r).toEqual({ short: true });
  });

  it("abierto con LED: ~7 V en el hueco", () => {
    const parts: Part[] = [{ kind: "battery", a: 1, b: 0, volts: 9 }, { kind: "resistor", a: 1, b: 2, ohms: 470 }, { kind: "led", a: 2, b: 3 }];
    within1pct(measureVolts(parts, 3, 0)!, 7);
  });

  it("abierto con foco o motor: 9 V en el hueco", () => {
    for (const kind of ["lamp", "motor"] as const) {
      within1pct(measureVolts([{ kind: "battery", a: 1, b: 0, volts: 9 }, { kind, a: 1, b: 2 }], 2, 0)!, 9);
    }
  });
});

describe("pods de cargas", () => {
  const cabina: Part[] = [
    { kind: "battery", a: 1, b: 0, volts: 9 },
    { kind: "lamp", a: 1, b: 0 },
    { kind: "lamp", a: 1, b: 0 },
  ];
  // Supuesto: dos baterías de 9 V en serie (1 Ω interno) con dos motores en serie.
  const turbina: Part[] = [
    { kind: "battery", a: 1, b: 0, volts: 9 },
    { kind: "battery", a: 2, b: 1, volts: 9 },
    { kind: "motor", a: 2, b: 3 },
    { kind: "motor", a: 3, b: 0 },
  ];

  it("cabina en paralelo: 98,9 mA por luz y clasifica 'paralelo'", () => {
    const p = ok(cabina);
    within1pct(p(1).amps * 1000, 98.9);
    within1pct(p(2).amps * 1000, 98.9);
    expect(classify(cabina, [1, 2])).toBe("paralelo");
  });

  it("turbina en serie: 197,8 mA y clasifica 'serie'", () => {
    within1pct(ok(turbina)(2).amps * 1000, 197.8);
    expect(classify(turbina, [2, 3])).toBe("serie");
  });

  it("montaje mixto no es serie ni paralelo", () => {
    const mixto: Part[] = [
      { kind: "battery", a: 1, b: 0, volts: 9 },
      { kind: "lamp", a: 1, b: 2 },
      { kind: "lamp", a: 2, b: 0 },
      { kind: "lamp", a: 2, b: 0 },
    ];
    expect(classify(mixto, [1, 2, 3])).toBe("mixto");
  });
});

describe("reactor: fusible y calefactor", () => {
  // Supuesto: calefactor de 12,4 Ω que en falla baja a 3,1 Ω; aguanta 1,5 A.
  const reactor = (heaterOhms: number, fuseA: number): Part[] => [
    { kind: "battery", a: 1, b: 0, volts: 9 },
    { kind: "fuse", a: 1, b: 2, maxA: fuseA },
    { kind: "heater", a: 2, b: 0, ohms: heaterOhms, maxA: 1.5 },
  ];

  it("normal: 0,698 A, fusible de 1 A intacto", () => {
    const p = ok(reactor(12.4, 1));
    within1pct(p(2).amps, 0.698);
    expect(p(1).blown).toBe(false);
    expect(p(2).label).toBeUndefined();
  });

  it("falla: 2,50 A funde el fusible de 1 A y protege el calefactor", () => {
    const p = ok(reactor(3.1, 1));
    expect(p(1).blown).toBe(true);
    expect(p(2).amps).toBeCloseTo(0, 6);
    expect(p(2).label).toBeUndefined();
  });

  it("falla con fusible de 3 A: pasan 2,50 A y el calefactor se quema", () => {
    const p = ok(reactor(3.1, 3));
    within1pct(p(2).amps, 2.5);
    expect(p(1).blown).toBe(false);
    expect(p(2).label).toBe("se quema");
  });
});
