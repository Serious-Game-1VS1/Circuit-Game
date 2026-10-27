/**
 * SCRUM-129: penalizaciones por jugador. Sin vidas ni energía: equivocarse solo cuesta tiempo.
 * Clase pura; el reloj lo inyecta el árbitro (ms) para que las pruebas sean deterministas.
 */

/** Enfriamiento por zona tras fallos consecutivos; del tercero en adelante queda en 8 s. */
export const COOLDOWNS_MS = [2000, 4000, 8000] as const;
export const BURN_BLOCK_MS = 4000;
export const BURN_CARD_MS = 3000;
/** Modo Oleadas (práctica sin fin): la partida termina al acumular estas piezas quemadas. */
export const QUEMADAS_OLEADAS = 3;

export interface Attempt {
  zone: number;
  pieces: string[];
  passed: boolean;
  /** ms desde que se creó el tracker (inicio de partida). */
  atMs: number;
  burned: boolean;
}

export type TestCheck =
  | { ok: true }
  | { ok: false; reason: "sin-cambios" | "enfriamiento" | "quemada"; waitMs: number };

export class PenaltyTracker {
  private readonly t0: number;
  private readonly fails = new Map<number, number>();
  private readonly cooldownUntil = new Map<number, number>();
  private burnAt = -Infinity;
  private readonly log: Attempt[] = [];
  /** Mejora «Enfriamiento corto» (solo práctica): multiplica los 2/4/8 s; 1 = sin cambio. */
  cooldownFactor = 1;

  constructor(private readonly now: () => number) {
    this.t0 = now();
  }

  /** ¿Se puede pulsar "Probar" en esta zona? `changed`: hubo cambios desde la última prueba. */
  canTest(zone: number, changed: boolean): TestCheck {
    const t = this.now();
    const burnWait = this.burnAt + BURN_BLOCK_MS - t;
    if (burnWait > 0) return { ok: false, reason: "quemada", waitMs: burnWait };
    const coolWait = (this.cooldownUntil.get(zone) ?? 0) - t;
    if (coolWait > 0) return { ok: false, reason: "enfriamiento", waitMs: coolWait };
    if (!changed) return { ok: false, reason: "sin-cambios", waitMs: 0 };
    return { ok: true };
  }

  /** Prueba superada: se registra y se reinicia la racha de fallos de la zona. */
  registerSuccess(zone: number, pieces: string[]): void {
    this.fails.delete(zone);
    this.record(zone, pieces, true, false);
  }

  /** Prueba fallida: enfriamiento 2 → 4 → 8 → 8 s en la zona. Devuelve los ms de espera. */
  registerFailure(zone: number, pieces: string[]): number {
    const n = (this.fails.get(zone) ?? 0) + 1;
    this.fails.set(zone, n);
    const ms = (COOLDOWNS_MS[Math.min(n, COOLDOWNS_MS.length) - 1] ?? 8000) * this.cooldownFactor;
    this.cooldownUntil.set(zone, this.now() + ms);
    this.record(zone, pieces, false, false);
    return ms;
  }

  /** Pieza quemada: prueba fallida que bloquea "Probar" 4 s en todo el pod y muestra tarjeta ≥ 3 s. */
  registerBurn(zone: number, pieces: string[]): void {
    this.burnAt = this.now();
    this.record(zone, pieces, false, true);
  }

  /** La tarjeta de pieza quemada sigue visible. */
  burnCardVisible(): boolean {
    return this.now() - this.burnAt < BURN_CARD_MS;
  }

  /** Pod nuevo: el enfriamiento de todas las zonas vuelve a 2 s. */
  newPod(): void {
    this.fails.clear();
    this.cooldownUntil.clear();
  }

  /** Medir con el voltímetro: siempre permitido y no cuenta como intento. */
  measure(): true {
    return true;
  }

  get attemptsLog(): readonly Attempt[] {
    return this.log;
  }

  /** CSV UTF-8 (con BOM para Excel), separador ";". Sin datos personales. */
  toCsv(): string {
    const rows = this.log.map((a, i) =>
      [i + 1, a.zone, a.pieces.join("|"), a.passed ? "ok" : "fallo", a.atMs, a.burned ? "si" : "no"]
        .map((v) => csvField(String(v)))
        .join(";"),
    );
    return "﻿" + ["intento;zona;piezas;resultado;tiempo_ms;quemada", ...rows].join("\r\n") + "\r\n";
  }

  private record(zone: number, pieces: string[], passed: boolean, burned: boolean): void {
    this.log.push({ zone, pieces: [...pieces], passed, atMs: this.now() - this.t0, burned });
  }
}

export function csvField(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
