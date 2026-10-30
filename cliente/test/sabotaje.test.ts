import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ Scene: class {} })); // lógica pura: el motor no corre en Node
import { inicial, reducir, type Pantalla } from "../src/pantalla";
import type { PodView, ServerMsg } from "../../spike/src/protocol";
import { AYUDA, avisoEnviado, avisoRecibido, CHECK_PANEL, cruzan, HUMO_BAHIA, HUMO_GAVETA, HUMO_TOQUES, humoVisible, limpiaHumo, MULTIMETRO_PANEL, sabotajeActivo, sinPista } from "../src/sabotaje";
import { estadoZona, pestanasArte } from "../src/sprites";
import { textoObjetivo } from "../src/progreso";
import { reaccion } from "../src/chispa";

const pod: PodView = { numero: 2, zonas: [
  { zona: 0, nombre: "turbina", circuito: "led", volts: 9, opciones: ["100", "220"], reparada: false },
  { zona: 1, nombre: "reactor", circuito: "led", volts: 9, opciones: ["100", "220"], reparada: true },
] };
const jugando = (): Pantalla => reducir(inicial(), { t: "start", restanteMs: 1000, despachados: 1, total: 5, nivel: 1, demo: false, pod, rival: { alias: "Bot", despachados: 1, estado: "reparando" } }, 0);
const result = (veredicto: "correcto" | "poco" | "se quema", waitMs = 0): ServerMsg => ({ t: "result", seq: 1, t0: 0, zona: 0, veredicto, waitMs, despachados: 1, pod });

describe("avisos del sabotaje", () => {
  it("el que recibe lo ve avisado: «Rival: ¡humo!» y Chispa reacciona sin dar pistas", () => {
    const p = reducir(jugando(), { t: "sabotaje", tipo: "humo", ms: 6000, de: "B" }, 1000);
    expect(p.aviso).toBe("Rival: ¡humo!");
    expect(p.sabotaje).toEqual({ tipo: "humo", hasta: 7000, n: 1 });
    expect(p.eco).toEqual({ n: 1, tipo: "sabotaje" });
    expect(avisoRecibido("enfriamiento")).toBe("Rival: ¡enfriamiento largo!");
    expect(avisoRecibido("sin-pista")).toBe("Rival: ¡sin pista!");
    for (const t of ["sabotaje", "ataque"] as const) expect(reaccion(t, 0).texto).not.toMatch(/turbina|reactor|radar|cabina|\d+ ?Ω/i);
  });

  it("el atacante lee «¡Sabotaje enviado: humo!» al despachar", () => {
    const p = reducir(jugando(), { t: "despachado", seq: 1, t0: 0, despachados: 2, pod, limpios: 0, enviado: "humo" }, 0);
    expect(p.aviso).toContain("¡Sabotaje enviado: humo!");
    expect(avisoEnviado("sin-pista")).toBe("¡Sabotaje enviado: sin pista!");
    expect(p.enviado).toMatchObject({ tipo: "humo", n: 1 });
    expect(p.eco?.tipo).toBe("ataque");
    expect(p.limpios).toBe(0);
  });

  it("los pods limpios seguidos (0-3) los marca el árbitro en start, result y despachado", () => {
    let p = reducir(jugando(), { t: "start", restanteMs: 1, despachados: 0, total: 5, nivel: 1, demo: false, limpios: 2, pod, rival: null }, 0);
    expect(p.limpios).toBe(2);
    p = reducir(p, { ...(result("poco", 2000) as object), limpios: 0 } as ServerMsg, 0);
    expect(p.limpios).toBe(0);
    p = reducir(p, { t: "despachado", seq: 1, t0: 0, despachados: 2, pod, limpios: 1 }, 0);
    expect(p.limpios).toBe(1);
  });

  it("reconectar con un sabotaje vigente lo repone con los ms que quedan", () => {
    const p = reducir(jugando(), { t: "start", restanteMs: 1, despachados: 0, total: 5, nivel: 1, demo: false, pod, rival: null, sabotaje: { tipo: "sin-pista", ms: 3000, de: "B" } }, 100);
    expect(sinPista(p, 2000)).toBe(true);
    expect(sinPista(p, 3200)).toBe(false);
  });
});

describe("humo", () => {
  it("dura lo que dice el árbitro y se limpia con 3 toques", () => {
    const p = reducir(jugando(), { t: "sabotaje", tipo: "humo", ms: 6000, de: "B" }, 0);
    expect(humoVisible(p, 5999, 0)).toBe(true);
    expect(humoVisible(p, 6000, 0)).toBe(false);
    let toques = 0;
    for (let i = 0; i < HUMO_TOQUES - 1; i++) expect(limpiaHumo(++toques)).toBe(false);
    expect(limpiaHumo(++toques)).toBe(true);
    expect(humoVisible(p, 1000, p.sabotaje!.n)).toBe(false); // ya limpiado
    const otro = reducir(p, { t: "sabotaje", tipo: "humo", ms: 6000, de: "B" }, 20000);
    expect(humoVisible(otro, 21000, p.sabotaje!.n)).toBe(true); // un humo nuevo vuelve a nublar
  });

  it("no tapa el CHECK, el multímetro ni el HUD", () => {
    expect(cruzan(HUMO_GAVETA, CHECK_PANEL)).toBe(false);
    for (const m of MULTIMETRO_PANEL) expect(cruzan(HUMO_GAVETA, m)).toBe(false);
    // la bahía está en la escena (origen y=72, bajo el HUD) y acaba antes de que empiece el panel (y=430)
    expect(HUMO_BAHIA.y + 72).toBeGreaterThanOrEqual(72);
    expect(HUMO_BAHIA.y + HUMO_BAHIA.h + 72).toBeLessThanOrEqual(430);
    expect(cruzan({ ...HUMO_BAHIA, y: HUMO_BAHIA.y + 72 - 430 }, CHECK_PANEL)).toBe(false);
    expect(HUMO_GAVETA.x + HUMO_GAVETA.w).toBeLessThanOrEqual(360);
  });
});

describe("sin pista", () => {
  it("las pestañas y el humo de la zona dañada se muestran neutros, y el objetivo no nombra la zona", () => {
    const normal = pestanasArte(pod, 0).map((t) => t.sprite);
    const neutro = pestanasArte(pod, 0, true);
    expect(neutro.filter((t) => t.nombre !== "turbina").map((t) => t.sprite)).toEqual(["pestana_radar_inactiva", "pestana_cabina_inactiva", "pestana_reactor_inactiva"]); // la reparada (reactor) ya no se distingue
    expect(neutro[2]!.sprite).toBe("pestana_turbina_activa");
    expect(neutro.map((t) => t.sprite)).not.toEqual(normal);
    expect(neutro.map((t) => t.zona)).toEqual(normal.map((_, i) => pestanasArte(pod, 0)[i]!.zona)); // se puede seguir navegando
    expect(estadoZona(pod, "turbina", {})).toBe("averiado");
    expect(estadoZona(pod, "turbina", {}, true)).toBe("sano");
    const p = jugando();
    expect(textoObjetivo(p)).toContain("Turbina");
    expect(textoObjetivo(p, true)).toBe("Objetivo: repara el pod");
  });

  it("vuelve al acertar (y también al terminar el tiempo)", () => {
    let p = reducir(jugando(), { t: "sabotaje", tipo: "sin-pista", ms: 8000, de: "B" }, 0);
    expect(sinPista(p, 7999)).toBe(true);
    expect(sinPista(p, 8000)).toBe(false);
    p = reducir(p, result("poco", 2000), 100);
    expect(sinPista(p, 200)).toBe(true); // fallar no la quita
    p = reducir(p, result("correcto"), 300);
    expect(sinPista(p, 400)).toBe(false);
  });
});

describe("enfriamiento largo", () => {
  it("el aviso dura hasta el siguiente fallo (que lo gasta); la quemada no lo gasta", () => {
    let p = reducir(jugando(), { t: "sabotaje", tipo: "enfriamiento", ms: 8000, de: "B" }, 0);
    expect(sabotajeActivo(p, 1000, "enfriamiento")).toBe(true);
    expect(AYUDA.enfriamiento).toContain("2 s");
    p = reducir(p, result("se quema", 4000), 100);
    expect(sabotajeActivo(p, 200, "enfriamiento")).toBe(true);
    p = reducir(p, result("poco", 4000), 300);
    expect(sabotajeActivo(p, 400)).toBe(false);
  });
});
