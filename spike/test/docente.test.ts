import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Arbiter } from "../src/arbiter/arbiter.js";
import { borrarVivo, escribirJsonAtomico, guardarPartida, guardarSesiones, guardarVivo, leerJson, leerSesiones, listarPartidas, listarVivo, rutaCsv } from "../src/docente/almacen.js";
import { fallosPorZona } from "../src/docente/analitica.js";
import { partidaDe, vivoDe } from "../src/docente/registro.js";
import type { Partida } from "../src/docente/types.js";
import { evaluar } from "../src/engine/pods.js";
import type { PodView, ServerMsg } from "../src/protocol.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "docente-")); process.env.DOCENTE_DATA = dir; });
afterEach(() => { delete process.env.DOCENTE_DATA; rmSync(dir, { recursive: true, force: true }); });

const partida = (id: string, inicio: string, extra: Partial<Partida> = {}): Partida => ({
  id, sala: "ABC234", nivel: 1, semilla: 1, demo: false, inicio, fin: inicio, fase: "fin", ganador: "A", motivo: "tiempo", jugadores: [], ...extra,
});

describe("almacén", () => {
  it("escribe atómico: sobrescribe y no deja temporales", () => {
    const f = join(dir, "x", "a.json");
    escribirJsonAtomico(f, { v: 1 });
    escribirJsonAtomico(f, { v: 2 });
    expect(leerJson(f, null)).toEqual({ v: 2 });
    expect(readdirSync(join(dir, "x"))).toEqual(["a.json"]);
    expect(leerJson(join(dir, "no.json"), "def")).toBe("def");
  });

  it("guarda y lista partidas (recientes primero) con su CSV; vivo y sesiones", () => {
    guardarPartida(partida("a", "2026-10-01T10:00:00.000Z"), "csv-a");
    guardarPartida(partida("b", "2026-10-02T10:00:00.000Z"), "csv-b");
    expect(listarPartidas().map((p) => p.id)).toEqual(["b", "a"]);
    expect(readFileSync(rutaCsv("a"), "utf8")).toBe("csv-a");
    const v = { sala: "S1", fase: "jugando" as const, restanteMs: 5, jugadores: [], actualizado: "x" };
    guardarVivo(v);
    expect(listarVivo()).toEqual([v]);
    borrarVivo("S1");
    expect(listarVivo()).toEqual([]);
    expect(leerSesiones()).toEqual([]);
    guardarSesiones([{ codigo: "C1", nivel: 2, creada: "x", estado: "abierta" }]);
    expect(leerSesiones()).toHaveLength(1);
  });
});

describe("analítica de fallos", () => {
  it("suma por zona/circuito, ignora demos y ordena por fallos", () => {
    const j = (repasar: Partida["jugadores"][number]["repasar"]) => ({ estacion: "A" as const, alias: "x", despachados: 0, quemadas: 0, repasar, podMs: [] });
    const r = (zona: "radar" | "cabina", fallos: number, quemadas = 0) => ({ zona, circuito: "led" as const, fallos, quemadas });
    const t = fallosPorZona([
      partida("1", "a", { jugadores: [j([r("radar", 2, 1)]), j([r("radar", 1), r("cabina", 5)])] }),
      partida("2", "b", { demo: "cableado", jugadores: [j([r("radar", 99)])] }),
    ]);
    expect(t).toEqual([
      { zona: "cabina", circuito: "led", fallos: 5, quemadas: 0, jugadores: 1 },
      { zona: "radar", circuito: "led", fallos: 3, quemadas: 1, jugadores: 2 },
    ]);
  });
});

describe("árbitro -> Partida y vivo", () => {
  let t = 0;
  const out: { to: string; m: ServerMsg }[] = [];
  const mk = (practica = false) => new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: 7, practica });
  const pod = (peer: string) => out.filter((o) => o.to === peer).flatMap((o) => (o.m.t === "start" || o.m.t === "result" || o.m.t === "despachado" ? [o.m.pod] : [])).at(-1) as PodView;
  const test = (a: Arbiter, peer: string, zone: number, pieza: string) => a.handle(peer, { t: "test", seq: 1, t0: 0, zone, pieza });
  const solve = (a: Arbiter, peer: string) => {
    for (const z of pod(peer).zonas) test(a, peer, z.zona, z.opciones.find((p) => evaluar(z, p) === "correcto")!);
    a.handle(peer, { t: "despachar", seq: 1, t0: 0 });
  };

  it("al terminar una partida genera la Partida esperada; el vivo no trae piezas", () => {
    t = 0; out.length = 0;
    const a = mk();
    a.handle("p1", { t: "hello", alias: "ana" });
    a.handle("p2", { t: "hello", alias: "beto" });
    a.handle("p1", { t: "ready" }); a.handle("p2", { t: "ready" });
    t += 3000; a.tick();
    const z = pod("p1").zonas[0]!;
    test(a, "p1", z.zona, z.opciones.find((p) => evaluar(z, p) !== "correcto")!);
    t += 10_000; a.tick();
    expect(vivoDe(a, "S", 0)).toMatchObject({ sala: "S", fase: "jugando", restanteMs: 12 * 60_000 - 10_000, jugadores: [{ alias: "ana", estado: "reparando" }, { alias: "beto", despachados: 0 }] });
    expect(JSON.stringify(vivoDe(a, "S", 0))).not.toMatch(/solucion|semilla|pieza/);
    for (let i = 0; i < 5; i++) { t += 20_000; solve(a, "p1"); }
    expect(a.phase).toBe("fin");
    const p = partidaDe(a, "ABC234", Date.UTC(2026, 9, 1, 10), Date.UTC(2026, 9, 1, 10, 5));
    expect(p).toMatchObject({ id: "20261001T100000-ABC234", sala: "ABC234", semilla: 7, nivel: 1, demo: false, fase: "fin", ganador: "A", motivo: "5 pods despachados" });
    expect(p.jugadores.map((j) => [j.alias, j.despachados])).toEqual([["ana", 5], ["beto", 0]]);
    expect(p.jugadores[0]!.podMs).toHaveLength(5);
    expect(p.jugadores[0]!.repasar).toHaveLength(1);
    expect(p.sesion).toBe("ABC234");
    const csv = a.toCsv().trimEnd().split("\r\n");
    expect(csv[0]).toMatch(/;nivel;zona_nombre;pieza_correcta$/);
    expect(csv[1]!.split(";").slice(-3)).toEqual(["1", expect.stringMatching(/^(radar|cabina|turbina|reactor)$/), expect.any(String)]);
    guardarPartida(p, a.toCsv());
    expect(listarPartidas()).toEqual([p]);
    expect(existsSync(rutaCsv(p.id))).toBe(true);
  });

  it("la práctica no tiene CSV con intentos ni carrera (serve no escribe nada si arbiter.practica)", () => {
    t = 0; out.length = 0;
    const a = mk(true);
    a.handle("p1", { t: "hello", alias: "ana" });
    expect(a.practica).toBe(true);
    expect(a.vivo().restanteMs).toBe(0);
    for (let i = 0; i < 5; i++) solve(a, "p1");
    expect(a.outcome).not.toHaveProperty("carrera");
  });
});
