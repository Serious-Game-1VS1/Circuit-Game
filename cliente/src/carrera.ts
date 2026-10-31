/**
 * Escenas de la carrera final y del podio (propuesta A+D). La carrera solo celebra: el ganador ya
 * viene decidido en el End del árbitro; el pod que corre, las llamas y «qué repasar» también.
 * Sprites del kit (arte/carrera, arte/pods/*_carrera_*, arte/ui/cartel_*). Escala 2 en la carrera.
 */
import { cargarPerfil, mejorNave } from "./perfil";
import { panelRecompensas, tomarFantasma, tomarPendiente } from "./recompensas";
import * as Phaser from "phaser";
import type { Station } from "../../spike/src/protocol";
import type { Net } from "./net";
import { cargarArte, letras, marco, toque } from "./arte";
import { medallaDe, sonar } from "./audio";
import { ponerMusica, turbinaOff, turbinaOn } from "./musica";
import { chasisCarril, CHASIS, contraRecord, decision, f, mmss, podio, TXT } from "./podio";

const W = 360, H = 640;
/** x de la línea de meta en la carrera. */
const META = 318;
/** Tiempos reales de la carrera (ms): arranque tras el semáforo y salida automática (llegada a ~6 s + 2,2 s). */
const T_YA = 1200, T_FIN = T_YA + 4800 + 2200;

// Los PNG de la carrera vienen en public/arte/ como el resto del kit (ya en caché si se pasó por el Taller; no al reconectar tras el fin).
const cargar = cargarArte;

function animaciones(s: Phaser.Scene) {
  const anim = (key: string, frames: string[], frameRate: number) => {
    if (!s.anims.exists(key)) s.anims.create({ key, frames: frames.map((k) => ({ key: k })), frameRate, repeat: -1 });
  };
  for (const c of CHASIS) anim(`${c}_carrera`, [0, 1, 2].map((i) => `${c}_carrera_${i}`), 12);
  anim("llama_turbo_cian", [0, 1, 2].map((i) => `llama_turbo_cian_${i}`), 12);
  anim("resalte_ganador", ["resalte_ganador_0", "resalte_ganador_1"], 4);
  anim("bandera_cuadros", ["bandera_cuadros_0", "bandera_cuadros_1"], 6);
}

/** Profundidades: el confeti va entre el fondo y los textos, para que no tape lo que hay que leer. */
const CAPA = { confeti: 5, texto: 10 } as const;

/**
 * Texto centrado con la fuente pixel del kit (k = escala: 2 -> 16 px de alto, ~8 px por letra),
 * con sombra oscura para leerse sobre el fondo y el confeti. Corta líneas al ancho de la pantalla.
 */
const texto = (s: Phaser.Scene, x: number, y: number, t: string, k = 2, color = 0xffffff) =>
  letras(s, x, y, t, k, color).setOrigin(0.5, 0).setCenterAlign().setMaxWidth(W - 24).setDropShadow(1, 1, 0x140f1f, 1).setDepth(CAPA.texto);

/**
 * Texto de longitud libre (motivo del ganador): empieza a escala 2 y baja a 1,5 y 1 hasta caber en `alto` px. Así el bloque que
 * va debajo (que se coloca con `y + height`) no se pisa con textos de 1 a 4 líneas.
 */
export function texto2(s: Phaser.Scene, x: number, y: number, t: string, alto: number, color = 0xffffff) {
  let k = 2, o = texto(s, x, y, t, k, color);
  while (o.height > alto && k > 1) { o.destroy(); o = texto(s, x, y, t, (k -= 0.5), color); }
  return o;
}

/** Cielo y dos capas de parallax (fondos móviles 90×200 a escala 4). */
function fondo(s: Phaser.Scene) {
  s.add.image(0, 0, "capa_cielo_movil").setOrigin(0).setScale(4);
  return ["capa_lejana_movil", "capa_cercana_movil"].map((k) => s.add.tileSprite(0, 0, 90, 200, k).setOrigin(0).setScale(4));
}

/** Un carril de la carrera: chasis, llamas, etiqueta y si cruza la meta. */
interface Lane { id: string; ch: string; llamas: number; etq: string; gana: boolean; alpha?: number }

export class Carrera extends Phaser.Scene {
  private capas: Phaser.GameObjects.TileSprite[] = [];
  private corriendo = false;
  private pods: { l: Lane; grupo: Phaser.GameObjects.Container }[] = [];
  private sem?: Phaser.GameObjects.Image;
  private gana?: Phaser.GameObjects.Container;
  private gane = false;
  private tick = 0;
  private t0 = 0;
  private fin = false;
  /** Adónde va al terminar o saltar: el podio (duelo) o la entrada con Recompensas (práctica). */
  private salir: () => void = () => {};
  constructor(private readonly net: Net) { super("Carrera"); }

  preload() { cargar(this); }
  /** main.ts repinta la escena activa en cada cambio; aquí no hay nada que repintar. */
  pintar() {}

  create() {
    animaciones(this);
    const g = tomarFantasma(); // práctica terminada: carrera contra tu récord (sin End de carrera ni rival)
    const e = this.net.estado.end!, yo = this.net.estado.station ?? "A";
    this.capas = fondo(this);
    this.corriendo = false;
    ponerMusica(this.net.estado, "carrera"); // también contra tu récord (la fase sigue siendo «entrar»)

    // Carriles: el mío arriba. En duelo, mi nave es la mejor que desbloqueé; el árbitro manda las llamas (siempre ≥ mi racha: cuenta todos los despachos limpios).
    let lanes: Lane[], sub: string, ayuda: string, gane: boolean;
    if (g) {
      const res = contraRecord(g.ms, g.previo), nave = chasisCarril(1, g.nave);
      lanes = [{ id: "yo", ch: nave, llamas: g.llamas, etq: f(TXT.fantasmaTu, { t: mmss(g.ms) }), gana: res !== "pierde" }];
      if (g.previo !== undefined) lanes.push({ id: "rec", ch: nave, llamas: 0, etq: f(TXT.fantasmaRec, { t: mmss(g.previo) }), gana: res === "pierde", alpha: 0.55 });
      sub = { primero: TXT.fantasmaPrimero, gana: TXT.fantasmaGana, pierde: TXT.fantasmaPierde }[res];
      ayuda = TXT.fantasmaAyuda; gane = res !== "pierde";
      this.salir = () => this.scene.start("Entrar"); // luego Recompensas (siguen pendientes)
    } else {
      const carriles: Station[] = [yo, yo === "A" ? "B" : "A"];
      lanes = carriles.map((s) => {
        const c = e.carrera?.[s], sc = e.score[s], mia = s === yo && sc ? mejorNave(cargarPerfil(sc.alias)) : 0;
        return { id: s, ch: chasisCarril(c?.pod ?? 1, mia), llamas: c?.llamas ?? 0, etq: `${sc?.alias ?? "-"}${s === yo ? " (tú)" : ""}\n${f(TXT.podLuce, { n: c?.pod ?? 1 })}`, gana: e.winner === null || s === e.winner };
      });
      sub = decision(e); ayuda = TXT.carreraAyuda; gane = e.winner === yo;
      this.salir = () => this.net.verPodio();
    }
    texto(this, W / 2, 16, g ? TXT.fantasmaTitulo : TXT.carreraTitulo, 3);
    const motivo = texto2(this, W / 2, 56, sub, 48);
    texto(this, W / 2, Math.max(100, motivo.y + motivo.height + 6), ayuda, 2, 0xccddee);

    const Y = [400, 540]; // 140 px entre carriles: la etiqueta del segundo (126 px sobre su suelo) no pisa la nave del primero
    for (const y of Y.slice(0, lanes.length)) this.add.tileSprite(0, y - 12, 180, 24, "pista_recta").setOrigin(0).setScale(2);
    this.add.tileSprite(META, Y[0]! - 70, 4, 100, "meta").setOrigin(0).setScale(2);
    this.add.image(META + 4, Y[0]! - 70, "cartel_meta").setScale(2);
    // Mejoras que elegiste en la partida (solo práctica), bajo el último carril (entre carriles pisaría la etiqueta del segundo).
    if (g?.mejoras) texto(this, W / 2, Y[lanes.length - 1]! + 22, f(TXT.mejoras, { m: g.mejoras }), 2, 0xccddee);

    const pods = lanes.map((l, i) => {
      const y = Y[i]!;
      const llamas = Array.from({ length: l.llamas }, () =>
        this.add.sprite(0, 0, "llama_turbo_cian_0").setOrigin(1, 0.5).setScale(2).play("llama_turbo_cian"));
      const pod = this.add.sprite(0, 0, `${l.ch}_carrera_0`).setOrigin(0.5, 1).setScale(2).play(`${l.ch}_carrera`);
      const etq = texto(this, 0, 0, l.etq, 2).setMaxWidth(190); // a dos líneas: centrada sobre la nave cerca de la meta, una línea se salía de la pantalla
      const grupo = this.add.container(-110, y, [...llamas, pod, etq]).setDepth(CAPA.texto).setAlpha(l.alpha ?? 1);
      // Llamas detrás del pod, apiladas; la etiqueta encima.
      llamas.forEach((x, k) => x.setPosition(-92, -46 - (k - (llamas.length - 1) / 2) * 17)); // columna de llamas en la cola, sin solaparse (16 px de alto)
      etq.setPosition(0, -126);
      return { l, grupo };
    });

    // Semáforo 3-2-1-¡YA! (0,3 s cada luz) y luego la carrera. Todo va por tiempo real (Date.now en update), no por tweens ni timers
    // de Phaser: con el lienzo en segundo plano el reloj de Phaser se detiene y las naves nunca salían.
    const sem = this.add.image(W / 2, 300, "semaforo_3").setOrigin(0.5, 1).setScale(3);
    sonar("tic3");
    this.pods = pods; this.sem = sem; this.gana = pods.find((p) => (g ? p.l.gana : p.l.id === e.winner))?.grupo; this.gane = gane;
    this.tick = 0; this.t0 = Date.now(); this.fin = false;
    // «Toca para saltar» visible desde el primer segundo. Usa eventos del DOM y un timer real (no el reloj de Phaser):
    // con la pestaña en segundo plano el lienzo no avanza y la escena no debe quedarse colgada.
    texto(this, W / 2, H - 40, TXT.saltar, 2, 0xccddee);
    let salio = false;
    const ir = () => { if (salio) return; salio = true; limpiar(); this.salir(); };
    const toque = () => { if (Date.now() - this.t0 > 400) ir(); }; // 0,4 s de guarda: no saltar por el toque del despacho
    const reloj = window.setTimeout(ir, T_FIN);
    const limpiar = () => { window.clearTimeout(reloj); window.removeEventListener("pointerdown", toque); };
    window.addEventListener("pointerdown", toque);
    this.events.once("shutdown", () => { salio = true; limpiar(); turbinaOff(); ponerMusica(this.net.estado); });
  }

  private llegada(ganador: Phaser.GameObjects.Container | undefined, gane: boolean) {
    this.corriendo = false;
    turbinaOff();
    if (ganador) {
      const r = this.add.sprite(ganador.x, ganador.y - 23, "resalte_ganador_0").setScale(2).play("resalte_ganador");
      this.children.moveBelow(r, ganador);
      // La bandera ondea en el hueco del semáforo (ya oculto), lejos de las etiquetas de los carriles.
      this.add.sprite(W / 2, 262, "bandera_cuadros_0").setOrigin(0.1, 1).setScale(3).play("bandera_cuadros");
    }
    if (gane) {
      // Confeti semitransparente y debajo de los textos.
      const confeti = this.add.tileSprite(0, 0, 90, 160, "confeti_0").setOrigin(0).setScale(4).setAlpha(0.55).setDepth(CAPA.confeti);
      let i = 0;
      this.time.addEvent({ delay: 100, loop: true, callback: () => confeti.setTexture(`confeti_${++i % 4}`) });
    }
  }

  update(_t: number, dt: number) {
    const v = this.corriendo ? 1 : 0.15;
    this.capas.forEach((c, i) => { c.tilePositionX += dt * 0.02 * (i + 1) * v; });
    const el = Date.now() - this.t0;
    // Semáforo
    const luz = Math.min(3, Math.floor(el / 300));
    if (luz !== this.tick && luz > 0 && this.sem?.visible) { this.sem.setTexture(["semaforo_3", "semaforo_2", "semaforo_1", "semaforo_ya"][luz]!); sonar((["tic2", "tic1", "ya"] as const)[luz - 1]!); }
    this.tick = luz;
    if (el < T_YA) return;
    if (!this.corriendo && !this.fin) { this.sem?.setVisible(false); this.corriendo = true; turbinaOn(); }
    for (const { l, grupo } of this.pods) {
      const dur = l.gana ? 4200 : 4800, p = Math.min(1, Math.max(0, (el - T_YA) / dur));
      grupo.x = -110 + ((l.gana ? META - 90 : META - 190) + 110) * (1 - Math.cos(Math.PI * p)) / 2; // Sine.easeInOut
    }
    if (!this.fin && el >= T_YA + 4800) { this.fin = true; this.llegada(this.gana, this.gane); }
  }
}

export class Podio extends Phaser.Scene {
  constructor(private readonly net: Net) { super("Podio"); }

  preload() { cargar(this); }
  pintar() {}

  create() {
    animaciones(this);
    const p = this.net.estado, e = p.end!, yo = p.station;
    fondo(this);
    sonar(medallaDe(e, yo));
    const cartel = e.winner === null ? "cartel_empate" : e.winner === yo ? "cartel_ganaste" : "cartel_perdiste";
    this.add.image(W / 2, 40, cartel).setScale(e.winner === null ? 2 : 3);
    const motivo = texto2(this, W / 2, 76, decision(e), 48);
    texto(this, W / 2, Math.max(118, motivo.y + motivo.height + 6), TXT.regla, 2, 0xccddee);

    // Podio con el pod que corrió el ganador (o el mío en empate).
    const quien = e.winner ?? yo ?? "A";
    this.add.image(W / 2, 290, "podio").setOrigin(0.5, 1).setScale(3);
    // El jugador ve su mejor nave desbloqueada; la del rival sigue el pod que corrió (sprites del kit).
    const mia = yo && e.score[yo] ? mejorNave(cargarPerfil(e.score[yo]!.alias)) : 0;
    const ch = chasisCarril(e.carrera?.[quien]?.pod ?? 1, quien === yo ? mia : 0);
    this.add.sprite(W / 2, 290 - 3 * 26, `${ch}_carrera_0`).setOrigin(0.5, 1).setScale(1.25).play(`${ch}_carrera`);

    const { filas, repasar, podLento } = podio(e, yo);
    const tabla = filas.map((x) => `${x.puesto} ${x.alias}${x.yo ? " (tú)" : ""} · ${x.puntos} puntos\nTiempo ${x.tiempo} · Pods ${x.pods}/5\nLimpios ${x.limpios} · Quemados ${x.quemados}`);
    texto(this, W / 2, 298, tabla.join("\n"), 2);

    const caja = this.add.rectangle(W / 2, 498, W - 24, 124, 0x140f1f, 0.85).setStrokeStyle(2, 0xe0a43c);
    texto(this, W / 2, caja.y - 54, TXT.repasar, 2, 0xe0a43c);
    texto(this, W / 2, caja.y - 30, [...repasar.map((r) => `- ${r}`), ...(podLento ? [podLento] : [])].join("\n"), 2);

    // Dos botones con el mismo destino (la entrada); el texto de VOLVER A JUGAR va en 2 líneas para caber a escala 2.
    const botones: [string, string, number][] = [["boton_primario", "VOLVER A\nJUGAR", W / 2 - 84], ["boton_secundario", "MENU", W / 2 + 84]];
    for (const [tex, t, x] of botones) {
      marco(this, x, 604, tex, 160, 52);
      texto(this, x, 604 - t.split("\n").length * 8, t, 2, 0x140f1f).setDropShadow(0, 0, 0, 0);
      toque(this, x, 604, 160, 52, () => void this.net.salir());
    }
    const g = tomarPendiente();
    if (g) panelRecompensas(this, g.eventos, g.perfil);
  }
}
