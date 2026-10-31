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
  combinar: "Monta las dos resistencias para que el LED reciba entre 10 y 20 mA",
  divisor: "Tu salida va al Arduino: debe quedar entre 4 y 5 V. Mídela con Tensión",
  protegido: "El diodo se come 0,7 V: la resistencia debe ajustarse",
  cadena: "Una pieza está muerta: hállala con el multímetro y cámbiala",
  fusible3: "Elige el fusible: aguanta el consumo normal y corta la falla",
  placa3: "Resuelve el problema en la placa", // el globo muestra el enunciado del pod
};

/** Qué se arrastra desde la gaveta al hueco: pieza o montaje. */
export const GAVETA: Record<Circuito, string> = {
  led: "Más Ω, más freno", cabina: "Más Ω, más freno", protegido: "Más Ω, más freno", luces: "Arma el montaje", interruptor: "Arma el montaje",
  fusible: "A = lo que aguanta", invertido: "Gira o deja el LED", abierto: "Empalma o deja el corte", combinar: "Una, en serie o en paralelo", divisor: "R2: la de abajo",
  cadena: "Repuestos: arrastra uno a la pieza muerta",
  fusible3: "Lee su tamaño, marca y color",
  placa3: "Usa solo lo que pide el problema",
};

/**
 * Ajustes de la gaveta. `ocultarValor` (nivel 3 «Experto»): sin el texto del valor ni el nombre («470 Ω», «Frena medio»);
 * la pieza se lee solo por sus bandas de color. Ver textoRotulo().
 */
export const AJUSTES_GAVETA = { ocultarValor: false };
/** Nivel 3: las resistencias se leen por sus bandas (el Taller activa `ocultarValor` solo ahí). El fusible de nivel 3 nunca lleva texto de amperios. */
export const esResistencia = (c: Circuito) => c === "led" || c === "cabina" || c === "protegido" || c === "divisor";
export const ocultaValor = (nivel: number | undefined, c: Circuito) => nivel === 3 && esResistencia(c);
/** Rótulo bajo la pieza de la gaveta: su valor impreso, o nada si el nivel lo oculta (solo bandas). */
export const textoRotulo = (pieza: string, circuito: Circuito, ocultar = AJUSTES_GAVETA.ocultarValor) => (ocultar ? "" : textoOpcion(pieza, circuito));

/** Nombre estable de cada resistencia por valor (textos.js, gaveta.res): más Ω, más freno. */
export const FRENA: Record<string, string> = { "100": "Frena poco", "220": "Frena algo", "470": "Frena medio", "1000": "Frena mucho" };

/**
 * Pistas visuales del primer pod en modo demo (sin narrador). Textos de textos.js: errores.sin_resistencia,
 * circuito.cablesAyuda y tutorial.p6; «colocar» no existe en textos.js (el prototipo no arrastraba piezas).
 */
export const PISTA_DEMO = {
  elegir: "Arrastra una pieza al hueco rojo.",
  colocar: "Arrastra cada pieza a la placa.",
  cablear: "Arrastra de un punto a otro, o tócalos uno y luego otro.",
  probar: "Pulsa CHECK para probar",
} as const;

const COMBINAR: Record<string, string> = { una: "Una sola", serie: "En serie", paralelo: "En paralelo" };
const MONTAJE: Record<string, string> = { serie: "Serie", paralelo: "Paralelo", puente: "Puente", directa: "Girar el LED", inversa: "Dejar el LED", empalmar: "Empalmar", dejar: "Dejar igual" };

/** Hueco rojo con «?» donde falta la pieza: igual en todas las mecánicas de gaveta (la placa tiene su propia gaveta de piezas). */
export const conHueco = (c: Circuito, elegida: string | undefined, reparada: boolean): boolean =>
  !elegida && !reparada && c !== "luces" && c !== "interruptor" && c !== "cadena" && c !== "placa3"; // la placa experta tiene sus gavetas; la cadena marca su propio hueco rojo en la pieza que localizas

/** Leyenda de los iconos de las pestañas de zona (rojo = alerta, verde = reparada, cian = la que ves). */
export const LEYENDA_ZONAS = "Rojo: falla  Verde: lista  Cian: aquí";

/**
 * La fuente pixel no trae º, •, —, −, =, «», … ni ✔: se cambian por glifos que sí tiene.
 * Si añades glifos a arte/ui/fuente_pixel.*, quita su línea de aquí.
 */
export const aPixel = (t: string) => t.replace(/º/g, "").replace(/[•—−]/g, "-").replace(/ ?= ?/g, ": ").replace(/[«»]/g, '"').replace(/…/g, "...").replace(/ ?✔/g, "");

/** Tiempos (ms) de los carteles al despachar: el «¡REPARADO!» termina antes de que llegue el pod nuevo (sale en 450 ms, entra a los 250). */
export const CARTEL = { reparadoMs: 350, averiaRetraso: 700, avisoDespachoMs: 450, puntosMs: 550 } as const;

/** Etiqueta de la pieza tal como viene impresa ("470 Ω", "0,5 A") o el nombre del montaje. */
/** Nombre de un repuesto o pieza de la cadena: "cable", "led", "ledInv", "r220". */
export const textoPiezaCadena = (id: string) => id === "cable" ? "Cable" : id === "led" ? "LED" : id === "ledInv" ? "LED giro" : `${id.slice(1)} Ω`;

export function textoOpcion(pieza: string, circuito: Circuito): string {
  if (circuito === "cadena") return textoPiezaCadena(pieza.slice(pieza.indexOf(":") + 1)); // «hueco:repuesto» → el repuesto
  if (circuito === "combinar") return COMBINAR[pieza] ?? pieza;
  if (circuito === "led" || circuito === "cabina" || circuito === "divisor" || circuito === "protegido") return `${pieza} Ω`;
  if (circuito === "fusible") return `${pieza.replace(".", ",")} A`;
  if (circuito === "fusible3") return ""; // nivel 3: se reconoce por tamaño, marca y color, no por «1 A»
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
  combinar: { poco: "El LED casi no brilla: llega poca corriente. Prueba otro montaje que frene menos.", demasiado: "El LED sufre: llega demasiada corriente. Prueba otro montaje que frene más.", quema: "¡El LED se quemó! Frenaste muy poco. Espera y prueba un montaje que frene más." },
  divisor: { poco: "Al Arduino le llega muy poca tensión. Mide R2 con Tensión y prueba otra.", demasiado: "Al Arduino le llega más tensión de la que le gusta. Prueba otra R2.", quema: "¡Se quemó el pin del Arduino! Le llegó demasiada tensión. Espera y prueba otra R2." },
  protegido: { poco: "El LED casi no brilla: el diodo y la resistencia se comen mucha tensión. Prueba una que frene menos.", demasiado: "El LED sufre: llega demasiada corriente. Prueba una que frene más.", quema: "¡El LED se quemó! Frenaste muy poco. Espera y prueba una que frene más." },
  // Sin decir cuál pieza ni por qué: ni qué falla ni si el repuesto o el hueco son los equivocados.
  cadena: { poco: "El LED no enciende. Mide las piezas con el multímetro y revisa qué repuesto pusiste y dónde.", demasiado: "El LED sufre: llega demasiada corriente. Revisa el repuesto que pusiste.", quema: "¡El LED se quemó! Espera y revisa el repuesto que pusiste." },
  fusible3: { poco: "El fusible corta aunque no hay falla: es muy fino o muy rápido para esta carga. Prueba otro.", demasiado: "El calefactor sufre: el fusible deja pasar demasiado. Prueba uno que corte antes.", quema: "El fusible no cortó a tiempo y el calefactor se quemó. Prueba uno que corte antes." },
  placa3: { poco: "El LED casi no brilla: llega poca corriente. Mide y revisa las resistencias.", demasiado: "El LED sufre: llega demasiada corriente. Revisa las resistencias.", quema: "¡Un LED se quemó! Le llegó demasiada corriente. Espera y revisa el montaje." },
  fusible: { poco: "El fusible corta aunque no hay falla: es demasiado fino. Prueba otro.", demasiado: "El calefactor sufre: el fusible deja pasar demasiado. Prueba uno que corte antes.", quema: "El fusible no cortó a tiempo y el calefactor se quemó. Prueba uno que corte antes." },
};

/** Lo que se muestra a partir del veredicto que manda el árbitro (SCRUM-90): el cliente no decide. */
export function vistaDeVeredicto(label: Verdict, circuito: Circuito = "led"): Vista {
  if (label === "corto") return { aguja: null, quemado: false, cortocircuito: true, mensaje: "¡Cortocircuito! La corriente tiene un atajo sin carga. Revisa los cables." };
  const t = CARGA[circuito];
  if (label === "se quema") return { aguja: "demasiado", quemado: true, cortocircuito: false, mensaje: t.quema };
  // placa3: no cumple el problema; no se dice qué conexión falla (luz ámbar, penaliza como «poco»)
  if (label === "mal") return { aguja: "poco", quemado: false, cortocircuito: false, mensaje: "Mal conectado: el montaje no cumple el problema. Mide y revisa las conexiones." };
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

/** Retraso (ms) con que entra la nave `i` de la cola: escalonado de 250 ms al iniciar la partida; después entra de inmediato. */
export const retrasoCola = (i: number, inicio: boolean): number => (inicio ? i * 250 : 0);
