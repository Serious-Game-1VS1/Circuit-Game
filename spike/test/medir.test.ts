import { describe, expect, it } from "vitest";
import { Arbiter } from "../src/arbiter/arbiter.js";
import { generar } from "../src/engine/generador.js";
import { medir, piezaPuesta } from "../src/engine/medir.js";
import { PIEZAS } from "../src/engine/pods.js";
import type { ServerMsg } from "../src/protocol.js";

describe("multímetro: solo lo que mediría un multímetro real", () => {
  it("tensión en las luces: serie reparte la batería, paralelo la deja entera, puente la hunde", () => {
    const z = { circuito: "luces" as const, volts: 9 };
    expect(medir(z, "serie", "tension", "carga1")).toMatchObject({ tension: "parte", fraccion: 0.5 });
    expect(medir(z, "paralelo", "tension", "carga2")).toMatchObject({ tension: "parte", fraccion: 1 });
    expect(medir(z, "puente", "tension", "carga1")).toMatchObject({ tension: "nada", fraccion: 0 });
  });

  it("tensión en la Turbina: el interruptor cerrado no se lleva tensión, el motor casi toda", () => {
    const z = { circuito: "interruptor" as const, volts: 9 };
    expect(medir(z, "serie", "tension", "carga2")).toMatchObject({ tension: "nada", fraccion: 0 });
    expect(medir(z, "serie", "tension", "carga1")).toMatchObject({ tension: "parte", fraccion: 1 });
  });

  it("«toda» solo con el camino cortado: el fusible de 0,5 A corta con el consumo normal; 1 A y 3 A no (se distinguen)", () => {
    const z = { circuito: "fusible" as const, volts: 9 };
    expect(medir(z, "0.5", "tension", "pieza")).toMatchObject({ tension: "toda", fraccion: 1, voltios: 9 });
    expect(medir(z, "1", "tension", "pieza")).toMatchObject({ tension: "nada", fraccion: 0 });
    expect(medir(z, "0.5", "tension", "carga1")).toMatchObject({ tension: "nada", fraccion: 0 });
    expect(medir(z, "1", "tension", "carga1")).toMatchObject({ tension: "parte" });
  });

  it("lecturas con cifra: voltios exactos y ohmios de una resistencia (el corte se lee sin Ω)", () => {
    expect(medir({ circuito: "divisor", volts: 9, r1: 470 }, "220", "tension", "pieza")).toMatchObject({ voltios: 2.87 });
    expect(medir({ circuito: "led", volts: 9 }, "470", "continuidad", "pieza")).toEqual({ pasa: true, ohmios: 470 }); // la resistencia suelta: sin dial
    expect(medir({ circuito: "abierto", volts: 9 }, "ninguna", "continuidad", "pieza")).toEqual({ pasa: false }); // el cable roto no pasa
  });

  it("continuidad con la batería desconectada: las piezas sanas pasan (el probador no funde fusibles)", () => {
    for (const circuito of ["led", "cabina", "luces", "interruptor", "fusible"] as const) {
      for (const pieza of PIEZAS[circuito]) {
        for (const punto of ["pieza", "carga1", "carga2"]) {
          const r = medir({ circuito, volts: 9 }, pieza, "continuidad", punto);
          if (r) expect(r).toMatchObject({ pasa: true });
        }
      }
    }
  });

  it("continuidad del LED girado (hueco vacío, tal como viene): «no pasa» por la polaridad", () => {
    expect(medir({ circuito: "invertido", volts: 9 }, "ninguna", "continuidad", "carga1")).toEqual({ pasa: false });
  });

  it("continuidad con el hueco vacío: la carga aislada pasa, el hueco no, y nunca hay dial (no hay pieza puesta)", () => {
    for (const circuito of ["led", "cabina", "protegido", "divisor", "combinar", "fusible"] as const) {
      const z = { circuito, volts: 9, r1: 470 };
      expect(medir(z, "ninguna", "continuidad", "pieza"), circuito).toEqual({ pasa: false });
      expect(medir(z, "ninguna", "continuidad", "carga1"), circuito).toMatchObject({ pasa: true });
    }
  });

  it("piezaPuesta: con la pieza puesta no hay lectura; luces, interruptor y placa3 quedan como estaban", () => {
    const led = { circuito: "led" as const, volts: 9 };
    expect(piezaPuesta(led, "470", "continuidad", "carga1", false)).toBe(true);
    expect(piezaPuesta(led, "ninguna", "continuidad", "carga1", true)).toBe(false);
    expect(piezaPuesta(led, "470", "tension", "carga1", false)).toBe(false);
    expect(piezaPuesta({ circuito: "luces", volts: 9 }, "serie", "continuidad", "carga1", false)).toBe(false);
  });

  it("continuidad en la carga del calefactor da sus Ω (consumo normal) para calcular I = V/R", () => {
    for (const circuito of ["fusible", "fusible3"] as const) {
      const l = medir({ circuito, volts: 9 }, "ninguna", "continuidad", "carga1");
      expect(l).toMatchObject({ pasa: true });
      expect((l as { ohmios?: number }).ohmios).toBeGreaterThan(1);
    }
  });

  it("continuidad del fusible: los 3 (0,5 / 1 / 3 A) pasan siempre; el motor nunca devuelve «cortado»", () => {
    for (const volts of [3.7, 4.5, 9]) {
      for (const f of PIEZAS.fusible) expect(medir({ circuito: "fusible", volts }, f, "continuidad", "pieza")).toMatchObject({ pasa: true });
    }
  });

  it("en las zonas de resistencia la tensión no distingue la correcta (no es un «Probar» gratis)", () => {
    for (const volts of [3.7, 4.5, 9]) {
      const tramos = PIEZAS.led.map((p) => (medir({ circuito: "led", volts }, p, "tension", "carga1") as { tension: string }).tension);
      expect(new Set(tramos)).toEqual(new Set(["parte"]));
    }
  });

  it("punto inexistente: null", () => {
    expect(medir({ circuito: "led", volts: 9 }, "220", "tension", "carga2")).toBeNull();
  });
});

describe("árbitro: mensaje medir", () => {
  const SEMILLA = 7;
  const setup = () => {
    let t = 0;
    const out: { to: string; m: ServerMsg }[] = [];
    const arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA });
    arb.handle("p1", { t: "hello", alias: "ana" });
    arb.handle("p2", { t: "hello", alias: "beto" });
    arb.handle("p1", { t: "ready" });
    arb.handle("p2", { t: "ready" });
    t += 3000;
    arb.tick();
    return { arb, out, paso: () => { t += 1000; }, z: generar(SEMILLA, 1)[0]!.zonas[0]! };
  };

  it("responde solo con la lectura (sin veredicto ni solución), no penaliza ni avisa al rival", () => {
    const { arb, out, z, paso } = setup();
    const antes = out.length;
    for (let i = 0; i < 5; i++, paso()) arb.handle("p1", { t: "medir", seq: 10 + i, t0: 0, zone: z.zona, pieza: z.opciones[0], modo: "tension", punto: "carga1" });
    const nuevos = out.slice(antes);
    expect(nuevos.every((o) => o.to === "p1" && o.m.t === "medida")).toBe(true);
    const m = nuevos[0]!.m;
    expect(Object.keys(m).sort()).toEqual(["dial", "fraccion", "medirMs", "modo", "punto", "seq", "t", "t0", "tension", "voltios", "zona"]);
    expect(JSON.stringify(nuevos)).not.toMatch(/solucion|semilla|veredicto/);
    // Medir no cuenta como intento: «Probar» sigue disponible y el CSV no tiene filas.
    arb.handle("p1", { t: "test", seq: 99, t0: 0, zone: z.zona, pieza: z.solucion });
    expect(out.filter((o) => o.m.t === "result").at(-1)!.m).toMatchObject({ t: "result", seq: 99, veredicto: "correcto", waitMs: 0 });
    expect(arb.toCsv().split("\r\n").filter((l) => l.startsWith("A;")).length).toBe(1);
  });

  it("continuidad con la pieza puesta: rechazo claro, sin coste, sin contar para la escala y sin información", () => {
    const { arb, out, z, paso } = setup();
    const ultimoMsg = () => out.at(-1)!.m;
    arb.handle("p1", { t: "medir", seq: 1, t0: 0, zone: z.zona, pieza: z.opciones[0], modo: "continuidad", punto: "pieza" });
    expect(ultimoMsg()).toEqual({ t: "reject", seq: 1, t0: 0, reason: "Quita la pieza para medir continuidad.", waitMs: 0, detalle: "Quita la pieza para medir continuidad." });
    // no cobró: la siguiente medida de la misma zona es inmediata y a coste base (la escala no avanzó)
    arb.handle("p1", { t: "medir", seq: 2, t0: 0, zone: z.zona, pieza: "ninguna", modo: "continuidad", punto: "carga1", fuera: true });
    expect(ultimoMsg()).toMatchObject({ t: "medida", seq: 2, pasa: true });
    expect(ultimoMsg()).not.toHaveProperty("dial");
    paso(); paso(); paso();
    // la pieza suelta (quitada): solo sus ohmios, nunca si es la correcta
    arb.handle("p1", { t: "medir", seq: 3, t0: 0, zone: z.zona, pieza: z.opciones[0], modo: "continuidad", punto: "pieza", fuera: true });
    expect(ultimoMsg()).toMatchObject({ t: "medida", seq: 3, pasa: true, ohmios: Number(z.opciones[0]) });
    // «ninguna» no vale con tensión (se necesita la pieza puesta)
    paso(); paso(); paso(); paso();
    arb.handle("p1", { t: "medir", seq: 4, t0: 0, zone: z.zona, pieza: "ninguna", modo: "tension", punto: "carga1" });
    expect(ultimoMsg()).toMatchObject({ t: "reject", reason: "medida no válida" });
  });

  it("rechaza zona, pieza, modo o punto que no existen", () => {
    const { arb, out, z } = setup();
    const malos = [
      { zone: 9, pieza: z.opciones[0], modo: "tension", punto: "carga1" },
      { zone: z.zona, pieza: "999", modo: "tension", punto: "carga1" },
      { zone: z.zona, pieza: z.opciones[0], modo: "ohmios", punto: "carga1" },
      { zone: z.zona, pieza: z.opciones[0], modo: "tension", punto: "bateria" },
    ];
    malos.forEach((x, i) => arb.handle("p1", { t: "medir", seq: i, t0: 0, ...x }));
    expect(out.filter((o) => o.m.t === "reject" && o.m.reason === "medida no válida").length).toBe(4);
  });
});
