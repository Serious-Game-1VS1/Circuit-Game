import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSession } from "../src/bench/session.js";
import { LocalTransport, startLocalRelay } from "../src/transport/local.js";
import { Bot } from "../src/sim/bot.js";
import { simulateDuel } from "../src/sim/duel.js";
import { createRoom, hostRoom, joinAsPlayer, newCode, validAlias } from "../src/transport/room.js";
import type { Transport } from "../src/transport/transport.js";

let relay: Awaited<ReturnType<typeof startLocalRelay>>;
const open: Transport[] = [];
const local = () => { const t = new LocalTransport(`ws://localhost:${relay.port}`); open.push(t); return t; };

beforeAll(async () => { relay = await startLocalRelay(0); });
afterAll(async () => { await Promise.all(open.map((t) => t.close())); await relay.close(); });

describe("código de sesión y alias", () => {
  it("genera códigos de 6 caracteres sin caracteres ambiguos", () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });
  it("acepta alias de 1 a 12 caracteres", () => {
    expect(validAlias("a")).toBe(true);
    expect(validAlias("doce_letras!")).toBe(true);
    expect(validAlias("trece_letras!")).toBe(false);
    expect(validAlias("   ")).toBe(false);
    expect(validAlias(5)).toBe(false);
  });
});

describe("transporte local", () => {
  it("no permite crear dos salas con el mismo código ni entrar a una que no existe", async () => {
    const code = await createRoom(local());
    await expect(local().create(code)).rejects.toThrow(/ya existe/);
    await expect(local().join("ZZZZZZ")).rejects.toThrow(/no existe/);
  });

  it("empareja por orden de llegada y rechaza al tercero y al alias inválido", async () => {
    const arb = local();
    const code = await createRoom(arb);
    hostRoom(arb);
    await expect(joinAsPlayer(local(), code, "ana")).resolves.toBe("A");
    await expect(joinAsPlayer(local(), code, "")).rejects.toThrow(/alias/);
    await expect(joinAsPlayer(local(), code, "beto")).resolves.toBe("B");
    await expect(joinAsPlayer(local(), code, "carla")).rejects.toThrow(/completa/);
  });

  it("el árbitro decide: veredicto solo a quien prueba, progreso al rival, basura rechazada", async () => {
    const arb = local();
    const code = await createRoom(arb);
    const host = hostRoom(arb, { countdownMs: 0 });
    const a = new Bot(local()), b = new Bot(local());
    await a.enter(code, "ana");
    await b.enter(code, "beto");
    a.ready();
    b.ready();
    await Promise.all([a, b].map((x) => x.until((m) => m.t === "start")));

    const mark = b.log.length;
    await expect(a.solveNext()).resolves.toMatchObject({ t: "result", veredicto: "correcto" });
    await expect(a.solveNext()).resolves.toMatchObject({ t: "result", despachados: 1 });
    await b.until((m) => m.t === "rival" && m.despachados === 1 && "t0" in m, mark);
    expect(b.log.some((m) => m.t === "result")).toBe(false);

    a.t.send({ t: "test", seq: 7, t0: 0, zone: 1, ohms: "nope" });
    await expect(a.until((m) => m.t === "reject" && m.seq === 7)).resolves.toMatchObject({ reason: "pieza no válida" });
    host.stop();
  });

  it("duelo completo de extremo a extremo con reconexión y CSV (SCRUM-21/22/23/89/92)", async () => {
    const { outcome, csv } = await simulateDuel(local);
    expect(outcome).toMatchObject({ winner: "A", reason: "5 pods despachados" });
    expect(csv.split("\r\n")[0]).toBe("﻿jugador;intento;zona;piezas;resultado;tiempo_ms;quemada");
  }, 20_000);

  it("dos clientes terminan con el mismo estado y se mide RTT", async () => {
    const r = await runSession(local, { durationMs: 600, everyMs: 50, settleMs: 100 });
    expect(r.sameState).toEqual([true]);
    expect(r.own.length).toBeGreaterThan(0);
    expect(r.mirror.length).toBeGreaterThan(0);
  });
});

// Red externa: solo corre si PHOTON_APP_ID está en el entorno (npm test no lee .env a propósito).
describe("transporte Photon", () => {
  it.skipIf(!process.env.PHOTON_APP_ID)("árbitro y dos clientes comparten estado en Photon Cloud", async () => {
    const { PhotonTransport } = await import("../src/transport/photon.js");
    const r = await runSession(() => new PhotonTransport(process.env.PHOTON_APP_ID!, process.env.PHOTON_REGION || "us"), {
      durationMs: 2_000, everyMs: 250, settleMs: 1_500,
    });
    expect(r.sameState).toEqual([true]);
    expect(r.own.length).toBeGreaterThan(0);
  }, 60_000);
});
