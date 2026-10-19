import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { Bot } from "../sim/bot.js";
import { LocalTransport, startLocalRelay } from "../transport/local.js";
import { PhotonTransport } from "../transport/photon.js";
import { createRoom, hostRoom } from "../transport/room.js";
import type { Transport } from "../transport/transport.js";
import { summarize } from "./stats.js";

/**
 * SCRUM-20 / RNF-02: 4 duelos simultáneos (8 clientes + 4 árbitros = 12 CCU en Photon, de 20 gratis).
 * Cada duelo juega partidas completas seguidas (sala nueva por partida, las 3 conexiones se cierran antes
 * de abrir la siguiente: nunca más de 12 CCU) hasta juntar MIN muestras de cada indicador POR DUELO.
 *  - "Probar" -> resultado: intento -> veredicto recibido por quien lo hizo (meta anteproyecto p95 <= 150 ms).
 *  - Despacho -> rival: intento que despacha un pod -> progreso recibido por el rival (meta p95 <= 250 ms).
 * Uso: npm run bench:photon4 [-- --region sa | -- --local]. Lee PHOTON_APP_ID de spike/.env; nunca lo imprime.
 */
if (existsSync(".env")) process.loadEnvFile(".env");
const args = process.argv.slice(2);
const local = args.includes("--local");
const ri = args.indexOf("--region");
const region = (ri >= 0 && args[ri + 1]) || process.env.PHOTON_REGION?.trim() || "us";
const appId = process.env.PHOTON_APP_ID?.trim() ?? "";
const DUELS = 4;
const MIN = Number(process.env.BENCH_MIN_PER_DUEL) || 300;
const EVERY_MS = 250; // pausa del bot entre recibir un veredicto y probar la siguiente zona
const MAX_MS = Number(process.env.BENCH_MAX_MS) || 15 * 60_000;
const GOALS = [150, 250] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Duel { own: number[]; mirror: number[]; matches: number; failed: number; sameState: boolean[]; errors: string[] }

async function playMatch(make: () => Transport, d: Duel) {
  const all: Transport[] = [];
  let host: ReturnType<typeof hostRoom> | undefined;
  try {
    const arb = make();
    all.push(arb);
    const code = await createRoom(arb);
    host = hostRoom(arb, { countdownMs: 0 });
    const bots: Bot[] = [];
    for (const alias of ["ana", "beto"]) {
      const b = new Bot(make());
      all.push(b.t);
      await b.enter(code, alias);
      bots.push(b);
    }
    for (const b of bots) b.ready();
    await Promise.all(bots.map((b) => b.until((m) => m.t === "start")));
    const arbiter = host.arbiter;
    // Un intento a la vez por jugador (sin solapar), como un estudiante que espera el veredicto.
    await Promise.all(bots.map(async (b) => {
      while (arbiter.phase === "jugando") { await b.solveNext(); await sleep(EVERY_MS); }
    }));
    await sleep(500); // deja llegar el último "rival" en vuelo
    for (const b of bots) {
      // own incluye rechazos (p. ej. el intento que llega con la partida ya terminada): solo cuentan veredictos.
      const replies = b.log.filter((m) => m.t === "result" || m.t === "reject");
      d.own.push(...b.own.filter((_, i) => replies[i]?.t === "result"));
      d.mirror.push(...b.mirror);
    }
    const [a, b] = bots as [Bot, Bot];
    d.sameState.push(a.rival?.despachados === b.despachados && b.rival?.despachados === a.despachados);
    d.matches++;
  } catch (e) {
    d.failed++;
    d.errors.push(e instanceof Error ? e.message : String(e));
  } finally {
    host?.stop();
    await Promise.all(all.map((t) => t.close().catch(() => {})));
  }
}

async function main() {
  if (!local && !appId) throw new Error("Falta PHOTON_APP_ID en spike/.env");
  const relay = local ? await startLocalRelay(0) : undefined;
  const make = local ? () => new LocalTransport(`ws://localhost:${relay!.port}`) : () => new PhotonTransport(appId, region);
  const started = new Date();
  const deadline = Date.now() + MAX_MS;
  const duels: Duel[] = Array.from({ length: DUELS }, () => ({ own: [], mirror: [], matches: 0, failed: 0, sameState: [], errors: [] }));
  try {
    await Promise.all(duels.map(async (d) => {
      while ((d.own.length < MIN || d.mirror.length < MIN) && Date.now() < deadline && d.failed < 5) await playMatch(make, d);
    }));
  } finally {
    await relay?.close();
  }

  const label = local ? "local" : `photon-${region}`;
  const own = duels.flatMap((d) => d.own);
  const mirror = duels.flatMap((d) => d.mirror);
  const out = {
    date: started.toISOString(),
    durationS: Math.round((Date.now() - started.getTime()) / 1000),
    transport: local ? "relé WebSocket local (localhost, sin red externa)" : "photon-realtime 4.4.0 · WSS:443 · Photon Cloud",
    region: local ? null : region,
    duels: DUELS,
    clients: DUELS * 2,
    peakCcu: local ? 0 : DUELS * 3,
    minSamplesPerDuel: MIN,
    pauseBetweenTestsMs: EVERY_MS,
    node: process.version,
    where: "árbitro y los 8 clientes en el mismo proceso Node de este equipo (mismo reloj); no en un servidor cercano ni en la red de la UDLA",
    goalsAnteproyecto: { probarResultadoP95Ms: 150, despachoRivalP95Ms: 250 },
    probarResultado: summarize(own, GOALS),
    despachoRival: summarize(mirror, GOALS),
    perDuel: duels.map((d) => ({
      matches: d.matches, failedMatches: d.failed, errors: [...new Set(d.errors)],
      sameState: d.sameState.every(Boolean), probarResultado: summarize(d.own, GOALS), despachoRival: summarize(d.mirror, GOALS),
    })),
  };

  const ok = (p95: number, g: number) => (p95 <= g ? "cumple" : "**NO cumple**");
  const line = (name: string, s: ReturnType<typeof summarize>, goal: number) =>
    `| ${name} | ${s.n} | ${s.p50} | ${s.p95} | ${s.p99} | ${s.max} | ${s.overGoalPct["150ms"]} % | ${s.overGoalPct["250ms"]} % | ${ok(s.p95, 150)} | ${ok(s.p95, 250)} | ${goal} ms |`;
  const md = [
    `# RNF-02 · ${DUELS} duelos simultáneos · ${out.transport}${local ? "" : ` · región ${region}`}`,
    "",
    `Fecha: ${out.date} · duración ${out.durationS} s · ${out.clients} clientes · CCU pico ${out.peakCcu} · partidas ${duels.map((d) => d.matches).join("/")} (fallidas ${duels.map((d) => d.failed).join("/")}) · mismo estado en todas: ${out.perDuel.every((d) => d.sameState)}`,
    "",
    "| Indicador | n | p50 ms | p95 ms | p99 ms | máx ms | % > 150 | % > 250 | p95 vs 150 | p95 vs 250 | meta del anteproyecto |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    line("Probar → resultado", out.probarResultado, 150),
    line("Despacho → rival", out.despachoRival, 250),
    "",
    `Muestras: al menos ${MIN} por indicador **por duelo** (agregado = ${DUELS}×). Percentil por rango más cercano.`,
    "",
    "Límites: el árbitro y los 8 clientes corren en un solo proceso Node de este equipo (no en un servidor cercano ni en la red WiFi de la UDLA); comparten CPU y bucle de eventos. Bots con respuesta correcta y 250 ms entre intentos; sin navegador ni render.",
    "",
  ].join("\n");

  mkdirSync("bench-out", { recursive: true });
  const base = `bench-out/photon4-${label}-${out.date.replace(/[:.]/g, "-")}`;
  // El App ID nunca debe quedar en disco (p. ej. dentro de un mensaje de error del SDK).
  const scrub = (s: string) => (appId ? s.split(appId).join("[APP_ID]") : s);
  writeFileSync(`${base}.json`, scrub(JSON.stringify(out, null, 2)));
  writeFileSync(`${base}.md`, scrub(md));
  console.log(scrub(md));
  console.log(`Resultado: ${base}.json y .md`);
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message.split(appId || "\0").join("[APP_ID]") : e); process.exit(1); });
