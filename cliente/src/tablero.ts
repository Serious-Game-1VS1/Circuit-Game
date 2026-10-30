/**
 * Placa 4×4 en Phaser (Cabina y Turbina): casillas y rieles del kit, gaveta con las dos cargas (2 focos,
 * o motor e interruptor) que se ARRASTRAN a la placa, cables rectos (ángulos de 90°) y vista previa del cable mientras se
 * arrastra (como `previaSVG` del prototipo v3). También vale tocar: pieza y luego su casilla; punto de
 * origen y luego destino. Tocar un cable o una pieza puesta lo quita (la pieza vuelve a la gaveta). La lógica pura vive en placa.ts y arrastre.ts.
 */
import * as Phaser from "phaser";
import type { Circuito } from "../../spike/src/protocol";
import { img, letras, marco } from "./arte";
import { arrastrable } from "./arrastre";
import {
  ANCHO, ALTO, cableDelCorto, cableTocado, CARGAS, cargaEn, conectable, destinoValido, cargasPuestas, CASILLAS, colorCable, coord, K, piezaEn, poner, ponerCable,
  motivoCableNoValido, puntoEn, puntoSoltar, quitarCable, quitarPieza, ranuraEn, rutas, ranuraValida, textoCorto, todasPuestas, type Cable, type Carga, type Puestas, type Punto,
} from "./placa";
import { spriteCarga } from "./sprites";
import { textoVolts } from "./vista";

const OSCURO = 0x140f1f, CIAN = 0x5ef0ff;
const v2 = (r: { x: number; y: number }[]) => r.map(({ x, y }) => new Phaser.Math.Vector2(x, y));
// Textos de diseno-taller/prototipo-v3/textos.js (T.circuito y T.gaveta), salvo los marcados.
export const TC = {
  rielMas: "+ (rojo)", rielMenos: "− (azul)",
  cablesAyuda: "Une los puntos amarillos arrastrando. Toca una pieza para quitarla.",
  // Solo en Cabina: allí el montaje no depende del sentido de los cables (ver montaje() en placa.ts); en Turbina no se afirma.
  ordenNoImporta: "El orden de + y - al cablear no importa.",
  sueltaAqui: "suelta aquí",
  cableElegido: "Toca otro punto amarillo o un riel, o fuera para cancelar. Para quitar una pieza, toca su cuerpo.",
  destinoNoSirve: "Ahí no se une: suelta el cable en el carril resaltado o en otro punto amarillo.",
  cableNoValido: "Ese cable no sirve: une un punto amarillo con un carril.",
  noVaAhi: "Esa pieza no va ahí.",
  seleccionada: "Ahora toca dónde ponerla.",
  // No está en textos.js (el prototipo v3 no arrastraba piezas a la placa).
  ponerPiezas: "Arrastra cada pieza a la placa.",
} as const;

/** Ayuda bajo la placa: en Cabina añade que el orden de + y − no importa. */
export const ayudaCables = (c: Circuito) => c === "luces" ? `${TC.cablesAyuda} ${TC.ordenNoImporta}` : TC.cablesAyuda;

/** Gaveta de la placa, en coordenadas de la placa (debajo de ella). Huecos de 64×56 px (≥ 44). */
export const GAVETA_PLACA = { y: 268, x: [100, 200], w: 64, h: 56 } as const;

export interface Eventos {
  /** Los cables cambiaron (la escena los guarda por pod y zona). */
  cambio: (cables: Cable[]) => void;
  /** Se puso una pieza en la placa (la escena las guarda por pod y zona). */
  poner: (puestas: Puestas) => void;
  aviso: (texto: string) => void;
  /** Con el multímetro activo, tocar una carga la mide en vez de cablear. null = no se está midiendo. */
  medir: () => ((punto: "carga1" | "carga2") => void) | null;
  /** Sin cablear mientras hay bloqueo o la zona ya está reparada. */
  bloqueado: () => boolean;
}

/** Sprite de la carga i (0 = carga1): focos en Cabina; motor (ícono de turbina) e interruptor en Turbina. */
// supuesto: el protocolo no tiene interruptor abierto/cerrado (solo montaje "serie" | "paralelo"): queda siempre cerrado.
const spriteDe = (circuito: Circuito, i: number, nivel: number) =>
  circuito === "luces" ? spriteCarga("luces", nivel) : i === 0 ? "icono_turbina" : "interruptor_cerrado";
const escalaDe = (circuito: Circuito, i: number) => (circuito === "luces" || i === 1 ? 2 : 3);

export class Tablero {
  readonly c: Phaser.GameObjects.Container;
  private cables: Cable[] = [];
  private puestas: Puestas = {};
  private circuito: Circuito = "luces";
  private origen: Punto | null = null;
  /** Pieza de la gaveta tocada (sin arrastrar), esperando que se toque su casilla. */
  private elegida: Carga["punto"] | null = null;
  private arrastre?: { a: Punto; x0: number; y0: number; activo: boolean; id: number };
  private readonly trazo: Phaser.GameObjects.Graphics;
  private readonly previa: Phaser.GameObjects.Graphics;
  /** «+»/«−» dentro del aro de cada terminal, por encima de los cables. */
  private readonly signos: Phaser.GameObjects.Graphics;
  private readonly marcas: Map<Punto, Phaser.GameObjects.Image>;
  private readonly rieles: Phaser.GameObjects.Graphics;
  /** Puntos de conexión de las piezas puestas: amarillo = sin cable, verde = con cable. */
  private readonly pines: Phaser.GameObjects.Graphics;
  private readonly cargas: Phaser.GameObjects.Image[];
  private readonly zona: Phaser.GameObjects.Zone;
  private readonly volts: Phaser.GameObjects.BitmapText;
  /** Gaveta de la placa: hueco, dibujo y área táctil de cada carga. */
  private readonly gaveta: { fondo: Phaser.GameObjects.NineSlice; pieza: Phaser.GameObjects.Image; zona: Phaser.GameObjects.Zone; num: Phaser.GameObjects.BitmapText }[];
  /** «1»/«2» junto a cada luz puesta. Los «+»/«−» de los terminales se dibujan dentro del aro (marcar). */
  private readonly numeros: Phaser.GameObjects.BitmapText[];
  /** «suelta aquí» sobre cada riel (+ y −). */
  private readonly suelta: Phaser.GameObjects.BitmapText[];
  private parpadeo?: Phaser.Tweens.Tween;

  constructor(private readonly s: Phaser.Scene, x: number, y: number, private readonly ev: Eventos) {
    this.c = s.add.container(x, y);
    this.trazo = s.add.graphics();
    this.previa = s.add.graphics();
    this.signos = s.add.graphics();
    this.rieles = s.add.graphics();
    this.pines = s.add.graphics();
    this.marcas = new Map(CASILLAS.map((p) => {
      const [f, col] = p.split(",").map(Number) as [number, number];
      return [p, img(s, (16 + 17 * col) * K, (6 + 17 * f) * K, "casilla_vacia", K).setOrigin(0).setVisible(false)];
    }));
    this.cargas = CARGAS.map(() => img(s, 0, 0, "foco_apagado", 2).setOrigin(0.5).setVisible(false));
    this.volts = letras(s, 0, -26, "", 2, OSCURO);
    this.numeros = CARGAS.map((_, i) => letras(s, 0, 0, String(i + 1), 2).setOrigin(0.5).setVisible(false));
    this.suelta = [27, 273].map((x) => letras(s, x, -6, TC.sueltaAqui, 1, CIAN).setOrigin(0.5, 0).setVisible(false));
    // Un área táctil para toda la placa: el punto o cable se busca con placa.ts (objetivos ≥ 44 px).
    this.zona = s.add.zone(-12, 0, 100 * K + 24, 80 * K).setOrigin(0).setInteractive({ useHandCursor: true });
    const G = GAVETA_PLACA;
    this.gaveta = CARGAS.map((k, i) => {
      const x = G.x[i]!, zona = s.add.zone(x, G.y, G.w, G.h).setInteractive({ useHandCursor: true });
      arrastrable(s, zona, {
        puede: () => this.c.visible && !this.ev.bloqueado() && !this.puestas[k.punto],
        fantasma: () => img(s, 0, 0, spriteDe(this.circuito, i, 0), escalaDe(this.circuito, i)).setOrigin(0.5),
        sobre: (p) => this.marcar(null, null, p ? this.ranuraLibre(k.punto, p) : null, p ? k.punto : null),
        soltar: (p) => {
          const { x: lx, y: ly } = this.local(p), nuevas = poner(this.puestas, k.punto, ranuraEn(lx, ly));
          if (!nuevas) { this.ev.aviso(TC.noVaAhi); return false; }
          this.elegida = null;
          this.puso(nuevas);
          return true;
        },
        tocar: () => {
          this.elegida = this.elegida === k.punto ? null : k.punto;
          if (this.elegida) this.ev.aviso(TC.seleccionada);
          this.gaveta.forEach((g, j) => g.fondo.setTexture(this.elegida === CARGAS[j]!.punto ? "boton_primario" : "boton_secundario"));
          this.marcar();
        },
      });
      return {
        fondo: marco(s, x, G.y, "boton_secundario", G.w, G.h), pieza: img(s, x, G.y, "foco_apagado", 2).setOrigin(0.5), zona,
        num: letras(s, x - G.w / 2 + 8, G.y - G.h / 2 + 6, String(i + 1), 2).setVisible(false),
      };
    });
    this.c.add([...this.protoboard(), ...this.marcas.values(), this.rieles, ...this.cargas, this.pines, this.trazo, this.previa, this.signos,
      this.volts, letras(s, 100 * K, -26, TC.rielMenos, 2, OSCURO).setOrigin(1, 0), this.zona,
      ...this.gaveta.flatMap((g) => [g.fondo, g.pieza, g.num, g.zona]), ...this.numeros, ...this.suelta]);
    this.zona.on("pointerdown", (p: Phaser.Input.Pointer) => this.bajar(p));
    s.input.on("pointermove", (p: Phaser.Input.Pointer) => this.mover(p));
    s.input.on("pointerup", (p: Phaser.Input.Pointer) => this.soltar(p));
  }

  /** Pinta la placa de una zona. `nivel` = brillo de las cargas (sprites.ts: nivelCarga). */
  pintar(circuito: Circuito, volts: number, cables: Cable[], puestas: Puestas, nivel: number, reparada: boolean) {
    if (cables !== this.cables || puestas !== this.puestas) { this.origen = null; this.arrastre = undefined; this.previa.clear(); }
    if (circuito !== this.circuito || puestas !== this.puestas) this.elegida = null;
    this.cables = cables;
    this.puestas = puestas;
    this.circuito = circuito;
    this.volts.setText(`${TC.rielMas} · ${textoVolts(volts)}`);
    // Cargas puestas en su casilla (entre sus dos bornes); las que faltan siguen en la gaveta.
    CARGAS.forEach((k, i) => {
      const puesta = cargasPuestas(puestas).find((x) => x.punto === k.punto);
      this.cargas[i]!.setVisible(!!puesta).setTexture(spriteDe(circuito, i, nivel)).setScale(escalaDe(circuito, i)).setAngle(0);
      const luces = circuito === "luces";
      if (puesta) this.cargas[i]!.setPosition(coord(puesta.a).x, (coord(puesta.a).y + coord(puesta.b).y) / 2);
      this.numeros[i]!.setVisible(!!puesta && luces);
      // El número va al lado de la luz que da la espalda a la otra, para no parecer de su vecina.
      const otra = cargasPuestas(puestas).find((x) => x.punto !== k.punto), lado = otra && coord(otra.a).x > coord(puesta?.a ?? "0,0").x ? -1 : 1;
      if (puesta) this.numeros[i]!.setPosition(coord(puesta.a).x + 28 * lado, (coord(puesta.a).y + coord(puesta.b).y) / 2);
      [puesta?.a, puesta?.b].forEach((p, j) => {
      });
      this.gaveta[i]!.num.setVisible(!puesta && luces);
      const g = this.gaveta[i]!, ver = this.c.visible && !puesta;
      g.fondo.setVisible(!puesta).setTexture(this.elegida === k.punto ? "boton_primario" : "boton_secundario");
      g.pieza.setVisible(!puesta).setTexture(spriteDe(circuito, i, 0)).setScale(escalaDe(circuito, i));
      g.zona.input!.enabled = ver;
    });
    this.trazo.clear();
    rutas(cables, cargasPuestas(puestas)).forEach((pts, i) => {
      const c = cables[i]!;
      this.trazo.lineStyle(8, OSCURO).strokePoints(v2(pts)).lineStyle(5, reparada ? 0xfff3a0 : colorCable(c)).strokePoints(v2(pts));
    });
    this.marcar();
  }

  /** Dibujo de la placa como un protoboard: cuerpo crema con agujeros, canal central y carriles rojo (+) y azul (−). Mismas coordenadas que placa.ts. */
  private protoboard() {
    const g = this.s.add.graphics(), CREMA = 0xf1e8cf, SOMBRA = 0xc9bb93, HOYO = 0x6d6652;
    g.fillStyle(0x2a2433).fillRoundedRect(-4, -4, ANCHO + 8, ALTO + 8, 8).fillStyle(CREMA).fillRoundedRect(0, 0, ANCHO, ALTO, 6);
    // Carriles: franja de color a lo largo, agujeros y un disco grande con el signo.
    ([["+", 27, 0xe8363c, 36], ["-", 273, 0x3e6af0, -36]] as const).forEach(([r, x, color, d]) => {
      g.fillStyle(color).fillRect(x + (d > 0 ? 9 : -13), 8, 4, ALTO - 16);
      for (let y = 12; y <= 228; y += 12) if (![36, 120, 204].some((s) => Math.abs(s - y) < 14)) g.fillStyle(HOYO).fillRect(x - 2, y - 2, 4, 4);
      [36, 120, 204].forEach((y) => { g.fillStyle(color).fillCircle(x, y, 13).lineStyle(2, 0x2a2433).strokeCircle(x, y, 13); this.signo(g, x, y, r === "+", 0xffffff, 5); });
    });
    g.fillStyle(SOMBRA).fillRect(46, 6, 2, ALTO - 12).fillRect(252, 6, 2, ALTO - 12);
    // Canal central entre las dos mitades (entre las columnas 2 y 3).
    g.fillStyle(0xa79a74).fillRect(144, 6, 12, ALTO - 12).fillStyle(0x6d6652).fillRect(146, 6, 8, ALTO - 12).fillStyle(0x8f8363).fillRect(148, 6, 4, ALTO - 12);
    // Agujeros pequeños en rejilla (cada 17 px; los de los pines caen sobre ella).
    for (let x = 55; x <= 242; x += 17) for (let y = 25; y <= 229; y += 17) if (Math.abs(x - 150) > 8) g.fillStyle(HOYO).fillRect(x - 1, y - 1, 3, 3);
    const col = [1, 2, 3, 4].map((n, i) => letras(this.s, coord(`0,${i}`).x + 1, 15, String(n), 1, 0x6d6652).setOrigin(0.5));
    const fila = ["A", "B", "C", "D"].map((l, i) => letras(this.s, 51, coord(`${i},0`).y, l, 1, 0x6d6652).setOrigin(0.5));
    return [g, ...col, ...fila];
  }

  /** «+» o «−» centrado en (x, y), de `r` px de radio y 4 px de grosor. */
  private signo(g: Phaser.GameObjects.Graphics, x: number, y: number, mas: boolean, color: number, r: number) {
    g.fillStyle(color).fillRect(x - r, y - 2, 2 * r, 4);
    if (mas) g.fillRect(x - 2, y - r, 4, 2 * r);
  }

  /** ¿Quedan piezas en la gaveta de la placa? (la escena oculta el medidor mientras tanto). */
  faltanPiezas() { return !todasPuestas(this.puestas); }

  /** Mostrar u ocultar la placa (una Zone oculta seguiría tapando los toques de debajo). */
  mostrar(ver: boolean) {
    this.c.setVisible(ver);
    this.zona.input!.enabled = ver;
    CARGAS.forEach((k, i) => { this.gaveta[i]!.zona.input!.enabled = ver && !this.puestas[k.punto]; });
  }

  /** El motor (carga 1 de la Turbina) gira cuando el árbitro dio la corriente correcta. */
  girar(grados: number) { this.cargas[0]!.angle += grados; }

  private local(p: Phaser.Input.Pointer) {
    // Coordenadas de la placa (el contenedor puede estar dentro del panel).
    const v = this.c.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY);
    return { x: v.x, y: v.y };
  }

  /** Ranura bajo el puntero si la carga cabe ahí. */
  private ranuraLibre(carga: Carga["punto"], p: Phaser.Input.Pointer) {
    const { x, y } = this.local(p), r = ranuraEn(x, y);
    return ranuraValida(this.puestas, carga, r) ? r : null;
  }

  private bajar(p: Phaser.Input.Pointer) {
    if (!this.c.visible || this.ev.bloqueado()) return;
    const { x, y } = this.local(p), punto = puntoEn(x, y);
    // Pieza de la gaveta tocada antes: este toque elige su casilla.
    if (this.elegida) {
      const nuevas = poner(this.puestas, this.elegida, ranuraEn(x, y));
      if (!nuevas) { this.ev.aviso(TC.noVaAhi); return; }
      this.elegida = null;
      return this.puso(nuevas);
    }
    const pieza = piezaEn(this.puestas, x, y), medir = this.ev.medir();
    if (medir) {
      const k = pieza ? { punto: pieza } : cargaEn(punto, cargasPuestas(this.puestas));
      return k ? medir(k.punto) : this.ev.aviso("Toca una pieza para medirla.");
    }
    const i = cableTocado(this.cables, x, y, cargasPuestas(this.puestas));
    if (i >= 0) { this.origen = null; return this.ev.cambio(quitarCable(this.cables, i)); }
    if (pieza) return this.quitar(pieza); // arrastrar desde un pin (no desde el cuerpo) sigue iniciando un cable
    if (!punto || !conectable(this.puestas, punto)) { this.origen = null; return this.marcar(); } // tocar fuera (o una casilla sin pieza) cancela el toque-toque
    this.arrastre = { a: punto, x0: x, y0: y, activo: false, id: p.id };
  }

  /** Se puso una pieza; con las dos luces puestas se aclara que el orden de + y - no importa. */
  private puso(nuevas: Puestas) {
    this.ev.poner(nuevas);
    if (this.circuito === "luces" && todasPuestas(nuevas)) this.ev.aviso(TC.ordenNoImporta);
  }

  /** La pieza vuelve a la gaveta con sus cables; el árbitro no se entera hasta que se pulse CHECK. */
  private quitar(k: Carga["punto"]) {
    const { puestas, cables } = quitarPieza(this.puestas, this.cables, k);
    this.origen = null;
    if (cables.length !== this.cables.length) this.ev.cambio(cables);
    this.ev.poner(puestas);
  }

  private mover(p: Phaser.Input.Pointer) {
    const d = this.arrastre;
    if (!d || p.id !== d.id) return;
    const { x, y } = this.local(p);
    if (!d.activo) {
      if (Math.hypot(x - d.x0, y - d.y0) < 10) return;
      d.activo = true;
      this.origen = null;
    }
    const sobre = puntoSoltar(x, y);
    this.dibujarPrevia(d.a, destinoValido(this.puestas, d.a, sobre) ? sobre! : null, x, y);
  }

  private soltar(p: Phaser.Input.Pointer) {
    const d = this.arrastre;
    if (!d || p.id !== d.id) return;
    this.arrastre = undefined;
    this.previa.clear();
    const { x, y } = this.local(p);
    if (!d.activo) {
      // Toque corto: primero el origen, luego el destino (tocar el mismo punto lo suelta).
      if (!this.origen) { this.origen = d.a; this.ev.aviso(TC.cableElegido); return this.marcar(); }
      const a = this.origen;
      this.origen = null;
      return a === d.a ? this.marcar() : this.unir(a, d.a);
    }
    const b = puntoSoltar(x, y);
    if (b && destinoValido(this.puestas, d.a, b)) return this.unir(d.a, b);
    this.ev.aviso(TC.destinoNoSirve);
    this.marcar();
  }

  private unir(a: Punto, b: Punto) {
    const nuevos = ponerCable(this.cables, a, b);
    if (!nuevos) { this.ev.aviso(motivoCableNoValido(this.cables, a, b)); return this.marcar(); }
    const corto = cableDelCorto(nuevos);
    if (corto) this.ev.aviso(textoCorto(corto, this.circuito, cargasPuestas(this.puestas)));
    this.ev.cambio(nuevos);
  }

  /**
   * Bornes ocupados, origen elegido y destinos posibles (casillas resaltadas y rieles en cian). Con una
   * pieza de la gaveta en la mano (`carga`, o la tocada): casillas libres en verde y la ranura bajo el dedo resaltada.
   */
  private marcar(desde: Punto | null = this.origen, sobre: Punto | null = null, ranura: Punto | null = null, carga = this.elegida) {
    const bornes = new Set(cargasPuestas(this.puestas).flatMap((k) => [k.a, k.b]));
    const enRanura = ranura ? [ranura, `${Number(ranura[0]) + 1}${ranura.slice(1)}`] : [];
    const libre = (p: Punto) => !!carga && (ranuraValida(this.puestas, carga, p) || ranuraValida(this.puestas, carga, `${Number(p[0]) - 1}${p.slice(1)}`));
    for (const [p, im] of this.marcas) {
      const t = p === desde || p === sobre || enRanura.includes(p) ? "casilla_resaltada"
        : (desde && destinoValido(this.puestas, desde, p)) || libre(p) ? "casilla_valida" : null; // sin cuadro oscuro en las casillas ocupadas: el protoboard se ve limpio
      im.setVisible(!!t);
      if (t) im.setTexture(t);
    }
    this.pines.clear();
    this.signos.clear();
    // Pines de la rejilla: todos del mismo color tenue; verdes si son destino válido del cable que se arrastra.
    for (const p of CASILLAS) {
      const { x, y } = coord(p), ok = !!desde && destinoValido(this.puestas, desde, p);
      this.pines.fillStyle(OSCURO).fillCircle(x, y, ok ? 9 : 5).fillStyle(ok ? 0x56d364 : 0x3a3550).fillCircle(x, y, ok ? 6 : 3);
    }
    // Terminales de las luces puestas: aro amarillo (los pines de la rejilla no lo llevan).
    for (const p of bornes) {
      const { x, y } = coord(p), ok = !!desde && destinoValido(this.puestas, desde, p), con = this.cables.some((c) => c.a === p || c.b === p);
      const claro = ok || con, k = cargasPuestas(this.puestas).find((q) => q.a === p || q.b === p)!;
      this.pines.fillStyle(OSCURO).fillCircle(x, y, 14).fillStyle(ok ? 0x56d364 : con ? 0xf6c63a : OSCURO).fillCircle(x, y, 11)
        .lineStyle(3, 0xf6c63a).strokeCircle(x, y, 13);
      // Polaridad dentro del aro (solo en Cabina: el motor y el interruptor no la tienen): + en el punto de arriba, − en el de abajo.
      if (this.circuito === "luces") this.signo(this.signos, x, y, p === k.a, claro ? OSCURO : 0xffffff, 6);
    }
    this.rieles.clear();
    let hay = false;
    (["+", "-"] as const).forEach((r, i) => {
      const va = r === desde || !!(desde && destinoValido(this.puestas, desde, r));
      this.suelta[i]!.setVisible(va && r === sobre && r !== desde);
      if (!va) return;
      hay = true;
      this.rieles.lineStyle(r === desde || r === sobre ? 4 : 2, CIAN).strokeRect((r === "+" ? 4 : 86) * K, 4 * K, 10 * K, 72 * K);
      // Muesca donde llega el cable: a la altura de su otro extremo; llena si es la que está bajo el dedo.
      if (desde && desde.includes(",") && r !== desde) this.rieles.fillStyle(CIAN, r === sobre ? 0.85 : 0.3).fillRect((r === "+" ? 4 : 86) * K, coord(desde).y - 12, 10 * K, 24);
    });
    // Los carriles parpadean suave mientras se cablea.
    if (hay && !this.parpadeo) this.parpadeo = this.s.tweens.add({ targets: this.rieles, alpha: { from: 1, to: 0.35 }, duration: 450, yoyo: true, repeat: -1 });
    else if (!hay && this.parpadeo) { this.parpadeo.remove(); this.parpadeo = undefined; this.rieles.setAlpha(1); }
  }

  private dibujarPrevia(a: Punto, sobre: Punto | null, x: number, y: number) {
    this.marcar(a, sobre);
    const fin = sobre ? coord(sobre, coord(a).y) : { x, y }, ini = coord(a, fin.y);
    const pts = sobre ? rutas([...this.cables, { a, b: sobre }], cargasPuestas(this.puestas)).at(-1)! : [ini, { x: fin.x, y: ini.y }, fin];
    const color = colorCable({ a, b: sobre ?? "0,0" });
    // Sin destino válido el cable va más tenue.
    this.previa.clear().lineStyle(3, CIAN).strokeCircle(ini.x, ini.y, 20).lineStyle(8, OSCURO, sobre ? 1 : 0.6).strokePoints(v2(pts)).lineStyle(5, color, sobre ? 1 : 0.6).strokePoints(v2(pts));
  }
}
