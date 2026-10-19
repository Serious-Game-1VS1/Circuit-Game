import { randomInt } from "node:crypto";
import { Arbiter, type ArbiterOptions } from "../arbiter/arbiter.js";
import type { Hello, ServerMsg, Station } from "../protocol.js";
import type { Transport } from "./transport.js";

export { validAlias } from "../protocol.js";
export type { ServerMsg } from "../protocol.js";

// Sin 0/O/1/I/L para que el código se pueda dictar en el aula.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** Crea una sala con un código nuevo; si el código ya existe (create falla), prueba con otro. */
export async function createRoom(t: Transport, tries = 5): Promise<string> {
  for (let i = 0; ; i++) {
    const code = newCode();
    try { await t.create(code); return code; } catch (e) { if (i + 1 >= tries) throw e; }
  }
}

/** El árbitro atiende la sala: el protocolo completo vive en Arbiter; aquí solo se conecta a la red. */
export function hostRoom(t: Transport, opts?: ArbiterOptions) {
  const arbiter = new Arbiter((peer, msg) => t.send(msg, peer), opts);
  t.onMessage = (raw, from) => arbiter.handle(from, raw);
  t.onLeave = (peer) => arbiter.leave(peer);
  const timer = setInterval(() => arbiter.tick(), 100);
  timer.unref();
  return { arbiter, stop: () => clearInterval(timer) };
}

/** Un jugador entra a la sala y espera su estación. */
export async function joinAsPlayer(t: Transport, code: string, alias: string, timeoutMs = 10_000): Promise<Station> {
  await t.join(code);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("el árbitro no respondió")), timeoutMs);
    t.onMessage = (raw) => {
      const m = raw as ServerMsg;
      if (m.t === "welcome") { clearTimeout(timer); resolve(m.station); }
      if (m.t === "full") { clearTimeout(timer); reject(new Error(m.reason)); }
    };
    t.send({ t: "hello", alias } satisfies Hello);
  });
}
