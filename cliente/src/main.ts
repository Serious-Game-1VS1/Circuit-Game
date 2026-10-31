/// <reference types="vite/client" />
import * as Phaser from "phaser";
import { crearTransporte, Net, textoCompartir, type Config } from "./net";
import type { Transport } from "../../spike/src/transport/transport";
import { Carrera, Podio } from "./carrera";
import type { Fase, Pantalla } from "./pantalla";
import { Taller } from "./taller";
import { cargarArte, letras, marco } from "./arte";
import { desbloquear, desbloquearEnGestos, eventosDe, sonar } from "./audio";
import { ponerMusica } from "./musica";
import { inicial } from "./pantalla";
import type { Nivel } from "../../spike/src/protocol";
import { aplicarPartida, cargarPerfil, firmaEnd, guardarPerfil, mejorNave, registrarOleada, registrarTotal, resultadoDe } from "./perfil";
import { hayFantasma, guardarPendiente, panelRecompensas, tomarPendiente } from "./recompensas";
import { MEJORAS } from "./mejoras";
import { menu } from "./inicio";
import { Intro } from "./intro";
import { MAX_LLAMAS } from "./progreso";

const W = 360, H = 640; // diseño vertical; Scale.FIT lo ajusta a cualquier pantalla
const ESCENA: Record<Fase, string> = { entrar: "Entrar", sala: "Sala", cuenta: "Cuenta", taller: "Taller", carrera: "Carrera", podio: "Podio", fin: "Fin" };

/** Sin transporte de duelo válido (p. ej. Photon sin App ID) la práctica sigue funcionando; entrar avisa que no hay sala. */
function transporteDuelo(): Transport {
  try {
    return crearTransporte(import.meta.env as Config, location);
  } catch (error) {
    console.error(error);
    return { onMessage: () => {}, create: async () => {}, join: async () => { throw error; }, send: () => {}, close: async () => {} };
  }
}
const net = new Net(transporteDuelo());
if (import.meta.env.DEV) Object.assign(window, { net }); // solo en desarrollo: inspección desde la consola

const texto = (s: Phaser.Scene, x: number, y: number, t: string, size = 18, color = "#fff") =>
  s.add.text(x, y, t, { fontSize: `${size}px`, color, align: "center", wordWrap: { width: W - 32 } }).setOrigin(0.5, 0);

const boton = (s: Phaser.Scene, x: number, y: number, t: string, ancho: number, color: string, fn: () => void) =>
  s.add.text(x, y, t, { fontSize: "20px", color: "#fff", backgroundColor: color, fixedWidth: ancho, align: "center", padding: { y: 14 } })
    .setOrigin(0.5).setInteractive({ useHandCursor: true }).on("pointerdown", () => { desbloquear(); sonar("clic"); fn(); });

/** Cada escena se pinta desde la Pantalla; la red decide cuándo cambiar de escena. */
abstract class Base extends Phaser.Scene {
  abstract pintar(p: Pantalla): void;
}

class Entrar extends Base {
  private ui?: ReturnType<typeof menu>;
  constructor() { super("Entrar"); }
  preload() { cargarArte(this); } // el menú usa el kit; Sala lo reutiliza (cargarArte no repite texturas)
  create() {
    this.ui = menu(this, net);
    this.pintar(net.estado);
    const g = tomarPendiente(); // práctica recién terminada
    if (g) { this.ui.refrescar(); panelRecompensas(this, g.eventos, g.perfil, g.otra && (() => void net.practicar(g.otra!.alias, g.otra!.nivel, false, g.otra!.oleadas))); }
  }
  pintar(p: Pantalla) { this.ui?.pintar(p); }
}

class Sala extends Base {
  private lista!: Phaser.GameObjects.Text;
  private listo!: Phaser.GameObjects.Text;
  private version!: Phaser.GameObjects.Text;
  constructor() { super("Sala"); }
  create() {
    texto(this, W / 2, 60, "Sala", 28);
    // Tarjeta con el código grande para pasárselo a un amigo (copiar / compartir; el enlace lleva solo ?sala=).
    marco(this, W / 2, 180, "panel_oscuro", 328, 160, 2);
    letras(this, W / 2, 112, "Comparte este código con un amigo", 1.5, 0x9ab0c8).setOrigin(0.5, 0).setMaxWidth(296).setCenterAlign();
    letras(this, W / 2, 140, net.codigo, 5, 0xe0a43c).setOrigin(0.5, 0);
    const compartible = typeof navigator !== "undefined" && typeof navigator.share === "function";
    const btn = (x: number, w: number, t: string, primario: boolean, fn: (l: ReturnType<typeof letras>) => void) => {
      marco(this, x, 230, primario ? "boton_primario" : "boton_secundario", w, 44, 4);
      const l = letras(this, x, 230, t, 2.5).setOrigin(0.5);
      this.add.zone(x, 230, w, 44).setInteractive({ useHandCursor: true }).on("pointerdown", () => { desbloquear(); sonar("clic"); fn(l); });
    };
    btn(compartible ? W / 2 - 80 : W / 2, compartible ? 148 : 296, "COPIAR", true, (l) => {
      const aviso = (t: string) => { l.setText(t); this.time.delayedCall(1500, () => l.setText("COPIAR")); };
      if (!navigator.clipboard?.writeText) return aviso("Cópialo a mano");
      navigator.clipboard.writeText(net.codigo).then(() => aviso("¡Copiado!"), () => aviso("Cópialo a mano"));
    });
    if (compartible) btn(W / 2 + 80, 148, "COMPARTIR", false, () => {
      try { void navigator.share({ text: textoCompartir(location.href, net.codigo) }).catch(() => {}); } catch { /* sin compartir */ }
    });
    this.lista = texto(this, W / 2, 290, "", 20);
    this.listo = boton(this, W / 2, 520, "Listo", W - 32, "#3bb273", () => { net.listo(); this.listo.setText("Esperando al rival…").disableInteractive().setBackgroundColor("#232a44"); });
    this.version = this.add.text(W / 2, 550, "", { fontSize: "12px", color: "#e0a43c", align: "center", wordWrap: { width: W - 32 } }).setOrigin(0.5, 0);
    boton(this, W / 2, 594, "Salir", W - 32, "#3a4466", () => void net.salir());
    // Precarga el arte del Taller (~244 PNG): «Listo» espera a que termine, así la cuenta 3-2-1 (y el reloj) no
    // arranca con este equipo aún cargando ni deja la pantalla en negro tras la cuenta.
    cargarArte(this, 470);
    this.load.once("complete", () => this.pintar(net.estado));
    this.load.start();
    this.pintar(net.estado);
  }
  pintar(p: Pantalla) {
    const filas = p.jugadores.map((j) => `${j.alias}${j.station === p.station ? " (tú)" : ""}  ${j.ready ? "✔ listo" : "…"}`);
    this.lista.setText([...filas, ...(p.jugadores.length < 2 ? ["Esperando al rival…"] : [])].join("\n\n"));
    // El botón sigue al árbitro: si te desmarca (el rival se fue o reconectaste) vuelve a «Listo».
    this.version.setText(p.versionAviso ?? "");
    const yo = p.jugadores.find((j) => j.station === p.station);
    if (yo?.ready) this.listo.setText("Esperando al rival…").disableInteractive();
    else if (this.load.isLoading()) this.listo.setText("Cargando…").disableInteractive();
    else if (yo) this.listo.setText("Listo").setInteractive({ useHandCursor: true });
    this.listo.setBackgroundColor(this.listo.input?.enabled ? "#3bb273" : "#232a44"); // verde = botón; gris = estado (esperando/cargando)
  }
}

class Cuenta extends Base {
  private n!: Phaser.GameObjects.Text;
  constructor() { super("Cuenta"); }
  create() {
    this.n = texto(this, W / 2, 240, "", 120);
    this.pintar(net.estado);
  }
  pintar(p: Pantalla) { this.n.setText(String(p.cuenta)); }
}

class Fin extends Base {
  constructor() { super("Fin"); }
  create() {
    const p = net.estado;
    texto(this, W / 2, 120, p.fin?.titulo ?? "", 36);
    texto(this, W / 2, 200, p.fin?.detalle ?? "", 18, "#ddd");
    boton(this, W / 2, 520, "Volver a jugar", W - 32, "#3bb273", () => void net.salir());
    const g = tomarPendiente();
    if (g) panelRecompensas(this, g.eventos, g.perfil);
  }
  pintar() {}
}

desbloquearEnGestos(); // los móviles bloquean el audio hasta un gesto; se reintenta hasta que suene

const game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: "#1b1f2a",
  parent: document.body,
  dom: { createContainer: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  scene: [Intro, Entrar, Sala, Cuenta, new Taller(net), new Carrera(net), new Podio(net), Fin],
});
if (import.meta.env.DEV) Object.assign(window, { game }); // solo en desarrollo: capturas e inspección

let anterior = inicial();
ponerMusica(anterior); // arranca sola cuando el audio se desbloquea con el primer gesto
net.onCambio = (p) => {
  for (const e of eventosDe(anterior, p)) sonar(e);
  ponerMusica(p);
  const r = net.tutorial ? null : resultadoDe(anterior, p); // el tutorial no da XP
  if (r) {
    const previo = cargarPerfil((p.alias ?? anterior.alias ?? "").trim() || "Aprendiz");
    const firma = anterior.practica ? undefined : firmaEnd(p.end!, net.codigo);
    if (!firma || previo.ultimoEnd !== firma) { // el árbitro reenvía el End al reentrar con el mismo código y alias
      const aplicado = aplicarPartida(previo, { ...r, puntos: r.puntos + net.extra, dominio: net.dominio }, firma);
      const oleada = anterior.oleadas ? registrarOleada(aplicado.perfil, anterior.nivel, r.pods) : null;
      // Práctica normal de 5 pods: tu tiempo total corre contra tu mejor marca antes de Recompensas.
      const total = anterior.practica && !anterior.oleadas && net.podMs.length === r.pods && r.pods > 0 ? registrarTotal(oleada?.perfil ?? aplicado.perfil, anterior.nivel, net.podMs.reduce((a, b) => a + b, 0)) : null;
      const perfil = total?.perfil ?? oleada?.perfil ?? aplicado.perfil;
      guardarPerfil(perfil);
      const fantasma = total && { ms: net.podMs.reduce((a, b) => a + b, 0), previo: total.previo, nave: mejorNave(perfil), llamas: Math.min(net.mejorRacha, MAX_LLAMAS), mejoras: net.usadas.map((m) => MEJORAS[m].tag).join(" ") };
      const eventos = { ...aplicado.eventos, ...(oleada && { oleada: { pods: r.pods, racha: net.mejorRacha, record: oleada.record, nuevo: oleada.nuevo, diag: net.diagnosticos } }) };
      guardarPendiente(eventos, perfil, anterior.practica ? { alias: perfil.alias, nivel: anterior.nivel, oleadas: anterior.oleadas } : undefined, fantasma ?? undefined);
    }
  }
  anterior = p;
  const key = hayFantasma() ? "Carrera" : ESCENA[p.fase]; // práctica terminada: primero la carrera contra tu récord
  if (game.scene.isActive(key)) return (game.scene.getScene(key) as Base).pintar(p);
  // Se paran también las que siguen cargando (si no, su create() las mostraría encima) y por el SceneManager:
  // s.scene.stop() encola hasta el próximo frame y dos cambios seguidos (welcome → sala → taller de la práctica)
  // dejaban la escena vieja activa y saltaban la nueva.
  for (const s of game.scene.getScenes(false)) {
    const st = s.sys.settings.status;
    if (s.sys.settings.key !== key && st >= Phaser.Scenes.START && st < Phaser.Scenes.SHUTDOWN) game.scene.stop(s.sys.settings.key);
  }
  // Escena aún en su preload (arte del kit): create() la pintará con net.estado; reiniciarla cortaría la carga.
  if (game.scene.getScene(key)?.sys.settings.status === Phaser.Scenes.LOADING) return;
  game.scene.start(key);
};
