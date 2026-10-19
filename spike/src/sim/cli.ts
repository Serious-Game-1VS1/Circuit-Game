import { mkdirSync, writeFileSync } from "node:fs";
import { LocalTransport, startLocalRelay } from "../transport/local.js";
import { simulateDuel } from "./duel.js";

/**
 * npm run sim:duel     duelo simulado con aserciones sobre el relé local (sin red externa).
 * npm run export:csv   lo mismo y guarda el registro por intento en bench-out/intentos-<fecha>.csv.
 */
async function main() {
  const relay = await startLocalRelay(0);
  try {
    const { outcome, csv } = await simulateDuel(() => new LocalTransport(`ws://localhost:${relay.port}`));
    console.log(`Duelo simulado OK · ganador ${outcome.winner} (${outcome.reason}) · marcador ${JSON.stringify(outcome.score)}`);
    if (process.argv.includes("--csv")) {
      mkdirSync("bench-out", { recursive: true });
      const file = `bench-out/intentos-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
      writeFileSync(file, csv);
      console.log(`CSV: ${file} (${csv.trimEnd().split("\r\n").length - 1} intentos)`);
    }
  } finally {
    await relay.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
