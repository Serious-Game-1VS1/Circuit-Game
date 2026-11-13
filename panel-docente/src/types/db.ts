export interface Concepto {
  id: string;
  nombre: string;
  tema: string;
}

export interface Familia {
  familia: string;
  concepto_id: string;
  dificultad: number;
}

export interface Sesion {
  codigo: string;
  nivel: "1" | "2" | "3" | "mixto";
  estado: "abierta" | "cerrada";
  valores_visibles: boolean;
  created_at: string;
  cerrada_at: string | null;
}

export interface JugadorVivo {
  estacion: "A" | "B";
  alias: string;
  despachados: number;
  pod_actual: number;
  zonas_reparadas: number;
  zonas_totales: number;
  quemadas: number;
  estado: "reparando" | "bloqueado" | "sin_conexion";
  segundos_sin_avance: number;
}

export interface SalaVivo {
  sala: string;
  sesion_codigo: string;
  inicio_segundos: number;
  jugadorA: JugadorVivo;
  jugadorB: JugadorVivo;
  actualizado: string;
}

export interface Partida {
  id: string;
  sala: string;
  sesion_codigo: string | null;
  nivel: "1" | "2" | "3" | "mixto";
  demo: boolean;
  inicio: string;
  fin: string;
  fase: "fin" | "anulada";
  ganador: "A" | "B" | null;
  motivo: string | null;
}

export interface PartidaJugador {
  partida_id: string;
  estacion: "A" | "B";
  alias: string;
  alumno_id: string | null;
  despachados: number;
  quemadas: number;
  pod_ms: number[];
  abandono: boolean;
}

export interface Intento {
  id: number;
  partida_id: string;
  estacion: "A" | "B";
  alumno_id: string | null;
  n: number;
  pod: number;
  nivel_pod: number;
  zona: number;
  zona_nombre: "radar" | "cabina" | "turbina" | "reactor";
  familia: string;
  pieza_elegida: string;
  pieza_correcta: string;
  resultado: "ok" | "fallo";
  quemada: boolean;
  t_ms: number;
  medidas_previas: number | null;
  created_at: string;
}

export interface VFallosSesion {
  sesion_codigo: string;
  concepto_id: string;
  zona_nombre: "radar" | "cabina" | "turbina" | "reactor";
  familia: string;
  nivel_pod: number;
  fallos: number;
  quemadas: number;
  intentos: number;
  pct_fallo: number;
  alumnos_con_fallo: number;
}

export interface VFallosEstudiante {
  alumno_id: string;
  alias: string;
  concepto_id: string;
  zona_nombre: "radar" | "cabina" | "turbina" | "reactor";
  familia: string;
  nivel_pod: number;
  fallos: number;
  quemadas: number;
  intentos: number;
  pieza_errada_mas_comun: string | null;
}
