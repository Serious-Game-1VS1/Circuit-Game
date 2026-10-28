import { describe, expect, it } from "vitest";
import { generar, presupuesto, validarPartida, validarZona, type ZonaPod } from "../src/engine/generador.js";
import { medir } from "../src/engine/medir.js";
import { evaluar, montar } from "../src/engine/pods.js";
import { solve } from "../src/engine/circuit.js";
import type { Circuito, Verdict } from "../src/protocol.js";

const veredictos = (z: { circuito: Circuito; volts: number; r1?: number }) => Object.fromEntries(
  (["una", "serie", "paralelo", "100", "220", "470", "1000"] as const)
    .filter((p) => (z.circuito === "combinar") === ["una", "serie", "paralelo"].includes(p))
    .map((p) => [p, evaluar(z, p)]),
) as Record<string, Verdict>;

describe("combinar (Radar): LED con dos resistencias de 220 Ω", () => {
  it.each([
    [3.7, { una: "poco", serie: "poco", paralelo: "correcto" }],
    [4.5, { una: "correcto", serie: "poco", paralelo: "demasiado" }],
    [9, { una: "se quema", serie: "correcto", paralelo: "se quema" }],
  ])("%s V", (volts, esperado) => {
    expect(veredictos({ circuito: "combinar", volts })).toEqual(esperado);
  });

  it("solución única con la batería ±5 %", () => {
    for (const [volts, sol] of [[3.7, "paralelo"], [4.5, "una"], [9, "serie"]] as const) {
      const z: ZonaPod = { zona: 0, nombre: "radar", circuito: "combinar", volts, opciones: ["una", "serie", "paralelo"], solucion: sol };
      expect(validarZona(z)).toBeNull();
    }
  });
});

describe("divisor (Reactor): R1 fija, R2 elegida, tensión del nodo medio", () => {
  const tabla = (r1: number) => veredictos({ circuito: "divisor", volts: 9, r1 });
  it.each([
    [220, { 100: "poco", 220: "correcto", 470: "se quema", 1000: "se quema" }],
    [470, { 100: "poco", 220: "poco", 470: "correcto", 1000: "se quema" }],
    [1000, { 100: "poco", 220: "poco", 470: "poco", 1000: "correcto" }],
  ])("R1 = %s Ω", (r1, esperado) => {
    expect(tabla(r1)).toEqual(esperado);
  });

  it("con 9 V el único acierto es R2 = R1 (divisor de tensión a la mitad, 4,5 V)", () => {
    for (const r1 of [220, 470, 1000]) {
      const z: ZonaPod = { zona: 3, nombre: "reactor", circuito: "divisor", volts: 9, r1, opciones: ["100", "220", "470", "1000"], solucion: String(r1) };
      expect(validarZona(z)).toBeNull();
    }
  });

  it("se dan los tramos 4-5 / 5-5,5 / >5,5 (R1 220 Ω: R2 330 queda en 'demasiado' si existiera)", () => {
    const v = (r1: number, r2: number) => solve(montar({ circuito: "divisor", volts: 9, r1 }, String(r2)).parts).short ? NaN : (solve(montar({ circuito: "divisor", volts: 9, r1 }, String(r2)).parts) as { nodes: number[] }).nodes[2]!;
    expect(v(470, 470)).toBeCloseTo(4.5, 1);
    expect(v(220, 470)).toBeGreaterThan(5.5);
  });

  it("el multímetro de tensión mide el nodo medio (R2) con montar().puntos", () => {
    expect(medir({ circuito: "divisor", volts: 9, r1: 470 }, "470", "tension", "pieza")).toEqual({ tension: "parte", fraccion: 0.5 });
    expect(medir({ circuito: "divisor", volts: 9, r1: 470 }, "220", "tension", "pieza")).toEqual({ tension: "parte", fraccion: 0.3 });
    expect(medir({ circuito: "divisor", volts: 9, r1: 470 }, "1000", "tension", "pieza")).toEqual({ tension: "parte", fraccion: 0.7 });
    expect(medir({ circuito: "divisor", volts: 9, r1: 470 }, "470", "tension", "carga1")).toEqual({ tension: "parte", fraccion: 0.5 });
  });
});

describe("protegido (Turbina): R + diodo (0,7 V) + LED (2 V)", () => {
  it.each([
    [6, { 100: "se quema", 220: "correcto", 470: "poco", 1000: "poco" }],
    [9, { 100: "se quema", 220: "demasiado", 470: "correcto", 1000: "poco" }],
  ])("%s V", (volts, esperado) => {
    expect(veredictos({ circuito: "protegido", volts })).toEqual(esperado);
  });

  it("corriente = (V − 2,7)/(R + 0,5)", () => {
    const r = solve(montar({ circuito: "protegido", volts: 9 }, "470").parts);
    if (r.short) throw new Error("corto");
    expect(r.parts[1]!.amps).toBeCloseTo(6.3 / 470.5, 5);
  });

  it("6 y 9 V tienen solución única con margen; 3,7 y 4,5 V no (por eso no se sortean)", () => {
    const op = ["100", "220", "470", "1000"];
    for (const [volts, sol] of [[6, "220"], [9, "470"]] as const) {
      expect(validarZona({ zona: 2, nombre: "turbina", circuito: "protegido", volts, opciones: op, solucion: sol })).toBeNull();
    }
    expect(validarZona({ zona: 2, nombre: "turbina", circuito: "protegido", volts: 4.5, opciones: op, solucion: "100" })).toMatch(/margen/);
  });
});

describe("generador con las tres familias", () => {
  it("determinista por semilla, válido, con r1 solo en el divisor y presupuesto respetado", () => {
    const vistas = new Set<string>();
    for (let s = 0; s < 300; s++) {
      for (const nivel of [2, "mixto"] as const) {
        const pods = generar(s, nivel);
        expect(generar(s, nivel)).toEqual(pods);
        expect(validarPartida(pods, nivel)).toBeNull();
        pods.forEach((p, i) => expect(presupuesto(p)).toBeLessThanOrEqual(i < 3 ? 2 : 7));
        pods.flatMap((p) => p.zonas).forEach((z) => {
          vistas.add(z.circuito);
          expect(z.r1 !== undefined).toBe(z.circuito === "divisor");
        });
      }
    }
    expect([...vistas]).toEqual(expect.arrayContaining(["combinar", "divisor", "protegido"]));
  });
});
