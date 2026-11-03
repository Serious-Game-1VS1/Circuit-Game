/**
 * Mini-tutoriales interactivos, uno por mecánica (~1 min): cada paso pide UNA acción en el Taller y solo avanza cuando el
 * estado del juego la confirma (`avanzar`, sin Phaser; el Taller solo dibuja). Cada uno corre sobre una práctica de UN pod
 * (semilla, nivel y pod fijos; el árbitro genera el pod con `generar(semilla, nivel)[pod]`, y ese pod tiene una sola zona de la familia).
 * «Saltar» vuelve al menú; el último paso (`fin`, ya despachado el pod) ofrece el siguiente tutorial, la práctica y el menú.
 * Si cambia familias.json o el generador, las semillas se revisan con el test (tutorial.test.ts).
 */
import type { Circuito, ModoMedir } from "../../spike/src/protocol";
import type { Falta } from "./pantalla";
import { esResistencia, type Aguja } from "./vista";

/** Qué elemento del Taller se resalta en cada paso. */
export type Objetivo = "gaveta" | "tension" | "pieza" | "carga" | "contador" | "pestanas" | "multimetro" | "check" | "cadena";

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
  /** Cadena: ya midió una pieza que NO pasa (la muerta quedó marcada en rojo). */
  localizada?: boolean;
  /** Placa experta: ids de las piezas puestas en la placa y cuántos cables hay. */
  piezas?: string[];
  cables?: number;
}

/** Acción que el paso deja hacer: arrastrar una pieza al hueco (solo la coloca) o CHECK (validar / despachar); lo demás se frena con un aviso. */
export type Accion = { arrastrar: string } | "check";

/** `libre`: el paso deja tocar todo; `fin`: último paso con los botones de salida . */
export interface Paso { titulo: string; texto: string; objetivo: Objetivo; pide?: Accion; libre?: boolean; /** Dibuja el esquema «paralelo» junto al texto. */ esquema?: boolean; fin?: boolean; hecho: (e: EstadoTut) => boolean }

/** Datos de cada mini-tutorial: ids de piezas de la gaveta y estados que el Taller confirma. */
const elige = (x: string) => (e: EstadoTut) => e.elegida === x;
/** Flujo único: se arrastra la pieza al hueco rojo (solo la coloca), se puede medir gratis y CHECK valida (luz) y despacha. */
const arrastra = (x: string): Accion => ({ arrastrar: x });
const SIN_FALLA = (e: EstadoTut) => e.reparada;
const QUEMADO = (e: EstadoTut) => e.quemado;
const DESPACHADO = (e: EstadoTut) => e.despachados > 0;
const MIDE_TENSION = (e: EstadoTut) => e.modo === "tension" && e.medido;
const MIDE_CONT = (e: EstadoTut) => e.modo === "continuidad" && e.medidas > 0;
/** Placa: piezas ya colocadas / cables completos. */
const PIEZAS_PUESTAS = (e: EstadoTut) => e.falta === "cablear" || e.falta === null;
const CABLEADA = (e: EstadoTut) => e.falta === null;

/** Validar: CHECK manda la pieza o el montaje puesto al árbitro (único paso con luz, penalización y espera). Vale también si ya quedó verde. */
const VALIDA = (texto: string, hecho: (e: EstadoTut) => boolean): Paso => ({ titulo: "Valida", objetivo: "check", pide: "check", hecho: (e) => hecho(e) || e.reparada, texto });
const CHECK: Paso = { titulo: "Check", objetivo: "check", pide: "check", hecho: DESPACHADO, texto: "Multímetro en verde: pulsa CHECK para pasar al siguiente." };
const LISTO = (texto: string): Paso => ({ titulo: "¡Listo!", objetivo: "contador", libre: true, fin: true, hecho: () => false, texto });
const MODO_TENSION = (texto: string): Paso => ({ titulo: "Tensión", objetivo: "tension", hecho: (e) => e.modo === "tension", texto });
const MODO_CONT = (texto: string): Paso => ({ titulo: "Continuidad", objetivo: "tension", hecho: (e) => e.modo === "continuidad", texto });
/** Continuidad se mide sin tensión y con la pieza fuera: quitarla (tocarla o arrastrarla) es parte del flujo. */
const QUITA: Paso = { titulo: "Quita la pieza", objetivo: "tension", hecho: (e) => e.modo === "continuidad" && !e.elegida, texto: "Toca Continuidad y quita la pieza (tócala): se mide sin tensión." };

export interface Mecanica {
  id: string;
  /** Nombre de la tarjeta (≤ 12 caracteres). */
  nombre: string;
  /** Qué aprende el jugador, en una línea. */
  ensena: string;
  nivel: 1 | 2 | 3;
  semilla: number;
  /** Índice (0-4) del pod de `generar(semilla, nivel)` que se practica: tiene UNA sola zona, de la familia `circuito`. */
  pod: number;
  circuito: Circuito;
  pasos: Paso[];
}

export const MECANICAS: Mecanica[] = [
  { id: "resistencia", nombre: "Resistencia", ensena: "La resistencia frena la corriente: ni mucha ni poca.", nivel: 1, semilla: 27, pod: 0, circuito: "led", pasos: [
    { titulo: "Falta la resistencia", objetivo: "gaveta", pide: arrastra("1000"), hecho: elige("1000"), texto: "Hueco rojo = falta resistencia. Arrastra 1000 Ω: solo la coloca." },
    VALIDA("Pulsa CHECK para validar: ámbar = frena de más. Sin verde no pasas.", (e) => e.aguja === "poco"),
    { titulo: "Frena poco", objetivo: "gaveta", pide: arrastra("100"), hecho: elige("100"), texto: "Cambia a 100 Ω (frena poco). Cambiar de pieza es gratis." },
    VALIDA("Pulsa CHECK: rojo = demasiada corriente, el LED se quema. Espera.", QUEMADO),
    { titulo: "La buena", objetivo: "gaveta", pide: arrastra("470"), hecho: elige("470"), texto: "Arrastra 470 Ω: ni mucho ni poco. Espera si hace falta." },
    VALIDA("Pulsa CHECK: verde = bien. El valor justo depende de la batería.", SIN_FALLA),
    CHECK,
    LISTO("El valor justo depende de la batería y del LED."),
  ] },
  { id: "multimetro", nombre: "Multímetro", ensena: "Medir tensión y continuidad sin gastar intentos.", nivel: 1, semilla: 18, pod: 0, circuito: "led", pasos: [
    { titulo: "Arrastra una", objetivo: "gaveta", pide: arrastra("1000"), hecho: elige("1000"), texto: "Arrastra 1000 Ω al hueco: solo la coloca, aún no cuenta." },
    MODO_TENSION("Antes de validar puedes medir gratis. Toca Tensión."),
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca la pieza del centro: la aguja marca cuánta batería cae en ella." },
    QUITA,
    { titulo: "Mide el hueco", objetivo: "pieza", hecho: MIDE_CONT, texto: "Toca el hueco vacío: sin pieza no pasa. Así se mide, sin tensión." },
    { titulo: "Según la lectura", objetivo: "gaveta", pide: arrastra("470"), hecho: elige("470"), texto: "1000 Ω frena de más. Arrastra 470 Ω." },
    VALIDA("Pulsa CHECK para validar: verde = bien.", SIN_FALLA),
    CHECK,
    LISTO("Medir no gasta intentos: úsalo cuando dudes de una pieza."),
  ] },
  { id: "fusible", nombre: "Fusible", ensena: "El fusible justo aguanta lo normal y corta la falla.", nivel: 2, semilla: 2, pod: 1, circuito: "fusible", pasos: [
    { titulo: "Fusible grueso", objetivo: "gaveta", pide: arrastra("3"), hecho: elige("3"), texto: "Arrastra el de 3 A al hueco: solo lo coloca." },
    MODO_TENSION("Mide antes de validar, gratis. Toca Tensión."),
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca el fusible: casi no cae tensión, es un hilo que deja pasar todo." },
    VALIDA("Pulsa CHECK: la falla pasa 2,5 A y el 3 A no corta. Espera.", QUEMADO),
    { titulo: "El justo", objetivo: "gaveta", pide: arrastra("1"), hecho: elige("1"), texto: "Arrastra 1 A: aguanta 0,7 A normales y corta los 2,5 A de la falla." },
    VALIDA("Pulsa CHECK para validar: verde = bien.", SIN_FALLA),
    CHECK,
    LISTO("Un fusible debe aguantar el consumo normal y cortar la falla."),
  ] },
  { id: "cadena", nombre: "Pieza muerta", ensena: "Con Continuidad se halla la pieza abierta de una cadena y se cambia por un repuesto.", nivel: 2, semilla: 1619, pod: 3, circuito: "cadena", pasos: [
    MODO_CONT("Una pieza está muerta por dentro. Toca Continuidad."),
    { titulo: "Mide una", objetivo: "cadena", hecho: MIDE_CONT, texto: "Toca una pieza: «Pasa» = sana. Sin repuesto en ese hueco." },
    { titulo: "Halla la muerta", objetivo: "cadena", hecho: (e) => !!e.localizada, texto: "Sigue midiendo: la que dice «No pasa» queda en rojo con «?»." },
    { titulo: "Cambia la pieza", objetivo: "cadena", pide: arrastra("r470"), hecho: (e) => !!e.elegida?.endsWith(":r470"), texto: "Conserva su valor impreso: 470 Ω. Arrastra el mismo repuesto al hueco." },
    VALIDA("Pulsa CHECK para validar: verde = bien.", SIN_FALLA),
    CHECK,
    LISTO("Mide cada tramo con Continuidad y cambia solo la pieza que no pasa."),
  ] },
  { id: "placa", nombre: "Placa", ensena: "Luces en paralelo: si una falla, la otra sigue.", nivel: 2, semilla: 28, pod: 3, circuito: "luces", pasos: [
    { titulo: "Piezas", objetivo: "gaveta", hecho: PIEZAS_PUESTAS, texto: "Esta zona usa una placa: arrastra cada pieza a su lugar." },
    { titulo: "Cables", objetivo: "pieza", esquema: true, hecho: CABLEADA, texto: "Une arriba de cada luz al carril +, abajo al carril −." },
    MODO_TENSION("Con la placa lista, toca Tensión: el multímetro mide antes de probar."),
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca una luz: la aguja marca cuánta batería cae en ella." },
    { titulo: "Prueba", objetivo: "check", pide: "check", hecho: SIN_FALLA, texto: "Pulsa CHECK para validar: el multímetro da la luz. Verde = bien." },
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
  { id: "combinar", nombre: "Combinar", ensena: "Dos resistencias en serie suman; en paralelo se reparten.", nivel: 2, semilla: 136, pod: 3, circuito: "combinar", pasos: [
    { titulo: "Una sola", objetivo: "gaveta", pide: arrastra("una"), hecho: elige("una"), texto: "Dos resistencias de 220 Ω. Arrastra «Una sola»: aún no cuenta." },
    VALIDA("Pulsa CHECK: con una sola el LED se quema. Espera.", QUEMADO),
    QUITA,
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_CONT, texto: "Toca el hueco: lee la pieza suelta, 220 Ω. Falta frenar más." },
    { titulo: "En paralelo", objetivo: "gaveta", pide: arrastra("paralelo"), hecho: elige("paralelo"), texto: "En paralelo bajan a 110 Ω: frena menos. Arrastra «En paralelo»." },
    { titulo: "En serie", objetivo: "gaveta", pide: arrastra("serie"), hecho: elige("serie"), texto: "En serie se suman: 440 Ω, frena más. Arrastra «En serie»." },
    VALIDA("Pulsa CHECK para validar: verde = bien.", SIN_FALLA),
    CHECK,
    LISTO("Serie suma ohmios; paralelo los reparte y baja el total."),
  ] },
  { id: "divisor", nombre: "Divisor", ensena: "Dos resistencias en fila se reparten la tensión.", nivel: 2, semilla: 487, pod: 3, circuito: "divisor", pasos: [
    { titulo: "R2 = 470 Ω", objetivo: "gaveta", pide: arrastra("470"), hecho: elige("470"), texto: "R1 (220 Ω) viene impresa. Arrastra R2 = 470 Ω al hueco." },
    MODO_TENSION("Toca Tensión para medir el nodo del medio, entre R1 y R2."),
    { titulo: "Mide R2", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca R2: la aguja marca la tensión que queda en R2." },
    { titulo: "R2 = R1", objetivo: "gaveta", pide: arrastra("220"), hecho: elige("220"), texto: "Con R2 igual a R1 cada una toma la mitad: 4,5 V. Arrastra R2 = 220 Ω." },
    VALIDA("Pulsa CHECK para validar: verde = bien.", SIN_FALLA),
    CHECK,
    LISTO("El divisor reparte la tensión según las dos resistencias."),
  ] },
  { id: "protegido", nombre: "Protegido", ensena: "Diodo, LED y resistencia en serie se reparten la batería.", nivel: 2, semilla: 151, pod: 3, circuito: "protegido", pasos: [
    { titulo: "Poca R", objetivo: "gaveta", pide: arrastra("100"), hecho: elige("100"), texto: "Arrastra la más pequeña, 100 Ω: solo la coloca." },
    VALIDA("Pulsa CHECK: pasa de más y el LED se quema. Espera.", QUEMADO),
    MODO_TENSION("Toca Tensión: la batería se reparte entre diodo, LED y R."),
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca una pieza: cada una se queda con una parte de la tensión." },
    { titulo: "El diodo", objetivo: "gaveta", pide: arrastra("220"), hecho: elige("220"), texto: "Diodo 0,7 V y LED 2 V: a R le quedan 3,3 V. Arrastra 220 Ω." },
    VALIDA("Pulsa CHECK para validar: verde = bien.", SIN_FALLA),
    CHECK,
    LISTO("Cada pieza en serie se queda con su parte de la batería."),
  ] },
  // Nivel 3 «Experto»: las piezas no llevan texto de valor; se reconocen por sus bandas y por su aspecto.
  { id: "colores", nombre: "Colores", ensena: "Leer las 4 bandas de una resistencia: cifra, cifra, ceros y tolerancia.", nivel: 3, semilla: 16, pod: 2, circuito: "led", pasos: [
    { titulo: "Marrón-negro-rojo", objetivo: "gaveta", pide: arrastra("1000"), hecho: elige("1000"), texto: "Bandas 1 y 2: cifras. Banda 3: ceros. 1-0-00 = 1 kΩ. Arrástrala." },
    VALIDA("Pulsa CHECK: ámbar. 1 kΩ frena de más para este LED.", (e) => e.aguja === "poco"),
    { titulo: "Marrón-negro-marrón", objetivo: "gaveta", pide: arrastra("100"), hecho: elige("100"), texto: "Marrón 1, negro 0, un cero: 10 y 0 = 100 Ω. Arrastra esa." },
    VALIDA("Pulsa CHECK: rojo, 100 Ω frena poco y el LED se quema. Espera.", QUEMADO),
    { titulo: "Amarillo-violeta", objetivo: "gaveta", pide: arrastra("470"), hecho: elige("470"), texto: "Amarillo 4, violeta 7, marrón 1 cero = 470 Ω. Es la justa." },
    VALIDA("Pulsa CHECK para validar: verde = bien.", SIN_FALLA),
    CHECK,
    LISTO("La banda dorada es la tolerancia (+/-5 %). Tabla en Aprender."),
  ] },
  { id: "fusibles", nombre: "Fusibles", ensena: "Elegir el fusible por su tamaño, marca (F rápido, T lento) y color.", nivel: 3, semilla: 27, pod: 2, circuito: "fusible3", pasos: [
    { titulo: "Cuchilla marrón", objetivo: "gaveta", pide: arrastra("car:7.5"), hecho: elige("car:7.5"), texto: "Cuchilla: el color son los amperios. Marrón = 7,5 A. Arrástrala." },
    VALIDA("Pulsa CHECK: la falla pasa 2,3 A y el 7,5 A no corta. Espera.", QUEMADO),
    { titulo: "Vidrio rápido", objetivo: "gaveta", pide: arrastra("5x20F:2"), hecho: elige("5x20F:2"), texto: "Vidrio 5x20, «F» = rápido. F2 son 2 A. Arrástrala." },
    VALIDA("Pulsa CHECK: ámbar. Con motor, la F se funde al arrancar.", (e) => e.aguja === "poco"),
    { titulo: "Vidrio lento", objetivo: "gaveta", pide: arrastra("5x20T:2"), hecho: elige("5x20T:2"), texto: "«T» = lento: aguanta el arranque. T2 = 2 A, justo sobre 1,8 A." },
    VALIDA("Pulsa CHECK para validar: verde = bien.", SIN_FALLA),
    CHECK,
    LISTO("Vidrio 6,3x32 es el grande. Colores de cuchilla: tabla en Aprender."),
  ] },
  // Placa experta (placa3): «Enciende el LED con el interruptor» a 5 V; gavetas con diodo, capacitor y una resistencia de más (sobrantes).
  { id: "placaExperta", nombre: "Placa exp.", ensena: "Resolver un problema en la protoboard usando solo las piezas necesarias.", nivel: 3, semilla: 32, pod: 4, circuito: "placa3", pasos: [
    { titulo: "Gavetas", objetivo: "gaveta", hecho: (e) => !!e.piezas?.some((p) => p.startsWith("S:")), texto: "Lee el globo. Pestaña Interr.: arrastra el interruptor a la placa." },
    { titulo: "Solo lo necesario", objetivo: "gaveta", hecho: (e) => !!e.piezas?.some((p) => p.startsWith("R:")) && !!e.piezas?.some((p) => p.startsWith("L:")), texto: "Pon una resistencia y el LED. El diodo y el capacitor sobran." },
    { titulo: "Cables", objetivo: "pieza", hecho: (e) => (e.cables ?? 0) >= 2, texto: "Cada tira de 5 es un punto. Cables: riel + a la 1.ª, la última al −." },
    { titulo: "Medir", objetivo: "gaveta", hecho: (e) => e.modo === "tension", texto: "Pestaña Medir y toca Tensión: medir no gasta intentos." },
    { titulo: "Mide", objetivo: "pieza", hecho: MIDE_TENSION, texto: "Toca dos agujeros: punta roja y punta negra. Prueba en el LED." },
    VALIDA("Pulsa CHECK: verde = cumple el problema; ámbar = revisa y cambia.", SIN_FALLA),
    CHECK,
    LISTO("Usa solo lo que pide el problema: el resto de la gaveta sobra."),
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
  // En «Valida» se puede volver a poner la pieza del paso anterior (si se devolvió a la gaveta no quedaba forma de seguir).
  if (actual(t).pide === "check" && t.i > 0 && coincide(t.pasos[t.i - 1]!.pide, a)) return null;
  if (e && t.i < t.pasos.length - 1 && cumple(t, e) && coincide(t.pasos[t.i + 1]!.pide, a)) return null;
  return `Ahora toca: ${actual(t).titulo}`;
}
export const saltar = (t: Tutorial): Tutorial => ({ ...t, activo: false });
export const textoPaso = (t: Tutorial) => `${(mecanica(t.id)?.nombre ?? t.id).toUpperCase()} ${t.i + 1}/${t.pasos.length} ${actual(t).titulo}`;

// --- Guía en partida: aviso corto y NO bloqueante la primera vez que el jugador ve una mecánica (y, dentro, la medida que estrena) ---
/** Clave de mecánica de una zona: en nivel 3 las resistencias se leen por bandas («colores»); si no, la familia. */
type ClaveMec = Circuito | "colores";
const claveMec = (c: Circuito, nivel?: number): ClaveMec => (nivel === 3 && esResistencia(c) ? "colores" : c);
/** Tutorial de Aprender que enseña la misma mecánica (completarlo cuenta como visto). */
const APRENDER: Partial<Record<ClaveMec, string>> = { led: "resistencia", fusible: "fusible", cadena: "cadena", luces: "placa", interruptor: "turbina", combinar: "combinar", divisor: "divisor", protegido: "protegido", fusible3: "fusibles", placa3: "placaExperta", colores: "colores" };
export type MedidaGuia = "tension" | "continuidad";
/** Medida que estrena cada familia. */
export const MEDIDA_DE: Record<Circuito, MedidaGuia> = { led: "tension", cabina: "tension", protegido: "tension", divisor: "tension", combinar: "tension", luces: "tension", interruptor: "tension", placa3: "tension",
  fusible: "continuidad", fusible3: "continuidad", abierto: "continuidad", invertido: "continuidad", cadena: "continuidad" };
/** Tutoriales de Aprender que ya enseñan cada medida. */
const APRENDER_MEDIDA: Record<MedidaGuia, string[]> = { tension: ["multimetro", "fusible", "placa", "divisor", "protegido", "placaExperta"], continuidad: ["multimetro", "cadena", "combinar"] };
/** Textos de la guía (2 pasos por mecánica): cómo funciona la mecánica, nunca la respuesta del pod. */
const GUIA_MEC: Record<ClaveMec, { titulo: string; pasos: string[] }> = {
  led: { titulo: "Resistencia", pasos: ["Hueco rojo = falta la resistencia. Arrastra una: solo la coloca.", "Más Ω, más freno. CHECK valida: verde = bien, rojo = el LED se quema."] },
  cabina: { titulo: "Cabina", pasos: ["Una resistencia frena la corriente de las luces de la cabina.", "Más Ω, más freno. Arrastra una al hueco rojo y pulsa CHECK."] },
  protegido: { titulo: "Protegido", pasos: ["Diodo, LED y resistencia en serie se reparten la batería.", "Elige la resistencia que deja al LED su parte y pulsa CHECK."] },
  divisor: { titulo: "Divisor", pasos: ["Dos resistencias en fila se reparten la tensión.", "R1 viene puesta: arrastra R2 (la de abajo) y pulsa CHECK."] },
  combinar: { titulo: "Combinar", pasos: ["Dos resistencias: en serie suman, en paralelo bajan el total.", "Arrastra una forma de unirlas al hueco y pulsa CHECK."] },
  luces: { titulo: "Placa", pasos: ["Esta zona usa una placa: arrastra cada pieza a su lugar.", "Une con cables al carril + y al carril −. Luego pulsa CHECK."] },
  interruptor: { titulo: "Interruptor", pasos: ["Arrastra el motor y el interruptor a la placa.", "El interruptor va en serie con el motor. Luego pulsa CHECK."] },
  fusible: { titulo: "Fusible", pasos: ["El fusible justo aguanta lo normal y corta la falla.", "A = lo que aguanta. Arrastra uno al hueco y pulsa CHECK."] },
  fusible3: { titulo: "Fusibles", pasos: ["Se eligen por tamaño, marca (F rápido, T lento) y color.", "Elige el que aguanta el consumo normal y pulsa CHECK."] },
  abierto: { titulo: "Cable roto", pasos: ["Un cable puede estar cortado: así la corriente no llega.", "Empalma el corte o déjalo como está, y pulsa CHECK."] },
  invertido: { titulo: "LED girado", pasos: ["El LED solo deja pasar la corriente en un sentido.", "Gíralo o déjalo como está, y pulsa CHECK."] },
  cadena: { titulo: "Pieza muerta", pasos: ["Una pieza de la cadena puede estar muerta por dentro.", "Hállala y arrastra encima un repuesto del mismo valor."] },
  placa3: { titulo: "Placa experta", pasos: ["Lee el problema del globo: usa solo las piezas necesarias.", "Las pestañas son gavetas. Cada tira de 5 agujeros es un punto."] },
  colores: { titulo: "Colores", pasos: ["Nivel Experto: las resistencias no traen su valor escrito.", "Bandas 1 y 2 = cifras, banda 3 = ceros: 1-0-00 = 1 kΩ."] },
};
const GUIA_MEDIDA = (m: MedidaGuia, c: Circuito) => m === "tension"
  ? { titulo: "Medir tensión", pasos: ["Toca TENSIÓN en el multímetro: medir no gasta intentos.", "Luego toca una pieza: la aguja dice cuánta batería cae en ella."] }
  : { titulo: "Medir continuidad", pasos: ["Toca CONTINUIDAD: dice si la corriente pasa por la pieza.",
    c === "cadena" ? "En la cadena toca cada pieza: la que «No pasa» está muerta." : "Se mide sin tensión: QUITA la pieza (tócala) y mide el hueco o la pieza."] };

export interface AvisoGuia { id: string; titulo: string; pasos: string[] }
/** Ids que guarda la guía en Perfil.tutoriales: «mec-<clave>» y «med-<medida>». */
export const idGuiaValido = (id: string) => /^mec-/.test(id) ? Object.hasOwn(GUIA_MEC, id.slice(4)) : /^med-/.test(id) ? Object.hasOwn(APRENDER_MEDIDA, id.slice(4)) : true;
/**
 * Avisos de la guía para la zona (familia `c`, nivel del pod) según lo ya visto, en orden: la mecánica nueva y, solo si es nueva,
 * la medida que estrena si aún no se enseñó. Vacío = nada que mostrar. Aprender cuenta como visto.
 */
export function guiaPartida(c: Circuito, nivel: number | undefined, vistos: readonly string[], enLinea = false): AvisoGuia[] {
  if (enLinea) return []; // en el duelo 1v1 el reloj no se pausa: no hay guía y NO se marca como vista (sale en Jugar solo / Aprender)
  const k = claveMec(c, nivel), a = APRENDER[k];
  if (vistos.includes(`mec-${k}`) || (a && vistos.includes(a))) return [];
  const m = MEDIDA_DE[c], medida = vistos.includes(`med-${m}`) || APRENDER_MEDIDA[m].some((x) => vistos.includes(x)) ? [] : [{ id: `med-${m}`, ...GUIA_MEDIDA(m, c) }];
  return [{ id: `mec-${k}`, ...GUIA_MEC[k] }, ...medida];
}
