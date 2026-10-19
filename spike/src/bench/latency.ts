import { LocalTransport, startLocalRelay } from "../transport/local.js";
import { row, runSession } from "./session.js";

/**
 * Medición de RNF-02 con 8 jugadores (4 salas de 2) sobre el relé local (línea base sin Photon).
 * Metas del anteproyecto (RNF-02): "Probar" -> resultado p95 <= 150 ms; despacho -> progreso del rival p95 <= 250 ms.
 * Con Photon, el mismo runSession corre cambiando solo el transporte (ver photon-poc.ts).
 */
const ROOMS = 4;
const PORT = 8787;

async function main() {
  const relay = await startLocalRelay(PORT);
  try {
    const r = await runSession(() => new LocalTransport(`ws://localhost:${PORT}`), { rooms: ROOMS, settleMs: 300 });
    console.log(`\nTransporte: WebSocket local · ${ROOMS * 2} jugadores · mismo estado en las ${ROOMS} salas: ${r.sameState.every(Boolean)}\n`);
    console.log(row("Despacho -> rival (reflejo)", r.mirror, 250));
    console.log(row("Probar -> resultado (RTT)", r.own, 150));
  } finally {
    await relay.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
