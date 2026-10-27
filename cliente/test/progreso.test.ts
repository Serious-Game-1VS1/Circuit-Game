import { describe, expect, it } from "vitest";
import type { Carril } from "../../spike/src/protocol";
import { inicial, type Pantalla } from "../src/pantalla";
import { casillas, MAX_LLAMAS, PUNTOS, puntosDe, puntosPod, rachaLlamas, textoGlobo, textoObjetivo, textoPod, tiempoPod } from "../src/progreso";
import { podio } from "../src/podio";
import { reparadas } from "../src/vista";

const carril = (llamas: number): Carril => ({ pod: 1, llamas, podMs: [], repasar: [] });
const pod = (...rep: boolean[]) => ({
  numero: 2,
  zonas: rep.map((reparada, i) => ({ zona: i, nombre: (["radar", "cabina", "turbina", "reactor"] as const)[i]!, circuito: "led" as const, volts: 5, opciones: [], reparada })),
});
const pantalla = (...rep: boolean[]): Pantalla => ({ ...inicial(), fase: "taller", pod: pod(...rep) });

describe("puntaje provisional", () => {
  it("0 pods = 0 puntos y 5 pods limpios = 600", () => {
    expect(puntosDe({ alias: "a", despachados: 0, quemadas: 0 })).toBe(0);
    expect(puntosDe({ alias: "a", despachados: 5, quemadas: 0 }, carril(5))).toBe(5 * PUNTOS.pod + 5 * PUNTOS.limpio);
  });
  it("suma limpios, resta quemadas y no baja de 0", () => {
    expect(puntosDe({ alias: "a", despachados: 3, quemadas: 2 }, carril(1))).toBe(300 + 20 - 20);
    expect(puntosDe({ alias: "a", despachados: 0, quemadas: 4 })).toBe(0);
  });
  it("puntos por despachar un pod", () => {
    expect(puntosPod(false)).toBe(100);
    expect(puntosPod(true)).toBe(120);
    expect(puntosPod(true, true)).toBe(100); // práctica: sin carrera, sin bono (coherente con el XP)
  });
  it("el podio trae el puntaje de cada jugador", () => {
    const f = podio({ t: "end", phase: "fin", winner: "A", reason: "tiempo", score: { A: { alias: "a", despachados: 2, quemadas: 1 }, B: { alias: "b", despachados: 0, quemadas: 0 } }, carrera: { A: carril(1), B: carril(0) } }, "A").filas;
    expect(f.map((x) => x.puntos)).toEqual([210, 0]);
  });
});

describe("progreso del Taller", () => {
  it("textoPod sin total (Oleadas) no lo muestra", () => {
    expect(textoPod(7, 0)).toBe("Pod 7");
  });

  it("textoPod no pasa del total", () => {
    expect(textoPod(2, 5)).toBe("Pod 2/5");
    expect(textoPod(6, 5)).toBe("Pod 5/5");
  });
  it("casillas n/5", () => {
    expect(casillas(2, 5)).toEqual([true, true, false, false, false]);
    expect(casillas(0, 5).some(Boolean)).toBe(false);
  });
  it("el globo usa reparadas() del pod", () => {
    const p = pod(true, false, false);
    expect(textoGlobo(p.zonas[1]!, p)).toBe(`Cabina: Enciende el LED sin quemarlo
${reparadas(p)}`);
    expect(textoGlobo(p.zonas[1]!, p)).toContain("Zonas reparadas: 1/3");
  });
  it("objetivo con las zonas que faltan", () => {
    expect(textoObjetivo(pantalla(true, false, false))).toBe("Objetivo: repara Cabina, Turbina");
    expect(textoObjetivo(pantalla(true, true))).toBe("Objetivo: despacha el pod");
  });
});

describe("racha de llamas y cronómetro del pod", () => {
  it("un pod limpio suma una llama (tope 5) y uno con fallos la rompe a 0", () => {
    expect(rachaLlamas(0, true)).toBe(1);
    expect(rachaLlamas(MAX_LLAMAS, true)).toBe(MAX_LLAMAS);
    expect(rachaLlamas(3, false)).toBe(0);
  });
  it("tiempoPod cuenta hacia arriba en m:ss y no baja de 0", () => {
    expect(tiempoPod(0)).toBe("0:00");
    expect(tiempoPod(59_999)).toBe("0:59");
    expect(tiempoPod(125_000)).toBe("2:05");
    expect(tiempoPod(-5)).toBe("0:00");
  });
});
