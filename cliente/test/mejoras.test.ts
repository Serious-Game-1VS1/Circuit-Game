import { describe, expect, it } from "vitest";
import { conDoble, elegir, etiquetas, medirMs, MEJORAS, OFERTA, ofrecer, sinMejoras } from "../src/mejoras";
import { MEDIR_MS } from "../src/multimetro";

/** rnd determinista: recorre una lista de valores en [0, 1). */
const secuencia = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]!; };

describe("mejoras entre pods", () => {
  it("ofrece OFERTA mejoras distintas del catálogo", () => {
    for (const r of [0, 0.3, 0.7, 0.99]) {
      const o = ofrecer(sinMejoras(), secuencia(r, 1 - r, r));
      expect(o).toHaveLength(OFERTA);
      expect(new Set(o).size).toBe(OFERTA);
      expect(o.every((m) => m in MEJORAS)).toBe(true);
    }
  });

  it("no ofrece las que ya están activas (no se acumulan) y ofrece menos si quedan pocas", () => {
    const a = elegir(elegir(sinMejoras(), "enfriamiento"), "multimetro");
    expect(ofrecer(a).sort()).toEqual(["doble", "escudo"]);
    expect(ofrecer(elegir(elegir(a, "escudo"), "doble"))).toEqual([]);
  });

  it("Multímetro rápido: medir tarda la mitad", () => {
    expect(medirMs(sinMejoras())).toBe(MEDIR_MS);
    expect(medirMs(elegir(sinMejoras(), "multimetro"))).toBe(MEDIR_MS / 2);
  });

  it("Doble puntos vale solo para el siguiente pod: duplica, suma lo extra al XP y se gasta", () => {
    const x2 = elegir(sinMejoras(), "doble");
    expect(conDoble(x2, 100)).toEqual({ a: sinMejoras(), pts: 200, extra: 100 });
    expect(conDoble(sinMejoras(), 100)).toEqual({ a: sinMejoras(), pts: 100, extra: 0 });
  });

  it("etiquetas del HUD de las activas", () => {
    expect(etiquetas(sinMejoras())).toBe("");
    expect(etiquetas(elegir(elegir(sinMejoras(), "doble"), "escudo"))).toBe("ESC X2");
  });
});
