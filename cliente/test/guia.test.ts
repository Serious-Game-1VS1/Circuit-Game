import { describe, expect, it } from "vitest";
import type { Circuito } from "../../spike/src/protocol";
import { guiaPartida, idGuiaValido, MECANICAS, MEDIDA_DE } from "../src/tutorial";

const ids = (c: Circuito, nivel: number | undefined, vistos: string[]) => guiaPartida(c, nivel, vistos).map((a) => a.id);

describe("guía en partida (mecánica nueva)", () => {
  it("primera vez muestra mecánica y medida (1 globo cada una); con sus ids ya vistos, nada", () => {
    expect(ids("led", 1, [])).toEqual(["mec-led", "med-tension"]);
    expect(ids("led", 1, ["mec-led", "med-tension"])).toEqual([]);
    expect(ids("led", 2, ["mec-led"])).toEqual([]); // la mecánica vista no vuelve aunque la medida no se marcara
  });
  it("tensión antes que continuidad: la segunda mecánica solo enseña continuidad", () => {
    const vistos = ids("divisor", 2, []);
    expect(vistos).toEqual(["mec-divisor", "med-tension"]);
    expect(ids("abierto", 1, vistos)).toEqual(["mec-abierto", "med-continuidad"]);
    const cont = guiaPartida("abierto", 1, vistos)[1]!;
    expect(cont.pasos.join(" ")).toMatch(/QUITA la pieza/);
  });
  it("mecánica nueva con la medida ya enseñada solo muestra la mecánica", () => {
    expect(ids("protegido", 2, ["mec-led", "med-tension"])).toEqual(["mec-protegido"]);
    expect(ids("fusible", 2, ["med-continuidad"])).toEqual(["mec-fusible"]);
  });
  it("Aprender cuenta como visto: la mecánica y las medidas que enseña", () => {
    expect(ids("led", 1, ["resistencia"])).toEqual([]);
    expect(ids("cadena", 2, ["multimetro"])).toEqual(["mec-cadena"]);
    expect(ids("divisor", 2, ["protegido"])).toEqual(["mec-divisor"]);
  });
  it("nivel 3: las resistencias son «colores»; la cadena explica la continuidad sin quitar la pieza", () => {
    expect(ids("led", 3, ["mec-led", "med-tension"])).toEqual(["mec-colores"]);
    expect(ids("cabina", 3, ["colores"])).toEqual([]);
    expect(guiaPartida("cadena", 2, [])[1]!.pasos.join(" ")).not.toMatch(/QUITA/);
  });
  it("todas las familias tienen guía de 2-4 pasos cortos y cada tutorial de Aprender es id válido", () => {
    for (const c of Object.keys(MEDIDA_DE) as Circuito[]) for (const n of [1, 2, 3]) {
      const pasos = guiaPartida(c, n, []).flatMap((a) => a.pasos);
      expect(pasos.length).toBeGreaterThanOrEqual(2);
      expect(pasos.length).toBeLessThanOrEqual(4);
      for (const t of pasos) expect(t.length).toBeLessThanOrEqual(80);
      for (const a of guiaPartida(c, n, [])) expect(a.focos.length).toBe(a.pasos.length); // cada paso tiene su foco (velo y flecha)
    }
    expect(guiaPartida("abierto", 1, ["med-tension"])[1]).toMatchObject({ focos: ["tension"], cont: true }); // apunta al botón Continuidad
    for (const m of MECANICAS) expect(idGuiaValido(m.id)).toBe(true);
  });
});
