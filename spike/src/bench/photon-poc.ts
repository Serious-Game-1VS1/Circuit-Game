import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { PhotonTransport } from "../transport/photon.js";
import { pct, row, runSession } from "./session.js";

/**
 * Prueba de concepto SCRUM-2/88/20: el árbitro (Node, sin interfaz) crea una sala en Photon Cloud con un
 * código de 6 caracteres, dos clientes Node entran por ese código, intercambian acciones y se mide el RTT.
 * Uso: npm run poc:photon   (lee PHOTON_APP_ID y PHOTON_REGION de spike/.env; nunca se imprime el App ID).
 * Escribe el resultado en bench-out/photon-<fecha>.json. 3 CCU por sala (árbitro + 2 jugadores).
 */
if (existsSync(".env")) process.loadEnvFile(".env");
const appId = process.env.PHOTON_APP_ID?.trim();
const region = process.env.PHOTON_REGION?.trim() || "us";
const durationMs = Number(process.env.POC_DURATION_MS) || 20_000;

async function main() {
  if (!appId) throw new Error("Falta PHOTON_APP_ID en spike/.env");
  const r = await runSession(() => new PhotonTransport(appId, region), { rooms: 1, durationMs, everyMs: 250, settleMs: 2_000 });
  const stats = (xs: number[]) => ({ n: xs.length, p50: +pct(xs, 50).toFixed(2), p95: +pct(xs, 95).toFixed(2), max: +Math.max(...xs).toFixed(2) });
  const out = {
    date: new Date().toISOString(),
    transport: "photon-realtime 4.4.0 · WSS:443 · Photon Cloud",
    region,
    players: 2,
    durationMs,
    rttArbiterMs: stats(r.own),
    mirrorMs: stats(r.mirror),
    sameState: r.sameState.every(Boolean),
  };
  mkdirSync("bench-out", { recursive: true });
  const file = `bench-out/photon-${out.date.replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nTransporte: ${out.transport} · región ${region} · mismo estado en ambos clientes: ${out.sameState}\n`);
  console.log(row("Despacho -> rival (reflejo)", r.mirror, 250));
  console.log(row("Probar -> resultado (RTT)", r.own, 150));
  console.log(`\nResultado: ${file}`);
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
