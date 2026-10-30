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
  // Cadena a 9 V: cable, LED, resistencia, cable; la muerta es la resistencia (hueco 3), que se cambia por el repuesto de 470 Ω.
  cadena: { circuito: "cadena", volts: 9, solucion: "3:r470", opciones: ["r100", "r470", "cable", "r220"] },
  placa: { circuito: "luces", solucion: "paralelo", opciones: ["paralelo", "puente", "serie"] },
  turbina: { circuito: "interruptor", solucion: "serie", opciones: ["paralelo", "serie"] },
  combinar: { circuito: "combinar", volts: 9, solucion: "serie", opciones: ["paralelo", "serie", "una"] },
  divisor: { circuito: "divisor", r1: 220, solucion: "220", opciones: ["1000", "220", "470"] },
  protegido: { circuito: "protegido", volts: 6, solucion: "220", opciones: ["100", "1000", "220"] },
};

/** Un estado por paso (menos el último): el que confirma ese paso, con los contadores como los lleva el Taller. */
const ESTADOS: Record<string, EstadoTut[]> = {
  resistencia: [e({ elegida: "1000" }), e({ elegida: "1000", aguja: "poco" }), e({ elegida: "100", quemado: true }), e({ elegida: "100", quemado: true }), e({ elegida: "470", reparada: true }), e({ despachados: 1 })],
  multimetro: [e({ elegida: "1000" }), e({ modo: "tension" }), e({ modo: "tension", medido: true }), e({ modo: "continuidad", medidas: 1 }), e({ elegida: "470", reparada: true }), e({ despachados: 1 })],
  fusible: [e({ elegida: "3", quemado: true }), e({ modo: "tension" }), e({ modo: "tension", medido: true }), e({ elegida: "1", reparada: true }), e({ despachados: 1 })],
  cadena: [e({ modo: "continuidad" }), e({ modo: "continuidad", medidas: 1 }), e({ modo: "continuidad", medidas: 2, localizada: true }), e({ elegida: "3:r470", reparada: true }), e({ despachados: 1 })],
  placa: [e({ falta: "cablear" }), e({ falta: null }), e({ modo: "tension" }), e({ modo: "tension", medido: true }), e({ falta: null, reparada: true }), e({ despachados: 1 })],
  turbina: [e({ falta: "cablear" }), e({ falta: null }), e({ falta: null, reparada: true }), e({ despachados: 1 })],
  combinar: [e({ elegida: "una", quemado: true }), e({ modo: "continuidad" }), e({ modo: "continuidad", medidas: 1 }), e({ elegida: "paralelo", quemado: true, pruebas: 1 }), e({ elegida: "serie", reparada: true }), e({ despachados: 1 })],
  divisor: [e({ elegida: "470" }), e({ elegida: "470", modo: "tension" }), e({ elegida: "470", modo: "tension", medido: true }), e({ elegida: "220", reparada: true }), e({ despachados: 1 })],
  protegido: [e({ elegida: "100", quemado: true }), e({ modo: "tension" }), e({ modo: "tension", medido: true }), e({ elegida: "220", reparada: true }), e({ despachados: 1 })],
};

describe("mini-tutoriales por mecánica", () => {
  it("son 9, en orden, con ids únicos y datos válidos", () => {
    expect(MECANICAS.map((m) => m.id)).toEqual(["resistencia", "multimetro", "fusible", "cadena", "placa", "turbina", "combinar", "divisor", "protegido"]);
    expect(new Set(MECANICAS.map((m) => m.id)).size).toBe(9);
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

  it("siguiente() encadena los 9 y el último no tiene siguiente", () => {
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

    it("cubre el multímetro: la luz y al menos una lectura (o el paso del multímetro)", () => {
      expect(mecanica(id)!.pasos.some((p) => ["multimetro", "tension", "pieza", "carga"].includes(p.objetivo)), id).toBe(true);
    });

    it("arrastrar y probar casi a la vez: el pod ya reparado lleva a CHECK y, despachado, al cierre", () => {
      const sol = SEMILLAS[id]!.solucion, rep = e({ elegida: sol, reparada: true, falta: null });
      let t = iniciar(id), ms = 0;
      const ultima = "check"; // todas las mecánicas cierran con CHECK
      for (let n = 0; n < 20 && actual(t).pide !== ultima && !esFin(t); n++) t = avanzar(t, rep, (ms += 1500));
      expect(actual(t).pide, `${id} no llegó a CHECK`).toBe(ultima);
      expect(permite(iniciar(id), ultima, rep), `${id} deja CHECK desde el paso 1`).not.toBeNull();
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

  it("solo deja arrastrar la pieza del paso; CHECK solo en sus pasos", () => {
    const t = iniciar("fusible");
    expect(permite(t, { arrastrar: "3" })).toBeNull();
    expect(permite(t, { arrastrar: "1" })).toBe("Ahora toca: Fusible grueso");
    expect(permite(t, "check")).not.toBeNull();
    const t2 = { ...t, i: t.pasos.findIndex((p) => typeof p.pide === "object" && p.pide.arrastrar === "1") };
    expect(permite(t2, { arrastrar: "1" })).toBeNull();
    expect(permite(t2, { arrastrar: "3" })).not.toBeNull();
  });

  it("resistencia: arrastrar solo la pieza del paso; CHECK solo en su paso", () => {
    const t = iniciar("resistencia");
    expect(permite(t, { arrastrar: "1000" })).toBeNull();
    expect(permite(t, { arrastrar: "470" })).toBe("Ahora toca: Falta la resistencia");
    expect(permite(t, "check")).not.toBeNull();
    const ck = { ...t, i: t.pasos.findIndex((p) => p.pide === "check") };
    expect(permite(ck, "check")).toBeNull();
    expect(permite({ ...ck, i: ck.i - 1 }, "check", e({ reparada: true }))).toBeNull(); // jugador rápido: ya en verde, pulsa CHECK antes de 1,4 s
    expect(permite({ ...ck, i: ck.i - 1 }, "check", base)).not.toBeNull();
  });

  it("CHECK solo termina con el pod despachado; reparada no basta para saltar su paso", () => {
    const t = { ...iniciar("resistencia"), i: iniciar("resistencia").pasos.findIndex((p) => p.pide === "check"), desde: 0 };
    expect(avanzar(t, e({ reparada: true }), 5000)).toBe(t);
    expect(avanzar(t, e({ despachados: 1 }), 5000).i).toBe(t.i + 1);
  });

  it("jugador rápido: con el paso cumplido acepta la acción del siguiente (<1,4 s), pero no la de dos pasos más allá", () => {
    const t = { ...iniciar("resistencia"), i: 1, desde: 0 }; // «Multímetro» (ámbar); el siguiente pide arrastrar 100 Ω
    const ambar = e({ elegida: "1000", aguja: "poco" });
    expect(permite(t, { arrastrar: "100" }, ambar)).toBeNull();
    expect(permite(t, { arrastrar: "100" }, base)).not.toBeNull();
    expect(permite(t, "check", ambar)).not.toBeNull();
    expect(avanzar(t, ambar, 100)).toBe(t);
  });

  it("saltar lo desactiva, libera todo y no pierde el paso", () => {
    const t = saltar(avanzar(iniciar("resistencia"), e({ elegida: "1000" })));
    expect(t.activo).toBe(false);
    expect(actual(t).titulo).toBe("Multímetro");
    expect(permite(t, { arrastrar: "470" })).toBeNull();
    expect(permite(null, "check")).toBeNull();
  });

  it("el último paso deja usar CHECK y todo lo demás", () => {
    const t = { ...iniciar("placa"), i: mecanica("placa")!.pasos.length - 1 };
    expect(permite(t, "check")).toBeNull();
    expect(permite(t, { arrastrar: "x" })).toBeNull();
  });

  it("un quemado anterior no hace avanzar «En paralelo»; hace falta un veredicto nuevo", () => {
    const i = iniciar("combinar").pasos.findIndex((p) => p.titulo === "En paralelo");
    const s = e({ elegida: "paralelo", quemado: true });
    let t = { ...iniciar("combinar"), i, desde: 0, p0: 1 }; // el quemado de «Una sola» ya contó
    expect(avanzar(t, { ...s, pruebas: 1 }, 5000)).toBe(t);
    t = avanzar(t, { ...s, pruebas: 2 }, 9000);
    expect(t.i).toBe(i + 1);
  });

  it("una prueba hecha en la ventana de <1,4 s (jugador rápido) sí cuenta", () => {
    const i = iniciar("combinar").pasos.findIndex((p) => p.titulo === "En paralelo");
    const t0 = { ...iniciar("combinar"), i: i - 1, desde: 0 };
    const medido = e({ elegida: "una", quemado: true, modo: "continuidad", medidas: 1, pruebas: 1 });
    avanzar(t0, medido, 100);
    const t = avanzar(t0, { ...medido, elegida: "paralelo", pruebas: 2 }, 2000);
    expect(t.i).toBe(i);
    expect(avanzar(t, { ...medido, elegida: "paralelo", pruebas: 2 }, 4000).i).toBe(i + 1);
  });

  it("la continuidad exige medir DESPUÉS de elegir el modo (una lectura vieja no vale)", () => {
    const i = iniciar("cadena").pasos.findIndex((p) => p.titulo === "Mide una");
    const s = e({ modo: "continuidad", medidas: 1 });
    const t = avanzar({ ...iniciar("cadena"), i: i - 1, desde: 0 }, s, 5000);
    expect(avanzar(t, s, 9000)).toBe(t);
    expect(avanzar(t, { ...s, medidas: 2 }, 9000).i).toBe(i + 1);
  });
});
