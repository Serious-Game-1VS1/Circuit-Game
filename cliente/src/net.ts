/**
 * Capa de red del cliente: habla el protocolo del árbitro (spike/src/protocol.ts) sobre cualquier
 * Transport: Photon Cloud (spike/src/transport/photon.ts, WSS:443) o el relé local (ws-client.ts).
 * Ambos archivos son los mismos que usa el árbitro en Node.
 */
import type { ClientMsg, ServerMsg } from "../../spike/src/protocol";
import { PhotonTransport } from "../../spike/src/transport/photon";
import type { Transport } from "../../spike/src/transport/transport";
import { LocalTransport } from "../../spike/src/transport/ws-client";
import { despachar, inicial, normalizarCodigo, reducir, validarEntrada, type Pantalla } from "./pantalla";

// El árbitro guarda el asiento 30 s (RECONNECT_MS); se reintenta cada 2 s dentro de esa ventana.
const REINTENTOS = 15, PAUSA_MS = 2000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Net {
  estado: Pantalla = inicial();
  onCambio: (p: Pantalla) => void = () => {};
  private seq = 0;
  private sala?: { codigo: string; alias: string };

  constructor(private readonly t: Transport, private readonly ahora: () => number = Date.now, private readonly pausaMs = PAUSA_MS) {
    t.onMessage = (m) => this.poner(reducir(this.estado, m as ServerMsg, this.ahora()));
    t.onClose = () => void this.reconectar();
  }

  /** Entrar con código y alias (SCRUM-21). Para reconectar basta repetirlo con el mismo alias. */
  async entrar(codigo: string, alias: string): Promise<void> {
    const aviso = validarEntrada(codigo, alias);
    if (aviso) return this.poner({ ...this.estado, aviso });
    const sala = { codigo: normalizarCodigo(codigo), alias: alias.trim() };
    try {
      await this.t.join(sala.codigo);
    } catch {
      return this.poner({ ...this.estado, aviso: "No hay una sala abierta con ese código" });
    }
    this.sala = sala;
    this.enviar({ t: "hello", alias: sala.alias });
  }

  /** Se cayó la conexión: vuelve a la misma sala con el mismo alias mientras el árbitro guarda el asiento. */
  async reconectar(): Promise<void> {
    const sala = this.sala;
    if (!sala || this.estado.fase === "fin") return;
    this.poner({ ...this.estado, aviso: "Conexión perdida: reconectando…" });
    for (let i = 0; i < REINTENTOS; i++) {
      if (i) await dormir(this.pausaMs);
      if (this.sala !== sala) return; // el jugador salió mientras tanto
      try {
        await this.t.join(sala.codigo);
        this.enviar({ t: "hello", alias: sala.alias });
        return;
      } catch { /* sin red todavía: se reintenta */ }
    }
    this.sala = undefined;
    this.poner({ ...inicial(), alias: sala.alias, aviso: "No se pudo reconectar a la sala" });
  }

  /** "Volver a jugar": deja la sala y vuelve a Entrar conservando el alias. */
  async salir(): Promise<void> {
    const alias = this.estado.alias;
    this.sala = undefined;
    await this.t.close();
    this.poner({ ...inicial(), alias });
  }

  listo() { this.enviar({ t: "ready" }); }

  /** "Probar" con una de las `opciones` de la zona: el veredicto llega después desde el árbitro. */
  probar(zone: number, pieza: string) { this.enviar({ t: "test", seq: ++this.seq, t0: this.ahora(), zone, pieza }); }

  /** "Despachar" el pod reparado (local: el árbitro ya lo contó). */
  despachar() { if (this.estado.despachable) this.poner(despachar(this.estado)); }

  private enviar(m: ClientMsg) { this.t.send(m); }

  private poner(p: Pantalla) {
    this.estado = p;
    this.onCambio(p);
  }
}

export interface Config {
  VITE_TRANSPORT?: string;
  VITE_PHOTON_APP_ID?: string;
  VITE_PHOTON_REGION?: string;
}

/** VITE_TRANSPORT=photon|local; si no se indica: photon cuando hay App ID, si no el relé local. */
export function elegirTransporte(c: Config): "photon" | "local" {
  const t = c.VITE_TRANSPORT?.trim();
  if (t === "photon" || t === "local") return t;
  return c.VITE_PHOTON_APP_ID?.trim() ? "photon" : "local";
}

export function crearTransporte(c: Config, loc: { hostname: string; search: string }): Transport {
  if (elegirTransporte(c) === "local") return relayLocal(loc);
  const appId = c.VITE_PHOTON_APP_ID?.trim();
  if (!appId) throw new Error("VITE_TRANSPORT=photon necesita VITE_PHOTON_APP_ID en cliente/.env.local");
  return new PhotonTransport(appId, c.VITE_PHOTON_REGION?.trim() || "us");
}

/** Relé en el mismo host que sirve la página (puerto 8787) salvo ?relay=ws://... */
export const relayLocal = (loc: { hostname: string; search: string }) =>
  new LocalTransport(new URLSearchParams(loc.search).get("relay") ?? `ws://${loc.hostname || "localhost"}:8787`);
