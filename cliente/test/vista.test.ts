import { describe, expect, it } from "vitest";
import { evaluar, PIEZAS } from "../../spike/src/engine/pods";
import type { Circuito, Verdict } from "../../spike/src/protocol";
import { aPixel, botonesGaveta, conHueco, GAVETA, pestanas, CARTEL, LEYENDA_ZONAS, reparadas, retrasoCola, RETO, textoOpcion, textoVolts, vistaDeVeredicto } from "../src/vista";

const CIRCUITOS: Circuito[] = ["led", "cabina", "luces", "interruptor", "fusible"];
const VEREDICTOS: Verdict[] = ["poco", "correcto", "demasiado", "se quema", "corto"];

describe("vista de una zona", () => {
  it("aguja y estado según el veredicto del árbitro", () => {
    expect(vistaDeVeredicto("poco")).toMatchObject({ aguja: "poco", quemado: false });
    expect(vistaDeVeredicto("correcto", "fusible")).toMatchObject({ aguja: "correcto", mensaje: "¡Correcto!" });
    expect(vistaDeVeredicto("se quema", "fusible")).toMatchObject({ aguja: "demasiado", quemado: true });
    expect(vistaDeVeredicto("corto", "luces")).toEqual({ aguja: null, quemado: false, cortocircuito: true, mensaje: "¡Cortocircuito! La corriente tiene un atajo sin carga. Revisa los cables." });
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

  it("nivel 2: reto, gaveta, etiquetas y mensajes de combinar, divisor y protegido", () => {
    for (const c of ["combinar", "divisor", "protegido"] as const) {
      expect(RETO[c]).toBeTruthy(); expect(GAVETA[c]).toBeTruthy();
      for (const v of VEREDICTOS) expect(vistaDeVeredicto(v, c).mensaje).toBeTruthy();
      expect(vistaDeVeredicto("se quema", c).quemado).toBe(true);
    }
    expect(PIEZAS.combinar.map((p) => textoOpcion(p, "combinar"))).toEqual(["Una sola", "En serie", "En paralelo"]);
    expect(textoOpcion("470", "divisor")).toBe("470 Ω");
    expect(textoOpcion("100", "protegido")).toBe("100 Ω");
    expect(textoVolts(6)).toBe("6 V");
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

describe("claridad del Taller", () => {
  it("el «¡REPARADO!» termina antes de que el pod nuevo muestre su avería", () => {
    expect(150 + CARTEL.reparadoMs + 150).toBeLessThanOrEqual(CARTEL.averiaRetraso);
    expect(CARTEL.puntosMs).toBeLessThanOrEqual(CARTEL.averiaRetraso + 100);
  });
  it("hay leyenda de iconos y el texto del fusible no promete cifras", () => {
    expect(LEYENDA_ZONAS).toMatch(/Rojo.*Verde.*Cian/);
    expect(GAVETA.fusible).not.toMatch(/consume/);
  });
});

describe("aPixel", () => {
  it("cambia los glifos que la fuente pixel no dibuja", () => {
    expect(aPixel("el riel + y el riel − hará corto")).toBe("el riel + y el riel - hará corto");
    expect(aPixel("Elige un fusible (A = lo que aguanta)")).toBe("Elige un fusible (A: lo que aguanta)");
  });
});

describe("retrasoCola", () => {
  it("escalona 250 ms al iniciar y luego entra de inmediato", () => {
    expect([0, 1, 3].map((i) => retrasoCola(i, true))).toEqual([0, 250, 750]);
    expect(retrasoCola(3, false)).toBe(0);
  });
});

describe("hueco rojo con «?»", () => {
  it("sale en toda mecánica de gaveta mientras falta la pieza, igual en todos los modos", () => {
    for (const c of ["led", "cabina", "fusible", "combinar", "divisor", "protegido"] as const) {
      expect(conHueco(c, undefined, false), c).toBe(true);
      expect(conHueco(c, "1", false), c).toBe(false); // ya colocada
      expect(conHueco(c, undefined, true), c).toBe(false); // zona reparada
    }
  });
  it("la cadena marca su propio hueco en la pieza localizada, no el hueco global de la gaveta", () => {
    expect(conHueco("cadena", undefined, false)).toBe(false);
  });
  it("la cadena: textos del repuesto y del veredicto sin revelar cuál pieza ni por qué", () => {
    expect(["cable", "led", "ledInv", "r220", "3:r470", "1:led"].map((p) => textoOpcion(p, "cadena"))).toEqual(["Cable", "LED", "LED giro", "220 Ω", "470 Ω", "LED"]);
    for (const l of ["poco", "demasiado", "se quema"] as const) expect(vistaDeVeredicto(l, "cadena").mensaje).not.toMatch(/muert|corta|abiert|al revés|giro|resistencia|cable/i);
    expect(RETO.cadena).not.toMatch(/resistencia|LED está al revés|cable roto/i);
  });
  it("la placa (luces, interruptor) tiene su propia gaveta de piezas", () => {
    expect(conHueco("luces", undefined, false)).toBe(false);
    expect(conHueco("interruptor", undefined, false)).toBe(false);
  });
  it("soltar la pieza fuera del hueco no la coloca (la ranura es el único destino)", async () => {
    const { dentro } = await import("../src/arrastre");
    const ranura = { x: 180, y: 34, w: 140, h: 96 };
    expect(dentro(ranura, 180, 34)).toBe(true);
    expect(dentro(ranura, 180, 290)).toBe(false); // de vuelta en la gaveta
    expect(dentro(ranura, 40, 34)).toBe(false);
  });
});

