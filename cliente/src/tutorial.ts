/**
 * Tutorial opcional e interactivo: cada paso pide UNA acción en el Taller y solo avanza cuando el estado
 * del juego la confirma (`avanzar`, sin Phaser; el Taller solo dibuja). Corre sobre una práctica con
 * semilla fija: Cabina a 9 V con 100, 220 y 1000 Ω (1000 frena de más, 100 quema, 220 es la buena).
 * «Saltar» deja la práctica libre; el último paso abre una práctica normal de 5 pods.
 */
import type { ModoMedir } from "../../spike/src/protocol";
import type { Aguja } from "./vista";

/** Semilla fija de la práctica del tutorial: todos ven el mismo primer pod (ver arriba). */
export const SEMILLA_TUTORIAL = 3;

/** Qué elemento del Taller se resalta en cada paso. */
export type Objetivo = "gaveta" | "probar" | "tension" | "pieza" | "despachar" | "contador";

/** Lo que el Taller sabe de la zona del tutorial (la única del primer pod). */
export interface EstadoTut {
  elegida?: string;
  modo: ModoMedir | null;
  /** Hay una lectura de tensión en pantalla. */
  medido: boolean;
  aguja?: Aguja | null;
  quemado: boolean;
  reparada: boolean;
  despachados: number;
}

/** Acción que el paso deja hacer en la gaveta o en Probar; lo demás se frena con un aviso. */
export type Accion = { elegir: string } | "probar";

export interface Paso { titulo: string; texto: string; objetivo: Objetivo; pide?: Accion; hecho: (e: EstadoTut) => boolean }

const PASOS: Paso[] = [
  { titulo: "Frena la corriente", objetivo: "gaveta", pide: { elegir: "1000" }, hecho: (e) => e.elegida === "1000",
    texto: "La batería empuja corriente a los LED. La resistencia la frena: más ohmios (Ω), menos corriente. Elige 1000 Ω." },
  { titulo: "Prueba", objetivo: "probar", pide: "probar", hecho: (e) => e.aguja === "poco",
    texto: "1000 Ω «frena mucho». Pulsa Probar y mira la aguja." },
  { titulo: "Frena poco", objetivo: "gaveta", pide: { elegir: "100" }, hecho: (e) => e.elegida === "100",
    texto: "Marcó «poco»: los LED casi no brillan. Ahora elige 100 Ω, que «frena poco»." },
  { titulo: "Demasiada corriente", objetivo: "probar", pide: "probar", hecho: (e) => e.quemado,
    texto: "Un LED se quema si le pasa demasiada corriente. Pulsa Probar y míralo." },
  { titulo: "El multímetro", objetivo: "tension", hecho: (e) => e.modo === "tension",
    texto: "Tras quemar, Probar queda bloqueado unos segundos. Mientras, toca Tensión." },
  { titulo: "Mide", objetivo: "pieza", hecho: (e) => e.modo === "tension" && e.medido,
    texto: "Toca la resistencia. La aguja dice cuánta batería cae en ella: Nada, Parte o Toda." },
  { titulo: "La buena", objetivo: "gaveta", pide: { elegir: "220" }, hecho: (e) => e.elegida === "220",
    texto: "En la resistencia cae una parte de los 9 V. Como 9 V empujan más que 5 V, hacen falta más ohmios: elige 220 Ω." },
  { titulo: "Repara", objetivo: "probar", pide: "probar", hecho: (e) => e.reparada,
    texto: "Pulsa Probar: la aguja debe marcar «correcto»." },
  { titulo: "Despacha", objetivo: "despachar", hecho: (e) => e.despachados > 0,
    texto: "Con todas las zonas reparadas, pulsa Despachar para enviar el pod." },
  { titulo: "¡Listo!", objetivo: "contador", hecho: () => false,
    texto: "Cada pod despachado suma. Ahora juega una práctica de 5 pods." },
];

export interface Tutorial { pasos: Paso[]; i: number; activo: boolean }

export const iniciar = (): Tutorial => ({ pasos: PASOS, i: 0, activo: true });
export const actual = (t: Tutorial) => t.pasos[t.i]!;
export const esUltimo = (t: Tutorial) => t.i === t.pasos.length - 1;
/** Avanza mientras el estado confirme el paso en curso (nunca pasa del último). */
export function avanzar(t: Tutorial, e: EstadoTut): Tutorial {
  let i = t.i;
  while (i < t.pasos.length - 1 && t.pasos[i]!.hecho(e)) i++;
  return i === t.i ? t : { ...t, i };
}
/** null si el paso deja hacer `a`; si no, el aviso. Fuera del tutorial (o tras «Saltar») todo vale. */
export function permite(t: Tutorial | null, a: Accion): string | null {
  if (!t?.activo) return null;
  const pide = actual(t).pide;
  if (typeof a === "string" ? pide === a : typeof pide === "object" && pide.elegir === a.elegir) return null;
  return `Sigue el paso: ${actual(t).titulo}`;
}
export const saltar = (t: Tutorial): Tutorial => ({ ...t, activo: false });
export const textoPaso = (t: Tutorial) => `${t.i + 1}/${t.pasos.length} ${actual(t).titulo}`;
