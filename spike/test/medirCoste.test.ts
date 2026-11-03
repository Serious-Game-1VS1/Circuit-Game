import { describe, expect, it } from "vitest";
import { Arbiter, costeMedir, ESCALA_COSTE_MEDIR, MEDIR_COMPETITIVO_MS, MEDIR_MS } from "../src/arbiter/arbiter";
import { generar } from "../src/engine/generador";
import type { ServerMsg } from "../src/protocol";

/** Pods de la prueba: uno con 2+ zonas (para el reinicio al cambiar de zona; solo salen al final de la partida) y uno de 1 zona. */
const SEM = 7;
const TODOS = generar(SEM, 1);
const PODS = [TODOS.find((x) => x.zonas.length >= 2) ?? TODOS[0]!, TODOS[0]!];

/** Coste de medir: lo fija el árbitro por modo (1 s práctica/tutorial, 3 s en 1v1 y contra el bot) y rechaza medir antes de tiempo. */
function partida(medirMs?: number, practica = false) {
  let t = 0;
  const out: ServerMsg[] = [];
  const arb = new Arbiter((to, m) => { if (to === "p1") out.push(m); }, { now: () => t, semilla: SEM, practica, pods: PODS, ...(medirMs && { medirMs }) });
  arb.handle("p1", { t: "hello", alias: "ana" });
  if (!practica) { arb.handle("p2", { t: "hello", alias: "beto" }); arb.handle("p1", { t: "ready" }); arb.handle("p2", { t: "ready" }); t += 3000; arb.tick(); }
  const z = PODS[0]!.zonas[0]!;
  let seq = 0;
  const z2 = PODS[0]!.zonas[1];
  const medirDe = (peer: string, zz = z) => { arb.handle(peer, { t: "medir", seq: ++seq, t0: 0, zone: zz.zona, pieza: zz.opciones[0], modo: "tension", punto: "pieza" }); return out.at(-1)!; };
  const medir = () => medirDe("p1");
  return { medir, medirDe, z, z2, out, avanzar: (ms: number) => { t += ms; }, arb };
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

describe("coste creciente de medir en la misma zona (M-1)", () => {
  const costes = (p: ReturnType<typeof partida>, n: number) => Array.from({ length: n }, () => { const m = p.medir() as { medirMs: number }; p.avanzar(7000); return m.medirMs; });
  it("la escala es 1 / 1,25 / 1,5 sobre medirMs y se queda en 1,5", () => {
    expect(ESCALA_COSTE_MEDIR).toEqual([1, 1.25, 1.5]);
    expect([0, 1, 2, 3, 9].map((n) => costeMedir(3000, n))).toEqual([3000, 3750, 4500, 4500, 4500]);
    expect(costes(partida(MEDIR_COMPETITIVO_MS), 4)).toEqual([3000, 3750, 4500, 4500]);
  });
  it("Medida trae proxMs (coste de la siguiente) y el contador es por zona", () => {
    const p = partida(MEDIR_COMPETITIVO_MS);
    expect(p.z2).toBeDefined();
    expect(p.medir()).toMatchObject({ medirMs: 3000, proxMs: 3750 });
    p.avanzar(7000);
    expect(p.medirDe("p1", p.z2!)).toMatchObject({ zona: p.z2!.zona, medirMs: 3000, proxMs: 3750 }); // otra zona: reinicia
    p.avanzar(7000);
    expect(p.medir()).toMatchObject({ medirMs: 3750, proxMs: 4500 });
  });
  it("el rechazo usa el coste real de la medida anterior (con tolerancia de 250 ms)", () => {
    const p = partida(MEDIR_COMPETITIVO_MS);
    p.medir(); p.avanzar(3000); p.medir(); // la 2.ª cuesta 3750
    p.avanzar(3400);
    expect(p.medir()).toMatchObject({ t: "reject", reason: "el multímetro sigue midiendo" });
    p.avanzar(200); // 3600 >= 3750 - 250
    expect(p.medir()).toMatchObject({ t: "medida", medirMs: 4500 }); // el rechazo no contó como medida
  });
  it("mismas reglas para p2", () => {
    const p = partida(MEDIR_COMPETITIVO_MS);
    for (let i = 0; i < 3; i++) { p.medirDe("p2"); p.avanzar(7000); }
    p.medirDe("p1");
    expect(p.out.at(-1)).toMatchObject({ medirMs: 3000 }); // el contador de p1 no lo toca p2
  });
  it("el contador se reinicia al despachar el pod (aunque sea la misma zona)", () => {
    const p = partida(MEDIR_COMPETITIVO_MS);
    p.medir(); p.avanzar(7000); p.medir(); p.avanzar(7000);
    for (const zz of PODS[0]!.zonas) { p.arb.handle("p1", { t: "test", seq: 90, t0: 0, zone: zz.zona, pieza: zz.solucion }); p.avanzar(7000); }
    p.arb.handle("p1", { t: "despachar", seq: 91, t0: 0 });
    const z1 = PODS[1]!.zonas[0]!;
    p.arb.handle("p1", { t: "medir", seq: 92, t0: 0, zone: z1.zona, pieza: z1.opciones[0], modo: "tension", punto: "pieza" });
    expect(p.out.at(-1)).toMatchObject({ t: "medida", medirMs: 3000, proxMs: 3750 });
  });
  it("tutorial/práctica/oleadas (medirMs 1000) no crecen", () => {
    expect(costes(partida(undefined, true), 3)).toEqual([1000, 1000, 1000]);
    expect(costes(partida(MEDIR_MS), 3)).toEqual([1000, 1000, 1000]);
    expect(partida(undefined, true).medir()).not.toHaveProperty("proxMs");
  });
  it("tras reconectar el snapshot trae el coste de la próxima por zona y la base", () => {
    let t = 0;
    const out: ServerMsg[] = [];
    const arb = new Arbiter((to, m) => { if (to === "p1b") out.push(m); }, { now: () => t, semilla: SEM, pods: PODS, medirMs: MEDIR_COMPETITIVO_MS });
    arb.handle("p1", { t: "hello", alias: "ana" }); arb.handle("p2", { t: "hello", alias: "beto" }); arb.handle("p1", { t: "ready" }); arb.handle("p2", { t: "ready" }); t += 3000; arb.tick();
    const z = PODS[0]!.zonas[0]!;
    arb.handle("p1", { t: "medir", seq: 1, t0: 0, zone: z.zona, pieza: z.opciones[0], modo: "tension", punto: "pieza" });
    t += 3000;
    arb.handle("p1", { t: "medir", seq: 2, t0: 0, zone: z.zona, pieza: z.opciones[0], modo: "tension", punto: "pieza" });
    arb.leave("p1"); t += 1000;
    arb.handle("p1b", { t: "hello", alias: "ana" });
    expect(out.find((m) => m.t === "start")).toMatchObject({ medirBase: 3000, proxMedir: { [z.zona]: 4500 } });
  });
});

describe("costes totales con la escala suave", () => {
  it("cadena de 4 piezas = 15750 ms; 10 medidas en una zona = 42750 ms", () => {
    const suma = (n: number) => Array.from({ length: n }, (_, i) => costeMedir(3000, i)).reduce((a, b) => a + b, 0);
    expect(suma(4)).toBe(15750);
    expect(suma(10)).toBe(42750);
  });
});
