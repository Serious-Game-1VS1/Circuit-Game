import type { ClientMsg, Nivel, Result, ServerMsg } from "../../spike/src/protocol";
import { PhotonTransport } from "../../spike/src/transport/photon";
import type { SalaInfo, Transport } from "../../spike/src/transport/transport";
export type { SalaInfo };
import { LocalTransport } from "../../spike/src/transport/ws-client";
import { validAlias } from "../../spike/src/protocol";
import { registrar, type Dominio } from "./dominio";
import { COOLDOWN_CORTO, elegir, sinMejoras, type Mejora } from "./mejoras";
import { PracticaTransport } from "./practica";
import { ContraBotTransport, type DificultadBot } from "./contraBot";
import { DIAGNOSTICO } from "./progreso";
import { mecanica } from "./tutorial";
import { despachable, inicial, normalizarCodigo, reducir, terminada, validarEntrada, type Pantalla } from "./pantalla";

const REINTENTOS = 15;
const PAUSA_MS = 2000;
const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Config {
  VITE_TRANSPORT?: string;
  VITE_PHOTON_APP_ID?: string;
  VITE_PHOTON_REGION?: string;
}

type LocationLike = { hostname: string; search: string };

export class Net {
  public estado: Pantalla = inicial();
  /** La práctica en curso es el tutorial (semilla fija): el Taller dibuja la capa guiada. */
  public tutorial = false;
  /** Id de la mecánica del tutorial en curso (null si no es tutorial). */
  public idTutorial: string | null = null;
  /** Aciertos y fallos por concepto de la partida en curso; main.ts los pasa al perfil al terminar. */
  public dominio: Dominio = {};
  /** Mecánicas de la práctica: mejoras activas, puntos extra del Doble puntos (suman al XP final) y mejor racha de llamas de la partida. */
  public mejoras = sinMejoras();
  public extra = 0;
  public mejorRacha = 0;
  /** Oleadas, falla encadenada: segundas fallas reveladas, la que está en curso (¿midió? ¿falló ya?) y diagnósticos premiados (suman DIAGNOSTICO al XP). */
  public hayMas = 0;
  public segunda?: { zona: number; medido: boolean; fallo: boolean };
  public diagnosticos = 0;
  /** Tiempo de cada pod despachado (ms) y mejoras elegidas en la partida: alimentan la carrera contra tu récord. */
  public podMs: number[] = [];
  public usadas: Mejora[] = [];
  public onCambio: (p: Pantalla) => void = () => {};
  private seq = 0;
  private listando?: Promise<{ salas: SalaInfo[]; motivo?: string }>;
  private sala?: { codigo: string; alias: string };
  /** Código de la sala del duelo ("" en práctica). */
  public get codigo() { return this.sala?.codigo ?? ""; }

  /** El transporte en uso: el del duelo, o el de la práctica mientras dura. */
  private transport: Transport;

  constructor(
    private readonly duelo: Transport,
    private readonly getTime: () => number = Date.now,
    private readonly pausaReconectarMs = PAUSA_MS,
  ) {
    this.transport = duelo;
    this.conectar(duelo);
  }

  private conectar(transport: Transport): void {
    transport.onMessage = (message) => this.onMessage(message);
    transport.onClose = () => {
      void this.reconectar();
    };
  }

  /** Práctica en solitario (SCRUM-151): sin sala ni rival, empieza al instante. Termina con `salir()` o al despachar los 5 pods. */
  public async practicar(alias: string, nivel: Nivel = 1, tutorial = false, oleadas = false, id: string | null = null): Promise<void> {
    if (!validAlias(alias)) {
      this.poner({ ...this.estado, aviso: "El alias debe tener de 1 a 12 caracteres" });
      return;
    }
    await this.salir();
    this.tutorial = tutorial;
    const mec = tutorial && id ? mecanica(id) : undefined;
    this.idTutorial = mec ? id : null;
    this.mejoras = sinMejoras(); this.extra = 0; this.mejorRacha = 0; this.podMs = []; this.usadas = [];
    this.hayMas = 0; this.segunda = undefined; this.diagnosticos = 0;
    this.transport = mec ? new PracticaTransport(mec.nivel, mec.semilla, false, mec.pod) : new PracticaTransport(nivel, undefined, oleadas);
    this.conectar(this.transport);
    this.poner({ ...this.estado, practica: true }); // evita la fase Sala en el welcome
    await this.transport.join("");
    this.enviar({ t: "hello", alias: alias.trim() });
  }

  /** Duelo contra un bot: como `practicar` pero la partida es un duelo (rival, start, 5 pods, sin `practica`). */
  public async jugarSolo(alias: string, nivel: Nivel = 1, dificultad: DificultadBot = "normal"): Promise<void> {
    if (!validAlias(alias)) {
      this.poner({ ...this.estado, aviso: "El alias debe tener de 1 a 12 caracteres" });
      return;
    }
    await this.salir();
    this.tutorial = false; this.idTutorial = null;
    this.mejoras = sinMejoras(); this.extra = 0; this.mejorRacha = 0; this.podMs = []; this.usadas = [];
    this.hayMas = 0; this.segunda = undefined; this.diagnosticos = 0;
    this.transport = new ContraBotTransport(nivel, undefined, dificultad);
    this.conectar(this.transport);
    await this.transport.join("");
    this.enviar({ t: "hello", alias: alias.trim() });
  }

  public async entrar(codigo: string, alias: string): Promise<void> {
    const aviso = validarEntrada(codigo, alias);
    if (aviso) {
      this.poner({ ...this.estado, aviso });
      return;
    }

    const sala = { codigo: normalizarCodigo(codigo), alias: alias.trim() };
    try {
      await this.transport.join(sala.codigo);
    } catch (e) {
      this.poner({ ...this.estado, fase: "entrar", alias: sala.alias, aviso: avisoDeJoin(e) });
      return;
    }

    this.sala = sala;
    this.enviar({ t: "hello", alias: sala.alias });
  }

  /**
   * Salas abiertas ahora (nunca rechaza). Sin conexión, sin soporte o pasado `esperaMs`: `salas` vacío y `motivo` con el texto para la pantalla.
   * La pantalla repite la consulta cada pocos segundos; entrar sigue siendo `entrar(codigo, alias)`.
   */
  public listarSalas(esperaMs = 5000): Promise<{ salas: SalaInfo[]; motivo?: string }> {
    return (this.listando ??= this.consultarSalas(esperaMs).finally(() => { this.listando = undefined; })); // una sola consulta a la vez
  }

  /** Cierra la conexión de lobby (panel o escena cerrados). */
  public dejarDeListar(): void {
    this.duelo.soltarLobby?.();
  }

  private async consultarSalas(esperaMs: number): Promise<{ salas: SalaInfo[]; motivo?: string }> {
    const sinConexion = { salas: [], motivo: "No se pudo consultar las salas. Revisa tu conexión." };
    if (!this.duelo.listar) return sinConexion;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const limite = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error("tiempo agotado")), esperaMs); });
      return { salas: await Promise.race([this.duelo.listar(), limite]) };
    } catch {
      this.duelo.soltarLobby?.(); // conexión a medias: se corta para que la próxima consulta empiece limpia
      return sinConexion;
    } finally {
      clearTimeout(timer);
    }
  }

  public async reconectar(): Promise<void> {
    const sala = this.sala;
    if (!sala || terminada(this.estado)) return;

    this.poner({ ...this.estado, aviso: "Conexión perdida: reconectando…" });
    for (let intento = 0; intento < REINTENTOS; intento++) {
      if (intento > 0) await dormir(this.pausaReconectarMs);
      if (this.sala !== sala) return;
      try {
        await this.transport.join(sala.codigo);
        if (this.sala !== sala) return;
        this.enviar({ t: "hello", alias: sala.alias });
        return;
      } catch {
        if (this.sala !== sala) return;
      }
    }

    this.sala = undefined;
    this.poner({
      ...inicial(),
      alias: sala.alias,
      aviso: "No se pudo reconectar a la sala",
    });
  }

  public async salir(): Promise<void> {
    const alias = this.estado.alias;
    this.sala = undefined;
    this.tutorial = false; this.idTutorial = null;
    await this.transport.close();
    this.transport = this.duelo;
    this.poner({ ...inicial(), alias });
  }

  public listo(): void {
    this.enviar({ t: "ready" });
  }

  public probar(zone: number, pieza: string): void {
    this.enviar({ t: "test", seq: ++this.seq, t0: this.getTime(), zone, pieza });
  }

  /** Multímetro: no es «Probar» ni penaliza. Devuelve el seq para reconocer su Medida. */
  public medir(zone: number, pieza: string, modo: "continuidad" | "tension", punto: string): number {
    if (this.segunda?.zona === zone) this.segunda.medido = true;
    this.enviar({ t: "medir", seq: ++this.seq, t0: this.getTime(), zone, pieza, modo, punto });
    return this.seq;
  }

  public despachar(): void {
    if (!despachable(this.estado)) return;
    this.poner({ ...this.estado, despachando: true });
    this.enviar({ t: "despachar", seq: ++this.seq, t0: this.getTime() });
  }

  /** Elige una mejora; el enfriamiento y el escudo los aplica el árbitro local de la práctica. */
  public elegirMejora(m: Mejora): void {
    this.mejoras = elegir(this.mejoras, m);
    this.usadas = [...this.usadas, m];
    if (this.transport instanceof PracticaTransport) this.transport.arbiter.ajustar({ enfriamiento: this.mejoras.enfriamiento ? COOLDOWN_CORTO : 1, escudo: this.mejoras.escudo });
  }

  public limpiarAviso(): void {
    this.poner({ ...this.estado, aviso: null });
  }

  public onMessage(message: unknown): void {
    if (!message || typeof message !== "object") return;
    const msgObj = message as Record<string, unknown>;
    if (!("t" in msgObj) || typeof msgObj.t !== "string") return;

    if (msgObj.t === "end" && this.idTutorial) return; // el tutorial de un pod termina en el Taller (paso «¡Listo!»), no en el menú
    if (msgObj.t === "result" && msgObj.escudo) this.mejoras = { ...this.mejoras, escudo: false }; // el árbitro gastó el escudo
    if (msgObj.t === "result") this.encadenada(message as Result);
    const estadoActual = this.estado ?? inicial();
    const tiempoActual = typeof this.getTime === "function" ? this.getTime() : Date.now();
    this.dominio = registrar(this.dominio, message as ServerMsg, estadoActual.pod);
    const nuevoEstado = reducir(estadoActual, message as ServerMsg, tiempoActual);
    
    this.poner(nuevoEstado);
    // Terminó la práctica (volvió a la entrada): se suelta su árbitro local.
    if (nuevoEstado.fase === "entrar" && !nuevoEstado.practica && this.transport !== this.duelo) {
      void this.transport.close();
      this.transport = this.duelo;
      this.tutorial = false; this.idTutorial = null;
    }
  }

  /** Falla encadenada: al salir la segunda se empieza a vigilar; acertarla a la primera tras medir da el bono «Diagnóstico». */
  private encadenada(m: Result): void {
    if (m.hayMas) {
      this.hayMas++;
      this.segunda = { zona: m.zona, medido: false, fallo: false };
    } else if (this.segunda?.zona === m.zona) {
      if (m.veredicto !== "correcto") this.segunda.fallo = true;
      else {
        if (this.segunda.medido && !this.segunda.fallo) { this.extra += DIAGNOSTICO; this.diagnosticos++; }
        this.segunda = undefined;
      }
    }
  }

  public verPodio(): void {
    if (this.estado.fase === "carrera") this.poner({ ...this.estado, fase: "podio" });
  }

  private enviar(message: ClientMsg): void {
    this.transport.send(message);
  }

  private poner(estado: Pantalla): void {
    this.estado = estado ?? inicial();
    if (typeof this.onCambio === "function") {
      this.onCambio(this.estado);
    }
  }
}

/** Qué falló al entrar: sala inexistente o llena (relé: "no existe"; Photon: 32758/32765), App ID o región inválidos (32767/32756) o la conexión. Sin valores de configuración. */
export function avisoDeJoin(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (/no existe|error 32758|error 32765/i.test(m)) return "No hay una sala abierta con ese código";
  if (/error 32767|error 32756/i.test(m)) return "El servidor de juego no está bien configurado. Avisa al docente.";
  return "No se pudo conectar con el servidor de juego. Revisa tu conexión.";
}

/** VITE_TRANSPORT=photon|local; por defecto Photon se usa solo cuando hay App ID. */
export function elegirTransporte(config: Config): "photon" | "local" {
  const transporte = config.VITE_TRANSPORT?.trim();
  if (transporte === "local" || transporte === "photon") return transporte;
  return config.VITE_PHOTON_APP_ID?.trim() ? "photon" : "local";
}

export function crearTransporte(
  config: Config,
  location?: LocationLike,
): Transport {
  if (elegirTransporte(config) === "local") {
    return relayLocal(location ?? browserLocation());
  }

  const appId = config.VITE_PHOTON_APP_ID?.trim();
  if (!appId) {
    throw new Error("VITE_TRANSPORT=photon necesita VITE_PHOTON_APP_ID en cliente/.env.local");
  }
  return new PhotonTransport(appId, config.VITE_PHOTON_REGION?.trim() || "us");
}

function browserLocation(): LocationLike {
  if (typeof window === "undefined") return { hostname: "localhost", search: "" };
  return window.location;
}

export const relayLocal = (location: LocationLike): LocalTransport =>
  new LocalTransport(
    new URLSearchParams(location.search).get("relay") ??
      `ws://${location.hostname || "localhost"}:8787`,
  );

export { Net as NetManager };
/** Solo las salas a las que se puede entrar, las más llenas primero (luego por código). */
export function salasAbiertas(salas: SalaInfo[]): SalaInfo[] {
  return salas.filter((s) => s.estado === "esperando").sort((a, b) => b.jugadores - a.jugadores || a.codigo.localeCompare(b.codigo));
}
export const textoSala = (s: SalaInfo) => `${s.codigo}  NIVEL ${s.nivel}  ${s.jugadores}/${s.max}`;

/** Partida rápida: la sala «esperando» con más jugadores (empate: código menor). El nivel lo fija el servidor, no cuenta. */
export const elegirSalaRapida = (salas: SalaInfo[]): SalaInfo | null => salasAbiertas(salas)[0] ?? null;

/** Solo A-Z0-9, mayúsculas, máximo 6. */
export const sanearCodigo = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

/** Código de `?sala=` de la URL, o "" si no son 6 caracteres válidos. */
export function salaDeUrl(search: string): string {
  const c = sanearCodigo(new URLSearchParams(search).get("sala") ?? "");
  return c.length === 6 ? c : "";
}

/** Enlace para compartir: solo origen, ruta y `?sala=`; nunca alias ni otros parámetros. */
export function urlDeSala(href: string, codigo: string): string {
  const u = new URL(href);
  return `${u.origin}${u.pathname}?sala=${sanearCodigo(codigo)}`;
}

export const textoCompartir = (href: string, codigo: string) => `Juega CircuitSync conmigo: ${urlDeSala(href, codigo)}`;
