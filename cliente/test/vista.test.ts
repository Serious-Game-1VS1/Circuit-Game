import { describe, expect, it } from "vitest";
import { evaluar, PIEZAS } from "../../spike/src/engine/pods";
import type { Circuito, Verdict } from "../../spike/src/protocol";
import { botonesGaveta, GAVETA, pestanas, reparadas, RETO, textoOpcion, textoVolts, vistaDeVeredicto } from "../src/vista";

const CIRCUITOS: Circuito[] = ["led", "cabina", "luces", "interruptor", "fusible"];
const VEREDICTOS: Verdict[] = ["poco", "correcto", "demasiado", "se quema", "corto"];

describe("vista de una zona", () => {
  it("aguja y estado según el veredicto del árbitro", () => {
    expect(vistaDeVeredicto("poco")).toMatchObject({ aguja: "poco", quemado: false });
    expect(vistaDeVeredicto("correcto", "fusible")).toMatchObject({ aguja: "correcto", mensaje: "¡Correcto!" });
    expect(vistaDeVeredicto("se quema", "fusible")).toMatchObject({ aguja: "demasiado", quemado: true });
    expect(vistaDeVeredicto("corto", "luces")).toEqual({ aguja: null, quemado: false, cortocircuito: true, mensaje: "¡Cortocircuito!" });
  });

  it("los veredictos reales del motor dan una vista coherente en cada circuito", () => {
    for (const c of CIRCUITOS) for (const pieza of PIEZAS[c]) {
      const v = vistaDeVeredicto(evaluar({ circuito: c, volts: 9 }, pieza), c);
      expect(v.aguja === null).toBe(v.cortocircuito);
    }
  });

  it("ningún texto de reto, gaveta o mensaje muestra cifras", () => {
    for (const c of CIRCUITOS) {
      expect(RETO[c] + GAVETA[c]).not.toMatch(/\d/);
      for (const v of VEREDICTOS) expect(vistaDeVeredicto(v, c).mensaje).not.toMatch(/\d/);
    }
  });

  it("etiquetas de pieza o montaje, y voltaje de la batería con coma", () => {
    expect(textoOpcion("470", "led")).toBe("470 Ω");
    expect(textoOpcion("0.5", "fusible")).toBe("0,5 A");
    expect(textoOpcion("paralelo", "luces")).toBe("Paralelo");
    expect(textoVolts(3.7)).toBe("3,7 V");
  });

  it("pestañas por zona dañada, indicador de reparadas y gaveta en el orden del árbitro", () => {
    const z = (zona: number, nombre: "radar" | "turbina" | "reactor", reparada: boolean) =>
      ({ zona, nombre, circuito: "led" as const, volts: 9, opciones: ["1000", "220", "470"], reparada });
    const pod = { numero: 4, zonas: [z(3, "reactor", false), z(0, "radar", true), z(2, "turbina", false)] };
    expect(pestanas(pod, 2).map((p) => [p.texto, p.activa])).toEqual([["Radar ✔", false], ["Turbina", true], ["Reactor", false]]);
    expect(reparadas(pod)).toBe("Zonas reparadas: 1/3");
    expect(botonesGaveta(pod.zonas[0]!, "220")).toEqual([
      { pieza: "1000", texto: "1000 Ω", elegida: false }, { pieza: "220", texto: "220 Ω", elegida: true }, { pieza: "470", texto: "470 Ω", elegida: false },
    ]);
  });
});
