/// <reference types="vite/client" />
import * as Phaser from "phaser";
import { crearTransporte, Net, type Config } from "./net";
import type { Transport } from "../../spike/src/transport/transport";
import { Carrera, Podio } from "./carrera";
import type { Fase, Pantalla } from "./pantalla";
import { Taller } from "./taller";
import { cargarArte } from "./arte";
import { botonSilencio, desbloquear, desbloquearEnGestos, eventosDe, sonar } from "./audio";
import { inicial } from "./pantalla";
import type { Nivel } from "../../spike/src/protocol";
import { aplicarPartida, cargarPerfil, firmaEnd, guardarPerfil, INSIGNIAS, cambiarNivel, nivelElegido, textoNivel, mejorNave, progresoRango, registrarOleada, registrarTotal, resultadoDe } from "./perfil";
import { hayFantasma, guardarPendiente, panelLogros, panelRecompensas, tomarPendiente } from "./recompensas";
import { MEJORAS } from "./mejoras";
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
  private aviso!: Phaser.GameObjects.Text;
  constructor() { super("Entrar"); }
  create() {
    texto(this, W / 2, 40, "CircuitSync", 30);
    texto(this, W / 2, 84, "Duelo de reparación de pods", 16, "#9ab");
    const form = this.add.dom(W / 2, 220).createFromHTML(`
      <div style="display:flex;flex-direction:column;gap:12px;width:280px;font:18px sans-serif">
        <label style="color:#ddd">Código de sala<input name="codigo" maxlength="6" autocomplete="off"
          style="width:100%;box-sizing:border-box;font-size:22px;padding:10px;text-transform:uppercase"></label>
        <label style="color:#ddd">Alias<input name="alias" maxlength="12" autocomplete="off"
          style="width:100%;box-sizing:border-box;font-size:22px;padding:10px"></label>
      </div>`);
    const campo = (n: string) => form.getChildByName(n) as HTMLInputElement | null;
    const valor = (n: string) => campo(n)?.value ?? "";
    if (net.estado.alias) campo("alias")!.value = net.estado.alias; // "Volver a jugar" conserva el alias
    boton(this, W / 2, 360, "Jugar duelo", W - 32, "#3bb273", () => void net.entrar(valor("codigo"), valor("alias")));
    // Perfil del alias escrito: rango, XP e insignias.
    const rango = texto(this, W / 2, 104, "", 15, "#9ab");
    let sel: Nivel = 1, pfActual = cargarPerfil("Aprendiz");
    const selector = texto(this, W / 2, 560, "", 13, "#9ab"); // solo la práctica usa el nivel: en duelo lo fija el servidor (--nivel/NIVEL)
    selector.setInteractive({ useHandCursor: true }).on("pointerdown", () => { sel = cambiarNivel(pfActual, sel); selector.setText(textoNivel(pfActual, sel)); });
    const refrescar = () => {
      const pf = pfActual = cargarPerfil(valor("alias").trim() || "Aprendiz"), r = progresoRango(pf.xp);
      sel = nivelElegido(pf, sel); selector.setText(textoNivel(pf, sel));
      rango.setText(`${r.actual} · ${pf.xp} XP · ${pf.insignias.length}/${INSIGNIAS.length} insignias`);
      return pf;
    };
    campo("alias")?.addEventListener("input", refrescar);
    const ver = this.add.text(16, 590, "Ver logros", { fontSize: "16px", color: "#9ab", padding: { y: 14 } }).setInteractive({ useHandCursor: true });
    ver.on("pointerdown", () => panelLogros(this, refrescar()));
    // Práctica (SCRUM-151): sin código ni rival; el alias es opcional y por defecto "Aprendiz". Oleadas y el selector de nivel siguen en el código (net.practicar), fuera del menú.
    boton(this, W / 2, 424, "Practicar", W - 32, "#3a4466", () => void net.practicar(valor("alias").trim() || "Aprendiz", nivelElegido(pfActual, sel)));
    boton(this, W / 4 + 4, 488, "Tutorial", W / 2 - 24, "#3a4466", () => void net.practicar(valor("alias").trim() || "Aprendiz", 1, true));
    // Parte opcional: fusible, LED girado, corte de cable y placa con cables (nivel 2, semilla fija).
    boton(this, (3 * W) / 4 - 4, 488, "Tutorial 2", W / 2 - 24, "#3a4466", () => void net.practicar(valor("alias").trim() || "Aprendiz", 2, true, false, 2));
    this.aviso = texto(this, W / 2, 536, "", 16, "#ff6b6b");
    botonSilencio(this, W - 30, 30);
    refrescar();
    this.pintar(net.estado);
    const g = tomarPendiente(); // práctica recién terminada
    if (g) { refrescar(); panelRecompensas(this, g.eventos, g.perfil, g.otra && (() => void net.practicar(g.otra!.alias, g.otra!.nivel, false, g.otra!.oleadas))); }
  }
  pintar(p: Pantalla) { this.aviso.setText(p.aviso ?? "").setColor(p.aviso?.startsWith("Práctica terminada") ? "#8fe3a0" : "#ff6b6b"); }
}

class Sala extends Base {
  private lista!: Phaser.GameObjects.Text;
  private listo!: Phaser.GameObjects.Text;
  constructor() { super("Sala"); }
  create() {
    texto(this, W / 2, 60, "Sala", 28);
    texto(this, W / 2, 100, `Código: ${net.codigo}`, 18, "#9ab"); // para compartirlo con el rival
    this.lista = texto(this, W / 2, 140, "", 20);
    this.listo = boton(this, W / 2, 520, "Listo", W - 32, "#3bb273", () => { net.listo(); this.listo.setText("Esperando al rival…").disableInteractive().setBackgroundColor("#232a44"); });
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
  scene: [Entrar, Sala, Cuenta, new Taller(net), new Carrera(net), new Podio(net), Fin],
});
if (import.meta.env.DEV) Object.assign(window, { game }); // solo en desarrollo: capturas e inspección

let anterior = inicial();
net.onCambio = (p) => {
  for (const e of eventosDe(anterior, p)) sonar(e);
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
