import assert from "node:assert/strict";
import type { Arbiter } from "../arbiter/arbiter.js";
import type { End } from "../protocol.js";
import { createRoom, hostRoom } from "../transport/room.js";
import type { Transport } from "../transport/transport.js";
import { Bot } from "./bot.js";

/**
 * Duelo completo de extremo a extremo (SCRUM-21/22/23/89/129/92): árbitro + dos clientes simulados
 * sobre un Transport real. Falla con AssertionError si algo del flujo no se cumple.
 *  ana: intenta despachar sin reparar (rechazado), falla una vez (su pod 1 no es limpio: 4 llamas) (el rival la ve "penalizado") y luego
 *  repara y despacha los 5 pods (cada despacho es un mensaje "despachar" explícito).
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

    // Ambos reciben el mismo primer pod; ninguno recibe la solución.
    assert.deepEqual(ana.pod, beto.pod);
    assert.ok(!JSON.stringify(ana.log).includes("solucion"));

    // Despachar con zonas sin reparar se rechaza (RF-03).
    const d = ana.dispatch();
    const rj = await ana.until((m) => m.t === "reject" && m.seq === d);
    assert.ok(rj.t === "reject" && rj.reason === "faltan zonas por reparar" && ana.despachados === 0);

    // Un fallo cuesta tiempo y el rival lo ve como "penalizado" (nunca ve la pieza).
    const z = ana.pod!.zonas[0]!;
    const seq = ana.test(z.zona, Bot.answer(z, (v) => v !== "correcto"));
    const r = await ana.until((m) => m.t === "result" && m.seq === seq);
    assert.ok(r.t === "result" && r.veredicto !== "correcto" && r.waitMs >= 2000);
    await beto.until((m) => m.t === "rival" && m.estado === "penalizado");

    // beto despacha 2 pods, se cae y vuelve antes de 30 s con el mismo alias.
    await beto.playUntil(2);
    await beto.t.close();
    await ana.until((m) => m.t === "rival" && m.estado === "sin-conexion");
    const mark = ana.log.length;
    const beto2 = new Bot(mk());
    assert.deepEqual(await beto2.enter(code, "beto"), { t: "welcome", station: "B", alias: "beto", version: 2 });
    const snap = await beto2.until((m) => m.t === "start");
    assert.ok(snap.t === "start" && snap.despachados === 2 && snap.rival?.alias === "ana");
    await ana.until((m) => m.t === "rival" && m.estado === "reparando" && m.despachados === 2, mark);

    // ana termina primero: gana por 5 pods.
    await ana.playUntil(5);
    const [endA, endB] = await Promise.all([ana, beto2].map((b) => b.until((m) => m.t === "end")));
    assert.deepEqual(endA, endB);
    assert.ok(endA?.t === "end" && endA.winner === "A" && endA.score.A?.despachados === 5 && endA.score.B?.despachados === 2);

    const csv = host.arbiter.toCsv();
    assert.ok(csv.startsWith("﻿jugador;intento;zona;piezas;resultado;tiempo_ms;quemada;pod;tiempo_pod_ms;nivel;zona_nombre;pieza_correcta\r\n"));
    assert.match(csv, new RegExp(`\r\nA;1;${z.zona};[^;]+;fallo;\\d+;(no|si);1;;1;[a-z]+;[^;]*\r\n`));
    assert.match(csv, /\r\nA;;;;despacho;\d+;no;5;\d+;1;;\r\n/);
    // ana: 1 fallo + un acierto por zona de los 5 pods; beto: los pods 1 y 2 tienen una zona cada uno;
    // más una fila "despacho" por pod despachado (cronómetro por pod): 5 de ana y 2 de beto.
    const zonas = host.arbiter.pods.reduce((n, p) => n + p.zonas.length, 0);
    assert.equal(csv.trimEnd().split("\r\n").length - 1, 1 + zonas + 2 + 5 + 2);
    // Carrera final: el ganador ya lo decidió el árbitro; cada uno corre uno de sus pods despachados.
    const c = endA.carrera;
    assert.ok(c?.A && c.B && c.A.pod >= 1 && c.A.pod <= 5 && c.B.pod >= 1 && c.B.pod <= 2);
    // ana falló una vez en el pod 1: 4 despachos limpios = 4 llamas; un concepto que repasar.
    assert.ok(c.A.podMs.length === 5 && c.A.llamas === 4 && c.A.repasar.length === 1 && c.A.repasar[0]!.fallos === 1);
    assert.ok(c.B.podMs.length === 2 && c.B.llamas === 2 && c.B.repasar.length === 0);
    return { arbiter: host.arbiter, outcome: endA, csv };
  } finally {
    host.stop();
    await Promise.all(opened.map((t) => t.close()));
  }
}
