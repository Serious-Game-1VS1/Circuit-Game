/** Presentación de «Logros» (lógica pura; el dibujo está en recompensas.ts). No cambia los datos del perfil. */
import { claves, estrellasTxt, habilidad, nombreDe } from "./dominio";
import { HABILIDAD } from "./podio";
import { INSIGNIAS, NAVES, navesDesbloqueadas, type Perfil } from "./perfil";

/** Textos cortos escritos a propósito (caben en una línea de Logros sin «…» ni líneas envueltas). */
export const CONDICION: Record<string, string> = {
  "primer-pod": "Despacha tu primer pod", "sin-quemadas": "Pods sin quemar piezas", "racha-limpia": "3 pods limpios en partida",
  ganador: "Gana un duelo", constante: "Juega 5 partidas", dominio: "3 estrellas en un concepto", "nivel-2": "Termina el nivel 1",
};
export { HABILIDAD };
const NAVE: Record<string, string> = { Raya: "Todas las insignias" };

export const resumenLogros = (p: Perfil) =>
  `Insignias ${p.insignias.length}/${INSIGNIAS.length} · Habilidades ${claves.filter((k) => habilidad(p.dominio[k]).estrellas > 0).length}/${claves.length} · Naves ${navesDesbloqueadas(p).length}/${NAVES.length}`;

/** Insignia ganada: «✔ Nombre»; la que falta: «· Nombre» y, en la línea de abajo, qué hacer. */
export const filasInsignias = (p: Perfil) =>
  INSIGNIAS.map((i) => p.insignias.includes(i.id) ? `✔ ${i.nombre}` : `· ${i.nombre}\n    ${CONDICION[i.id] ?? i.descripcion}`);

/** Estrellas y nombre corto; «(n/3)» solo si ya hay intentos pero aún no puntúa. */
export const filasHabilidades = (p: Perfil) =>
  claves.map((k) => { const h = habilidad(p.dominio[k]); return `${estrellasTxt(h.estrellas)} ${HABILIDAD[k] ?? nombreDe(k)}${!h.puntuada && h.intentos ? ` (${h.intentos}/3)` : ""}`; });

export const filasNaves = (p: Perfil) => {
  const abiertas = navesDesbloqueadas(p);
  return NAVES.map((n, k) => abiertas.includes(k + 1) ? `✔ ${n.nombre}` : `🔒 ${n.nombre}: ${NAVE[n.nombre] ?? n.condicion}`);
};
