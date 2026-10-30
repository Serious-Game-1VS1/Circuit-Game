/**
 * Lógica pura de la carrera final y el podio (sin Phaser): textos y datos a partir del End del
 * árbitro. El ganador ya viene decidido; la carrera solo celebra. Prueba en test/podio.test.ts.
 * Textos copiados de diseno-taller/prototipo-v3/textos.js (fin, podio, conceptos).
 */
import type { Carril, Circuito, End, Station } from "../../spike/src/protocol";
import { DIAGNOSTICO, puntosDe } from "./progreso";
import type { Eventos } from "./perfil";

export const TXT = {
  decidido: "Ganó {alias}.",
  regla: "Gana quien despacha 5 pods primero.\nSin tiempo: más pods; luego menos quemados", // 2 líneas de ≤ 42 letras a escala 2
  decididoEmpate: "Empate: mismos pods y mismos quemados.",
  porQue5: "{alias} despachó sus 5 pods primero.",
  porQueMas: "{alias} despachó más pods cuando se acabó el tiempo.",
  porQueQuemados: "Mismos pods, pero {alias} quemó menos piezas.",
  carreraTitulo: "Carrera final",
  carreraAyuda: "Así terminó la partida. Cada llama es un pod despachado sin quemar piezas.",
  saltar: "Toca la pantalla para saltar",
  podLuce: "Corre: Pod {n}",
  podio: "Podio",
  primero: "1.º", segundo: "2.º",
  repasar: "Qué repasar",
  repasarNada: "Nada: todo salió a la primera.",
  repasarCero: "No despachaste ningún pod. Practica en el modo Practicar.",
  podLento: "Tu pod más lento fue el {n} ({t}).",
  fantasmaTitulo: "Contra tu récord",
  fantasmaAyuda: "Tu tiempo corre contra tu mejor marca. La carrera solo celebra.",
  fantasmaGana: "¡Superaste tu récord!",
  fantasmaPierde: "Tu récord sigue en pie. ¡Otra vez!",
  fantasmaPrimero: "Primer récord: ahora tienes una marca que batir.",
  fantasmaTu: "Tú · {t}",
  fantasmaRec: "Récord · {t}",
  mejoras: "Mejoras: {m}",
};

// supuesto: concepto (C1..C12 de textos.js) por circuito, según el mapa zona → concepto del handoff.
export const CONCEPTO: Record<Circuito, string> = {
  led: "Frenar la corriente del LED",
  cabina: "Frenar la corriente del LED",
  luces: "Luces en paralelo (un camino cada una)",
  interruptor: "El interruptor va en el camino de lo que controla",
  fusible: "Elegir el fusible",
  invertido: "El LED conduce en un solo sentido (polaridad)",
  abierto: "Un circuito abierto no deja pasar corriente",
  combinar: "La serie suma resistencias, el paralelo las reparte",
  divisor: "El divisor reparte la tensión entre dos resistencias",
  protegido: "Cada componente en serie se come tensión",
  cadena: "Localizar la pieza abierta con continuidad",
};

/** Sprite de carrera del pod N (1-5). supuesto: el pod N de la partida usa el chasis N del kit. */
export const CHASIS = ["pod1_cometa", "pod2_burbuja", "pod3_aguijon", "pod4_yunque", "pod5_raya"] as const;
export const chasis = (pod: number) => CHASIS[(Math.max(1, pod) - 1) % CHASIS.length]!;

/** Chasis de mi carril: mi mejor nave desbloqueada (`mia`, 1-5) o, sin ella, el pod que corre. */
export const chasisCarril = (pod: number, mia?: number) => chasis(mia || pod);

/** Práctica terminada: tu tiempo total contra tu mejor marca de ese nivel (`previo`). Igualarla cuenta como ganar. */
export interface Fantasma { ms: number; previo?: number; nave: number; llamas: number; mejoras: string }
export const contraRecord = (ms: number, previo?: number): "primero" | "gana" | "pierde" => (previo === undefined ? "primero" : ms <= previo ? "gana" : "pierde");

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

export interface Fila { puntos: number; puesto: string; alias: string; gana: boolean; tiempo: string; pods: number; limpios: number; quemados: number; yo: boolean }

/** Filas del podio (ganador primero) y «qué repasar» del jugador `yo`. */
export function podio(e: End, yo?: Station) {
  const est = (["A", "B"] as const).filter((s) => e.score[s]);
  est.sort((a, b) => Number(b === e.winner) - Number(a === e.winner));
  const filas: Fila[] = est.map((s, i) => {
    const sc = e.score[s]!, c = e.carrera?.[s];
    const ms = c?.podMs.reduce((a, b) => a + b, 0) ?? 0;
    return {
      puntos: puntosDe(sc, c),
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
    repasar: repasar.length ? repasar : [yo && e.score[yo]?.despachados === 0 ? TXT.repasarCero : TXT.repasarNada],
    podLento: lento && lento.n ? f(TXT.podLento, { n: lento.n, t: mmss(lento.ms) }) : null,
  };
}

/** Una tarjeta de la pantalla de Recompensas: título corto, detalle (≤ 2 líneas) y si destaca (insignia nueva). */
export interface Tarjeta { titulo: string; detalle?: string; destacada?: boolean }
const corto = (t: string, n = 72) => (t.length > n ? `${t.slice(0, n - 3)}...` : t);

/** Lista de recompensas de la partida en tarjetas (la pantalla las revela de a una). Máximo `max`; las insignias van al final y mandan. */
export function tarjetasRecompensa(ev: Eventos, max = 5): Tarjeta[] {
  const t: Tarjeta[] = [];
  if (ev.oleada) t.push({ titulo: `Oleadas: ${ev.oleada.pods} pods`, detalle: `Racha ${ev.oleada.racha} - ${ev.oleada.nuevo ? "¡nuevo récord!" : `tu récord: ${ev.oleada.record}`}` });
  if (ev.oleada?.diag) t.push({ titulo: `Diagnósticos: ${ev.oleada.diag}`, detalle: `+${ev.oleada.diag * DIAGNOSTICO} XP` });
  if (ev.naves.length) t.push({ titulo: "Nave nueva", detalle: corto(ev.naves.join(", ")) });
  if (ev.nivel2) t.push({ titulo: "¡Nivel 2 abierto!", detalle: "Elígelo en Practicar" });
  if (ev.habilidades.length) t.push({ titulo: "Habilidades", detalle: corto(ev.habilidades.map((c) => `${c.nombre} ${c.estrellas}/3${c.estrellas > c.antes ? " ↑" : c.estrellas < c.antes ? " ↓" : ""}`).join(", ")) });
  const ins = ev.insignias.map((i): Tarjeta => ({ titulo: `Insignia: ${i.nombre}`, detalle: corto(i.descripcion), destacada: true }));
  if (!t.length && !ins.length) return [{ titulo: "Sin novedades", detalle: "Sigue practicando" }];
  const libres = Math.max(0, max - Math.min(ins.length, max));
  const resto = ins.length > max ? ins.length - max + 1 : 0; // si no caben todas, la última resume las demás
  return [...t.slice(0, libres), ...ins.slice(0, resto ? max - 1 : max), ...(resto ? [{ titulo: `Y ${resto} insignias más`, destacada: true }] : [])];
}
