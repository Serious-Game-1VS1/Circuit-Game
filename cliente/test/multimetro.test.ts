import { describe, expect, it } from "vitest";
import type { Medida } from "../../spike/src/protocol";
import { anguloTension, AYUDA_USO, ayudaPrimerasVeces, textoDial, VECES_AYUDA, leerMedida, luzValidacion, lecturaLista, MEDIR_MS, textoMedida, textoModo } from "../src/multimetro";

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
    expect(textoMedida(tension(1, "toda"), "divisor")).toMatch(/nodo medio/);
    expect(textoMedida(tension(1, "toda"), "divisor")).not.toMatch(/9 V|casi toda/); // en el medio con R2 = R1 queda la mitad: no se revela la solución
    expect(textoMedida(tension(1, "toda"), "protegido")).toMatch(/diodo, el LED y la resistencia/);
    expect(textoMedida(tension(1, "toda"), "divisor")).not.toMatch(/cortado/);
    expect(textoMedida(tension(1, "toda"), "protegido")).not.toMatch(/cortado/);
    expect(textoModo("continuidad")).toMatch(/^Batería desconectada/);
  });

  it("Reactor: el multímetro no promete amperios y la lectura del fusible se explica", () => {
    const cont = (pasa: boolean): Medida => ({ t: "medida", seq: 1, t0: 0, zona: 1, modo: "continuidad", punto: "pieza", pasa });
    expect(textoModo("tension", "fusible")).toMatch(/cortó solo/);
    expect(textoMedida(cont(true), "fusible")).toMatch(/no dice cuánto aguanta/);
    expect(textoMedida({ ...cont(true), punto: "carga1" }, "fusible")).toMatch(/^Pasa: la corriente/);
  });
});

describe("luz de validación", () => {
  it("apagado sin veredicto; verde correcto; ámbar poco/demasiado; rojo si se quema", () => {
    expect(luzValidacion(undefined)).toBeNull();
    expect(luzValidacion({ aguja: null, quemado: false })).toBeNull();
    expect(luzValidacion({ aguja: null, quemado: false, cortocircuito: true })).toBe("rojo"); // un corto es rojo, no apagado
    expect(luzValidacion({ aguja: "correcto", quemado: false })).toBe("verde");
    expect(luzValidacion({ aguja: "poco", quemado: false })).toBe("ambar");
    expect(luzValidacion({ aguja: "demasiado", quemado: false })).toBe("ambar");
    expect(luzValidacion({ aguja: "demasiado", quemado: true })).toBe("rojo");
  });
});

describe("lectura con cifra, estado y luz", () => {
  const tv = (voltios: number, t: Medida["tension"], dial?: Medida["dial"]): Medida => ({ ...tension(voltios / 9, t), voltios, ...(dial && { dial }) });
  const o = { circuito: "led", volts: 9 };
  it("cifra con unidad y estado «más / menos / igual que antes» frente a la lectura previa", () => {
    expect(leerMedida(tv(6.3, "parte", "correcto"), o)).toMatchObject({ cifra: "6,3 V", luz: "verde", voltios: 6.3 });
    expect(leerMedida(tv(6.3, "parte"), { ...o, previa: 2 }).estado).toMatch(/^Más que antes \(antes 2 V\)/);
    expect(leerMedida(tv(1.5, "parte"), { ...o, previa: 2 }).estado).toMatch(/^Menos que antes/);
    expect(leerMedida(tv(2.01, "parte"), { ...o, previa: 2 }).estado).toMatch(/^Igual que antes/);
  });
  it("sin voltios exactos usa la fracción de la batería", () => {
    expect(leerMedida(tension(0.5, "parte"), { circuito: "led", volts: 4.5 }).cifra).toBe("2,3 V");
  });
  it("continuidad: cerrado (con Ω si es una resistencia) o abierto", () => {
    const c = (pasa: boolean, ohmios?: number): Medida => ({ t: "medida", seq: 1, t0: 0, zona: 1, modo: "continuidad", punto: "pieza", pasa, ohmios });
    expect(leerMedida({ ...c(true, 470), dial: "correcto" }, o)).toMatchObject({ cifra: "Cerrado 470 Ω", luz: "verde", estado: expect.stringMatching(/^Pasa\. LED correcto/) });
    expect(leerMedida({ ...c(false), dial: "poco" }, o)).toMatchObject({ cifra: "Abierto", luz: "ambar", estado: expect.stringMatching(/^No pasa/) });
  });
  it("la luz es UNA función del dial del árbitro: correcto verde, poco ámbar, demasiado rojo, sin zona gris (en todas las familias)", () => {
    for (const circuito of ["led", "cabina", "invertido", "abierto", "combinar", "divisor", "protegido", "cadena", "luces", "interruptor", "fusible"]) {
      for (const [dial, luz] of [["correcto", "verde"], ["poco", "ambar"], ["demasiado", "rojo"]] as const) {
        expect(leerMedida(tv(5, "parte", dial), { ...o, circuito }).luz, `${circuito} ${dial}`).toBe(luz);
        expect(textoDial(circuito, dial), `${circuito} ${dial}`).toBeTruthy();
      }
      expect(leerMedida(tv(5, "parte"), { ...o, circuito }).luz).toBe("gris");
    }
    expect(leerMedida(tv(0, "nada", "correcto"), o).luz).toBe("verde"); // ni «parte» ni «nada» deciden el color: solo el dial
    expect(leerMedida(tv(9, "toda", "poco"), { ...o, circuito: "abierto" }).luz).toBe("ambar");
  });
  it("el texto lo dice con palabras", () => {
    expect(leerMedida(tv(5, "parte", "poco"), o).estado).toMatch(/LED con poca luz/);
    expect(leerMedida(tv(5, "parte", "correcto"), o).estado).toMatch(/LED correcto/);
    expect(leerMedida(tv(5, "parte", "demasiado"), o).estado).toMatch(/LED se quema/);
    expect(leerMedida(tv(9, "toda", "poco"), { ...o, circuito: "abierto" }).estado).toMatch(/Circuito abierto/);
  });
});

describe("ayuda de uso del multímetro", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it("se ofrece solo las primeras VECES_AYUDA veces por perfil (sin distinguir mayúsculas) y no con otro alias", () => {
    const a = mem();
    const veces = Array.from({ length: VECES_AYUDA + 2 }, () => ayudaPrimerasVeces("Ana", a));
    expect(veces).toEqual([true, true, true, false, false]);
    expect(ayudaPrimerasVeces(" ana ", a)).toBe(false);
    expect(ayudaPrimerasVeces("Beto", a)).toBe(true);
  });
  it("sin almacenamiento o si falla, no se repite", () => {
    expect(ayudaPrimerasVeces("Ana", null)).toBe(false);
    expect(ayudaPrimerasVeces("Ana", { getItem: () => { throw new Error("bloqueado"); }, setItem: () => {} })).toBe(false);
  });
  it("explica cada modo y que medir no cuesta intento, y no revela el contenido del pod", () => {
    const t = AYUDA_USO.lineas.join(" ");
    expect(t).toMatch(/TENSIÓN/); expect(t).toMatch(/CONTINUIDAD/); expect(t).toMatch(/NO gasta intento/);
    expect(`${t} ${AYUDA_USO.chispa}`).not.toMatch(/\d+ ?Ω|fusible|resistencia de/i);
  });
});
