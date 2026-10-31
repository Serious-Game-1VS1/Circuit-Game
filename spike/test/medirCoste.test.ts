import { describe, expect, it } from "vitest";
import { Arbiter, MEDIR_COMPETITIVO_MS, MEDIR_MS } from "../src/arbiter/arbiter";
import { generar } from "../src/engine/generador";
import type { ServerMsg } from "../src/protocol";

/** Coste de medir: lo fija el árbitro por modo (1 s práctica/tutorial, 3 s en 1v1 y contra el bot) y rechaza medir antes de tiempo. */
function partida(medirMs?: number, practica = false) {
  let t = 0;
  const out: ServerMsg[] = [];
  const arb = new Arbiter((to, m) => { if (to === "p1") out.push(m); }, { now: () => t, semilla: 7, practica, ...(medirMs && { medirMs }) });
  arb.handle("p1", { t: "hello", alias: "ana" });
  if (!practica) { arb.handle("p2", { t: "hello", alias: "beto" }); arb.handle("p1", { t: "ready" }); arb.handle("p2", { t: "ready" }); t += 3000; arb.tick(); }
  const z = generar(7, 1)[0]!.zonas[0]!;
  let seq = 0;
  const medir = () => { arb.handle("p1", { t: "medir", seq: ++seq, t0: 0, zone: z.zona, pieza: z.opciones[0], modo: "tension", punto: "pieza" }); return out.at(-1)!; };
  return { medir, avanzar: (ms: number) => { t += ms; }, arb };
}

describe("coste de medir", () => {
  it("por defecto 1000 (práctica/tutorial) y 3000 en las partidas competitivas", () => {
    expect(MEDIR_MS).toBe(1000);
    expect(partida(undefined, true).arb.medirMs).toBe(1000);
    expect(partida(MEDIR_COMPETITIVO_MS).arb.medirMs).toBe(3000);
    expect(partida(MEDIR_COMPETITIVO_MS).medir()).toMatchObject({ t: "medida", medirMs: 3000 });
    expect(partida(undefined, true).medir()).toMatchObject({ t: "medida", medirMs: 1000 });
  });
  it("rechaza medir otra vez antes de que pase el coste y acepta después", () => {
    const p = partida(MEDIR_COMPETITIVO_MS);
    expect(p.medir().t).toBe("medida");
    p.avanzar(1000);
    expect(p.medir()).toMatchObject({ t: "reject", reason: "el multímetro sigue midiendo" });
    p.avanzar(2000);
    expect(p.medir().t).toBe("medida");
  });
});
