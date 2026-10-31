import { describe, expect, it } from "vitest";
import { generar, type Perfil } from "../../spike/src/engine/generador";
import { evaluar } from "../../spike/src/engine/pods";
import type { End, PodView, ServerMsg } from "../../spike/src/protocol";
import { ContraBotTransport, COMPLEJIDAD, jugadasBot, veredicto, type DificultadBot } from "../src/contraBot";
import { ENUNCIADOS, type Plantilla } from "../../spike/src/engine/placa3";

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
async function soloBot(dif: DificultadBot, semilla: number, nivel: Perfil = 1) {
  let t = 1_000;
  const tr = new ContraBotTransport(nivel, semilla, dif, { now: () => t, limitMs: 1e9 });
  let fin: End | undefined;
  tr.onMessage = (raw) => { const m = raw as ServerMsg; if (m.t === "end") fin = m; };
  await tr.join();
  tr.send({ t: "hello", alias: "ana" });
  const t0 = t;
  for (let i = 0; i < 40_000 && !fin; i++) { t += 100; tr.tick(); await Promise.resolve(); }
  await tr.close();
  return { pods: fin?.score.B?.despachados ?? 0, porPod: (t - t0) / 5 / 1000, total: (t - t0) / 1000, quemadas: fin?.score.B?.quemadas ?? 0, circuitos: tr.arbiter.pods.flatMap((p) => p.zonas.map((z) => z.circuito)) };
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

  it("decide como un jugador: el veredicto con lo que ve el jugador (circuito, volts, fija) coincide con la solución del árbitro en todas las familias", () => {
    const vistas = new Set<string>();
    for (const nivel of [1, 2, 3, "mixto"] as Perfil[]) {
      for (let s = 1; s <= 60; s++) {
        for (const pod of generar(s, nivel)) for (const z of pod.zonas) {
          const vista = { zona: z.zona, nombre: z.nombre, circuito: z.circuito, volts: z.volts, opciones: z.opciones, reparada: false, ...(z.r1 && { fija: `R1 ${z.r1} Ω` }), ...(z.consumo && { fija: `${z.arranque ? "Motor" : "Consumo"} ${String(z.consumo).replace(".", ",")} A` }), ...(z.cadena && { cadena: z.cadena }), ...(z.plantilla && { enunciado: ENUNCIADOS[z.plantilla as Plantilla] }) };
          if (z.circuito === "placa3") { // placa experta: varias soluciones valen; el bot halla al menos una con lo visible y la referencia también vale
            expect(jugadasBot(vista).some((j) => veredicto(vista, j) === "correcto"), `${nivel}/${s}/placa3`).toBe(true);
            expect(veredicto(vista, z.solucion)).toBe("correcto");
            vistas.add(z.circuito);
            continue;
          }
          // Cadena: el bot primero localiza el hueco muerto midiendo continuidad (aquí se le da); luego evalúa «hueco:repuesto».
          const jugadas = z.cadena ? vista.opciones.map((o) => `${z.muerta}:${o}`) : vista.opciones;
          expect(jugadas.filter((o) => veredicto(vista, o, z.muerta) === "correcto"), `${nivel}/${s}/${z.circuito}`).toEqual([z.solucion]);
          vistas.add(z.circuito);
        }
      }
    }
    expect([...vistas].sort()).toEqual(Object.keys(COMPLEJIDAD).filter((c) => c !== "invertido" && c !== "abierto").sort()); // las 10 familias que se sortean (invertido/abierto ya no; fusible3 es del nivel 3)
  });

  it("con el coste creciente de medir (M-1) el bot completa 5 pods en menos de 12 min en todo nivel y dificultad (peor caso, 12 semillas)", async () => {
    let max = 0;
    for (const nivel of [1, 2, 3, "mixto"] as Perfil[]) {
      for (const dif of ["facil", "normal", "dificil"] as const) {
        for (let s = 1; s <= 12; s++) { const r = await soloBot(dif, s, nivel); expect(r.pods).toBe(5); max = Math.max(max, r.total); }
      }
    }
    expect(max, `peor caso ${Math.round(max)} s`).toBeLessThan(12 * 60);
    console.log(`bot peor caso: ${Math.round(max)} s`);
  }, 240_000);

  it("completa 5 pods en nivel 1, nivel 2, nivel 3 y mixto con cada perfil, en tiempo razonable, sin atascarse (todas las familias de nivel 2 aparecen)", async () => {
    const tope = { facil: 65, normal: 42, dificil: 28 } as const; // s/pod medios
    const vistas = new Set<string>();
    for (const nivel of [1, 2, 3, "mixto"] as Perfil[]) {
      for (const dif of ["facil", "normal", "dificil"] as const) {
        let suma = 0;
        for (let s = 1; s <= 8; s++) {
          const r = await soloBot(dif, s, nivel);
          expect(r.pods, `${nivel} ${dif} semilla ${s}`).toBe(5);
          suma += r.porPod;
          r.circuitos.forEach((c) => vistas.add(c));
        }
        expect(suma / 8, `${nivel} ${dif}`).toBeLessThanOrEqual(tope[dif]);
      }
    }
    expect(vistas.size).toBe(11);
    expect(vistas.has("placa3")).toBe(true); // el bot resuelve la placa experta buscando con el solver
    expect(vistas.has("fusible3")).toBe(true);
    expect(vistas.has("cadena")).toBe(true); // el bot la resuelve midiendo continuidad
  }, 120_000);

  it("cadena: el bot localiza la pieza muerta midiendo continuidad (sin penalizar) y solo entonces prueba repuestos en ese hueco", async () => {
    let t = 1_000;
    const tr = new ContraBotTransport(2, 3, "dificil", { now: () => t, limitMs: 1e9 });
    const bot: Record<string, unknown>[] = [];
    const manejar = tr.arbiter.handle.bind(tr.arbiter);
    tr.arbiter.handle = (peer, m) => { if (peer === "bot") bot.push(m as Record<string, unknown>); return manejar(peer, m); };
    let fin: End | undefined;
    tr.onMessage = (raw) => { const m = raw as ServerMsg; if (m.t === "end") fin = m; };
    await tr.join();
    tr.send({ t: "hello", alias: "ana" });
    for (let i = 0; i < 40_000 && !fin; i++) { t += 100; tr.tick(); await Promise.resolve(); }
    await tr.close();
    expect(fin?.score.B?.despachados).toBe(5);
    const medidas = bot.filter((m) => m.t === "medir"), cadenas = tr.arbiter.pods.flatMap((p) => p.zonas).filter((z) => z.circuito === "cadena");
    expect(cadenas.length).toBeGreaterThan(0);
    expect(medidas.length).toBeGreaterThan(0);
    expect(medidas.every((m) => m.modo === "continuidad" && m.pieza === "ninguna" && /^t\d$/.test(String(m.punto)))).toBe(true);
    for (const m of bot.filter((x) => x.t === "test" && /^\d:/.test(String(x.pieza)))) {
      expect(cadenas.some((z) => z.zona === m.zone && String(z.muerta) === String(m.pieza)[0]), `hueco ${m.pieza} zona ${m.zone}`).toBe(true);
    }
  }, 60_000);

  it("fácil se equivoca más que difícil también en nivel 2 y es determinista por semilla", async () => {
    let f = 0, d = 0;
    for (let s = 1; s <= 12; s++) { f += (await soloBot("facil", s, 2)).quemadas; d += (await soloBot("dificil", s, 2)).quemadas; }
    expect(f).toBeGreaterThan(d);
    expect(JSON.stringify(await soloBot("normal", 4, "mixto"))).toBe(JSON.stringify(await soloBot("normal", 4, "mixto")));
  }, 60_000);
});
