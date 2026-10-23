import { generar, type Demo, type Pod } from "../engine/generador.js";
import { medir } from "../engine/medir.js";
import { evaluar } from "../engine/pods.js";
import {
  validAlias, type Carril, type End, type Nivel, type Phase, type PodView, type RivalView, type ServerMsg, type Station,
} from "../protocol.js";
import { BURN_BLOCK_MS, csvField, PenaltyTracker } from "./penalties.js";

export const PODS_TO_WIN = 5;
// supuesto: límite de 12 min pendiente de confirmar con el tutor; configurable por opción.
export const MATCH_LIMIT_MS = 12 * 60_000;
export const RECONNECT_MS = 30_000;
export const COUNTDOWN_MS = 3_000;
export const CSV_HEADER = "jugador;intento;zona;piezas;resultado;tiempo_ms;quemada;pod;tiempo_pod_ms";

export interface ArbiterOptions {
  now?: () => number;
  countdownMs?: number;
  limitMs?: number;
  reconnectMs?: number;
  /** Semilla de los pods; por defecto se sortea. Nunca se envía a los clientes. */
  semilla?: number;
  nivel?: Nivel;
  /** Modo demo ("cableado": Cabina/Turbina con placa; "radar": solo Radar). El cliente solo recibe `start.demo` = true. */
  demo?: Demo;
  /** Azar de la carrera final (qué pod corre); por defecto Math.random. Nunca decide el ganador. */
  azar?: () => number;
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
  /** Inicio (reloj del árbitro) del pod actual: cronómetro por pod hacia arriba, sin límite ni castigo. */
  podInicio: number;
  podMs: number[];
  /** Fallos (incluye quemadas) del pod actual: 0 al despachar = despacho limpio = una llama. */
  podFallos: number;
  llamas: number;
  /** Número de pod de cada intento (mismo orden que `penalties.attemptsLog`). */
  intentoPod: number[];
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
  private readonly azar: () => number;
  readonly semilla: number;
  readonly nivel: Nivel;
  readonly demo: Demo;
  /** Los 5 pods de la partida, con su solución: los mismos para ambos jugadores. */
  readonly pods: Pod[];

  constructor(private readonly send: (peer: string, msg: ServerMsg) => void, opts: ArbiterOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.countdownMs = opts.countdownMs ?? COUNTDOWN_MS;
    this.limitMs = opts.limitMs ?? MATCH_LIMIT_MS;
    this.reconnectMs = opts.reconnectMs ?? RECONNECT_MS;
    this.azar = opts.azar ?? Math.random;
    this.semilla = opts.semilla ?? Math.floor(Math.random() * 2 ** 32);
    this.nivel = opts.nivel ?? 1;
    this.demo = opts.demo ?? false;
    this.pods = generar(this.semilla, this.nivel, this.demo);
  }

  /** Mensaje de un participante. Los datos de la red no son de confianza: se validan aquí. */
  handle(peer: string, raw: unknown): void {
    const m = raw as Record<string, unknown> | null;
    if (m?.t === "hello") return this.hello(peer, m.alias);
    const s = this.seats.find((x) => x.peer === peer);
    if (!s) return;
    if (m?.t === "ready") return this.ready(s);
    const seq = typeof m?.seq === "number" ? m.seq : 0;
    const t0 = typeof m?.t0 === "number" ? m.t0 : 0;
    if (m?.t === "despachar") return this.dispatch(s, seq, t0);
    if (m?.t === "medir") return this.measure(s, m, seq, t0);
    if (m?.t === "test") {
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
    // Tras el fin se guarda el asiento para reenviar el resultado a quien vuelva (30 s).
    if (this.phase === "fin") { s.peer = null; s.goneAt = this.now(); return; }
    if (this.phase === "anulada") return;
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

  /**
   * Registro de intentos de ambos jugadores (SCRUM-92). Columna `jugador` = estación, sin alias.
   * Cronómetro por pod: cada intento lleva su `pod`, y cada despacho suma una fila "despacho" con
   * `tiempo_ms` (desde el inicio) y `tiempo_pod_ms` (duración del pod); intento, zona y piezas vacíos.
   */
  // supuesto: el tiempo por pod va como filas "despacho" en el mismo CSV (dos columnas nuevas al final).
  toCsv(): string {
    const rows: string[] = [];
    for (const s of this.seats) {
      let hechos = 0, fin = 0;
      const despacho = () => {
        const ms = s.podMs[hechos++]!;
        fin += ms;
        rows.push(`${s.station};;;;despacho;${fin};no;${hechos};${ms}`);
      };
      s.penalties.attemptsLog.forEach((a, i) => {
        const pod = s.intentoPod[i]!;
        while (hechos < pod - 1) despacho();
        rows.push([s.station, i + 1, a.zone, a.pieces.join("|"), a.passed ? "ok" : "fallo", a.atMs, a.burned ? "si" : "no", pod, ""]
          .map((v) => csvField(String(v))).join(";"));
      });
      while (hechos < s.podMs.length) despacho();
    }
    return "﻿" + [CSV_HEADER, ...rows].join("\r\n") + "\r\n";
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
    if (this.phase === "fin" && same && !same.peer && this.outcome) {
      if (this.now() - same.goneAt >= this.reconnectMs) return this.send(peer, { t: "full", reason: "tiempo de reconexión agotado" });
      same.peer = peer;
      this.send(peer, { t: "welcome", station: same.station, alias: same.alias });
      return this.send(peer, this.outcome);
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
      podInicio: 0, podMs: [], podFallos: 0, llamas: 0, intentoPod: [],
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
    // tiempo_ms del CSV y el cronómetro del primer pod cuentan desde aquí
    for (const s of this.seats) { s.penalties = new PenaltyTracker(this.now); s.podInicio = this.startAt; }
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
    } else if (v === "se quema" || v === "corto") {
      // supuesto: un cortocircuito penaliza igual que una pieza quemada.
      s.penalties.registerBurn(z.zona, pieces);
      waitMs = BURN_BLOCK_MS;
    } else {
      waitMs = s.penalties.registerFailure(z.zona, pieces);
    }
    s.intentoPod.push(s.despachados + 1);
    if (v !== "correcto") s.podFallos++;
    s.penalUntil = Math.max(s.penalUntil, this.now() + waitMs);
    this.send(s.peer!, { t: "result", seq, t0, zona: z.zona, veredicto: v, waitMs, despachados: s.despachados, pod: this.podView(s) });
    this.syncRival(s, t0);
  }

  /**
   * Multímetro: lee el circuito con la pieza o montaje que el jugador tiene puesto. No toca
   * penalizaciones, intentos, CSV ni el estado del rival (medir no cuenta como «Probar»).
   */
  // shortcut: el ~1 s que cuesta medir lo espera el cliente; si un cliente tramposo lo salta solo gana tiempo, no información.
  private measure(s: Seat, m: Record<string, unknown>, seq: number, t0: number): void {
    const reject = (reason: string) => this.send(s.peer!, { t: "reject", seq, t0, reason, waitMs: 0 });
    if (this.phase !== "jugando") return reject("la partida no está en juego");
    const z = this.pods[s.despachados]!.zonas.find((x) => x.zona === m.zone);
    const { pieza, modo, punto } = m;
    if (!z || typeof pieza !== "string" || !z.opciones.includes(pieza) || (modo !== "continuidad" && modo !== "tension") || typeof punto !== "string") {
      return reject("medida no válida");
    }
    const lectura = medir(z, pieza, modo, punto);
    if (!lectura) return reject("medida no válida");
    this.send(s.peer!, { t: "medida", seq, t0, zona: z.zona, modo, punto, ...lectura });
  }

  /** "Despachar": el pod cuenta solo si todas sus zonas están reparadas (RF-03). */
  private dispatch(s: Seat, seq: number, t0: number): void {
    const reject = (reason: string) => this.send(s.peer!, { t: "reject", seq, t0, reason, waitMs: 0 });
    if (this.phase !== "jugando") return reject("la partida no está en juego");
    if (s.repaired.size < this.pods[s.despachados]!.zonas.length) return reject("faltan zonas por reparar");
    s.despachados++;
    s.podMs.push(this.now() - s.podInicio);
    s.podInicio = this.now();
    if (s.podFallos === 0) s.llamas++;
    s.podFallos = 0;
    s.repaired.clear();
    s.lastPieza.clear();
    s.penalties.newPod();
    this.send(s.peer!, { t: "despachado", seq, t0, despachados: s.despachados, pod: this.podView(s) });
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
    // supuesto: ambos reciben el mismo End (con los fallos de los dos); el podio muestra solo los propios.
    const carrera = Object.fromEntries(this.seats.map((s) => [s.station, this.carril(s)]));
    this.outcome = { t: "end", phase: "fin", winner: winner ?? null, reason, score: this.score(), carrera };
    this.broadcast(this.outcome);
  }

  /** Carrera y podio de un jugador. El azar solo elige qué pod corre: el ganador ya está decidido. */
  private carril(s: Seat): Carril {
    // supuesto: el perdedor también corre un pod al azar entre los suyos (el 1 si no despachó ninguno).
    const pod = 1 + Math.floor(this.azar() * Math.max(1, s.despachados));
    const porCircuito = new Map<string, Carril["repasar"][number]>();
    s.penalties.attemptsLog.forEach((a, i) => {
      if (a.passed) return;
      const z = this.pods[s.intentoPod[i]! - 1]!.zonas.find((x) => x.zona === a.zone)!;
      const r = porCircuito.get(z.circuito) ?? { zona: z.nombre, circuito: z.circuito, fallos: 0, quemadas: 0 };
      r.fallos++;
      if (a.burned) r.quemadas++;
      porCircuito.set(z.circuito, r);
    });
    const repasar = [...porCircuito.values()].sort((a, b) => b.fallos - a.fallos);
    return { pod, llamas: s.llamas, podMs: [...s.podMs], repasar };
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
      total: PODS_TO_WIN, nivel: this.nivel, demo: this.demo !== false, pod: this.podView(s), rival: other ? this.rivalView(other) : null,
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
