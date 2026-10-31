/**
 * Lógica de pantalla pura (sin Phaser ni red): qué escena y qué textos ve el jugador a partir de
 * los mensajes del árbitro. La prueba vive en test/pantalla.test.ts.
 */
import { BURN_CARD_MS } from "../../spike/src/arbiter/penalties";
import { PROTOCOL_VERSION, validAlias, type End, type Medida, type Nivel, type PodView, type RivalView, type ServerMsg, type Station, type TipoSabotaje } from "../../spike/src/protocol";
import { avisoEnviado, avisoRecibido } from "./sabotaje";
import { NOMBRE_ZONA, vistaDeVeredicto, type Vista } from "./vista";

/** "carrera" y "podio": fin normal con carrera final; "fin": partida anulada (o árbitro sin carrera). */
export type Fase = "entrar" | "sala" | "cuenta" | "taller" | "carrera" | "podio" | "fin";

export interface Pantalla {
  fase: Fase;
  /** Aviso para el jugador (error de entrada, rechazo del árbitro). */
  aviso: string | null;
  /** Aviso discreto (Sala) si el árbitro habla otra versión del protocolo; la partida sigue. */
  versionAviso?: string;
  station?: Station;
  alias?: string;
  jugadores: { station: Station; alias: string; ready: boolean }[];
  cuenta: number;
  despachados: number;
  total: number;
  nivel: Nivel;
  /** Modo demo del árbitro (--demo): solo Radar; el Taller oculta pestañas y multímetro. */
  demo: boolean;
  /** Práctica en solitario: sin rival ni reloj; al terminar se vuelve a la entrada (SCRUM-151). */
  practica: boolean;
  /** Modo Oleadas (práctica sin fin): sin tope de pods; termina a las 3 quemadas (QUEMADAS_OLEADAS). */
  oleadas: boolean;
  /** Piezas quemadas de la partida (se muestran en Oleadas). */
  quemadas: number;
  pod?: PodView;
  /** "Despachar" enviado, esperando la confirmación o el rechazo del árbitro. */
  despachando: boolean;
  rival: RivalView | null;
  /** Tarjeta "pieza quemada": zona y hora local hasta la que se muestra (≥ BURN_CARD_MS). */
  tarjeta: { zona: number; hasta: number } | null;
  /** Racha de despachos del árbitro (0-3; con 3 el bono de enfriamiento reducido está listo) y el último aviso suyo; `n` cuenta los avisos para que la escena reaccione una vez. */
  racha: number;
  eco?: { n: number; tipo: EcoTipo };
  /** Pods limpios seguidos (0-3) según el árbitro: al tercero ganas un sabotaje. */
  limpios: number;
  /** Sabotaje que sufres: `hasta` = hora local en que acaba; `n` cuenta los recibidos para que la escena lo muestre una vez. */
  sabotaje?: { tipo: TipoSabotaje; hasta: number; n: number };
  /** Sabotaje que enviaste (solo avisa; `n` cuenta los enviados). */
  enviado?: { tipo: TipoSabotaje; hasta: number; n: number };
  /** Último veredicto del árbitro, por zona. */
  vistas: Record<number, Vista>;
  /** Hora local (ms) en que se acaba el tiempo de partida. */
  terminaEn: number;
  /** Hora local (ms) en que termina el bloqueo que anuncia el aviso ("espera N s"). */
  esperaHasta: number;
  fin?: { titulo: string; detalle: string };
  /** Mensaje de fin tal cual (carrera y podio se pintan desde aquí). */
  end?: End;
  /** Última lectura del multímetro (la escena la muestra tras ~1 s; ver multimetro.ts). */
  medida?: Medida;
}

/** Qué pasó con la racha en el último intento: lo decide el árbitro, la escena solo reacciona. */
export type EcoTipo = "acierto" | "listo" | "usado" | "perdido" | "fallo" | "sabotaje" | "ataque";

/** La partida ya terminó: no se reconecta y el resultado se conserva. */
export const terminada = (p: Pantalla) => p.fase === "fin" || p.fase === "carrera" || p.fase === "podio";

export function inicial(): Pantalla {
  return {
    fase: 'entrar',
    alias: '',
    aviso: null,
    jugadores: [],
    cuenta: 0,
    despachados: 0,
    total: 5,
    nivel: 1,
    demo: false,
    practica: false,
    oleadas: false,
    quemadas: 0,
    racha: 0,
    limpios: 0,
    despachando: false,
    rival: null,
    tarjeta: null,
    vistas: {},
    terminaEn: 0,
    esperaHasta: 0
  };
}

/** Nombres de las zonas aún sin reparar, separados por comas ("" si no falta ninguna). */
export const faltan = (pod: PodView | undefined): string => pod?.zonas.filter((z) => !z.reparada).map((z) => NOMBRE_ZONA[z.nombre]).join(", ") ?? "";

export const despachable = (p: Pantalla | undefined): boolean => 
  !!p && p.fase === "taller" && !p.despachando && !!p.pod?.zonas.every((z) => z.reparada);

/** Lo que le falta al jugador en la zona: elegir pieza (Radar), poner piezas en la placa o cablearlas. null = puede probar. */
export type Falta = "elegir" | "colocar" | "cablear" | null;
/**
 * Pista del primer pod en modo demo: lo que falta (`falta`: flecha o resalte de la gaveta o la placa) y,
 * cuando ya no falta nada, "probar" (resalte en Probar). Desaparece para siempre al primer intento
 * (`intento`) o con cualquier veredicto.
 */
export const pistaDemo = (p: Pantalla | undefined, intento: boolean, falta: Falta): Exclude<Falta, null> | "probar" | null =>
  !p || !p.demo || intento || p.fase !== "taller" || p.pod?.numero !== 1 || Object.keys(p.vistas ?? {}).length > 0 ? null : falta ?? "probar";

export const tarjetaVisible = (p: Pantalla, zona: number, ahora: number) => p.tarjeta?.zona === zona && ahora < p.tarjeta.hasta;

export const normalizarCodigo = (c: string) => c.trim().toUpperCase();

/** null si se puede entrar; si no, el aviso a mostrar. */
export function validarEntrada(codigo: string, alias: string): string | null {
  if (!/^[A-Z0-9]{6}$/.test(normalizarCodigo(codigo))) return "El código tiene 6 letras o números";
  if (!validAlias(alias)) return "El alias debe tener de 1 a 12 caracteres";
  return null;
}

const ESTADO: Record<RivalView["estado"], string> = { reparando: "reparando", penalizado: "enfriando", "sin-conexion": "sin conexión" };
export const textoRival = (r: RivalView | null, total = 5) => (r ? `${r.alias}: ${r.despachados}/${total} pods · ${ESTADO[r.estado]}` : "Rival: —");

const segundos = (ms: number) => Math.ceil(ms / 1000);
export function textoRechazo(reason: string, waitMs: number): string {
  if (reason === "enfriamiento") return `Espera ${segundos(waitMs)} s y vuelve a probar`;
  if (reason === "quemada") return `Pieza quemada: espera ${segundos(waitMs)} s`;
  if (reason === "sin-cambios") return "No cambiaste nada. Cambia una pieza o un cable y prueba.";
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

/** Rótulo del botón CHECK: «ESPERA 2», «ESPERA 1» durante el enfriamiento y «CHECK» después. */
export const textoCheck = (esperaHasta: number, ahora: number) => (esperaHasta > ahora ? `ESPERA ${segundos(esperaHasta - ahora)}` : "CHECK");

/** El aviso con el "espera N s" descontando en vivo; al acabar el bloqueo se quita la espera. */
export function avisoVivo(p: Pantalla, ahora: number): string | null {
  const s = segundos(p.esperaHasta - ahora);
  const t = p.aviso?.replace(/( · )?espera \d+ s( y vuelve a probar)?/i, (m, sep: string | undefined) =>
    s > 0 ? m.replace(/\d+/, String(s)) : sep ? "" : "ya puedes volver a probar");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

/** Versión del árbitro distinta de la del cliente (o ausente: árbitro anterior a la v2): pide recargar; null si coincide. */
export const avisoVersion = (v: number | undefined): string | null => v === PROTOCOL_VERSION ? null : "Versión distinta del servidor: recarga la página";

/** Cuánto se muestra el «Sabotaje enviado». */
export const ENVIADO_MS = 3000;

export function reducir(p: Pantalla, m: ServerMsg, ahora: number): Pantalla {
  switch (m.t) {
    // Al reconectar en plena partida no se pasa por la Sala: el "start" que sigue repone el taller. En práctica (marcada antes del welcome) tampoco.
    case "welcome": return { ...p, fase: p.fase === "entrar" && !p.practica ? "sala" : p.fase, aviso: null, versionAviso: avisoVersion(m.version) ?? undefined, station: m.station, alias: m.alias };
    case "full": return { ...p, aviso: m.reason.charAt(0).toUpperCase() + m.reason.slice(1) };
    // Si alguien se va durante la cuenta, el árbitro vuelve a la sala.
    case "lobby": return { ...p, jugadores: m.players, fase: p.fase === "cuenta" ? "sala" : p.fase };
    case "countdown": return { ...p, fase: "cuenta", cuenta: m.n };
    case "start": return {
      ...p, fase: "taller", aviso: null, despachados: m.despachados, total: m.total, nivel: m.nivel ?? 1, demo: m.demo ?? false, practica: m.practica ?? false, oleadas: m.oleadas ?? false, quemadas: m.despachados === 0 ? 0 : p.quemadas, racha: m.racha ?? 0, limpios: m.limpios ?? 0, pod: m.pod, rival: m.rival,
      sabotaje: m.sabotaje && { tipo: m.sabotaje.tipo, hasta: ahora + m.sabotaje.ms, n: (p.sabotaje?.n ?? 0) + 1 }, enviado: undefined,
      despachando: false, vistas: {}, tarjeta: null, terminaEn: ahora + m.restanteMs, end: undefined,
    };
    case "result": {
      const circuito = p.pod?.zonas.find((z) => z.zona === m.zona)?.circuito;
      // Escudo (práctica): el veredicto sigue siendo "se quema"/"corto", pero la pieza se salva (sin tarjeta, bloqueo ni quemada).
      const base = vistaDeVeredicto(m.veredicto, circuito);
      const vista = m.escudo ? { ...base, quemado: false, cortocircuito: false, mensaje: "¡Escudo! Salvó tu pieza de quemarse. Prueba otra." } : base;
      const listo = m.pod.zonas.every((z) => z.reparada), falta = faltan(m.pod);
      // Falla encadenada: la zona sigue dañada, así que la aguja vuelve a cero y el aviso lo dice.
      const otras = { ...p.vistas };
      delete otras[m.zona];
      const racha = m.racha ?? p.racha, tipo: EcoTipo | null = m.bono ?? (m.veredicto !== "correcto" ? "fallo" : racha > p.racha ? "acierto" : null);
      return {
        ...p, despachados: m.despachados, pod: m.pod, esperaHasta: ahora + m.waitMs, racha, limpios: m.limpios ?? p.limpios,
        // «Sin pista» se recupera al acertar; el enfriamiento largo se gasta en el siguiente fallo (la quemada no lo gasta).
        ...(((m.veredicto === "correcto" && p.sabotaje?.tipo === "sin-pista") || (m.veredicto !== "correcto" && m.veredicto !== "se quema" && m.veredicto !== "corto" && p.sabotaje?.tipo === "enfriamiento")) && { sabotaje: undefined }), ...(tipo && { eco: { n: (p.eco?.n ?? 0) + 1, tipo } }),
        quemadas: p.quemadas + Number(!m.escudo && (m.veredicto === "se quema" || m.veredicto === "corto")),
        vistas: m.hayMas ? otras : { ...p.vistas, [m.zona]: vista },
        tarjeta: vista.quemado || vista.cortocircuito ? { zona: m.zona, hasta: ahora + Math.max(BURN_CARD_MS, m.waitMs) } : p.tarjeta,
        aviso: m.hayMas ? `¡Hay más! ${NOMBRE_ZONA[m.pod.zonas.find((z) => z.zona === m.zona)!.nombre]} tiene otra falla: mide y elige de nuevo` : listo ? "¡Pod reparado! Pulsa Despachar" : m.veredicto === "correcto" && falta ? `${vista.mensaje} Falta reparar: ${falta}` : m.waitMs ? `${vista.mensaje} · espera ${segundos(m.waitMs)} s` : vista.mensaje,
      };
    }
    // El contador sube solo aquí: cuando el árbitro confirma el despacho.
    case "despachado": return {
      ...p, despachados: m.despachados, pod: m.pod, despachando: false, vistas: {}, tarjeta: null, limpios: m.limpios ?? p.limpios,
      aviso: m.enviado ? `¡Pod despachado! ${avisoEnviado(m.enviado)}` : "¡Pod despachado!",
      ...(m.enviado && { enviado: { tipo: m.enviado, hasta: ahora + ENVIADO_MS, n: (p.enviado?.n ?? 0) + 1 }, eco: { n: (p.eco?.n ?? 0) + 1, tipo: "ataque" as const } }),
    };
    case "sabotaje": return {
      ...p, sabotaje: { tipo: m.tipo, hasta: ahora + m.ms, n: (p.sabotaje?.n ?? 0) + 1 }, aviso: avisoRecibido(m.tipo), eco: { n: (p.eco?.n ?? 0) + 1, tipo: "sabotaje" },
    };
    // Un rechazo sin espera (medir ocupado, medida no válida) no borra el enfriamiento que ya corre.
    case "reject": return { ...p, despachando: false, aviso: textoRechazo(m.reason, m.waitMs), esperaHasta: m.waitMs > 0 ? ahora + m.waitMs : p.esperaHasta };
    // Medir no toca avisos ni bloqueos: solo guarda la lectura.
    case "medida": return { ...p, medida: m };
    case "rival": return { ...p, rival: { alias: m.alias, despachados: m.despachados, estado: m.estado },
      aviso: !p.practica && m.despachados >= p.total && p.despachados < p.total ? `${m.alias} terminó sus ${p.total} pods primero: la partida terminó.` : p.aviso };
    case "end":
      if (p.practica) return { ...inicial(), alias: p.alias, aviso: "Práctica terminada: ¡buen trabajo!", end: m };
      return { ...p, fase: m.phase === "fin" && m.carrera ? (p.fase === "podio" ? "podio" : "carrera") : "fin", fin: textoFin(m, p.station), end: m };
    default: return p;
  }
}



