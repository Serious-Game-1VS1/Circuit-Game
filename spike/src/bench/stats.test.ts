import { describe, expect, it } from "vitest";
import { pct, summarize } from "./stats.js";

describe("percentiles (nearest-rank)", () => {
  const xs = Array.from({ length: 100 }, (_, i) => 100 - i); // 1..100 desordenado

  it("devuelve el valor de la muestra en el rango ceil(p·n)", () => {
    expect(pct(xs, 50)).toBe(50);
    expect(pct(xs, 95)).toBe(95);
    expect(pct(xs, 99)).toBe(99);
    expect(pct(xs, 100)).toBe(100);
    expect(pct(xs, 0)).toBe(1);
  });

  it("con pocas muestras el p95 es el máximo, y sin muestras es NaN", () => {
    expect(pct([3, 1, 2], 95)).toBe(3);
    expect(pct([], 95)).toBeNaN();
  });

  it("no altera el arreglo de entrada", () => {
    const a = [3, 1, 2];
    pct(a, 50);
    expect(a).toEqual([3, 1, 2]);
  });

  it("resume n, percentiles, máximo y % sobre cada meta", () => {
    const s = summarize(xs, [150, 90]);
    expect(s).toMatchObject({ n: 100, p50: 50, p95: 95, p99: 99, max: 100 });
    expect(s.overGoalPct).toEqual({ "150ms": 0, "90ms": 10 });
  });
});
