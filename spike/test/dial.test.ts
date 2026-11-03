import { describe, expect, it } from "vitest";
import { generar, type Perfil } from "../src/engine/generador";
import { PIEZAS, evaluar, jugadas, montar } from "../src/engine/pods";
import { medir } from "../src/engine/medir";
import type { Circuito, Dial } from "../src/protocol";

/** Zona del veredicto del árbitro: el rojo agrupa «demasiado», «se quema» y el cortocircuito. */
const zonaVeredicto = (v: string): Dial => (v === "poco" || v === "correcto" ? v : "demasiado");

/**
 * Propiedad: en TODAS las familias, el color del multímetro (Medida.dial) de cada jugada coincide con el veredicto que daría CHECK,
 * en tensión y en cada punto medible; la continuidad (con la pieza fuera) nunca lleva dial. Única excepción física: el fusible de 1 A y el de 3 A leen igual con el consumo normal.
 */
describe("dial del multímetro == veredicto del árbitro", () => {
  const PERFILES: Perfil[] = [1, 2, 3, "mixto"];
  const SEMILLAS = 1500;
  it(`${SEMILLAS} semillas por perfil (niveles 1, 2, 3 y mixto), todas las familias, todas las jugadas`, () => {
    let total = 0, coinciden = 0;
    const distintas: string[] = [], indistinguibles = new Map<string, number>(), familias = new Map<Circuito, number>();
    for (const perfil of PERFILES) {
      for (let semilla = 0; semilla < SEMILLAS; semilla++) {
        for (const pod of generar(semilla, perfil)) {
          for (const z of pod.zonas.filter((x) => x.circuito !== "placa3")) { // placa3: su propiedad del dial está en placa3.test.ts
            for (const pieza of jugadas(z)) {
              const esperado = zonaVeredicto(evaluar(z, pieza));
              const puntos = Object.keys(montar(z, pieza).puntos);
              for (const modo of ["tension"] as const) {
                for (const punto of puntos) {
                  const m = medir(z, pieza, modo, punto)!;
                  total++; familias.set(z.circuito, (familias.get(z.circuito) ?? 0) + 1);
                  if (m.dial === undefined) { const k = `${z.circuito} ${pieza} A (esperado ${esperado})`; indistinguibles.set(k, (indistinguibles.get(k) ?? 0) + 1); continue; }
                  if (m.dial === esperado) coinciden++;
                  else if (distintas.length < 10) distintas.push(`${perfil}/${semilla} ${z.circuito} ${z.volts} V ${pieza} ${modo}@${punto}: dial ${m.dial}, veredicto ${esperado}`);
                }
              }
            }
          }
        }
      }
    }
    const sin = [...indistinguibles.values()].reduce((a, b) => a + b, 0);
    console.info(`dial: ${total} lecturas; coinciden ${coinciden} (${((100 * coinciden) / (total - sin)).toFixed(2)} % de las que opinan); sin opinión ${sin}: ${JSON.stringify([...indistinguibles])}; por familia ${JSON.stringify([...familias])}`);
    expect(distintas).toEqual([]);
    expect(coinciden + sin).toBe(total);
    // solo el fusible puede quedar sin opinión, y solo con 1 A o 3 A (la falla es lo único que los separa)
    for (const k of indistinguibles.keys()) expect(k).toMatch(/^(fusible (1|3) A|fusible3 )/); // fusible3: sin cortar ni en la falla ni... el dial solo ve si corta con el consumo normal
  }, 120_000);

  it("la continuidad NUNCA lleva dial (ni con la pieza fuera, ni suelta, ni en la cadena): no hay pieza puesta que juzgar", () => {
    for (const perfil of PERFILES) {
      for (let semilla = 0; semilla < 100; semilla++) {
        for (const pod of generar(semilla, perfil)) {
          for (const z of pod.zonas.filter((x) => x.circuito !== "placa3")) {
            const puntos = Object.keys(montar(z, jugadas(z)[0]!).puntos);
            for (const pieza of ["ninguna", ...jugadas(z)]) {
              for (const punto of puntos) {
                const m = medir(z, pieza, "continuidad", punto);
                if (m) expect("dial" in m, `${z.circuito} ${pieza} ${punto}`).toBe(false);
              }
            }
          }
        }
      }
    }
  });

  it("LED invertido y circuito abierto (no se sortean pero siguen en el catálogo): también coinciden", () => {
    for (const circuito of ["invertido", "abierto"] as const) {
      for (const volts of [3.7, 4.5, 9, 15]) {
        for (const pieza of PIEZAS[circuito]) {
          expect(medir({ circuito, volts }, pieza, "tension", "pieza")!.dial, `${circuito} ${volts} V ${pieza}`).toBe(zonaVeredicto(evaluar({ circuito, volts }, pieza)));
        }
      }
    }
  });
});
