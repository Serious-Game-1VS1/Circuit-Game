/**
 * Lógica pura de la carrera final y el podio (sin Phaser): textos y datos a partir del End del
 * árbitro. El ganador ya viene decidido; la carrera solo celebra. Prueba en test/podio.test.ts.
 * Textos copiados de diseno-taller/prototipo-v3/textos.js (fin, podio, conceptos).
 */
import type { Carril, Circuito, End, Station } from "../../spike/src/protocol";

export const TXT = {
  decidido: "El ganador ya está decidido: {alias}.",
  decididoEmpate: "Empate: mismos pods y mismos quemados.",
  porQue5: "{alias} despachó sus 5 pods primero.",
  porQueMas: "{alias} despachó más pods antes de los 12 min.",
  porQueQuemados: "Mismos pods, pero {alias} quemó menos piezas.",
  carreraTitulo: "Carrera final",
  carreraAyuda: "Cada llama = un despacho limpio. La carrera solo celebra: no cambia el ganador.",
  saltar: "Toca para saltar",
  podLuce: "Corre: Pod {n}",
  podio: "Podio",
  primero: "1.º", segundo: "2.º",
  repasar: "Qué repasar",
  repasarNada: "Nada: todo salió a la primera.",
  podLento: "Tu pod más lento fue el {n} ({t}).",
};

// supuesto: concepto (C1..C12 de textos.js) por circuito, según el mapa zona → concepto del handoff.
export const CONCEPTO: Record<Circuito, string> = {
  led: "Frenar la corriente del LED",
  cabina: "Frenar la corriente del LED",
  luces: "Luces en paralelo (un camino cada una)",
  interruptor: "El interruptor va en el camino de lo que controla",
  fusible: "Elegir el fusible",
};

/** Sprite de carrera del pod N (1-5). supuesto: el pod N de la partida usa el chasis N del kit. */
export const CHASIS = ["pod1_cometa", "pod2_burbuja", "pod3_aguijon", "pod4_yunque", "pod5_raya"] as const;
export const chasis = (pod: number) => CHASIS[(Math.max(1, pod) - 1) % CHASIS.length]!;

export const f = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => String(v[k] ?? m));

export const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const otra = (s: Station): Station => (s === "A" ? "B" : "A");

/** Por qué ganó (o empate), con los mismos desempates del árbitro. */
export function decision(e: End): string {
  const g = e.winner && e.score[e.winner];
  if (!e.winner || !g) return TXT.decididoEmpate;
  const r = e.score[otra(e.winner)];
  const porQue = e.reason === "5 pods despachados" ? TXT.porQue5 : r && r.despachados === g.despachados ? TXT.porQueQuemados : TXT.porQueMas;
  return `${f(TXT.decidido, { alias: g.alias })}\n${f(porQue, { alias: g.alias })}`;
}

export interface Fila { puesto: string; alias: string; gana: boolean; tiempo: string; pods: number; limpios: number; quemados: number; yo: boolean }

/** Filas del podio (ganador primero) y «qué repasar» del jugador `yo`. */
export function podio(e: End, yo?: Station) {
  const est = (["A", "B"] as const).filter((s) => e.score[s]);
  est.sort((a, b) => Number(b === e.winner) - Number(a === e.winner));
  const filas: Fila[] = est.map((s, i) => {
    const sc = e.score[s]!, c = e.carrera?.[s];
    const ms = c?.podMs.reduce((a, b) => a + b, 0) ?? 0;
    return {
      puesto: e.winner === null ? TXT.primero : i === 0 ? TXT.primero : TXT.segundo, alias: sc.alias, gana: s === e.winner,
      tiempo: mmss(ms), pods: sc.despachados, limpios: c?.llamas ?? 0, quemados: sc.quemadas, yo: s === yo,
    };
  });
  const mio: Carril | undefined = yo ? e.carrera?.[yo] : undefined;
  // Un concepto por línea; zonas distintas con el mismo concepto se juntan.
  const repasar = [...new Set((mio?.repasar ?? []).map((r) => CONCEPTO[r.circuito]))];
  const lento = mio?.podMs.reduce((m, ms, i) => (ms > m.ms ? { n: i + 1, ms } : m), { n: 0, ms: -1 });
  return {
    filas,
    repasar: repasar.length ? repasar : [TXT.repasarNada],
    podLento: lento && lento.n ? f(TXT.podLento, { n: lento.n, t: mmss(lento.ms) }) : null,
  };
}
