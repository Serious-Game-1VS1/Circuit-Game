import { generar, type Pod } from "../engine/generador.js";
import { evaluar } from "../engine/pods.js";
import {
  validAlias, type End, type Nivel, type Phase, type PodView, type RivalView, type ServerMsg, type Station,
} from "../protocol.js";
import { BURN_BLOCK_MS, PenaltyTracker } from "./penalties.js";

export const PODS_TO_WIN = 5;
// supuesto: límite de 12 min pendiente de confirmar con el tutor; configurable por opción.
export const MATCH_LIMIT_MS = 12 * 60_000;
export const RECONNECT_MS = 30_000;
export const COUNTDOWN_MS = 3_000;

export interface ArbiterOptions {
  now?: () => number;
  countdownMs?: number;
  limitMs?: number;
  reconnectMs?: number;
  /** Semilla de los pods; por defecto se sortea. Nunca se envía a los clientes. */
  semilla?: number;
  nivel?: Nivel;
}

interface Seat {
  station: Station;
  alias: string;
  /** null = sin conexión desde `goneAt`. */
  peer: string | null;
  goneAt: number;
  ready: boolean;
  penalties: PenaltyTracker;
  despachados: number;
  repaired: Set<number>;
  lastPieza: Map<number, string>;
  penalUntil: number;
  lastRival: string;
}

/**
 * Árbitro de un duelo 1 contra 1 y única fuente de verdad. No conoce la red: recibe mensajes
 * de un `peer` (cadena opaca) y envía por el callback `send`. El reloj es inyectable y el tiempo
 * avanza con `tick()` (el anfitrión lo llama cada ~100 ms; las pruebas, a mano).
 *
 * Fases: esperando → listo (2 jugadores) → cuenta (ambos pulsaron Listo) → jugando → fin | anulada.
 */
export class Arbiter {
  phase: Phase = "esperando";
  outcome?: End;
  private seats: Seat[] = [];
  private countdownAt = 0;
  private lastCount = 0;
  private startAt = 0;
  private readonly now: () => number;
  private readonly countdownMs: number;
  private readonly limitMs: number;
  private readonly reconnectMs: number;
  readonly semilla: number;
  readonly nivel: Nivel;
  /** Los 5 pods de la partida, con su solución: los mismos para ambos jugadores. */
  readonly pods: Pod[];

  constructor(private readonly send: (peer: string, msg: ServerMsg) => void, opts: ArbiterOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.countdownMs = opts.countdownMs ?? COUNTDOWN_MS;
    this.limitMs = opts.limitMs ?? MATCH_LIMIT_MS;
    this.reconnectMs = opts.reconnectMs ?? RECONNECT_MS;
    this.semilla = opts.semilla ?? Math.floor(Math.random() * 2 ** 32);
    this.nivel = opts.nivel ?? 1;
    this.pods = generar(this.semilla, this.nivel);
  }

  /** Mensaje de un participante. Los datos de la red no son de confianza: se validan aquí. */
  handle(peer: string, raw: unknown): void {
    const m = raw as Record<string, unknown> | null;
    if (m?.t === "hello") return this.hello(peer, m.alias);
    const s = this.seats.find((x) => x.peer === peer);
    if (!s) return;
    if (m?.t === "ready") return this.ready(s);
    if (m?.t === "test") {
      const seq = typeof m.seq === "number" ? m.seq : 0;
      const t0 = typeof m.t0 === "number" ? m.t0 : 0;
      // Compatibilidad: un cliente sin `pieza` manda `ohms`.
      return this.test(s, m.zone, typeof m.pieza === "string" ? m.pieza : typeof m.ohms === "number" ? String(m.ohms) : null, seq, t0);
    }
  }

  /** El transporte avisa que un participante se fue. */
  leave(peer: string): void {
    const s = this.seats.find((x) => x.peer === peer);
    if (!s) return;
    if (this.phase === "jugando") {
      s.peer = null;
      s.goneAt = this.now();
      return this.syncRival(s);
    }
    if (this.phase === "fin" || this.phase === "anulada") return;
    // supuesto: antes de empezar, quien se va libera su asiento y se cancela la cuenta; el otro vuelve a "no listo".
    this.seats = this.seats.filter((x) => x !== s);
    for (const x of this.seats) x.ready = false;
    this.phase = "esperando";
    this.broadcastLobby();
  }

  tick(): void {
    const t = this.now();
    if (this.phase === "cuenta") {
      const el = t - this.countdownAt;
      if (el >= this.countdownMs) return this.start();
      const n = 3 - Math.floor((el * 3) / this.countdownMs);
      if (n !== this.lastCount) this.countdown(n);
      return;
    }
    if (this.phase !== "jugando") return;
    if (t - this.startAt >= this.limitMs) return this.finish("tiempo");
    if (this.seats.every((s) => !s.peer && t - s.goneAt >= this.reconnectMs)) {
      this.phase = "anulada";
      this.outcome = { t: "end", phase: "anulada", winner: null, reason: "ambos sin conexión 30 s", score: this.score() };
      return;
    }
    for (const s of this.seats) this.syncRival(s);
  }

  /** Registro de intentos de ambos jugadores (SCRUM-92). Columna `jugador` = estación, sin alias. */
  toCsv(): string {
    const rows: string[] = [];
    let header = "";
    for (const s of this.seats) {
      const [h, ...rest] = s.penalties.toCsv().slice(1).trimEnd().split("\r\n");
      header = `jugador;${h}`;
      rows.push(...rest.map((r) => `${s.station};${r}`));
    }
    return "﻿" + [header || "jugador;intento;zona;piezas;resultado;tiempo_ms;quemada", ...rows].join("\r\n") + "\r\n";
  }

  private hello(peer: string, alias: unknown): void {
    if (!validAlias(alias)) return this.send(peer, { t: "full", reason: "alias de 1 a 12 caracteres" });
    const name = alias.trim();
    const mine = this.seats.find((x) => x.peer === peer);
    if (mine) return this.send(peer, { t: "welcome", station: mine.station, alias: mine.alias });

    const same = this.seats.find((x) => x.alias === name);
    if (this.phase === "jugando" && same && !same.peer) {
      if (this.now() - same.goneAt >= this.reconnectMs) return this.send(peer, { t: "full", reason: "tiempo de reconexión agotado" });
      same.peer = peer;
      this.send(peer, { t: "welcome", station: same.station, alias: same.alias });
      this.send(peer, this.snapshot(same));
      return this.syncRival(same);
    }
    if (this.phase === "anulada") return this.send(peer, { t: "full", reason: "partida anulada" });
    if (this.seats.length >= 2 || (this.phase !== "esperando" && this.phase !== "listo")) {
      return this.send(peer, { t: "full", reason: "sala completa" });
    }
    // supuesto: dos jugadores no pueden usar el mismo alias (sirve para reconectar).
    if (same) return this.send(peer, { t: "full", reason: "alias en uso" });

    const station: Station = this.seats.some((x) => x.station === "A") ? "B" : "A";
    this.seats.push({
      station, alias: name, peer, goneAt: 0, ready: false, penalties: new PenaltyTracker(this.now),
      despachados: 0, repaired: new Set(), lastPieza: new Map(), penalUntil: 0, lastRival: "",
    });
    this.seats.sort((a, b) => a.station.localeCompare(b.station));
    this.phase = this.seats.length === 2 ? "listo" : "esperando";
    this.send(peer, { t: "welcome", station, alias: name });
    this.broadcastLobby();
  }

  private ready(s: Seat): void {
    if (this.phase !== "listo") return;
    s.ready = true;
    this.broadcastLobby();
    if (this.seats.every((x) => x.ready)) {
      this.phase = "cuenta";
      this.countdownAt = this.now();
      this.countdown(3);
      this.tick();
    }
  }

  private countdown(n: number): void {
    this.lastCount = n;
    this.broadcast({ t: "countdown", n });
  }

  private start(): void {
    this.phase = "jugando";
    this.startAt = this.now();
    for (const s of this.seats) s.penalties = new PenaltyTracker(this.now); // tiempo_ms del CSV cuenta desde aquí
    for (const s of this.seats) if (s.peer) this.send(s.peer, this.snapshot(s));
    for (const s of this.seats) this.syncRival(s);
  }

  private test(s: Seat, zone: unknown, pieza: string | null, seq: number, t0: number): void {
    const reject = (reason: string, waitMs = 0) => this.send(s.peer!, { t: "reject", seq, t0, reason, waitMs });
    if (this.phase !== "jugando") return reject("la partida no está en juego");
    const pod = this.pods[s.despachados]!;
    const z = pod.zonas.find((x) => x.zona === zone);
    if (!z || s.repaired.has(z.zona)) return reject("zona no válida");
    if (pieza === null || !z.opciones.includes(pieza)) return reject("pieza no válida");

    const check = s.penalties.canTest(z.zona, s.lastPieza.get(z.zona) !== pieza);
    if (!check.ok) return reject(check.reason, check.waitMs);
    s.lastPieza.set(z.zona, pieza);

    const v = evaluar(z, pieza);
    const pieces = [z.circuito === "led" || z.circuito === "cabina" ? `R=${pieza}` : `${z.circuito}=${pieza}`];
    let waitMs = 0;
    if (v === "correcto") {
      s.penalties.registerSuccess(z.zona, pieces);
      s.repaired.add(z.zona);
      if (s.repaired.size === pod.zonas.length) {
        s.despachados++;
        s.repaired.clear();
        s.lastPieza.clear();
        s.penalties.newPod();
      }
    } else if (v === "se quema" || v === "corto") {
      // supuesto: un cortocircuito penaliza igual que una pieza quemada.
      s.penalties.registerBurn(z.zona, pieces);
      waitMs = BURN_BLOCK_MS;
    } else {
      waitMs = s.penalties.registerFailure(z.zona, pieces);
    }
    s.penalUntil = Math.max(s.penalUntil, this.now() + waitMs);
    this.send(s.peer!, { t: "result", seq, t0, zona: z.zona, veredicto: v, waitMs, despachados: s.despachados, pod: this.podView(s) });
    this.syncRival(s, t0);
    // Despachos casi simultáneos: gana el primero que llega aquí (el árbitro procesa en orden de llegada).
    if (s.despachados >= PODS_TO_WIN) this.finish("5 pods despachados", s.station);
  }

  private finish(reason: string, winner?: Station): void {
    const [a, b] = this.seats;
    if (!winner && a && b) {
      // Desempate: más pods despachados, luego menos piezas quemadas, luego empate.
      const d = a.despachados - b.despachados || burned(b) - burned(a);
      winner = d > 0 ? a.station : d < 0 ? b.station : undefined;
    }
    this.phase = "fin";
    this.outcome = { t: "end", phase: "fin", winner: winner ?? null, reason, score: this.score() };
    this.broadcast(this.outcome);
  }

  private score(): End["score"] {
    return Object.fromEntries(this.seats.map((s) => [s.station, { alias: s.alias, despachados: s.despachados, quemadas: burned(s) }]));
  }

  private podView(s: Seat): PodView {
    // Tras el quinto despacho se sigue mostrando el último pod (la partida ya terminó).
    const pod = this.pods[Math.min(s.despachados, PODS_TO_WIN - 1)]!;
    // Campo por campo, sin `solucion`: la solución nunca sale del árbitro.
    return {
      numero: s.despachados + 1,
      zonas: pod.zonas.map(({ zona, nombre, circuito, volts, opciones }) => ({
        zona, nombre, circuito, volts, opciones: [...opciones], reparada: s.repaired.has(zona),
      })),
    };
  }

  private rivalView(s: Seat): RivalView {
    const estado = !s.peer ? "sin-conexion" : this.now() < s.penalUntil ? "penalizado" : "reparando";
    return { alias: s.alias, despachados: s.despachados, estado };
  }

  private snapshot(s: Seat): ServerMsg {
    const other = this.seats.find((x) => x !== s);
    return {
      t: "start", restanteMs: this.limitMs - (this.now() - this.startAt), despachados: s.despachados,
      total: PODS_TO_WIN, nivel: this.nivel, pod: this.podView(s), rival: other ? this.rivalView(other) : null,
    };
  }

  /** Progreso de `s` hacia su rival, solo si cambió. Nunca incluye piezas ni soluciones. */
  private syncRival(s: Seat, t0?: number): void {
    const view = this.rivalView(s);
    const key = JSON.stringify(view);
    if (key === s.lastRival) return;
    s.lastRival = key;
    const other = this.seats.find((x) => x !== s);
    if (other?.peer) this.send(other.peer, { t: "rival", ...view, ...(t0 !== undefined && { t0 }) });
  }

  private broadcastLobby(): void {
    this.broadcast({ t: "lobby", phase: this.phase, players: this.seats.map(({ station, alias, ready }) => ({ station, alias, ready })) });
  }

  private broadcast(msg: ServerMsg): void {
    for (const s of this.seats) if (s.peer) this.send(s.peer, msg);
  }
}

const burned = (s: Seat) => s.penalties.attemptsLog.filter((a) => a.burned).length;
