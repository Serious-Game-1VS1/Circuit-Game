/**
 * Qué sprite del kit `arte/` pinta cada cosa del Taller, sin Phaser: se prueba en test/sprites.test.ts.
 * Los nombres son claves de src/atlas.json (lo genera `npm run arte`).
 */
import type { Circuito, PodView, ZonaNombre, ZonaView } from "../../spike/src/protocol";
import atlas from "./atlas.json";
import type { Vista } from "./vista";

export interface Sprite { nombre: string; archivo: string; ancho: number; alto: number; origen?: { x: number; y: number }; offset?: { x: number; y: number }; puntos?: Record<string, unknown>; nineSlice?: { izq: number; der: number; arr: number; aba: number } }
export const SPRITES: Sprite[] = atlas.sprites;
export const ANIMACIONES: { clave: string; frames: string[]; frameRate: number; repeat: number }[] = atlas.animaciones;
const POR_NOMBRE = new Map(SPRITES.map((s) => [s.nombre, s]));
export const sprite = (nombre: string) => POR_NOMBRE.get(nombre);

export const ZONAS: ZonaNombre[] = ["radar", "cabina", "turbina", "reactor"];
const PODS = atlas.meta.pods;

/** supuesto: el árbitro no manda el modelo de nave; sale del número de pod (1 Cometa … 5 Raya). */
export const podDe = (numero: number) => PODS[(((numero - 1) % PODS.length) + PODS.length) % PODS.length]!;

export type EstadoZona = "sano" | "averiado" | "quemado" | "reparado";
/** Zona sin avería = sana; dañada = averiada (quemada si el último veredicto la quemó); reparada al acertar. */
export function estadoZona(pod: PodView, nombre: ZonaNombre, vistas: Record<number, Vista>): EstadoZona {
  const z = pod.zonas.find((x) => x.nombre === nombre);
  if (!z) return "sano";
  if (z.reparada) return "reparado";
  return vistas[z.zona]?.quemado ? "quemado" : "averiado";
}

/** Las 4 pestañas en orden fijo; solo las zonas dañadas se pueden abrir (`zona` = null en las sanas). */
export const pestanasArte = (pod: PodView, actual: number) => ZONAS.map((nombre) => {
  const z = pod.zonas.find((x) => x.nombre === nombre);
  const estado = !z ? "inactiva" : z.zona === actual ? "activa" : z.reparada ? "reparada" : "alerta";
  return { nombre, zona: z?.zona ?? null, sprite: `pestana_${nombre}_${estado}` };
});

/** Pods que esperan en la cola detrás del de la bahía. */
export const cola = (numero: number, total: number) => Array.from({ length: Math.max(0, total - numero) }, (_, i) => numero + 1 + i);

/** Brillo de la carga: 0 apagada, 1 poco, 2 correcto, 3 demasiado, 4 quemada. */
export const nivelCarga = (z: ZonaView, v: Vista | undefined) =>
  z.reparada ? 2 : !v ? 0 : v.quemado || v.cortocircuito ? 4 : v.aguja === "poco" ? 1 : v.aguja === "correcto" ? 2 : 3;

const BRILLO = ["apagado", "tenue", "encendido", "brillante"];
export function spriteCarga(c: Circuito, nivel: number, fija?: string): string {
  const b = BRILLO[nivel];
  if (c === "led" || c === "cabina" || c === "invertido" || c === "abierto") return `led_rojo_${b ?? "quemado"}`;
  if (c === "luces") return `foco_${b ?? "fundido"}`;
  if (c === "fusible") return `calefactor_${b ?? "quemado"}`;
  if (c === "combinar" || c === "protegido") return `led_rojo_${b ?? "quemado"}`;
  if (c === "divisor") return RESISTENCIA[/(\d+) ?Ω/.exec(fija ?? "")?.[1] ?? ""] ?? "resistencia_220"; // R1 fija, dibujada según su «R1 470 Ω»
  return "icono_turbina"; // supuesto: el kit no trae motor; el ícono de turbina gira cuando la corriente es correcta
}
/** Rótulo bajo la carga: el dato fijo del árbitro («R1 470 Ω») o, en Turbina, «DIODO» (se dibuja con montajeCarga). */
export const etiquetaCarga = (z: ZonaView) => z.fija ?? (z.circuito === "protegido" ? "DIODO" : "");

/**
 * Montaje de varias piezas, sin Phaser: coordenadas relativas al centro (px de pantalla).
 * `sprite` = pieza del kit a escala `k`; `diodo` = diodo dibujado con Graphics (el kit no trae); `cables` = [x1,y1,x2,y2];
 * `textos` = rótulos dibujados por pintarMontaje (x centrado, y = borde superior); `puntos` = nodos marcados; `bornes` = extremos para conectar la batería.
 * `ancho` = ancho total; `alto` = distancia del centro al borde inferior, rótulos incluidos (el texto de abajo va en y + alto + margen).
 */
export interface Elem { sprite?: string; diodo?: boolean; /** Diodo con el cátodo a la izquierda (LED girado). */ giro?: boolean; x: number; y: number; k: number }
export interface Texto { t: string; x: number; y: number; k?: number }
export interface Montaje { elementos: Elem[]; cables: [number, number, number, number][]; rotulo: string; ancho: number; alto: number; textos?: Texto[]; puntos?: [number, number][]; bornes?: [[number, number], [number, number]] }
const R = (x: number, y: number, k: number, sprite = "resistencia_220"): Elem => ({ sprite, x, y, k });

/** Combinar: las dos resistencias de 220 Ω según el montaje elegido (cada una rotulada «220 Ω»); invertido: el LED con su polaridad; abierto: el hueco del cable, cortado o empalmado. null = el resto de circuitos usan una sola pieza. */
export function montajePieza(c: Circuito, pieza: string | undefined): Montaje | null {
  if (c === "invertido" && pieza) return { elementos: [{ diodo: true, giro: pieza === "inversa", x: 0, y: 0, k: 4 }], cables: [], rotulo: "", ancho: 52, alto: 24 };
  if (c === "abierto" && pieza) { // hueco entre la resistencia y el LED: cable cortado (dos puntas) o cable seguido
    const cables: Montaje["cables"] = pieza === "empalmar" ? [[-40, 0, 40, 0]] : [[-40, 0, -14, 0], [14, 0, 40, 0], [-14, -8, -14, 8], [14, -8, 14, 8]];
    return { elementos: [], cables, rotulo: "", ancho: 80, alto: 10 };
  }
  if (c !== "combinar" || !pieza) return null;
  const rot = (rotulo: string, bajo: number) => ({ rotulo, textos: [{ t: rotulo, x: 0, y: bajo + 2 }], alto: bajo + 18 });
  const r = (x: number, y: number): Texto => ({ t: "220 Ω", x, y, k: 1 });
  if (pieza === "serie") return { elementos: [R(-26, 0, 2), R(26, 0, 2)], cables: [[-44, 0, -52, 0], [-8, 0, 8, 0], [44, 0, 52, 0]], ancho: 104, ...rot("440 Ω", 14), textos: [r(-26, -20), r(26, -20), { t: "440 Ω", x: 0, y: 16 }] };
  if (pieza === "paralelo") return { elementos: [R(0, -16, 2), R(0, 16, 2)], cables: [[-26, -16, 26, -16], [-26, 16, 26, 16], [-26, -16, -26, 16], [26, -16, 26, 16], [-26, 0, -40, 0], [26, 0, 40, 0]], ancho: 80, ...rot("110 Ω", 30), textos: [r(46, -20), r(46, 12), { t: "110 Ω", x: 0, y: 32 }] };
  return { elementos: [R(0, 0, 3)], cables: [], ancho: 54, ...rot("220 Ω", 21) };
}

/**
 * Carga con más de una pieza, compacta y en fila (ancho ≤ 110): protegido = diodo + LED en serie (cátodo a la derecha);
 * divisor = R1 y R2 en serie con el nodo medio marcado («V»). `bornes` = extremos izquierdo y derecho (donde entra y sale la corriente).
 */
export function montajeCarga(z: ZonaView, nivel: number, pieza: string | undefined): Montaje | null {
  if (z.circuito === "protegido") return { elementos: [{ diodo: true, x: -30, y: 0, k: 3 }, { sprite: spriteCarga("protegido", nivel), x: 26, y: 0, k: 3 }], cables: [[-54, 0, -48, 0], [-12, 0, 5, 0], [47, 0, 53, 0]], rotulo: "", ancho: 106, alto: 21, bornes: [[-54, 0], [53, 0]] };
  if (z.circuito === "divisor") {
    const r2 = RESISTENCIA[pieza ?? ""], r1 = /(\d+) ?Ω/.exec(z.fija ?? "")?.[1];
    return {
      elementos: [R(-28, 0, 2, spriteCarga("divisor", nivel, z.fija)), ...(r2 ? [R(28, 0, 2, r2)] : [])],
      cables: [[-54, 0, -46, 0], [-10, 0, 10, 0], [r2 ? 46 : 10, 0, 54, 0]], rotulo: "", ancho: 108, alto: 50, bornes: [[-54, 0], [54, 0]], puntos: [[0, 0]],
      textos: [{ t: "V", x: 0, y: -28 }, { t: "R1", x: -28, y: 18 }, { t: r1 ? `${r1} Ω` : "?", x: -28, y: 34 }, { t: "R2", x: 28, y: 18 }, { t: r2 ? `${pieza} Ω` : "?", x: 28, y: 34 }],
    };
  }
  return null;
}
export const cargas = (c: Circuito) => (c === "cabina" || c === "luces" ? 2 : 1);

const RESISTENCIA: Record<string, string> = { "100": "resistencia_100", "220": "resistencia_220", "470": "resistencia_470", "1000": "resistencia_1k" };
const FUSIBLE: Record<string, string> = { "0.5": "fusible_fino", "1": "fusible_medio", "3": "fusible_grueso" };
/** Sprite de la pieza elegida; null = solo texto (montajes de luces o nada elegido). */
export function spritePieza(c: Circuito, pieza: string | undefined): string | null {
  if (!pieza) return null;
  if (c === "led" || c === "cabina" || c === "protegido") return RESISTENCIA[pieza] ?? null;
  if (c === "combinar") return "resistencia_220"; // respaldo: el montaje real sale de montajePieza
  if (c === "divisor") return null; // R2 se dibuja junto a R1 en montajeCarga
  if (c === "fusible") return FUSIBLE[pieza] ?? null;
  return c === "interruptor" ? "interruptor_cerrado" : null;
}

const BATERIA: Record<number, string> = { 4.5: "bateria_4_5v", 9: "bateria_9v", 18: "bateria_18v" };
/** El kit no trae batería de 3,7 V: se usa el ícono genérico (el voltaje va siempre en texto). */
export const spriteBateria = (volts: number) => BATERIA[volts] ?? "icono_bateria";

/** Tarjeta de quemado del kit; null = tarjeta genérica con texto (luces, motor). */
export function spriteTarjeta(c: Circuito, v: Vista | undefined): string | null {
  if (v?.cortocircuito) return "tarjeta_quemado_cortocircuito";
  if (c === "led" || c === "cabina") return "tarjeta_quemado_led";
  return c === "fusible" ? "tarjeta_quemado_calefactor" : null;
}
