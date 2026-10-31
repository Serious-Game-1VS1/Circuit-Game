/**
 * Carga del kit de arte (PNG sueltos de public/arte/ + fuente pixel) y atajos para pintarlo en Phaser.
 * Escala entera: 1 px de sprite = `k` px de pantalla (4 en taller y UI, según arte/README.md).
 */
import * as Phaser from "phaser";
import { colorDe } from "./colores";
import { infoFusible } from "./colores";
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
  // Multímetro dibujado con una flecha: para qué sirve (≤ 8 palabras); lo dibujado se destruye al terminar la carga.
  const mm = aviso ? s.add.graphics() : null;
  mm?.fillStyle(0x232a42, 1).fillRoundedRect(150, y + 96, 60, 38, 6).lineStyle(2, 0xd9a21b, 1).strokeRoundedRect(150, y + 96, 60, 38, 6)
    .lineStyle(2, 0xf4f7ff, 1).beginPath().arc(180, y + 124, 14, Math.PI * 1.15, Math.PI * 1.85).strokePath().lineStyle(2, 0xff4a4a, 1).lineBetween(180, y + 124, 188, y + 111)
    .fillStyle(0xff4a4a, 1).fillCircle(165, y + 130, 3).fillStyle(0x0b0d14, 1).fillCircle(195, y + 130, 3).lineStyle(2, 0xf4f7ff, 1).strokeCircle(195, y + 130, 3)
    .fillStyle(0xffd23f, 1).fillTriangle(180, y + 142, 172, y + 154, 188, y + 154);
  const uso = aviso ? s.add.text(180, y + 160, "Mide con el multímetro, luego valida", { fontSize: "14px", color: "#ffd23f", align: "center", wordWrap: { width: 300 } }).setOrigin(0.5, 0) : null;
  const rota = consejo && window.setInterval(() => consejo.setText(CONSEJOS[++n % CONSEJOS.length]!), 3000);
  s.load.on("progress", progreso);
  if (rota) s.events.once("shutdown", () => clearInterval(rota)); // escena parada en pleno preload: "complete" no llega
  s.load.once("complete", () => {
    s.load.off("progress", progreso);
    aviso?.destroy();
    consejo?.destroy(); mm?.destroy(); uso?.destroy();
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

/** Nivel 3: resistencia con sus 4 bandas (nombres de color) en pixel art, 18×8 px de sprite a escala `k`. Centrada en (x, y). */
export function resistenciaBandas(s: Phaser.Scene, x: number, y: number, k: number, nombres: readonly string[]) {
  const g = s.add.graphics(), px = (c: number, f: number, w: number, h: number, color: number) => g.fillStyle(color).fillRect(x + (c - 9) * k, y + (f - 4) * k, w * k, h * k);
  px(0, 3, 18, 2, 0x8a94a6); // patillas
  px(2, 0, 14, 8, 0xd8b890); px(1, 1, 1, 6, 0xd8b890); px(16, 1, 1, 6, 0xd8b890); // cuerpo con extremos redondeados
  nombres.forEach((n, i) => px([3, 6, 9, 13][i]!, 0, 2, 8, colorDe(n).hex));
  return g;
}

/** Nivel 3: fusible por su aspecto. Vidrio 5x20 (corto) o 6,3x32 (largo) con hilo recto (F, rápido) o en zigzag (T, lento); cuchilla de coche del color de sus amperios. Centrado en (x, y). */
export function fusibleGraf(s: Phaser.Scene, x: number, y: number, k: number, id: string) {
  const f = infoFusible(id), g = s.add.graphics();
  if (!f) return g;
  const px = (c: number, r: number, w: number, h: number, color: number, alpha = 1) => g.fillStyle(color, alpha).fillRect(x + c * k, y + r * k, w * k, h * k);
  if (f.tipo === "cuchilla") { // 14×16 px: cuerpo de color, ventana con el hilo y dos patas
    px(-7, -8, 14, 11, f.color!.hex); px(-4, -6, 8, 4, 0xffffff, 0.55); px(-3, -4, 6, 1, 0x4a4a52); px(-3, -4, 1, 3, 0x4a4a52); px(2, -4, 1, 3, 0x4a4a52);
    px(-5, 3, 3, 5, 0xb0b0b8); px(2, 3, 3, 5, 0xb0b0b8);
    return g;
  }
  const w = f.grande ? 28 : 18, h = f.grande ? 9 : 7, x0 = -w / 2, y0 = -Math.floor(h / 2);
  px(x0, y0, w, h, 0x7fc4e8); // vidrio
  px(x0, y0, w, 1, 0xe8f4ff); px(x0, y0 + h - 1, w, 1, 0xe8f4ff);
  px(x0, y0, 3, h, 0x9aa4c0); px(x0 + w - 3, y0, 3, h, 0x9aa4c0); // tapas
  const ancho = w - 6, cy = y0 + Math.floor(h / 2);
  if (f.letra === "F") px(x0 + 3, cy, ancho, 1, 0x4a4a52); // hilo recto: se funde al instante
  else for (let i = 0; i < ancho; i++) px(x0 + 3 + i, cy + (i % 4 < 2 ? -1 : 1), 1, 1, 0x4a4a52); // hilo en zigzag (resorte): aguanta el arranque
  return g;
}

/** Pinta un montaje (sprites, diodo y cables) centrado en (x, y); devuelve los objetos para meterlos en un contenedor. */
export function pintarMontaje(s: Phaser.Scene, m: Montaje, x: number, y: number) {
  const g = s.add.graphics().lineStyle(4, 0x8a94a6);
  for (const [a, b, c, d] of m.cables) g.lineBetween(x + a, y + b, x + c, y + d);
  for (const [a, b] of m.puntos ?? []) g.fillStyle(0xe0a43c).fillCircle(x + a, y + b, 5);
  return [g, ...m.elementos.map((e) => (e.diodo ? diodo(s, x + e.x, y + e.y, e.k, e.giro) : e.bandas ? resistenciaBandas(s, x + e.x, y + e.y, e.k, e.bandas) : e.fusible ? fusibleGraf(s, x + e.x, y + e.y, e.k, e.fusible) : img(s, x + e.x, y + e.y, e.sprite!, e.k))),
    ...(m.textos ?? []).map((t) => letras(s, x + t.x, y + t.y, t.t, t.k ?? 2).setOrigin(0.5, 0))];
}
