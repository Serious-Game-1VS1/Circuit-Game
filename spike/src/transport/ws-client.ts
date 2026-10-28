import type { PeerId, SalaInfo, SalaPublica, Transport } from "./transport.js";

/**
 * Cliente del relé local con el WebSocket estándar: corre igual en Node (≥ 22) y en el navegador,
 * así el cliente Phaser reutiliza este archivo. El relé está en local.ts.
 * Relé -> participante: { from: PeerId, data } | { joined: PeerId } | { left: PeerId }
 */
export class LocalTransport implements Transport {
  private ws?: WebSocket;
  onMessage: (data: unknown, from: PeerId) => void = () => {};
  onLeave?: (peer: PeerId) => void;
  onClose?: () => void;

  constructor(private readonly url: string) {}

  create(code: string) { return this.open(code, "create"); }
  join(code: string) { return this.open(code, "join"); }

  private open(code: string, op: "create" | "join"): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(`${this.url}/?room=${encodeURIComponent(code)}&op=${op}`));
      let joined = false;
      ws.addEventListener("close", (e) => {
        reject(new Error(e.reason || "conexión cerrada"));
        if (joined && this.ws === ws) this.onClose?.(); // close() suelta this.ws antes: no cuenta como pérdida
      }, { once: true });
      ws.addEventListener("message", (e) => {
        const msg = JSON.parse(String(e.data)) as { joined?: PeerId; from?: PeerId; left?: PeerId; data?: unknown };
        if (msg.joined) { joined = true; resolve(); }
        else if (msg.left) this.onLeave?.(msg.left);
        else if (msg.from) this.onMessage(msg.data, msg.from);
      });
    });
  }

  send(data: unknown, to?: PeerId) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ to, data }));
  }

  publicar(info: SalaPublica) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ info }));
  }

  /** Consulta puntual al relé (conexión aparte, no toca la sala en la que esté este transporte). */
  listar(): Promise<SalaInfo[]> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.url}/?room=-&op=list`);
      let salas: SalaInfo[] | undefined;
      ws.addEventListener("message", (e) => { salas = (JSON.parse(String(e.data)) as { salas: SalaInfo[] }).salas; });
      ws.addEventListener("close", () => (salas ? resolve(salas) : reject(new Error("no se pudo listar las salas"))), { once: true });
    });
  }

  close(): Promise<void> {
    const ws = this.ws;
    this.ws = undefined;
    if (!ws || ws.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((r) => { ws.addEventListener("close", () => r(), { once: true }); ws.close(); });
  }
}
