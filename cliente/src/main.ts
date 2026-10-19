/// <reference types="vite/client" />
import * as Phaser from "phaser";
import { crearTransporte, Net, type Config } from "./net";
import { avisoVivo, reloj, textoRival, type Fase, type Pantalla } from "./pantalla";
import { OPCIONES, textoOpcion, type Aguja } from "./vista";

const W = 360, H = 640; // diseño vertical; Scale.FIT lo ajusta a cualquier pantalla
const ANGULO: Record<Aguja, number> = { poco: -60, correcto: 0, demasiado: 60 };
const ESCENA: Record<Fase, string> = { entrar: "Entrar", sala: "Sala", cuenta: "Cuenta", taller: "Taller", fin: "Fin" };
const net = new Net(crearTransporte(import.meta.env as Config, location));

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
    texto(this, W / 2, 60, "CircuitSync", 30);
    texto(this, W / 2, 104, "Duelo de reparación de pods", 16, "#9ab");
    const form = this.add.dom(W / 2, 260).createFromHTML(`
      <div style="display:flex;flex-direction:column;gap:12px;width:280px;font:18px sans-serif">
        <label style="color:#ddd">Código de sala<input name="codigo" maxlength="6" autocomplete="off"
          style="width:100%;box-sizing:border-box;font-size:22px;padding:10px;text-transform:uppercase"></label>
        <label style="color:#ddd">Alias<input name="alias" maxlength="12" autocomplete="off"
          style="width:100%;box-sizing:border-box;font-size:22px;padding:10px"></label>
      </div>`);
    const campo = (n: string) => form.getChildByName(n) as HTMLInputElement | null;
    const valor = (n: string) => campo(n)?.value ?? "";
    if (net.estado.alias) campo("alias")!.value = net.estado.alias; // "Volver a jugar" conserva el alias
    boton(this, W / 2, 420, "Entrar", W - 32, "#3bb273", () => void net.entrar(valor("codigo"), valor("alias")));
    this.aviso = texto(this, W / 2, 470, "", 16, "#ff6b6b");
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

class Taller extends Base {
  private zona = 0;
  private elegida = 470;
  private ui!: {
    estado: Phaser.GameObjects.Text; rival: Phaser.GameObjects.Text; reloj: Phaser.GameObjects.Text; reto: Phaser.GameObjects.Text;
    pieza: Phaser.GameObjects.Text; leds: Phaser.GameObjects.Arc[]; aguja: Phaser.GameObjects.Rectangle; aviso: Phaser.GameObjects.Text;
    zonas: Phaser.GameObjects.Text[]; opciones: Phaser.GameObjects.Text[];
  };
  constructor() { super("Taller"); }

  create() {
    const estado = texto(this, 16, 8, "", 16).setOrigin(0, 0);
    const relojT = texto(this, W - 16, 8, "", 16).setOrigin(1, 0);
    const rival = texto(this, W / 2, 32, "", 14, "#9ab");
    const zonas = [0, 1].map((z) => boton(this, 92 + z * 176, 76, "", 168, "#2c3344", () => { this.zona = z; this.pintar(net.estado); }));
    const reto = texto(this, W / 2, 104, "", 15, "#9ab");

    // Circuito: batería 9 V → pieza elegida → LED (o dos LED en paralelo en la cabina)
    this.add.graphics().lineStyle(4, 0xcccccc).strokeRect(60, 140, 240, 100);
    this.add.rectangle(60, 190, 36, 60, 0x3a6ea5).setStrokeStyle(2, 0xffffff);
    this.add.text(60, 190, "9 V", { fontSize: "14px", color: "#fff" }).setOrigin(0.5);
    this.add.rectangle(180, 140, 80, 28, 0xc8a46e).setStrokeStyle(2, 0xffffff);
    const pieza = this.add.text(180, 140, "", { fontSize: "14px", color: "#000" }).setOrigin(0.5);
    const leds = [170, 210].map((y) => this.add.circle(300, y, 16, 0x551111).setStrokeStyle(3, 0xffffff));

    // Aguja: tres zonas sin números
    const cx = W / 2, cy = 360;
    const arcos: [Aguja, number][] = [["poco", 0x888888], ["correcto", 0x3bb273], ["demasiado", 0xe06c3c]];
    arcos.forEach(([nombre, color], i) => {
      const a0 = Phaser.Math.DegToRad(-180 + i * 60), a1 = Phaser.Math.DegToRad(-120 + i * 60);
      this.add.graphics().lineStyle(18, color).beginPath().arc(cx, cy, 80, a0, a1).strokePath();
      const am = (a0 + a1) / 2;
      this.add.text(cx + Math.cos(am) * 130, cy + Math.sin(am) * 108, nombre, { fontSize: "14px", color: "#ddd" }).setOrigin(0.5);
    });
    const aguja = this.add.rectangle(cx, cy, 4, 70, 0xffffff).setOrigin(0.5, 1).setVisible(false);
    const aviso = texto(this, cx, 380, "", 16);

    const opciones = OPCIONES.map((ohms, i) =>
      boton(this, 16 + (i % 2) * 168 + 80, 462 + Math.floor(i / 2) * 60, textoOpcion(ohms), 160, "#2c3344", () => { this.elegida = ohms; this.pintar(net.estado); }));
    boton(this, W / 2, 596, "Probar", W - 32, "#3bb273", () => net.probar(this.zona, this.elegida));

    this.ui = { estado, rival, reloj: relojT, reto, pieza, leds, aguja, aviso, zonas, opciones };
    this.pintar(net.estado);
  }

  update() {
    this.ui.reloj.setText(reloj(net.estado, Date.now()));
    this.ui.aviso.setText(avisoVivo(net.estado, Date.now()) ?? "Elige una resistencia y pulsa Probar");
  }

  pintar(p: Pantalla) {
    const u = this.ui;
    const zonas = p.pod?.zonas ?? [];
    const z = zonas.find((x) => x.zona === this.zona) ?? zonas[0];
    if (!z) return;
    this.zona = z.zona;
    u.estado.setText(`Pod ${Math.min(p.pod!.numero, p.total)} · ${p.despachados}/${p.total}`);
    u.rival.setText(textoRival(p.rival, p.total));
    zonas.forEach((x, i) => u.zonas[i]?.setText(`${x.circuito === "led" ? "Motor" : "Cabina"} ${x.reparada ? "✔" : ""}`)
      .setBackgroundColor(x.zona === this.zona ? "#3a6ea5" : "#2c3344"));
    u.reto.setText(z.reparada ? "Zona reparada" : z.circuito === "led" ? "Enciende el LED sin quemarlo" : "Enciende los dos LED en paralelo");
    u.pieza.setText(textoOpcion(this.elegida));
    u.opciones.forEach((b, i) => b.setBackgroundColor(OPCIONES[i] === this.elegida ? "#3a6ea5" : "#2c3344"));
    const v = p.vistas[this.zona];
    u.aguja.setVisible(!!v?.aguja).setAngle(v?.aguja ? ANGULO[v.aguja] : 0);
    const color = !v ? 0x551111 : v.quemado || v.cortocircuito ? 0x222222 : v.aguja === "correcto" ? 0xff2020 : v.aguja === "poco" ? 0x882222 : 0xff7070;
    u.leds.forEach((l, i) => l.setVisible(i === 0 || z.circuito === "cabina").setFillStyle(color));
    u.aviso.setText(p.aviso ?? "Elige una resistencia y pulsa Probar").setColor(v?.quemado || v?.cortocircuito ? "#ff6b6b" : "#fff");
    if (v?.cortocircuito) this.cameras.main.shake(250, 0.01);
  }
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
  scene: [Entrar, Sala, Cuenta, Taller, Fin],
});

net.onCambio = (p) => {
  const key = ESCENA[p.fase];
  if (game.scene.isActive(key)) return (game.scene.getScene(key) as Base).pintar(p);
  for (const s of game.scene.getScenes(true)) s.scene.stop();
  game.scene.start(key);
};
