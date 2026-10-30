import { describe, expect, it, vi } from "vitest";
vi.mock("../src/arte", () => ({}));
vi.mock("../src/audio", () => ({}));
import { CODIGOS, generarPuerta } from "../src/puerta";

const plantilla = (p: { pregunta: string }) => p.pregunta.replace(/\d+([.,]\d+)?/g, "#");
const todas = (nivel: 1 | 2) => Array.from({ length: 60 }, (_, i) => generarPuerta(7 + (i % 5), nivel, i));

describe("puerta", () => {
  it("es determinista por semilla", () => {
    for (let i = 0; i < 20; i++) expect(generarPuerta(42, 2, i)).toEqual(generarPuerta(42, 2, i));
  });
  it("la correcta es única, está dentro y no hay opciones repetidas", () => {
    for (const nivel of [1, 2] as const) for (const p of todas(nivel)) {
      expect(p.opciones).toHaveLength(3);
      expect(new Set(p.opciones).size).toBe(3);
      expect(p.correcta).toBeGreaterThanOrEqual(0);
      expect(p.correcta).toBeLessThan(3);
    }
  });
  it("no repite la misma puerta seguida", () => {
    for (let s = 0; s < 10; s++) for (const nivel of [1, 2] as const) for (let i = 1; i < 40; i++)
      expect(plantilla(generarPuerta(s, nivel, i))).not.toBe(plantilla(generarPuerta(s, nivel, i - 1)));
  });
  it("textos de máximo 60 caracteres", () => {
    for (const p of [...todas(1), ...todas(2)]) for (const t of [p.pregunta, p.explicacion, ...p.opciones]) expect(t.length).toBeLessThanOrEqual(60);
  });
  it("los códigos de color son los del juego", () => {
    expect(CODIGOS[100]).toEqual(["marron", "negro", "marron"]);
    expect(CODIGOS[220]).toEqual(["rojo", "rojo", "marron"]);
    expect(CODIGOS[470]).toEqual(["amarillo", "violeta", "marron"]);
    expect(CODIGOS[1000]).toEqual(["marron", "negro", "rojo"]);
    for (const p of todas(2)) if (p.imagen) expect(p.imagen.bandas).toEqual(CODIGOS[Number(p.opciones[p.correcta]!.replace(" Ω", ""))]);
  });
  it("nivel 1 no incluye serie/paralelo/divisor; nivel 2 sí", () => {
    expect(todas(1).some((p) => /serie|paralelo|[Dd]ivisor/.test(p.pregunta))).toBe(false);
    const t2 = todas(2).map((p) => p.pregunta).join("|");
    expect(t2).toMatch(/serie/); expect(t2).toMatch(/paralelo/); expect(t2).toMatch(/[Dd]ivisor/);
  });
  it("las respuestas de serie, paralelo y mitad son correctas", () => {
    for (const p of todas(2)) {
      if (/serie/.test(p.pregunta)) expect(p.opciones[p.correcta]).toBe("440 Ω");
      if (/paralelo/.test(p.pregunta)) expect(p.opciones[p.correcta]).toBe("110 Ω");
      const m = /R1 = R2 y ([\d,]+) V/.exec(p.pregunta);
      if (m) expect(parseFloat(p.opciones[p.correcta]!.replace(",", "."))).toBeCloseTo(parseFloat(m[1]!.replace(",", ".")) / 2);
    }
  });
});
