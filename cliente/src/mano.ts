/**
 * Mano del tutorial: pixel art por código (cuadrícula 10x12, mismo patrón que Chispa: `pixeles` + Graphics), sin sprite nuevo.
 * Dos gestos en bucle, «tocar» y «arrastrar», definidos por `poseMano` (pura, probada en test/mano.test.ts); `crearMano` solo dibuja.
 * Tiempo real con setInterval (el reloj de Phaser se congela con la pestaña oculta). Con prefers-reduced-motion queda quieta señalando.
 */
import * as Phaser from "phaser";
import type { Rect } from "./chispa";
import type { Gesto } from "./tutorial";

const BLANCO = 0xf4f7ff, BORDE = 0x10141e, PULSO = 0xc9d6ea, CIAN = 0x7fe0ff;
export const MANO_W = 10, MANO_H = 12;
/** Celda de la punta del índice: (x, y) de la pose cae aquí. */
const PUNTA_X = 3.5, PUNTA_Y = 0;

/** Rectángulos de la mano (índice estirado hacia arriba); `presion` = el dedo se acorta y se aclara al apretar. Pura. */
export function pixelesMano(presion = false): Rect[] {
  const d = presion ? 1 : 0, piel = presion ? PULSO : BLANCO;
  return [
    [2, d, 4, 7 - d, BORDE], [1, 5, 9, 7, BORDE], // contorno del índice y de la palma
    [3, d + 1, 2, 6 - d, piel], [2, 6, 7, 5, piel], // relleno
    [5, 6, 1, 2, BORDE], [7, 6, 1, 2, BORDE], // dedos doblados
  ];
}

export interface Punto { x: number; y: number }
/** Estado de la mano en un instante: punta del dedo, si aprieta, opacidad, radio del anillo de toque (0 = sin anillo) y si lleva la pieza fantasma. */
export interface Pose extends Punto { presion: boolean; alpha: number; anillo: number; fantasma: boolean }

/** Duración del bucle de cada gesto (ms). */
export const CICLO: Record<Gesto, number> = { tocar: 1400, arrastrar: 2000 };
const tramo = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/**
 * Pose del gesto a los `ms` del inicio (en bucle). tocar en `a`: entra, baja 6 px apretando con anillo, sube y espera 600 ms.
 * arrastrar de `a` a `b`: aparece, aprieta, lleva la pieza 700 ms, suelta, se desvanece y espera. Con `reducido`: quieta en `a`.
 */
export function poseMano(gesto: Gesto, ms: number, a: Punto, b: Punto = a, reducido = false): Pose {
  if (reducido) return { ...a, presion: false, alpha: 1, anillo: 0, fantasma: false };
  const t = ((ms % CICLO[gesto]) + CICLO[gesto]) % CICLO[gesto];
  if (gesto === "tocar") {
    const baja = tramo(t, 300, 500) - tramo(t, 500, 800);
    return { x: a.x, y: a.y - 6 + 6 * baja, presion: t >= 500 && t < 650, alpha: tramo(t, 0, 300), anillo: t >= 500 && t < 900 ? 4 + 20 * tramo(t, 500, 900) : 0, fantasma: false };
  }
  const k = tramo(t, 400, 1100);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, presion: t >= 200 && t < 1100, alpha: t < 1300 ? tramo(t, 0, 200) : 1 - tramo(t, 1300, 1600), anillo: 0, fantasma: t >= 400 && t < 1100 };
}

export interface Mano {
  cont: Phaser.GameObjects.Container;
  tocar(x: number, y: number): void;
  /** `fantasma`: objeto (p. ej. el de `fantasma()` del Taller) que la mano lleva semitransparente mientras arrastra. */
  arrastrar(x0: number, y0: number, x1: number, y1: number, fantasma?: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible & { setAlpha(a: number): unknown }): void;
  ocultar(): void;
  destruir(): void;
}

/** `escala` = px por celda; `depth` 950 (sobre velo 880, Chispa 892 y flecha 895). */
export function crearMano(s: Phaser.Scene, escala = 3, depth = 950): Mano {
  const k = escala, reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const anillo = s.add.graphics(), g = s.add.graphics(), cont = s.add.container(0, 0, [anillo, g]).setDepth(depth).setVisible(false);
  let gesto: Gesto | null = null, a: Punto = { x: 0, y: 0 }, b: Punto = a, t0 = 0, apretada: boolean | null = null;
  let fant: Parameters<Mano["arrastrar"]>[4];
  const pintar = (presion: boolean) => {
    if (presion === apretada) return;
    apretada = presion; g.clear();
    for (const [cx, cy, w, h, c] of pixelesMano(presion)) g.fillStyle(c).fillRect((cx - PUNTA_X) * k, (cy - PUNTA_Y) * k, w * k, h * k);
  };
  const paso = () => {
    if (!gesto || !cont.active) return;
    const p = poseMano(gesto, performance.now() - t0, a, b, reducido);
    pintar(p.presion);
    cont.setPosition(p.x, p.y).setAlpha(p.alpha).setVisible(true);
    anillo.clear();
    if (p.anillo) anillo.lineStyle(2, CIAN, 1 - p.anillo / 24).strokeCircle(0, 0, p.anillo);
    fant?.setVisible(p.fantasma).setPosition(p.x, p.y).setAlpha(0.5);
  };
  const ciclo = window.setInterval(paso, 33);
  cont.once("destroy", () => clearInterval(ciclo));
  const empezar = (ge: Gesto, pa: Punto, pb: Punto) => { gesto = ge; a = pa; b = pb; t0 = performance.now(); paso(); };
  const ocultar = () => { gesto = null; cont.setVisible(false); anillo.clear(); fant?.setVisible(false); fant = undefined; };
  return {
    cont,
    tocar(x, y) { fant?.setVisible(false); fant = undefined; empezar("tocar", { x, y }, { x, y }); },
    arrastrar(x0, y0, x1, y1, f) { fant?.setVisible(false); fant = f; empezar("arrastrar", { x: x0, y: y0 }, { x: x1, y: y1 }); },
    ocultar,
    destruir() { clearInterval(ciclo); cont.destroy(); },
  };
}
