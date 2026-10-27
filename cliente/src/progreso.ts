/**
 * Fases del tutor (SCRUM-166), mapeo PROVISIONAL hasta confirmarlo con el tutor: acción = el Taller,
 * progreso = HUD (pod n/5, zonas reparadas, pods de cada jugador), recompensa = efectos, puntaje y podio.
 * Funciones puras (sin Phaser): se prueban en test/progreso.test.ts.
 */
import type { Carril, PodView, Score, ZonaView } from "../../spike/src/protocol";
import { faltan, type Pantalla } from "./pantalla";
import { NOMBRE_ZONA, reparadas, RETO } from "./vista";

/** PROVISIONAL: puntos del puntaje de fin de partida. Único sitio donde se cambian. */
export const PUNTOS = { pod: 100, limpio: 20, quemada: -10 } as const;

/** Puntaje del jugador: 100 por pod despachado, +20 por pod limpio (llamas), -10 por quemada; nunca menos de 0. */
export const puntosDe = (s: Score, c?: Carril) =>
  Math.max(0, s.despachados * PUNTOS.pod + (c?.llamas ?? 0) * PUNTOS.limpio + s.quemadas * PUNTOS.quemada);

/** Lo que gana el jugador al despachar un pod (limpio = sin ningún fallo en ese pod; la práctica no tiene carrera, no hay bono). */
export const puntosPod = (limpio: boolean, practica = false) => PUNTOS.pod + (limpio && !practica ? PUNTOS.limpio : 0);

/** PROVISIONAL: puntos extra por «Diagnóstico» (Oleadas): medir antes de elegir y acertar a la primera la segunda falla de un pod. */
export const DIAGNOSTICO = 50;

/** PROVISIONAL: llamas máximas del HUD del Taller. Único sitio donde se cambia. */
export const MAX_LLAMAS = 5;

/** Racha de pods limpios seguidos (las llamas del HUD): un pod limpio suma una, uno con fallos la rompe a 0 sin castigo. */
export const rachaLlamas = (racha: number, limpio: boolean) => (limpio ? Math.min(racha + 1, MAX_LLAMAS) : 0);

/** Cronómetro de un pod ("m:ss"): cuenta hacia arriba, sin límite ni castigo. */
export const tiempoPod = (ms: number) => { const s = Math.floor(Math.max(0, ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** "Pod n/5" (nunca pasa del total); sin total (Oleadas) solo "Pod n". */
export const textoPod = (numero: number, total: number) => (total ? `Pod ${Math.min(numero, total)}/${total}` : `Pod ${numero}`);

/** Casillas del progreso de pods despachados: true = hecho. */
export const casillas = (n: number, total: number) => Array.from({ length: total }, (_, i) => i < n);

/** Objetivo del pod actual con sus zonas pendientes (sin dar la solución). */
export const textoObjetivo = (p: Pantalla) => (faltan(p.pod) ? `Objetivo: repara ${faltan(p.pod)}` : "Objetivo: despacha el pod");

/** Globo del Taller: reto de la zona abierta y zonas reparadas del pod ("Zonas reparadas: n/m"). */
export const textoGlobo = (z: ZonaView, pod: PodView) => `${NOMBRE_ZONA[z.nombre]}: ${RETO[z.circuito]}\n${reparadas(pod)}`;
