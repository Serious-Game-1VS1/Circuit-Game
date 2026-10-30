import { describe, expect, it } from "vitest";
import { Arbiter } from "../src/arbiter/arbiter.js";
import { generar, validarPartida, validarZona, type ZonaPod } from "../src/engine/generador.js";
import { medir } from "../src/engine/medir.js";
import { evaluar, jugadas, piezaValida } from "../src/engine/pods.js";
import type { ServerMsg } from "../src/protocol.js";

/** Cadena de 4 piezas a 9 V: cable, LED, resistencia del valor justo (470 Ω) y cable; la 3 (la resistencia) está muerta. */
const Z: ZonaPod = { zona: 0, nombre: "radar", circuito: "cadena", volts: 9, cadena: ["cable", "led", "r470", "cable"], muerta: 3,
  opciones: ["r470", "r100", "led", "ledInv"], solucion: "3:r470" };

describe("cadena: la pieza muerta (nivel 2)", () => {
  it("solo el repuesto igual puesto en el hueco muerto enciende bien el LED", () => {
    expect(evaluar(Z, "ninguna")).toBe("poco"); // el corte deja el LED apagado
    expect(evaluar(Z, "3:r470")).toBe("correcto");
    expect(evaluar(Z, "3:r100")).toBe("se quema"); // valor equivocado: 70 mA
    expect(evaluar(Z, "3:led")).toBe("se quema"); // tipo equivocado: dos LED y ninguna resistencia
    expect(evaluar(Z, "1:r470")).toBe("poco"); // hueco equivocado: el corte sigue
    expect(validarZona(Z)).toBeNull();
    expect(jugadas(Z).filter((p) => evaluar(Z, p) === "correcto")).toEqual(["3:r470"]);
  });

  it("LED muerto: el LED girado de la gaveta no sirve (polaridad)", () => {
    const z: ZonaPod = { ...Z, cadena: ["r470", "cable", "led", "cable"], muerta: 3, opciones: ["led", "ledInv", "cable", "r220"], solucion: "3:led" };
    expect([evaluar(z, "3:led"), evaluar(z, "3:ledInv"), evaluar(z, "3:cable")]).toEqual(["correcto", "poco", "poco"]);
    expect(validarZona(z)).toBeNull();
  });

  it("piezaValida: «hueco:repuesto» de la gaveta, «ninguna» o la opción normal; nada más", () => {
    expect(["ninguna", "1:led", "4:r470"].map((p) => piezaValida(Z, p))).toEqual([true, true, true]);
    expect(["5:led", "0:led", "3:r220", "led", "3:", "x:led"].map((p) => piezaValida(Z, p))).toEqual([false, false, false, false, false, false]);
    expect(piezaValida({ circuito: "led", opciones: ["100", "220"] }, "100")).toBe(true);
  });

  it("continuidad por tramo localiza la muerta sin dar la solución; con el repuesto puesto ya pasa", () => {
    const lee = (pieza: string) => [1, 2, 3, 4].map((i) => (medir(Z, pieza, "continuidad", `t${i}`) as { pasa: boolean }).pasa);
    expect(lee("ninguna")).toEqual([true, true, false, true]);
    expect(lee("3:r470")).toEqual([true, true, true, true]);
    expect(medir(Z, "ninguna", "continuidad", "t2")).toEqual({ pasa: true }); // el LED bien puesto deja pasar
    expect(medir(Z, "ninguna", "continuidad", "t3")).toEqual({ pasa: false }); // «abierto»: sin Ω (no dice el valor de la muerta)
    expect(medir(Z, "ninguna", "continuidad", "t5")).toBeNull();
    // Con tensión no se marca nada en el cliente (con el LED aguas abajo el corte no siempre lee «toda»); solo la continuidad localiza.
    expect(medir(Z, "ninguna", "tension", "t1")).toMatchObject({ tension: "nada" });
  });

  it("el generador: 3 o 4 piezas, una muerta, 4 repuestos, solución única ±5 % y 100 % resoluble (3000 semillas, nivel 2 y mixto)", () => {
    let vistas = 0;
    const huecos = new Set<string>(), tipos = new Set<string>(), largos = new Set<number>();
    for (const nivel of [2, "mixto"] as const) {
      for (let s = 0; s < 1500; s++) {
        const pods = generar(s, nivel);
        expect(validarPartida(pods, nivel)).toBeNull();
        for (const z of pods.flatMap((p) => p.zonas).filter((x) => x.circuito === "cadena")) {
          vistas++;
          expect(z.opciones).toHaveLength(4);
          expect(z.cadena!.length).toBeGreaterThanOrEqual(3);
          expect(z.cadena!.length).toBeLessThanOrEqual(4);
          expect(z.cadena).toEqual(expect.arrayContaining(["led", "cable"]));
          expect(jugadas(z).filter((p) => evaluar(z, p) === "correcto")).toEqual([z.solucion]);
          // Resoluble como lo haría un jugador: mide, halla el único hueco que no pasa y prueba los repuestos allí.
          const sinPasar = z.cadena!.map((_, i) => (medir(z, "ninguna", "continuidad", `t${i + 1}`) as { pasa: boolean }).pasa).flatMap((p, i) => (p ? [] : [i + 1]));
          expect(sinPasar).toEqual([z.muerta]);
          expect(z.opciones.filter((o) => evaluar(z, `${sinPasar[0]}:${o}`) === "correcto")).toEqual([z.solucion.slice(2)]);
          huecos.add(String(z.muerta)); largos.add(z.cadena!.length);
          tipos.add(z.cadena![z.muerta! - 1]!.replace(/\d+/, ""));
        }
      }
    }
    expect(vistas).toBeGreaterThan(500);
    expect([...tipos].sort()).toEqual(["cable", "led", "r"]); // la muerta puede ser cada tipo de pieza
    expect([...largos].sort()).toEqual([3, 4]);
    expect(huecos.size).toBeGreaterThanOrEqual(3);
  });

  it("de punta a punta en el árbitro: medir no penaliza, hueco o repuesto equivocados penalizan con la espera de siempre y la vista no filtra la solución", () => {
    const semilla = Array.from({ length: 300 }, (_, s) => s).find((s) => generar(s, 2).some((p) => p.zonas.length === 1 && p.zonas[0]!.circuito === "cadena" && p.zonas[0]!.cadena!.length === 4))!;
    let t = 0;
    const out: ServerMsg[] = [];
    const arb = new Arbiter((to, m) => { if (to === "p1") out.push(m); }, { now: () => t, semilla, nivel: 2 });
    for (const [p, a] of [["p1", "ana"], ["p2", "beto"]] as const) arb.handle(p, { t: "hello", alias: a });
    arb.handle("p1", { t: "ready" }); arb.handle("p2", { t: "ready" });
    t += 3000; arb.tick();
    const pod = () => out.flatMap((m) => (m.t === "start" || m.t === "result" || m.t === "despachado" ? [m.pod] : [])).at(-1)!;
    const ultimo = <K extends ServerMsg["t"]>(k: K) => out.filter((m) => m.t === k).at(-1) as Extract<ServerMsg, { t: K }>;
    let seq = 0;
    const probar = (zona: number, pieza: string) => { arb.handle("p1", { t: "test", seq: ++seq, t0: 0, zone: zona, pieza }); return ultimo("result"); };
    const medida = (zone: number, punto: string, pieza = "ninguna", modo: "continuidad" | "tension" = "continuidad") => { arb.handle("p1", { t: "medir", seq: ++seq, t0: 0, zone, pieza, modo, punto }); return ultimo("medida"); };
    const resolver = () => { for (const z of pod().zonas) if (!z.reparada) { const zs = arb.pods[pod().numero - 1]!.zonas.find((x) => x.zona === z.zona)!; probar(z.zona, jugadas(zs).find((p) => evaluar(zs, p) === "correcto")!); } arb.handle("p1", { t: "despachar", seq: ++seq, t0: 0 }); t += 5000; };
    while (!pod().zonas.some((z) => z.circuito === "cadena" && z.cadena!.length === 4)) resolver();
    const vista = pod().zonas.find((z) => z.circuito === "cadena")!, real = arb.pods[pod().numero - 1]!.zonas.find((z) => z.zona === vista.zona)!;
    // Lo que viaja: las piezas de la cadena y los repuestos; nunca cuál está muerta ni la solución.
    expect(JSON.stringify(vista)).not.toMatch(/muerta|solucion/);
    expect(vista.cadena).toEqual(real.cadena);
    expect(Object.keys(vista).sort()).toEqual(["cadena", "circuito", "nombre", "opciones", "reparada", "volts", "zona"]);
    // Medir: localiza la muerta, no gasta intentos ni espera.
    const n = vista.cadena!.length;
    const pasan = Array.from({ length: n }, (_, i) => medida(vista.zona, `t${i + 1}`).pasa);
    expect(pasan.flatMap((p, i) => (p ? [] : [i + 1]))).toEqual([real.muerta]);
    expect(medida(vista.zona, "t1", "ninguna", "tension")).toMatchObject({ t: "medida", tension: "nada" });
    expect(JSON.stringify(ultimo("medida"))).not.toMatch(/correcto|solucion|amps/);
    arb.handle("p1", { t: "medir", seq: ++seq, t0: 0, zone: vista.zona, pieza: "9:led", modo: "continuidad", punto: "t1" });
    expect(ultimo("reject")).toMatchObject({ reason: "medida no válida" });
    // Pieza inválida al probar.
    arb.handle("p1", { t: "test", seq: ++seq, t0: 0, zone: vista.zona, pieza: "led" });
    expect(ultimo("reject")).toMatchObject({ reason: "pieza no válida" });
    // Hueco equivocado con el repuesto correcto: no repara y penaliza como cualquier fallo ("poco": 2 s de espera).
    const otro = (real.muerta! % n) + 1, buena = real.solucion.slice(2);
    const r1 = probar(vista.zona, `${otro}:${buena}`);
    expect(r1.veredicto).toBe("poco"); expect(r1.waitMs).toBeGreaterThan(0);
    expect(r1.pod.zonas.find((z) => z.zona === vista.zona)!.reparada).toBe(false);
    t += 10_000;
    // Hueco correcto con repuesto equivocado.
    const mal = vista.opciones.find((o) => o !== buena)!;
    expect(probar(vista.zona, `${real.muerta}:${mal}`).pod.zonas.find((z) => z.zona === vista.zona)!.reparada).toBe(false);
    t += 10_000;
    arb.handle("p1", { t: "despachar", seq: ++seq, t0: 0 });
    expect(ultimo("reject")).toMatchObject({ reason: "faltan zonas por reparar" });
    // Hueco y repuesto correctos: repara.
    const ok = probar(vista.zona, real.solucion);
    expect(ok.veredicto).toBe("correcto");
    expect(ok.pod.zonas.find((z) => z.zona === vista.zona)!.reparada).toBe(true);
  });
});
