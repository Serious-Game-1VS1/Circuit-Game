import { describe, expect, it } from "vitest";
import { MARGEN_VELO, velo, type Rect } from "../src/velo";

const W = 360, H = 640;
const area = (rs: Rect[]) => rs.reduce((s, r) => s + r.w * r.h, 0);
const pisa = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const crece = (r: Rect, m = MARGEN_VELO): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

describe("velo del tutorial", () => {
  it("sin huecos cubre todo el lienzo", () => {
    expect(velo([], W, H)).toEqual([{ x: 0, y: 0, w: W, h: H }]);
  });

  it.each<[string, Rect[]]>([
    ["un hueco", [{ x: 40, y: 100, w: 120, h: 80 }]],
    ["dos huecos separados", [{ x: 20, y: 60, w: 300, h: 160 }, { x: 200, y: 420, w: 100, h: 60 }]],
    ["dos huecos a la misma altura", [{ x: 20, y: 300, w: 80, h: 80 }, { x: 200, y: 330, w: 80, h: 100 }]],
  ])("%s: área cubierta + huecos = W·H y ningún rectángulo pisa un hueco", (_, hs) => {
    const rs = velo(hs, W, H);
    expect(area(rs) + area(hs.map((h) => crece(h)))).toBe(W * H);
    for (const r of rs) {
      expect(r.w).toBeGreaterThan(0); expect(r.h).toBeGreaterThan(0);
      for (const h of hs) expect(pisa(r, crece(h)), JSON.stringify({ r, h })).toBe(false);
    }
    expect(rs.length).toBeLessThanOrEqual(9); // cabe en el grupo de ~8-9 Rectangle del Taller
  });

  it("recorta al lienzo y fusiona huecos que se solapan", () => {
    const rs = velo([{ x: -20, y: -20, w: 100, h: 100 }, { x: 50, y: 50, w: 50, h: 50 }], W, H);
    const tapado = (x: number, y: number) => rs.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    expect(tapado(10, 10)).toBe(false);
    expect(tapado(90, 90)).toBe(false);
    expect(tapado(200, 300)).toBe(true);
    for (const r of rs) expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H).toBe(true);
  });
});
