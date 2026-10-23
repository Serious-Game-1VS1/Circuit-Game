/**
 * Contrato de mensajes entre árbitro y clientes. Solo tipos y validaciones puras: lo importan
 * el árbitro (Node) y el cliente Phaser (navegador), así que no puede depender de Node.
 *
 * Cliente -> árbitro: Hello | Ready | TestMsg | Dispatch | MedirMsg
 * Árbitro -> cliente: Welcome | Full | Lobby | Countdown | Snapshot | Result | Dispatched | Reject | Rival | End | Medida
 * La solución del pod nunca viaja: el cliente manda su elección y recibe solo el veredicto.
 * Tampoco viaja la semilla de la partida: con ella y el generador se reconstruirían las soluciones.
 *
 * Cambios del generador de pods (RF-06), compatibles con el cliente anterior:
 *  - Circuito suma "luces" (2 focos), "interruptor" (motor) y "fusible" (calefactor del Reactor).
 *  - ZonaView suma `nombre` (radar|cabina|turbina|reactor), `volts` de la batería y `opciones`:
 *    los id de pieza que ofrece la gaveta, ya en orden aleatorio. Resistencias: "100", "220", "470",
 *    "1000" (Ω); cableado: "serie", "paralelo", "puente"; fusibles: "0.5", "1", "3" (A).
 *  - TestMsg suma `pieza` (uno de `opciones`). Si falta, se usa String(ohms), como antes.
 *  - Snapshot suma `nivel`. Cada pod trae de 1 a 4 zonas (antes, siempre las mismas 2).
 *
 * Despacho explícito (anteproyecto, RF-03). NO compatible con el cliente anterior:
 *  - Reparar la última zona ya no despacha: el Result trae el pod con todas sus zonas `reparada` y
 *    `despachados` sin cambiar. El jugador manda Dispatch ("despachar") y solo entonces cuenta el pod.
 *  - Respuesta: Dispatched ("despachado", con el pod siguiente) o Reject con `reason`
 *    "faltan zonas por reparar" | "la partida no está en juego". El rival recibe Rival con el
 *    nuevo `despachados` solo tras un Dispatched.
 *  - Despachos casi simultáneos: gana el primero que llega al árbitro (procesa en orden de llegada).
 *
 * Carrera final y podio (propuesta A+D), compatible con el cliente anterior:
 *  - End con phase "fin" suma `carrera` por estación: pod que corre, llamas de turbo, tiempo por pod y
 *    «qué repasar». El ganador sigue siendo `winner` (decidido antes de la carrera, sin azar).
 *  - Quien se reconecta tras el fin (mismo alias, 30 s) recibe Welcome y el mismo End.
 *
 * Modo demo, compatible con el cliente anterior:
 *  - Snapshot suma `demo`: true si el árbitro corre con --demo (cableado en Cabina/Turbina) o con
 *    --demo radar (5 pods solo con Radar); el cliente distingue cuál por las zonas del pod. No revela
 *    la solución ni la semilla; el cliente lo usa solo para ocultar pestañas y herramientas.
 *
 * Multímetro, compatible con el cliente anterior:
 *  - MedirMsg ("medir"): zona, pieza o montaje puesto (uno de `opciones`), modo y punto ("pieza",
 *    "carga1", "carga2"). No es «Probar»: no penaliza, no cuenta como intento ni entra en el CSV.
 *  - Medida ("medida"): solo lo que mostraría el multímetro: en continuidad, si pasa (batería
 *    desconectada); en tensión, el tramo («nada» | «parte» | «toda») y la fracción de la batería
 *    redondeada a décimas. Nunca el veredicto, la corriente ni la solución. Error: Reject "medida no válida".
 *
 * Modo práctica (SCRUM-151), compatible con el cliente anterior:
 *  - Snapshot suma `practica`: true si el árbitro corre en práctica (un jugador, sin rival, sin límite de tiempo:
 *    `restanteMs` va en 0). Al despachar los 5 pods llega un End sin `carrera`. El cliente vuelve a la entrada.
 */
import type { Label } from "./engine/circuit.js";

export type Station = "A" | "B";
export type Phase = "esperando" | "listo" | "cuenta" | "jugando" | "fin" | "anulada";
export type RivalStatus = "reparando" | "penalizado" | "sin-conexion";
export type Circuito = "led" | "cabina" | "luces" | "interruptor" | "fusible";
export type ZonaNombre = "radar" | "cabina" | "turbina" | "reactor";
export type Nivel = 1 | 2;
export type Verdict = Label | "corto";

export interface Hello { t: "hello"; alias: string }
export interface Ready { t: "ready" }
export interface TestMsg { t: "test"; seq: number; t0: number; zone: number; ohms?: number; pieza?: string }
export interface Dispatch { t: "despachar"; seq: number; t0: number }
export type ModoMedir = "continuidad" | "tension";
export interface MedirMsg { t: "medir"; seq: number; t0: number; zone: number; pieza: string; modo: ModoMedir; punto: string }
export type ClientMsg = Hello | Ready | TestMsg | Dispatch | MedirMsg;

/** Lo que el jugador ve de una zona dañada: nunca cuál de las opciones es la correcta. */
export interface ZonaView { zona: number; nombre: ZonaNombre; circuito: Circuito; volts: number; opciones: string[]; reparada: boolean }
export interface PodView { numero: number; zonas: ZonaView[] }
export interface RivalView { alias: string; despachados: number; estado: RivalStatus }

export interface Welcome { t: "welcome"; station: Station; alias: string }
export interface Full { t: "full"; reason: string }
export interface Lobby { t: "lobby"; phase: Phase; players: { station: Station; alias: string; ready: boolean }[] }
export interface Countdown { t: "countdown"; n: number }
/** Inicio de partida o estado completo al reconectar. */
export interface Snapshot { t: "start"; restanteMs: number; despachados: number; total: number; nivel: Nivel; demo: boolean; practica?: boolean; pod: PodView; rival: RivalView | null }
export interface Result { t: "result"; seq: number; t0: number; zona: number; veredicto: Verdict; waitMs: number; despachados: number; pod: PodView }
/** Despacho aceptado: `despachados` ya incluye este pod y `pod` es el siguiente. */
export interface Dispatched { t: "despachado"; seq: number; t0: number; despachados: number; pod: PodView }
export interface Reject { t: "reject"; seq: number; t0: number; reason: string; waitMs: number }
export type Tramo = "nada" | "parte" | "toda";
export interface Medida { t: "medida"; seq: number; t0: number; zona: number; modo: ModoMedir; punto: string; pasa?: boolean; tension?: Tramo; fraccion?: number }
export interface Rival extends RivalView { t: "rival"; t0?: number }
export interface Score { alias: string; despachados: number; quemadas: number }
/** Zona/circuito con fallos del jugador, para «Qué repasar» del podio. */
export interface Repaso { zona: ZonaNombre; circuito: Circuito; fallos: number; quemadas: number }
/** Carrera final y podio de un jugador. Solo celebra: el ganador ya lo decidió el árbitro. */
export interface Carril {
  /** Número (1-5) del pod que corre; lo elige el azar del árbitro entre los despachados. */
  pod: number;
  /** Llamas de turbo = despachos limpios (pod sin ningún fallo). Solo visual. */
  llamas: number;
  /** Duración de cada pod despachado (ms), cronómetro hacia arriba sin límite. */
  podMs: number[];
  /** Ordenado de más a menos fallos; solo zonas con algún fallo. */
  repasar: Repaso[];
}
/** `carrera` solo viene con phase "fin" (carrera final y podio, propuesta A+D). */
export interface End { t: "end"; phase: "fin" | "anulada"; winner: Station | null; reason: string; score: Partial<Record<Station, Score>>; carrera?: Partial<Record<Station, Carril>> }
export type ServerMsg = Welcome | Full | Lobby | Countdown | Snapshot | Result | Dispatched | Reject | Rival | End | Medida;

export const validAlias = (a: unknown): a is string => typeof a === "string" && a.trim().length >= 1 && a.trim().length <= 12;
