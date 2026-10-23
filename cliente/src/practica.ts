import { Arbiter } from "../../spike/src/arbiter/arbiter";
import type { Nivel } from "../../spike/src/protocol";
import type { Transport } from "../../spike/src/transport/transport";

/**
 * Práctica (SCRUM-151): el árbitro corre dentro del navegador, así que no hay sala, emparejamiento ni servidor
 * (y nadie escribe CSV). Cumple Transport para que Net no distinga entre práctica y duelo.
 * shortcut: la solución de los pods está en la memoria de la página; no importa porque en práctica no hay rival ni nota.
 */
export class PracticaTransport implements Transport {
  onMessage: Transport["onMessage"] = () => {};
  readonly arbiter: Arbiter;
  private timer?: ReturnType<typeof setInterval>;

  constructor(nivel: Nivel, semilla?: number) {
    // queueMicrotask: la respuesta llega después de enviar, como por la red.
    this.arbiter = new Arbiter((_peer, msg) => queueMicrotask(() => this.onMessage(msg, "arbitro")), { nivel, semilla, practica: true });
  }

  async create(): Promise<void> {}
  async join(): Promise<void> { this.timer ??= setInterval(() => this.arbiter.tick(), 100); }
  send(data: unknown): void { this.arbiter.handle("yo", data); }
  async close(): Promise<void> { clearInterval(this.timer); this.timer = undefined; this.onMessage = () => {}; }
}
