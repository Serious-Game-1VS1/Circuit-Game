import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { RECONNECT_MS, type Arbiter } from "./arbiter/arbiter.js";
import type { Demo } from "./engine/generador.js";
import type { Nivel } from "./protocol.js";
import { hostRoom, createRoom } from "./transport/room.js";
import { LocalTransport, startLocalRelay } from "./transport/local.js";
import { PhotonTransport } from "./transport/photon.js";
import type { Transport } from "./transport/transport.js";

/**
 * npm run serve: relé local en ws://localhost:8787 + árbitro con una sala (una por proceso).
 * npm run serve:photon: árbitro en Photon Cloud (WSS:443). Siempre deja una sala libre abierta: cuando
 * una se llena, abre otra con un código nuevo; así caben varios duelos a la vez (hasta MAX_SALAS).
 * El cliente (cliente/, npm run dev) entra con el código. Al terminar cada partida guarda su CSV en bench-out/.
 *
 * Opciones (también por variable de entorno): --nivel 1|2 (NIVEL, por defecto 1) y --semilla N (SEMILLA,
 * entero 0..2^32-1, por defecto aleatoria). Ej.: npm run serve -- --nivel 2 --semilla 42.
 * --demo (o DEMO=1): modo demo de cableado (Cabina y Turbina: arrastrar piezas a la placa y unirlas con cables).
 * --demo radar (o DEMO=radar): el demo anterior (5 pods solo con Radar: LED + resistencia).
 * La semilla se imprime en consola y va en el nombre del CSV (nunca se envía a los clientes); con
 * --semilla en Photon todas las salas usan la misma.
 */
const photon = process.argv.includes("--photon");
const opcion = (flag: string, env: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : process.env[env];
};
const nivelTxt = opcion("--nivel", "NIVEL") ?? "1";
if (nivelTxt !== "1" && nivelTxt !== "2") throw new Error(`--nivel debe ser 1 o 2 (llegó "${nivelTxt}")`);
const nivel: Nivel = nivelTxt === "2" ? 2 : 1;
const semillaTxt = opcion("--semilla", "SEMILLA");
const semilla = semillaTxt === undefined ? undefined : Number(semillaTxt);
if (semilla !== undefined && !(/^\d+$/.test(semillaTxt!) && semilla < 2 ** 32)) throw new Error(`--semilla debe ser un entero de 0 a 2^32-1 (llegó "${semillaTxt}")`);
// --demo (o DEMO=1) = demo de cableado; --demo radar (o DEMO=radar) = el demo anterior, solo Radar.
const demoTxt = process.argv.includes("--demo") ? (opcion("--demo", "DEMO") === "radar" ? "radar" : "1") : process.env.DEMO;
const demo: Demo = demoTxt === "radar" ? "radar" : demoTxt === "1" ? "cableado" : false;
// Cada sala Photon usa 3 CCU (árbitro + 2 jugadores); el plan gratuito admite 20 CCU.
const MAX_SALAS = Number(process.env.MAX_SALAS) || 6;

/** Vigila la fase; al terminar guarda el CSV y llama a `fin` (con pausa para que salga el mensaje final y se pueda reconectar). */
function vigilar(code: string, arbiter: Arbiter, fin: () => void) {
  let last = arbiter.phase;
  const timer = setInterval(() => {
    if (arbiter.phase === last) return;
    last = arbiter.phase;
    console.log(`[${code}] fase: ${last}`);
    if (last === "fin" || last === "anulada") {
      clearInterval(timer);
      mkdirSync("bench-out", { recursive: true });
      // El CSV conserva su formato; nivel y semilla van en el nombre para poder reproducir la partida.
      const file = `bench-out/intentos-${code}${arbiter.demo ? "-demo" : ""}-nivel${arbiter.nivel}-semilla${arbiter.semilla}.csv`;
      writeFileSync(file, arbiter.toCsv());
      console.log(`[${code}] resultado: ${JSON.stringify(arbiter.outcome)} · CSV: ${file}`);
      // Tras el fin la sala sigue abierta la ventana de reconexión: quien recargue recibe el mismo resultado.
      setTimeout(fin, arbiter.phase === "fin" ? RECONNECT_MS : 1000);
    }
  }, 200);
}

async function abrir(t: Transport, alTerminar: () => void) {
  const code = await createRoom(t);
  const room = hostRoom(t, { nivel, semilla, demo });
  vigilar(code, room.arbiter, () => { room.stop(); void t.close().then(alTerminar); });
  console.log(`[${code}] nivel: ${room.arbiter.nivel}${demo === "radar" ? " · MODO DEMO (solo Radar)" : demo ? " · MODO DEMO (cableado: Cabina y Turbina)" : ""} · semilla: ${room.arbiter.semilla}`);
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
