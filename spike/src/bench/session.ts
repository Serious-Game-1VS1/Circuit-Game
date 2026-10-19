import { Bot } from "../sim/bot.js";
import { createRoom, hostRoom } from "../transport/room.js";
import type { Transport } from "../transport/transport.js";
import { pct } from "./stats.js";

/**
 * Corre `rooms` duelos reales: el árbitro crea cada sala con un código y dos bots entran, pulsan
 * Listo y juegan. Mide, sobre el transporte que se le pase:
 *  - RTT (decisión del árbitro): intento -> veredicto recibido por quien lo hizo.
 *  - Reflejo en el rival: intento de un jugador -> progreso recibido por el OTRO.
 * Todo corre en un proceso con el mismo reloj, así que no hay desfase entre emisor y receptor.
 */
export interface SessionResult {
  own: number[];
  mirror: number[];
  /** Por sala: cada jugador ve del rival los mismos pods despachados que el árbitro le cuenta al rival. */
  sameState: boolean[];
}

export { pct };

export const row = (name: string, xs: number[], goal: number) => {
  const p95 = pct(xs, 95);
  return `${name.padEnd(30)} n=${String(xs.length).padStart(4)}  p50=${pct(xs, 50).toFixed(2)} ms  p95=${p95.toFixed(2)} ms  máx=${Math.max(...xs).toFixed(2)} ms  meta<=${goal} ms  ${p95 <= goal ? "CUMPLE" : "NO CUMPLE"}`;
};

export async function runSession(
  make: () => Transport,
  { rooms = 1, durationMs = 10_000, everyMs = 250, settleMs = 1_000 } = {},
): Promise<SessionResult> {
  const all: Transport[] = [];
  const hosts: { stop: () => void }[] = [];
  const duels: Bot[][] = [];

  try {
    for (let r = 0; r < rooms; r++) {
      const arb = make();
      all.push(arb);
      const code = await createRoom(arb);
      hosts.push(hostRoom(arb, { countdownMs: 0 }));
      const bots: Bot[] = [];
      for (const alias of ["ana", "beto"]) {
        const b = new Bot(make());
        all.push(b.t);
        await b.enter(code, alias);
        bots.push(b);
      }
      for (const b of bots) b.ready();
      await Promise.all(bots.map((b) => b.until((m) => m.t === "start")));
      duels.push(bots);
    }

    const timer = setInterval(() => { for (const b of duels.flat()) void b.solveNext().catch(() => {}); }, everyMs);
    await new Promise((r) => setTimeout(r, durationMs));
    clearInterval(timer);
    await new Promise((r) => setTimeout(r, settleMs));

    const sameState = duels.map(([a, b]) => a!.rival?.despachados === b!.despachados && b!.rival?.despachados === a!.despachados);
    return { own: duels.flat().flatMap((b) => b.own), mirror: duels.flat().flatMap((b) => b.mirror), sameState };
  } finally {
    for (const h of hosts) h.stop();
    await Promise.all(all.map((t) => t.close()));
  }
}
