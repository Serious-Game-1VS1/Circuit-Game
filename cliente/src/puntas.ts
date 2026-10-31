/**
 * Puntas del multímetro (animación de medir). Lógica pura (se prueba en test/puntas.test.ts) y un dibujo que solo necesita un Graphics:
 * dos cables (ROJO = positivo, NEGRO = común) salen de los jacks, viajan a los dos extremos de la pieza o tramo medido, hacen contacto
 * con un destello, la aguja se mueve y se retiran. Todo es función del tiempo transcurrido (sin tweens ni timers): si la medición se
 * cancela, basta con dejar de llamar a dibujarPuntas y limpiar el Graphics.
 */
import type * as Phaser from "phaser";
import type { ModoMedir } from "../../spike/src/protocol";
import { coord } from "./placa";
import { huecosCadena } from "./sprites";

export interface Pt { x: number; y: number }
/** Reparto del tiempo que fija el árbitro (Medida.medirMs): viaje de los cables, contacto + aguja, retirada. */
export const FASES = { viaje: 0.35, contacto: 0.5, retirada: 0.15 } as const;
export type Fase = "viaje" | "contacto" | "retirada" | "fin";

export const duracionFases = (medirMs: number) => ({ viajeMs: medirMs * FASES.viaje, contactoMs: medirMs * FASES.contacto, retiradaMs: medirMs * FASES.retirada });

/** Fase y avance (0..1) dentro de ella. Con `reducido` los cables ya aparecen conectados (sin viaje). */
export function faseEn(transcurrido: number, medirMs: number, reducido = false): { fase: Fase; t: number } {
  const { viajeMs, contactoMs, retiradaMs } = duracionFases(medirMs);
  if (transcurrido < 0 || medirMs <= 0) return { fase: reducido ? "contacto" : "viaje", t: 0 };
  const ini = reducido ? 0 : viajeMs, largo = reducido ? viajeMs + contactoMs : contactoMs; // con reducido el contacto absorbe el viaje
  if (transcurrido < ini) return { fase: "viaje", t: transcurrido / viajeMs };
  if (transcurrido < viajeMs + contactoMs) return { fase: "contacto", t: (transcurrido - ini) / largo };
  const r = transcurrido - viajeMs - contactoMs;
  return r < retiradaMs ? { fase: "retirada", t: r / retiradaMs } : { fase: "fin", t: 1 };
}

/** Geometría del panel del Taller (coordenadas del panel): jacks del multímetro y piezas del dibujo del circuito. */
export const JACK = { rojo: { x: 112, y: 198 }, negro: { x: 248, y: 198 } } as const;
const PIEZA = { a: { x: 140, y: 34 }, b: { x: 220, y: 34 } };
const MC = { x: 288, y: 62 };

export interface CtxPuntas {
  circuito: string;
  punto: string;
  modo: ModoMedir;
  /** Piezas de la cadena (circuito «cadena»). */
  cadenaN?: number;
  /** Bornes del montaje de carga (protegido, divisor, combinar), relativos a MC; undefined si no hay montaje. */
  bornes?: [[number, number], [number, number]];
  /** Extremos de la carga puesta en la placa (ya en coordenadas del panel). */
  placa?: { a: Pt; b: Pt } | null;
  /** Cargas dibujadas (1 o 2): con 2 (cabina) cada una ocupa media columna. */
  cargas?: number;
}

/** Extremo de cada pieza de la placa en coordenadas del panel: `origen` = esquina del tablero dentro del panel. */
export const extremosPlaca = (a: string, b: string, origen: Pt) => ({ a: { x: origen.x + coord(a).x, y: origen.y + coord(a).y }, b: { x: origen.x + coord(b).x, y: origen.y + coord(b).y } });

/**
 * Los dos puntos que tocan las puntas para medir `punto`: roja en el extremo de arriba/izquierda (lado +) y negra en el otro.
 * Tensión y continuidad usan los mismos bornes: lo que cambia es el aparato (con tensión, el circuito está vivo; con continuidad, desconectado).
 */
export function puntosMedida(c: CtxPuntas): { rojo: Pt; negro: Pt } {
  if (c.placa) return { rojo: c.placa.a, negro: c.placa.b };
  const hueco = /^t(\d+)$/.exec(c.punto);
  if (c.circuito === "cadena" && hueco && c.cadenaN) {
    const h = huecosCadena(c.cadenaN)[Math.min(c.cadenaN, Math.max(1, Number(hueco[1]))) - 1]!;
    return { rojo: { x: h.x - 24, y: 34 }, negro: { x: h.x + 24, y: 34 } };
  }
  if (c.bornes) { // montaje a la derecha: el divisor mide el nodo medio contra el borne derecho (R2); el resto, de borne a borne
    const [bi, bd] = c.bornes;
    return c.circuito === "divisor" ? { rojo: { x: MC.x, y: MC.y }, negro: { x: MC.x + bd[0], y: MC.y + bd[1] } }
      : { rojo: { x: MC.x + bi[0], y: MC.y + bi[1] }, negro: { x: MC.x + bd[0], y: MC.y + bd[1] } };
  }
  if (c.punto === "pieza") return { rojo: PIEZA.a, negro: PIEZA.b };
  const y = c.cargas === 2 ? (c.punto === "carga2" ? 100 : 52) : 76, m = c.cargas === 2 ? 20 : 32;
  return { rojo: { x: 310, y: y - m }, negro: { x: 310, y: y + m } };
}

const salida = (t: number) => 1 - (1 - t) ** 3;
const entrada = (t: number) => t ** 3;
const atras = (t: number) => { const c = 1.4; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; }; // pasa un poco y vuelve

/** Cable de `a` (jack) a `b` (punta): curva cúbica suave que sale hacia arriba, `n` + 1 puntos. */
export function curva(a: Pt, b: Pt, n = 24): Pt[] {
  const c1 = { x: a.x, y: a.y - 50 }, c2 = { x: b.x, y: b.y + 60 };
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return { x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y };
  });
}

/** Qué parte del cable (0..1) está extendida en esta fase. */
export const extension = (fase: Fase, t: number) => fase === "viaje" ? salida(t) : fase === "contacto" ? 1 : fase === "retirada" ? 1 - entrada(t) : 0;

/** Ángulo de la aguja durante la medición: reposo en el viaje, va a su zona (con un pequeño rebote) en el contacto y se queda ahí en la retirada. null objetivo = sin lectura aún (tiembla). */
export function agujaEn(fase: Fase, t: number, objetivo: number | null, ahora = 0): number {
  if (fase === "viaje") return -60;
  if (objetivo === null) return fase === "contacto" ? Math.sin(ahora / 90) * 50 : -60;
  if (fase === "retirada") return objetivo;
  return -60 + (objetivo + 60) * atras(Math.min(1, t * 1.4));
}

export const COLOR_ROJO = 0xff4a4a, COLOR_NEGRO = 0x202432, CONTORNO = 0xf4f7ff;

type Dib = Pick<Phaser.GameObjects.Graphics, "clear" | "lineStyle" | "strokePoints" | "fillStyle" | "fillCircle" | "strokeCircle" | "lineBetween">;

/** Dibuja las dos puntas en este instante: cable con contorno claro, punta y, al tocar, un destello que se apaga. Devuelve la fase. */
export function dibujarPuntas(g: Dib, o: { transcurrido: number; medirMs: number; reducido: boolean; rojo: Pt; negro: Pt; jackRojo?: Pt; jackNegro?: Pt; destello?: number }): { fase: Fase; t: number } {
  const f = faseEn(o.transcurrido, o.medirMs, o.reducido);
  g.clear();
  if (f.fase === "fin") return f;
  const ext = extension(f.fase, f.t);
  const cables: [Pt, Pt, number][] = [[o.jackRojo ?? JACK.rojo, o.rojo, COLOR_ROJO], [o.jackNegro ?? JACK.negro, o.negro, COLOR_NEGRO]];
  for (const [jack, punta, color] of cables) {
    const tramo = curva(jack, punta), hasta = Math.max(1, Math.round(ext * (tramo.length - 1))), pts = tramo.slice(0, hasta + 1);
    g.lineStyle(5, CONTORNO, 0.95).strokePoints(pts as never);
    g.lineStyle(3, color, 1).strokePoints(pts as never);
    const p = pts.at(-1)!; // punta: bolita con contorno
    g.fillStyle(color, 1).fillCircle(p.x, p.y, 4).lineStyle(1.5, CONTORNO, 1).strokeCircle(p.x, p.y, 4);
    if (f.fase === "contacto" && !o.reducido && f.t < 0.25) { // destello: rayitos y anillo que se apagan en el primer cuarto del contacto
      const s = f.t / 0.25, a = 1 - s;
      g.lineStyle(2, 0xffe27a, a);
      for (let k = 0; k < 6; k++) { const ang = (k * Math.PI) / 3 + 0.4; g.lineBetween(p.x + Math.cos(ang) * 5, p.y + Math.sin(ang) * 5, p.x + Math.cos(ang) * (6 + 9 * s), p.y + Math.sin(ang) * (6 + 9 * s)); }
      g.strokeCircle(p.x, p.y, 6 + 8 * s);
    }
  }
  return f;
}

/** Insignia del resultado junto al dial: círculo del color de la luz con ✓ / ! / ✗. */
export function dibujarInsignia(g: Dib, x: number, y: number, luz: "verde" | "ambar" | "rojo" | "gris", color: number) {
  g.fillStyle(color, 1).fillCircle(x, y, 9).lineStyle(2, 0x0b1020, 1);
  const marca: Record<typeof luz, [number, number][]> = {
    verde: [[-4, 0], [-1, 3], [4, -3]], rojo: [[-3, -3], [3, 3]], ambar: [[0, -4], [0, 1]], gris: [[0, 0], [0, 0]],
  };
  const m = marca[luz];
  g.strokePoints(m.map(([dx, dy]) => ({ x: x + dx, y: y + dy })) as never);
  if (luz === "rojo") g.lineBetween(x + 3, y - 3, x - 3, y + 3);
  if (luz === "ambar") g.fillStyle(0x0b1020, 1).fillCircle(x, y + 4, 1.3);
}
