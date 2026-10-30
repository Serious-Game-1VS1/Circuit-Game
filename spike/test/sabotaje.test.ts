import { describe, expect, it } from "vitest";
import { Arbiter, SABOTAJE_MS } from "../src/arbiter/arbiter.js";
import { PenaltyTracker } from "../src/arbiter/penalties.js";
import { generarOleada } from "../src/engine/generador.js";
import { evaluar } from "../src/engine/pods.js";
import type { PodView, ServerMsg, Sabotaje, TipoSabotaje } from "../src/protocol.js";

/** Duelo con reloj falso. `pods` > 5 alarga la partida para probar los topes sin que acabe antes. */
function partida(semilla: number, pods = 12) {
  let t = 0;
  const out: { to: string; m: ServerMsg }[] = [];
  const arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla, pods: Array.from({ length: pods }, (_, i) => generarOleada(semilla, 1, i + 1)) });
  arb.handle("p1", { t: "hello", alias: "ana" });
  arb.handle("p2", { t: "hello", alias: "beto" });
  arb.handle("p1", { t: "ready" });
  arb.handle("p2", { t: "ready" });
  t += 3000;
  arb.tick();
  const sent = (to: string) => out.filter((o) => o.to === to).map((o) => o.m);
  const last = <K extends ServerMsg["t"]>(to: string, k: K) => sent(to).filter((m) => m.t === k).at(-1) as Extract<ServerMsg, { t: K }> | undefined;
  const pod = (peer: string): PodView => sent(peer).flatMap((m) => (m.t === "start" || m.t === "result" || m.t === "despachado" ? [m.pod] : [])).at(-1)!;
  let seq = 0;
  const probar = (peer: string, mal: boolean) => {
    for (const z of pod(peer).zonas) {
      if (z.reparada) continue;
      const op = z.opciones.find((p) => (evaluar(z, p) === "correcto") !== mal)!;
      arb.handle(peer, { t: "test", seq: ++seq, t0: 0, zone: z.zona, pieza: op });
    }
  };
  /** Resuelve el pod como un estudiante perfecto y lo despacha; devuelve el despacho. */
  const limpio = (peer: string) => { for (let i = 0; i < 3; i++) probar(peer, false); // la falla encadenada (pods altos) pide una segunda pasada
    arb.handle(peer, { t: "despachar", seq: ++seq, t0: 0 }); return last(peer, "despachado")!; };
  /** Un fallo (sin llegar a repararlo): ensucia el pod. */
  const falla = (peer: string, espera = 0) => { probar(peer, true); t += espera; };
  return { arb, out, sent, last, limpio, falla, pod, avanza: (ms: number) => { t += ms; }, ahora: () => t };
}

describe("sabotaje: concesión", () => {
  it("al 3.er pod limpio seguido el árbitro sabotea al rival (y no antes); el atacante lo sabe", () => {
    const g = partida(7);
    expect(g.limpio("p1").enviado).toBeUndefined();
    expect(g.limpio("p2").enviado).toBeUndefined();
    expect(g.limpio("p1")).toMatchObject({ limpios: 2 });
    g.limpio("p2");
    const d = g.limpio("p1");
    expect(d.enviado).toBeDefined();
    expect(d.limpios).toBe(0); // conceder reinicia la racha de pods limpios
    const s = g.last("p2", "sabotaje") as Sabotaje;
    expect(s).toMatchObject({ t: "sabotaje", tipo: d.enviado, ms: SABOTAJE_MS[d.enviado!], de: "A" });
    expect(g.last("p1", "sabotaje")).toBeUndefined();
  });

  it("un fallo en un pod rompe la racha de pods limpios", () => {
    const g = partida(7);
    g.limpio("p1"); g.limpio("p2");
    g.falla("p1", 11_000);
    expect(g.last("p1", "result")).toMatchObject({ limpios: 0 });
    g.limpio("p1"); g.limpio("p2"); // este pod ya traía fallo: no cuenta como limpio
    g.limpio("p1"); g.limpio("p2");
    const d = g.limpio("p1");
    expect(d.limpios).toBe(2);
    expect(d.enviado).toBeUndefined();
  });

  it("el tipo es reproducible por semilla y, entre semillas, salen los 3 tipos", () => {
    const tipo = (semilla: number) => {
      const g = partida(semilla, 5);
      for (let i = 0; i < 2; i++) { g.limpio("p1"); g.limpio("p2"); }
      return g.limpio("p1").enviado!;
    };
    expect(tipo(11)).toBe(tipo(11));
    const vistos = new Set<TipoSabotaje>();
    for (let s = 0; s < 60; s++) vistos.add(tipo(s));
    expect([...vistos].sort()).toEqual(["enfriamiento", "humo", "sin-pista"]);
  });

  it("mismas reglas para p2: quien llega a 3 limpios sabotea al otro", () => {
    const g = partida(7);
    for (let i = 0; i < 2; i++) { g.limpio("p1"); g.limpio("p2"); }
    g.limpio("p1");
    expect(g.limpio("p2").enviado).toBeDefined();
    expect(g.last("p1", "sabotaje")).toMatchObject({ de: "B" });
  });

  it("anti bola de nieve: nada si el rival va 2 o más pods por detrás; llega cuando se acerca", () => {
    const g = partida(7);
    for (let i = 0; i < 3; i++) expect(g.limpio("p1").enviado).toBeUndefined(); // p1 3, p2 0
    g.limpio("p2"); g.limpio("p2");
    const d = g.limpio("p1"); // p1 4, p2 2: la racha espera
    expect([d.enviado, d.limpios]).toEqual([undefined, 3]);
    g.limpio("p2"); g.limpio("p2");
    expect(g.limpio("p1").enviado).toBeDefined(); // p1 5, p2 4: diferencia 1
  });

  it("no se concede si el rival está penalizado (enfriando o quemado)", () => {
    const g = partida(7);
    for (let i = 0; i < 2; i++) { g.limpio("p1"); g.limpio("p2"); }
    g.falla("p2"); // p2 queda bloqueado unos segundos
    expect(g.limpio("p1").enviado).toBeUndefined();
    g.avanza(20_000);
    g.limpio("p2");
    expect(g.limpio("p1").enviado).toBeDefined(); // pasado el bloqueo, la racha de p1 (3) por fin se cobra
  });

  it("inmunidad de 20 s y tope de 3 por partida", () => {
    const g = partida(7, 20);
    for (let i = 0; i < 2; i++) { g.limpio("p1"); g.limpio("p2"); }
    expect(g.limpio("p1").enviado).toBeDefined(); // 1.º: p1 3, p2 2
    for (let i = 0; i < 2; i++) { g.limpio("p2"); g.limpio("p2"); g.limpio("p1"); }
    g.limpio("p2");
    const d = g.limpio("p1"); // p1 6, p2 5: p2 sigue inmune
    expect([d.enviado, d.limpios]).toEqual([undefined, 3]);
    g.avanza(21_000);
    g.limpio("p2");
    expect(g.limpio("p1").enviado).toBeDefined(); // 2.º: p1 7, p2 6
    const sigue = () => { g.limpio("p2"); g.avanza(21_000); return g.limpio("p1"); };
    sigue(); sigue();
    expect(sigue().enviado).toBeDefined(); // 3.º
    sigue(); sigue();
    const d4 = sigue(); // 4.º: tope de la partida
    expect([d4.enviado, d4.limpios]).toEqual([undefined, 3]);
    expect(g.sent("p2").filter((m) => m.t === "sabotaje")).toHaveLength(3);
  });

  it("la práctica (sin rival) no sabotea ni informa de pods limpios", () => {
    let t = 0;
    const out: ServerMsg[] = [];
    const arb = new Arbiter((_, m) => out.push(m), { now: () => t, semilla: 3, practica: true });
    arb.handle("p1", { t: "hello", alias: "ana" });
    for (let i = 0; i < 3; i++) {
      const pod = out.flatMap((m) => (m.t === "start" || m.t === "despachado" ? [m.pod] : [])).at(-1)!;
      for (const z of pod.zonas) arb.handle("p1", { t: "test", seq: 1, t0: 0, zone: z.zona, pieza: z.opciones.find((p) => evaluar(z, p) === "correcto")! });
      arb.handle("p1", { t: "despachar", seq: 2, t0: 0 });
      t += 1000;
    }
    const ds = out.filter((m) => m.t === "despachado");
    expect(ds).toHaveLength(3);
    expect(ds.every((m) => m.t === "despachado" && m.enviado === undefined && m.limpios === undefined)).toBe(true);
    expect(out.some((m) => m.t === "sabotaje")).toBe(false);
  });

  it("el rival nunca puede dispararlo: un mensaje «sabotaje» del cliente se ignora", () => {
    const g = partida(7);
    g.arb.handle("p2", { t: "sabotaje", tipo: "humo", ms: 99999, de: "B" });
    expect(g.last("p1", "sabotaje")).toBeUndefined();
  });
});

describe("sabotaje: enfriamiento largo", () => {
  /** Una semilla cuyo primer sabotaje (de p1 a p2) es el del tipo pedido. */
  const conTipo = (tipo: TipoSabotaje) => {
    for (let s = 0; s < 200; s++) {
      const g = partida(s, 5);
      for (let i = 0; i < 2; i++) { g.limpio("p1"); g.limpio("p2"); }
      if (g.limpio("p1").enviado === tipo) { g.avanza(10); return g; }
    }
    throw new Error("sin semilla");
  };

  it("el próximo fallo del rival suma +2 s, una sola vez", () => {
    const g = conTipo("enfriamiento");
    g.falla("p2");
    const r1 = g.last("p2", "result")!;
    expect(r1.waitMs).toBe(4000); // 2 s de la primera falla + 2 s del sabotaje
    g.avanza(r1.waitMs + 10);
    g.falla("p2"); // otra zona o la misma: sin carga, vuelve el escalado normal
    const w = g.last("p2", "result")!.waitMs;
    expect(w === 2000 || w === 4000).toBe(true);
  });

  it("caduca a los 8 s sin fallo", () => {
    const g = conTipo("enfriamiento");
    g.avanza(9000);
    g.falla("p2");
    expect(g.last("p2", "result")!.waitMs).toBe(2000);
  });

  it("el snapshot al reconectar trae el sabotaje vigente con los ms que quedan", () => {
    const g = conTipo("humo");
    g.arb.leave("p2");
    g.avanza(1000);
    g.arb.handle("p2b", { t: "hello", alias: "beto" });
    const s = g.last("p2b", "start")!;
    expect(s.sabotaje?.tipo).toBe("humo");
    expect(s.sabotaje!.ms).toBeLessThanOrEqual(SABOTAJE_MS.humo);
    expect(s.sabotaje!.ms).toBeGreaterThan(0);
    expect(s.limpios).toBe(2);
  });
});

describe("PenaltyTracker: enfriamiento largo acotado", () => {
  const mk = (largo: boolean) => { let t = 0; const p = new PenaltyTracker(() => t); if (largo) p.largoHasta = 8000; return { p, tick: (ms: number) => { t += ms; } }; };

  it("suma 2 s y consume la carga", () => {
    const { p } = mk(true);
    expect(p.registerFailure(1, ["a"])).toBe(4000);
    expect(p.largoHasta).toBe(0);
  });

  it("se combina con el bono (mitad) y la mejora de enfriamiento corto, siempre entre 1 y 10 s", () => {
    const a = mk(true);
    a.p.bono = true;
    expect(a.p.registerFailure(1, ["a"])).toBe(3000); // 2 s -> mitad 1 s -> +2 s
    const b = mk(true);
    b.p.cooldownFactor = 0.5; // 1 s de base
    expect(b.p.registerFailure(1, ["a"])).toBe(3000);
    const c = mk(true);
    c.p.registerFailure(1, ["a"]); c.p.registerFailure(1, ["a"]); c.p.largoHasta = 99_999;
    expect(c.p.registerFailure(1, ["a"])).toBe(10_000); // 8 s + 2 s: el tope
    const d = mk(true);
    d.p.cooldownFactor = 3; d.p.registerFailure(2, ["a"]); d.p.registerFailure(2, ["a"]); d.p.largoHasta = 99_999;
    expect(d.p.registerFailure(2, ["a"])).toBe(10_000); // 24 s ×... acotado
    const e = mk(false);
    e.p.cooldownFactor = 0.1;
    expect(e.p.registerFailure(1, ["a"])).toBe(1000); // piso
  });

  it("una carga vencida no cuenta", () => {
    const { p, tick } = mk(true);
    tick(9000);
    expect(p.registerFailure(1, ["a"])).toBe(2000);
  });
});
