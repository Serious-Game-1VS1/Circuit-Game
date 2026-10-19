import { beforeEach, describe, expect, it } from "vitest";
import { Arbiter } from "../src/arbiter/arbiter.js";
import { answer, verdict } from "../src/engine/pods.js";
import type { ServerMsg } from "../src/protocol.js";

/**
 * El árbitro es la única fuente de verdad (RNF-06). Reloj falso y mensajes capturados: sin red ni timers.
 * Reescrito para el duelo 1v1: el árbitro anterior (estaciones A/B sobre un pod compartido, engine/pod.ts)
 * correspondía al diseño cooperativo descartado; sus garantías equivalentes se prueban abajo
 * (acción mal formada o ajena se rechaza, cada jugador ve solo lo suyo).
 */
let t: number;
let out: { to: string; m: ServerMsg }[];
let arb: Arbiter;
const sent = (to: string) => out.filter((o) => o.to === to).map((o) => o.m);
const last = (to: string, k: ServerMsg["t"]) => sent(to).filter((m) => m.t === k).at(-1);

beforeEach(() => {
  t = 0;
  out = [];
  arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t });
});

const lobby = () => { arb.handle("p1", { t: "hello", alias: "ana" }); arb.handle("p2", { t: "hello", alias: "beto" }); };
const play = () => {
  lobby();
  arb.handle("p1", { t: "ready" });
  arb.handle("p2", { t: "ready" });
  t += 3000;
  arb.tick();
};
const test = (peer: string, zone: number, ohms: number, seq = 1) => arb.handle(peer, { t: "test", seq, t0: 0, zone, ohms });
const solvePod = (peer: string) => { test(peer, 0, answer("led")); test(peer, 1, answer("cabina")); };

describe("pods de ejemplo (motor circuit.ts)", () => {
  it("reto LED: solo 470 Ω es correcto; 220 Ω quema", () => {
    expect([100, 220, 470, 1000].map((o) => verdict("led", o))).toEqual(["se quema", "se quema", "correcto", "poco"]);
  });
  it("cabina en paralelo: la corriente se reparte, 220 Ω es correcto", () => {
    expect([100, 220, 470, 1000].map((o) => verdict("cabina", o))).toEqual(["se quema", "correcto", "poco", "poco"]);
  });
});

describe("sala: alias, Listo y cuenta 3-2-1 (SCRUM-21, SCRUM-22)", () => {
  it("empareja A/B por llegada, rechaza alias inválido, repetido y tercer jugador", () => {
    arb.handle("p1", { t: "hello", alias: "" });
    expect(last("p1", "full")).toEqual({ t: "full", reason: "alias de 1 a 12 caracteres" });
    arb.handle("p1", { t: "hello", alias: " ana " });
    arb.handle("p2", { t: "hello", alias: "ana" });
    expect(last("p2", "full")).toMatchObject({ reason: "alias en uso" });
    arb.handle("p2", { t: "hello", alias: "beto" });
    arb.handle("p3", { t: "hello", alias: "carla" });
    expect(last("p1", "welcome")).toEqual({ t: "welcome", station: "A", alias: "ana" });
    expect(last("p2", "welcome")).toMatchObject({ station: "B" });
    expect(last("p3", "full")).toMatchObject({ reason: "sala completa" });
    expect(arb.phase).toBe("listo");
  });

  it("cuando ambos pulsan Listo: 3, 2, 1 y empieza; nadie puede probar antes", () => {
    lobby();
    arb.handle("p1", { t: "ready" });
    expect(arb.phase).toBe("listo");
    test("p1", 0, 470);
    expect(last("p1", "reject")).toMatchObject({ reason: "la partida no está en juego" });
    arb.handle("p2", { t: "ready" });
    expect(arb.phase).toBe("cuenta");
    for (const ms of [999, 1, 999, 1, 999, 1]) { t += ms; arb.tick(); }
    expect(sent("p2").filter((m) => m.t === "countdown").map((m) => m.t === "countdown" && m.n)).toEqual([3, 2, 1]);
    expect(arb.phase).toBe("jugando");
    expect(last("p1", "start")).toMatchObject({ despachados: 0, total: 5, pod: { numero: 1 }, rival: { alias: "beto", estado: "reparando" } });
  });

  it("si alguien se va durante la cuenta, se cancela y se libera el asiento", () => {
    lobby();
    arb.handle("p1", { t: "ready" });
    arb.handle("p2", { t: "ready" });
    arb.leave("p2");
    expect(arb.phase).toBe("esperando");
    expect(last("p1", "lobby")).toMatchObject({ players: [{ alias: "ana", ready: false }] });
  });
});

describe("reparar pods con penalizaciones (SCRUM-129, SCRUM-90)", () => {
  beforeEach(play);

  it("el veredicto viene del árbitro y nunca trae la solución ni cifras", () => {
    test("p1", 0, 1000);
    const r = last("p1", "result");
    expect(r).toMatchObject({ zona: 0, veredicto: "poco", waitMs: 2000, despachados: 0 });
    expect(JSON.stringify(sent("p1"))).not.toMatch(/470|amps|volts/);
  });

  it("enfriamiento por zona, 'sin cambios' y piezas fuera de catálogo", () => {
    test("p1", 0, 1000);
    test("p1", 0, 470, 2);
    expect(last("p1", "reject")).toMatchObject({ seq: 2, reason: "enfriamiento", waitMs: 2000 });
    t += 2000;
    test("p1", 0, 1000, 3);
    expect(last("p1", "reject")).toMatchObject({ seq: 3, reason: "sin-cambios" });
    test("p1", 0, 5, 4);
    expect(last("p1", "reject")).toMatchObject({ seq: 4, reason: "pieza no válida" });
    test("p1", 9, 470, 5);
    expect(last("p1", "reject")).toMatchObject({ seq: 5, reason: "zona no válida" });
    arb.handle("p1", { t: "test", zone: "x" });
    expect(last("p1", "reject")).toMatchObject({ reason: "zona no válida" });
  });

  it("quemar bloquea 4 s todo el pod y el rival ve 'penalizado' hasta que pasa", () => {
    test("p1", 0, 220);
    expect(last("p1", "result")).toMatchObject({ veredicto: "se quema", waitMs: 4000 });
    test("p1", 1, 220, 2);
    expect(last("p1", "reject")).toMatchObject({ reason: "quemada" });
    expect(last("p2", "rival")).toMatchObject({ alias: "ana", estado: "penalizado", despachados: 0 });
    t += 4000;
    arb.tick();
    expect(last("p2", "rival")).toMatchObject({ estado: "reparando" });
  });

  it("reparar todas las zonas despacha el pod y el rival ve el progreso (SCRUM-23)", () => {
    solvePod("p1");
    expect(last("p1", "result")).toMatchObject({ despachados: 1, pod: { numero: 2, zonas: [{ reparada: false }, { reparada: false }] } });
    expect(last("p2", "rival")).toEqual({ t: "rival", alias: "ana", despachados: 1, estado: "reparando", t0: 0 });
    expect(sent("p2").some((m) => m.t === "result")).toBe(false);
  });
});

describe("fin, desempate y reconexión (SCRUM-89)", () => {
  beforeEach(play);

  it("gana el primero en despachar 5; lo que llega después ya no cuenta", () => {
    for (let i = 0; i < 4; i++) { solvePod("p1"); solvePod("p2"); }
    solvePod("p2");
    solvePod("p1");
    expect(arb.outcome).toMatchObject({ phase: "fin", winner: "B", reason: "5 pods despachados", score: { A: { despachados: 4 }, B: { despachados: 5 } } });
    expect(last("p1", "end")).toEqual(last("p2", "end"));
  });

  it("al agotar el tiempo: más pods, luego menos quemadas, luego empate", () => {
    solvePod("p1");
    t += 12 * 60_000;
    arb.tick();
    expect(arb.outcome).toMatchObject({ winner: "A", reason: "tiempo" });
  });

  it("desempate por menos piezas quemadas", () => {
    test("p1", 0, 100);
    t += 12 * 60_000;
    arb.tick();
    expect(arb.outcome).toMatchObject({ winner: "B", score: { A: { quemadas: 1 }, B: { quemadas: 0 } } });
  });

  it("empate si todo es igual", () => {
    t += 12 * 60_000;
    arb.tick();
    expect(arb.outcome).toMatchObject({ winner: null, reason: "tiempo" });
  });

  it("quien vuelve antes de 30 s recupera su estado; el reloj sigue corriendo", () => {
    solvePod("p2");
    arb.leave("p2");
    arb.tick();
    expect(last("p1", "rival")).toMatchObject({ estado: "sin-conexion", despachados: 1 });
    t += 29_999;
    arb.handle("p9", { t: "hello", alias: "beto" });
    expect(last("p9", "welcome")).toMatchObject({ station: "B" });
    expect(last("p9", "start")).toMatchObject({ despachados: 1, restanteMs: 12 * 60_000 - 29_999, rival: { alias: "ana" } });
    expect(last("p1", "rival")).toMatchObject({ estado: "reparando" });
    solvePod("p9");
    expect(last("p9", "result")).toMatchObject({ despachados: 2 });
  });

  it("después de 30 s ya no se recupera el asiento", () => {
    arb.leave("p2");
    t += 30_000;
    arb.handle("p9", { t: "hello", alias: "beto" });
    expect(last("p9", "full")).toMatchObject({ reason: "tiempo de reconexión agotado" });
    expect(arb.phase).toBe("jugando");
  });

  it("si ambos faltan 30 s la partida se anula", () => {
    arb.leave("p1");
    t += 10_000;
    arb.leave("p2");
    t += 29_999;
    arb.tick();
    expect(arb.phase).toBe("jugando");
    t += 1;
    arb.tick();
    expect(arb.phase).toBe("anulada");
    expect(arb.outcome).toMatchObject({ phase: "anulada", winner: null });
  });
});

describe("registro por intento (SCRUM-92)", () => {
  it("CSV con ambos jugadores, sin alias, tiempo desde el inicio", () => {
    play();
    t += 1500;
    test("p1", 0, 1000);
    test("p2", 0, 470);
    expect(arb.toCsv()).toBe(
      "﻿jugador;intento;zona;piezas;resultado;tiempo_ms;quemada\r\n" +
        "A;1;0;R=1000;fallo;1500;no\r\n" +
        "B;1;0;R=470;ok;1500;no\r\n",
    );
  });

  it("sin intentos solo trae la cabecera", () => {
    expect(arb.toCsv()).toBe("﻿jugador;intento;zona;piezas;resultado;tiempo_ms;quemada\r\n");
  });
});
