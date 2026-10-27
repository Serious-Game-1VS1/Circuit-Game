/**
 * Validador del generador (RF-06, criterio 1): 10 000 sorteos por nivel. Sale con código 1 si alguno
 * es inválido o no se regenera igual con su semilla. Uso: npm run validar:sorteos [-- <sorteos>] [--demo]
 * Sin --demo revisa los niveles 1 y 2, el perfil mixto (el del duelo por defecto), los dos modos demo (cableado y Radar) y las 18 primeras oleadas de Oleadas
 * (con su falla encadenada); con --demo, solo los demos.
 */
import { encadena, generar, generarOleada, mulberry32, validarPartida, validarPodOleada, type Demo, type Perfil } from "./generador.js";

const args = process.argv.slice(2);
const soloDemo = args.includes("--demo");
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 10_000);
const semillas = mulberry32(20261019); // semillas fijas: cada corrida del CI revisa los mismos sorteos
let malos = 0;
const casos: { nombre: string; nivel: Perfil; demo: Demo }[] = [
  ...(soloDemo ? [] : ([1, 2, "mixto"] as const).map((n) => ({ nombre: `nivel ${n}`, nivel: n, demo: false as const }))),
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
// Oleadas: pods 1 a 18 (oleadas 1 a 6, con la rampa de fallas encadenadas): válidos, deterministas y la encadenada solo donde toca.
for (const nivel of soloDemo ? [] : ([1, 2] as const)) {
  const t = performance.now();
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const s = Math.floor(semillas() * 2 ** 32);
    let e: string | null = null;
    try {
      for (let n = 1; n <= 18 && !e; n++) {
        const p = generarOleada(s, nivel, n);
        e = validarPodOleada(p, nivel) ?? (JSON.stringify(generarOleada(s, nivel, n)) !== JSON.stringify(p) ? `pod ${n}: no determinista` : p.encadenada && !encadena(s, n) ? `pod ${n}: encadenada fuera de la rampa` : null);
      }
    } catch (err) {
      e = String(err);
    }
    if (e === null) ok++;
    else if (malos++ < 20) console.error(`oleadas nivel ${nivel}, semilla ${s}: ${e}`);
  }
  console.log(`oleadas nivel ${nivel}: ${ok}/${N} sorteos válidos (${((performance.now() - t) / 1000).toFixed(1)} s)`);
}
if (malos > 0) process.exit(1);
