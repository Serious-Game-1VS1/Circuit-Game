/**
 * Arrastrar y soltar piezas de la gaveta (todas las zonas). Mientras se arrastra, un «fantasma» de la
 * pieza sigue al dedo o al ratón; si se suelta fuera de su ranura vuelve a la gaveta. Un toque corto
 * (sin moverse UMBRAL px) sigue funcionando como antes, por accesibilidad. El movimiento y el soltar se
 * leen de `window` (pointermove/up/cancel), NO de la cola de Phaser (que solo se vacía una vez por cuadro:
 * con pocos fps, p. ej. navegadores que frenan la pestaña, el soltar tardaba segundos o se perdía). La parte pura se prueba en
 * test/arrastre.test.ts; quién acepta la pieza lo decide quien llama (taller.ts, tablero.ts).
 */
import type * as Phaser from "phaser"; // solo tipos: así las pruebas no cargan Phaser

/** Píxeles que hay que mover el dedo para que el toque pase a ser arrastre. */
export const UMBRAL = 4;
export const esArrastre = (x0: number, y0: number, x: number, y: number) => Math.hypot(x - x0, y - y0) >= UMBRAL;

export interface Rect { x: number; y: number; w: number; h: number }
/** ¿(x, y) cae dentro del rectángulo centrado en (r.x, r.y)? */
export const dentro = (r: Rect, x: number, y: number) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(y - r.y) <= r.h / 2;

/** Área de acierto generosa: 1,5× la ranura y al menos 70 px de lienzo (≈56 px en pantalla a 360x640). */
export const generosa = (r: Rect): Rect => ({ x: r.x, y: r.y, w: Math.max(r.w * 1.5, 70), h: Math.max(r.h * 1.5, 70) });

/** Punto del lienzo (lo único que necesitan quienes deciden dónde cae la pieza). */
export interface Toque { worldX: number; worldY: number }

type Fantasma = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Depth & { setAlpha(a: number): unknown };

/** clientX/Y -> coordenadas del lienzo (el lienzo se escala con FIT). */
export const aLienzo = (s: Phaser.Scene, e: PointerEvent | MouseEvent): Toque => {
  const r = s.game.canvas.getBoundingClientRect(), g = s.scale.gameSize;
  return { worldX: ((e.clientX - r.left) * g.width) / r.width, worldY: ((e.clientY - r.top) * g.height) / r.height };
};
/** Id del puntero del navegador detrás de un puntero de Phaser (para emparejar bajar con mover/soltar de `window`). */
export const idPuntero = (p: Phaser.Input.Pointer) => (p.event as PointerEvent | undefined)?.pointerId ?? -1;

/**
 * Movimiento y soltar de un cable o pieza que se arrastra sobre la placa: se leen de `window` (como en `arrastrable`), con la cola de
 * Phaser de respaldo (quien llama ignora el segundo aviso porque ya cerró el arrastre). `id` = pointerId (idPuntero), -1 si no se sabe.
 */
export function seguirPuntero(s: Phaser.Scene, mover: (t: Toque, id: number) => void, soltar: (t: Toque, id: number) => void) {
  const id = (e: PointerEvent) => e.pointerId;
  const onMove = (e: PointerEvent) => mover(aLienzo(s, e), id(e));
  const onUp = (e: PointerEvent) => soltar(aLienzo(s, e), id(e));
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  const pt = (p: Phaser.Input.Pointer): Toque => ({ worldX: p.worldX, worldY: p.worldY });
  s.input.on("pointermove", (p: Phaser.Input.Pointer) => mover(pt(p), idPuntero(p)));
  s.input.on("pointerup", (p: Phaser.Input.Pointer) => soltar(pt(p), idPuntero(p)));
  s.events.once("shutdown", () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp); });
}

export interface Opciones {
  /** Crea la vista previa de la pieza (se pinta encima de todo, en coordenadas de la escena). */
  fantasma: () => Fantasma;
  /** Se llama mientras se arrastra (para resaltar la ranura) y con null al terminar. */
  sobre: (p: Toque | null) => void;
  /** Se suelta: true si la pieza quedó puesta; false = vuelve a la gaveta. */
  soltar: (p: Toque) => boolean;
  /** Toque corto sin arrastrar. */
  tocar: () => void;
  /** false = no se puede tomar ahora (bloqueo, zona reparada). */
  puede?: () => boolean;
}

/** Hace arrastrable un objeto interactivo de la gaveta. */
export function arrastrable(s: Phaser.Scene, obj: Phaser.GameObjects.GameObject, op: Opciones) {
  let d: { id?: number; x0: number; y0: number; g?: Fantasma; ultimo: Toque; quitar: () => void } | undefined;
  const canvas = s.game.canvas;
  canvas.style.touchAction = "none"; // sin esto el navegador se queda el gesto táctil (scroll) y manda pointercancel
  const suyo = (e: PointerEvent | MouseEvent) => !d || d.id === undefined || !("pointerId" in e) || e.pointerId === d.id;
  const mover = (t: Toque) => {
    if (!d) return;
    d.ultimo = t;
    if (!d.g) {
      if (!esArrastre(d.x0, d.y0, t.worldX, t.worldY)) return;
      d.g = op.fantasma().setDepth(1000);
      d.g.setAlpha(0.85);
    }
    d.g.setPosition(t.worldX, t.worldY);
    op.sobre(t);
  };
  const fin = (t?: Toque, cancelar = false) => {
    if (!d) return;
    const { g, x0, y0, ultimo, quitar } = d;
    d = undefined;
    quitar();
    op.sobre(null);
    if (!g) return cancelar ? undefined : op.tocar();
    // Soltada sobre el hueco: se coloca al instante (sin esperar). Cancelada o fuera: regresa a la gaveta.
    if (!cancelar && op.soltar(t ?? ultimo)) return g.destroy();
    s.tweens.add({ targets: g, x: x0, y: y0, alpha: 0, duration: 220, ease: "Cubic.Out", onComplete: () => g.destroy() });
  };
  obj.on("pointerdown", (p: Phaser.Input.Pointer) => {
    if (d || (op.puede && !op.puede())) return;
    const ev = p.event as PointerEvent | undefined, id = ev && "pointerId" in ev ? ev.pointerId : undefined;
    const onMove = (e: PointerEvent) => { if (suyo(e)) mover(aLienzo(s, e)); };
    const onUp = (e: PointerEvent) => { if (suyo(e)) fin(aLienzo(s, e)); };
    const onCancel = (e: PointerEvent) => { if (suyo(e)) fin(undefined, true); };
    const onBlur = () => fin(undefined, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);
    const quitar = () => {
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel); window.removeEventListener("blur", onBlur);
    };
    d = { id, x0: p.worldX, y0: p.worldY, ultimo: { worldX: p.worldX, worldY: p.worldY }, quitar };
  });
  // Respaldo si el navegador no manda pointer events (Phaser sí ve el soltar por su cola).
  const respaldo = (p: Phaser.Input.Pointer) => fin(d?.g ? undefined : { worldX: p.worldX, worldY: p.worldY });
  s.input.on("pointerup", respaldo);
  s.input.on("pointerupoutside", respaldo);
  s.events.once("shutdown", () => { d?.quitar(); d = undefined; });
}
