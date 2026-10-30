/**
 * Sabotajes (bloque 4), lado cliente: textos, estado vigente y la geometría del humo. Lógica pura (sin Phaser);
 * el árbitro concede y aplica el sabotaje, aquí solo se muestra. La prueba vive en test/sabotaje.test.ts.
 */
import type { TipoSabotaje } from "../../spike/src/protocol";
import type { Pantalla } from "./pantalla";

/** Toques sobre el humo para limpiarlo (contrarresta el sabotaje). */
export const HUMO_TOQUES = 3;
/** Pods limpios seguidos que dan un sabotaje. */
export const PODS_LIMPIOS = 3;

const NOMBRE: Record<TipoSabotaje, string> = { humo: "humo", enfriamiento: "enfriamiento largo", "sin-pista": "sin pista" };
/** Aviso al que recibe: «Rival: ¡humo!». */
export const avisoRecibido = (t: TipoSabotaje) => `Rival: ¡${NOMBRE[t]}!`;
/** Aviso al atacante: «¡Sabotaje enviado: humo!». */
export const avisoEnviado = (t: TipoSabotaje) => `¡Sabotaje enviado: ${NOMBRE[t]}!`;
/** Cómo contrarrestarlo (se muestra bajo el aviso). */
export const AYUDA: Record<TipoSabotaje, string> = {
  humo: "Toca el humo 3 veces para limpiarlo",
  enfriamiento: "Tu próximo fallo espera 2 s más",
  "sin-pista": "Acierta una pieza y vuelve la pista",
};

/** ¿Hay un sabotaje de ese tipo (o cualquiera) vigente contra ti a la hora local `ahora`? */
export const sabotajeActivo = (p: Pantalla, ahora: number, tipo?: TipoSabotaje) =>
  !!p.sabotaje && ahora < p.sabotaje.hasta && (!tipo || p.sabotaje.tipo === tipo);

/** Con este número de toques el humo se despeja. */
export const limpiaHumo = (toques: number) => toques >= HUMO_TOQUES;

/** El humo se ve mientras dura y no lo hayas limpiado (`limpiado` = n del sabotaje ya despejado). */
export const humoVisible = (p: Pantalla, ahora: number, limpiado: number) => sabotajeActivo(p, ahora, "humo") && p.sabotaje!.n !== limpiado;
/** «Sin pista» activo: pestañas, humo de la zona dañada y «Objetivo: repara X» se muestran neutros. */
export const sinPista = (p: Pantalla, ahora: number) => sabotajeActivo(p, ahora, "sin-pista");

export interface Recta { x: number; y: number; w: number; h: number }
/** Humo sobre la bahía (coordenadas de la escena) y sobre la gaveta (coordenadas del panel). Nunca sobre el CHECK, el HUD ni el multímetro. */
export const HUMO_BAHIA: Recta = { x: 0, y: 150, w: 360, h: 176 };
export const HUMO_GAVETA: Recta = { x: 0, y: 258, w: 360, h: 56 };
/** Zona táctil del CHECK y de los botones del multímetro, en coordenadas del panel. */
export const CHECK_PANEL: Recta = { x: 30, y: 316, w: 300, h: 48 };
export const MULTIMETRO_PANEL: Recta[] = [{ x: 10, y: 154, w: 48, h: 48 }, { x: 302, y: 154, w: 48, h: 48 }];
export const cruzan = (a: Recta, b: Recta) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
