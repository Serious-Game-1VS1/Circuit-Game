import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { Arbiter } from "./arbiter/arbiter.js";
import { hostRoom, createRoom } from "./transport/room.js";
import { LocalTransport, startLocalRelay } from "./transport/local.js";
import { PhotonTransport } from "./transport/photon.js";
import type { Transport } from "./transport/transport.js";

/**
 * npm run serve: relé local en ws://localhost:8787 + árbitro con una sala (una por proceso).
 * npm run serve:photon: árbitro en Photon Cloud (WSS:443). Siempre deja una sala libre abierta: cuando
 * una se llena, abre otra con un código nuevo; así caben varios duelos a la vez (hasta MAX_SALAS).
 * El cliente (cliente/, npm run dev) entra con el código. Al terminar cada partida guarda su CSV en bench-out/.
 */
const photon = process.argv.includes("--photon");
// Cada sala Photon usa 3 CCU (árbitro + 2 jugadores); el plan gratuito admite 20 CCU.
const MAX_SALAS = Number(process.env.MAX_SALAS) || 6;

/** Vigila la fase; al terminar guarda el CSV y llama a `fin` (con pausa para que salga el mensaje final). */
function vigilar(code: string, arbiter: Arbiter, fin: () => void) {
  let last = arbiter.phase;
  const timer = setInterval(() => {
    if (arbiter.phase === last) return;
    last = arbiter.phase;
    console.log(`[${code}] fase: ${last}`);
    if (last === "fin" || last === "anulada") {
      clearInterval(timer);
      mkdirSync("bench-out", { recursive: true });
      const file = `bench-out/intentos-${code}.csv`;
      writeFileSync(file, arbiter.toCsv());
      console.log(`[${code}] resultado: ${JSON.stringify(arbiter.outcome)} · CSV: ${file}`);
      setTimeout(fin, 1000);
    }
  }, 200);
}

async function abrir(t: Transport, alTerminar: () => void) {
  const code = await createRoom(t);
  const room = hostRoom(t);
  vigilar(code, room.arbiter, () => { room.stop(); void t.close().then(alTerminar); });
  return { code, arbiter: room.arbiter };
}

if (photon) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const appId = process.env.PHOTON_APP_ID?.trim();
  const region = process.env.PHOTON_REGION?.trim() || "us";
  if (!appId) throw new Error("Falta PHOTON_APP_ID en spike/.env");
  const salas = new Map<string, Arbiter>();
  let abriendo = false;
  const asegurarSalaLibre = async () => {
    const libres = [...salas.values()].filter((a) => a.phase === "esperando").length;
    if (abriendo || libres > 0 || salas.size >= MAX_SALAS) return;
    abriendo = true;
    try {
      const { code, arbiter } = await abrir(new PhotonTransport(appId, region), () => { salas.delete(code); });
      salas.set(code, arbiter);
      console.log(`Photon (${region}) · sala nueva, código: ${code} · salas abiertas: ${salas.size}`);
    } catch (e) {
      console.error(`No se pudo abrir sala en Photon: ${(e as Error).message}`);
    } finally {
      abriendo = false;
    }
  };
  await asegurarSalaLibre();
  setInterval(() => void asegurarSalaLibre(), 1000);
} else {
  const PORT = Number(process.env.PORT) || 8787;
  const relay = await startLocalRelay(PORT);
  const { code } = await abrir(new LocalTransport(`ws://localhost:${PORT}`), () => void relay.close().then(() => process.exit(0)));
  console.log(`Relé en ws://localhost:${PORT} · código de sala: ${code}`);
}
