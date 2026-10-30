import { Arbiter } from "../../spike/src/arbiter/arbiter";
import { evaluar } from "../../spike/src/engine/pods";
import type { Perfil } from "../../spike/src/engine/generador";
import type { Circuito, PodView, ServerMsg, ZonaView } from "../../spike/src/protocol";
import type { Transport } from "../../spike/src/transport/transport";

export type DificultadBot = "facil" | "normal" | "dificil";

/**
 * Latencia humana del bot: `lectura` = ms extra al empezar cada pod (mira la placa), luego ms entre acciones (uniforme en [min, max]);
 * cada pod los escala por un factor al azar (0,8–1,25) para que unos salgan más rápido que otros.
 * `error`: prob. de elegir una pieza equivocada y, de esas, `quema`: prob. de que queme. Tras un error nunca repite una pieza ya probada.
 */
export const PERFILES_BOT: Record<DificultadBot, { lectura: number; min: number; max: number; error: number; quema: number }> = {
  facil: { lectura: 12000, min: 7000, max: 13000, error: 0.3, quema: 0.3 },
  normal: { lectura: 8000, min: 5000, max: 9000, error: 0.15, quema: 0.2 },
  dificil: { lectura: 5000, min: 3200, max: 6000, error: 0.05, quema: 0.1 },
};

/**
 * Cómo decide el bot cualquier familia (sin ver la solución): arma la zona SOLO con lo que ve un jugador (circuito, volts,
 * opciones y el dato impreso `fija`, p. ej. «R1 470 Ω») y la resuelve con el motor, como un estudiante que aplica la ley de Ohm.
 * Lo que cambia por perfil es la humanidad: lectura y espera, probabilidad de error/quemar, y la COMPLEJIDAD de la familia
 * (placa, divisor, combinar… tardan más en leerse y se equivocan más) para que no sea imbatible ni siquiera en Difícil.
 */
export const COMPLEJIDAD: Record<Circuito, number> = {
  led: 1, cabina: 1, invertido: 1, abierto: 1, fusible: 1.2, combinar: 1.25, divisor: 1.3, protegido: 1.3, interruptor: 1.4, luces: 1.5,
};
export const veredicto = (z: ZonaView, p: string) => evaluar({ circuito: z.circuito, volts: z.volts, r1: Number(/R1 (\d+)/.exec(z.fija ?? "")?.[1]) || undefined }, p);

const mulberry32 = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};

/**
 * «Jugar solo»: duelo completo contra un bot dentro del navegador. Un Arbiter normal (no práctica) con dos asientos:
 * el jugador es A y el bot es B. Cumple Transport, así que Net lo trata como un duelo (rival, reloj, carrera, podio).
 * El bot solo ve lo que ve un jugador (PodView y resultados): nunca la solución, y la usa con la misma API (`handle`).
 * Todo el tiempo sale de `now`: con `now` inyectado y `tick()` a mano la partida es determinista por semilla.
 * Sin sala, CSV ni docente: nadie llama a `arbiter.toCsv()`.
 */
export class ContraBotTransport implements Transport {
  onMessage: Transport["onMessage"] = () => {};
  readonly arbiter: Arbiter;
  /** Alias del bot (lo que ve el jugador como rival). */
  botAlias = "Bot";
  private timer?: ReturnType<typeof setInterval>;
  private readonly rnd: () => number;
  private readonly perfil: (typeof PERFILES_BOT)[DificultadBot];
  private readonly autoListo: boolean;
  private readonly now: () => number;
  private pod?: PodView;
  private seq = 0;
  private factor = 1; // escala de ritmo del pod actual
  private complejo = 1; // complejidad media de las zonas del pod actual
  private probadas = new Map<number, Set<string>>(); // piezas ya probadas por zona en este pod
  private proximo = Infinity; // cuándo actúa el bot; Infinity = esperando algo
  private fin = false;

  constructor(nivel: Perfil = 1, semilla: number = Math.floor(Math.random() * 2 ** 32), dificultad: DificultadBot = "normal",
    opts: { now?: () => number; autoListo?: boolean; limitMs?: number; countdownMs?: number } = {}) {
    this.now = opts.now ?? Date.now;
    this.autoListo = opts.autoListo ?? true;
    this.perfil = PERFILES_BOT[dificultad];
    this.rnd = mulberry32(semilla ^ 0x9e3779b9);
    this.arbiter = new Arbiter(
      (peer, msg) => (peer === "bot" ? this.delBot(msg) : queueMicrotask(() => this.onMessage(msg, "arbitro"))),
      { nivel, semilla, now: this.now, azar: mulberry32(semilla ^ 0x85ebca6b), ...(opts.limitMs && { limitMs: opts.limitMs }), ...(opts.countdownMs !== undefined && { countdownMs: opts.countdownMs }) },
    );
  }

  async create(): Promise<void> {}
  async join(): Promise<void> { this.timer ??= setInterval(() => this.tick(), 100); }

  send(data: unknown): void {
    this.arbiter.handle("yo", data);
    const m = data as { t?: string; alias?: unknown } | null;
    if (m?.t !== "hello") return;
    // El jugador ya tiene el asiento A: el bot se sienta de B (alias distinto) y está listo desde el inicio.
    const alias = typeof m.alias === "string" ? m.alias.trim() : "";
    if (alias === this.botAlias) this.botAlias = "Bot 2";
    this.arbiter.handle("bot", { t: "hello", alias: this.botAlias });
    this.arbiter.handle("bot", { t: "ready" });
    if (this.autoListo) this.arbiter.handle("yo", { t: "ready" });
  }

  async close(): Promise<void> { clearInterval(this.timer); this.timer = undefined; this.onMessage = () => {}; this.fin = true; }

  /** Avanza el árbitro y deja actuar al bot. Lo llama el intervalo; las pruebas lo llaman a mano con un reloj virtual. */
  tick(): void {
    this.arbiter.tick();
    if (this.fin || this.now() < this.proximo) return;
    this.proximo = Infinity; // hasta que llegue la respuesta del árbitro
    this.actuar();
  }

  private espera(extra = 0, lectura = 0): number {
    return this.now() + extra + (lectura + this.perfil.min + this.rnd() * (this.perfil.max - this.perfil.min)) * this.factor;
  }

  private nuevoPod(pod: PodView): void {
    this.factor = 0.8 + this.rnd() * 0.45; this.probadas.clear();
    this.complejo = pod.zonas.reduce((a, z) => a + COMPLEJIDAD[z.circuito], 0) / Math.max(1, pod.zonas.length);
  }

  private delBot(m: ServerMsg): void {
    if (m.t === "start" || m.t === "despachado") { this.nuevoPod(m.pod); this.pod = m.pod; this.proximo = this.espera(0, this.perfil.lectura * this.complejo); }
    else if (m.t === "result") { if (m.hayMas) this.probadas.delete(m.zona); this.pod = m.pod; this.proximo = this.espera(m.waitMs); }
    else if (m.t === "reject") this.proximo = this.espera(m.waitMs);
    else if (m.t === "end") { this.fin = true; this.proximo = Infinity; }
  }

  private actuar(): void {
    const z = this.pod?.zonas.find((x) => !x.reparada);
    const base = { seq: ++this.seq, t0: this.now() };
    if (!z) return this.arbiter.handle("bot", { t: "despachar", ...base });
    const v = new Map(z.opciones.map((p) => [p, veredicto(z, p)]));
    const mal = z.opciones.filter((p) => v.get(p) !== "correcto");
    const quema = mal.filter((p) => v.get(p) === "se quema" || v.get(p) === "corto");
    const bien = z.opciones.filter((p) => v.get(p) === "correcto");
    const vistas = this.probadas.get(z.zona) ?? new Set<string>();
    const nuevas = (l: string[]) => (l.filter((p) => !vistas.has(p)).length ? l.filter((p) => !vistas.has(p)) : l);
    const suave = mal.filter((p) => !quema.includes(p));
    let pool = bien;
    if (mal.length && this.rnd() < Math.min(0.6, this.perfil.error * COMPLEJIDAD[z.circuito])) pool = quema.length && this.rnd() < this.perfil.quema ? quema : suave.length ? suave : mal;
    pool = nuevas(pool);
    const pieza = pool[Math.floor(this.rnd() * pool.length)]!;
    this.probadas.set(z.zona, vistas.add(pieza));
    this.arbiter.handle("bot", { t: "test", ...base, zone: z.zona, pieza });
  }
}
