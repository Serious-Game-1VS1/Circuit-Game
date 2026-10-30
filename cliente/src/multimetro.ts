/**
 * Multímetro del Taller, sin Phaser (se prueba en test/multimetro.test.ts): textos y aguja a partir
 * de la Medida del árbitro. Medir cuesta ~1 s (MEDIR_MS) y no cuenta como «Probar».
 * Textos de diseno-taller/prototipo-v3/textos.js (T.medidor, T.ayudas) salvo los marcados.
 */
import type { Medida, ModoMedir, Tramo } from "../../spike/src/protocol";

export const MEDIR_MS = 1000;

export const T = {
  tension: "Tensión",
  continuidad: "Continuidad",
  ayuda: "Toca un modo y luego una pieza para medir.",
  tocaPieza: "Toca una pieza para medirla.",
  midiendo: "Midiendo…",
  desconectada: "Batería desconectada para medir",
  pasaTexto: "Pasa: la corriente puede cruzar esta pieza.",
  noPasaTexto: "No pasa: esta pieza está cortada por dentro.",
  // sin entrada en textos.js: el árbitro necesita la pieza o el montaje puesto para medir.
  // Con gaveta (sin placa) lo que falta es elegir; con placa, colocar y cablear. 
  sinEleccion: "Primero elige una opción en la gaveta (abajo) y luego toca la pieza para medir.",
  // Reactor: el multímetro no mide amperios. Con el consumo normal, un fusible que corta solo (0,5 A) lee toda la batería en sus bornes.
  fusibleSano: "Pasa con poca corriente: no dice cuánto aguanta. Mide Tensión en el fusible.",
  fusibleAyuda: "Toca el fusible o el calefactor. Con Tensión, casi toda la batería en el fusible = cortó solo.",
  sinMontaje: "Primero coloca y cablea las piezas, y luego mide.",
  ledSentido: "Cae casi toda la batería en el LED: el LED no deja pasar, mira su sentido.",
  ledNoPasa: "No pasa: el LED solo deja pasar la corriente en un sentido, mira el suyo.",
  divisorToda: "Mides el nodo medio: la lectura es la tensión que queda en R2; R1 se lleva el resto.",
  protegidoToda: "Casi toda la batería cae en esta pieza: la tensión se reparte entre el diodo, el LED y la resistencia.",
} as const;

export const TRAMO: Record<Tramo, { etiqueta: string; texto: string }> = {
  nada: { etiqueta: "Nada", texto: "Aquí no cae tensión." },
  parte: { etiqueta: "Parte", texto: "Aquí cae parte de la batería." },
  toda: { etiqueta: "Toda", texto: "Cae casi toda la batería aquí: el camino está cortado." },
};

/** Aguja del medidor (−60° a 60°) para la fracción de la batería que cae en el tramo. */
export const anguloTension = (fraccion: number) => -60 + 120 * Math.max(0, Math.min(1, fraccion));

/** Texto de la lectura para el aviso del panel. */
export const textoMedida = (m: Medida, circuito?: string) => {
  // LED invertido: mismo veredicto que el circuito abierto, pero la pista es la polaridad.
  const led = circuito === "invertido";
  if (m.modo === "continuidad" && circuito === "fusible" && m.punto === "pieza" && m.pasa) return T.fusibleSano; // el probador (3 mA) nunca funde un fusible: «no pasa» no ocurre
  if (m.modo === "continuidad") return m.pasa ? T.pasaTexto : led ? T.ledNoPasa : T.noPasaTexto;
  if (m.tension === "toda") { // «camino cortado» solo es cierto en los circuitos de corte; el divisor y el protegido no se cortan
    if (led) return T.ledSentido;
    if (circuito === "divisor") return T.divisorToda;
    if (circuito === "protegido") return T.protegidoToda;
  }
  return TRAMO[m.tension ?? "nada"].texto;
};

/** Aviso mientras el modo está activo y no hay lectura. */
export const textoModo = (modo: ModoMedir, circuito?: string) =>
  circuito === "fusible" ? T.fusibleAyuda : modo === "continuidad" ? `${T.desconectada}. ${T.tocaPieza}` : T.tocaPieza;

/** Estado de una medición en curso: se muestra cuando pasó MEDIR_MS y llegó la Medida con ese seq. */
export interface Midiendo { seq: number; desde: number; punto: string }
export const lecturaLista = (m: Midiendo, medida: Medida | undefined, ahora: number, medirMs = MEDIR_MS) =>
  ahora - m.desde >= medirMs && medida?.seq === m.seq ? medida : null;

/** Luz de validación (todas las mecánicas): verde = correcto, ámbar = poco/demasiado, rojo = se quema; null = apagado (aún no se colocó la pieza). */
export type Luz = "verde" | "ambar" | "rojo";
export const luzValidacion = (v?: { aguja: string | null; quemado: boolean; cortocircuito?: boolean } | null): Luz | null =>
  v?.cortocircuito ? "rojo" : !v?.aguja ? null : v.quemado ? "rojo" : v.aguja === "correcto" ? "verde" : "ambar";
export const COLOR_LUZ: Record<Luz, number> = { verde: 0x6ee7a0, ambar: 0xffc23f, rojo: 0xff5a4a };
export const TEXTO_LUZ: Record<Luz, string> = { verde: "Verde", ambar: "Ámbar", rojo: "Rojo" };

/** Lo que se pinta de una medición: la cifra del aparato, un estado en palabras y la luz (verde ✓ / ámbar ! / rojo ✗). */
export interface LecturaVista { cifra: string; estado: string; luz: Luz; /** Voltios medidos (para la próxima comparación «más que antes»). */ voltios?: number }
const num = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/**
 * Interpreta una Medida. La luz describe LA LECTURA (¿cierra el circuito? ¿cae tensión?), nunca si la pieza elegida es la correcta:
 * en partida real no hay forma de saberlo midiendo. En el tutorial `vistaLuz` (veredicto de la pieza) la pisa para confirmar la pieza.
 * `previa` = voltios de la última lectura en el mismo punto.
 */
export function leerMedida(m: Medida, o: { circuito?: string; volts: number; previa?: number; vistaLuz?: Luz | null }): LecturaVista {
  const texto = textoMedida(m, o.circuito);
  if (m.modo === "continuidad") {
    return { cifra: m.pasa ? (m.ohmios !== undefined ? `Cerrado ${num(m.ohmios)} Ω` : "Cerrado") : "Abierto", estado: texto, luz: m.pasa ? "verde" : "rojo" };
  }
  const v = m.voltios ?? (m.fraccion ?? 0) * o.volts;
  const dif = o.previa === undefined ? null : v - o.previa;
  const delta = dif === null ? null : Math.abs(dif) < 0.05 ? "Igual que antes" : dif > 0 ? "Más que antes" : "Menos que antes";
  // «toda» en el divisor y el protegido no es un corte: ámbar. Sin tensión también (ámbar): el tramo no cae nada.
  const luz: Luz = m.tension === "parte" ? "verde" : m.tension === "toda" && o.circuito !== "divisor" && o.circuito !== "protegido" ? "rojo" : "ambar";
  return { cifra: `${num(v)} V`, estado: delta ? `${delta} (antes ${num(o.previa!)} V). ${texto}` : texto, luz: o.vistaLuz ?? luz, voltios: v };
}
