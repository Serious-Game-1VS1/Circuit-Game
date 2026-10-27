import type { Arbiter } from "../arbiter/arbiter.js";
import type { EstadoVivo, Partida } from "./types.js";

/** Partida terminada (fin o anulada) a partir del árbitro; `sala` es el código, `inicioMs`/`finMs` el reloj de pared. */
export function partidaDe(a: Arbiter, sala: string, inicioMs: number, finMs: number): Partida {
  const o = a.outcome!;
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    id: `${iso(inicioMs).slice(0, 19).replace(/[-:]/g, "")}-${sala}`,
    sala, sesion: sala || null, nivel: a.nivel, semilla: a.semilla, demo: a.demo,
    inicio: iso(inicioMs), fin: iso(finMs), fase: o.phase as "fin" | "anulada",
    ganador: o.winner, motivo: o.reason,
    jugadores: Object.entries(o.score).map(([est, s]) => {
      const c = o.carrera?.[est as "A" | "B"];
      return { estacion: est as "A" | "B", alias: s.alias, despachados: s.despachados, quemadas: s.quemadas, repasar: c?.repasar ?? [], podMs: c?.podMs ?? [] };
    }),
  };
}

export const vivoDe = (a: Arbiter, sala: string, ahoraMs: number): EstadoVivo =>
  ({ sala, fase: a.phase, ...a.vivo(), actualizado: new Date(ahoraMs).toISOString() });
