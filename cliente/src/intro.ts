/**
 * Intro de ~8 s (escena Intro): 4 viñetas pixel con el kit. Se muestra una vez por navegador, se salta con un toque
 * desde el primer segundo y se fuerza/omite con ?intro=1 / ?intro=0. Al terminar pasa a Entrar (el menú).
 * El audio no se toca aquí: main.ts ya lo desbloquea en el primer gesto y el toque de saltar lo cuenta como tal.
 */
import * as Phaser from "phaser";
import { anim, cargarArte, img, letras, toque } from "./arte";
import { desbloquear, sonar } from "./audio";
import { crearChispa } from "./chispa";

const W = 360, H = 640;
const CLAVE = "circuitsync.intro";
const AMBAR = 0xe0a43c, CIAN = 0x7fe0ff;

/** ?intro=1 fuerza, ?intro=0 omite; sin parámetro, solo si no se vio antes. Si el storage falla, se muestra (mejor repetir que perderla). */
export function mostrarIntro(search: string, storage?: Pick<Storage, "getItem">): boolean {
  const q = new URLSearchParams(search).get("intro");
  if (q === "1") return true;
  if (q === "0") return false;
  try { return storage?.getItem(CLAVE) !== "1"; } catch { return true; }
}

/** Guarda que ya se vio; nunca lanza. */
export function marcarIntroVista(storage?: Pick<Storage, "setItem">): void {
  try { storage?.setItem(CLAVE, "1"); } catch { /* sin storage: se repetirá */ }
}

const guardado = (): Storage | undefined => { try { return localStorage; } catch { return undefined; } };

export class Intro extends Phaser.Scene {
  constructor() { super("Intro"); }
  preload() { if (mostrarIntro(location.search, guardado())) cargarArte(this); }
  create() {
    if (!mostrarIntro(location.search, guardado())) { this.scene.start("Entrar"); return; }
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let fin = false;
    const salir = () => {
      if (fin) return;
      fin = true;
      marcarIntroVista(guardado());
      desbloquear(); sonar("clic");
      this.scene.start("Entrar");
    };
    this.add.image(0, 0, "capa_cielo_movil").setOrigin(0).setScale(4);
    this.add.image(0, 0, "capa_lejana_movil").setOrigin(0).setScale(4);
    this.add.rectangle(0, 480, W, 90, 0x10141e, 0.85).setOrigin(0); // franja oscura: el texto se lee sobre cualquier fondo
    toque(this, W / 2, H / 2, W, H, salir).setDepth(100); // desde el primer instante
    letras(this, W - 8, H - 18, "Toca para saltar", 1, 0x6f819a).setOrigin(1, 0).setDepth(101);

    // Cada viñeta: objetos + pie de texto. Se muestran de una en una (fundido salvo movimiento reducido).
    const viñetas: Phaser.GameObjects.GameObject[][] = [];
    const pie = (t: string, color = 0xdde8f2) => letras(this, W / 2, 500, t, 2, color).setOrigin(0.5, 0).setMaxWidth(320).setCenterAlign();

    // 1) Pod averiado a la deriva
    const pod = img(this, W / 2, 300, "pod1_cometa_reparado_0", 3);
    const humo = anim(this, W / 2 - 60, 270, "humo_negro", 4);
    if (reducido) humo.stop(); else this.tweens.add({ targets: pod, y: 292, angle: -4, duration: 1200, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    viñetas.push([pod, humo, pie("Un pod se averió en el espacio...")]);

    // 2) Llega al taller
    const bahia = anim(this, W / 2, 360, "bahia", 4);
    const nave = img(this, W / 2, 350, "pod1_cometa_reparado_0", 3);
    const cartel = anim(this, W / 2, 130, "cartel_averia", 4);
    if (reducido) cartel.stop(); else this.tweens.add({ targets: nave, y: { from: 200, to: 350 }, duration: 900, ease: "Cubic.Out", paused: false });
    const ch2 = crearChispa(this, 290, 470, 3, "normal", { lado: "izq", ancho: 150 }); ch2.decir("¡Otro pod!");
    viñetas.push([bahia, nave, cartel, ch2.cont, pie("Llega al taller.")]);

    // 3) Reparar y entender
    const pieza = [img(this, W / 2 - 70, 320, "resistencia_220", 5), img(this, W / 2, 320, "led_rojo_encendido", 5), img(this, W / 2 + 70, 320, "icono_bateria", 5)];
    const ch3 = crearChispa(this, 60, 470, 3, "senalando", { ancho: 200 }); ch3.decir("Esta frena la corriente.");
    viñetas.push([...pieza, ch3.cont, pie("Repara el circuito. Entiéndelo.", CIAN)]);

    // 4) Logo
    const banda = this.add.rectangle(0, 250, W, 140, 0x10141e, 0.85).setOrigin(0);
    const logo = letras(this, W / 2, 262, "CIRCUITSYNC", 4, AMBAR).setOrigin(0.5, 0);
    const led = this.add.image(W / 2, 346, "led_rojo_encendido").setScale(4);
    const toca = pie("Toca para empezar", AMBAR);
    if (!reducido) this.tweens.add({ targets: toca, alpha: 0.5, duration: 700, yoyo: true, repeat: -1 }); // suave, sin parpadeo duro
    const ch4 = crearChispa(this, 290, 470, 3, "feliz", { lado: "izq", ancho: 150 }); ch4.decir("¡Hola, soy Chispa!");
    viñetas.push([banda, logo, led, ch4.cont, toca]);

    viñetas.forEach((v, i) => v.forEach((o) => (o as Phaser.GameObjects.Image).setVisible(false).setAlpha(0)));
    const ver = (i: number) => {
      viñetas.forEach((v, j) => v.forEach((o) => (o as Phaser.GameObjects.Image).setVisible(j === i)));
      for (const o of viñetas[i]!) {
        const t = o as Phaser.GameObjects.Image;
        if (reducido || i === 0) t.setAlpha(1); else this.tweens.add({ targets: t, alpha: 1, duration: 250 }); // la 1.ª viñeta se ve de golpe: el texto no espera al fundido
      }
    };
    ver(0);
    [1, 2, 3].forEach((i) => this.time.delayedCall(i * 2000, () => ver(i))); // 4.º cuadro a los 6 s; ahí espera el toque
  }
}
