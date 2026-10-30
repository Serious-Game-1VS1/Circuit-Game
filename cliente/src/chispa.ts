/**
 * Chispa: mecánico-robot espacial, mascota y guía del juego. Pixel art generado por código (Graphics, cuadrícula de
 * 16x16 celdas de `k` px), 4 expresiones. Parpadeo, flotación y salto van con temporizadores de tiempo real (setInterval):
 * el reloj de Phaser se congela con la pestaña oculta. Con prefers-reduced-motion queda quieta.
 * La lógica pura (pixeles, expresionGuia, mensajesMenu) no toca el motor y está probada en test/chispa.test.ts.
 */
import * as Phaser from "phaser";
import { CONSEJOS } from "./vista";
import { letras, marco } from "./arte";

export type Expresion = "normal" | "feliz" | "preocupada" | "senalando";
/** Celda x, celda y, ancho, alto (en celdas) y color. */
export type Rect = [number, number, number, number, number];

const METAL = 0xb8c4d6, SOMBRA = 0x7a879b, VISOR = 0x10141e, CIAN = 0x7fe0ff, AMBAR = 0xe0a43c, NARANJA = 0xd9742b, OSCURO = 0xa5531a;
const BLANCO = 0xffffff, AMARILLO = 0xffe27a, HUMO = 0x6f819a, GOTA = 0x7fb8ff, ROJO = 0xff6b6b;
export const CELDAS = 16;

/** Rectángulos de la cuadrícula 16x16 para una expresión (con `parpadeo`, los ojos se cierran). Función pura. */
export function pixeles(e: Expresion, parpadeo = false): Rect[] {
  const r: Rect[] = [
    [7, 0, 2, 2, e === "feliz" ? AMARILLO : e === "preocupada" ? ROJO : AMBAR], [7, 2, 2, 1, SOMBRA], // antena
    [3, 3, 10, 7, METAL], [3, 9, 10, 1, SOMBRA], [2, 5, 1, 3, SOMBRA], [13, 5, 1, 3, SOMBRA], [4, 4, 8, 5, VISOR], // cabeza y visor
    [4, 10, 8, 4, NARANJA], [4, 13, 8, 1, OSCURO], [7, 11, 2, 2, e === "feliz" ? AMARILLO : e === "preocupada" ? ROJO : CIAN], // cuerpo y luz del pecho
    [2, 10, 2, 3, NARANJA], [2, 13, 2, 1, METAL], [5, 14, 2, 2, SOMBRA], [9, 14, 2, 2, SOMBRA], // brazo izquierdo y botas
  ];
  if (e === "senalando") r.push([12, 10, 3, 2, NARANJA], [15, 10, 1, 2, METAL]);
  else r.push([12, 10, 2, 3, NARANJA], [12, 13, 2, 1, METAL]);
  if (e === "feliz") {
    r.push([5, 6, 1, 1, CIAN], [6, 5, 1, 1, CIAN], [7, 6, 1, 1, CIAN], [9, 6, 1, 1, CIAN], [10, 5, 1, 1, CIAN], [11, 6, 1, 1, CIAN], [7, 8, 2, 1, CIAN]); // ojos «^^» y sonrisa
    r.push([1, 1, 1, 3, AMARILLO], [0, 2, 3, 1, AMARILLO], [14, 0, 1, 3, AMARILLO], [13, 1, 3, 1, AMARILLO]); // chispas
  } else if (e === "preocupada") {
    r.push(...(parpadeo ? [[5, 6, 3, 1, BLANCO], [9, 6, 3, 1, BLANCO]] : [[5, 5, 3, 3, BLANCO], [9, 5, 3, 3, BLANCO], [6, 6, 1, 1, VISOR], [10, 6, 1, 1, VISOR]]) as Rect[]);
    r.push([7, 8, 2, 1, HUMO], [11, 0, 2, 2, HUMO], [13, 1, 2, 2, SOMBRA], [14, 4, 1, 2, GOTA]); // boca, humo y gota
  } else {
    const x = e === "senalando" ? 1 : 0; // mira hacia donde señala
    r.push(...(parpadeo ? [[5 + x, 6, 2, 1, CIAN], [9 + x, 6, 2, 1, CIAN]] : [[5 + x, 5, 2, 2, CIAN], [9 + x, 5, 2, 2, CIAN]]) as Rect[]);
  }
  return r;
}

/** Expresión de la guía del tutorial: final y reparado = feliz; algo quemado = preocupada; «Toca/Pulsa/Arrastra…» = señalando. */
export function expresionGuia(texto: string, fin: boolean, e?: { quemado: boolean; reparada: boolean }): Expresion {
  if (fin) return "feliz";
  if (e?.quemado) return "preocupada";
  if (e?.reparada) return "feliz";
  return /^(Toca|Pulsa|Arrastra|Elige|Une)\b/.test(texto) ? "senalando" : "normal";
}

export interface Mensaje { texto: string; expr: Expresion }
/** Mensajes que rota Chispa en el menú: novato → primer pod; luego el consejo del día y, si hay tutoriales hechos, felicitación. */
export function mensajesMenu(p: { xp: number; partidas: number; tutoriales: string[] }, total: number, dia: number): Mensaje[] {
  const consejo: Mensaje = { texto: CONSEJOS[((dia % CONSEJOS.length) + CONSEJOS.length) % CONSEJOS.length]!, expr: "normal" };
  const hechos = p.tutoriales.length;
  const lista: Mensaje[] = [];
  if (!p.partidas && !p.xp) lista.push({ texto: "¡Tu primer pod te espera!", expr: "senalando" });
  lista.push(consejo);
  if (hechos >= total) lista.push({ texto: "¡Completaste todos los tutoriales! Eres mecánico de primera.", expr: "feliz" });
  else if (hechos > 0) lista.push({ texto: `¡Bien! Ya llevas ${hechos} de ${total} tutoriales.`, expr: "feliz" });
  return lista;
}

export interface Chispa {
  cont: Phaser.GameObjects.Container;
  poner(expresion: Expresion): void;
  /** Bocadillo con `texto`; con `ms` se quita solo (tiempo real). */
  decir(texto: string, ms?: number): void;
  /** Saltito de alegría. */
  animar(): void;
  destruir(): void;
}

/** (x, y) = centro de los pies. `escala` = px de pantalla por celda. `lado`: hacia dónde sale el bocadillo; `ancho`: ancho máximo del texto. */
export function crearChispa(s: Phaser.Scene, x: number, y: number, escala = 3, expresion: Expresion = "normal", op: { lado?: "izq" | "der"; ancho?: number } = {}): Chispa {
  const k = escala, reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const g = s.add.graphics(), cuerpo = s.add.container(0, 0, [g]), cont = s.add.container(x, y, [cuerpo]);
  let expr = expresion, cierra = false, globo: Phaser.GameObjects.Container | null = null, tGlobo = 0, salto = 0;
  const pintar = () => {
    g.clear();
    for (const [cx, cy, w, h, c] of pixeles(expr, cierra)) g.fillStyle(c).fillRect((cx - CELDAS / 2) * k, (cy - CELDAS) * k, w * k, h * k);
  };
  pintar();

  // Tiempo real: flotación (±1 celda a media escala), parpadeo cada 3-5 s y salto.
  let sigue = 0, parp = 0;
  const ciclo = window.setInterval(() => {
    if (!cont.active) return;
    const t = performance.now();
    if (salto) { salto = Math.max(0, salto - 1); cuerpo.y = -Math.round(Math.sin(((8 - salto) / 8) * Math.PI) * 3) * k; return; }
    cuerpo.y = Math.round(Math.sin(t / 450) * 0.6) * k * 0.5;
    if (!cierra && t > sigue) { cierra = true; parp = t + 140; pintar(); }
    else if (cierra && t > parp) { cierra = false; sigue = t + 3000 + Math.random() * 2000; pintar(); }
  }, 90);
  const limpiar = () => { clearInterval(ciclo); clearTimeout(tGlobo); };
  if (reducido) clearInterval(ciclo);
  cont.once("destroy", limpiar);

  const quitar = () => { globo?.destroy(); globo = null; };
  return {
    cont,
    poner(e) { if (e !== expr) { expr = e; pintar(); } },
    decir(texto, ms) {
      quitar(); clearTimeout(tGlobo);
      const lado = op.lado ?? "der", t = letras(s, 0, 0, texto, 1.5, 0xe8f6ff).setOrigin(0, 0.5).setMaxWidth(op.ancho ?? 220);
      const w = Math.ceil(t.width) + 16, h = Math.ceil(t.height) + 14, cy = -9.5 * k;
      const cx = lado === "der" ? 9 * k + w / 2 : -9 * k - w / 2;
      t.setPosition(cx - w / 2 + 8, cy);
      globo = s.add.container(0, 0, [marco(s, cx, cy, "panel_oscuro", w, h, 2), t]);
      cont.add(globo);
      if (ms) tGlobo = window.setTimeout(quitar, ms);
    },
    animar() { if (!reducido) { salto = 8; if (!cont.active) return; } },
    destruir() { limpiar(); cont.destroy(); },
  };
}
