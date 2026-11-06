import { describe, expect, it } from "vitest";
import { Arbiter, MATCH_LIMIT_MS } from "../src/arbiter/arbiter";
import { generarOleada, type ZonaPod } from "../src/engine/generador";
import { evaluar, jugadas } from "../src/engine/pods";
import { QUITA_PIEZA } from "../src/engine/medir";
import type { ServerMsg } from "../src/protocol";

/** `detalle` es aditivo: cada rechazo trae la causa concreta y `reason` conserva su literal de siempre. */
const SEM = 7;
const LEDS = Array.from({ length: 40 }, (_, i) => generarOleada(SEM + i, 1, 1).zonas[0]!).filter((z) => z.circuito === "led");
const L1 = LEDS[0]!, L2 = LEDS.find((z) => z.zona !== L1.zona)!;
const LUCES: ZonaPod = { zona: 3, nombre: L1.nombre, circuito: "luces", volts: 9, opciones: ["serie", "paralelo", "puente"], solucion: "paralelo" };

function partida(zonas: ZonaPod[] = [L1, L2]) {
  let t = 0, seq = 0;
  const out: ServerMsg[] = [];
  const arb = new Arbiter((to, m) => { if (to === "p1") out.push(m); }, { now: () => t, semilla: SEM, practica: true, pods: [{ numero: 1, zonas }] });
  arb.handle("p1", { t: "hello", alias: "ana" });
  const enviar = (m: Record<string, unknown>) => { arb.handle("p1", { t: "x", seq: ++seq, t0: 0, ...m }); return out.at(-1)!; };
  return { arb, out, enviar, avanzar: (ms: number) => { t += ms; } };
}
const mal = (zonas?: ZonaPod[]) => { const p = partida(zonas); return { ...p, medir: (x: Record<string, unknown>) => p.enviar({ t: "medir", modo: "tension", punto: "pieza", ...x }), probar: (x: Record<string, unknown>) => p.enviar({ t: "test", ...x }) }; };
const cual = (z: ZonaPod, v: string) => jugadas(z).find((p) => evaluar(z, p) === v)!;

describe("detalle de los rechazos del árbitro", () => {
  it("Probar: zona inexistente, zona ya reparada, pieza fuera de la gaveta, sin pieza", () => {
    const p = mal();
    expect(p.probar({ zone: 99, pieza: L1.opciones[0] })).toMatchObject({ t: "reject", reason: "zona no válida", detalle: "Esa zona no existe en este pod." });
    expect(p.probar({ zone: L1.zona, pieza: "999" })).toMatchObject({ reason: "pieza no válida", detalle: "Esa pieza no está en la gaveta de esta zona." });
    expect(p.probar({ zone: L1.zona })).toMatchObject({ reason: "pieza no válida", detalle: "Falta indicar la pieza." });
    expect(p.probar({ zone: L1.zona, pieza: cual(L1, "correcto") })).toMatchObject({ t: "result", veredicto: "correcto" });
    expect(p.probar({ zone: L1.zona, pieza: cual(L1, "correcto") })).toMatchObject({ reason: "zona no válida", detalle: "Esa zona ya está reparada." });
  });

  it("Probar: enfriamiento, sin cambios y quemada con los segundos; reason intacto", () => {
    const p = mal();
    const poco = cual(L1, "poco"), quema = cual(L1, "se quema");
    p.probar({ zone: L1.zona, pieza: poco });
    p.avanzar(500);
    expect(p.probar({ zone: L1.zona, pieza: poco })).toMatchObject({ reason: "enfriamiento", detalle: "Enfriamiento tras un fallo: espera 2 s para volver a probar esta zona." });
    p.avanzar(5000);
    expect(p.probar({ zone: L1.zona, pieza: poco })).toMatchObject({ reason: "sin-cambios", detalle: "No cambiaste nada desde la última prueba: cambia la pieza antes de volver a probar." });
    p.probar({ zone: L1.zona, pieza: quema }); // en práctica el primer quemado lo absorbe el escudo
    p.avanzar(9000);
    p.probar({ zone: L2.zona, pieza: cual(L2, "se quema") });
    expect(p.probar({ zone: L1.zona, pieza: poco })).toMatchObject({ reason: "quemada", detalle: "Pieza quemada: espera 4 s para volver a probar." });
  });

  it("partida fuera de juego (Probar y Medir); Despachar sin zonas conserva el rechazo exacto, sin detalle", () => {
    const a = new Arbiter(() => {}, { now: () => 0, semilla: SEM, practica: true, pods: [{ numero: 1, zonas: [L1] }] });
    const out: ServerMsg[] = [];
    const b = new Arbiter((_, m) => out.push(m), { now: () => 0, semilla: SEM, pods: [{ numero: 1, zonas: [L1] }] });
    void a; b.handle("p1", { t: "hello", alias: "ana" });
    b.handle("p1", { t: "test", seq: 1, t0: 0, zone: L1.zona, pieza: L1.opciones[0] });
    b.handle("p1", { t: "medir", seq: 2, t0: 0, zone: L1.zona, pieza: L1.opciones[0], modo: "tension", punto: "pieza" });
    const rs = out.filter((m) => m.t === "reject");
    expect(rs).toHaveLength(2);
    for (const r of rs) expect(r).toMatchObject({ reason: "la partida no está en juego", detalle: "La partida aún no empezó o ya terminó." });
    const p = partida();
    expect(p.enviar({ t: "despachar" })).toEqual({ t: "reject", seq: 1, t0: 0, reason: "faltan zonas por reparar", waitMs: 0 });
    void MATCH_LIMIT_MS;
  });

  it("Medir: «medida no válida» desglosada", () => {
    const p = mal();
    const o = L1.opciones[0]!;
    const caso = (x: Record<string, unknown>, detalle: string) => expect(p.medir(x), JSON.stringify(x)).toMatchObject({ t: "reject", reason: "medida no válida", detalle });
    caso({ zone: 99, pieza: o }, "Esa zona no existe en este pod.");
    caso({ zone: L1.zona }, "Falta indicar la pieza.");
    caso({ zone: L1.zona, pieza: "999" }, "Esa pieza no está en la gaveta de esta zona.");
    caso({ zone: L1.zona, pieza: o, modo: "ohmios" }, "El modo debe ser continuidad o tensión.");
    caso({ zone: L1.zona, pieza: o, punto: 5 }, "Falta indicar el punto de medida.");
    caso({ zone: L1.zona, pieza: "ninguna" }, "«ninguna» solo vale al medir continuidad; para medir tensión pon una pieza.");
    caso({ zone: L1.zona, pieza: o, punto: "bateria" }, "Ese punto de medida no existe en esta zona.");
    const l = mal([LUCES]);
    expect(l.medir({ zone: LUCES.zona, pieza: "ninguna", modo: "continuidad" })).toMatchObject({ reason: "medida no válida", detalle: "En esta zona no hay hueco que vaciar: mide con el montaje puesto." });
  });

  it("Medir: pieza puesta en continuidad y multímetro ocupado (con segundos)", () => {
    const p = mal();
    const o = L1.opciones[0]!;
    expect(p.medir({ zone: L1.zona, pieza: o, modo: "continuidad" })).toMatchObject({ reason: QUITA_PIEZA, detalle: QUITA_PIEZA });
    expect(p.medir({ zone: L1.zona, pieza: o })).toMatchObject({ t: "medida" });
    const r = p.medir({ zone: L1.zona, pieza: o }) as Extract<ServerMsg, { t: "reject" }>;
    expect(r.reason).toBe("el multímetro sigue midiendo");
    expect(r.detalle).toMatch(/^El multímetro sigue midiendo: espera [1-9] s\.$/);
  });
});
