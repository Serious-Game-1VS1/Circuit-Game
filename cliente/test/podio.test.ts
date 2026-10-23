import { describe, expect, it } from "vitest";
import type { End } from "../../spike/src/protocol";
import { chasis, decision, mmss, podio } from "../src/podio";
import { inicial, reducir } from "../src/pantalla";

const END: End = {
  t: "end", phase: "fin", winner: "B", reason: "5 pods despachados",
  score: { A: { alias: "ana", despachados: 3, quemadas: 1 }, B: { alias: "beto", despachados: 5, quemadas: 0 } },
  carrera: {
    A: { pod: 2, llamas: 1, podMs: [61_000, 95_500, 30_000], repasar: [
      { zona: "reactor", circuito: "fusible", fallos: 3, quemadas: 1 },
      { zona: "radar", circuito: "led", fallos: 1, quemadas: 0 },
      { zona: "cabina", circuito: "cabina", fallos: 1, quemadas: 0 },
    ] },
    B: { pod: 5, llamas: 5, podMs: [10_000, 10_000, 10_000, 10_000, 10_000], repasar: [] },
  },
};

describe("carrera final y podio", () => {
  it("el End con carrera lleva a la carrera; sin carrera o anulada, a Fin", () => {
    expect(reducir(inicial(), END, 0).fase).toBe("carrera");
    expect(reducir({ ...inicial(), fase: "podio" }, END, 0).fase).toBe("podio");
    expect(reducir(inicial(), { ...END, carrera: undefined }, 0).fase).toBe("fin");
    expect(reducir(inicial(), { ...END, phase: "anulada" }, 0).fase).toBe("fin");
  });

  it("explica la decisión con los desempates del árbitro", () => {
    expect(decision(END)).toBe("El ganador ya está decidido: beto.\nbeto despachó sus 5 pods primero.");
    const tiempo = { ...END, reason: "tiempo" };
    expect(decision(tiempo)).toMatch(/despachó más pods/);
    expect(decision({ ...tiempo, score: { A: { alias: "ana", despachados: 2, quemadas: 1 }, B: { alias: "beto", despachados: 2, quemadas: 0 } } })).toMatch(/quemó menos/);
    expect(decision({ ...tiempo, winner: null })).toMatch(/^Empate/);
  });

  it("podio: ganador primero, tiempo total, limpios; qué repasar y pod más lento del jugador", () => {
    const p = podio(END, "A");
    expect(p.filas.map((x) => [x.puesto, x.alias, x.tiempo, x.limpios, x.yo])).toEqual([
      ["1.º", "beto", "0:50", 5, false],
      ["2.º", "ana", "3:06", 1, true],
    ]);
    // Conceptos sin repetir (Radar y Cabina comparten concepto), de más a menos fallos.
    expect(p.repasar).toEqual(["Elegir el fusible", "Frenar la corriente del LED"]);
    expect(p.podLento).toBe("Tu pod más lento fue el 2 (1:35).");
    expect(podio(END, "B")).toMatchObject({ repasar: ["Nada: todo salió a la primera."] });
  });

  it("podio: sin pods despachados, «qué repasar» manda a practicar", () => {
    const sin = { ...END, carrera: undefined, score: { ...END.score, A: { ...END.score.A!, despachados: 0 } } };
    expect(podio(sin, "A").repasar).toEqual(["No despachaste ningún pod. Practica en el modo Practicar."]);
  });

  it("utilidades", () => {
    expect(mmss(0)).toBe("0:00");
    expect(chasis(1)).toBe("pod1_cometa");
    expect(chasis(5)).toBe("pod5_raya");
  });
});
