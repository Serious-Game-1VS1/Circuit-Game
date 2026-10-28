/**
 * Tutorial opcional e interactivo: cada paso pide UNA acción en el Taller y solo avanza cuando el estado
 * del juego la confirma (`avanzar`, sin Phaser; el Taller solo dibuja). Corre sobre una práctica con
 * semilla fija: Cabina a 9 V con 100, 220 y 1000 Ω (1000 frena de más, 100 quema, 220 es la buena).
 * «Saltar» deja la práctica libre; el último paso abre una práctica normal de 5 pods.
 */
import type { Circuito, ModoMedir } from "../../spike/src/protocol";
import type { Falta } from "./pantalla";
import type { Aguja } from "./vista";

/** Semilla fija de la práctica del tutorial: todos ven el mismo primer pod (ver arriba). */
export const SEMILLA_TUTORIAL = 3;
/**
 * Semilla del «Tutorial 2: fallas avanzadas» (nivel 2): pod 1 Reactor con fusible (0,5/1/3 A, se aprende probando), pods 2 y 3 de resistencia,
 * pod 4 Cabina con placa (solución «paralelo») y pod 5 con Radar (LED girado) y Turbina (corte: «Empalmar»).
 */
export const SEMILLA_TUTORIAL_2 = 78;

/** Qué elemento del Taller se resalta en cada paso. */
export type Objetivo = "gaveta" | "probar" | "tension" | "pieza" | "despachar" | "contador" | "pestanas";

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
  /** Solo el tutorial 2: familia de la zona en curso y qué le falta a la placa (null: lista para probar). */
  circuito?: Circuito;
  falta?: Falta;
}

/** Acción que el paso deja hacer en la gaveta o en Probar; lo demás se frena con un aviso. */
export type Accion = { elegir: string } | "probar";

/** `libre`: el paso deja tocar todo; `fin`: último paso con los botones de salida (en el tutorial 2 el último es Despachar, que cierra la práctica). */
export interface Paso { titulo: string; texto: string; objetivo: Objetivo; pide?: Accion; libre?: boolean; fin?: boolean; hecho: (e: EstadoTut) => boolean }

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
    texto: "Probar queda bloqueado unos segundos y el cartel «SE QUEMÓ» tapa el circuito: espera a que el LED se enfríe. Toca Tensión." },
  { titulo: "Mide", objetivo: "pieza", hecho: (e) => e.modo === "tension" && e.medido,
    texto: "Espera a que se vaya el cartel y toca la resistencia: la aguja dice cuánta batería cae en ella: Nada, Parte o Toda." },
  { titulo: "La buena", objetivo: "gaveta", pide: { elegir: "220" }, hecho: (e) => e.elegida === "220",
    texto: "En la resistencia cae una parte de los 9 V. Como 9 V empujan más que 5 V, hacen falta más ohmios: elige 220 Ω." },
  { titulo: "Repara", objetivo: "probar", pide: "probar", hecho: (e) => e.reparada,
    texto: "Pulsa Probar: la aguja debe marcar «correcto»." },
  { titulo: "Despacha", objetivo: "despachar", hecho: (e) => e.despachados > 0,
    texto: "Con todas las zonas reparadas, pulsa Despachar para enviar el pod." },
  { titulo: "¡Listo!", objetivo: "contador", fin: true, hecho: () => false,
    texto: "Cada pod despachado suma. Sigue con el Tutorial 2 (fallas avanzadas) o juega una práctica de 5 pods." },
];

const PASOS2: Paso[] = [
  { titulo: "Fusible grueso", objetivo: "gaveta", pide: { elegir: "3" }, hecho: (e) => e.circuito === "fusible" && e.elegida === "3",
    texto: "Un fusible protege: muy fino se corta solo; muy grueso no protege. No se miden amperios: se prueba. Elige el de 3 A." },
  { titulo: "Prueba", objetivo: "probar", pide: "probar", hecho: (e) => e.quemado,
    texto: "Pulsa Probar. El de 3 A es tan grueso que no corta a tiempo y el calefactor se quema: no protege. Espera a que se enfríe." },
  { titulo: "El justo", objetivo: "gaveta", pide: { elegir: "1" }, hecho: (e) => e.elegida === "1",
    texto: "Baja al justo: el de 1 A no se corta solo y sí protege al calefactor. (El de 0,5 A sería demasiado fino y cortaría solo.)" },
  { titulo: "Prueba", objetivo: "probar", pide: "probar", hecho: (e) => e.reparada, texto: "Pulsa Probar: la aguja debe marcar «correcto»." },
  { titulo: "Despacha", objetivo: "despachar", hecho: (e) => e.despachados > 0, texto: "Pulsa Despachar para enviar el pod." },
  { titulo: "Resistencias", objetivo: "contador", libre: true, hecho: (e) => e.despachados >= 3,
    texto: "Los pods 2 y 3 son de resistencias, como en el Tutorial 1. Resuélvelos y despáchalos." },
  { titulo: "Piezas", objetivo: "gaveta", hecho: (e) => e.circuito === "luces" && e.falta !== "colocar" && e.falta !== "elegir",
    texto: "Esta zona usa una placa. Arrastra cada pieza de la gaveta a su lugar en la placa." },
  { titulo: "Cables", objetivo: "pieza", hecho: (e) => e.circuito === "luces" && e.falta === null,
    texto: "Une los puntos con cables: arrastra de uno a otro. En paralelo cada foco tiene su propio camino a la batería." },
  { titulo: "Prueba", objetivo: "probar", pide: "probar", hecho: (e) => e.reparada,
    texto: "Pulsa Probar. Si no marca «correcto», cambia los cables (quita uno tocándolo)." },
  { titulo: "Despacha", objetivo: "despachar", hecho: (e) => e.despachados >= 4, texto: "Pulsa Despachar para enviar el pod." },
  { titulo: "Girar el LED", objetivo: "gaveta", pide: { elegir: "directa" }, hecho: (e) => e.circuito === "invertido" && e.elegida === "directa",
    texto: "El LED está al revés y no deja pasar la corriente. Elige «Girar el LED»." },
  { titulo: "Prueba", objetivo: "probar", pide: "probar", hecho: (e) => e.reparada, texto: "Pulsa Probar: el LED ya enciende." },
  { titulo: "Otra zona", objetivo: "pestanas", hecho: (e) => e.circuito === "abierto",
    texto: "Este pod tiene otra falla. Toca la pestaña de la Turbina (la que sigue en rojo)." },
  { titulo: "Empalmar", objetivo: "gaveta", pide: { elegir: "empalmar" }, hecho: (e) => e.elegida === "empalmar",
    texto: "El cable está cortado y no pasa corriente. Elige «Empalmar» para unir el corte." },
  { titulo: "Prueba", objetivo: "probar", pide: "probar", hecho: (e) => e.circuito === "abierto" && e.reparada, texto: "Pulsa Probar: el circuito vuelve a cerrarse." },
  { titulo: "Despacha", objetivo: "despachar", hecho: () => false, texto: "Pulsa Despachar: terminas el Tutorial 2." },
];

/** Tiempo mínimo que se ve cada paso aunque su condición ya se cumpla (ms). */
export const MIN_PASO_MS = 700;

export interface Tutorial { pasos: Paso[]; i: number; activo: boolean; parte: 1 | 2; /** Instante (ms) en que se mostró el paso actual. */ desde: number }

export const iniciar = (parte: 1 | 2 = 1): Tutorial => ({ pasos: parte === 2 ? PASOS2 : PASOS, i: 0, activo: true, parte, desde: 0 });
export const actual = (t: Tutorial) => t.pasos[t.i]!;
export const esUltimo = (t: Tutorial) => t.i === t.pasos.length - 1;
/** ¿Muestra los botones de salida («Jugar práctica»)? */
export const esFin = (t: Tutorial) => !!actual(t).fin;
/** Avanza UN paso por llamada si el estado confirma el actual y lleva ≥ MIN_PASO_MS visible (nunca pasa del último): ningún número se salta. */
export function avanzar(t: Tutorial, e: EstadoTut, ahora = t.desde + MIN_PASO_MS): Tutorial {
  return t.i < t.pasos.length - 1 && ahora - t.desde >= MIN_PASO_MS && t.pasos[t.i]!.hecho(e) ? { ...t, i: t.i + 1, desde: ahora } : t;
}
const coincide = (pide: Accion | undefined, a: Accion) => typeof a === "string" ? pide === a : typeof pide === "object" && pide.elegir === a.elegir;
/**
 * null si el paso deja hacer `a`; si no, el aviso. Fuera del tutorial (o tras «Saltar») todo vale.
 * Con `e`, si el paso actual ya se cumple también vale la acción del siguiente (un jugador rápido no espera los 0,7 s de `avanzar`; nunca más de un paso adelante).
 */
export function permite(t: Tutorial | null, a: Accion, e?: EstadoTut): string | null {
  if (!t?.activo || actual(t).libre || coincide(actual(t).pide, a)) return null;
  if (e && t.i < t.pasos.length - 1 && actual(t).hecho(e) && coincide(t.pasos[t.i + 1]!.pide, a)) return null;
  return `Sigue el paso: ${actual(t).titulo}`;
}
export const saltar = (t: Tutorial): Tutorial => ({ ...t, activo: false });
export const textoPaso = (t: Tutorial) => `${t.parte === 2 ? "T2 " : ""}${t.i + 1}/${t.pasos.length} ${actual(t).titulo}`;
