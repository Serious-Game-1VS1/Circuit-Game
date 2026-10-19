/**
 * Lógica de pantalla pura (sin Phaser ni red): qué escena y qué textos ve el jugador a partir de
 * los mensajes del árbitro. La prueba vive en test/pantalla.test.ts.
 */
import { validAlias, type End, type PodView, type RivalView, type ServerMsg, type Station } from "../../spike/src/protocol";
import { vistaDeVeredicto, type Vista } from "./vista";

export type Fase = "entrar" | "sala" | "cuenta" | "taller" | "fin";

export interface Pantalla {
  fase: Fase;
  /** Aviso para el jugador (error de entrada, rechazo del árbitro). */
  aviso: string | null;
  station?: Station;
  alias?: string;
  jugadores: { station: Station; alias: string; ready: boolean }[];
  cuenta: number;
  despachados: number;
  total: number;
  pod?: PodView;
  rival: RivalView | null;
  /** Último veredicto del árbitro, por zona. */
  vistas: Record<number, Vista>;
  /** Hora local (ms) en que se acaba el tiempo de partida. */
  terminaEn: number;
  /** Hora local (ms) en que termina el bloqueo que anuncia el aviso ("espera N s"). */
  esperaHasta: number;
  fin?: { titulo: string; detalle: string };
}

export const inicial = (): Pantalla => ({
  fase: "entrar", aviso: null, jugadores: [], cuenta: 0, despachados: 0, total: 5, rival: null, vistas: {}, terminaEn: 0, esperaHasta: 0,
});

export const normalizarCodigo = (c: string) => c.trim().toUpperCase();

/** null si se puede entrar; si no, el aviso a mostrar. */
export function validarEntrada(codigo: string, alias: string): string | null {
  if (!/^[A-Z0-9]{6}$/.test(normalizarCodigo(codigo))) return "El código tiene 6 letras o números";
  if (!validAlias(alias)) return "El alias debe tener de 1 a 12 caracteres";
  return null;
}

const ESTADO: Record<RivalView["estado"], string> = { reparando: "reparando", penalizado: "penalizado", "sin-conexion": "sin conexión" };
export const textoRival = (r: RivalView | null, total = 5) => (r ? `${r.alias}: ${r.despachados}/${total} pods · ${ESTADO[r.estado]}` : "Rival: —");

const segundos = (ms: number) => Math.ceil(ms / 1000);
export function textoRechazo(reason: string, waitMs: number): string {
  if (reason === "enfriamiento") return `Espera ${segundos(waitMs)} s para volver a probar esta zona`;
  if (reason === "quemada") return `Pieza quemada: espera ${segundos(waitMs)} s`;
  if (reason === "sin-cambios") return "Cambia la pieza antes de probar";
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

export function textoFin(e: End, yo?: Station): { titulo: string; detalle: string } {
  const titulo = e.phase === "anulada" ? "Partida anulada" : e.winner === null ? "Empate" : e.winner === yo ? "¡Ganaste!" : "Perdiste";
  const detalle = (["A", "B"] as const)
    .flatMap((s) => { const x = e.score[s]; return x ? [`${x.alias}: ${x.despachados} pods, ${x.quemadas} quemadas`] : []; })
    .join("\n");
  return { titulo, detalle: `${e.reason}\n${detalle}` };
}

/** "mm:ss" del tiempo restante. */
export const reloj = (p: Pantalla, ahora: number) => {
  const s = Math.max(0, Math.ceil((p.terminaEn - ahora) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** El aviso con el "espera N s" descontando en vivo; al acabar el bloqueo se quita la espera. */
export function avisoVivo(p: Pantalla, ahora: number): string | null {
  const s = segundos(p.esperaHasta - ahora);
  const t = p.aviso?.replace(/( · )?espera \d+ s( para volver a probar esta zona)?/i, (m, sep: string | undefined) =>
    s > 0 ? m.replace(/\d+/, String(s)) : sep ? "" : "ya puedes volver a probar");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

export function reducir(p: Pantalla, m: ServerMsg, ahora: number): Pantalla {
  switch (m.t) {
    // Al reconectar en plena partida no se pasa por la Sala: el "start" que sigue repone el taller.
    case "welcome": return { ...p, fase: p.fase === "entrar" ? "sala" : p.fase, aviso: null, station: m.station, alias: m.alias };
    case "full": return { ...p, aviso: m.reason.charAt(0).toUpperCase() + m.reason.slice(1) };
    // Si alguien se va durante la cuenta, el árbitro vuelve a la sala.
    case "lobby": return { ...p, jugadores: m.players, fase: p.fase === "cuenta" ? "sala" : p.fase };
    case "countdown": return { ...p, fase: "cuenta", cuenta: m.n };
    case "start": return {
      ...p, fase: "taller", aviso: null, despachados: m.despachados, total: m.total, pod: m.pod, rival: m.rival,
      vistas: {}, terminaEn: ahora + m.restanteMs,
    };
    case "result": {
      const nuevoPod = m.despachados !== p.despachados;
      const vista = vistaDeVeredicto(m.veredicto);
      return {
        ...p, despachados: m.despachados, pod: m.pod, esperaHasta: ahora + m.waitMs,
        vistas: nuevoPod ? {} : { ...p.vistas, [m.zona]: vista },
        aviso: nuevoPod ? "¡Pod despachado!" : m.waitMs ? `${vista.mensaje} · espera ${segundos(m.waitMs)} s` : vista.mensaje,
      };
    }
    case "reject": return { ...p, aviso: textoRechazo(m.reason, m.waitMs), esperaHasta: ahora + m.waitMs };
    case "rival": return { ...p, rival: { alias: m.alias, despachados: m.despachados, estado: m.estado } };
    case "end": return { ...p, fase: "fin", fin: textoFin(m, p.station) };
  }
}
