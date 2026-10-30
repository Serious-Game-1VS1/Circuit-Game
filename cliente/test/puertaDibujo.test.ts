import { describe, expect, it, vi } from "vitest";
const obj = (): any => { const o: any = new Proxy({}, { get: (t: any, k) => (k in t ? t[k] : (...a: any[]) => (k === "setInteractive" || k === "setOrigin" || k === "setStrokeStyle" || k === "setCenterAlign" || k === "setMaxWidth" || k === "setDepth" || k === "setTint" ? o : o)), set: (t, k, v) => { t[k] = v; return true; } }); return o; };
vi.mock("../src/arte", () => ({ letras: () => obj(), marco: () => obj(), toque: () => obj() }));
vi.mock("../src/audio", () => ({ sonar: () => {} }));
vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), setInterval: () => 0, setTimeout: () => 0, clearInterval: () => {}, clearTimeout: () => {} });
import { generarPuerta, mostrarPuerta } from "../src/puerta";

describe("puerta en lienzo alto", () => {
  it("las hojas y su bloqueo cubren toda la altura del lienzo (800)", () => {
    const rects: { y: number; h: number; interactivo: boolean }[] = [];
    const s: any = {
      cameras: { main: { height: 800 } }, events: { once: () => {} }, tweens: { add: () => {} },
      add: { rectangle: (_x: number, y: number, _w: number, h: number) => { const r: any = obj(); const e = { y, h, interactivo: false }; rects.push(e); r.setInteractive = () => { e.interactivo = true; return r; }; return r; }, graphics: () => obj() },
    };
    const p = mostrarPuerta(s, generarPuerta(1, 1, 0), () => {}, { ms: 100000 });
    const hojas = rects.filter((r) => r.interactivo);
    expect(hojas).toHaveLength(2);
    for (const h of hojas) { expect(h.h).toBe(800); expect(h.y).toBe(400); }
    p.cerrar();
  });
});
