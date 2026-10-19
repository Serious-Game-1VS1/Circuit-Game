import assert from "node:assert/strict";
import type { Arbiter } from "../arbiter/arbiter.js";
import type { End } from "../protocol.js";
import { createRoom, hostRoom } from "../transport/room.js";
import type { Transport } from "../transport/transport.js";
import { Bot } from "./bot.js";

/**
 * Duelo completo de extremo a extremo (SCRUM-21/22/23/89/129/92): árbitro + dos clientes simulados
 * sobre un Transport real. Falla con AssertionError si algo del flujo no se cumple.
 *  ana: falla una vez (el rival la ve "penalizado") y luego despacha los 5 pods.
 *  beto: despacha 2, se desconecta, vuelve con el mismo alias y recupera su progreso.
 */
export async function simulateDuel(make: () => Transport): Promise<{ arbiter: Arbiter; outcome: End; csv: string }> {
  const opened: Transport[] = [];
  const mk = () => { const t = make(); opened.push(t); return t; };
  const arbT = mk();
  const code = await createRoom(arbT);
  const host = hostRoom(arbT, { countdownMs: 900 });
  try {
    const ana = new Bot(mk()), beto = new Bot(mk());
    assert.equal((await ana.enter(code, "ana")).t, "welcome");
    assert.equal((await beto.enter(code, "beto")).t, "welcome");
    assert.deepEqual([ana.station, beto.station], ["A", "B"]);
    assert.deepEqual(await new Bot(mk()).enter(code, "carla"), { t: "full", reason: "sala completa" });

    // Listo → cuenta 3-2-1 → partida
    ana.ready();
    beto.ready();
    await Promise.all([ana, beto].map((b) => b.until((m) => m.t === "start")));
    const counts = ana.log.flatMap((m) => (m.t === "countdown" ? [m.n] : []));
    assert.deepEqual(counts, [3, 2, 1]);

    // Un fallo cuesta tiempo y el rival lo ve como "penalizado" (nunca ve la pieza).
    const seq = ana.test(0, 1000);
    const r = await ana.until((m) => m.t === "result" && m.seq === seq);
    assert.ok(r.t === "result" && r.veredicto === "poco" && r.waitMs === 2000);
    await beto.until((m) => m.t === "rival" && m.estado === "penalizado");

    // beto despacha 2 pods, se cae y vuelve antes de 30 s con el mismo alias.
    await beto.playUntil(2);
    await beto.t.close();
    await ana.until((m) => m.t === "rival" && m.estado === "sin-conexion");
    const mark = ana.log.length;
    const beto2 = new Bot(mk());
    assert.deepEqual(await beto2.enter(code, "beto"), { t: "welcome", station: "B", alias: "beto" });
    const snap = await beto2.until((m) => m.t === "start");
    assert.ok(snap.t === "start" && snap.despachados === 2 && snap.rival?.alias === "ana");
    await ana.until((m) => m.t === "rival" && m.estado === "reparando" && m.despachados === 2, mark);

    // ana termina primero: gana por 5 pods.
    await ana.playUntil(5);
    const [endA, endB] = await Promise.all([ana, beto2].map((b) => b.until((m) => m.t === "end")));
    assert.deepEqual(endA, endB);
    assert.ok(endA?.t === "end" && endA.winner === "A" && endA.score.A?.despachados === 5 && endA.score.B?.despachados === 2);

    const csv = host.arbiter.toCsv();
    assert.ok(csv.startsWith("﻿jugador;intento;zona;piezas;resultado;tiempo_ms;quemada\r\n"));
    assert.match(csv, /\r\nA;1;0;R=1000;fallo;\d+;no\r\n/);
    assert.equal(csv.trimEnd().split("\r\n").length - 1, 11 + 4); // ana: 1 fallo + 10 aciertos; beto: 4 aciertos
    return { arbiter: host.arbiter, outcome: endA, csv };
  } finally {
    host.stop();
    await Promise.all(opened.map((t) => t.close()));
  }
}
