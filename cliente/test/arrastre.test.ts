import { describe, expect, it } from "vitest";
import { dentro, esArrastre, generosa, UMBRAL } from "../src/arrastre";

describe("arrastrar y soltar (lógica pura)", () => {
  it("un toque corto no es arrastre; moverse UMBRAL px sí", () => {
    expect(esArrastre(100, 100, 100 + UMBRAL - 1, 100)).toBe(false);
    expect(esArrastre(100, 100, 100 + UMBRAL, 100)).toBe(true);
    expect(esArrastre(0, 0, 8, 8)).toBe(true); // diagonal: √128 ≈ 11 px
  });

  it("soltar dentro o fuera de la ranura (rectángulo centrado)", () => {
    const r = { x: 180, y: 34, w: 140, h: 96 };
    expect(dentro(r, 180, 34)).toBe(true);
    expect(dentro(r, 250, 82)).toBe(true); // borde
    expect(dentro(r, 251, 34)).toBe(false);
    expect(dentro(r, 180, 290)).toBe(false); // de vuelta en la gaveta
  });

  it("el área de acierto es generosa: 1,5x la ranura y al menos 70 px, con el mismo centro", () => {
    const g = generosa({ x: 180, y: 34, w: 140, h: 96 });
    expect(g).toEqual({ x: 180, y: 34, w: 210, h: 144 });
    expect(generosa({ x: 0, y: 0, w: 20, h: 20 })).toMatchObject({ w: 70, h: 70 });
    expect(dentro(generosa({ x: 180, y: 34, w: 108, h: 44 }), 180 + 80, 34 + 33)).toBe(true); // borde del hueco: acierta
  });

  it("el umbral de arrastre es bajo (≈4 px) para ratón y táctil", () => {
    expect(UMBRAL).toBeLessThanOrEqual(4);
  });
});
