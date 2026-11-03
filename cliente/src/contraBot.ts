import { Arbiter, MEDIR_COMPETITIVO_MS } from "../../spike/src/arbiter/arbiter";
import { evaluar } from "../../spike/src/engine/pods";
import { candidatosPlaca3, codificar, plantillaDe } from "../../spike/src/engine/placa3";
import type { Perfil } from "../../spike/src/engine/generador";
import type { Circuito, PodView, ServerMsg, ZonaView } from "../../spike/src/protocol";
import { esResistencia } from "./vista";
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
  led: 1, cabina: 1, invertido: 1, abierto: 1, fusible: 1.2, combinar: 1.25, divisor: 1.3, protegido: 1.3, interruptor: 1.4, luces: 1.5, cadena: 1.4, fusible3: 1.5, placa3: 2,
};
/** Complejidad de una zona: en nivel 3 las resistencias se leen por colores (más lentas y con más errores). */
export const complejidad = (z: ZonaView, nivel?: number) => COMPLEJIDAD[z.circuito] * (nivel === 3 && esResistencia(z.circuito) ? 1.3 : 1);
/** `muerta`: en la cadena, el hueco (1..n) que el bot localizó midiendo continuidad; sin él no se puede evaluar. */
export const veredicto = (z: ZonaView, p: string, muerta?: number) => evaluar({ circuito: z.circuito, volts: z.volts, r1: Number(/R1 (\d+)/.exec(z.fija ?? "")?.[1]) || undefined, ...consumoDe(z), cadena: z.cadena, muerta, plantilla: plantillaDe(z.enunciado), opciones: z.opciones }, p);
/** Jugadas que considera el bot: las opciones o, en la placa experta, montajes armados con las piezas visibles (placa3.ts, candidatosPlaca3). */
export const jugadasBot = (z: ZonaView): string[] => (z.circuito === "placa3" ? candidatosPlaca3(plantillaDe(z.enunciado), z.opciones).map(codificar) : z.opciones);

/** fusible3: el consumo normal sale del dato impreso en el pod («Consumo 0,9 A» / «Motor 1,8 A»), como lo lee un jugador. */
const consumoDe = (z: ZonaView) => {
  const m = /(Consumo|Motor) ([\d,]+) A/.exec(z.fija ?? "");
  return m ? { consumo: Number(m[2]!.replace(",", ".")), ...(m[1] === "Motor" && { arranque: true }) } : {};
};

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
  private muertas = new Map<number, number>(); // cadena: hueco que el bot localizó con continuidad, por zona
  private medidos = new Map<number, number>(); // cadena: cuántos huecos lleva medidos, por zona
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
      { nivel, semilla, medirMs: MEDIR_COMPETITIVO_MS, now: this.now, azar: mulberry32(semilla ^ 0x85ebca6b), ...(opts.limitMs && { limitMs: opts.limitMs }), ...(opts.countdownMs !== undefined && { countdownMs: opts.countdownMs }) },
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
    this.factor = 0.8 + this.rnd() * 0.45; this.probadas.clear(); this.muertas.clear(); this.medidos.clear();
    this.complejo = pod.zonas.reduce((a, z) => a + complejidad(z, pod.nivel), 0) / Math.max(1, pod.zonas.length);
  }

  private delBot(m: ServerMsg): void {
    if (m.t === "start" || m.t === "despachado") { this.nuevoPod(m.pod); this.pod = m.pod; this.proximo = this.espera(0, this.perfil.lectura * this.complejo); }
    else if (m.t === "result") { if (m.hayMas) this.probadas.delete(m.zona); this.pod = m.pod; this.proximo = this.espera(m.waitMs); }
    else if (m.t === "medida") { // cadena: «no pasa» = pieza muerta; si las demás pasan, es la última sin medir
      if (m.pasa === false) this.muertas.set(m.zona, Number(m.punto.slice(1)));
      this.proximo = this.now() + (m.medirMs ?? 0) + this.rnd() * 1500 * this.factor; // paga la espera de medir (3 s) y luego decide: ~3-4,5 s por hueco
    }
    else if (m.t === "reject") this.proximo = this.espera(m.waitMs);
    else if (m.t === "sabotaje") { if (m.tipo === "humo") this.proximo = Math.max(this.proximo, this.now() + m.ms / 2); } // el humo lo frena la mitad de su duración; los otros dos los aplica el árbitro
    else if (m.t === "end") { this.fin = true; this.proximo = Infinity; }
  }

  private actuar(): void {
    const z = this.pod?.zonas.find((x) => !x.reparada);
    const base = { seq: ++this.seq, t0: this.now() };
    if (!z) return this.arbiter.handle("bot", { t: "despachar", ...base });
    let jugadas = jugadasBot(z);
    if (z.circuito === "cadena") { // diagnosticar antes de reparar: mide cada hueco con continuidad (sin penalizar), como un jugador
      const n = z.cadena!.length, m = this.muertas.get(z.zona), hechos = this.medidos.get(z.zona) ?? 0;
      if (m === undefined && hechos < n - 1) { this.medidos.set(z.zona, hechos + 1); return this.arbiter.handle("bot", { t: "medir", ...base, zone: z.zona, pieza: "ninguna", modo: "continuidad", punto: `t${hechos + 1}` }); }
      const k = m ?? n; // las n-1 primeras pasan: la muerta es la última
      this.muertas.set(z.zona, k);
      jugadas = z.opciones.map((o) => `${k}:${o}`);
    }
    const muerta = this.muertas.get(z.zona);
    const v = new Map(jugadas.map((p) => [p, veredicto(z, p, muerta)]));
    const mal = jugadas.filter((p) => v.get(p) !== "correcto");
    const quema = mal.filter((p) => v.get(p) === "se quema" || v.get(p) === "corto");
    const bien = jugadas.filter((p) => v.get(p) === "correcto");
    const vistas = this.probadas.get(z.zona) ?? new Set<string>();
    const nuevas = (l: string[]) => (l.filter((p) => !vistas.has(p)).length ? l.filter((p) => !vistas.has(p)) : l);
    const suave = mal.filter((p) => !quema.includes(p));
    let pool = bien;
    if (mal.length && this.rnd() < Math.min(0.6, this.perfil.error * complejidad(z, this.pod?.nivel))) pool = quema.length && this.rnd() < this.perfil.quema ? quema : suave.length ? suave : mal;
    pool = nuevas(pool);
    const pieza = pool[Math.floor(this.rnd() * pool.length)]!;
    this.probadas.set(z.zona, vistas.add(pieza));
    this.arbiter.handle("bot", { t: "test", ...base, zone: z.zona, pieza });
  }
}
