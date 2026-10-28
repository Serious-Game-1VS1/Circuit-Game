import { describe, expect, it } from "vitest";
import { evaluar, PIEZAS } from "../../spike/src/engine/pods";
import type { Circuito, Verdict } from "../../spike/src/protocol";
import { aPixel, botonesGaveta, GAVETA, pestanas, CARTEL, LEYENDA_ZONAS, probarActivo, reparadas, retrasoCola, textoProbarEspera, RETO, textoOpcion, textoVolts, vistaDeVeredicto } from "../src/vista";

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

describe("botón Probar", () => {
  it("se apaga sin cambios desde la última prueba y vuelve al cambiar algo", () => {
    expect(probarActivo("470", undefined, false, false)).toBe(true);
    expect(probarActivo("470", "470", false, false)).toBe(false);
    expect(probarActivo("220", "470", false, false)).toBe(true);
    expect(probarActivo(undefined, undefined, false, false)).toBe(false);
    expect(probarActivo("220", "470", true, false)).toBe(false);
    expect(probarActivo("220", "470", false, true)).toBe(false);
  });
});

describe("claridad del Taller", () => {
  it("Probar muestra la cuenta atrás mientras dura el bloqueo", () => {
    expect(textoProbarEspera(5000, 3500)).toBe("Probar · 2 s");
    expect(textoProbarEspera(5000, 5000)).toBe("");
  });
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
