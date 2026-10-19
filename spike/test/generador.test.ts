import { describe, expect, it } from "vitest";
import { generar, mulberry32, presupuesto, validarPartida, validarZona, type Pod } from "../src/engine/generador.js";
import { evaluar } from "../src/engine/pods.js";
import type { Nivel } from "../src/protocol.js";

const NIVELES: Nivel[] = [1, 2];

describe("generador de pods (RF-06)", () => {
  it("mulberry32 es determinista y distinto por semilla", () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it.each(NIVELES)("nivel %i: la misma semilla regenera los mismos pods; otra semilla, otros", (nivel) => {
    expect(generar(123, nivel)).toEqual(generar(123, nivel));
    const distintas = new Set(Array.from({ length: 20 }, (_, s) => JSON.stringify(generar(s, nivel))));
    expect(distintas.size).toBeGreaterThan(15);
  });

  it.each(NIVELES)("nivel %i: 500 sorteos válidos (el CI corre 10 000 con npm run validar:sorteos)", (nivel) => {
    for (let s = 0; s < 500; s++) expect(validarPartida(generar(s, nivel), nivel)).toBeNull();
  });

  it("estructura: 5 pods, los 3 primeros con una zona; cada zona con exactamente una opción correcta", () => {
    const pods = generar(7, 2);
    expect(pods.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5]);
    expect(pods.slice(0, 3).every((p) => p.zonas.length === 1)).toBe(true);
    for (const z of pods.flatMap((p) => p.zonas)) {
      expect(z.opciones.filter((o) => evaluar(z, o) === "correcto")).toEqual([z.solucion]);
    }
  });

  it("cada zona de resistencia ofrece 3 de las 4 y el voltaje fija la correcta (Figura 8)", () => {
    const zonas = Array.from({ length: 200 }, (_, s) => generar(s, 1)).flat().flatMap((p) => p.zonas).filter((z) => z.circuito === "led");
    expect(zonas.every((z) => z.opciones.length === 3)).toBe(true);
    const porVolts = new Map(zonas.map((z) => [z.volts, z.solucion]));
    expect(Object.fromEntries(porVolts)).toEqual({ 3.7: "100", 4.5: "220", 9: "470" });
    // la correcta no está siempre en la misma posición
    expect(new Set(zonas.map((z) => z.opciones.indexOf(z.solucion))).size).toBe(3);
  });

  it("nivel 2 cubre focos en paralelo, interruptor y fusible con sus veredictos", () => {
    const zonas = Array.from({ length: 50 }, (_, s) => generar(s, 2)).flat().flatMap((p) => p.zonas);
    const de = (c: string) => zonas.find((z) => z.circuito === c)!;
    const v = (c: string) => Object.fromEntries(de(c).opciones.map((o) => [o, evaluar(de(c), o)]));
    expect(v("luces")).toEqual({ paralelo: "correcto", serie: "poco", puente: "corto" });
    expect(v("interruptor")).toEqual({ serie: "correcto", paralelo: "corto" });
    expect(v("fusible")).toEqual({ "0.5": "poco", "1": "correcto", "3": "se quema" });
  });

  it("presupuesto: igual para ambos jugadores porque reciben la misma secuencia; pods 1 a 3 acotados", () => {
    for (const nivel of NIVELES) {
      const pods = generar(99, nivel);
      expect(pods.slice(0, 3).every((p) => presupuesto(p) <= 2)).toBe(true);
    }
  });

  it("el validador rechaza soluciones falsas, opciones triviales y falta de cobertura", () => {
    const pods = generar(5, 1);
    const copia = (): Pod[] => structuredClone(pods);
    const z = pods[0]!.zonas[0]!;

    const malaSolucion = copia();
    malaSolucion[0]!.zonas[0]!.solucion = z.opciones.find((o) => o !== z.solucion)!;
    expect(validarPartida(malaSolucion, 1)).toMatch(/solución no única/);

    expect(validarZona({ ...z, opciones: [z.solucion] })).toMatch(/insuficientes/);
    expect(validarZona({ ...z, opciones: [z.solucion, "47"] })).toMatch(/catálogo/);
    // cabina de nivel 1 a 3,7 V: ninguna resistencia deja los dos LED en verde
    expect(validarZona({ zona: 1, nombre: "cabina", circuito: "cabina", volts: 3.7, opciones: ["100", "220", "470"], solucion: "100" })).not.toBeNull();

    const sinCobertura = copia().map((p) => ({ ...p, zonas: p.zonas.filter((x) => x.circuito !== "cabina") }));
    expect(validarPartida(sinCobertura, 1)).not.toBeNull();
  });
});
