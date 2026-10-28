import { describe, expect, it } from "vitest";
import type { End } from "../../spike/src/protocol";
import { chasis, chasisCarril, contraRecord, decision, mmss, podio } from "../src/podio";
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
    expect(decision(END)).toBe("Ganó beto.\nbeto despachó sus 5 pods primero.");
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

  it("podio: un fallo de placa/cables nombra su concepto, nunca el del LED", () => {
    const cables = { luces: "Luces en paralelo", interruptor: "interruptor", fusible: "fusible", invertido: "polaridad", abierto: "circuito abierto" } as const;
    for (const [circuito, texto] of Object.entries(cables)) {
      const end: End = { ...END, carrera: { A: { pod: 4, llamas: 3, podMs: [1, 1, 1, 1], repasar: [{ zona: "cabina", circuito: circuito as keyof typeof cables, fallos: 1, quemadas: 0 }] } } };
      const r = podio(end, "A").repasar;
      expect(r).toHaveLength(1);
      expect(r[0]).toContain(texto);
      expect(r[0]).not.toMatch(/LED$|resistenc/i);
    }
  });

  it("podio: nivel 2 nombra su concepto", () => {
    const textos = { combinar: "paralelo", divisor: "divisor", protegido: "en serie" } as const;
    for (const [circuito, texto] of Object.entries(textos)) {
      const end: End = { ...END, carrera: { A: { pod: 4, llamas: 3, podMs: [1, 1, 1, 1], repasar: [{ zona: "radar", circuito: circuito as keyof typeof textos, fallos: 1, quemadas: 0 }] } } };
      expect(podio(end, "A").repasar).toEqual([expect.stringContaining(texto)]);
    }
  });

  it("podio: sin pods despachados,«qué repasar» manda a practicar", () => {
    const sin = { ...END, carrera: undefined, score: { ...END.score, A: { ...END.score.A!, despachados: 0 } } };
    expect(podio(sin, "A").repasar).toEqual(["No despachaste ningún pod. Practica en el modo Practicar."]);
  });

  it("utilidades", () => {
    expect(mmss(0)).toBe("0:00");
    expect(chasis(1)).toBe("pod1_cometa");
    expect(chasis(5)).toBe("pod5_raya");
  });

  it("mi carril usa mi mejor nave; sin ella, el pod que corre", () => {
    expect(chasisCarril(2, 4)).toBe("pod4_yunque");
    expect(chasisCarril(2, 0)).toBe("pod2_burbuja");
    expect(chasisCarril(3)).toBe("pod3_aguijon");
  });

  it("carrera contra tu récord: igualarlo gana; sin marca previa es el primero", () => {
    expect(contraRecord(180_000, 200_000)).toBe("gana");
    expect(contraRecord(200_000, 200_000)).toBe("gana");
    expect(contraRecord(200_001, 200_000)).toBe("pierde");
    expect(contraRecord(180_000)).toBe("primero");
  });
});


import { TXT, tarjetasRecompensa } from "../src/podio";

describe("tarjetas de recompensas y regla del podio", () => {
  const base = { xp: 80, insignias: [], rango: null, habilidades: [], naves: [] };
  it("la regla cabe en 2 líneas de 42 letras (escala 2 en 360 px)", () => {
    const l = TXT.regla.split("\n");
    expect(l).toHaveLength(2);
    expect(Math.max(...l.map((x) => x.length))).toBeLessThanOrEqual(42);
  });
  it("sin novedades hay una tarjeta; las insignias van al final y destacadas", () => {
    expect(tarjetasRecompensa(base)).toHaveLength(1);
    const t = tarjetasRecompensa({ ...base, naves: ["Raya"], nivel2: true, insignias: [{ id: "a", nombre: "A", descripcion: "x", cumple: () => true }] });
    expect(t.map((x) => !!x.destacada)).toEqual([false, false, true]);
  });
  it("nunca pasa de 5 tarjetas y resume las insignias de más", () => {
    const ins = Array.from({ length: 7 }, (_, i) => ({ id: `i${i}`, nombre: `I${i}`, descripcion: "d", cumple: () => true }));
    const t = tarjetasRecompensa({ ...base, naves: ["R"], nivel2: true, insignias: ins });
    expect(t).toHaveLength(5);
    expect(t[4]!.titulo).toBe("Y 3 insignias más");
  });
});
