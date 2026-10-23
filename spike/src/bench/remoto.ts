import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { Bot } from "../sim/bot.js";
import { PhotonTransport } from "../transport/photon.js";
import { parseArgs } from "./remoto-args.js";
import { summarize } from "./stats.js";

/**
 * Mide "Probar -> resultado" y "despacho -> rival" contra un árbitro YA abierto en otro lugar
 * (p. ej. `npm run serve:photon:demo5` en un servidor US East): jugador -> Photon -> árbitro remoto -> Photon -> jugador.
 * Como la sala quiere 2 jugadores, este proceso mete dos: el medido ("medidor") y un rival local ("rival") que
 * también juega; ambos comparten reloj, así que no hay desfase. Lo medido es el trayecto del medidor.
 * Uso: npm run bench:remoto -- --codigo ABC123 --region us [--muestras 100] [--max-seg 300]
 * La región debe ser la misma con la que corre el servidor. Lee PHOTON_APP_ID de spike/.env; nunca lo imprime.
 */
if (existsSync(".env")) process.loadEnvFile(".env");
const appId = process.env.PHOTON_APP_ID?.trim() ?? "";
const GOALS = [150, 250] as const;
const EVERY_MS = 250; // misma pausa entre intentos que bench:photon4
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const scrub = (s: string) => (appId ? s.split(appId).join("[APP_ID]") : s);

async function main() {
  if (!appId) throw new Error("Falta PHOTON_APP_ID en spike/.env");
  const { codigo, region, muestras, maxSeg } = parseArgs(process.argv.slice(2), process.env);
  const started = new Date();
  const deadline = Date.now() + maxSeg * 1000;
  const me = new Bot(new PhotonTransport(appId, region));
  const rival = new Bot(new PhotonTransport(appId, region));
  // own incluye rechazos (enfriamientos): solo cuentan los veredictos "result", como en bench:photon4.
  const resultados = () => me.own.filter((_, i) => me.log.filter((m) => m.t === "result" || m.t === "reject")[i]?.t === "result");
  let fin = "muestras completas";
  try {
    await me.enter(codigo, "medidor");
    await rival.enter(codigo, "rival");
    me.ready();
    rival.ready();
    await Promise.all([me, rival].map((b) => b.until((m) => m.t === "start", 0, 30_000)));
    const juega = async (b: Bot) => {
      while (!b.end && Date.now() < deadline && (b !== me || resultados().length < muestras)) {
        await b.solveNext().catch(() => {}); // un tiempo agotado no aborta: la muestra simplemente no cuenta
        await sleep(EVERY_MS);
      }
    };
    await Promise.all([juega(me), juega(rival)]);
    if (me.end) fin = "la partida terminó antes";
    else if (resultados().length < muestras) fin = "se agotó --max-seg";
    await sleep(500); // deja llegar el último "rival" en vuelo
  } finally {
    await Promise.all([me.t.close(), rival.t.close()].map((p) => p.catch(() => {})));
  }

  const own = summarize(resultados(), GOALS);
  const mirror = summarize(me.mirror, GOALS);
  const out = { date: started.toISOString(), region, sala: codigo, muestrasPedidas: muestras, fin, probarResultado: own, despachoRival: mirror };
  const ok = (p95: number, g: number) => (p95 <= g ? "cumple" : "**NO cumple**");
  const line = (name: string, s: typeof own, g: number) =>
    `| ${name} | ${s.n} | ${s.p50} | ${s.p95} | ${s.p99} | ${s.max} | ${s.overGoalPct["150ms"]} % | ${s.overGoalPct["250ms"]} % | ${ok(s.p95, g)} (meta ${g} ms) |`;
  const md = [
    `# Árbitro remoto · sala ${codigo} · región ${region}`,
    "",
    `Fecha: ${out.date} · fin: ${fin} · jugador medido + rival local en este proceso; árbitro en otro lugar.`,
    "",
    "| Indicador | n | p50 ms | p95 ms | p99 ms | máx ms | % > 150 | % > 250 | p95 vs meta |",
    "|---|---|---|---|---|---|---|---|---|",
    line("Probar → resultado", own, 150),
    line("Despacho → rival", mirror, 250),
    "",
  ].join("\n");

  mkdirSync("bench-out", { recursive: true });
  const base = `bench-out/remoto-${region}-${codigo}-${out.date.replace(/[:.]/g, "-")}`;
  writeFileSync(`${base}.json`, scrub(JSON.stringify(out, null, 2)));
  writeFileSync(`${base}.md`, scrub(md));
  console.log(scrub(md));
  console.log(`Resultado: ${base}.json y .md`);
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? scrub(e.message) : e); process.exit(1); });
