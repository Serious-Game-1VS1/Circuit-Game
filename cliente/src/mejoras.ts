/**
 * Mejoras entre pods (solo práctica): tras despachar un pod limpio se ofrecen hasta 3 al azar y se elige 1.
 * Lógica pura, sin Phaser (prueba en test/mejoras.test.ts). El árbitro local aplica el enfriamiento y el escudo
 * (Arbiter.ajustar); aquí quedan el catálogo, la oferta, el Doble puntos y el tiempo de medir.
 * PROVISIONAL: nombres, factores y tamaño de la oferta se afinarán al probarlas. Único sitio donde se cambian.
 */
import { MEDIR_MS } from "./multimetro";

export const MEJORAS = {
  enfriamiento: { nombre: "Enfriamiento corto", texto: "Si fallas, esperas la mitad.", tag: "ENFR" },
  multimetro: { nombre: "Multímetro rápido", texto: "Medir tarda la mitad.", tag: "MULT" },
  escudo: { nombre: "Escudo", texto: "Salva tu próxima pieza quemada.", tag: "ESC" },
  doble: { nombre: "Doble puntos", texto: "El siguiente pod vale el doble.", tag: "X2" },
} as const;
export type Mejora = keyof typeof MEJORAS;
export type Activas = Record<Mejora, boolean>;

/** Cuántas mejoras se ofrecen a la vez, y los factores de Enfriamiento corto y Multímetro rápido. */
export const OFERTA = 3, COOLDOWN_CORTO = 0.5, MEDIR_RAPIDO = 0.5;

export const sinMejoras = (): Activas => ({ enfriamiento: false, multimetro: false, escudo: false, doble: false });

/** Hasta OFERTA mejoras distintas al azar entre las que aún no están activas (así ninguna se acumula consigo misma). */
export function ofrecer(a: Activas, rnd: () => number = Math.random): Mejora[] {
  const libres = (Object.keys(MEJORAS) as Mejora[]).filter((m) => !a[m]);
  for (let i = libres.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [libres[i], libres[j]] = [libres[j]!, libres[i]!];
  }
  return libres.slice(0, OFERTA);
}

export const elegir = (a: Activas, m: Mejora): Activas => ({ ...a, [m]: true });

/** Etiquetas cortas de las activas para el HUD ("ENFR X2"). */
export const etiquetas = (a: Activas) => (Object.keys(MEJORAS) as Mejora[]).filter((m) => a[m]).map((m) => MEJORAS[m].tag).join(" ");

/** Lo que dura medir con el multímetro. */
export const medirMs = (a: Activas) => (a.multimetro ? MEDIR_MS * MEDIR_RAPIDO : MEDIR_MS);

/** Doble puntos: duplica los puntos de este pod y se gasta. `extra` es lo que se suma al XP final (el árbitro solo cuenta 1×). */
export const conDoble = (a: Activas, pts: number) => ({ a: { ...a, doble: false }, pts: a.doble ? pts * 2 : pts, extra: a.doble ? pts : 0 });
