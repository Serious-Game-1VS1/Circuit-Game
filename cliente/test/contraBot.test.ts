import { describe, expect, it } from "vitest";
import { evaluar } from "../../spike/src/engine/pods";
import type { End, PodView, ServerMsg } from "../../spike/src/protocol";
import { ContraBotTransport, type DificultadBot } from "../src/contraBot";

/** Jugador perfecto (acierta siempre) que actúa cada `cadaMs` en un reloj virtual; devuelve el log y el desenlace. */
async function partida(dif: DificultadBot, semilla: number, cadaMs = 2500) {
  let t = 1_000;
  const tr = new ContraBotTransport(1, semilla, dif, { now: () => t });
  const log: ServerMsg[] = [];
  let pod: PodView | undefined, proximo = Infinity, seq = 0, espera = 0;
  tr.onMessage = (raw) => {
    const m = raw as ServerMsg;
    log.push(m);
    if (m.t === "start") { pod = m.pod; proximo = t + cadaMs; }
    if (m.t === "result" || m.t === "despachado") { pod = m.pod; proximo = t + cadaMs + (m.t === "result" ? m.waitMs : 0); }
  };
  await tr.join();
  tr.send({ t: "hello", alias: "ana" });
  for (let i = 0; i < 20_000 && !log.some((m) => m.t === "end"); i++) {
    t += 100;
    tr.tick();
    if (t >= proximo && pod) {
      proximo = Infinity;
      const z = pod.zonas.find((x) => !x.reparada);
      const base = { seq: ++seq, t0: t };
      tr.send(z ? { t: "test", ...base, zone: z.zona, pieza: z.opciones.find((p) => evaluar(z, p) === "correcto") } : { t: "despachar", ...base });
    }
    await Promise.resolve();
    espera = i;
  }
  await tr.close();
  return { tr, log, end: log.find((m) => m.t === "end") as End | undefined, ticks: espera };
}

/** El jugador no hace nada: ¿cuánto tarda el bot en despachar 5 pods (reloj virtual, sin límite de partida)? */
async function soloBot(dif: DificultadBot, semilla: number) {
  let t = 1_000;
  const tr = new ContraBotTransport(1, semilla, dif, { now: () => t, limitMs: 1e9 });
  let fin: End | undefined;
  tr.onMessage = (raw) => { const m = raw as ServerMsg; if (m.t === "end") fin = m; };
  await tr.join();
  tr.send({ t: "hello", alias: "ana" });
  const t0 = t;
  for (let i = 0; i < 40_000 && !fin; i++) { t += 100; tr.tick(); await Promise.resolve(); }
  await tr.close();
  return { pods: fin?.score.B?.despachados ?? 0, porPod: (t - t0) / 5 / 1000 };
}

describe("ContraBotTransport", () => {
  it("duelo completo hasta el podio: A es el jugador, B el bot, con rival, reloj y carrera", async () => {
    const { log, end } = await partida("normal", 5);
    expect(log.find((m) => m.t === "welcome")).toMatchObject({ station: "A", alias: "ana" });
    const start = log.find((m) => m.t === "start");
    expect(start).toMatchObject({ total: 5, rival: { alias: "Bot" } });
    expect(start && start.t === "start" && start.restanteMs).toBeGreaterThan(0);
    expect(log.some((m) => m.t === "rival")).toBe(true);
    expect(end?.winner).toBe("A");
    expect(end?.score.A?.despachados).toBe(5);
    expect(end?.carrera?.A && end.carrera.B).toBeTruthy();
  });

  it("el bot Fácil pierde contra un jugador perfecto; el Difícil le exige", async () => {
    // Un jugador perfecto a 2,5 s por acción gana siempre; lo que cambia es cuántos pods alcanza a despachar el bot mientras tanto.
    const pods = { facil: 0, normal: 0, dificil: 0 };
    for (const s of [1, 2, 3, 4, 5, 6]) {
      for (const dif of ["facil", "normal", "dificil"] as const) {
        const p = await partida(dif, s);
        expect(p.end?.winner, `${dif} semilla ${s}`).toBe("A");
        pods[dif] += p.end?.score.B?.despachados ?? 0;
      }
    }
    expect(pods.facil).toBeLessThanOrEqual(pods.normal);
    expect(pods.normal).toBeLessThanOrEqual(pods.dificil);
    expect(pods.dificil / 6).toBeGreaterThanOrEqual(1); // Difícil exige: al menos un pod antes de que el perfecto termine
  });

  it("ritmo por dificultad: ningún perfil se estanca y el tiempo medio por pod cae en su rango", async () => {
    const rango = { facil: [35, 60], normal: [25, 40], dificil: [15, 25] } as const;
    for (const dif of ["facil", "normal", "dificil"] as const) {
      let suma = 0;
      for (let s = 1; s <= 10; s++) {
        const r = await soloBot(dif, s);
        expect(r.pods, `${dif} semilla ${s}`).toBe(5);
        suma += r.porPod;
      }
      expect(suma / 10).toBeGreaterThanOrEqual(rango[dif][0]);
      expect(suma / 10).toBeLessThanOrEqual(rango[dif][1]);
    }
  }, 60_000);

  it("Normal es intermedio: un jugador perfecto lo gana casi siempre, pero acaba más cerca que con el Fácil", async () => {
    let f = 0, n = 0;
    for (const s of [1, 2, 3, 4, 5, 6]) {
      f += (await soloBot("facil", s)).porPod;
      n += (await soloBot("normal", s)).porPod;
    }
    expect(n).toBeLessThan(f);
  }, 60_000);

  it("es determinista por semilla", async () => {
    const a = await partida("normal", 9), b = await partida("normal", 9);
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
  });

  it("el bot nunca ve la solución: solo recibe PodView sin ese campo", async () => {
    const { tr, log } = await partida("normal", 3);
    expect(JSON.stringify(log)).not.toContain("solucion");
    expect(JSON.stringify((tr as unknown as { pod: unknown }).pod)).not.toContain("solucion"); // lo que guarda el bot
    expect(tr.arbiter.pods[0]!.zonas[0]).toHaveProperty("solucion"); // existe en el árbitro, no en el pod que llega al bot
  });
});
