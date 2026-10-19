import type { AddressInfo } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import type { PeerId } from "./transport.js";

export { LocalTransport } from "./ws-client.js";

/**
 * Transporte local: un relé WebSocket en localhost que imita lo que hace Photon Cloud
 * (salas por código, un id por participante, envío dirigido, aviso de salida al anfitrión).
 * No contiene lógica de juego: el árbitro entra a la sala como un participante más (ver room.ts).
 *
 * Participante -> relé: { to?: PeerId, data }      (sin `to`: al anfitrión)
 * Relé -> participante: { from: PeerId, data } | { joined: PeerId } | { left: PeerId } (solo al anfitrión)
 */
export function startLocalRelay(port: number): Promise<{ port: number; close: () => Promise<void> }> {
  const rooms = new Map<string, { host: PeerId; peers: Map<PeerId, WebSocket> }>();
  let nextId = 1;
  const wss = new WebSocketServer({ port });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const code = url.searchParams.get("room") ?? "";
    const op = url.searchParams.get("op");
    if (!code || (op !== "create" && op !== "join")) return ws.close(4000, "sala u operación inválida");
    if (op === "create" && rooms.has(code)) return ws.close(4001, "la sala ya existe");
    if (op === "join" && !rooms.has(code)) return ws.close(4002, "la sala no existe");

    const id = String(nextId++);
    if (op === "create") rooms.set(code, { host: id, peers: new Map() });
    const room = rooms.get(code)!;
    room.peers.set(id, ws);
    ws.send(JSON.stringify({ joined: id }));

    ws.on("message", (raw) => {
      let msg: { to?: PeerId; data?: unknown };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      room.peers.get(msg.to ?? room.host)?.send(JSON.stringify({ from: id, data: msg.data }));
    });
    ws.on("close", () => {
      room.peers.delete(id);
      if (id === room.host) rooms.delete(code);
      else room.peers.get(room.host)?.send(JSON.stringify({ left: id }));
    });
  });

  return new Promise((resolve) => {
    wss.on("listening", () =>
      resolve({ port: (wss.address() as AddressInfo).port, close: () => new Promise<void>((r) => { for (const c of wss.clients) c.terminate(); wss.close(() => r()); }) }),
    );
  });
}
