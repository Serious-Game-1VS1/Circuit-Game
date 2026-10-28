/**
 * Carga del kit de arte (PNG sueltos de public/arte/ + fuente pixel) y atajos para pintarlo en Phaser.
 * Escala entera: 1 px de sprite = `k` px de pantalla (4 en taller y UI, según arte/README.md).
 */
import * as Phaser from "phaser";
import { ANIMACIONES, type Montaje, sprite, SPRITES } from "./sprites";
import { aPixel, CONSEJOS } from "./vista"; // glifos que la fuente no trae

export const FUENTE = "pixel";

/**
 * Carga el kit en el preload de la escena que lo usa (las texturas quedan para todo el juego). La Sala lo precarga
 * en segundo plano (luego `s.load.start()`) para que el Taller no quede en negro tras la cuenta. Mientras carga
 * muestra «Cargando taller… n %» en `y` (la escena se pinta durante su preload).
 */
export function cargarArte(s: Phaser.Scene, y = 320) {
  // shortcut: ~180 PNG sueltos (pocos KB en total); si la carga en móvil se nota lenta, empaquetarlos en un atlas.
  s.load.setPath("arte/");
  for (const x of SPRITES) if (!s.textures.exists(x.nombre)) s.load.image(x.nombre, x.archivo);
  // Si una escena se paró cargando, sus ~32 descargas en vuelo igual terminan y pueblan la textura: no re-añadirla (daba «Texture key already in use»).
  s.load.on("addfile", (_k: string, _t: string, _l: unknown, file: Phaser.Loader.File) => {
    const añadir = file.addToCache.bind(file);
    file.addToCache = () => { if (file.type !== "image" || !s.textures.exists(file.key)) añadir(); };
  });
  if (!s.cache.bitmapFont.exists(FUENTE)) s.load.bitmapFont(FUENTE, "ui/fuente_pixel.png", "ui/fuente_pixel.xml");
  s.load.setPath("");
  // Sin nada que cargar el preload no emite "complete": el aviso solo se crea si hay archivos en cola.
  const aviso = s.load.list.size ? s.add.text(180, y, "Cargando taller… 0 %", { fontSize: "16px", color: "#9ab" }).setOrigin(0.5) : null;
  const progreso = (f: number) => aviso?.setText(`Cargando taller… ${Math.round(f * 100)} %`);
  // Consejo de electrónica bajo el porcentaje, cambia cada ~3 s (setInterval: el reloj de la escena no corre durante el preload).
  let n = Math.floor(Math.random() * CONSEJOS.length);
  const consejo = aviso ? s.add.text(180, y + 30, CONSEJOS[n]!, { fontSize: "14px", color: "#e0a43c", align: "center", wordWrap: { width: 300 } }).setOrigin(0.5, 0) : null;
  const rota = consejo && window.setInterval(() => consejo.setText(CONSEJOS[++n % CONSEJOS.length]!), 3000);
  s.load.on("progress", progreso);
  s.load.once("complete", () => {
    s.load.off("progress", progreso);
    aviso?.destroy();
    consejo?.destroy();
    if (rota) clearInterval(rota);
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

/** Texto con la fuente pixel del kit (glifos de 8 px de alto × k). Ancho ≈ 4·k px por letra. */
export const letras = (s: Phaser.Scene, x: number, y: number, t: string, k = 2, color = 0xffffff) => {
  const b = s.add.bitmapText(x, y, FUENTE, aPixel(t), 8 * k).setTint(color), poner = b.setText.bind(b);
  b.setText = (v) => poner(aPixel(String(v))); // los setText posteriores (avisos, globo) también pasan por aPixel
  return b;
};

/** Área táctil invisible (para que el objetivo mida ≥ 44 px aunque el dibujo sea menor). */
export const toque = (s: Phaser.Scene, x: number, y: number, w: number, h: number, fn: () => void) =>
  s.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).on("pointerdown", fn);

/** Diodo en pixel art (triángulo + barra; la franja ámbar es el cátodo), 12×11 px de sprite a escala `k`. Centrado en (x, y). */
export function diodo(s: Phaser.Scene, x: number, y: number, k = 3, giro = false) {
  const g = s.add.graphics(), px = (c: number, f: number, w: number, h: number, color: number) => g.fillStyle(color).fillRect(x + ((giro ? 12 - c - w : c) - 6) * k, y + (f - 5) * k, w * k, h * k);
  px(0, 5, 12, 1, 0x8a94a6); // patillas
  for (let c = 1; c <= 7; c++) { const m = 4 - Math.floor(((c - 1) * 5) / 7); px(c, 5 - m, 1, 2 * m + 1, 0xd8dee9); } // triángulo hacia el cátodo
  px(8, 0, 2, 11, 0xe0a43c); // franja del cátodo
  return g;
}

/** Pinta un montaje (sprites, diodo y cables) centrado en (x, y); devuelve los objetos para meterlos en un contenedor. */
export function pintarMontaje(s: Phaser.Scene, m: Montaje, x: number, y: number) {
  const g = s.add.graphics().lineStyle(4, 0x8a94a6);
  for (const [a, b, c, d] of m.cables) g.lineBetween(x + a, y + b, x + c, y + d);
  for (const [a, b] of m.puntos ?? []) g.fillStyle(0xe0a43c).fillCircle(x + a, y + b, 5);
  return [g, ...m.elementos.map((e) => (e.diodo ? diodo(s, x + e.x, y + e.y, e.k, e.giro) : img(s, x + e.x, y + e.y, e.sprite!, e.k))),
    ...(m.textos ?? []).map((t) => letras(s, x + t.x, y + t.y, t.t, t.k ?? 2).setOrigin(0.5, 0))];
}
