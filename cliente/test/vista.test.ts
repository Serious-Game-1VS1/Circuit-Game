import { describe, expect, it } from "vitest";
import { probar, vistaDe } from "../src/vista";

describe("vista del reto 1 (LED rojo + 9 V)", () => {
  it("1000 Ω: poco", () => expect(probar(1000)).toMatchObject({ aguja: "poco", quemado: false }));
  it("470 Ω: correcto", () => expect(probar(470)).toMatchObject({ aguja: "correcto", quemado: false, mensaje: "¡Correcto!" }));
  it("220 Ω (>30 mA): se quema", () => expect(probar(220)).toMatchObject({ aguja: "demasiado", quemado: true }));
  it("100 Ω: se quema", () => expect(probar(100).quemado).toBe(true));
  it("cortocircuito: sin aguja ni cifras", () =>
    expect(vistaDe({ short: true })).toEqual({ aguja: null, quemado: false, cortocircuito: true, mensaje: "¡Cortocircuito!" }));

  it("etiqueta 'demasiado' (20-30 mA) sin quemar", () => {
    const v = vistaDe({ short: false, nodes: [0], parts: [{ amps: 0, volts: 0 }, { amps: 0, volts: 0 }, { amps: 0.025, volts: 2, label: "demasiado" }] });
    expect(v).toMatchObject({ aguja: "demasiado", quemado: false });
  });

  it("ningún mensaje muestra cifras", () => {
    for (const o of [100, 220, 470, 1000]) expect(probar(o).mensaje).not.toMatch(/\d/);
  });
});
