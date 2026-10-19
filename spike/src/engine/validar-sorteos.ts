/**
 * Validador del generador (RF-06, criterio 1): 10 000 sorteos por nivel. Sale con código 1 si alguno
 * es inválido o no se regenera igual con su semilla. Uso: npm run validar:sorteos [-- <sorteos>]
 */
import type { Nivel } from "../protocol.js";
import { generar, mulberry32, validarPartida } from "./generador.js";

const N = Number(process.argv[2] ?? 10_000);
const semillas = mulberry32(20261019); // semillas fijas: cada corrida del CI revisa los mismos sorteos
let malos = 0;
for (const nivel of [1, 2] as Nivel[]) {
  const t = performance.now();
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const s = Math.floor(semillas() * 2 ** 32);
    let e: string | null;
    try {
      const pods = generar(s, nivel);
      e = validarPartida(pods, nivel) ?? (JSON.stringify(generar(s, nivel)) === JSON.stringify(pods) ? null : "no determinista");
    } catch (err) {
      e = String(err);
    }
    if (e === null) ok++;
    else if (malos++ < 20) console.error(`nivel ${nivel}, semilla ${s}: ${e}`);
  }
  console.log(`nivel ${nivel}: ${ok}/${N} sorteos válidos (${((performance.now() - t) / 1000).toFixed(1)} s)`);
}
if (malos > 0) process.exit(1);
