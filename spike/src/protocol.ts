/**
 * Contrato de mensajes entre árbitro y clientes. Solo tipos y validaciones puras: lo importan
 * el árbitro (Node) y el cliente Phaser (navegador), así que no puede depender de Node.
 *
 * Cliente -> árbitro: Hello | Ready | TestMsg
 * Árbitro -> cliente: Welcome | Full | Lobby | Countdown | Snapshot | Result | Reject | Rival | End
 * La solución del pod nunca viaja: el cliente manda su elección y recibe solo el veredicto.
 */
import type { Label } from "./engine/circuit.js";

export type Station = "A" | "B";
export type Phase = "esperando" | "listo" | "cuenta" | "jugando" | "fin" | "anulada";
export type RivalStatus = "reparando" | "penalizado" | "sin-conexion";
export type Circuito = "led" | "cabina";
export type Verdict = Label | "corto";

export interface Hello { t: "hello"; alias: string }
export interface Ready { t: "ready" }
export interface TestMsg { t: "test"; seq: number; t0: number; zone: number; ohms: number }
export type ClientMsg = Hello | Ready | TestMsg;

export interface PodView { numero: number; zonas: { zona: number; circuito: Circuito; reparada: boolean }[] }
export interface RivalView { alias: string; despachados: number; estado: RivalStatus }

export interface Welcome { t: "welcome"; station: Station; alias: string }
export interface Full { t: "full"; reason: string }
export interface Lobby { t: "lobby"; phase: Phase; players: { station: Station; alias: string; ready: boolean }[] }
export interface Countdown { t: "countdown"; n: number }
/** Inicio de partida o estado completo al reconectar. */
export interface Snapshot { t: "start"; restanteMs: number; despachados: number; total: number; pod: PodView; rival: RivalView | null }
export interface Result { t: "result"; seq: number; t0: number; zona: number; veredicto: Verdict; waitMs: number; despachados: number; pod: PodView }
export interface Reject { t: "reject"; seq: number; t0: number; reason: string; waitMs: number }
export interface Rival extends RivalView { t: "rival"; t0?: number }
export interface Score { alias: string; despachados: number; quemadas: number }
export interface End { t: "end"; phase: "fin" | "anulada"; winner: Station | null; reason: string; score: Partial<Record<Station, Score>> }
export type ServerMsg = Welcome | Full | Lobby | Countdown | Snapshot | Result | Reject | Rival | End;

export const validAlias = (a: unknown): a is string => typeof a === "string" && a.trim().length >= 1 && a.trim().length <= 12;
