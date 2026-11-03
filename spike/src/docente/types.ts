/** Contrato de datos del panel docente (ver DOCENTE-CONTRATO.md). Solo tipos: lo puede importar la API y el panel. */
import type { Demo, Perfil } from "../engine/generador.js";
import type { Nivel, Phase, Repaso, RivalStatus, Station } from "../protocol.js";

export interface Sesion { codigo: string; nivel: Nivel; creada: string; estado: "abierta" | "cerrada" }

export interface JugadorPartida {
  estacion: Station;
  alias: string;
  /** Id opaco del alumno (alumnos.json) si entró con `?alumno=<id>`; opcional: las partidas viejas no lo traen. */
  alumnoId?: string;
  despachados: number;
  quemadas: number;
  /** Zonas/circuitos con fallos de este jugador (vacío si no falló o la partida se anuló). */
  repasar: Repaso[];
  /** Duración de cada pod despachado (ms). */
  podMs: number[];
}

export interface Partida {
  id: string;
  sala: string;
  /** Código de la sesión docente que originó la partida (hoy = sala); null si no hay. Opcional: las partidas viejas no lo traen. */
  sesion?: string | null;
  /** 1, 2 o "mixto" (pods 1-4 de nivel 1 y el pod 5 con una falla de nivel 2). */
  nivel: Perfil;
  semilla: number;
  demo: Demo;
  /** ISO 8601 (UTC). */
  inicio: string;
  fin: string;
  fase: "fin" | "anulada";
  /** Estación ganadora; null = empate o anulada. */
  ganador: Station | null;
  motivo: string;
  jugadores: JugadorPartida[];
}

/** Fila del CSV de la partida (mismas columnas que CSV_HEADER del árbitro). Vacíos = "". */
export interface Intento {
  jugador: Station;
  intento: string;
  zona: string;
  piezas: string;
  resultado: "ok" | "fallo" | "despacho";
  tiempo_ms: number;
  quemada: "si" | "no";
  pod: number;
  tiempo_pod_ms: string;
  /** Nivel real del pod (1 o 2; en "mixto" el pod 5 es 2). */
  nivel: number;
  /** radar|cabina|turbina|reactor; "" en filas despacho. */
  zona_nombre: string;
  /** Solución del pod según el motor; "" en filas despacho. Solo servidor/docente: nunca viaja al cliente. */
  pieza_correcta: string;
}

export interface EstadoVivo {
  sala: string;
  fase: Phase;
  restanteMs: number;
  jugadores: { alias: string; despachados: number; estado: RivalStatus }[];
  /** ISO 8601; el lector descarta vivos con más de ~15 s (el árbitro pudo caerse sin borrarlo). */
  actualizado: string;
}

export interface FilaFallos { zona: string; circuito: string; fallos: number; quemadas: number; jugadores: number }

/** Fila de `alumnos.json` (la mantiene el panel docente). Solo `id`, `nombre` y `alias` salen por `GET /alumno/:id`. */
export interface Alumno { id: string; nombre: string; alias?: string; curso?: string; sesion?: string }
/** Respuesta pública de `GET /alumno/:id`: nada más. */
export interface AlumnoPublico { id: string; nombre: string; alias: string }
