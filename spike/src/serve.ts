import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { RECONNECT_MS, type Arbiter } from "./arbiter/arbiter.js";
import { borrarVivo, guardarPartida, guardarVivo } from "./docente/almacen.js";
import { partidaDe, vivoDe } from "./docente/registro.js";
import type { Demo, Perfil } from "./engine/generador.js";
import { hostRoom, createRoom, pausaReapertura } from "./transport/room.js";
import { LocalTransport, startLocalRelay } from "./transport/local.js";
import { PhotonTransport } from "./transport/photon.js";
import type { Transport } from "./transport/transport.js";

/**
 * npm run serve: relé local en ws://localhost:8787 + árbitro con una sala (una por proceso).
 * npm run serve:photon: árbitro en Photon Cloud (WSS:443). Siempre deja una sala libre abierta: cuando
 * una se llena, abre otra con un código nuevo; así caben varios duelos a la vez (hasta MAX_SALAS).
 * El cliente (cliente/, npm run dev) entra con el código. Al terminar cada partida guarda su CSV en bench-out/.
 *
 * Opciones (también por variable de entorno): --nivel 1|2|mixto (NIVEL, por defecto mixto: pods 1-3 de nivel 1 (LED, LED, Cabina) y
 * pods 4-5 de nivel 2 con cables, interruptor, fusible, LED invertido o circuito abierto, para la demo de 5 min) y --semilla N (SEMILLA,
 * entero 0..2^32-1, por defecto aleatoria). Ej.: npm run serve -- --nivel 2 --semilla 42.
 * --demo (o DEMO=1): modo demo de cableado (Cabina y Turbina: arrastrar piezas a la placa y unirlas con cables).
 * --demo radar (o DEMO=radar): el demo anterior (5 pods solo con Radar: LED + resistencia).
 * --limite-min N (o LIMITE_MIN=N): duración de la partida en minutos, de 1 a 30 (por defecto 12, el reglamento). Solo para
 * demos: `npm run serve:demo5` la deja en 5. No cambia nada más (reloj del cliente y desempate siguen al árbitro).
 * Para el panel docente (spike/DOCENTE-CONTRATO.md) también escribe, en DOCENTE_DATA, el JSON de cada partida y el
 * estado vivo de la sala (al cambiar de fase y cada 5 s jugando). Si falla la escritura solo avisa: el juego sigue.
 * La semilla se imprime en consola y va en el nombre del CSV (nunca se envía a los clientes); con
 * --semilla en Photon todas las salas usan la misma.
 */
const photon = process.argv.includes("--photon");
const opcion = (flag: string, env: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : process.env[env];
};
const nivelTxt = opcion("--nivel", "NIVEL") ?? "mixto";
if (nivelTxt !== "1" && nivelTxt !== "2" && nivelTxt !== "mixto") throw new Error(`--nivel debe ser 1, 2 o mixto (llegó "${nivelTxt}")`);
const nivel: Perfil = nivelTxt === "mixto" ? "mixto" : nivelTxt === "2" ? 2 : 1;
const semillaTxt = opcion("--semilla", "SEMILLA");
const semilla = semillaTxt === undefined ? undefined : Number(semillaTxt);
if (semilla !== undefined && !(/^\d+$/.test(semillaTxt!) && semilla < 2 ** 32)) throw new Error(`--semilla debe ser un entero de 0 a 2^32-1 (llegó "${semillaTxt}")`);
const limiteTxt = opcion("--limite-min", "LIMITE_MIN");
const limiteMin = limiteTxt === undefined ? undefined : Number(limiteTxt);
if (limiteMin !== undefined && !(/^\d+$/.test(limiteTxt!) && limiteMin >= 1 && limiteMin <= 30)) throw new Error(`--limite-min debe ser un número de 1 a 30 (llegó "${limiteTxt}")`);
const limitMs = limiteMin === undefined ? undefined : limiteMin * 60_000;
// --demo (o DEMO=1) = demo de cableado; --demo radar (o DEMO=radar) = el demo anterior, solo Radar.
const demoTxt = process.argv.includes("--demo") ? (opcion("--demo", "DEMO") === "radar" ? "radar" : "1") : process.env.DEMO;
const demo: Demo = demoTxt === "radar" ? "radar" : demoTxt === "1" ? "cableado" : false;
// Cada sala Photon usa 3 CCU (árbitro + 2 jugadores); el plan gratuito admite 20 CCU.
const MAX_SALAS = Number(process.env.MAX_SALAS) || 6;
const VIVO_MS = 5000;

/** Escribe para el panel docente sin tumbar el juego si el disco falla. */
const docente = (que: string, f: () => void) => { try { f(); } catch (e) { console.error(`docente: no se pudo ${que}: ${(e as Error).message}`); } };

/** Vigila la fase; al terminar guarda el CSV y llama a `fin` (con pausa para que salga el mensaje final y se pueda reconectar). */
function vigilar(code: string, arbiter: Arbiter, fin: () => void): () => void {
  let last = arbiter.phase;
  let inicio = 0, vivoAt = 0;
  const vivo = () => { vivoAt = Date.now(); if (!arbiter.practica) docente("guardar el vivo", () => guardarVivo(vivoDe(arbiter, code, vivoAt))); };
  const timer = setInterval(() => {
    if (arbiter.phase === last) {
      if (last === "jugando" && Date.now() - vivoAt >= VIVO_MS) vivo();
      return;
    }
    last = arbiter.phase;
    if (last === "jugando") inicio = Date.now();
    console.log(`[${code}] fase: ${last}`);
    vivo();
    if (last === "fin" || last === "anulada") {
      clearInterval(timer);
      mkdirSync("bench-out", { recursive: true });
      // El CSV conserva su formato; nivel y semilla van en el nombre para poder reproducir la partida.
      const file = `bench-out/intentos-${code}${arbiter.demo ? "-demo" : ""}-nivel${arbiter.nivel}-semilla${arbiter.semilla}.csv`;
      const csv = arbiter.toCsv();
      writeFileSync(file, csv);
      if (!arbiter.practica) docente("guardar la partida", () => guardarPartida(partidaDe(arbiter, code, inicio || Date.now(), Date.now()), csv));
      console.log(`[${code}] resultado: ${JSON.stringify(arbiter.outcome)} · CSV: ${file}`);
      // Tras el fin la sala sigue abierta la ventana de reconexión: quien recargue recibe el mismo resultado.
      setTimeout(() => { docente("borrar el vivo", () => borrarVivo(code)); fin(); }, arbiter.phase === "fin" ? RECONNECT_MS : 1000);
    }
  }, 200);
  return () => clearInterval(timer);
}

/** Reabre la sala con el mismo código (relé local): el relé tarda un instante en soltar el código al cerrar el anfitrión. */
async function crearConCodigo(t: Transport, code: string) {
  for (let i = 0; ; i++) {
    try { await t.create(code); return code; } catch (e) {
      if (i >= 10) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

async function abrir(t: Transport, alTerminar: () => void, codigo?: string, alCaer?: () => void) {
  const code = codigo ? await crearConCodigo(t, codigo) : await createRoom(t);
  let parar = () => {};
  const room = hostRoom(t, { nivel, semilla, demo, limitMs }, () => {
    parar();
    console.error(`[${code}] se perdió la conexión del árbitro: sala cerrada`);
    docente("borrar el vivo", () => borrarVivo(code));
    alCaer?.();
  });
  parar = vigilar(code, room.arbiter, () => { room.stop(); void t.close().then(alTerminar); });
  console.log(`[${code}] nivel: ${room.arbiter.nivel}${demo === "radar" ? " · MODO DEMO (solo Radar)" : demo ? " · MODO DEMO (cableado: Cabina y Turbina)" : ""} · semilla: ${room.arbiter.semilla}${limiteMin === undefined ? "" : ` · duración: ${limiteMin} min`}`);
  return { code, arbiter: room.arbiter };
}

if (photon) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const appId = process.env.PHOTON_APP_ID?.trim();
  const region = process.env.PHOTON_REGION?.trim() || "us";
  if (!appId) throw new Error("Falta PHOTON_APP_ID en spike/.env");
  const salas = new Map<string, Arbiter>();
  let abriendo = false;
  let fallos = 0, noAntesDe = 0; // tras un fallo la reapertura espera (2 s, 4 s… tope 30 s) en vez de insistir cada segundo
  const asegurarSalaLibre = async () => {
    const libres = [...salas.values()].filter((a) => a.phase === "esperando").length;
    if (abriendo || libres > 0 || salas.size >= MAX_SALAS || Date.now() < noAntesDe) return;
    abriendo = true;
    try {
      const quitar = () => { salas.delete(code); };
      const { code, arbiter } = await abrir(new PhotonTransport(appId, region), quitar, undefined, quitar); // si Photon la cae, se quita y el ciclo de 1 s abre otra
      fallos = 0;
      salas.set(code, arbiter);
      console.log(`Photon (${region}) · sala nueva, código: ${code} · salas abiertas: ${salas.size}`);
    } catch (e) {
      noAntesDe = Date.now() + pausaReapertura(++fallos);
      console.error(`No se pudo abrir sala en Photon: ${(e as Error).message} · reintento en ${pausaReapertura(fallos) / 1000} s`);
    } finally {
      abriendo = false;
    }
  };
  await asegurarSalaLibre();
  setInterval(() => void asegurarSalaLibre(), 1000);
} else {
  const PORT = Number(process.env.PORT) || 8787;
  await startLocalRelay(PORT);
  // "Volver a jugar": al terminar la partida se reabre la sala con el mismo código, sin reiniciar el relé.
  const sala = async (codigo?: string): Promise<string> => {
    const { code } = await abrir(new LocalTransport(`ws://localhost:${PORT}`), () => void sala(code).catch(() => process.exit(1)), codigo);
    return code;
  };
  const code = await sala();
  console.log(`Relé en ws://localhost:${PORT} · código de sala: ${code}`);
}
