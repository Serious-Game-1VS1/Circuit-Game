import { describe, expect, it } from "vitest";
import { CICLO, MANO_H, MANO_W, pixelesMano, poseMano } from "../src/mano";

describe("mano del tutorial", () => {
  it.each([false, true])("la cuadrícula cabe en 10x12 y no está vacía (presión %s)", (presion) => {
    const r = pixelesMano(presion);
    expect(r.length).toBeGreaterThan(0);
    for (const [x, y, w, h] of r) {
      expect(w > 0 && h > 0).toBe(true);
      expect(x >= 0 && y >= 0 && x + w <= MANO_W && y + h <= MANO_H, JSON.stringify([x, y, w, h])).toBe(true);
    }
    expect(r.some(([x, y, w, h]) => x === 0 && y === 0 && w === MANO_W && h === MANO_H)).toBe(false); // no es un bloque
  });

  it("al apretar el dedo se acorta", () => {
    expect(pixelesMano(true)[0]).not.toEqual(pixelesMano(false)[0]);
  });

  it("tocar: baja apretando con anillo, vuelve y repite", () => {
    const a = { x: 100, y: 200 };
    expect(poseMano("tocar", 0, a)).toMatchObject({ alpha: 0, presion: false, anillo: 0 });
    expect(poseMano("tocar", 500, a)).toMatchObject({ x: 100, y: 200, presion: true });
    expect(poseMano("tocar", 550, a).anillo).toBeGreaterThan(0);
    expect(poseMano("tocar", 1000, a)).toMatchObject({ y: 194, presion: false, anillo: 0 });
    expect(poseMano("tocar", 550 + CICLO.tocar, a)).toEqual(poseMano("tocar", 550, a));
  });

  it("arrastrar: aprieta en el origen, lleva la pieza al destino y suelta", () => {
    const a = { x: 50, y: 500 }, b = { x: 180, y: 250 };
    expect(poseMano("arrastrar", 300, a, b)).toMatchObject({ x: 50, y: 500, presion: true, fantasma: false });
    expect(poseMano("arrastrar", 750, a, b)).toMatchObject({ x: 115, y: 375, presion: true, fantasma: true });
    expect(poseMano("arrastrar", 1200, a, b)).toMatchObject({ x: 180, y: 250, presion: false, fantasma: false, alpha: 1 });
    expect(poseMano("arrastrar", 1700, a, b).alpha).toBe(0);
    expect(poseMano("arrastrar", 750 + 3 * CICLO.arrastrar, a, b)).toEqual(poseMano("arrastrar", 750, a, b));
  });

  it("con movimiento reducido queda quieta señalando el origen", () => {
    const a = { x: 10, y: 20 }, b = { x: 300, y: 400 };
    for (const ms of [0, 400, 750, 1700]) {
      expect(poseMano("arrastrar", ms, a, b, true)).toEqual({ x: 10, y: 20, presion: false, alpha: 1, anillo: 0, fantasma: false });
      expect(poseMano("tocar", ms, a, a, true)).toEqual({ x: 10, y: 20, presion: false, alpha: 1, anillo: 0, fantasma: false });
    }
  });
});
