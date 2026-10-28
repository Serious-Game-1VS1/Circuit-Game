/**
 * Lógica de vista de una zona del taller, sin Phaser: textos y aguja a partir de lo que manda el
 * árbitro (ZonaView y veredicto). El cliente no conoce la solución ni muestra cifras eléctricas
 * (amperios, voltios medidos); solo las etiquetas impresas en las piezas y en la batería.
 */
import type { Circuito, PodView, Verdict, ZonaNombre, ZonaView } from "../../spike/src/protocol";

export type Aguja = "poco" | "correcto" | "demasiado";

export interface Vista {
  /** null = sin aguja (cortocircuito). */
  aguja: Aguja | null;
  quemado: boolean;
  cortocircuito: boolean;
  mensaje: string;
}

export const NOMBRE_ZONA: Record<ZonaNombre, string> = { radar: "Radar", cabina: "Cabina", turbina: "Turbina", reactor: "Reactor" };

/** Qué pide cada zona, sin decir cómo. */
export const RETO: Record<Circuito, string> = {
  led: "Enciende el LED sin quemarlo",
  cabina: "Enciende los dos LED sin quemarlos",
  luces: "Monta las luces: si una falla, la otra sigue",
  interruptor: "Conecta el interruptor para que gire el motor",
  fusible: "Elige el fusible que protege al calefactor",
  invertido: "El LED no enciende: averigua por qué con el multímetro",
  abierto: "El LED no enciende: busca el corte con el multímetro",
};

/** Qué se elige en la gaveta: pieza o montaje. */
export const GAVETA: Record<Circuito, string> = {
  led: "Elige una resistencia (más Ω, más freno)", cabina: "Elige una resistencia (más Ω, más freno)", luces: "Elige el montaje",
  interruptor: "Elige el montaje", fusible: "Elige un fusible (A = lo que aguanta)",
  invertido: "Elige la posición del LED", abierto: "Elige qué hacer con el corte",
};

/** Nombre estable de cada resistencia por valor (textos.js, gaveta.res): más Ω, más freno. */
export const FRENA: Record<string, string> = { "100": "Frena poco", "220": "Frena algo", "470": "Frena medio", "1000": "Frena mucho" };

/**
 * Pistas visuales del primer pod en modo demo (sin narrador). Textos de textos.js: errores.sin_resistencia,
 * circuito.cablesAyuda y tutorial.p6; «colocar» no existe en textos.js (el prototipo no arrastraba piezas).
 */
export const PISTA_DEMO = {
  elegir: "Pon una pieza que frene la corriente.",
  colocar: "Arrastra cada pieza a la placa.",
  cablear: "Arrastra de un punto a otro, o tócalos uno y luego otro.",
  probar: "Prueba si funciona",
} as const;

const MONTAJE: Record<string, string> = { serie: "Serie", paralelo: "Paralelo", puente: "Puente", directa: "Girar el LED", inversa: "Dejar el LED", empalmar: "Empalmar", dejar: "Dejar igual" };

/** ¿Probar está activo? Hay elección, la zona sigue sin reparar, no hay espera y cambió algo desde la última prueba (el árbitro rechaza «sin-cambios»). */
export function probarActivo(eleccion: string | undefined, ultima: string | undefined, reparada: boolean, espera: boolean): boolean {
  return !!eleccion && eleccion !== ultima && !reparada && !espera;
}

/** Leyenda de los iconos de las pestañas de zona (rojo = alerta, verde = reparada, cian = la que ves). */
export const LEYENDA_ZONAS = "Rojo: falla  Verde: lista  Cian: aquí";

/**
 * La fuente pixel no trae º, •, —, −, =, «», … ni ✔: se cambian por glifos que sí tiene.
 * Si añades glifos a arte/ui/fuente_pixel.*, quita su línea de aquí.
 */
export const aPixel = (t: string) => t.replace(/º/g, "").replace(/[•—−]/g, "-").replace(/ ?= ?/g, ": ").replace(/[«»]/g, '"').replace(/…/g, "...").replace(/ ?✔/g, "");

/** Tiempos (ms) de los carteles al despachar: el «¡REPARADO!» termina antes de que llegue el pod nuevo (sale en 450 ms, entra a los 250). */
export const CARTEL = { reparadoMs: 350, averiaRetraso: 700, avisoDespachoMs: 450, puntosMs: 550 } as const;

/** Texto sobre el botón Probar mientras dura el bloqueo ("" si no hay): el jugador ve que el clic no se perdió. */
export const textoProbarEspera = (esperaHasta: number, ahora: number): string =>
  esperaHasta > ahora ? `Probar · ${Math.ceil((esperaHasta - ahora) / 1000)} s` : "";

/** Etiqueta de la pieza tal como viene impresa ("470 Ω", "0,5 A") o el nombre del montaje. */
export function textoOpcion(pieza: string, circuito: Circuito): string {
  if (circuito === "led" || circuito === "cabina") return `${pieza} Ω`;
  if (circuito === "fusible") return `${pieza.replace(".", ",")} A`;
  return MONTAJE[pieza] ?? pieza;
}

export const textoVolts = (v: number) => `${String(v).replace(".", ",")} V`;

const CARGA: Record<Circuito, { poco: string; demasiado: string; quema: string }> = {
  led: { poco: "El LED casi no brilla: llega poca corriente. Prueba una resistencia que frene menos.", demasiado: "El LED sufre: llega demasiada corriente. Prueba una que frene más.", quema: "¡El LED se quemó! Frenaste muy poco. Espera y prueba una que frene más." },
  cabina: { poco: "Los LED casi no brillan: llega poca corriente. Prueba una resistencia que frene menos.", demasiado: "Los LED sufren: llega demasiada corriente. Prueba una que frene más.", quema: "¡Un LED se quemó! Frenaste muy poco. Espera y prueba una que frene más." },
  luces: { poco: "Las luces brillan débil: no reciben toda la batería. Cambia cómo están conectadas.", demasiado: "Las luces sufren: reciben demasiado. Revisa cómo están conectadas.", quema: "¡Una luz se quemó! Recibió demasiado. Espera y revisa cómo están conectadas." },
  interruptor: { poco: "El motor no arranca: le llega poca corriente. Revisa los cables.", demasiado: "El motor sufre: recibe demasiado. Revisa los cables.", quema: "¡El motor se quemó! Recibió demasiado. Espera y revisa los cables." },
  invertido: { poco: "El LED no enciende: está al revés y no deja pasar la corriente. Prueba girarlo.", demasiado: "El LED sufre. Revisa su posición.", quema: "¡El LED se quemó! Espera y revisa su posición." },
  abierto: { poco: "El LED no enciende: el circuito está cortado y no pasa corriente. Prueba cerrar el corte.", demasiado: "El LED sufre. Revisa el circuito.", quema: "¡El LED se quemó! Espera y revisa el circuito." },
  fusible: { poco: "El fusible corta aunque no hay falla: es demasiado fino. Prueba otro.", demasiado: "El calefactor sufre: el fusible deja pasar demasiado. Prueba uno que corte antes.", quema: "El fusible no cortó a tiempo y el calefactor se quemó. Prueba uno que corte antes." },
};

/** Lo que se muestra a partir del veredicto que manda el árbitro (SCRUM-90): el cliente no decide. */
export function vistaDeVeredicto(label: Verdict, circuito: Circuito = "led"): Vista {
  if (label === "corto") return { aguja: null, quemado: false, cortocircuito: true, mensaje: "¡Cortocircuito! La corriente tiene un atajo sin carga. Revisa los cables." };
  const t = CARGA[circuito];
  if (label === "se quema") return { aguja: "demasiado", quemado: true, cortocircuito: false, mensaje: t.quema };
  return { aguja: label, quemado: false, cortocircuito: false, mensaje: label === "correcto" ? "¡Correcto!" : t[label] };
}

/** Pestañas de las zonas dañadas del pod (1 a 4), en orden de zona. */
export const pestanas = (pod: PodView, actual: number) =>
  [...pod.zonas].sort((a, b) => a.zona - b.zona)
    .map((z) => ({ zona: z.zona, texto: `${NOMBRE_ZONA[z.nombre]}${z.reparada ? " ✔" : ""}`, activa: z.zona === actual, reparada: z.reparada }));

export const reparadas = (pod: PodView) => `Zonas reparadas: ${pod.zonas.filter((z) => z.reparada).length}/${pod.zonas.length}`;

/** Botones de la gaveta en el orden que manda el árbitro (ya aleatorio); ninguno se distingue salvo el elegido. */
export const botonesGaveta = (z: ZonaView, elegida: string | undefined) =>
  z.opciones.map((pieza) => ({ pieza, texto: textoOpcion(pieza, z.circuito), elegida: pieza === elegida }));

/** Consejos de electrónica de la pantalla de carga (rotan cada pocos segundos). */
export const CONSEJOS = [
  "Una resistencia más grande frena más la corriente.",
  "Mide con el multímetro antes de cambiar piezas.",
  "Un LED sin resistencia se quema: protégelo.",
  "Un fusible se funde para salvar el circuito.",
  "Si el circuito está abierto, la corriente no pasa.",
];
