/// <reference types="vite/client" />
import * as Phaser from "phaser";
import { crearTransporte, Net, type Config } from "./net";
import type { Transport } from "../../spike/src/transport/transport";
import { Carrera, Podio } from "./carrera";
import type { Fase, Pantalla } from "./pantalla";
import { Taller } from "./taller";

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
    .setOrigin(0.5).setInteractive({ useHandCursor: true }).on("pointerdown", fn);

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
    boton(this, W / 2, 360, "Entrar", W - 32, "#3bb273", () => void net.entrar(valor("codigo"), valor("alias")));
    // Práctica (SCRUM-151): sin código ni rival; el alias es opcional y por defecto "Aprendiz".
    const nivel = this.add.dom(W - 16 - 56, 436).createFromHTML(`
      <select name="nivel" aria-label="Nivel de práctica" style="width:112px;font-size:18px;padding:12px 4px">
        <option value="1">Nivel 1</option><option value="2">Nivel 2</option></select>`);
    const elegido = () => ((nivel.getChildByName("nivel") as HTMLSelectElement | null)?.value === "2" ? 2 : 1);
    boton(this, 16 + 104, 436, "Practicar", 208, "#3a4466", () => void net.practicar(valor("alias").trim() || "Aprendiz", elegido()));
    boton(this, W / 2, 500, "Tutorial", W - 32, "#3a4466", () => void net.practicar(valor("alias").trim() || "Aprendiz", 1, true));
    this.aviso = texto(this, W / 2, 548, "", 16, "#ff6b6b");
    this.pintar(net.estado);
  }
  pintar(p: Pantalla) { this.aviso.setText(p.aviso ?? ""); }
}

class Sala extends Base {
  private lista!: Phaser.GameObjects.Text;
  private listo!: Phaser.GameObjects.Text;
  constructor() { super("Sala"); }
  create() {
    texto(this, W / 2, 60, "Sala", 28);
    this.lista = texto(this, W / 2, 140, "", 20);
    this.listo = boton(this, W / 2, 520, "Listo", W - 32, "#3bb273", () => { net.listo(); this.listo.setText("Esperando al rival…").disableInteractive(); });
    this.pintar(net.estado);
  }
  pintar(p: Pantalla) {
    const filas = p.jugadores.map((j) => `${j.alias}${j.station === p.station ? " (tú)" : ""}  ${j.ready ? "✔ listo" : "…"}`);
    this.lista.setText([...filas, ...(p.jugadores.length < 2 ? ["Esperando al rival…"] : [])].join("\n\n"));
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
  }
  pintar() {}
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: "#1b1f2a",
  parent: document.body,
  dom: { createContainer: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  scene: [Entrar, Sala, Cuenta, new Taller(net), new Carrera(net), new Podio(net), Fin],
});
if (import.meta.env.DEV) Object.assign(window, { game }); // solo en desarrollo: capturas e inspección

net.onCambio = (p) => {
  const key = ESCENA[p.fase];
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
