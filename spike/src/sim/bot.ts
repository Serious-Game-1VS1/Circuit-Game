import { performance } from "node:perf_hooks";
import { answer } from "../engine/pods.js";
import type { ClientMsg, End, PodView, RivalView, ServerMsg, Station } from "../protocol.js";
import type { Transport } from "../transport/transport.js";

/**
 * Jugador simulado: habla el protocolo real sobre cualquier Transport. Lo usan el banco de latencia,
 * la simulación de duelo y las pruebas. Conoce las respuestas (pods.answer) porque es un bot.
 */
export class Bot {
  station?: Station;
  despachados = 0;
  pod?: PodView;
  rival?: RivalView;
  end?: End;
  readonly log: ServerMsg[] = [];
  /** RTT acción -> respuesta del árbitro, y acción del rival -> progreso visto aquí (ms). */
  readonly own: number[] = [];
  readonly mirror: number[] = [];
  private seq = 0;
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];

  constructor(readonly t: Transport) {
    t.onMessage = (raw) => this.onMsg(raw as ServerMsg);
  }

  async enter(code: string, alias: string): Promise<ServerMsg> {
    await this.t.join(code);
    const reply = this.until((m) => m.t === "welcome" || m.t === "full");
    this.sendMsg({ t: "hello", alias });
    return reply;
  }

  ready() { this.sendMsg({ t: "ready" }); }

  /** Envía un intento y devuelve su seq. */
  test(zone: number, ohms: number): number {
    const seq = ++this.seq;
    this.sendMsg({ t: "test", seq, t0: performance.now(), zone, ohms });
    return seq;
  }

  /** Prueba la respuesta correcta en la primera zona sin reparar y espera el veredicto. */
  async solveNext(): Promise<ServerMsg> {
    const z = this.pod?.zonas.find((x) => !x.reparada) ?? { zona: 0, circuito: "led" as const };
    const seq = this.test(z.zona, answer(z.circuito));
    return this.until((m) => (m.t === "result" || m.t === "reject") && m.seq === seq);
  }

  /** Juega hasta despachar `pods` pods, esperando los enfriamientos si los hay. */
  async playUntil(pods: number): Promise<void> {
    while (this.despachados < pods && !this.end) {
      const r = await this.solveNext();
      if (r.t === "reject") await new Promise((ok) => setTimeout(ok, r.waitMs + 20));
    }
  }

  /** Primer mensaje (ya recibido desde `from` en el log, o futuro) que cumpla `pred`. */
  until(pred: (m: ServerMsg) => boolean, from = 0, timeoutMs = 10_000): Promise<ServerMsg> {
    const seen = this.log.slice(from).find(pred);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("tiempo de espera agotado")), timeoutMs);
      timer.unref();
      this.waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } });
    });
  }

  private sendMsg(m: ClientMsg) { this.t.send(m); }

  private onMsg(m: ServerMsg) {
    this.log.push(m);
    if (m.t === "welcome") this.station = m.station;
    if (m.t === "start") { this.despachados = m.despachados; this.pod = m.pod; this.rival = m.rival ?? undefined; }
    if (m.t === "result") { this.despachados = m.despachados; this.pod = m.pod; }
    if (m.t === "result" || m.t === "reject") this.own.push(performance.now() - m.t0);
    if (m.t === "rival") {
      this.rival = { alias: m.alias, despachados: m.despachados, estado: m.estado };
      if (m.t0 !== undefined) this.mirror.push(performance.now() - m.t0);
    }
    if (m.t === "end") this.end = m;
    this.waiters = this.waiters.filter((w) => !(w.pred(m) && (w.resolve(m), true)));
  }
}
