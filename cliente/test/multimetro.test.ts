import { describe, expect, it } from "vitest";
import type { Medida } from "../../spike/src/protocol";
import { anguloTension, lecturaLista, MEDIR_MS, textoMedida, textoModo } from "../src/multimetro";

const tension = (fraccion: number, t: Medida["tension"]): Medida => ({ t: "medida", seq: 3, t0: 0, zona: 1, modo: "tension", punto: "carga1", tension: t, fraccion });

describe("multímetro del Taller", () => {
  it("la lectura solo aparece tras ~1 s y con la respuesta de esa medición", () => {
    const m = { seq: 3, desde: 1000, punto: "carga1" };
    expect(lecturaLista(m, tension(0.5, "parte"), 1000 + MEDIR_MS - 1)).toBeNull();
    expect(lecturaLista(m, undefined, 5000)).toBeNull();
    expect(lecturaLista(m, tension(0.5, "parte"), 1000 + MEDIR_MS / 2, MEDIR_MS / 2)).not.toBeNull(); // Multímetro rápido
    expect(lecturaLista(m, { ...tension(0.5, "parte"), seq: 2 }, 5000)).toBeNull();
    expect(lecturaLista(m, tension(0.5, "parte"), 1000 + MEDIR_MS)).toMatchObject({ fraccion: 0.5 });
  });

  it("aguja y textos de tensión y continuidad", () => {
    expect([0, 0.5, 1, 2].map(anguloTension)).toEqual([-60, 0, 60, 60]);
    expect(textoMedida(tension(1, "toda"))).toMatch(/camino está cortado/);
    expect(textoMedida({ ...tension(0, "nada"), modo: "continuidad", pasa: false })).toMatch(/^No pasa/);
    expect(textoMedida(tension(1, "toda"), "invertido")).toMatch(/mira su sentido/); // LED invertido: pista de polaridad, no «cortado»
    expect(textoMedida(tension(1, "toda"), "abierto")).toMatch(/camino está cortado/);
    expect(textoModo("continuidad")).toMatch(/^Batería desconectada/);
  });

  it("Reactor: el multímetro no promete amperios y la lectura del fusible se explica", () => {
    const cont = (pasa: boolean): Medida => ({ t: "medida", seq: 1, t0: 0, zona: 1, modo: "continuidad", punto: "pieza", pasa });
    expect(textoModo("tension", "fusible")).toMatch(/No mide amperios/);
    expect(textoMedida(cont(true), "fusible")).toMatch(/fusible está sano/);
    expect(textoMedida({ ...cont(true), punto: "carga1" }, "fusible")).toMatch(/^Pasa: la corriente/);
  });
});
