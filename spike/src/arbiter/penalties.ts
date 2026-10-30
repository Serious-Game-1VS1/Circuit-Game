/**
 * SCRUM-129: penalizaciones por jugador. Sin vidas ni energía: equivocarse solo cuesta tiempo.
 * Clase pura; el reloj lo inyecta el árbitro (ms) para que las pruebas sean deterministas.
 */

/** Enfriamiento por zona tras fallos consecutivos; del tercero en adelante queda en 8 s. */
export const COOLDOWNS_MS = [2000, 4000, 8000] as const;
/**
 * Racha (autoridad del árbitro): tras RACHA_BONO «despachos» seguidos sin fallar (un despacho = el CHECK que
 * completa una zona; el de un pod de una zona también completa el pod) el jugador gana UN bono: su próximo
 * fallo espera la mitad del enfriamiento (8→4, 4→2, 2→1; mínimo 1 s). No se acumula; se gasta o se pierde al fallar.
 */
export const RACHA_BONO = 3;
/** Sabotaje «enfriamiento largo»: el próximo fallo del rival suma esto; el resultado final queda entre 1 s y 10 s. */
export const LARGO_EXTRA_MS = 2000;
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
  /** Despachos (zonas completadas) seguidos sin fallar; se queda en RACHA_BONO mientras el bono espera. */
  racha = 0;
  /** Bono de «enfriamiento reducido» listo para el próximo fallo. */
  bono = false;
  /** Sabotaje «enfriamiento largo» armado hasta esta hora (reloj del árbitro); una sola carga. */
  largoHasta = 0;
  /** Lo que pasó con el bono en la última llamada (para avisar al cliente). */
  bonoEvento: "listo" | "usado" | "perdido" | null = null;

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
  registerSuccess(zone: number, pieces: string[], completa = true): void {
    this.bonoEvento = null;
    this.fails.delete(zone);
    if (completa && !this.bono && ++this.racha >= RACHA_BONO) { this.bono = true; this.bonoEvento = "listo"; }
    this.record(zone, pieces, true, false);
  }

  /** Prueba fallida: enfriamiento 2 → 4 → 8 → 8 s en la zona. Devuelve los ms de espera. */
  registerFailure(zone: number, pieces: string[]): number {
    this.bonoEvento = null;
    const n = (this.fails.get(zone) ?? 0) + 1;
    this.fails.set(zone, n);
    // Primero la mejora de enfriamiento corto, luego la mitad del bono con piso de 1 s (nunca sube lo ya menor).
    let ms = COOLDOWNS_MS[Math.min(n, COOLDOWNS_MS.length) - 1]! * this.cooldownFactor;
    if (this.bono) ms = Math.min(ms, Math.max(1000, ms / 2));
    if (this.bono) this.bonoEvento = "usado";
    // Orden: base × mejora de enfriamiento corto, mitad del bono de racha (piso 1 s), luego +2 s del sabotaje; todo acotado a 1-10 s.
    if (this.now() < this.largoHasta) ms += LARGO_EXTRA_MS;
    this.largoHasta = 0;
    ms = Math.min(10000, Math.max(1000, ms));
    this.bono = false;
    this.racha = 0;
    this.cooldownUntil.set(zone, this.now() + ms);
    this.record(zone, pieces, false, false);
    return ms;
  }

  /** Pieza quemada: prueba fallida que bloquea "Probar" 4 s en todo el pod y muestra tarjeta ≥ 3 s. */
  registerBurn(zone: number, pieces: string[]): void {
    this.bonoEvento = null;
    if (this.bono) this.bonoEvento = "perdido";
    this.racha = 0;
    this.bono = false; // la quemada no tiene enfriamiento que reducir: pierde la racha y el bono
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
