import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluar } from "../../spike/src/engine/pods";
import type { PodView, ServerMsg } from "../../spike/src/protocol";
import { ContraBotTransport } from "../src/contraBot";
import { PracticaTransport } from "../src/practica";

afterEach(() => vi.useRealTimers());

/** Conecta al jugador a un transporte real con reloj simulado y devuelve helpers para medir en la zona 0 del pod actual. */
async function arrancar(tr: ContraBotTransport | PracticaTransport, avanzar: (ms: number) => void) {
  const log: ServerMsg[] = [];
  let pod: PodView | undefined, seq = 0;
  tr.onMessage = (raw) => { const m = raw as ServerMsg; log.push(m); if (m.t === "start" || m.t === "despachado") pod = m.pod; else if (m.t === "result") pod = m.pod; };
  await tr.join();
  tr.send({ t: "hello", alias: "ana" });
  if (tr instanceof PracticaTransport) tr.send({ t: "ready" });
  for (let i = 0; i < 100 && !pod; i++) { avanzar(100); await Promise.resolve(); }
  const medir = async () => { const z = pod!.zonas[0]!; tr.send({ t: "medir", seq: ++seq, t0: 0, zone: z.zona, pieza: z.opciones[0], modo: "tension", punto: "pieza" }); await Promise.resolve(); return log.at(-1)!; };
  return { medir, log, pod: () => pod! };
}

describe("Jugar solo cobra el tiempo de medir (ContraBotTransport real)", () => {
  it("3000 / 3750 / 4500 ms, rechaza medir antes de tiempo y reinicia al despachar", async () => {
    let t = 1_000;
    const tr = new ContraBotTransport(1, 5, "dificil", { now: () => t, limitMs: 1e9 });
    const a = await arrancar(tr, (ms) => { t += ms; tr.tick(); });
    const pasar = async (ms: number) => { t += ms; tr.tick(); await Promise.resolve(); };
    expect(await a.medir()).toMatchObject({ t: "medida", medirMs: 3000, proxMs: 3750 });
    await pasar(1000);
    expect(await a.medir()).toMatchObject({ t: "reject", reason: "el multímetro sigue midiendo" });
    await pasar(2000);
    expect(await a.medir()).toMatchObject({ t: "medida", medirMs: 3750, proxMs: 4500 });
    await pasar(3750);
    expect(await a.medir()).toMatchObject({ t: "medida", medirMs: 4500 });
    // despachar: repara todas las zonas y el contador de la zona vuelve a 3000
    await pasar(4500);
    for (const z of a.pod().zonas) {
      tr.send({ t: "test", seq: 90 + z.zona, t0: 0, zone: z.zona, pieza: z.opciones.find((p) => evaluar(z, p) === "correcto") });
      await pasar(7000);
    }
    tr.send({ t: "despachar", seq: 99, t0: 0 });
    await Promise.resolve();
    expect(a.log.at(-1)?.t).toBe("despachado");
    await pasar(4500);
    expect(await a.medir()).toMatchObject({ t: "medida", medirMs: 3000 });
    await tr.close();
  });
});

describe("Práctica (PracticaTransport real) cobra 1000 ms fijo", () => {
  it("medirMs 1000 siempre, sin proxMs, y rechaza antes de 1 s", async () => {
    vi.useFakeTimers();
    const tr = new PracticaTransport(1, 5);
    const a = await arrancar(tr, (ms) => { vi.advanceTimersByTime(ms); });
    const pasar = async (ms: number) => { vi.advanceTimersByTime(ms); await Promise.resolve(); };
    const m1 = await a.medir();
    expect(m1).toMatchObject({ t: "medida", medirMs: 1000 });
    expect(m1).not.toHaveProperty("proxMs");
    await pasar(300);
    expect(await a.medir()).toMatchObject({ t: "reject", reason: "el multímetro sigue midiendo" });
    await pasar(800);
    expect(await a.medir()).toMatchObject({ medirMs: 1000 });
    await pasar(1000);
    expect(await a.medir()).toMatchObject({ medirMs: 1000 });
    await tr.close();
  });
});
