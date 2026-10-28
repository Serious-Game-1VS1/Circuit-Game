import { describe, expect, it } from "vitest";
import FAMILIAS from "../src/engine/familias.json";
import { COBERTURA, familias, generar, nivelDePod, presupuesto, validarFamilias, validarPartida } from "../src/engine/generador.js";
import { medir } from "../src/engine/medir.js";
import { evaluar } from "../src/engine/pods.js";
import { Arbiter } from "../src/arbiter/arbiter.js";
import type { ServerMsg } from "../src/protocol.js";

const inv = { circuito: "invertido", volts: 9 } as const;
const abi = { circuito: "abierto", volts: 9 } as const;

describe("nivel 2: LED invertido y circuito abierto", () => {
  it("solo una pieza es correcta; la otra no enciende el LED", () => {
    expect([evaluar(inv, "directa"), evaluar(inv, "inversa")]).toEqual(["correcto", "poco"]);
    expect([evaluar(abi, "empalmar"), evaluar(abi, "dejar")]).toEqual(["correcto", "poco"]);
  });

  it("el multímetro los diagnostica", () => {
    // LED al revés: no conduce y queda toda la batería sobre él; derecho, solo cae su tensión directa.
    // (La continuidad de un LED depende de la polaridad de las puntas, así que no sirve para distinguirlos.)
    expect(medir(inv, "inversa", "tension", "carga1")).toMatchObject({ tension: "toda" });
    expect(medir(inv, "directa", "tension", "carga1")).toMatchObject({ tension: "parte" });
    // Circuito abierto: el hueco no conduce y tiene toda la tensión; empalmado, conduce y no tiene tensión.
    expect(medir(abi, "dejar", "continuidad", "pieza")).toEqual({ pasa: false });
    expect(medir(abi, "dejar", "tension", "pieza")).toMatchObject({ tension: "toda" });
    expect(medir(abi, "empalmar", "continuidad", "pieza")).toEqual({ pasa: true });
    expect(medir(abi, "empalmar", "tension", "pieza")).toMatchObject({ tension: "nada" });
  });

  it("las familias vienen de familias.json y el generador las sortea en los pods 4 y 5", () => {
    expect(familias(0, 2, true)).toEqual(["led", "invertido", "combinar"]);
    expect(familias(0, 2, false)).toEqual(["led"]);
    expect(COBERTURA[2]).toEqual(expect.arrayContaining(["invertido", "abierto"]));
    const vistas = new Set<string>();
    for (let s = 0; s < 200; s++) {
      const pods = generar(s, 2);
      pods.slice(0, 3).forEach((p) => p.zonas.forEach((z) => expect(["invertido", "abierto"]).not.toContain(z.circuito)));
      pods.slice(3).forEach((p) => p.zonas.forEach((z) => vistas.add(z.circuito)));
    }
    expect([...vistas]).toEqual(expect.arrayContaining(["led", "invertido", "interruptor", "abierto"]));
  });
});

describe("perfil mixto (duelo por defecto): rampa LED, LED, Cabina (nivel 1) y dos pods de nivel 2", () => {
  it("pods 1-3 de nivel 1 (zonas de LED, LED, Cabina); pods 4-5 con al menos 3 familias de nivel 2 distintas", () => {
    const vistas = new Set<string>();
    for (let s = 0; s < 500; s++) {
      const pods = generar(s, "mixto");
      expect(validarPartida(pods, "mixto")).toBeNull();
      expect(generar(s, "mixto")).toEqual(pods); // determinista: ambos jugadores reciben los mismos
      expect(pods.slice(0, 3).map((p) => p.zonas.map((z) => z.zona === 1 ? "cabina" : z.circuito))).toEqual([["led"], ["led"], ["cabina"]]);
      pods.slice(0, 3).forEach((p) => p.zonas.forEach((z) => expect(familias(z.zona, 1, false)).toContain(z.circuito)));
      pods.slice(3).forEach((p) => p.zonas.forEach((z) => expect(familias(z.zona, 2, true)).toContain(z.circuito)));
      const n2 = new Set(pods.slice(3).flatMap((p) => p.zonas.map((z) => z.circuito)).filter((c) => ["luces", "interruptor", "fusible", "invertido", "abierto", "combinar", "divisor", "protegido"].includes(c)));
      expect(n2.size).toBeGreaterThanOrEqual(3);
      n2.forEach((c) => vistas.add(c));
      expect(pods.slice(3).every((p) => presupuesto(p) <= 7)).toBe(true);
    }
    expect([...vistas].sort()).toEqual(["abierto", "combinar", "divisor", "fusible", "interruptor", "invertido", "luces", "protegido"]);
  });

  it("validarPartida rechaza un mixto sin rampa; los niveles 1 y 2 no cambian", () => {
    expect(validarPartida(generar(3, 1), "mixto")).toMatch(/familia/);
    expect([0, 2, 3, 4].map((i) => nivelDePod("mixto", i))).toEqual([1, 1, 2, 2]);
    expect([0, 4].map((i) => nivelDePod(2, i))).toEqual([2, 2]);
  });
});

describe("validación de familias.json", () => {
  const base = JSON.parse(JSON.stringify(FAMILIAS));
  it("el archivo vigente es válido", () => expect(() => validarFamilias(base)).not.toThrow());
  it("rechaza una familia desconocida con un mensaje claro", () => {
    const d = JSON.parse(JSON.stringify(base));
    d.zonas["1"].sinCables[0] = ["plasma"];
    expect(() => validarFamilias(d)).toThrow(/familia desconocida "plasma"/);
  });
  it("rechaza una familia sin dificultad", () => {
    const d = JSON.parse(JSON.stringify(base));
    delete d.dificultad.led;
    expect(() => validarFamilias(d)).toThrow(/falta dificultad de "led"/);
  });
});

describe("nivel 2 de punta a punta en el árbitro: Probar y Despachar de cada falla", () => {
  // Cada familia: veredicto de cada pieza ofrecida (fusible 3 A y paralelo/puente con el interruptor penalizan como quemada).
  const ESPERADO: Record<string, Record<string, string>> = {
    luces: { paralelo: "correcto", serie: "poco", puente: "corto" },
    interruptor: { serie: "correcto", paralelo: "corto" },
    fusible: { "0.5": "poco", "1": "correcto", "3": "se quema" },
    invertido: { directa: "correcto", inversa: "poco" },
    abierto: { empalmar: "correcto", dejar: "poco" },
  };

  for (const [circuito, porPieza] of Object.entries(ESPERADO)) {
    it(`${circuito}: cada pieza da su veredicto y solo la correcta repara y deja despachar`, () => {
      const semilla = Array.from({ length: 200 }, (_, s) => s).find((s) => generar(s, 2).some((p) => p.zonas.some((z) => z.circuito === circuito)))!;
      let t = 0;
      const out: ServerMsg[] = [];
      const arb = new Arbiter((to, m) => { if (to === "p1") out.push(m); }, { now: () => t, semilla, nivel: 2 });
      arb.handle("p1", { t: "hello", alias: "ana" });
      arb.handle("p2", { t: "hello", alias: "beto" });
      arb.handle("p1", { t: "ready" });
      arb.handle("p2", { t: "ready" });
      t += 3000;
      arb.tick();
      const pod = () => out.flatMap((m) => (m.t === "start" || m.t === "result" || m.t === "despachado" ? [m.pod] : [])).at(-1)!;
      const ultimo = (k: string) => out.filter((m) => m.t === k).at(-1) as Extract<ServerMsg, { t: "result" }> & { reason: string };
      let seq = 0;
      const probar = (zona: number, pieza: string) => { arb.handle("p1", { t: "test", seq: ++seq, t0: 0, zone: zona, pieza }); return ultimo("result"); };
      // El divisor necesita su R1 fija, que el cliente ve en `fija` ("R1 470 Ω").
      const conR1 = <T extends { fija?: string }>(z: T) => ({ ...z, r1: z.fija ? Number(/(\d+) Ω/.exec(z.fija)![1]) : undefined });
      const reparar = () => { for (const z of pod().zonas) if (!z.reparada) probar(z.zona, z.opciones.find((p) => evaluar(conR1(z), p) === "correcto")!); arb.handle("p1", { t: "despachar", seq: ++seq, t0: 0 }); };
      // Avanza con juego perfecto hasta el pod que trae la falla.
      while (!pod().zonas.some((z) => z.circuito === circuito)) reparar();
      const z = pod().zonas.find((x) => x.circuito === circuito)!;
      expect([...z.opciones].sort()).toEqual(Object.keys(porPieza).sort());
      for (const pieza of z.opciones.filter((p) => porPieza[p] !== "correcto")) {
        const r = probar(z.zona, pieza);
        expect(r.veredicto).toBe(porPieza[pieza]);
        expect(r.pod.zonas.find((x) => x.zona === z.zona)!.reparada).toBe(false);
        if (r.veredicto === "se quema" || r.veredicto === "corto") { expect(r.waitMs).toBe(4000); } else expect(r.waitMs).toBeGreaterThan(0);
        t += 10_000; // pasa el bloqueo
      }
      // Despachar sin reparar la zona se rechaza; con la pieza correcta, repara y despacha.
      arb.handle("p1", { t: "despachar", seq: ++seq, t0: 0 });
      expect(ultimo("reject")).toMatchObject({ reason: "faltan zonas por reparar" });
      const ok = probar(z.zona, z.opciones.find((p) => evaluar(z, p) === "correcto")!);
      expect(ok.veredicto).toBe("correcto");
      expect(ok.pod.zonas.find((x) => x.zona === z.zona)!.reparada).toBe(true);
      const antes = out.filter((m) => m.t === "despachado").length;
      reparar();
      expect(out.filter((m) => m.t === "despachado").length + (arb.outcome ? 1 : 0)).toBeGreaterThan(antes);
    });
  }
});
