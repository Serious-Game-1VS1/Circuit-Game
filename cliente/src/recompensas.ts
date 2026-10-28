/**
 * Paneles de recompensa del perfil (SCRUM-166): «Recompensas» al terminar una partida e «Insignias» (lista).
 * Solo formas y texto de Phaser; la lógica está en perfil.ts. Se dibujan encima de la escena (360x640).
 */
import * as Phaser from "phaser";
import { sonar } from "./audio";
import { letras, marco } from "./arte";
import type { Nivel } from "../../spike/src/protocol";
import { claves, estrellasTxt, habilidad, nombreDe } from "./dominio";
import { INSIGNIAS, NAVES, navesDesbloqueadas, progresoRango, type Eventos, type Perfil } from "./perfil";
import { tarjetasRecompensa, type Fantasma } from "./podio";

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

const AMBAR = 0xe0a43c, VERDE = 0x8fe3a0, GRIS = 0x99aabb;

/**
 * Recompensas en la fuente pixel y marcos del kit: arriba el resumen (XP, rango, barra), debajo una tarjeta por recompensa
 * que aparece cada ~300 ms (todas a la vez con prefers-reduced-motion) y la insignia nueva destacada en ámbar.
 * Los temporizadores son reales (setTimeout), no del reloj de Phaser, y nunca esconden una tarjeta: solo la desplazan.
 */
export function panelRecompensas(s: Phaser.Scene, ev: Eventos, perfil: Perfil, otra?: () => void) {
  const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const raiz = s.add.container(0, 0).setDepth(PROFUNDIDAD);
  if (s.textures.exists("capa_cielo_movil")) raiz.add(s.add.image(0, 0, "capa_cielo_movil").setOrigin(0).setScale(4));
  raiz.add(s.add.rectangle(W / 2, H / 2, W, H, 0x0b0e16, 0.8).setInteractive()); // tapa y bloquea lo de abajo
  const txt = (x: number, y: number, t: string, k: number, color = 0xffffff, ancho = W - 48) => {
    const l = letras(s, x, y, t, k, color).setOrigin(0.5, 0).setCenterAlign().setMaxWidth(ancho).setDropShadow(1, 1, 0x140f1f, 1);
    raiz.add(l); return l;
  };
  txt(W / 2, 16, "RECOMPENSAS", 3, AMBAR);

  // Resumen
  const r = progresoRango(perfil.xp);
  raiz.add(marco(s, W / 2, 112, "panel_oscuro", 328, 124, 2));
  txt(W / 2, 62, `+${ev.xp} XP`, 4, VERDE);
  txt(W / 2, 104, ev.rango ? `¡NUEVO RANGO: ${r.actual}!` : `RANGO: ${r.actual}`, 2, ev.rango ? AMBAR : 0xffffff);
  const ancho = 296, lleno = r.siguiente ? r.n / r.m : 1;
  raiz.add(s.add.rectangle(W / 2 - ancho / 2, 138, ancho, 12, 0x3a4466).setOrigin(0, 0.5));
  raiz.add(s.add.rectangle(W / 2 - ancho / 2, 138, Math.max(2, ancho * lleno), 12, 0x3bb273).setOrigin(0, 0.5));
  txt(W / 2, 152, r.siguiente ? `${r.n}/${r.m} XP hacia ${r.siguiente}` : "Rango máximo", 2, GRIS);

  // Tarjetas: el revelado solo cambia el alpha, con setTimeout real.
  let vivo = true;
  const timers: number[] = [];
  tarjetasRecompensa(ev).forEach((c, k) => {
    const y = 206 + k * 68, h = 64;
    const caja = s.add.container(0, 0);
    caja.add(c.destacada ? marco(s, W / 2, y + h / 2, "boton_primario", 328, h, 4) : marco(s, W / 2, y + h / 2, "panel_oscuro", 328, h, 2));
    caja.add(letras(s, 36, y + 10, c.titulo, 2, c.destacada ? 0x140f1f : 0xffffff).setMaxWidth(288));
    if (c.detalle) caja.add(letras(s, 36, y + 32, c.detalle, 2, c.destacada ? 0x3a2a10 : GRIS).setMaxWidth(288));
    raiz.add(caja);
    const mostrar = () => { if (!vivo) return; caja.setAlpha(1); if (c.destacada) sonar("insignia"); };
    if (reducido) mostrar();
    else { caja.setAlpha(0); timers.push(window.setTimeout(mostrar, 350 + 300 * k)); }
  });

  // Botones
  const dom = s.game.domContainer; // los campos HTML van sobre el canvas: se esconden mientras el panel está abierto
  const antes = dom?.style.display ?? "";
  if (dom) dom.style.display = "none";
  const cerrarTodo = () => { vivo = false; timers.forEach(window.clearTimeout); sonar("clic"); raiz.destroy(); if (dom) dom.style.display = antes; };
  const boton = (x: number, w: number, t: string, primario: boolean, fn: () => void) => {
    raiz.add(marco(s, x, 606, primario ? "boton_primario" : "boton_secundario", w, 48));
    raiz.add(letras(s, x, 606, t, 2.5, primario ? 0x140f1f : 0xffffff).setOrigin(0.5));
    raiz.add(s.add.zone(x, 606, w, 48).setInteractive({ useHandCursor: true }).on("pointerdown", fn));
  };
  if (otra) {
    boton(W / 2 - 84, 160, "OTRA", false, () => { cerrarTodo(); otra(); });
    boton(W / 2 + 84, 160, "CONTINUAR", true, cerrarTodo);
  } else boton(W / 2, 328, "CONTINUAR", true, cerrarTodo);
  s.events.once("shutdown", () => { vivo = false; timers.forEach(window.clearTimeout); });
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
