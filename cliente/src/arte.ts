/**
 * Carga del kit de arte (PNG sueltos de public/arte/ + fuente pixel) y atajos para pintarlo en Phaser.
 * Escala entera: 1 px de sprite = `k` px de pantalla (4 en taller y UI, según arte/README.md).
 */
import * as Phaser from "phaser";
import { ANIMACIONES, sprite, SPRITES } from "./sprites";

export const FUENTE = "pixel";

/** Carga el kit en el preload de la escena que lo usa (las texturas quedan para todo el juego). */
export function cargarArte(s: Phaser.Scene) {
  // shortcut: ~180 PNG sueltos (pocos KB en total); si la carga en móvil se nota lenta, empaquetarlos en un atlas.
  s.load.setPath("arte/");
  for (const x of SPRITES) if (!s.textures.exists(x.nombre)) s.load.image(x.nombre, x.archivo);
  if (!s.cache.bitmapFont.exists(FUENTE)) s.load.bitmapFont(FUENTE, "ui/fuente_pixel.png", "ui/fuente_pixel.xml");
  s.load.setPath("");
  s.load.once("complete", () => {
    for (const k of [...SPRITES.map((x) => x.nombre), FUENTE]) s.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (const x of ANIMACIONES) {
      if (!s.anims.exists(x.clave)) s.anims.create({ key: x.clave, frames: x.frames.map((key) => ({ key })), frameRate: x.frameRate, repeat: x.repeat });
    }
  });
}

const origen = (nombre: string) => sprite(nombre)?.origen ?? { x: 0, y: 0 };

/** Imagen del kit con su origen del atlas. */
export const img = (s: Phaser.Scene, x: number, y: number, nombre: string, k = 4) => {
  const o = origen(nombre);
  return s.add.image(x, y, nombre).setOrigin(o.x, o.y).setScale(k);
};

/** Sprite animado (clave de animación del atlas). */
export const anim = (s: Phaser.Scene, x: number, y: number, clave: string, k = 4) => {
  const primero = s.anims.get(clave)!.frames[0]!.textureKey;
  const o = origen(primero);
  return s.add.sprite(x, y, primero).setOrigin(o.x, o.y).setScale(k).play(clave);
};

/** Panel o botón nine-slice del kit, de `w`×`h` px de pantalla, centrado en (x, y). */
export const marco = (s: Phaser.Scene, x: number, y: number, nombre: string, w: number, h: number, k = 4) => {
  const n = sprite(nombre)?.nineSlice;
  return s.add.nineslice(x, y, nombre, undefined, w / k, h / k, n?.izq ?? 0, n?.der ?? 0, n?.arr ?? 0, n?.aba ?? 0).setScale(k);
};

/**
 * La fuente pixel no trae º, •, —, =, «», … ni ✔: se cambian por glifos que sí tiene.
 * Si añades glifos a arte/ui/fuente_pixel.*, quita su línea de aquí.
 */
export const aPixel = (t: string) => t.replace(/º/g, "").replace(/[•—]/g, "-").replace(/ ?= ?/g, ": ").replace(/[«»]/g, '"').replace(/…/g, "...").replace(/ ?✔/g, "");

/** Texto con la fuente pixel del kit (glifos de 8 px de alto × k). Ancho ≈ 4·k px por letra. */
export const letras = (s: Phaser.Scene, x: number, y: number, t: string, k = 2, color = 0xffffff) =>
  s.add.bitmapText(x, y, FUENTE, aPixel(t), 8 * k).setTint(color);

/** Área táctil invisible (para que el objetivo mida ≥ 44 px aunque el dibujo sea menor). */
export const toque = (s: Phaser.Scene, x: number, y: number, w: number, h: number, fn: () => void) =>
  s.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).on("pointerdown", fn);
