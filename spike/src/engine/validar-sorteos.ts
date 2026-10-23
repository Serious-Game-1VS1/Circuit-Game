/**
 * Validador del generador (RF-06, criterio 1): 10 000 sorteos por nivel. Sale con código 1 si alguno
 * es inválido o no se regenera igual con su semilla. Uso: npm run validar:sorteos [-- <sorteos>] [--demo]
 * Sin --demo revisa los niveles 1 y 2 y los dos modos demo (cableado y Radar); con --demo, solo los demos.
 */
import type { Nivel } from "../protocol.js";
import { generar, mulberry32, validarPartida, type Demo } from "./generador.js";

const args = process.argv.slice(2);
const soloDemo = args.includes("--demo");
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 10_000);
const semillas = mulberry32(20261019); // semillas fijas: cada corrida del CI revisa los mismos sorteos
let malos = 0;
const casos: { nombre: string; nivel: Nivel; demo: Demo }[] = [
  ...(soloDemo ? [] : [1, 2].map((n) => ({ nombre: `nivel ${n}`, nivel: n as Nivel, demo: false as const }))),
  { nombre: "demo (cableado: Cabina y Turbina)", nivel: 1, demo: "cableado" },
  { nombre: "demo (Radar)", nivel: 1, demo: "radar" },
];
for (const { nombre, nivel, demo } of casos) {
  const t = performance.now();
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const s = Math.floor(semillas() * 2 ** 32);
    let e: string | null;
    try {
      const pods = generar(s, nivel, demo);
      e = validarPartida(pods, nivel, demo) ?? (JSON.stringify(generar(s, nivel, demo)) === JSON.stringify(pods) ? null : "no determinista");
    } catch (err) {
      e = String(err);
    }
    if (e === null) ok++;
    else if (malos++ < 20) console.error(`${nombre}, semilla ${s}: ${e}`);
  }
  console.log(`${nombre}: ${ok}/${N} sorteos válidos (${((performance.now() - t) / 1000).toFixed(1)} s)`);
}
if (malos > 0) process.exit(1);
