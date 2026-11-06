import { performance } from "node:perf_hooks";
import { evaluar, jugadas } from "../engine/pods.js";
import type { ClientMsg, End, PodView, RivalView, ServerMsg, Station, ZonaView } from "../protocol.js";
import type { Transport } from "../transport/transport.js";

/**
 * Jugador simulado: habla el protocolo real sobre cualquier Transport. Lo usan el banco de latencia,
 * la simulación de duelo y las pruebas. Deduce la respuesta como un estudiante perfecto: prueba cada
 * opción de la zona con el motor (solo usa lo que el árbitro le mostró, nunca la solución).
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
  /** Banco de latencia: no mide, prueba a ciegas (solo importan los RTT, no acertar). */
  adivina = false;
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
  test(zone: number, pieza: string): number {
    const seq = ++this.seq;
    this.sendMsg({ t: "test", seq, t0: performance.now(), zone, pieza });
    return seq;
  }

  /** Pulsa "Despachar" y devuelve su seq. */
  dispatch(): number {
    const seq = ++this.seq;
    this.sendMsg({ t: "despachar", seq, t0: performance.now() });
    return seq;
  }

  /**
   * Siguiente paso de un estudiante perfecto: prueba la respuesta correcta en la primera zona sin
   * reparar o, si ya están todas, despacha el pod. Espera la respuesta del árbitro.
   */
  async solveNext(): Promise<ServerMsg> {
    if (!this.pod) throw new Error("sin pod a la vista");
    const z = this.pod.zonas.find((x) => !x.reparada);
    const seq = z ? this.test(z.zona, Bot.answer(await this.conocer(z))) : this.dispatch();
    return this.until((m) => (m.t === "result" || m.t === "despachado" || m.t === "reject") && m.seq === seq);
  }

  /**
   * En una cadena la pieza muerta no viaja: el estudiante la localiza con el multímetro (continuidad con el hueco vacío, 1 s por medida;
   * la última se deduce). Devuelve la zona con `muerta` para que `answer` la evalúe; las demás familias ya se deducen de lo que se ve.
   */
  async conocer(z: ZonaView): Promise<ZonaView> {
    if (!z.cadena || this.adivina) return z;
    let muerta = z.cadena.length;
    for (let k = 1; k < z.cadena.length; k++) {
      const seq = ++this.seq;
      this.sendMsg({ t: "medir", seq, t0: performance.now(), zone: z.zona, pieza: "ninguna", modo: "continuidad", punto: `t${k}` });
      const m = await this.until((x) => (x.t === "medida" || x.t === "reject") && x.seq === seq);
      await new Promise((ok) => setTimeout(ok, 1000));
      if (m.t === "medida" && m.pasa === false) { muerta = k; break; }
    }
    return { ...z, muerta } as ZonaView;
  }

  /** Primera opción que el motor da por correcta (o la que cumpla `want`). */
  static answer(z: ZonaView, want: (v: string) => boolean = (v) => v === "correcto"): string {
    return jugadas(z).find((p) => want(evaluar(z, p)))!;
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
    if (m.t === "result" || m.t === "despachado") { this.despachados = m.despachados; this.pod = m.pod; }
    if (m.t === "result" || m.t === "despachado" || m.t === "reject") this.own.push(performance.now() - m.t0);
    if (m.t === "rival") {
      this.rival = { alias: m.alias, despachados: m.despachados, estado: m.estado };
      if (m.t0 !== undefined) this.mirror.push(performance.now() - m.t0);
    }
    if (m.t === "end") this.end = m;
    this.waiters = this.waiters.filter((w) => !(w.pred(m) && (w.resolve(m), true)));
  }
}
