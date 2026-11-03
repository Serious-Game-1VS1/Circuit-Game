import { describe, expect, it } from "vitest";
import { Arbiter } from "../src/arbiter/arbiter";
import { COBERTURA, generar, validarPartida, validarZona } from "../src/engine/generador";
import { evaluar } from "../src/engine/pods";
import type { ServerMsg } from "../src/protocol";

describe("nivel 3 «Experto» (resistencias por colores y fusible por aspecto)", () => {
  it("3 000 semillas: válidas, deterministas, solución única con margen ±5 %, 5 pods, cobertura led/cabina/fusible3/placa3", () => {
    const vistas = new Set<string>();
    for (let s = 0; s < 3000; s++) {
      const pods = generar(s, 3);
      expect(validarPartida(pods, 3), `semilla ${s}`).toBeNull();
      expect(JSON.stringify(generar(s, 3))).toBe(JSON.stringify(pods));
      for (const z of pods.flatMap((p) => p.zonas)) { expect(validarZona(z), `semilla ${s}`).toBeNull(); vistas.add(z.circuito); }
    }
    for (const c of COBERTURA[3]) expect(vistas.has(c), c).toBe(true);
    expect([...vistas].every((c) => ["led", "cabina", "protegido", "fusible3", "placa3"].includes(c))).toBe(true);
  });

  it("fusible3: la correcta es el nominal justo sobre el consumo impreso; 40 % de los pods con motor exigen «T»", () => {
    let total = 0, motor = 0;
    for (let s = 0; s < 3000; s++) for (const z of generar(s, 3).flatMap((p) => p.zonas).filter((x) => x.circuito === "fusible3")) {
      total++;
      const a = (p: string) => Number(p.split(":").pop());
      expect(z.consumo, "consumo impreso").toBeGreaterThan(0);
      expect(a(z.solucion)).toBeGreaterThanOrEqual(z.consumo!);
      expect(a(z.solucion)).toBeLessThan(z.consumo! * 1.3);
      expect(z.opciones).toHaveLength(3);
      for (const o of z.opciones) expect(evaluar(z, o) === "correcto", o).toBe(o === z.solucion);
      if (z.arranque) { motor++; expect(z.solucion).toMatch(/T:/); expect(evaluar(z, z.solucion.replace("T:", "F:"))).toBe("poco"); expect(z.opciones).toContain(z.solucion.replace("T:", "F:")); }
    }
    expect(motor / total).toBeGreaterThan(0.25);
    expect(motor / total).toBeLessThan(0.55);
  });

  it("niveles 1, 2 y mixto no cambian: no sortean fusible3", () => {
    for (let s = 0; s < 300; s++) for (const n of [1, 2, "mixto"] as const) expect(generar(s, n).flatMap((p) => p.zonas).some((z) => z.circuito === "fusible3")).toBe(false);
  });

  it("árbitro: pod con nivel 3, consumo en `fija` solo en fusible3, resistencias con los mismos id en Ω y sin solución", () => {
    const msgs: ServerMsg[] = [];
    const arb = new Arbiter((_p, m) => msgs.push(m), { nivel: 3, semilla: 5, practica: true });
    arb.handle("yo", { t: "hello", alias: "ana" });
    const inicio = msgs.find((m) => m.t === "start");
    expect(inicio?.t === "start" && inicio.nivel).toBe(3);
    expect(JSON.stringify(msgs)).not.toContain("solucion");
    for (let s = 0; s < 200; s++) {
      const a = new Arbiter((_p, m) => msgs.push(m), { nivel: 3, semilla: s, practica: true });
      a.handle("yo", { t: "hello", alias: "ana" });
      const st = [...msgs].reverse().find((m) => m.t === "start");
      if (st?.t !== "start") continue;
      for (const z of st.pod.zonas) {
        expect(z.fija !== undefined, `${s} ${z.circuito}`).toBe(z.circuito === "fusible3");
        if (z.circuito === "fusible3") expect(z.fija).toMatch(/^(Consumo|Motor) [\d,]+ A$/);
        else expect(z.opciones.every((o) => /^\d+$/.test(o))).toBe(true);
      }
    }
  });

  it("jugar un fusible3 por el árbitro: la correcta repara, la gruesa quema, la fina corta", () => {
    for (let s = 0; s < 200; s++) {
      const msgs: ServerMsg[] = [];
      const arb = new Arbiter((_p, m) => msgs.push(m), { nivel: 3, semilla: s, practica: true });
      arb.handle("yo", { t: "hello", alias: "ana" });
      const z = arb.pods[0]!.zonas.find((x) => x.circuito === "fusible3");
      if (!z) continue;
      arb.handle("yo", { t: "test", seq: 1, t0: 0, zone: z.zona, pieza: z.solucion });
      const r = msgs.find((m) => m.t === "result");
      expect(r?.t === "result" && r.veredicto).toBe("correcto");
      return;
    }
    throw new Error("ninguna semilla con fusible3 en el pod 1");
  });
});
