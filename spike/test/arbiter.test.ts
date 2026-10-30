import { beforeEach, describe, expect, it } from "vitest";
import { Arbiter, MATCH_LIMIT_MS } from "../src/arbiter/arbiter.js";
import { encadena, generar, generarOleada } from "../src/engine/generador.js";
import { evaluar, jugadas } from "../src/engine/pods.js";
import type { PodView, ServerMsg } from "../src/protocol.js";

/** Semilla cuyo primer pod (nivel 1) ofrece una pieza correcta, una que se queda corta y una que quema. */
const SEMILLA = (() => {
  for (let s = 0; ; s++) {
    const z = generar(s, 1)[0]!.zonas[0]!;
    const v = jugadas(z).map((p) => evaluar(z, p));
    if (v.includes("poco") && v.includes("se quema")) return s;
  }
})();
const Z1 = generar(SEMILLA, 1)[0]!.zonas[0]!;
const Z = Z1.zona;
const pieza = (v: string) => jugadas(Z1).find((p) => evaluar(Z1, p) === v)!;
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
  const pod = podOf(peer);
  // La cadena no se resuelve con lo visible (hay que medir para hallar la pieza muerta): aquí se usa la zona del árbitro.
  for (const z of pod.zonas) { const zs = arb.pods[pod.numero - 1]!.zonas.find((x) => x.zona === z.zona)!; test(peer, z.zona, jugadas(zs).find((p) => evaluar(zs, p) === "correcto")!); }
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

  it("Listo antes de que llegue el rival se recuerda: A entra, A Listo, B entra, B Listo → cuenta", () => {
    arb.handle("p1", { t: "hello", alias: "ana" });
    arb.handle("p1", { t: "ready" });
    expect(last("p1", "lobby")).toMatchObject({ phase: "esperando", players: [{ alias: "ana", ready: true }] });
    arb.handle("p2", { t: "hello", alias: "beto" });
    expect(last("p2", "lobby")).toMatchObject({ players: [{ alias: "ana", ready: true }, { alias: "beto", ready: false }] });
    arb.handle("p2", { t: "ready" });
    expect(arb.phase).toBe("cuenta");
  });

  it("tras reconectar en la sala (se fue y volvió) se puede pulsar Listo de nuevo y arranca", () => {
    lobby();
    arb.handle("p1", { t: "ready" });
    arb.leave("p2");
    arb.handle("p3", { t: "hello", alias: "beto" });
    arb.handle("p3", { t: "ready" });
    arb.handle("p1", { t: "ready" });
    expect(arb.phase).toBe("cuenta");
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
    for (const z of zonas) expect(Object.keys(z).sort()).toEqual(["circuito", ...(z.circuito === "cadena" ? ["cadena"] : []), "nombre", "opciones", "reparada", "volts", "zona"]);
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

  it("perfil mixto: el start trae nivel 1 y cada pod su nivel; los pods 4 y 5 son de nivel 2", () => {
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA, nivel: "mixto" });
    play();
    expect(last("p1", "start")).toMatchObject({ nivel: 1, pod: { numero: 1, nivel: 1 } });
    for (let i = 0; i < 3; i++) solvePod("p1");
    expect(podOf("p1")).toMatchObject({ numero: 4, nivel: 2 });
    solvePod("p1");
    expect(podOf("p1")).toMatchObject({ numero: 5, nivel: 2 });
    solvePod("p1");
    expect(arb.outcome).toMatchObject({ winner: "A" });
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
    test("p1", z.zona, jugadas(z).find((p) => evaluar(z, p) === "correcto")!);
    despachar("p1", 5);
    expect(last("p1", "reject")).toMatchObject({ seq: 5, reason: "faltan zonas por reparar" });
    expect(arb.outcome).toBeUndefined();
    expect(last("p2", "rival")).toMatchObject({ despachados: varias });
  });
});

describe("racha de despachos y bono (autoridad del árbitro)", () => {
  beforeEach(play);
  const racha = (peer: string) => (last(peer, "result") as { racha?: number; bono?: string }) ;

  it("mismas reglas para ambos: 3 zonas completas dan bono «listo»; el siguiente fallo lo usa y reinicia", () => {
    for (const peer of ["p1", "p2"]) {
      let n = 0;
      while (n < 3) { for (const z of podOf(peer).zonas) { if (n >= 3) break; test(peer, z.zona, jugadas(z).find((p) => evaluar(z, p) === "correcto")!); n++; } if (n < 3) despachar(peer); }
      expect(racha(peer)).toMatchObject({ racha: 3, bono: "listo" });
      expect(JSON.stringify(sent(peer))).not.toMatch(/solucion/);
    }
  });
  it("el fallo consume el bono: espera reducida y racha 0", () => {
    let n = 0;
    while (n < 3) { for (const z of podOf("p1").zonas) { if (n >= 3) break; test("p1", z.zona, jugadas(z).find((p) => evaluar(z, p) === "correcto")!); n++; } if (n < 3) despachar("p1"); }
    despachar("p1");
    const z = podOf("p1").zonas[0]!;
    const mala = jugadas(z).find((p) => evaluar(z, p) === "poco")!;
    test("p1", z.zona, mala);
    expect(racha("p1")).toMatchObject({ racha: 0, bono: "usado", waitMs: 1000 });
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

  it("limitMs de 5 min: termina por tiempo a los 5 min y el cliente recibe ese restante; el default sigue en 12", () => {
    expect(MATCH_LIMIT_MS).toBe(12 * 60_000);
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA, limitMs: 5 * 60_000 });
    play();
    expect(last("p1", "start")).toMatchObject({ restanteMs: 5 * 60_000 });
    solvePod("p1");
    t += 5 * 60_000 - 1;
    arb.tick();
    expect(arb.phase).toBe("jugando");
    t += 1;
    arb.tick();
    expect(arb.outcome).toMatchObject({ winner: "A", reason: "tiempo" });
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

  it("al volver conserva quemadas, tiempos de pod y enfriamiento", () => {
    test("p2", Z, QUEMA);
    t += 60_000; // pasa el enfriamiento de la quemada
    solvePod("p2");
    arb.leave("p2");
    t += 5_000;
    arb.handle("p9", { t: "hello", alias: "beto" });
    t += 12 * 60_000;
    arb.tick();
    expect(arb.outcome).toMatchObject({ score: { B: { despachados: 1, quemadas: 1 } } });
    expect(arb.toCsv()).toContain("despacho");
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
      "﻿jugador;intento;zona;piezas;resultado;tiempo_ms;quemada;pod;tiempo_pod_ms;nivel;zona_nombre;pieza_correcta\r\n" +
        `A;1;${Z};R=${POCO};fallo;1500;no;1;;1;${Z1.nombre};${Z1.solucion}\r\n` +
        `B;1;${Z};R=${OK};ok;1500;no;1;;1;${Z1.nombre};${Z1.solucion}\r\n`,
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
    expect(filas[1]).toBe("A;;;;despacho;2000;no;1;2000;1;;");
    expect(filas.at(-1)).toBe("A;;;;despacho;5000;no;2;3000;1;;");
    expect(filas.filter((f) => f.includes(";despacho;"))).toHaveLength(2);
  });

  it("la pieza correcta solo va al CSV: ningún mensaje al cliente la lleva", () => {
    play();
    t += 1500;
    test("p1", Z, POCO);
    test("p2", Z, OK);
    expect(Z1.solucion).toBe(OK);
    expect(JSON.stringify(out)).not.toMatch(/solucion|pieza_correcta/);
    expect(arb.toCsv()).toContain(Z1.solucion);
  });

  it("sin intentos solo trae la cabecera", () => {
    expect(arb.toCsv()).toBe("﻿jugador;intento;zona;piezas;resultado;tiempo_ms;quemada;pod;tiempo_pod_ms;nivel;zona_nombre;pieza_correcta\r\n");
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

describe("modo práctica (SCRUM-151)", () => {
  for (const nivel of [1, 2] as const) {
    it(`nivel ${nivel}: arranca con un jugador, sin rival ni cuenta ni límite, y al despachar 5 termina sin carrera ni CSV`, () => {
      arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA, nivel, practica: true });
      arb.handle("p1", { t: "hello", alias: "ana" });
      expect(arb.phase).toBe("jugando");
      expect(last("p1", "start")).toMatchObject({ practica: true, nivel, rival: null, despachados: 0, restanteMs: 0, pod: { numero: 1 } });
      expect(last("p1", "countdown")).toBeUndefined();
      arb.handle("p2", { t: "hello", alias: "beto" });
      expect(last("p2", "full")).toMatchObject({ reason: "sala completa" });

      t += 60 * 60_000; // una hora: sin límite de 12 min
      arb.tick();
      expect(arb.phase).toBe("jugando");
      const z = podOf("p1").zonas[0]!;
      test("p1", z.zona, jugadas(z).find((p) => evaluar(z, p) === "se quema") ?? jugadas(z).find((p) => evaluar(z, p) !== "correcto")!);
      for (let i = 0; i < 5; i++) { t += 10_000; solvePod("p1"); }
      expect(arb.phase).toBe("fin");
      expect(last("p1", "end")).toMatchObject({ phase: "fin", reason: "5 pods despachados" });
      expect(last("p1", "end")).not.toHaveProperty("carrera");
      expect(arb.toCsv()).toBe("﻿" + "jugador;intento;zona;piezas;resultado;tiempo_ms;quemada;pod;tiempo_pod_ms;nivel;zona_nombre;pieza_correcta" + "\r\n");
    });
  }
});

describe("práctica con pods propios", () => {
  it("por defecto son 5 pods (total 5); con un pod propio total es 1 y termina al despacharlo", () => {
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA, practica: true });
    expect(arb.pods).toHaveLength(5);
    arb.handle("p1", { t: "hello", alias: "ana" });
    expect(last("p1", "start")).toMatchObject({ total: 5 });
    out.length = 0;
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA, practica: true, pods: generar(SEMILLA, 1).slice(2, 3) });
    arb.handle("p1", { t: "hello", alias: "ana" });
    expect(last("p1", "start")).toMatchObject({ total: 1, despachados: 0, pod: { numero: 1 } });
    t += 10_000; solvePod("p1");
    expect(arb.phase).toBe("fin");
    expect(last("p1", "end")).toMatchObject({ phase: "fin", score: { A: { despachados: 1 } } });
  });
});

describe("práctica: mejoras y modo Oleadas", () => {
  /** Semilla cuyos pods 1 a 3 de Oleadas (nivel 1, una zona) ofrecen una pieza que quema y otra correcta. */
  const SEM_OLEADAS = (() => {
    for (let s = 0; ; s++) {
      if ([1, 2, 3].every((n) => { const z = generarOleada(s, 1, n).zonas[0]!; const v = jugadas(z).map((p) => evaluar(z, p)); return v.includes("se quema") && v.includes("poco"); })) return s;
    }
  })();
  const nuevo = (oleadas: boolean, semilla = SEM_OLEADAS) => {
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla, practica: true, oleadas });
    arb.handle("p1", { t: "hello", alias: "ana" });
  };
  const con = (z: { opciones: string[] } & Parameters<typeof evaluar>[0], v: string) => jugadas(z).find((p) => evaluar(z, p) === v)!;

  it("Oleadas: start sin tope de pods, el pod 4 trae 2 zonas y pasar de 5 no termina la partida", () => {
    nuevo(true);
    expect(last("p1", "start")).toMatchObject({ practica: true, oleadas: true, total: 0, pod: { numero: 1 } });
    for (let i = 0; i < 6; i++) {
      expect(podOf("p1").zonas.length).toBe(Math.min(4, 1 + Math.floor(i / 3)));
      solvePod("p1");
    }
    expect(arb.phase).toBe("jugando");
    expect(podOf("p1").numero).toBe(7);
    expect(podOf("p1").zonas.length).toBe(3);
  });

  it("Oleadas: termina a la tercera pieza quemada", () => {
    nuevo(true);
    for (let i = 0; i < 3; i++) {
      const z = podOf("p1").zonas[0]!;
      test("p1", z.zona, con(z, "se quema"), i + 1);
      expect(arb.phase).toBe(i < 2 ? "jugando" : "fin");
      t += 5000; // pasa el bloqueo de 4 s
      if (arb.phase === "jugando") solvePod("p1");
    }
    expect(last("p1", "end")).toMatchObject({ phase: "fin", reason: "3 piezas quemadas", score: { A: { despachados: 2, quemadas: 3 } } });
  });

  it("Escudo: la quemada no bloquea 4 s ni cuenta, y se gasta", () => {
    nuevo(true);
    arb.ajustar({ enfriamiento: 1, escudo: true });
    const z = podOf("p1").zonas[0]!;
    test("p1", z.zona, con(z, "se quema"), 1);
    expect(last("p1", "result")).toMatchObject({ veredicto: "se quema", waitMs: 2000, escudo: true });
    t += 2000;
    test("p1", z.zona, con(z, "poco"), 2);
    t += 4000;
    test("p1", z.zona, con(z, "se quema"), 3);
    expect(last("p1", "result")).toMatchObject({ waitMs: 4000 });
    expect(last("p1", "result")).not.toHaveProperty("escudo");
  });

  it("Enfriamiento corto: los 2/4/8 s se reducen a la mitad", () => {
    nuevo(false, SEMILLA);
    arb.ajustar({ enfriamiento: 0.5, escudo: false });
    test("p1", Z, POCO, 1);
    expect(last("p1", "result")).toMatchObject({ veredicto: "poco", waitMs: 1000 });
  });

  it("fuera de práctica las mejoras no hacen nada", () => {
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEMILLA });
    arb.ajustar({ enfriamiento: 0.5, escudo: true });
    play();
    test("p1", Z, POCO, 1);
    expect(last("p1", "result")).toMatchObject({ waitMs: 2000 });
  });
});

describe("Oleadas: falla encadenada", () => {
  /** Primera semilla cuyo pod 7 (oleada 3, nivel 1) trae segunda falla. */
  const SEM = (() => { for (let s = 0; ; s++) if (encadena(s, 7) && generarOleada(s, 1, 7).encadenada) return s; })();
  const POD = generarOleada(SEM, 1, 7);
  const C = POD.encadenada!, B = POD.zonas.find((z) => z.zona === C.zona)!;
  const abrir = () => {
    arb = new Arbiter((to, m) => out.push({ to, m }), { now: () => t, semilla: SEM, practica: true, oleadas: true });
    arb.handle("p1", { t: "hello", alias: "ana" });
    for (let i = 0; i < 6; i++) solvePod("p1"); // las oleadas 1 y 2 no traen segunda falla
  };
  const reparar = (z: typeof C) => test("p1", z.zona, jugadas(z).find((p) => evaluar(z, p) === "correcto")!, 9);
  const reparadas = () => podOf("p1").zonas.filter((z) => z.reparada).length;

  it("acertar la primera no repara la zona: sale la segunda (otra batería y opciones) y el pod no se despacha", () => {
    abrir();
    expect(podOf("p1").numero).toBe(7);
    for (const z of POD.zonas) if (z.zona !== C.zona) reparar(z);
    test("p1", C.zona, B.solucion, 10);
    expect(last("p1", "result")).toMatchObject({ veredicto: "correcto", hayMas: true });
    const v = podOf("p1").zonas.find((z) => z.zona === C.zona)!;
    expect(v).toMatchObject({ reparada: false, volts: C.volts, opciones: C.opciones });
    expect(JSON.stringify(podOf("p1"))).not.toContain("solucion"); // la solución nunca sale del árbitro
    despachar("p1");
    expect(last("p1", "reject")).toMatchObject({ reason: "faltan zonas por reparar" });
    expect(reparadas()).toBe(POD.zonas.length - 1);
  });

  it("la segunda se resuelve con otra pieza, sin castigo extra, y entonces se despacha", () => {
    abrir();
    for (const z of POD.zonas) if (z.zona !== C.zona) reparar(z);
    test("p1", C.zona, B.solucion, 10);
    const mala = jugadas(C).find((p) => evaluar(C, p) === "poco" || evaluar(C, p) === "demasiado");
    if (mala) {
      test("p1", C.zona, mala, 11);
      expect(last("p1", "result")).toMatchObject({ waitMs: 1000 }); // 3 zonas reparadas arman el bono: la mitad de 2 s
      t += 2000;
    }
    arb.handle("p1", { t: "medir", seq: 12, t0: 0, zone: C.zona, pieza: C.solucion, modo: "tension", punto: "pieza" });
    expect(last("p1", "medida")).toMatchObject({ zona: C.zona });
    reparar(C);
    expect(last("p1", "result")).toMatchObject({ veredicto: "correcto" });
    expect(last("p1", "result")).not.toHaveProperty("hayMas");
    expect(reparadas()).toBe(POD.zonas.length);
    despachar("p1");
    expect(last("p1", "despachado")).toMatchObject({ despachados: 7 });
  });

  it("el Escudo y el enfriamiento corto siguen valiendo en la segunda falla", () => {
    abrir();
    for (const z of POD.zonas) if (z.zona !== C.zona) reparar(z);
    test("p1", C.zona, B.solucion, 10);
    arb.ajustar({ enfriamiento: 0.5, escudo: true });
    const quema = jugadas(C).find((p) => evaluar(C, p) === "se quema");
    if (quema) {
      test("p1", C.zona, quema, 11);
      expect(last("p1", "result")).toMatchObject({ escudo: true, waitMs: 1000 });
    }
  });

  it("duelo y práctica normal nunca traen segunda falla", () => {
    expect(generar(SEM, 1).concat(generar(SEM, 2)).every((p) => !p.encadenada)).toBe(true);
    play();
    for (let i = 0; i < 5; i++) solvePod("p1");
    expect(sent("p1").some((m) => m.t === "result" && "hayMas" in m)).toBe(false);
  });
});
