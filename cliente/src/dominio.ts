/**
 * Dominio por concepto (SCRUM-166, «mejorar habilidades»): aciertos y fallos acumulados por concepto del podio
 * («Luces en paralelo», «Elegir el fusible»…) y las estrellas que salen de ellos. Lógica pura; prueba en test/dominio.test.ts.
 * Fuente: el cliente cuenta los mensajes del árbitro (práctica y duelo igual): +1 acierto por cada zona de un pod
 * despachado y +1 fallo por cada veredicto que no es «correcto». Límite: si se recarga la página en plena partida, se pierde lo contado antes.
 */
import type { Circuito, PodView, ServerMsg } from "../../spike/src/protocol";
import { CONCEPTO } from "./podio";

export interface Conteo { aciertos: number; fallos: number }
/** Por clave de concepto (el primer circuito que lo usa: led y cabina comparten concepto). */
export type Dominio = Record<string, Conteo>;

/** PROVISIONAL: intentos mínimos para puntuar y umbrales de estrella (porcentaje e intentos). Único sitio donde se cambian. */
export const MIN_INTENTOS = 3;
export const UMBRALES = [{ pct: 0.6, min: MIN_INTENTOS }, { pct: 0.8, min: MIN_INTENTOS }, { pct: 0.95, min: 5 }] as const;

export const claveDe = (c: Circuito) => Object.keys(CONCEPTO).find((k) => CONCEPTO[k as Circuito] === CONCEPTO[c])!;
export const nombreDe = (clave: string) => CONCEPTO[clave as Circuito];
export const claves = [...new Set(Object.keys(CONCEPTO).map((c) => claveDe(c as Circuito)))];

/** Habilidad de un concepto: `puntuada` solo con ≥ MIN_INTENTOS; estrellas 0-3. */
export function habilidad(c?: Conteo) {
  const n = c ? c.aciertos + c.fallos : 0;
  if (n < MIN_INTENTOS) return { intentos: n, pct: 0, puntuada: false, estrellas: 0 };
  const pct = c!.aciertos / n;
  return { intentos: n, pct, puntuada: true, estrellas: UMBRALES.filter((u) => pct >= u.pct && n >= u.min).length };
}

export const estrellasTxt = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

const sumar = (d: Dominio, c: Circuito, aciertos: number, fallos: number): Dominio => {
  const k = claveDe(c), o = d[k] ?? { aciertos: 0, fallos: 0 };
  return { ...d, [k]: { aciertos: o.aciertos + aciertos, fallos: o.fallos + fallos } };
};

/** Suma dos tablas (lo contado en la partida al perfil). */
export const unir = (a: Dominio, b: Dominio): Dominio =>
  Object.keys(b).reduce((r, k) => ({ ...r, [k]: { aciertos: (r[k]?.aciertos ?? 0) + b[k]!.aciertos, fallos: (r[k]?.fallos ?? 0) + b[k]!.fallos } }), a);

/** Cuenta de la partida en curso: `pod` es el que el jugador tenía en pantalla antes de este mensaje. Un «start» de partida nueva reinicia. */
export function registrar(d: Dominio, m: ServerMsg, pod?: PodView): Dominio {
  if (m.t === "start") return m.despachados === 0 ? {} : d;
  if (!pod) return d;
  // Falla encadenada: acertar la primera también es un acierto de ese concepto; la segunda cuenta al despachar, como cualquier zona.
  if (m.t === "result" && m.hayMas) {
    const c = pod.zonas.find((z) => z.zona === m.zona)?.circuito;
    return c ? sumar(d, c, 1, 0) : d;
  }
  if (m.t === "result" && m.veredicto !== "correcto") {
    const c = pod.zonas.find((z) => z.zona === m.zona)?.circuito;
    return c ? sumar(d, c, 0, 1) : d;
  }
  return m.t === "despachado" ? pod.zonas.reduce((a, z) => sumar(a, z.circuito, 1, 0), d) : d;
}

export interface Cambio { clave: string; nombre: string; estrellas: number; antes: number }

/** Conceptos con intentos nuevos y ya puntuados, con sus estrellas de antes y de ahora. */
export const cambios = (antes: Dominio, despues: Dominio): Cambio[] =>
  Object.keys(despues).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]) && habilidad(despues[k]).puntuada)
    .map((k) => ({ clave: k, nombre: nombreDe(k), estrellas: habilidad(despues[k]).estrellas, antes: habilidad(antes[k]).estrellas }));

export const flecha = (c: Cambio) => (c.estrellas > c.antes ? " ↑" : c.estrellas < c.antes ? " ↓" : "");
