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
  sinPieza: "Elige una pieza o termina los cables antes de medir.",
} as const;

export const TRAMO: Record<Tramo, { etiqueta: string; texto: string }> = {
  nada: { etiqueta: "Nada", texto: "Aquí no cae tensión." },
  parte: { etiqueta: "Parte", texto: "Aquí cae parte de la batería." },
  toda: { etiqueta: "Toda", texto: "Cae casi toda la batería aquí: el camino está cortado." },
};

/** Aguja del medidor (−60° a 60°) para la fracción de la batería que cae en el tramo. */
export const anguloTension = (fraccion: number) => -60 + 120 * Math.max(0, Math.min(1, fraccion));

/** Texto de la lectura para el aviso del panel. */
export const textoMedida = (m: Medida) =>
  m.modo === "continuidad" ? (m.pasa ? T.pasaTexto : T.noPasaTexto) : TRAMO[m.tension ?? "nada"].texto;

/** Aviso mientras el modo está activo y no hay lectura. */
export const textoModo = (modo: ModoMedir) => (modo === "continuidad" ? `${T.desconectada}. ${T.tocaPieza}` : T.tocaPieza);

/** Estado de una medición en curso: se muestra cuando pasó MEDIR_MS y llegó la Medida con ese seq. */
export interface Midiendo { seq: number; desde: number; punto: string }
export const lecturaLista = (m: Midiendo, medida: Medida | undefined, ahora: number) =>
  ahora - m.desde >= MEDIR_MS && medida?.seq === m.seq ? medida : null;
