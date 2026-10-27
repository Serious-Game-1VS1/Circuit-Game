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
export function spriteCarga(c: Circuito, nivel: number): string {
  const b = BRILLO[nivel];
  if (c === "led" || c === "cabina" || c === "invertido" || c === "abierto") return `led_rojo_${b ?? "quemado"}`;
  if (c === "luces") return `foco_${b ?? "fundido"}`;
  if (c === "fusible") return `calefactor_${b ?? "quemado"}`;
  return "icono_turbina"; // supuesto: el kit no trae motor; el ícono de turbina gira cuando la corriente es correcta
}
export const cargas = (c: Circuito) => (c === "cabina" || c === "luces" ? 2 : 1);

const RESISTENCIA: Record<string, string> = { "100": "resistencia_100", "220": "resistencia_220", "470": "resistencia_470", "1000": "resistencia_1k" };
const FUSIBLE: Record<string, string> = { "0.5": "fusible_fino", "1": "fusible_medio", "3": "fusible_grueso" };
/** Sprite de la pieza elegida; null = solo texto (montajes de luces o nada elegido). */
export function spritePieza(c: Circuito, pieza: string | undefined): string | null {
  if (!pieza) return null;
  if (c === "led" || c === "cabina") return RESISTENCIA[pieza] ?? null;
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
