/**
 * Mini-tutoriales interactivos, uno por mecánica (~1 min): cada paso pide UNA acción en el Taller y solo avanza cuando el
 * estado del juego la confirma (`avanzar`, sin Phaser; el Taller solo dibuja). Cada uno corre sobre una práctica de UN pod
 * (semilla, nivel y pod fijos; el árbitro genera el pod con `generar(semilla, nivel)[pod]`, y ese pod tiene una sola zona de la familia).
 * «Saltar» vuelve al menú; el último paso (`fin`, ya despachado el pod) ofrece el siguiente tutorial, la práctica y el menú.
 * Si cambia familias.json o el generador, las semillas se revisan con el test (tutorial.test.ts).
 */
import type { Circuito, ModoMedir } from "../../spike/src/protocol";
import type { Falta } from "./pantalla";
import type { Aguja } from "./vista";

/** Qué elemento del Taller se resalta en cada paso. */
export type Objetivo = "gaveta" | "tension" | "pieza" | "carga" | "contador" | "pestanas" | "multimetro" | "check";

/** Lo que el Taller sabe de la zona del tutorial (la única del pod). */
export interface EstadoTut {
  elegida?: string;
  modo: ModoMedir | null;
  /** Hay una lectura de tensión en pantalla. */
  medido: boolean;
  aguja?: Aguja | null;
  quemado: boolean;
  reparada: boolean;
  despachados: number;
  /** Familia de la zona en curso y qué le falta a la placa (null: lista para probar). */
  circuito?: Circuito;
  falta?: Falta;
  /** Veredictos de Probar y lecturas del multímetro recibidos en total; `hecho` los ve RELATIVOS al paso (ver `avanzar`). */
  pruebas: number;
  medidas: number;
}

/** Acción que el paso deja hacer: arrastrar una pieza al hueco (soltar = probar) o CHECK (probar la placa / despachar); lo demás se frena con un aviso. */
export type Accion = { arrastrar: string } | "check";

/** `libre`: el paso deja tocar todo; `fin`: último paso con los botones de salida . */
export interface Paso { titulo: string; texto: string; objetivo: Objetivo; pide?: Accion; libre?: boolean; /** Dibuja el esquema «paralelo» junto al texto. */ esquema?: boolean; fin?: boolean; hecho: (e: EstadoTut) => boolean }

/** Datos de cada mini-tutorial: ids de piezas de la gaveta y estados que el Taller confirma. */
const elige = (x: string) => (e: EstadoTut) => e.elegida === x;
/** Flujo único: se arrastra la pieza al hueco rojo (soltar = probar), el multímetro da la luz y CHECK reemplaza a Despachar. */
const arrastra = (x: string): Accion => ({ arrastrar: x });
const SIN_FALLA = (e: EstadoTut) => e.reparada;
const QUEMADO = (e: EstadoTut) => e.quemado;
const DESPACHADO = (e: EstadoTut) => e.despachados > 0;
const MIDE_TENSION = (e: EstadoTut) => e.modo === "tension" && e.medido;
const MIDE_CONT = (e: EstadoTut) => e.modo === "continuidad" && e.medidas > 0;
/** Placa: piezas ya colocadas / cables completos. */
const PIEZAS_PUESTAS = (e: EstadoTut) => e.falta === "cablear" || e.falta === null;
const CABLEADA = (e: EstadoTut) => e.falta === null;

const CHECK: Paso = { titulo: "Check", objetivo: "check", pide: "check", hecho: DESPACHADO, texto: "Multímetro en verde: pulsa CHECK para pasar al siguiente." };
const LISTO = (texto: string): Paso => ({ titulo: "¡Listo!", objetivo: "contador", libre: true, fin: true, hecho: () => false, texto });
const MODO_TENSION = (texto: string): Paso => ({ titulo: "Tensión", objetivo: "tension", hecho: (e) => e.modo === "tension", texto });
const MODO_CONT = (texto: string): Paso => ({ titulo: "Continuidad", objetivo: "tension", hecho: (e) => e.modo === "continuidad", texto });

export interface Mecanica {
  id: string;
  /** Nombre de la tarjeta (≤ 12 caracteres). */
  nombre: string;
  /** Qué aprende el jugador, en una línea. */
  ensena: string;
  nivel: 1 | 2;
  semilla: number;
  /** Índice (0-4) del pod de `generar(semilla, nivel)` que se practica: tiene UNA sola zona, de la familia `circuito`. */
  pod: number;
  circuito: Circuito;
  pasos: Paso[];
}

export const MECANICAS: Mecanica[] = [
  { id: "resistencia", nombre: "Resistencia", ensena: "La resistencia frena la corriente: ni mucha ni poca.", nivel: 1, semilla: 11, pod: 0, circuito: "led", pasos: [
    { titulo: "Falta la resistencia", objetivo: "gaveta", pide: arrastra("1000"), hecho: elige("1000"), texto: "Hueco rojo = falta resistencia. Arrastra 1000 Ω: soltar prueba." },
    { titulo: "Multímetro", objetivo: "multimetro", hecho: (e) => e.aguja === "poco", texto: "Multímetro encendido: ámbar = frena mucho. Sin verde no hay check." },
    { titulo: "Frena poco", objetivo: "gaveta", pide: arrastra("100"), hecho: QUEMADO, texto: "Arrastra 100 Ω (frena poco). Si pide esperar, espera unos segundos." },
    { titulo: "Rojo", objetivo: "multimetro", hecho: QUEMADO, texto: "Rojo: demasiada corriente, el LED se quema. Frena a medias." },
    { titulo: "La buena", objetivo: "gaveta", pide: arrastra("470"), hecho: SIN_FALLA, texto: "Arrastra 470 Ω: ni mucho ni poco. Espera si hace falta." },
    CHECK,
    LISTO("El valor justo depende de la batería y del LED."),
  ] },
  { id: "multimetro", nombre: "Multímetro", ensena: "Medir tensión y continuidad sin gastar intentos.", nivel: 1, semilla: 12, pod: 0, circuito: "led", pasos: [
    { titulo: "Arrastra una", objetivo: "gaveta", pide: arrastra("1000"), hecho: elige("1000"), texto: "Arrastra 1000 Ω al hueco: soltar prueba y el multímetro da luz." },
    MODO_TENSION("El multímetro también mide sin probar. Toca Tensión."),
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca la pieza del centro: la aguja marca cuánta batería cae en ella." },
    { titulo: "Continuidad", objetivo: "tension", hecho: MIDE_CONT, texto: "Toca Continuidad y luego la pieza: dice si está rota o sana." },
    { titulo: "Según la lectura", objetivo: "gaveta", pide: arrastra("470"), hecho: SIN_FALLA, texto: "No está rota, pero 1000 Ω frena de más. Arrastra 470 Ω: verde." },
    CHECK,
    LISTO("Medir no gasta intentos: úsalo cuando dudes de una pieza."),
  ] },
  { id: "fusible", nombre: "Fusible", ensena: "El fusible justo aguanta lo normal y corta la falla.", nivel: 2, semilla: 2, pod: 1, circuito: "fusible", pasos: [
    { titulo: "Fusible grueso", objetivo: "gaveta", pide: arrastra("3"), hecho: QUEMADO, texto: "Prueba: arrastra el de 3 A. En falla pasan 3 A y se quema." },
    MODO_TENSION("Toca Tensión: el multímetro mide el fusible sin gastar intentos."),
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca el fusible: casi no cae tensión, es un hilo que deja pasar todo." },
    { titulo: "El justo", objetivo: "gaveta", pide: arrastra("1"), hecho: SIN_FALLA, texto: "Arrastra 1 A: aguanta 0,7 A normales y corta antes de 3 A." },
    CHECK,
    LISTO("Un fusible debe aguantar el consumo normal y cortar la falla."),
  ] },
  { id: "invertido", nombre: "LED girado", ensena: "El LED solo deja pasar la corriente en un sentido.", nivel: 2, semilla: 52, pod: 3, circuito: "invertido", pasos: [
    { titulo: "Un solo sentido", objetivo: "gaveta", pide: arrastra("inversa"), hecho: (e) => e.pruebas > 0, texto: "El LED pasa corriente en un sentido. Arrastra «Dejar el LED»." },
    MODO_CONT("Toca Continuidad: dice si la pieza deja pasar la corriente."),
    { titulo: "Mide", objetivo: "carga", hecho: MIDE_CONT, texto: "Toca el LED, a la derecha: «No pasa». Su polaridad lo bloquea." },
    { titulo: "Girar el LED", objetivo: "gaveta", pide: arrastra("directa"), hecho: SIN_FALLA, texto: "Un LED solo conduce de + a −. Arrastra «Girar el LED» para corregirlo." },
    CHECK,
    LISTO("Si un LED no enciende, revisa primero hacia dónde mira."),
  ] },
  { id: "abierto", nombre: "Cable roto", ensena: "Un corte en el cable se encuentra con Continuidad.", nivel: 2, semilla: 2, pod: 3, circuito: "abierto", pasos: [
    { titulo: "Mira el cable", objetivo: "gaveta", pide: arrastra("dejar"), hecho: elige("dejar"), texto: "Arrastra «Dejar igual»: así medimos el circuito con el corte." },
    MODO_CONT("Toca Continuidad: avisa si la corriente puede cruzar la pieza."),
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_CONT, texto: "Toca la pieza del centro: «No pasa» = el cable está cortado." },
    { titulo: "Empalmar", objetivo: "gaveta", pide: arrastra("empalmar"), hecho: SIN_FALLA, texto: "El cable está cortado. Arrastra «Empalmar» para cerrar el camino." },
    CHECK,
    LISTO("Un circuito abierto no deja pasar corriente: mídelo con Continuidad."),
  ] },
  { id: "placa", nombre: "Placa", ensena: "Luces en paralelo: si una falla, la otra sigue.", nivel: 2, semilla: 47, pod: 3, circuito: "luces", pasos: [
    { titulo: "Piezas", objetivo: "gaveta", hecho: PIEZAS_PUESTAS, texto: "Esta zona usa una placa: arrastra cada pieza a su lugar." },
    { titulo: "Cables", objetivo: "pieza", esquema: true, hecho: CABLEADA, texto: "Une arriba de cada luz al carril +, abajo al carril −." },
    MODO_TENSION("Con la placa lista, toca Tensión: el multímetro mide antes de probar."),
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca una luz: la aguja marca cuánta batería cae en ella." },
    { titulo: "Prueba", objetivo: "check", pide: "check", hecho: SIN_FALLA, texto: "Pulsa CHECK: prueba y el multímetro da la luz. Verde = bien." },
    { ...CHECK, objetivo: "check", esquema: true, texto: "En paralelo una luz que falla no apaga la otra. CHECK despacha." },
    LISTO("En paralelo cada luz tiene su propio camino entre + y −."),
  ] },
  { id: "turbina", nombre: "Interruptor", ensena: "El interruptor va en serie con el motor.", nivel: 2, semilla: 10, pod: 3, circuito: "interruptor", pasos: [
    { titulo: "Piezas", objetivo: "gaveta", hecho: PIEZAS_PUESTAS, texto: "Arrastra el motor y el interruptor a su lugar en la placa." },
    { titulo: "Cables", objetivo: "pieza", hecho: CABLEADA, texto: "Une carril +, interruptor, motor y carril − en fila (serie)." },
    { titulo: "Prueba", objetivo: "check", pide: "check", hecho: SIN_FALLA, texto: "Pulsa CHECK: el motor gira y el multímetro da verde." },
    { ...CHECK, objetivo: "check", texto: "En paralelo al motor haría un corto. CHECK despacha." },
    LISTO("El interruptor va en serie con lo que enciende o apaga."),
  ] },
  { id: "combinar", nombre: "Combinar", ensena: "Dos resistencias en serie suman; en paralelo se reparten.", nivel: 2, semilla: 264, pod: 4, circuito: "combinar", pasos: [
    { titulo: "Una sola", objetivo: "gaveta", pide: arrastra("una"), hecho: QUEMADO, texto: "Dos resistencias de 220 Ω. Arrastra «Una sola»: se quema." },
    MODO_CONT("Toca Continuidad: además de pasar o no, lee los ohmios de la pieza."),
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_CONT, texto: "Toca la pieza: lee 220 Ω. Falta frenar más." },
    { titulo: "En paralelo", objetivo: "gaveta", pide: arrastra("paralelo"), hecho: (e) => e.elegida === "paralelo" && e.quemado && e.pruebas > 0, texto: "En paralelo quedan 110 Ω: frena aún menos. Arrastra «En paralelo»." },
    { titulo: "En serie", objetivo: "gaveta", pide: arrastra("serie"), hecho: SIN_FALLA, texto: "En serie se suman: 440 Ω, frena más. Arrastra «En serie»: verde." },
    CHECK,
    LISTO("Serie suma ohmios; paralelo los reparte y baja el total."),
  ] },
  { id: "divisor", nombre: "Divisor", ensena: "Dos resistencias en fila se reparten la tensión.", nivel: 2, semilla: 240, pod: 3, circuito: "divisor", pasos: [
    { titulo: "R2 = 470 Ω", objetivo: "gaveta", pide: arrastra("470"), hecho: elige("470"), texto: "R1 (220 Ω) viene impresa. Arrastra R2 = 470 Ω al hueco." },
    MODO_TENSION("Toca Tensión para medir el nodo del medio, entre R1 y R2."),
    { titulo: "Mide R2", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca R2: la aguja marca la tensión que queda en R2." },
    { titulo: "R2 = R1", objetivo: "gaveta", pide: arrastra("220"), hecho: SIN_FALLA, texto: "Con R2 igual a R1 cada una toma la mitad: 4,5 V. Arrastra R2 = 220 Ω." },
    CHECK,
    LISTO("El divisor reparte la tensión según las dos resistencias."),
  ] },
  { id: "protegido", nombre: "Protegido", ensena: "Diodo, LED y resistencia en serie se reparten la batería.", nivel: 2, semilla: 340, pod: 3, circuito: "protegido", pasos: [
    { titulo: "Poca R", objetivo: "gaveta", pide: arrastra("100"), hecho: QUEMADO, texto: "Arrastra la más pequeña, 100 Ω: pasa de más y se quema." },
    MODO_TENSION("Toca Tensión: la batería se reparte entre diodo, LED y R."),
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca una pieza: cada una se queda con una parte de la tensión." },
    { titulo: "El diodo", objetivo: "gaveta", pide: arrastra("220"), hecho: SIN_FALLA, texto: "Diodo 0,7 V y LED 2 V: a R le quedan 3,3 V. Arrastra 220 Ω." },
    CHECK,
    LISTO("Cada pieza en serie se queda con su parte de la batería."),
  ] },
];

export const mecanica = (id: string): Mecanica | undefined => MECANICAS.find((m) => m.id === id);
/** Id del tutorial que sigue a `id` en MECANICAS; null si es el último (o no existe). */
export const siguiente = (id: string): string | null => {
  const k = MECANICAS.findIndex((m) => m.id === id);
  return k < 0 ? null : MECANICAS[k + 1]?.id ?? null;
};

/** Tiempo mínimo que se ve cada paso aunque su condición ya se cumpla (ms). */
export const MIN_PASO_MS = 1400;

export interface Tutorial { pasos: Paso[]; i: number; activo: boolean; id: string; /** Instante (ms) en que se mostró el paso actual. */ desde: number;
  /** Contadores `pruebas`/`medidas` cuando se cumplió el paso anterior: lo posterior es un evento nuevo. */ p0: number; m0: number;
  /** Contadores en el instante en que el paso actual se cumplió (se anota en `avanzar`, que lo muta). */ listo: { p: number; m: number } | null }

export const iniciar = (id: string): Tutorial => {
  const m = mecanica(id);
  if (!m) throw new Error(`tutorial desconocido: ${id}`);
  return { pasos: m.pasos, i: 0, activo: true, id, desde: 0, p0: 0, m0: 0, listo: null };
};
export const actual = (t: Tutorial) => t.pasos[t.i]!;
export const esUltimo = (t: Tutorial) => t.i === t.pasos.length - 1;
/** ¿Muestra los botones de salida («Jugar práctica»)? */
export const esFin = (t: Tutorial) => !!actual(t).fin;
/** Avanza UN paso por llamada si el estado confirma el actual y lleva ≥ MIN_PASO_MS (1,4 s) visible (nunca pasa del último): ningún número se salta. */
export function avanzar(t: Tutorial, e: EstadoTut, ahora = t.desde + MIN_PASO_MS): Tutorial {
  const hecho = cumple(t, e);
  t.listo = hecho ? t.listo ?? { p: e.pruebas, m: e.medidas } : null; // mutación a propósito: conserva la identidad de `t` cuando no avanza
  return t.i < t.pasos.length - 1 && ahora - t.desde >= MIN_PASO_MS && hecho ? { ...t, i: t.i + 1, desde: ahora, p0: t.listo!.p, m0: t.listo!.m, listo: null } : t;
}
/**
 * ¿El juego ya confirma el paso actual? Una zona reparada (o un pod despachado) implica hechos todos los pasos previos a Despachar:
 * un jugador rápido que elige y prueba casi a la vez no deja el tutorial clavado en un paso cuyo evento ya pasó.
 */
const cumple = (t: Tutorial, e: EstadoTut) => {
  const p = actual(t);
  return ((e.reparada || e.despachados > 0) && !p.fin && p.pide !== "check") || p.hecho(rel(t, e));
};
/** El estado que ve `hecho`: pruebas y medidas contadas desde que se cumplió el paso anterior (una acción hecha antes no avanza este paso). */
const rel = (t: Tutorial, e: EstadoTut): EstadoTut => ({ ...e, pruebas: e.pruebas - t.p0, medidas: e.medidas - t.m0 });
const coincide = (pide: Accion | undefined, a: Accion) => JSON.stringify(pide) === JSON.stringify(a);
/**
 * null si el paso deja hacer `a`; si no, el aviso. Fuera del tutorial (o tras «Saltar») todo vale.
 * Con `e`, si el paso actual ya se cumple también vale la acción del siguiente (un jugador rápido no espera los 1,4 s de `avanzar`; nunca más de un paso adelante).
 */
export function permite(t: Tutorial | null, a: Accion, e?: EstadoTut): string | null {
  if (!t?.activo || actual(t).libre || coincide(actual(t).pide, a)) return null;
  if (e && t.i < t.pasos.length - 1 && cumple(t, e) && coincide(t.pasos[t.i + 1]!.pide, a)) return null;
  return `Ahora toca: ${actual(t).titulo}`;
}
export const saltar = (t: Tutorial): Tutorial => ({ ...t, activo: false });
export const textoPaso = (t: Tutorial) => `${(mecanica(t.id)?.nombre ?? t.id).toUpperCase()} ${t.i + 1}/${t.pasos.length} ${actual(t).titulo}`;
