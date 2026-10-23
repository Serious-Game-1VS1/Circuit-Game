import { beforeEach, describe, expect, it } from "vitest";
import { Arbiter } from "../src/arbiter/arbiter.js";
import { generar } from "../src/engine/generador.js";
import { evaluar } from "../src/engine/pods.js";
import type { PodView, ServerMsg } from "../src/protocol.js";

/** Semilla cuyo primer pod (nivel 1) ofrece una pieza correcta, una que se queda corta y una que quema. */
const SEMILLA = (() => {
  for (let s = 0; ; s++) {
    const z = generar(s, 1)[0]!.zonas[0]!;
    const v = z.opciones.map((p) => evaluar(z, p));
    if (v.includes("poco") && v.includes("se quema")) return s;
  }
})();
const Z1 = generar(SEMILLA, 1)[0]!.zonas[0]!;
const Z = Z1.zona;
const pieza = (v: string) => Z1.opciones.find((p) => evaluar(Z1, p) === v)!;
const [OK, POCO, QUEMA] = [pieza("correcto"), pieza("poco"), pieza("se quema")];

/**
 * El árbitro es la única fuente de verdad (RNF-06). Reloj falso y mensajes capturados: sin red ni timers.
 * Reescrito para el duelo 1v1: el árbitro anterior (estaciones A/B sobre un pod compartido, engine/pod.ts)
 * correspondía al diseño cooperativo descartado; sus garantías equivalentes se prueban abajo
 * (acción mal formada o ajena se rechaza, cada jugador ve solo lo suyo).
 */
let t: number;
let out: { to: string; m: ServerMsg }[];
let arb: Arbiter;
const sent = (to: string) => out.filter((o) => o.to === to).map((o) => o.m);
const last = (to: string, k: ServerMsg["t"]) => sent(to).filter((m) => m.t === k).at(-1);

beforeEach(() => {
  t = 0;
  out = [];
  arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA });
});

const lobby = () => { arb.handle("p1", { t: "hello", alias: "ana" }); arb.handle("p2", { t: "hello", alias: "beto" }); };
const play = () => {
  lobby();
  arb.handle("p1", { t: "ready" });
  arb.handle("p2", { t: "ready" });
  t += 3000;
  arb.tick();
};
const test = (peer: string, zone: number, pieza: string, seq = 1) => arb.handle(peer, { t: "test", seq, t0: 0, zone, pieza });
/** Pod que el jugador está viendo (último start/result). */
const podOf = (peer: string) => sent(peer).flatMap((m) => (m.t === "start" || m.t === "result" || m.t === "despachado" ? [m.pod] : [])).at(-1)!;
const despachar = (peer: string, seq = 1) => arb.handle(peer, { t: "despachar", seq, t0: 0 });
/** Repara cada zona como un estudiante perfecto: con lo que ve y el motor, no con la solución. */
const repairPod = (peer: string) => {
  for (const z of podOf(peer).zonas) test(peer, z.zona, z.opciones.find((p) => evaluar(z, p) === "correcto")!);
};
const solvePod = (peer: string) => { repairPod(peer); despachar(peer); };

describe("sala: alias, Listo y cuenta 3-2-1 (SCRUM-21, SCRUM-22)", () => {
  it("empareja A/B por llegada, rechaza alias inválido, repetido y tercer jugador", () => {
    arb.handle("p1", { t: "hello", alias: "" });
    expect(last("p1", "full")).toEqual({ t: "full", reason: "alias de 1 a 12 caracteres" });
    arb.handle("p1", { t: "hello", alias: " ana " });
    arb.handle("p2", { t: "hello", alias: "ana" });
    expect(last("p2", "full")).toMatchObject({ reason: "alias en uso" });
    arb.handle("p2", { t: "hello", alias: "beto" });
    arb.handle("p3", { t: "hello", alias: "carla" });
    expect(last("p1", "welcome")).toEqual({ t: "welcome", station: "A", alias: "ana" });
    expect(last("p2", "welcome")).toMatchObject({ station: "B" });
    expect(last("p3", "full")).toMatchObject({ reason: "sala completa" });
    expect(arb.phase).toBe("listo");
  });

  it("cuando ambos pulsan Listo: 3, 2, 1 y empieza; nadie puede probar antes", () => {
    lobby();
    arb.handle("p1", { t: "ready" });
    expect(arb.phase).toBe("listo");
    test("p1", Z, OK);
    expect(last("p1", "reject")).toMatchObject({ reason: "la partida no está en juego" });
    arb.handle("p2", { t: "ready" });
    expect(arb.phase).toBe("cuenta");
    for (const ms of [999, 1, 999, 1, 999, 1]) { t += ms; arb.tick(); }
    expect(sent("p2").filter((m) => m.t === "countdown").map((m) => m.t === "countdown" && m.n)).toEqual([3, 2, 1]);
    expect(arb.phase).toBe("jugando");
    expect(last("p1", "start")).toMatchObject({ despachados: 0, total: 5, nivel: 1, demo: false, pod: { numero: 1 }, rival: { alias: "beto", estado: "reparando" } });
  });

  it("si alguien se va durante la cuenta, se cancela y se libera el asiento", () => {
    lobby();
    arb.handle("p1", { t: "ready" });
    arb.handle("p2", { t: "ready" });
    arb.leave("p2");
    expect(arb.phase).toBe("esperando");
    expect(last("p1", "lobby")).toMatchObject({ players: [{ alias: "ana", ready: false }] });
  });
});

describe("reparar pods con penalizaciones (SCRUM-129, SCRUM-90)", () => {
  beforeEach(play);

  it("el veredicto viene del árbitro y nunca trae la solución, la semilla ni cifras del circuito", () => {
    test("p1", Z, POCO);
    const r = last("p1", "result");
    expect(r).toMatchObject({ zona: Z, veredicto: "poco", waitMs: 2000, despachados: 0 });
    t += 2000;
    solvePod("p1");
    const msgs = [...sent("p1"), ...sent("p2")];
    expect(JSON.stringify(msgs)).not.toMatch(/solucion|semilla|amps/);
    // Cada zona trae exactamente los campos públicos.
    const zonas = msgs.flatMap((m) => (m.t === "start" || m.t === "result" ? m.pod.zonas : []));
    expect(zonas.length).toBeGreaterThan(2);
    for (const z of zonas) expect(Object.keys(z).sort()).toEqual(["circuito", "nombre", "opciones", "reparada", "volts", "zona"]);
  });

  it("ambos jugadores reciben la misma secuencia de pods", () => {
    const seen = (peer: string) => {
      const v: PodView[] = [podOf(peer)];
      for (let i = 0; i < 4; i++) { solvePod(peer); v.push(podOf(peer)); }
      return v;
    };
    expect(seen("p1")).toEqual(seen("p2"));
    expect(podOf("p1").zonas.map((z) => z.opciones)).toEqual(arb.pods[4]!.zonas.map((z) => z.opciones));
  });

  it("compatibilidad: un cliente que manda `ohms` en vez de `pieza` sigue funcionando", () => {
    arb.handle("p1", { t: "test", seq: 1, t0: 0, zone: Z, ohms: Number(OK) });
    expect(last("p1", "result")).toMatchObject({ veredicto: "correcto", pod: { zonas: [{ zona: Z, reparada: true }] } });
  });

  it("enfriamiento por zona, 'sin cambios' y piezas fuera de catálogo", () => {
    test("p1", Z, POCO);
    test("p1", Z, OK, 2);
    expect(last("p1", "reject")).toMatchObject({ seq: 2, reason: "enfriamiento", waitMs: 2000 });
    t += 2000;
    test("p1", Z, POCO, 3);
    expect(last("p1", "reject")).toMatchObject({ seq: 3, reason: "sin-cambios" });
    test("p1", Z, "5", 4);
    expect(last("p1", "reject")).toMatchObject({ seq: 4, reason: "pieza no válida" });
    const ausente = ["100", "220", "470", "1000"].find((p) => !Z1.opciones.includes(p))!;
    test("p1", Z, ausente, 6);
    expect(last("p1", "reject")).toMatchObject({ seq: 6, reason: "pieza no válida" });
    test("p1", 9, OK, 5);
    expect(last("p1", "reject")).toMatchObject({ seq: 5, reason: "zona no válida" });
    arb.handle("p1", { t: "test", zone: "x" });
    expect(last("p1", "reject")).toMatchObject({ reason: "zona no válida" });
  });

  it("quemar bloquea 4 s todo el pod y el rival ve 'penalizado' hasta que pasa", () => {
    test("p1", Z, QUEMA);
    expect(last("p1", "result")).toMatchObject({ veredicto: "se quema", waitMs: 4000 });
    test("p1", Z, OK, 2);
    expect(last("p1", "reject")).toMatchObject({ reason: "quemada" });
    expect(last("p2", "rival")).toMatchObject({ alias: "ana", estado: "penalizado", despachados: 0 });
    t += 4000;
    arb.tick();
    expect(last("p2", "rival")).toMatchObject({ estado: "reparando" });
  });

  it("despachar un pod reparado lo cuenta; el rival ve el progreso solo tras despachar (RF-03, SCRUM-23)", () => {
    repairPod("p1");
    expect(last("p1", "result")).toMatchObject({ despachados: 0, pod: { numero: 1 } });
    expect(podOf("p1").zonas.every((z) => z.reparada)).toBe(true);
    expect(sent("p2").some((m) => m.t === "rival" && m.despachados > 0)).toBe(false);
    despachar("p1", 9);
    expect(last("p1", "despachado")).toMatchObject({ seq: 9, despachados: 1, pod: { numero: 2, zonas: [{ reparada: false }] } });
    expect(last("p2", "rival")).toEqual({ t: "rival", alias: "ana", despachados: 1, estado: "reparando", t0: 0 });
    expect(sent("p2").some((m) => m.t === "result" || m.t === "despachado")).toBe(false);
  });

  it("despachar con zonas sin reparar se rechaza con motivo y no cuenta", () => {
    despachar("p1", 4);
    expect(last("p1", "reject")).toEqual({ t: "reject", seq: 4, t0: 0, reason: "faltan zonas por reparar", waitMs: 0 });
    // Nivel 2: pods de varias zonas; con una sola reparada tampoco se puede despachar.
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA, nivel: 2 });
    play();
    const varias = arb.pods.findIndex((p) => p.zonas.length > 1);
    expect(varias).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < varias; i++) solvePod("p1");
    const z = podOf("p1").zonas[0]!;
    test("p1", z.zona, z.opciones.find((p) => evaluar(z, p) === "correcto")!);
    despachar("p1", 5);
    expect(last("p1", "reject")).toMatchObject({ seq: 5, reason: "faltan zonas por reparar" });
    expect(arb.outcome).toBeUndefined();
    expect(last("p2", "rival")).toMatchObject({ despachados: varias });
  });
});

describe("fin, desempate y reconexión (SCRUM-89)", () => {
  beforeEach(play);

  it("gana el primero en despachar 5; lo que llega después ya no cuenta", () => {
    for (let i = 0; i < 4; i++) { solvePod("p1"); solvePod("p2"); }
    solvePod("p2");
    solvePod("p1");
    expect(arb.outcome).toMatchObject({ phase: "fin", winner: "B", reason: "5 pods despachados", score: { A: { despachados: 4 }, B: { despachados: 5 } } });
    expect(last("p1", "end")).toEqual(last("p2", "end"));
  });

  it("despachos casi simultáneos del último pod: gana el que llega primero al árbitro", () => {
    for (let i = 0; i < 4; i++) { solvePod("p1"); solvePod("p2"); }
    repairPod("p1");
    repairPod("p2"); // ambos con el quinto pod listo; p1 terminó de reparar antes
    despachar("p2", 7);
    despachar("p1", 8);
    expect(arb.outcome).toMatchObject({ winner: "B", score: { A: { despachados: 4 }, B: { despachados: 5 } } });
    expect(last("p1", "reject")).toMatchObject({ seq: 8, reason: "la partida no está en juego" });
  });

  it("un pod reparado pero sin despachar no cuenta para el desempate", () => {
    repairPod("p1");
    t += 12 * 60_000;
    arb.tick();
    expect(arb.outcome).toMatchObject({ winner: null, reason: "tiempo", score: { A: { despachados: 0 } } });
  });

  it("al agotar el tiempo: más pods, luego menos quemadas, luego empate", () => {
    solvePod("p1");
    t += 12 * 60_000;
    arb.tick();
    expect(arb.outcome).toMatchObject({ winner: "A", reason: "tiempo" });
  });

  it("desempate por menos piezas quemadas", () => {
    test("p1", Z, QUEMA);
    t += 12 * 60_000;
    arb.tick();
    expect(arb.outcome).toMatchObject({ winner: "B", score: { A: { quemadas: 1 }, B: { quemadas: 0 } } });
  });

  it("empate si todo es igual", () => {
    t += 12 * 60_000;
    arb.tick();
    expect(arb.outcome).toMatchObject({ winner: null, reason: "tiempo" });
  });

  it("quien vuelve antes de 30 s recupera su estado; el reloj sigue corriendo", () => {
    solvePod("p2");
    arb.leave("p2");
    arb.tick();
    expect(last("p1", "rival")).toMatchObject({ estado: "sin-conexion", despachados: 1 });
    t += 29_999;
    arb.handle("p9", { t: "hello", alias: "beto" });
    expect(last("p9", "welcome")).toMatchObject({ station: "B" });
    expect(last("p9", "start")).toMatchObject({ despachados: 1, restanteMs: 12 * 60_000 - 29_999, rival: { alias: "ana" } });
    expect(last("p1", "rival")).toMatchObject({ estado: "reparando" });
    solvePod("p9");
    expect(last("p9", "despachado")).toMatchObject({ despachados: 2 });
  });

  it("después de 30 s ya no se recupera el asiento", () => {
    arb.leave("p2");
    t += 30_000;
    arb.handle("p9", { t: "hello", alias: "beto" });
    expect(last("p9", "full")).toMatchObject({ reason: "tiempo de reconexión agotado" });
    expect(arb.phase).toBe("jugando");
  });

  it("si ambos faltan 30 s la partida se anula", () => {
    arb.leave("p1");
    t += 10_000;
    arb.leave("p2");
    t += 29_999;
    arb.tick();
    expect(arb.phase).toBe("jugando");
    t += 1;
    arb.tick();
    expect(arb.phase).toBe("anulada");
    expect(arb.outcome).toMatchObject({ phase: "anulada", winner: null });
  });
});

describe("registro por intento (SCRUM-92)", () => {
  it("CSV con ambos jugadores, sin alias, tiempo desde el inicio", () => {
    play();
    t += 1500;
    test("p1", Z, POCO);
    test("p2", Z, OK);
    expect(arb.toCsv()).toBe(
      "﻿jugador;intento;zona;piezas;resultado;tiempo_ms;quemada;pod;tiempo_pod_ms\r\n" +
        `A;1;${Z};R=${POCO};fallo;1500;no;1;\r\n` +
        `B;1;${Z};R=${OK};ok;1500;no;1;\r\n`,
    );
  });

  it("cronómetro por pod: cada despacho suma una fila con la duración del pod", () => {
    play();
    t += 1500;
    repairPod("p1");
    t += 500;
    despachar("p1"); // pod 1: 2000 ms
    t += 3000;
    repairPod("p1");
    despachar("p1"); // pod 2: 3000 ms
    const filas = arb.toCsv().trimEnd().split("\r\n").slice(1);
    expect(filas[1]).toBe("A;;;;despacho;2000;no;1;2000");
    expect(filas.at(-1)).toBe("A;;;;despacho;5000;no;2;3000");
    expect(filas.filter((f) => f.includes(";despacho;"))).toHaveLength(2);
  });

  it("sin intentos solo trae la cabecera", () => {
    expect(arb.toCsv()).toBe("﻿jugador;intento;zona;piezas;resultado;tiempo_ms;quemada;pod;tiempo_pod_ms\r\n");
  });
});

describe("carrera final y podio (propuesta A+D)", () => {
  it("el árbitro decide el ganador; el azar solo elige el pod; llamas = despachos limpios", () => {
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA, azar: () => 0.99 });
    play();
    test("p1", Z, POCO); // falla el pod 1: no es limpio
    t += 2000;
    for (let i = 0; i < 5; i++) { t += 1000; solvePod("p1"); }
    const end = last("p1", "end");
    expect(end).toEqual(last("p2", "end"));
    expect(end).toMatchObject({ winner: "A", reason: "5 pods despachados" });
    const c = arb.outcome!.carrera!;
    // azar 0.99: el último de los despachados; B no despachó ninguno y corre el pod 1.
    expect(c.A).toMatchObject({ pod: 5, llamas: 4, podMs: [3000, 1000, 1000, 1000, 1000] });
    expect(c.A!.repasar).toEqual([{ zona: Z1.nombre, circuito: Z1.circuito, fallos: 1, quemadas: 0 }]);
    expect(c.B).toMatchObject({ pod: 1, llamas: 0, podMs: [] });
    // La solución y la semilla nunca salen del árbitro.
    const txt = JSON.stringify(end);
    expect(txt).not.toMatch(/solucion|semilla/);
  });

  it("al agotar el tiempo también hay carrera, con el desempate de siempre", () => {
    play();
    solvePod("p2");
    t += 12 * 60_000;
    arb.tick();
    expect(arb.outcome).toMatchObject({ winner: "B", reason: "tiempo", carrera: { B: { llamas: 1 }, A: { llamas: 0 } } });
  });

  it("quien vuelve antes de 30 s tras el fin recibe el mismo resultado; después, no", () => {
    play();
    for (let i = 0; i < 5; i++) solvePod("p1");
    const end = last("p1", "end");
    arb.leave("p1");
    arb.leave("p2");
    t += 29_999;
    arb.handle("p9", { t: "hello", alias: "ana" });
    expect(last("p9", "welcome")).toMatchObject({ station: "A" });
    expect(last("p9", "end")).toEqual(end);
    t += 1;
    arb.handle("p8", { t: "hello", alias: "beto" });
    expect(last("p8", "full")).toMatchObject({ reason: "tiempo de reconexión agotado" });
    expect(last("p8", "end")).toBeUndefined();
  });
});

describe("modo demo: una sola mecánica (Radar)", () => {
  it("avisa del modo en start, los 5 pods son solo Radar con LED y se juega hasta el fin", () => {
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA, demo: "radar" });
    play();
    expect(last("p1", "start")).toMatchObject({ demo: true, pod: { numero: 1, zonas: [{ nombre: "radar", circuito: "led" }] } });
    for (let i = 0; i < 5; i++) {
      const pod = podOf("p1");
      expect(pod.zonas.map((z) => [z.nombre, z.circuito, z.opciones.length])).toEqual([["radar", "led", 4]]);
      solvePod("p1");
    }
    expect(arb.phase).toBe("fin");
    expect(JSON.stringify([...sent("p1"), ...sent("p2")])).not.toMatch(/solucion|semilla|amps/);
  });
});

describe("modo demo de cableado (Cabina y Turbina)", () => {
  it("start lleva demo: true, solo Cabina/Turbina con montajes, mismos pods para ambos y se juega hasta el fin", () => {
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA, demo: "cableado" });
    play();
    expect(last("p1", "start")).toMatchObject({ demo: true });
    expect(podOf("p2")).toEqual(podOf("p1"));
    for (let i = 0; i < 5; i++) {
      const pod = podOf("p1");
      expect(pod.zonas.every((z) => (z.nombre === "cabina" && z.circuito === "luces") || (z.nombre === "turbina" && z.circuito === "interruptor"))).toBe(true);
      solvePod("p1");
    }
    expect(arb.phase).toBe("fin");
    expect(JSON.stringify([...sent("p1"), ...sent("p2")])).not.toMatch(/solucion|semilla|amps/);
  });
});
