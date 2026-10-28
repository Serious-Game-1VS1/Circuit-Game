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

/** Espera antes de reabrir una sala tras `fallos` intentos seguidos fallidos: 2 s, 4 s, 8 s… tope 30 s. */
export const pausaReapertura = (fallos: number) => Math.min(2000 * 2 ** Math.max(0, fallos - 1), 30_000);

/** El árbitro atiende la sala: el protocolo completo vive en Arbiter; aquí solo se conecta a la red. `alCaer`: la conexión se perdió (sala muerta, ya detenida). */
export function hostRoom(t: Transport, opts?: ArbiterOptions, alCaer?: () => void) {
  const arbiter = new Arbiter((peer, msg) => t.send(msg, peer), opts);
  t.onMessage = (raw, from) => arbiter.handle(from, raw);
  t.onLeave = (peer) => arbiter.leave(peer);
  let ultima = "";
  const publicar = () => {
    const jugadores = arbiter.vivo().jugadores.length;
    const estado = arbiter.phase === "esperando" ? "esperando" : arbiter.phase === "listo" || arbiter.phase === "cuenta" ? "llena" : "jugando";
    const info = { nivel: arbiter.nivel === 2 ? 2 : 1, jugadores, estado } as const;
    const txt = JSON.stringify(info);
    if (txt !== ultima) { ultima = txt; t.publicar?.(info); }
  };
  const timer = setInterval(() => { arbiter.tick(); publicar(); }, 100);
  timer.unref();
  t.onClose = () => { clearInterval(timer); alCaer?.(); };
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
