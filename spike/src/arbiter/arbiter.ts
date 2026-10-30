import { generar, generarOleada, mulberry32, nivelDePod, type Demo, type Perfil, type Pod, type ZonaPod } from "../engine/generador.js";
import { medir } from "../engine/medir.js";
import { evaluar, piezaValida } from "../engine/pods.js";
import {
  validAlias, type Carril, type End, type Phase, type PodView, type RivalView, type ServerMsg, type Station, type TipoSabotaje,
} from "../protocol.js";
import { BURN_BLOCK_MS, csvField, PenaltyTracker, QUEMADAS_OLEADAS } from "./penalties.js";

export const PODS_TO_WIN = 5;
// supuesto: límite de 12 min pendiente de confirmar con el tutor; configurable por opción.
export const MATCH_LIMIT_MS = 12 * 60_000;
export const RECONNECT_MS = 30_000;
export const COUNTDOWN_MS = 3_000;
/**
 * Sabotajes (bloque 4): al 3.er pod limpio seguido (despachado sin ningún fallo) el árbitro aplica UN sabotaje al rival
 * (1v1 o bot; no en práctica). Mismas reglas para todos: máx. 1 por pod y 3 por partida recibidos, inmunidad de 20 s,
 * nada si el rival va 2 o más pods por detrás o está bloqueado/penalizado. El tipo sale de la semilla del árbitro.
 */
export const SABOTAJE_LIMPIOS = 3;
export const SABOTAJE_MAX_PARTIDA = 3;
export const SABOTAJE_INMUNE_MS = 20_000;
export const SABOTAJE_MS: Record<TipoSabotaje, number> = { humo: 6000, enfriamiento: 8000, "sin-pista": 8000 };
const TIPOS_SABOTAJE: TipoSabotaje[] = ["humo", "enfriamiento", "sin-pista"];
export const CSV_HEADER = "jugador;intento;zona;piezas;resultado;tiempo_ms;quemada;pod;tiempo_pod_ms;nivel;zona_nombre;pieza_correcta";

export interface ArbiterOptions {
  now?: () => number;
  countdownMs?: number;
  limitMs?: number;
  reconnectMs?: number;
  /** Semilla de los pods; por defecto se sortea. Nunca se envía a los clientes. */
  semilla?: number;
  /** 1, 2 o "mixto" (pods 1-4 de nivel 1 y el 5 con una falla de nivel 2; ver `Perfil`). */
  nivel?: Perfil;
  /** Modo demo ("cableado": Cabina/Turbina con placa; "radar": solo Radar). El cliente solo recibe `start.demo` = true. */
  demo?: Demo;
  /** Azar de la carrera final (qué pod corre); por defecto Math.random. Nunca decide el ganador. */
  azar?: () => number;
  /**
   * Modo práctica (SCRUM-151): un solo jugador, sin rival ni cuenta ni límite de tiempo; empieza al entrar,
   * termina al despachar los 5 pods (sin carrera) y no deja intentos en el CSV. Lo corre el propio cliente.
   */
  practica?: boolean;
  /**
   * Modo Oleadas (solo con `practica`): los pods no se acaban en 5 (cada 3 sube la dificultad) y la partida
   * termina al quemar `QUEMADAS_OLEADAS` piezas. El start lleva `total: 0` y `oleadas: true`.
   */
  oleadas?: boolean;
  /** Pods propios en lugar de los 5 generados (p. ej. una práctica de un solo pod); la partida termina al despachar todos. Ignorado con `oleadas`. */
  pods?: Pod[];
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
  /** Zona evaluada en cada intento (incluye la encadenada); solo para el CSV docente, nunca viaja al cliente. */
  intentoZona: ZonaPod[];
  /** Oleadas: ya salió la segunda falla (encadenada) del pod actual. */
  revelada: boolean;
  /** Pods limpios seguidos (0-3); un fallo lo pone en 0, conceder un sabotaje también. */
  limpios: number;
  /** Sabotajes recibidos (partida), pods (índice de despachados) en los que ya recibió uno, fin de la inmunidad y el sabotaje en curso. */
  sabRecibidos: number;
  sabPods: Set<number>;
  inmuneHasta: number;
  sab: { tipo: TipoSabotaje; hasta: number; de: Station } | null;
}

/**
 * Árbitro de un duelo 1 contra 1 y única fuente de verdad. No conoce la red: recibe mensajes
 * de un `peer` (cadena opaca) y envía por el callback `send`. El reloj es inyectable y el tiempo
 * avanza con `tick()` (el anfitrión lo llama cada ~100 ms; las pruebas, a mano).
 *
 * Fases: esperando → listo (2 jugadores) → cuenta (ambos pulsaron Listo, aunque uno lo hiciera esperando) → jugando → fin | anulada.
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
  /** Azar de los sabotajes: derivado de la semilla, así que la secuencia de tipos es reproducible. */
  private readonly sabAzar: () => number;
  readonly semilla: number;
  readonly nivel: Perfil;
  readonly demo: Demo;
  readonly practica: boolean;
  readonly oleadas: boolean;
  /** Mejora «Escudo» (solo práctica): absorbe la próxima quemada. */
  private escudo = false;
  /** Los 5 pods de la partida, con su solución: los mismos para ambos jugadores. En Oleadas se llena a demanda (`podAt`). */
  readonly pods: Pod[];

  constructor(private readonly send: (peer: string, msg: ServerMsg) => void, opts: ArbiterOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.countdownMs = opts.countdownMs ?? COUNTDOWN_MS;
    this.limitMs = opts.limitMs ?? MATCH_LIMIT_MS;
    this.reconnectMs = opts.reconnectMs ?? RECONNECT_MS;
    this.azar = opts.azar ?? Math.random;
    this.semilla = opts.semilla ?? Math.floor(Math.random() * 2 ** 32);
    this.sabAzar = mulberry32((this.semilla ^ 0x5ab07a6e) >>> 0);
    this.nivel = opts.nivel ?? 1;
    this.demo = opts.demo ?? false;
    this.practica = opts.practica ?? false;
    this.oleadas = this.practica && (opts.oleadas ?? false);
    this.pods = this.oleadas ? [] : opts.pods ?? generar(this.semilla, this.nivel, this.demo);
  }

  /** Práctica: aplica las mejoras del jugador (factor del enfriamiento sobre 2/4/8 s y escudo contra la próxima quemada). */
  ajustar(a: { enfriamiento: number; escudo: boolean }): void {
    if (!this.practica) return;
    this.escudo = a.escudo;
    for (const s of this.seats) s.penalties.cooldownFactor = a.enfriamiento;
  }

  private podAt(i: number): Pod {
    return (this.pods[i] ??= generarOleada(this.semilla, nivelDePod(this.nivel, 0), i + 1));
  }

  /** La zona tal como está ahora para `s`: su segunda falla si ya salió (encadenada), si no la primera. */
  private zonaDe(s: Seat, pod: Pod, zona: unknown): ZonaPod | undefined {
    return pod.encadenada?.zona === zona && s.revelada ? pod.encadenada : pod.zonas.find((x) => x.zona === zona);
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
    if (!this.practica && t - this.startAt >= this.limitMs) return this.finish("tiempo");
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
    // La práctica no registra nada: solo la cabecera.
    for (const s of this.practica ? [] : this.seats) {
      let hechos = 0, fin = 0;
      const despacho = () => {
        const ms = s.podMs[hechos++]!;
        fin += ms;
        rows.push(`${s.station};;;;despacho;${fin};no;${hechos};${ms};${nivelDePod(this.nivel, hechos - 1)};;`);
      };
      s.penalties.attemptsLog.forEach((a, i) => {
        const pod = s.intentoPod[i]!;
        while (hechos < pod - 1) despacho();
        rows.push([s.station, i + 1, a.zone, a.pieces.join("|"), a.passed ? "ok" : "fallo", a.atMs, a.burned ? "si" : "no", pod, "", nivelDePod(this.nivel, pod - 1), s.intentoZona[i]!.nombre, s.intentoZona[i]!.solucion]
          .map((v) => csvField(String(v))).join(";"));
      });
      while (hechos < s.podMs.length) despacho();
    }
    return "﻿" + [CSV_HEADER, ...rows].join("\r\n") + "\r\n";
  }

  /** Estado en vivo para el panel docente (solo lectura): sin piezas ni soluciones. */
  vivo(): { restanteMs: number; jugadores: RivalView[] } {
    const restanteMs = this.phase === "jugando" && !this.practica ? Math.max(0, this.limitMs - (this.now() - this.startAt)) : 0;
    return { restanteMs, jugadores: this.seats.map((s) => this.rivalView(s)) };
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
      podInicio: 0, podMs: [], podFallos: 0, llamas: 0, intentoPod: [], intentoZona: [], revelada: false,
      limpios: 0, sabRecibidos: 0, sabPods: new Set(), inmuneHasta: 0, sab: null,
    });
    this.seats.sort((a, b) => a.station.localeCompare(b.station));
    this.phase = this.seats.length === 2 ? "listo" : "esperando";
    this.send(peer, { t: "welcome", station, alias: name });
    if (this.practica) return this.start();
    this.broadcastLobby();
  }

  private ready(s: Seat): void {
    // Listo pulsado antes de que llegue el rival se recuerda; la cuenta espera a los 2 asientos.
    if (this.phase !== "listo" && this.phase !== "esperando") return;
    s.ready = true;
    this.broadcastLobby();
    if (this.phase === "listo" && this.seats.every((x) => x.ready)) {
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
    const pod = this.podAt(s.despachados);
    const z = this.zonaDe(s, pod, zone);
    if (!z || s.repaired.has(z.zona)) return reject("zona no válida");
    if (pieza === null || !piezaValida(z, pieza)) return reject("pieza no válida");

    const check = s.penalties.canTest(z.zona, s.lastPieza.get(z.zona) !== pieza);
    if (!check.ok) return reject(check.reason, check.waitMs);
    s.lastPieza.set(z.zona, pieza);

    const v = evaluar(z, pieza);
    const pieces = [["led", "cabina", "protegido"].includes(z.circuito) ? `R=${pieza}` : z.circuito === "divisor" ? `R2=${pieza}` : `${z.circuito}=${pieza}`];
    let waitMs = 0, escudo = false, hayMas = false;
    if (v === "correcto") {
      // Falla encadenada: acertar la primera no repara la zona; sale la segunda y se vuelve a elegir pieza (sin castigo extra).
      hayMas = pod.encadenada?.zona === z.zona && !s.revelada;
      s.penalties.registerSuccess(z.zona, pieces, !hayMas);
      if (hayMas) { s.revelada = true; s.lastPieza.delete(z.zona); } else s.repaired.add(z.zona);
      if (s.sab?.tipo === "sin-pista") s.sab = null; // «sin pista» se recupera al acertar
    } else if (v === "se quema" || v === "corto") {
      // supuesto: un cortocircuito penaliza igual que una pieza quemada.
      if (this.escudo) {
        // El escudo se gasta: cuenta como un fallo normal (enfriamiento), sin bloqueo de 4 s ni quemada.
        escudo = true;
        this.escudo = false;
        waitMs = s.penalties.registerFailure(z.zona, pieces);
      } else {
        s.penalties.registerBurn(z.zona, pieces);
        waitMs = BURN_BLOCK_MS;
      }
    } else {
      waitMs = s.penalties.registerFailure(z.zona, pieces);
    }
    s.intentoPod.push(s.despachados + 1);
    s.intentoZona.push(z);
    if (v !== "correcto") { s.podFallos++; s.limpios = 0; }
    s.penalUntil = Math.max(s.penalUntil, this.now() + waitMs);
    this.send(s.peer!, { t: "result", seq, t0, zona: z.zona, veredicto: v, waitMs, despachados: s.despachados, pod: this.podView(s), ...(escudo && { escudo }), ...(hayMas && { hayMas }), racha: s.penalties.racha, ...(!this.practica && { limpios: s.limpios }), ...(s.penalties.bonoEvento && { bono: s.penalties.bonoEvento }) });
    this.syncRival(s, t0);
    if (this.oleadas && burned(s) >= QUEMADAS_OLEADAS) this.finish(`${QUEMADAS_OLEADAS} piezas quemadas`, s.station);
  }

  /**
   * Multímetro: lee el circuito con la pieza o montaje que el jugador tiene puesto. No toca
   * penalizaciones, intentos, CSV ni el estado del rival (medir no cuenta como «Probar»).
   */
  // shortcut: el ~1 s que cuesta medir lo espera el cliente; si un cliente tramposo lo salta solo gana tiempo, no información.
  private measure(s: Seat, m: Record<string, unknown>, seq: number, t0: number): void {
    const reject = (reason: string) => this.send(s.peer!, { t: "reject", seq, t0, reason, waitMs: 0 });
    if (this.phase !== "jugando") return reject("la partida no está en juego");
    const z = this.zonaDe(s, this.podAt(s.despachados), m.zone);
    const { pieza, modo, punto } = m;
    if (!z || typeof pieza !== "string" || !piezaValida(z, pieza) || (modo !== "continuidad" && modo !== "tension") || typeof punto !== "string") {
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
    if (s.repaired.size < this.podAt(s.despachados).zonas.length) return reject("faltan zonas por reparar");
    const limpio = s.podFallos === 0;
    s.despachados++;
    s.podMs.push(this.now() - s.podInicio);
    s.podInicio = this.now();
    if (s.podFallos === 0) s.llamas++;
    s.podFallos = 0;
    s.repaired.clear();
    s.revelada = false;
    s.lastPieza.clear();
    s.penalties.newPod();
    if (limpio) s.limpios = Math.min(SABOTAJE_LIMPIOS, s.limpios + 1);
    const enviado = limpio && s.limpios >= SABOTAJE_LIMPIOS && (this.oleadas || s.despachados < this.pods.length) ? this.sabotear(s) : undefined;
    if (enviado) s.limpios = 0;
    this.send(s.peer!, { t: "despachado", seq, t0, despachados: s.despachados, pod: this.podView(s), ...(!this.practica && { limpios: s.limpios }), ...(enviado && { enviado }) });
    this.syncRival(s, t0);
    // Despachos casi simultáneos: gana el primero que llega aquí (el árbitro procesa en orden de llegada).
    if (!this.oleadas && s.despachados >= this.pods.length) this.finish("5 pods despachados", s.station);
  }

  /** Concede el sabotaje de `s` a su rival si las reglas de justicia lo permiten; devuelve el tipo aplicado. */
  private sabotear(s: Seat): TipoSabotaje | undefined {
    const r = this.seats.find((x) => x !== s), t = this.now();
    if (this.practica || !r?.peer || r.sabRecibidos >= SABOTAJE_MAX_PARTIDA || r.sabPods.has(r.despachados) || t < r.inmuneHasta
      || s.despachados - r.despachados >= 2 || t < r.penalUntil) return undefined;
    const tipo = TIPOS_SABOTAJE[Math.floor(this.sabAzar() * TIPOS_SABOTAJE.length)]!, ms = SABOTAJE_MS[tipo];
    r.sabRecibidos++; r.sabPods.add(r.despachados); r.inmuneHasta = t + SABOTAJE_INMUNE_MS;
    r.sab = { tipo, hasta: t + ms, de: s.station };
    if (tipo === "enfriamiento") r.penalties.largoHasta = t + ms;
    this.send(r.peer, { t: "sabotaje", tipo, ms, de: s.station });
    return tipo;
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
    const carrera = this.practica ? undefined : Object.fromEntries(this.seats.map((s) => [s.station, this.carril(s)]));
    this.outcome = { t: "end", phase: "fin", winner: winner ?? null, reason, score: this.score(), ...(carrera && { carrera }) };
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
    const pod = this.podAt(this.oleadas ? s.despachados : Math.min(s.despachados, this.pods.length - 1));
    // Campo por campo, sin `solucion`: la solución nunca sale del árbitro.
    return {
      numero: s.despachados + 1,
      nivel: nivelDePod(this.nivel, this.oleadas ? 0 : Math.min(s.despachados, this.pods.length - 1)),
      zonas: pod.zonas.map((z) => {
        const { zona, nombre, circuito, volts, opciones, r1, cadena } = this.zonaDe(s, pod, z.zona)!;
        return { zona, nombre, circuito, volts, opciones: [...opciones], reparada: s.repaired.has(zona), ...(r1 && { fija: `R1 ${r1} Ω` }), ...(cadena && { cadena: [...cadena] }) };
      }),
    };
  }

  private rivalView(s: Seat): RivalView {
    const estado = !s.peer ? "sin-conexion" : this.now() < s.penalUntil ? "penalizado" : "reparando";
    return { alias: s.alias, despachados: s.despachados, estado };
  }

  private snapshot(s: Seat): ServerMsg {
    const other = this.seats.find((x) => x !== s);
    return {
      t: "start", restanteMs: this.practica ? 0 : this.limitMs - (this.now() - this.startAt), despachados: s.despachados,
      total: this.oleadas ? 0 : this.pods.length, nivel: nivelDePod(this.nivel, 0), demo: this.demo !== false, pod: this.podView(s), rival: other ? this.rivalView(other) : null,
      racha: s.penalties.racha,
      ...(!this.practica && { limpios: s.limpios }),
      ...(s.sab && this.now() < s.sab.hasta && (s.sab.tipo !== "enfriamiento" || s.penalties.largoHasta > 0) && { sabotaje: { tipo: s.sab.tipo, ms: s.sab.hasta - this.now(), de: s.sab.de } }),
      ...(this.practica && { practica: true }), ...(this.oleadas && { oleadas: true }),
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
