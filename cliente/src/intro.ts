/**
 * Intro de ~21 s (escena Intro): 6 viñetas pixel de 3,5 s con el kit. Sale en cada carga (?intro=0 la omite), un toque pasa a la
 * siguiente, SALTAR va al menú y la última espera un toque. Se relanza desde el menú con lanzarIntro(escena). Al terminar pasa a Entrar.
 * El audio no se toca aquí: main.ts ya lo desbloquea en el primer gesto y el toque lo cuenta como tal.
 */
import * as Phaser from "phaser";
import { anim, cargarArte, img, letras, toque } from "./arte";
import { desbloquear, sonar } from "./audio";
import { crearChispa } from "./chispa";

const W = 360, H = 640;
const VINETA_MS = 3500;
const AMBAR = 0xe0a43c, CIAN = 0x7fe0ff;

/** Sin parámetro, siempre; solo ?intro=0 la omite (los guiones de QA lo usan). */
export function mostrarIntro(search: string): boolean {
  return new URLSearchParams(search).get("intro") !== "0";
}

/** Relanza la intro desde el menú (ignora ?intro=0). Al acabar vuelve a Entrar. */
export function lanzarIntro(escena: Phaser.Scene): void {
  escena.scene.start("Intro", { forzar: true });
}

export class Intro extends Phaser.Scene {
  private forzar = false;
  constructor() { super("Intro"); }
  init(d?: { forzar?: boolean }) { this.forzar = !!d?.forzar; }
  preload() { if (this.forzar || mostrarIntro(location.search)) cargarArte(this); }
  create() {
    if (!this.forzar && !mostrarIntro(location.search)) { this.scene.start("Entrar"); return; }
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let fin = false;
    const salir = () => {
      if (fin) return;
      fin = true;
      desbloquear(); sonar("clic");
      this.scene.start("Entrar");
    };
    this.add.image(0, 0, "capa_cielo_movil").setOrigin(0).setScale(4);
    this.add.image(0, 0, "capa_lejana_movil").setOrigin(0).setScale(4);
    this.add.rectangle(0, 480, W, 90, 0x10141e, 0.85).setOrigin(0); // franja oscura: el texto se lee sobre cualquier fondo
    let ir = (_i: number) => {};
    let actual = 0;
    toque(this, W / 2, H / 2, W, H, () => (actual >= 5 ? salir() : ir(actual + 1))).setDepth(100); // un toque = siguiente viñeta
    this.add.rectangle(W - 6, 6, 88, 44, 0x10141e, 0.85).setOrigin(1, 0).setStrokeStyle(2, 0x6f819a).setDepth(101);
    letras(this, W - 50, 20, "SALTAR", 2, 0xdde8f2).setOrigin(0.5, 0).setDepth(102);
    toque(this, W - 50, 28, 88, 44, salir).setDepth(103); // zona de 44 px, por encima del toque general

    // Cada viñeta: objetos + pie de texto. Se muestran de una en una (fundido salvo movimiento reducido).
    const viñetas: Phaser.GameObjects.GameObject[][] = [];
    const pie = (t: string, color = 0xdde8f2) => letras(this, W / 2, 500, t, 2, color).setOrigin(0.5, 0).setMaxWidth(320).setCenterAlign();

    // 1) Pod averiado a la deriva
    const pod = img(this, W / 2, 300, "pod1_cometa_reparado_0", 3);
    const humo = anim(this, W / 2 - 60, 270, "humo_negro", 4);
    if (reducido) humo.stop(); else this.tweens.add({ targets: pod, y: 292, angle: -4, duration: 1200, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    viñetas.push([pod, humo, pie("Un pod se averió.")]);

    // 2) Llega al taller
    const bahia = anim(this, W / 2, 360, "bahia", 4);
    const nave = img(this, W / 2, 350, "pod1_cometa_reparado_0", 3);
    const cartel = anim(this, W / 2, 130, "cartel_averia", 4);
    if (reducido) cartel.stop(); else this.tweens.add({ targets: nave, y: { from: 200, to: 350 }, duration: 900, ease: "Cubic.Out", paused: false });
    const ch2 = crearChispa(this, 290, 470, 3, "normal", { lado: "izq", ancho: 150 }); ch2.decir("¡Otro pod!");
    viñetas.push([bahia, nave, cartel, ch2.cont, pie("Llega al taller.")]);

    // 3) Eres el mecánico
    const bahia3 = anim(this, W / 2, 360, "bahia", 4);
    if (reducido) bahia3.stop();
    const ch3 = crearChispa(this, 60, 470, 3, "senalando", { ancho: 200 }); ch3.decir("Tú eres el mecánico.");
    viñetas.push([bahia3, ch3.cont, pie("Eres el mecánico.")]);

    // 4) Reparar circuitos
    const pieza = [img(this, W / 2 - 70, 320, "resistencia_220", 5), img(this, W / 2, 320, "led_rojo_encendido", 5), img(this, W / 2 + 70, 320, "icono_bateria", 5)];
    const ch4 = crearChispa(this, 290, 470, 3, "normal", { lado: "izq", ancho: 150 }); ch4.decir("Esta frena la corriente.");
    viñetas.push([...pieza, ch4.cont, pie("Repara el circuito.", CIAN)]);

    // 5) Duelo 1v1: dos pods enfrentados
    const izq = img(this, W / 2 - 80, 320, "pod1_cometa_reparado_0", 3);
    const der = img(this, W / 2 + 80, 320, "pod1_cometa_reparado_0", 3).setFlipX(true).setTint(0xff9a9a);
    const vs = letras(this, W / 2, 300, "VS", 4, AMBAR).setOrigin(0.5, 0);
    if (!reducido) this.tweens.add({ targets: [izq, der], y: 310, duration: 700, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    viñetas.push([izq, der, vs, pie("Duelo 1 contra 1.", AMBAR)]);

    // 6) Logo
    const banda = this.add.rectangle(0, 250, W, 140, 0x10141e, 0.85).setOrigin(0);
    const logo = letras(this, W / 2, 262, "CIRCUITSYNC", 4, AMBAR).setOrigin(0.5, 0);
    const led = this.add.image(W / 2, 346, "led_rojo_encendido").setScale(4);
    const toca = pie("Toca para empezar", AMBAR);
    if (!reducido) this.tweens.add({ targets: toca, alpha: 0.5, duration: 700, yoyo: true, repeat: -1 }); // suave, sin parpadeo duro
    const ch6 = crearChispa(this, 290, 470, 3, "feliz", { lado: "izq", ancho: 150 }); ch6.decir("¡Hola, soy Chispa!");
    viñetas.push([banda, logo, led, ch6.cont, toca]);

    viñetas.forEach((v) => v.forEach((o) => (o as Phaser.GameObjects.Image).setVisible(false).setAlpha(0)));
    let reloj: Phaser.Time.TimerEvent | undefined;
    ir = (i: number) => {
      actual = i;
      reloj?.remove();
      viñetas.forEach((v, j) => v.forEach((o) => (o as Phaser.GameObjects.Image).setVisible(j === i)));
      for (const o of viñetas[i]!) {
        const t = o as Phaser.GameObjects.Image;
        this.tweens.killTweensOf(t); // un toque rápido no deja un fundido viejo pisando el alpha
        if (reducido || i === 0) t.setAlpha(1); else this.tweens.add({ targets: t, alpha: 1, duration: 250 }); // la 1.ª viñeta se ve de golpe
      }
      if (i < 5) reloj = this.time.delayedCall(VINETA_MS, () => ir(i + 1)); // la última espera el toque
    };
    ir(0);
  }
}
