/**
 * Arrastrar y soltar piezas de la gaveta (todas las zonas). Mientras se arrastra, un «fantasma» de la
 * pieza sigue al dedo o al ratón; si se suelta fuera de su ranura vuelve a la gaveta. Un toque corto
 * (sin moverse UMBRAL px) sigue funcionando como antes, por accesibilidad. La parte pura se prueba en
 * test/arrastre.test.ts; quién acepta la pieza lo decide quien llama (taller.ts, tablero.ts).
 */
import type * as Phaser from "phaser"; // solo tipos: así las pruebas no cargan Phaser

/** Píxeles que hay que mover el dedo para que el toque pase a ser arrastre. */
export const UMBRAL = 10;
export const esArrastre = (x0: number, y0: number, x: number, y: number) => Math.hypot(x - x0, y - y0) >= UMBRAL;

export interface Rect { x: number; y: number; w: number; h: number }
/** ¿(x, y) cae dentro del rectángulo centrado en (r.x, r.y)? */
export const dentro = (r: Rect, x: number, y: number) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(y - r.y) <= r.h / 2;

type Fantasma = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Depth & { setAlpha(a: number): unknown };

export interface Opciones {
  /** Crea la vista previa de la pieza (se pinta encima de todo, en coordenadas de la escena). */
  fantasma: () => Fantasma;
  /** Se llama mientras se arrastra (para resaltar la ranura) y con null al terminar. */
  sobre: (p: Phaser.Input.Pointer | null) => void;
  /** Se suelta: true si la pieza quedó puesta; false = vuelve a la gaveta. */
  soltar: (p: Phaser.Input.Pointer) => boolean;
  /** Toque corto sin arrastrar. */
  tocar: () => void;
  /** false = no se puede tomar ahora (bloqueo, zona reparada). */
  puede?: () => boolean;
}

/** Hace arrastrable un objeto interactivo de la gaveta. */
export function arrastrable(s: Phaser.Scene, obj: Phaser.GameObjects.GameObject, op: Opciones) {
  let d: { id: number; x0: number; y0: number; g?: Fantasma } | undefined;
  obj.on("pointerdown", (p: Phaser.Input.Pointer) => {
    if (op.puede && !op.puede()) return;
    d = { id: p.id, x0: p.worldX, y0: p.worldY };
  });
  s.input.on("pointermove", (p: Phaser.Input.Pointer) => {
    if (!d || p.id !== d.id) return;
    if (!d.g) {
      if (!esArrastre(d.x0, d.y0, p.worldX, p.worldY)) return;
      d.g = op.fantasma().setDepth(1000);
      d.g.setAlpha(0.85);
    }
    d.g.setPosition(p.worldX, p.worldY);
    op.sobre(p);
  });
  const fin = (p: Phaser.Input.Pointer) => {
    if (!d || p.id !== d.id) return;
    const { g, x0, y0 } = d;
    d = undefined;
    op.sobre(null);
    if (!g) return op.tocar();
    if (op.soltar(p)) return g.destroy();
    // Soltada fuera: regresa a la gaveta y desaparece.
    s.tweens.add({ targets: g, x: x0, y: y0, alpha: 0, duration: 220, ease: "Cubic.Out", onComplete: () => g.destroy() });
  };
  s.input.on("pointerup", fin);
  s.input.on("pointerupoutside", fin);
}
