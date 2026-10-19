/// <reference types="vite/client" />
import * as Phaser from "phaser";
import { crearTransporte, Net, type Config } from "./net";
import type { Circuito } from "../../spike/src/protocol";
import { avisoVivo, podVisible, reloj, tarjetaVisible, textoRival, type Fase, type Pantalla } from "./pantalla";
import { botonesGaveta, GAVETA, NOMBRE_ZONA, pestanas, reparadas, RETO, textoOpcion, textoVolts, type Aguja } from "./vista";

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

/** Colores de la carga: apagada, poco, correcto, demasiado, quemada. */
const PALETA: Record<Circuito, number[]> = {
  led: [0x551111, 0x882222, 0xff2020, 0xff7070, 0x222222],
  cabina: [0x551111, 0x882222, 0xff2020, 0xff7070, 0x222222],
  luces: [0x55552a, 0x8a8a3a, 0xffe955, 0xffffaa, 0x222222],
  interruptor: [0x333a44, 0x4f6a5a, 0x3bb273, 0x9be0b5, 0x222222],
  fusible: [0x443333, 0x7a4a3a, 0xe06c3c, 0xffa070, 0x222222],
};
const PIEZA_COLOR: Record<Circuito, number> = { led: 0xc8a46e, cabina: 0xc8a46e, luces: 0x8fa3bf, interruptor: 0x8fa3bf, fusible: 0xeeeeee };

class Taller extends Base {
  private zona = 0;
  /** Pieza elegida por zona, con clave "pod-zona": la gaveta empieza sin elección. */
  private elegidas = new Map<string, string>();
  private ui!: {
    estado: Phaser.GameObjects.Text; rival: Phaser.GameObjects.Text; reloj: Phaser.GameObjects.Text; reparadas: Phaser.GameObjects.Text;
    reto: Phaser.GameObjects.Text; volts: Phaser.GameObjects.Text; pieza: Phaser.GameObjects.Text; pinta: Phaser.GameObjects.Rectangle;
    dibujo: Phaser.GameObjects.Graphics; motor: Phaser.GameObjects.Text; aguja: Phaser.GameObjects.Rectangle; aviso: Phaser.GameObjects.Text;
    gaveta: Phaser.GameObjects.Text; zonas: Phaser.GameObjects.Text[]; opciones: Phaser.GameObjects.Text[];
    probar: Phaser.GameObjects.Text; despachar: Phaser.GameObjects.Text; tarjeta: Phaser.GameObjects.Container;
  };
  constructor() { super("Taller"); }

  private clave() { return `${podVisible(net.estado)?.numero}-${this.zona}`; }

  create() {
    const estado = texto(this, 16, 8, "", 16).setOrigin(0, 0);
    const relojT = texto(this, W - 16, 8, "", 16).setOrigin(1, 0);
    const rival = texto(this, W / 2, 32, "", 14, "#9ab");
    const zonas = [0, 1, 2, 3].map((i) => this.add.text(56 + i * 83, 74, "", {
      fontSize: "13px", color: "#fff", backgroundColor: "#2c3344", fixedWidth: 79, align: "center", padding: { y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      const pod = podVisible(net.estado);
      const z = pod && pestanas(pod, this.zona)[i];
      if (z) { this.zona = z.zona; this.pintar(net.estado); }
    }));
    const reparadasT = texto(this, W / 2, 98, "", 13, "#9ab");
    const reto = texto(this, W / 2, 118, "", 15);

    // Circuito: batería → pieza o montaje elegido → carga; el dibujo de la carga depende de `circuito`.
    this.add.graphics().lineStyle(4, 0xcccccc).strokeRect(50, 176, 260, 96);
    this.add.rectangle(50, 224, 46, 60, 0x3a6ea5).setStrokeStyle(2, 0xffffff);
    const volts = this.add.text(50, 224, "", { fontSize: "12px", color: "#fff" }).setOrigin(0.5);
    const pinta = this.add.rectangle(180, 176, 96, 28, 0xc8a46e).setStrokeStyle(2, 0xffffff);
    const pieza = this.add.text(180, 176, "", { fontSize: "14px", color: "#000" }).setOrigin(0.5);
    const dibujo = this.add.graphics();
    const motor = this.add.text(310, 224, "M", { fontSize: "20px", color: "#000", fontStyle: "bold" }).setOrigin(0.5);

    // Aguja: tres zonas sin números
    const cx = W / 2, cy = 384;
    const arcos: [Aguja, number][] = [["poco", 0x888888], ["correcto", 0x3bb273], ["demasiado", 0xe06c3c]];
    arcos.forEach(([nombre, color], i) => {
      const a0 = Phaser.Math.DegToRad(-180 + i * 60), a1 = Phaser.Math.DegToRad(-120 + i * 60);
      this.add.graphics().lineStyle(16, color).beginPath().arc(cx, cy, 72, a0, a1).strokePath();
      const am = (a0 + a1) / 2;
      this.add.text(cx + Math.cos(am) * 130, cy + Math.sin(am) * 92, nombre, { fontSize: "14px", color: "#ddd" }).setOrigin(0.5);
    });
    const aguja = this.add.rectangle(cx, cy, 4, 64, 0xffffff).setOrigin(0.5, 1).setVisible(false);
    const aviso = texto(this, cx, 396, "", 16);

    const gaveta = texto(this, W / 2, 446, "", 14, "#9ab");
    const opciones = [0, 1, 2].map((i) => boton(this, 68 + i * 112, 486, "", 104, "#2c3344", () => {
      const z = this.zonaActual();
      if (z?.opciones[i]) { this.elegidas.set(this.clave(), z.opciones[i]!); this.pintar(net.estado); }
    }).setFontSize(18));
    const probar = boton(this, W / 2, 560, "Probar", W - 32, "#3bb273", () => {
      const z = this.zonaActual(), elegida = this.elegidas.get(this.clave());
      if (z && !z.reparada && elegida && !net.estado.despachable) net.probar(z.zona, elegida);
    });
    const despachar = boton(this, W / 2, 560, "Despachar", W - 32, "#e0a43c", () => net.despachar());

    // Tarjeta de pieza quemada (≥ 3 s), sobre el circuito.
    const tarjeta = this.add.container(W / 2, 224, [
      this.add.rectangle(0, 0, 250, 84, 0x5a1414, 0.95).setStrokeStyle(3, 0xff6b6b),
      this.add.text(0, 0, "", { fontSize: "18px", color: "#fff", align: "center" }).setOrigin(0.5),
    ]).setVisible(false);

    this.ui = { estado, rival, reloj: relojT, reparadas: reparadasT, reto, volts, pieza, pinta, dibujo, motor, aguja, aviso, gaveta, zonas, opciones, probar, despachar, tarjeta };
    this.pintar(net.estado);
  }

  private zonaActual() {
    const zonas = podVisible(net.estado)?.zonas ?? [];
    return zonas.find((x) => x.zona === this.zona) ?? zonas[0];
  }

  update() {
    const p = net.estado, z = this.zonaActual(), ahora = Date.now();
    this.ui.reloj.setText(reloj(p, ahora));
    this.ui.aviso.setText(avisoVivo(p, ahora) ?? (z?.reparada ? "Zona reparada" : "Elige y pulsa Probar"));
    const ver = !!z && tarjetaVisible(p, z.zona, ahora);
    if (ver !== this.ui.tarjeta.visible) {
      const elegida = this.elegidas.get(this.clave());
      (this.ui.tarjeta.getAt(1) as Phaser.GameObjects.Text).setText(`¡Pieza quemada!\n${elegida && z ? textoOpcion(elegida, z.circuito) : ""}`);
      this.ui.tarjeta.setVisible(ver);
    }
  }

  pintar(p: Pantalla) {
    const u = this.ui;
    const pod = podVisible(p);
    const z = this.zonaActual();
    if (!pod || !z) return;
    this.zona = z.zona;
    u.estado.setText(`Nivel ${p.nivel} · Pod ${Math.min(pod.numero, p.total)} · ${p.despachados}/${p.total}`);
    u.rival.setText(textoRival(p.rival, p.total));
    const tabs = pestanas(pod, this.zona);
    u.zonas.forEach((b, i) => {
      const t = tabs[i];
      b.setVisible(!!t);
      if (t) b.setText(t.texto).setBackgroundColor(t.activa ? "#3a6ea5" : t.reparada ? "#24553c" : "#2c3344");
    });
    u.reparadas.setText(reparadas(pod));
    u.reto.setText(`${NOMBRE_ZONA[z.nombre]}: ${RETO[z.circuito]}`);
    u.volts.setText(textoVolts(z.volts));
    const elegida = this.elegidas.get(this.clave());
    u.pieza.setText(elegida ? textoOpcion(elegida, z.circuito) : "?");
    u.pinta.setFillStyle(PIEZA_COLOR[z.circuito]);
    u.gaveta.setText(z.reparada ? "" : GAVETA[z.circuito]);
    const botones = botonesGaveta(z, elegida);
    u.opciones.forEach((b, i) => {
      const o = botones[i];
      b.setVisible(!!o && !z.reparada);
      if (o) b.setText(o.texto).setBackgroundColor(o.elegida ? "#3a6ea5" : "#2c3344");
    });
    u.probar.setVisible(!p.despachable).setBackgroundColor(elegida && !z.reparada ? "#3bb273" : "#4a5060");
    u.despachar.setVisible(!!p.despachable);

    const v = p.vistas[this.zona];
    u.aguja.setVisible(!!v?.aguja).setAngle(v?.aguja ? ANGULO[v.aguja] : 0);
    const nivelLuz = z.reparada ? 2 : !v ? 0 : v.quemado || v.cortocircuito ? 4 : v.aguja === "poco" ? 1 : v.aguja === "correcto" ? 2 : 3;
    this.dibujar(z.circuito, PALETA[z.circuito][nivelLuz]!);
    u.aviso.setColor(v?.quemado || v?.cortocircuito ? "#ff6b6b" : "#fff");
    if (v?.cortocircuito) this.cameras.main.shake(250, 0.01);
  }

  /** Carga de la zona en el lado derecho del circuito. */
  private dibujar(c: Circuito, color: number) {
    const g = this.ui.dibujo.clear().lineStyle(3, 0xffffff).fillStyle(color);
    const x = 310;
    this.ui.motor.setVisible(c === "interruptor");
    if (c === "led") g.fillCircle(x, 224, 16).strokeCircle(x, 224, 16);
    if (c === "cabina") for (const y of [200, 248]) g.fillCircle(x, y, 14).strokeCircle(x, y, 14);
    if (c === "luces") for (const y of [200, 248]) {
      g.fillCircle(x, y, 15).strokeCircle(x, y, 15).lineBetween(x - 10, y - 10, x + 10, y + 10).lineBetween(x - 10, y + 10, x + 10, y - 10);
    }
    if (c === "interruptor") g.fillCircle(x, 224, 22).strokeCircle(x, 224, 22);
    if (c === "fusible") {
      g.fillRect(x - 14, 196, 28, 56).strokeRect(x - 14, 196, 28, 56);
      for (let y = 204; y < 244; y += 10) g.lineBetween(x - 8, y, x + 8, y + 5).lineBetween(x + 8, y + 5, x - 8, y + 10);
    }
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
