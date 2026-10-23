import type { ClientMsg, ServerMsg } from "../../spike/src/protocol";
import { PhotonTransport } from "../../spike/src/transport/photon";
import type { Transport } from "../../spike/src/transport/transport";
import { LocalTransport } from "../../spike/src/transport/ws-client";
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
  public onCambio: (p: Pantalla) => void = () => {};
  private seq = 0;
  private sala?: { codigo: string; alias: string };

  constructor(
    private readonly transport: Transport,
    private readonly getTime: () => number = Date.now,
    private readonly pausaReconectarMs = PAUSA_MS,
  ) {
    transport.onMessage = (message) => this.onMessage(message);
    transport.onClose = () => {
      void this.reconectar();
    };
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
    } catch {
      this.poner({
        ...this.estado,
        fase: "entrar",
        alias: sala.alias,
        aviso: "No hay una sala abierta con ese código",
      });
      return;
    }

    this.sala = sala;
    this.enviar({ t: "hello", alias: sala.alias });
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
    await this.transport.close();
    this.poner({ ...inicial(), alias });
  }

  public listo(): void {
    this.enviar({ t: "ready" });
  }

  public probar(zone: number, pieza: string): void {
    this.enviar({ t: "test", seq: ++this.seq, t0: this.getTime(), zone, pieza });
  }

  public medir(zone: number, pieza: string, modo: "continuidad" | "tension", punto: string): void {
    this.enviar({ t: "medir", seq: ++this.seq, t0: this.getTime(), zone, pieza, modo, punto });
  }

  public despachar(): void {
    if (!despachable(this.estado)) return;
    this.poner({ ...this.estado, despachando: true });
    this.enviar({ t: "despachar", seq: ++this.seq, t0: this.getTime() });
  }

  public limpiarAviso(): void {
    this.poner({ ...this.estado, aviso: null });
  }

  public onMessage(message: unknown): void {
    if (!message || typeof message !== "object") return;
    const msgObj = message as Record<string, unknown>;
    if (!("t" in msgObj) || typeof msgObj.t !== "string") return;

    const estadoActual = this.estado ?? inicial();
    const tiempoActual = typeof this.getTime === "function" ? this.getTime() : Date.now();
    const nuevoEstado = reducir(estadoActual, message as ServerMsg, tiempoActual);
    
    this.poner(nuevoEstado);
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