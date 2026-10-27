/**
 * Paneles de recompensa del perfil (SCRUM-166): «Recompensas» al terminar una partida e «Insignias» (lista).
 * Solo formas y texto de Phaser; la lógica está en perfil.ts. Se dibujan encima de la escena (360x640).
 */
import * as Phaser from "phaser";
import { sonar } from "./audio";
import type { Nivel } from "../../spike/src/protocol";
import { claves, estrellasTxt, flecha, habilidad, nombreDe } from "./dominio";
import { INSIGNIAS, NAVES, navesDesbloqueadas, progresoRango, type Eventos, type Perfil } from "./perfil";
import type { Fantasma } from "./podio";
import { DIAGNOSTICO } from "./progreso";

const W = 360, H = 640, PROFUNDIDAD = 2000;

/** Lo que dejó la última partida, hasta que una escena de fin lo muestre (una sola vez). */
let pendiente: { eventos: Eventos; perfil: Perfil; otra?: { alias: string; nivel: Nivel; oleadas?: boolean }; fantasma?: Fantasma } | null = null;
/** `otra` solo en práctica: alias y nivel para arrancar otra práctica sin pasar por Entrar (en duelo hace falta sala). `fantasma`: la carrera contra tu récord que va antes de Recompensas. */
export const guardarPendiente = (eventos: Eventos, perfil: Perfil, otra?: { alias: string; nivel: Nivel; oleadas?: boolean }, fantasma?: Fantasma) => { pendiente = { eventos, perfil, otra, fantasma }; };
export const tomarPendiente = () => { const p = pendiente; pendiente = null; return p; };
export const hayFantasma = () => !!pendiente?.fantasma;
/** La carrera se lleva el fantasma; los eventos siguen pendientes para Recompensas. */
export const tomarFantasma = () => { const g = pendiente?.fantasma; if (pendiente) pendiente.fantasma = undefined; return g; };

function capa(s: Phaser.Scene, titulo: string, otra?: () => void) {
  const o: Phaser.GameObjects.GameObject[] = [];
  const poner = <T extends Phaser.GameObjects.GameObject>(g: T) => { o.push(g); (g as unknown as Phaser.GameObjects.Components.Depth).setDepth(PROFUNDIDAD); return g; };
  const fondo = poner(s.add.rectangle(W / 2, H / 2, W, H, 0x10141e).setInteractive()); // tapa y bloquea lo de abajo
  const t = (y: number, txt: string, size = 18, color = "#fff") => poner(s.add.text(W / 2, y, txt, { fontSize: `${size}px`, color, align: "center", wordWrap: { width: W - 40 } }).setOrigin(0.5, 0));
  t(40, titulo, 28, "#e0a43c");
  const cerrar = poner(s.add.text(W / 2, 590, "Continuar", { fontSize: "20px", color: "#fff", backgroundColor: "#3bb273", fixedWidth: W - 32, align: "center", padding: { y: 14 } })
    .setOrigin(0.5).setInteractive({ useHandCursor: true }));
  const dom = s.game.domContainer; // los campos HTML van sobre el canvas: se esconden mientras el panel está abierto
  const antes = dom?.style.display ?? "";
  if (dom) dom.style.display = "none";
  const cerrarTodo = () => { sonar("clic"); o.forEach((g) => g.destroy()); if (dom) dom.style.display = antes; };
  cerrar.on("pointerdown", cerrarTodo);
  if (otra) poner(s.add.text(W / 2, 536, "Otra partida", { fontSize: "20px", color: "#fff", backgroundColor: "#3a4466", fixedWidth: W - 32, align: "center", padding: { y: 14 } })
    .setOrigin(0.5).setInteractive({ useHandCursor: true })).on("pointerdown", () => { cerrarTodo(); otra(); });
  void fondo;
  return { t, poner };
}

export function panelRecompensas(s: Phaser.Scene, ev: Eventos, perfil: Perfil, otra?: () => void) {
  const { t, poner } = capa(s, "Recompensas", otra);
  let y = 90;
  t(y, `+${ev.xp} XP`, 40, "#3bb273"); y += 56;
  if (ev.oleada) {
    t(y, `Oleadas: ${ev.oleada.pods} pods · racha ${ev.oleada.racha}`, 18); y += 28;
    t(y, ev.oleada.nuevo ? "¡Nuevo récord de oleadas!" : `Tu récord: ${ev.oleada.record} pods`, 16, ev.oleada.nuevo ? "#e0a43c" : "#9ab"); y += ev.oleada.diag ? 24 : 34;
    if (ev.oleada.diag) { t(y, `Diagnósticos: ${ev.oleada.diag} (+${ev.oleada.diag * DIAGNOSTICO} XP)`, 16, "#9ad"); y += 34; }
  }
  const r = progresoRango(perfil.xp);
  t(y, ev.rango ? `¡Nuevo rango: ${r.actual}!` : `Rango: ${r.actual}`, 22, ev.rango ? "#e0a43c" : "#fff"); y += 36;
  const ancho = W - 80, lleno = r.siguiente ? r.n / r.m : 1;
  poner(s.add.rectangle(W / 2, y + 8, ancho, 16, 0x3a4466));
  poner(s.add.rectangle(W / 2 - ancho / 2, y + 8, Math.max(2, ancho * lleno), 16, 0x3bb273).setOrigin(0, 0.5));
  y += 28;
  t(y, r.siguiente ? `${r.n}/${r.m} XP hacia ${r.siguiente}` : "Rango máximo", 16, "#9ab"); y += 44;
  if (ev.naves.length) { y += (t(y, `Nave nueva desbloqueada: ${ev.naves.join(", ")}`, 18, "#e0a43c") as Phaser.GameObjects.Text).height + 10; } // puede ocupar 2 líneas
  if (ev.nivel2) { y += (t(y, "¡Nivel 2 desbloqueado! Elígelo en Practicar", 18, "#e0a43c") as Phaser.GameObjects.Text).height + 10; }
  if (ev.habilidades.length) {
    const x = t(y, ev.habilidades.map((c) => `${c.nombre} ${estrellasTxt(c.estrellas)}${flecha(c)}`).join("\n"), 14, "#9ad") as Phaser.GameObjects.Text;
    y += x.height + 10;
  }
  ev.insignias.forEach((i, k) => {
    const x = t(y, `Insignia nueva: ${i.nombre}\n${i.descripcion}`, 14, "#fff") as Phaser.GameObjects.Text;
    s.tweens.add({ targets: x, alpha: { from: 0.2, to: 1 }, duration: 450, delay: 250 * k });
    s.time.delayedCall(250 * k, () => sonar("reparada"));
    y += 42;
  });
  if (!ev.insignias.length && !ev.naves.length && !ev.nivel2 && !ev.habilidades.length) t(y, "Sin insignias nuevas esta vez.", 16, "#9ab");
}

export function panelLogros(s: Phaser.Scene, perfil: Perfil) {
  const { t } = capa(s, "Logros");
  let y = 84;
  const bloque = (titulo: string, lineas: string[], color: string) => {
    t(y, titulo, 15, "#e0a43c"); y += 22;
    const x = t(y, lineas.join("\n"), 13, color) as Phaser.GameObjects.Text;
    y += x.height + 10;
  };
  bloque(`Insignias ${perfil.insignias.length}/${INSIGNIAS.length}`, INSIGNIAS.map((i) => perfil.insignias.includes(i.id) ? `✔ ${i.nombre}` : `· ${i.nombre}: ${i.descripcion}`), "#fff");
  bloque("Habilidades", claves.map((k) => { const h = habilidad(perfil.dominio[k]); return `${nombreDe(k)} ${estrellasTxt(h.estrellas)}${h.puntuada ? "" : ` (${h.intentos}/3 intentos)`}`; }), "#9ad");
  const abiertas = navesDesbloqueadas(perfil);
  bloque("Naves", NAVES.map((n, k) => abiertas.includes(k + 1) ? `✔ ${n.nombre}` : `🔒 ${n.nombre}: ${n.condicion}`), "#fff");
}
