import { mkdirSync, mkdtempSync, existsSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Arbiter, LIMITE_MSG_POR_S, SALA_OCIOSA_MS } from "../src/arbiter/arbiter.js";
import { purgarBench } from "../src/docente/retencion.js";
import { generar } from "../src/engine/generador.js";
import { medir } from "../src/engine/medir.js";
import { evaluar, jugadas } from "../src/engine/pods.js";
import { PROTOCOL_VERSION, type ServerMsg } from "../src/protocol.js";

const SEMILLA = 7;
const montar = (opts: ConstructorParameters<typeof Arbiter>[1] = {}) => {
  const o = { t: 0, out: [] as { to: string; m: ServerMsg }[] };
  const arb = new Arbiter((to, m) => o.out.push({ to, m }), { now: () => o.t, semilla: SEMILLA, ...opts });
  const de = (to: string, k: ServerMsg["t"]) => o.out.filter((x) => x.to === to && x.m.t === k).map((x) => x.m);
  return { o, arb, de };
};

describe("versión de protocolo (A1)", () => {
  it("el Welcome lleva PROTOCOL_VERSION (2) al entrar y al reconectar", () => {
    const { arb, de } = montar();
    arb.handle("p1", { t: "hello", alias: "ana" });
    expect(PROTOCOL_VERSION).toBe(2);
    expect(de("p1", "welcome")[0]).toMatchObject({ version: 2 });
    arb.handle("p1", { t: "hello", alias: "ana" });
    expect(de("p1", "welcome")).toHaveLength(2);
    expect(de("p1", "welcome")[1]).toMatchObject({ version: 2 });
  });
});

describe("sala ociosa (M-3)", () => {
  it("un solo jugador sin pareja caduca a los 120 s y avisa; un Listo reinicia el reloj", () => {
    const { o, arb, de } = montar();
    arb.handle("p1", { t: "hello", alias: "ana" });
    o.t = SALA_OCIOSA_MS - 1; arb.tick();
    expect(arb.phase).toBe("esperando");
    arb.handle("p1", { t: "ready" });
    o.t = SALA_OCIOSA_MS + 5000; arb.tick();
    expect(arb.phase).toBe("esperando"); // el Listo reinició el reloj
    o.t = 2 * SALA_OCIOSA_MS - 2; arb.tick();
    expect(arb.phase).toBe("esperando");
    o.t = 2 * SALA_OCIOSA_MS + 5000; arb.tick();
    expect(arb.phase).toBe("anulada");
    expect(arb.outcome).toMatchObject({ phase: "anulada", reason: "sala inactiva" });
    expect(de("p1", "end")).toHaveLength(1);
  });
  it("dos jugadores en «listo» sin pulsar Listo también caducan; una sala vacía no", () => {
    const { o, arb } = montar();
    arb.tick(); o.t = 10 * SALA_OCIOSA_MS; arb.tick();
    expect(arb.phase).toBe("esperando");
    arb.handle("p1", { t: "hello", alias: "ana" }); arb.handle("p2", { t: "hello", alias: "beto" });
    expect(arb.phase).toBe("listo");
    o.t += SALA_OCIOSA_MS; arb.tick();
    expect(arb.phase).toBe("anulada");
  });
  it("una partida en curso nunca caduca por ociosa", () => {
    const { o, arb } = montar();
    arb.handle("p1", { t: "hello", alias: "ana" }); arb.handle("p2", { t: "hello", alias: "beto" });
    arb.handle("p1", { t: "ready" }); arb.handle("p2", { t: "ready" });
    o.t += 3000; arb.tick();
    expect(arb.phase).toBe("jugando");
    o.t += 5 * SALA_OCIOSA_MS; arb.tick();
    expect(arb.phase).toBe("jugando");
  });
});

describe("reconexión tras el fin (M6)", () => {
  it("la ventana de 30 s cuenta desde el fin, no desde la caída", () => {
    const { o, arb, de } = montar({ limitMs: 60_000 });
    arb.handle("p1", { t: "hello", alias: "ana" }); arb.handle("p2", { t: "hello", alias: "beto" });
    arb.handle("p1", { t: "ready" }); arb.handle("p2", { t: "ready" });
    o.t += 3000; arb.tick();
    arb.leave("p2"); // cae al inicio
    o.t += 60_000; arb.tick(); // fin por tiempo, 60 s después de la caída
    expect(arb.phase).toBe("fin");
    o.t += 20_000; // 80 s tras la caída, 20 s tras el fin
    arb.handle("p9", { t: "hello", alias: "beto" });
    expect(de("p9", "welcome")).toHaveLength(1);
    expect(de("p9", "end")).toHaveLength(1);
  });
});

describe("entrada hostil y límite de tasa (B-1, B-3)", () => {
  const jugando = () => {
    const m = montar();
    m.arb.handle("p1", { t: "hello", alias: "ana" }); m.arb.handle("p2", { t: "hello", alias: "beto" });
    m.arb.handle("p1", { t: "ready" }); m.arb.handle("p2", { t: "ready" });
    m.o.t += 3000; m.arb.tick();
    const z = m.arb.pods[0]!.zonas[0]!;
    return { ...m, z, pieza: jugadas(z).find((p) => evaluar(z, p) === "correcto")! };
  };
  it("medir con punto de prototipo no lanza (ni en el motor) y se rechaza", () => {
    const { o, arb, de, z, pieza } = jugando();
    for (const punto of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
      for (const modo of ["continuidad", "tension"] as const) expect(medir(z, pieza, modo, punto)).toBeNull();
      o.t += 4000;
      expect(() => arb.handle("p1", { t: "medir", seq: 1, t0: 0, zone: z.zona, pieza, modo: "tension", punto })).not.toThrow();
    }
    expect(de("p1", "reject").filter((m) => m.t === "reject" && m.reason === "medida no válida")).toHaveLength(5);
  });
  it(`más de ${LIMITE_MSG_POR_S} mensajes por segundo se ignoran sin respuesta; al segundo siguiente vuelve a atender`, () => {
    const { o, arb, de, z, pieza } = jugando();
    const antes = o.out.length;
    for (let i = 0; i < 200; i++) arb.handle("p1", { t: "medir", seq: i, t0: 0, zone: z.zona, pieza, modo: "tension", punto: "x" });
    expect(o.out.length - antes).toBe(LIMITE_MSG_POR_S);
    o.t += 1000;
    arb.handle("p1", { t: "medir", seq: 999, t0: 0, zone: z.zona, pieza, modo: "tension", punto: "x" });
    expect(de("p1", "reject").at(-1)).toMatchObject({ seq: 999 });
    // el rival no se ve afectado
    const n = o.out.length; arb.handle("p2", { t: "despachar", seq: 1, t0: 0 });
    expect(o.out.length).toBeGreaterThan(n);
  });
});

describe("cadena: la gaveta lleva todos los tipos (M-2)", () => {
  it("opciones contiene cada tipo distinto de la cadena en cientos de sorteos", () => {
    let vistas = 0;
    for (let s = 0; s < 150; s++) for (const p of generar(s, 2)) for (const z of p.zonas) {
      if (z.circuito !== "cadena") continue;
      vistas++;
      expect(z.opciones).toHaveLength(4);
      for (const tipo of new Set(z.cadena)) expect(z.opciones).toContain(tipo);
    }
    expect(vistas).toBeGreaterThan(50);
  });
});

describe("retención de bench-out (B-5)", () => {
  it("borra intentos-*.csv con más de 12 meses y deja lo demás", () => {
    const d = mkdtempSync(join(tmpdir(), "bench-")); mkdirSync(d, { recursive: true });
    const ahora = new Date("2026-10-30T12:00:00Z"), vieja = new Date("2025-01-01T00:00:00Z");
    for (const f of ["intentos-ABC123-nivel1-semilla5.csv", "intentos-NUEVO-nivel1-semilla6.csv", "otro.csv"]) writeFileSync(join(d, f), "x");
    for (const f of ["intentos-ABC123-nivel1-semilla5.csv", "otro.csv"]) utimesSync(join(d, f), vieja, vieja);
    expect(purgarBench(d, ahora, 12)).toBe(1);
    expect(existsSync(join(d, "intentos-ABC123-nivel1-semilla5.csv"))).toBe(false);
    expect(existsSync(join(d, "intentos-NUEVO-nivel1-semilla6.csv"))).toBe(true);
    expect(existsSync(join(d, "otro.csv"))).toBe(true);
    expect(purgarBench(join(d, "no-existe"), ahora, 12)).toBe(0);
  });
});
