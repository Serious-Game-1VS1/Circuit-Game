/**
 * Velo del tutorial: oscurece todo el lienzo MENOS los huecos (el foco). Sin máscaras de Phaser: devuelve rectángulos
 * (franjas horizontales) que el Taller pinta con Rectangle interactivos (depth ~880), que además tragan los toques fuera del foco.
 * Función pura, probada en test/velo.test.ts.
 */
export interface Rect { x: number; y: number; w: number; h: number }

/** Margen (px) alrededor de cada hueco. */
export const MARGEN_VELO = 6;

/** Rectángulos que cubren [0,W]x[0,H] salvo los huecos (agrandados `margen` y recortados al lienzo). Sin huecos: todo el lienzo. */
export function velo(huecos: readonly Rect[], W: number, H: number, margen = MARGEN_VELO): Rect[] {
  const hs = huecos.map((r) => ({ x0: Math.max(0, r.x - margen), y0: Math.max(0, r.y - margen), x1: Math.min(W, r.x + r.w + margen), y1: Math.min(H, r.y + r.h + margen) }))
    .filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
  const ys = [...new Set([0, H, ...hs.flatMap((r) => [r.y0, r.y1])])].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let k = 0; k < ys.length - 1; k++) {
    const y0 = ys[k]!, y1 = ys[k + 1]!;
    let x = 0; // recorre la franja de izquierda a derecha saltando los huecos que la cruzan
    for (const r of hs.filter((r) => r.y0 < y1 && r.y1 > y0).sort((a, b) => a.x0 - b.x0)) {
      if (r.x0 > x) out.push({ x, y: y0, w: r.x0 - x, h: y1 - y0 });
      x = Math.max(x, r.x1);
    }
    if (x < W) out.push({ x, y: y0, w: W - x, h: y1 - y0 });
  }
  return out;
}
