import { describe, expect, it } from "vitest";
import { generar } from "../../spike/src/engine/generador";
import { actual, avanzar, esFin, esUltimo, iniciar, MECANICAS, mecanica, permite, saltar, siguiente, textoPaso, type EstadoTut } from "../src/tutorial";

const base: EstadoTut = { modo: null, medido: false, quemado: false, reparada: false, despachados: 0, pruebas: 0, medidas: 0 };
const e = (x: Partial<EstadoTut>): EstadoTut => ({ ...base, ...x });
const zonaDe = (id: string) => { const m = mecanica(id)!; return generar(m.semilla, m.nivel, false)[m.pod]!.zonas; };

/** Qué fija la semilla de cada mecánica: familia, solución y opciones que usan los textos. */
const SEMILLAS: Record<string, { circuito: string; volts?: number; r1?: number; solucion: string; opciones: string[] }> = {
  resistencia: { circuito: "led", volts: 9, solucion: "470", opciones: ["100", "470", "1000"] },
  multimetro: { circuito: "led", volts: 9, solucion: "470", opciones: ["220", "470", "1000"] },
  fusible: { circuito: "fusible", solucion: "1", opciones: ["0.5", "1", "3"] },
  invertido: { circuito: "invertido", solucion: "directa", opciones: ["directa", "inversa"] },
  abierto: { circuito: "abierto", solucion: "empalmar", opciones: ["dejar", "empalmar"] },
  placa: { circuito: "luces", solucion: "paralelo", opciones: ["paralelo", "puente", "serie"] },
  turbina: { circuito: "interruptor", solucion: "serie", opciones: ["paralelo", "serie"] },
  combinar: { circuito: "combinar", volts: 9, solucion: "serie", opciones: ["paralelo", "serie", "una"] },
  divisor: { circuito: "divisor", r1: 220, solucion: "220", opciones: ["1000", "220", "470"] },
  protegido: { circuito: "protegido", volts: 6, solucion: "220", opciones: ["100", "1000", "220"] },
};

/** Un estado por paso (menos el último): el que confirma ese paso, con los contadores como los lleva el Taller. */
const ESTADOS: Record<string, EstadoTut[]> = {
  resistencia: [e({ elegida: "1000" }), e({ elegida: "1000", aguja: "poco" }), e({ elegida: "100" }), e({ elegida: "100", quemado: true }), e({ elegida: "470" }), e({ elegida: "470", reparada: true }), e({ despachados: 1 })],
  multimetro: [e({ elegida: "1000" }), e({ modo: "tension" }), e({ modo: "tension", medido: true }), e({ modo: "continuidad", medidas: 1 }), e({ elegida: "470" }), e({ reparada: true }), e({ despachados: 1 })],
  fusible: [e({ elegida: "3" }), e({ elegida: "3", quemado: true }), e({ elegida: "1" }), e({ elegida: "1", reparada: true }), e({ despachados: 1 })],
  invertido: [e({ elegida: "inversa" }), e({ pruebas: 1 }), e({ modo: "continuidad" }), e({ modo: "continuidad", medidas: 1 }), e({ elegida: "directa" }), e({ reparada: true }), e({ despachados: 1 })],
  abierto: [e({ elegida: "dejar" }), e({ modo: "continuidad" }), e({ modo: "continuidad", medidas: 1 }), e({ elegida: "empalmar" }), e({ reparada: true }), e({ despachados: 1 })],
  placa: [e({ falta: "cablear" }), e({ falta: null }), e({ falta: null, reparada: true }), e({ despachados: 1 })],
  turbina: [e({ falta: "cablear" }), e({ falta: null }), e({ falta: null, reparada: true }), e({ despachados: 1 })],
  combinar: [e({ elegida: "una" }), e({ elegida: "una", quemado: true }), e({ elegida: "paralelo" }), e({ elegida: "paralelo", quemado: true, pruebas: 1 }), e({ elegida: "serie" }), e({ elegida: "serie", reparada: true }), e({ despachados: 1 })],
  divisor: [e({ elegida: "470" }), e({ elegida: "470", modo: "tension" }), e({ elegida: "470", modo: "tension", medido: true }), e({ elegida: "220", modo: "tension", medido: true }), e({ elegida: "220", modo: "tension", medido: true, medidas: 1 }), e({ elegida: "220", reparada: true }), e({ despachados: 1 })],
  protegido: [e({ elegida: "100" }), e({ elegida: "100", quemado: true }), e({ elegida: "100", quemado: true, modo: "tension" }), e({ elegida: "100", quemado: true, modo: "tension", medido: true }), e({ elegida: "220" }), e({ elegida: "220", reparada: true }), e({ despachados: 1 })],
};

describe("mini-tutoriales por mecánica", () => {
  it("son 10, en orden, con ids únicos y datos válidos", () => {
    expect(MECANICAS.map((m) => m.id)).toEqual(["resistencia", "multimetro", "fusible", "invertido", "abierto", "placa", "turbina", "combinar", "divisor", "protegido"]);
    expect(new Set(MECANICAS.map((m) => m.id)).size).toBe(10);
    for (const m of MECANICAS) {
      expect(m.nombre.length, m.id).toBeLessThanOrEqual(12);
      expect(m.ensena, m.id).not.toBe("");
      expect([1, 2]).toContain(m.nivel);
      expect(m.pod, m.id).toBeGreaterThanOrEqual(0);
      expect(m.pod, m.id).toBeLessThanOrEqual(4);
    }
    expect(mecanica("nada")).toBeUndefined();
  });

  it("cada tutorial tiene 4-8 pasos, textos <= 70 caracteres y solo el último es fin", () => {
    for (const m of MECANICAS) {
      expect(m.pasos.length, m.id).toBeGreaterThanOrEqual(4);
      expect(m.pasos.length, m.id).toBeLessThanOrEqual(8);
      m.pasos.forEach((p, k) => {
        expect(p.texto.length, `${m.id} ${p.titulo}`).toBeLessThanOrEqual(70);
        expect(!!p.fin, `${m.id} ${k}`).toBe(k === m.pasos.length - 1);
      });
    }
  });

  it("siguiente() encadena los 10 y el último no tiene siguiente", () => {
    const orden: string[] = [];
    for (let id: string | null = MECANICAS[0]!.id; id; id = siguiente(id)) orden.push(id);
    expect(orden).toEqual(MECANICAS.map((m) => m.id));
    expect(siguiente("protegido")).toBeNull();
    expect(siguiente("nada")).toBeNull();
  });

  describe.each(MECANICAS.map((m) => m.id))("%s", (id) => {
    it("la semilla da un pod con UNA zona de la familia, con la solución y las opciones del texto", () => {
      const m = mecanica(id)!, z = zonaDe(id), esp = SEMILLAS[id]!;
      expect(z).toHaveLength(1);
      expect(m.circuito).toBe(esp.circuito);
      expect(z[0]).toMatchObject({ circuito: esp.circuito, solucion: esp.solucion, ...(esp.volts && { volts: esp.volts }), ...(esp.r1 && { r1: esp.r1 }) });
      expect([...z[0]!.opciones].sort()).toEqual([...esp.opciones].sort());
    });

    it("recorre los pasos con estados sintéticos hasta el final (un paso por llamada)", () => {
      const estados = ESTADOS[id]!;
      let t = iniciar(id);
      expect(t.id).toBe(id);
      expect(estados).toHaveLength(t.pasos.length - 1);
      estados.forEach((s, k) => {
        expect(avanzar(t, s).i, `${id} paso ${k + 1} ${actual(t).titulo}`).toBe(k + 1);
        t = avanzar(t, s);
      });
      expect(esUltimo(t) && esFin(t)).toBe(true);
      expect(textoPaso(t)).toBe(`${mecanica(id)!.nombre.toUpperCase()} ${t.pasos.length}/${t.pasos.length} ¡Listo!`);
      expect(avanzar(t, e({ despachados: 5 }))).toBe(t); // el último solo se deja con sus botones
    });

    it("elegir y probar casi a la vez: el pod ya reparado lleva a Despacha y, despachado, al cierre", () => {
      const sol = SEMILLAS[id]!.solucion, rep = e({ elegida: sol, reparada: true, falta: null });
      let t = iniciar(id), ms = 0;
      for (let n = 0; n < 20 && actual(t).pide !== "despachar" && !esFin(t); n++) t = avanzar(t, rep, (ms += 1500));
      expect(actual(t).pide, `${id} no llegó a Despacha`).toBe("despachar");
      expect(permite(iniciar(id), "despachar", rep), `${id} deja despachar desde el paso 1`).not.toBeNull();
      for (let n = 0; n < 5 && !esFin(t); n++) t = avanzar(t, e({ despachados: 1, reparada: true }), (ms += 1500));
      expect(esFin(t), `${id} sin cierre`).toBe(true);
    });

    it("no avanza con el estado inicial vacío", () => {
      const t = iniciar(id);
      expect(avanzar(t, base)).toBe(t);
    });
  });

  it("iniciar con un id desconocido falla", () => {
    expect(() => iniciar("nada")).toThrow();
  });
});

describe("mecánica del tutorial", () => {
  it("avanza solo con la acción pedida (otra resistencia no vale)", () => {
    const t = iniciar("resistencia");
    expect(avanzar(t, e({ elegida: "470" })).i).toBe(0);
    expect(avanzar(t, e({ elegida: "1000" })).i).toBe(1);
  });

  it("probar → quemado: cada número se muestra ≥1,4 s y en orden, aunque la condición ya se cumpla", () => {
    const est = (ms: number): Partial<EstadoTut> => ms < 7000 ? { elegida: "100", aguja: "poco" } : { elegida: "100", quemado: true, aguja: "demasiado" };
    let t = avanzar(avanzar(iniciar("resistencia"), e({ elegida: "1000" }), 2000), e({ aguja: "poco" }), 4000); // paso 3 desde t=4000
    const vistos: { n: number; desde: number; hasta: number }[] = [];
    for (let ms = 4000; ms < 12000; ms += 16) {
      const antes = t.i;
      t = avanzar(t, e(est(ms)), ms);
      if (t.i !== antes) { vistos.at(-1)!.hasta = ms; vistos.push({ n: t.i + 1, desde: ms, hasta: Infinity }); }
      else if (!vistos.length) vistos.push({ n: t.i + 1, desde: 4000, hasta: Infinity });
    }
    expect(vistos.map((v) => v.n)).toEqual([3, 4, 5]);
    vistos.slice(0, -1).forEach((v) => expect(v.hasta - v.desde).toBeGreaterThanOrEqual(1400));
    expect(vistos[1]!.desde).toBeGreaterThanOrEqual(5400);
  });

  it("solo deja elegir la pieza del paso y Probar en los pasos de Probar", () => {
    const t = iniciar("resistencia");
    expect(permite(t, { elegir: "1000" })).toBeNull();
    expect(permite(t, { elegir: "470" })).toBe("Ahora toca: Frena la corriente");
    expect(permite(t, "probar")).not.toBeNull();
    const t2 = avanzar(t, e({ elegida: "1000" }));
    expect(permite(t2, "probar")).toBeNull();
    expect(permite(t2, { elegir: "100" })).not.toBeNull();
  });

  it("jugador rápido: con el paso cumplido acepta la acción del siguiente (<1,4 s), pero no la de dos pasos más allá", () => {
    const t = avanzar(iniciar("resistencia"), base, 0);
    const elegida = e({ elegida: "1000" });
    expect(permite(t, "probar", elegida)).toBeNull();
    expect(permite(t, "probar", base)).not.toBeNull();
    expect(permite(t, { elegir: "100" }, elegida)).not.toBeNull();
    expect(avanzar(t, elegida, 100)).toBe(t);
  });

  it("elegir y Probar en el mismo cuadro (<50 ms): el estado se calcula al hacer clic", () => {
    let elegida: string | undefined;
    const estado = (): EstadoTut => e({ elegida });
    const t0 = iniciar("fusible");
    const idx = t0.pasos.findIndex((p) => typeof p.pide === "object" && t0.pasos[t0.pasos.indexOf(p) + 1]?.pide === "probar");
    const t = { ...t0, i: idx, desde: 0 };
    const pide = (t.pasos[idx]!.pide as { elegir: string }).elegir;
    expect(permite(t, { elegir: pide }, estado())).toBeNull();
    elegida = pide;
    expect(permite(t, "probar", estado())).toBeNull();
    expect(avanzar(t, estado(), 40)).toBe(t);
    expect(permite(t, { elegir: "otra" }, estado())).not.toBeNull();
  });

  it("saltar lo desactiva, libera todo y no pierde el paso", () => {
    const t = saltar(avanzar(iniciar("resistencia"), e({ elegida: "1000" })));
    expect(t.activo).toBe(false);
    expect(actual(t).titulo).toBe("Prueba");
    expect(permite(t, { elegir: "470" })).toBeNull();
    expect(permite(null, "probar")).toBeNull();
  });

  it("el último paso deja usar el botón Despachar y todo lo demás", () => {
    const t = { ...iniciar("placa"), i: mecanica("placa")!.pasos.length - 1 };
    expect(permite(t, "despachar")).toBeNull();
  });

  it("un quemado anterior no hace avanzar la «Prueba» del paralelo; hace falta un veredicto nuevo", () => {
    const i = iniciar("combinar").pasos.findIndex((p) => p.titulo === "Prueba" && p.texto.includes("110"));
    const s = e({ elegida: "paralelo", quemado: true });
    let t = avanzar({ ...iniciar("combinar"), i: i - 1, desde: 0 }, { ...s, pruebas: 1 }, 5000);
    expect(t.i).toBe(i);
    expect(avanzar(t, { ...s, pruebas: 1 }, 9000)).toBe(t);
    t = avanzar(t, { ...s, pruebas: 2 }, 9000);
    expect(t.i).toBe(i + 1);
  });

  it("una prueba hecha en la ventana de <1,4 s (jugador rápido) sí cuenta", () => {
    const i = iniciar("combinar").pasos.findIndex((p) => p.titulo === "Prueba" && p.texto.includes("110"));
    const t0 = { ...iniciar("combinar"), i: i - 1, desde: 0 };
    const s = e({ elegida: "paralelo", quemado: true });
    avanzar(t0, { ...s, pruebas: 1 }, 100);
    const t = avanzar(t0, { ...s, pruebas: 2 }, 2000);
    expect(t.i).toBe(i);
    expect(avanzar(t, { ...s, pruebas: 2 }, 4000).i).toBe(i + 1);
  });

  it("«Mide otra» del divisor exige una lectura nueva", () => {
    const i = iniciar("divisor").pasos.findIndex((p) => p.titulo === "Mide otra");
    const s = e({ elegida: "220", medido: true, modo: "tension", medidas: 1 });
    const t = avanzar({ ...iniciar("divisor"), i: i - 1, desde: 0 }, s, 5000);
    expect(avanzar(t, s, 9000)).toBe(t);
    expect(avanzar(t, { ...s, medidas: 2 }, 9000).i).toBe(i + 1);
  });

  it("la continuidad exige medir DESPUÉS de elegir el modo (una lectura vieja no vale)", () => {
    const i = iniciar("abierto").pasos.findIndex((p) => p.titulo === "Mide");
    const s = e({ elegida: "dejar", modo: "continuidad", medidas: 1 });
    const t = avanzar({ ...iniciar("abierto"), i: i - 1, desde: 0 }, s, 5000);
    expect(avanzar(t, s, 9000)).toBe(t);
    expect(avanzar(t, { ...s, medidas: 2 }, 9000).i).toBe(i + 1);
  });
});
