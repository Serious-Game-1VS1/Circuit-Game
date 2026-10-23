/**
 * Placa 4×4 en Phaser (Cabina y Turbina): casillas y rieles del kit, gaveta con las dos cargas (2 focos,
 * o motor e interruptor) que se ARRASTRAN a la placa, cables curvos y vista previa del cable mientras se
 * arrastra (como `previaSVG` del prototipo v3). También vale tocar: pieza y luego su casilla; punto de
 * origen y luego destino. Tocar un cable lo quita. La lógica pura vive en placa.ts y arrastre.ts.
 */
import * as Phaser from "phaser";
import type { Circuito } from "../../spike/src/protocol";
import { img, letras, marco } from "./arte";
import { arrastrable } from "./arrastre";
import {
  cableTocado, CARGAS, cargaEn, cargasPuestas, CASILLAS, colorCable, control, coord, curva, esDestino, K, montaje, poner, ponerCable,
  puntoEn, quitarCable, ranuraEn, ranuraValida, todasPuestas, type Cable, type Carga, type Puestas, type Punto,
} from "./placa";
import { spriteCarga } from "./sprites";
import { textoVolts } from "./vista";

const OSCURO = 0x140f1f, CIAN = 0x5ef0ff;
// Textos de diseno-taller/prototipo-v3/textos.js (T.circuito y T.gaveta), salvo los marcados.
export const TC = {
  rielMas: "+ (rojo)", rielMenos: "− (azul)",
  cablesAyuda: "Arrastra de un punto a otro, o tócalos uno y luego otro.",
  cableElegido: "Ahora toca el otro punto.",
  destinoNoSirve: "Ese destino no sirve: elige un terminal resaltado.",
  cableNoValido: "Ese cable no sirve: elige otro punto.",
  cortoAviso: "Ojo: ese cable une + con −. Hará corto.",
  terminalSuelto: "Cada pieza necesita un cable en sus dos puntos.",
  noVaAhi: "Esa pieza no va ahí.",
  seleccionada: "Ahora toca dónde ponerla.",
  // No está en textos.js (el prototipo v3 no arrastraba piezas a la placa).
  ponerPiezas: "Arrastra cada pieza a la placa.",
} as const;

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
// shortcut: una pieza ya puesta en la placa no se puede mover ni devolver a la gaveta; si molesta en pruebas, arrastrarla desde su sprite.
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
  private readonly marcas: Map<Punto, Phaser.GameObjects.Image>;
  private readonly rieles: Phaser.GameObjects.Graphics;
  private readonly cargas: Phaser.GameObjects.Image[];
  private readonly zona: Phaser.GameObjects.Zone;
  private readonly volts: Phaser.GameObjects.BitmapText;
  /** Gaveta de la placa: hueco, dibujo y área táctil de cada carga. */
  private readonly gaveta: { fondo: Phaser.GameObjects.NineSlice; pieza: Phaser.GameObjects.Image; zona: Phaser.GameObjects.Zone }[];

  constructor(private readonly s: Phaser.Scene, x: number, y: number, private readonly ev: Eventos) {
    this.c = s.add.container(x, y);
    this.trazo = s.add.graphics();
    this.previa = s.add.graphics();
    this.rieles = s.add.graphics();
    this.marcas = new Map(CASILLAS.map((p) => {
      const [f, col] = p.split(",").map(Number) as [number, number];
      return [p, img(s, (16 + 17 * col) * K, (6 + 17 * f) * K, "casilla_vacia", K).setOrigin(0).setVisible(false)];
    }));
    this.cargas = CARGAS.map(() => img(s, 0, 0, "foco_apagado", 2).setOrigin(0.5).setVisible(false));
    this.volts = letras(s, 0, -26, "", 2, OSCURO);
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
          this.ev.poner(nuevas);
          return true;
        },
        tocar: () => {
          this.elegida = this.elegida === k.punto ? null : k.punto;
          if (this.elegida) this.ev.aviso(TC.seleccionada);
          this.gaveta.forEach((g, j) => g.fondo.setTexture(this.elegida === CARGAS[j]!.punto ? "boton_primario" : "boton_secundario"));
          this.marcar();
        },
      });
      return { fondo: marco(s, x, G.y, "boton_secundario", G.w, G.h), pieza: img(s, x, G.y, "foco_apagado", 2).setOrigin(0.5), zona };
    });
    this.c.add([img(s, 0, 0, "placa_4x4", K).setOrigin(0), ...this.marcas.values(), this.rieles, ...this.cargas, this.trazo, this.previa,
      this.volts, letras(s, 100 * K, -26, TC.rielMenos, 2, OSCURO).setOrigin(1, 0), this.zona, ...this.gaveta.flatMap((g) => [g.fondo, g.pieza, g.zona])]);
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
      if (puesta) this.cargas[i]!.setPosition(coord(puesta.a).x, (coord(puesta.a).y + coord(puesta.b).y) / 2);
      const g = this.gaveta[i]!, ver = this.c.visible && !puesta;
      g.fondo.setVisible(!puesta).setTexture(this.elegida === k.punto ? "boton_primario" : "boton_secundario");
      g.pieza.setVisible(!puesta).setTexture(spriteDe(circuito, i, 0)).setScale(escalaDe(circuito, i));
      g.zona.input!.enabled = ver;
    });
    this.trazo.clear();
    cables.forEach((c, i) => {
      const pts = curva(c, i).map(({ x, y }) => new Phaser.Math.Vector2(x, y));
      this.trazo.lineStyle(8, OSCURO).strokePoints(pts).lineStyle(5, reparada ? 0xfff3a0 : colorCable(c)).strokePoints(pts);
    });
    this.marcar();
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
      return this.ev.poner(nuevas);
    }
    const medir = this.ev.medir();
    if (medir) {
      const k = cargaEn(punto, cargasPuestas(this.puestas));
      return k ? medir(k.punto) : this.ev.aviso("Toca una pieza para medirla.");
    }
    const i = cableTocado(this.cables, x, y);
    if (i >= 0) { this.origen = null; return this.ev.cambio(quitarCable(this.cables, i)); }
    if (!punto) { this.origen = null; return this.marcar(); }
    this.arrastre = { a: punto, x0: x, y0: y, activo: false, id: p.id };
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
    const sobre = puntoEn(x, y);
    this.dibujarPrevia(d.a, esDestino(d.a, sobre) ? sobre! : null, x, y);
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
    const b = puntoEn(x, y);
    if (b && esDestino(d.a, b)) return this.unir(d.a, b);
    this.ev.aviso(TC.destinoNoSirve);
    this.marcar();
  }

  private unir(a: Punto, b: Punto) {
    const nuevos = ponerCable(this.cables, a, b);
    if (!nuevos) { this.ev.aviso(TC.cableNoValido); return this.marcar(); }
    if (montaje(nuevos) === "puente") this.ev.aviso(TC.cortoAviso);
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
        : (desde && esDestino(desde, p)) || libre(p) ? "casilla_valida" : bornes.has(p) ? "casilla_ocupada" : null;
      im.setVisible(!!t);
      if (t) im.setTexture(t);
    }
    this.rieles.clear();
    for (const r of ["+", "-"] as const) {
      if (r !== desde && !(desde && esDestino(desde, r))) continue;
      this.rieles.lineStyle(r === desde || r === sobre ? 4 : 2, CIAN).strokeRect((r === "+" ? 4 : 86) * K, 4 * K, 10 * K, 72 * K);
    }
  }

  private dibujarPrevia(a: Punto, sobre: Punto | null, x: number, y: number) {
    this.marcar(a, sobre);
    const fin = sobre ? coord(sobre, coord(a).y) : { x, y }, ini = coord(a, fin.y);
    const q = control(ini.x, ini.y, fin.x, fin.y, this.cables.length);
    const pts = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(ini.x, ini.y), new Phaser.Math.Vector2(q.x, q.y), new Phaser.Math.Vector2(fin.x, fin.y)).getPoints(20);
    const color = colorCable({ a, b: sobre ?? "0,0" });
    const g = this.previa.clear().lineStyle(3, CIAN).strokeCircle(ini.x, ini.y, 16).lineStyle(8, OSCURO).strokePoints(pts);
    if (sobre) g.lineStyle(5, color).strokePoints(pts);
    // Sin destino válido el cable va a trazos.
    else for (let i = 0; i + 1 < pts.length; i += 2) g.lineStyle(5, color).lineBetween(pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y);
  }
}
