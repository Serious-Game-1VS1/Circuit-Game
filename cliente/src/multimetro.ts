/**
 * Multímetro del Taller, sin Phaser (se prueba en test/multimetro.test.ts): textos y aguja a partir
 * de la Medida del árbitro. Medir cuesta ~1 s (MEDIR_MS; 3 s en 1v1 y contra el bot, lo fija el árbitro en Medida.medirMs) y no cuenta como «Probar».
 * Textos de diseno-taller/prototipo-v3/textos.js (T.medidor, T.ayudas) salvo los marcados.
 */
import type { Dial, Medida, ModoMedir, Tramo } from "../../spike/src/protocol";

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
  fusibleIgual: "Pasa con el consumo normal: no dice cuánto aguanta.", // el 1 A y el 3 A leen igual: solo la falla los separa
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
  if (m.modo === "continuidad" && (circuito === "fusible" || circuito === "fusible3") && m.punto === "pieza" && m.pasa) return T.fusibleSano; // el probador (3 mA) nunca funde un fusible: «no pasa» no ocurre
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
  circuito === "fusible" || circuito === "fusible3" ? T.fusibleAyuda : modo === "continuidad" ? `${T.desconectada}. ${T.tocaPieza}` : T.tocaPieza;

/** Estado de una medición en curso: se muestra cuando pasó MEDIR_MS y llegó la Medida con ese seq. */
export interface Midiendo { seq: number; desde: number; punto: string }
export const lecturaLista = (m: Midiendo, medida: Medida | undefined, ahora: number, medirMs = MEDIR_MS) =>
  ahora - m.desde >= medirMs && medida?.seq === m.seq ? medida : null;

/** Luz de validación (todas las mecánicas): verde = correcto, ámbar = poco/demasiado, rojo = se quema; null = apagado (aún no se colocó la pieza). */
export type Luz = "verde" | "ambar" | "rojo" | "gris";
export const luzValidacion = (v?: { aguja: string | null; quemado: boolean; cortocircuito?: boolean } | null): Luz | null =>
  v?.cortocircuito ? "rojo" : !v?.aguja ? null : v.quemado ? "rojo" : v.aguja === "correcto" ? "verde" : "ambar";
export const COLOR_LUZ: Record<Luz, number> = { verde: 0x6ee7a0, ambar: 0xffc23f, rojo: 0xff5a4a, gris: 0xaab4c8 };
export const TEXTO_LUZ: Record<Luz, string> = { verde: "Verde", ambar: "Ámbar", rojo: "Rojo", gris: "Gris" };

/** Dial del árbitro -> luz: correcto verde ✓, poco ámbar !, demasiado rojo ✗; sin zona (la medición no la distingue) gris ?. */
export const LUZ_DIAL: Record<Dial, Luz> = { correcto: "verde", poco: "ambar", demasiado: "rojo" };
/** Qué dice cada zona del dial en cada familia: «LED con poca luz», «LED correcto», «LED se quema», «circuito abierto»… */
const DIAL: Partial<Record<string, Record<Dial, string>>> = {
  led: { poco: "LED con poca luz: llega poca corriente.", correcto: "LED correcto: brilla bien.", demasiado: "LED se quema: llega demasiada corriente." },
  cabina: { poco: "LED con poca luz: llega poca corriente.", correcto: "LED correcto: brillan bien.", demasiado: "LED se quema: llega demasiada corriente." },
  combinar: { poco: "LED con poca luz: llega poca corriente.", correcto: "LED correcto: brilla bien.", demasiado: "LED se quema: llega demasiada corriente." },
  protegido: { poco: "LED con poca luz: llega poca corriente.", correcto: "LED correcto: brilla bien.", demasiado: "LED se quema: llega demasiada corriente." },
  invertido: { poco: "Circuito abierto: el LED no deja pasar, mira su sentido.", correcto: "LED correcto: brilla bien.", demasiado: "LED se quema: llega demasiada corriente." },
  abierto: { poco: "Circuito abierto: no pasa corriente.", correcto: "Circuito cerrado: el LED brilla bien.", demasiado: "LED se quema: llega demasiada corriente." },
  cadena: { poco: "Circuito abierto o sin LED: no enciende.", correcto: "LED correcto: brilla bien.", demasiado: "LED se quema: llega demasiada corriente." },
  divisor: { poco: "Salida baja: llega poca tensión al Arduino.", correcto: "Salida correcta para el Arduino.", demasiado: "Salida alta: se quema el pin del Arduino." },
  luces: { poco: "Las luces reciben poca batería.", correcto: "Cada luz recibe toda la batería.", demasiado: "Cortocircuito: la batería se hunde." },
  interruptor: { poco: "El motor recibe poca corriente.", correcto: "El motor recibe lo que necesita.", demasiado: "Cortocircuito: la batería se hunde." },
  fusible3: { poco: "El fusible corta con el consumo normal.", correcto: "El fusible aguanta lo normal.", demasiado: "Cortocircuito: la batería se hunde." },
  fusible: { poco: "El fusible corta con el consumo normal.", correcto: "El fusible aguanta lo normal.", demasiado: "Cortocircuito: la batería se hunde." },
};
/** Texto de la zona del dial; undefined = sin zona (el aviso vuelve al texto del tramo o de la continuidad). */
export const textoDial = (circuito: string | undefined, dial: Dial | undefined) => (dial && DIAL[circuito ?? ""]?.[dial]) || undefined;

/** Lo que se pinta de una medición: la cifra del aparato, un estado en palabras y la luz (verde ✓ / ámbar ! / rojo ✗ / gris ?). */
export interface LecturaVista { cifra: string; estado: string; luz: Luz; /** Voltios medidos (para la próxima comparación «más que antes»). */ voltios?: number }
const num = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/**
 * Interpreta una Medida. La luz es UNA función de `m.dial` (la zona que el árbitro mide para la pieza puesta, la misma que daría CHECK):
 * verde = correcto, ámbar = poco, rojo = demasiado, gris = la medición no lo distingue (p. ej. un fusible que no cortó).
 * `previa` = voltios de la última lectura en el mismo punto.
 */
export function leerMedida(m: Medida, o: { circuito?: string; volts: number; previa?: number; /** Nivel 3: no se lee el valor en Ω de la resistencia (se reconoce por sus bandas). */ ocultarOhmios?: boolean }): LecturaVista {
  const luz: Luz = m.dial ? LUZ_DIAL[m.dial] : "gris", dial = textoDial(o.circuito, m.dial), texto = textoMedida(m, o.circuito);
  if (m.modo === "continuidad") {
    return { cifra: m.pasa ? (m.ohmios !== undefined && !o.ocultarOhmios ? `Cerrado ${num(m.ohmios)} Ω` : "Cerrado") : "Abierto", estado: dial ? `${m.pasa ? "Pasa" : "No pasa"}. ${dial}` : texto, luz };
  }
  const v = m.voltios ?? (m.fraccion ?? 0) * o.volts;
  const dif = o.previa === undefined ? null : v - o.previa;
  const delta = dif === null ? null : Math.abs(dif) < 0.05 ? "Igual que antes" : dif > 0 ? "Más que antes" : "Menos que antes";
  const cuerpo = dial ?? (o.circuito === "fusible" || o.circuito === "fusible3" ? T.fusibleIgual : texto);
  return { cifra: `${num(v)} V`, estado: delta ? `${delta} (antes ${num(o.previa!)} V). ${cuerpo}` : cuerpo, luz, voltios: v };
}

/** Cómo se usa la HERRAMIENTA (nunca pistas del pod: es justo para ambos jugadores). Cada línea cabe en ~2 renglones a 360x640. */
export const AYUDA_USO = {
  titulo: "MULTÍMETRO",
  lineas: [
    "TENSIÓN: cuánta batería cae en la pieza que tocas.",
    "CONTINUIDAD: si la corriente puede pasar por ella.",
    "Lee la cifra y el color de la aguja.",
    "Medir NO gasta intento: solo CHECK valida.",
  ],
  encender: "Toca TENSIÓN o\nCONTINUIDAD para encender",
  /** Lo que dice Chispa las primeras veces (también en partidas). */
  chispa: "Multímetro: toca TENSIÓN o CONTINUIDAD y luego una pieza. Medir no gasta intento.",
  cerrar: "Entendido",
  /** Cartel de primera vez (flecha al multímetro) y rótulo de la flecha del tutorial: solo cómo se usa la herramienta. */
  cartel: "Mide con el multímetro, luego valida",
  senal: "Mide para validar",
  sigue: "El multímetro sigue midiendo",
} as const;

/** Veces que se ofrece la ayuda sola por perfil. */
export const VECES_AYUDA = 3;
/** ¿Toca ofrecer la ayuda de primera vez a este alias? Cuenta la vez en `almacen` (localStorage); sin almacenamiento, nunca (no repetir sin recordar). */
export function ayudaPrimerasVeces(alias: string, almacen: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  try {
    const k = `circuitsync.ayudaMultimetro.${alias.trim().toLowerCase()}`, n = Number(almacen?.getItem(k)) || 0;
    if (!almacen || n >= VECES_AYUDA) return false;
    almacen.setItem(k, String(n + 1));
    return true;
  } catch { return false; }
}
