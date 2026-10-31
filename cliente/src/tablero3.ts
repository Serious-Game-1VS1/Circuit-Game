/**
 * Placa experta en Phaser (nivel 3, «placa3»): protoboard de tiras de 5 agujeros con rieles + y −, pestañas de gavetas (Resistencias,
 * LED/Diodo, Interruptores, Otros, Cables y Medir) y su fila de piezas. Las piezas se ARRASTRAN de la gaveta a la placa (arrastre.ts) o se
 * tocan y luego se toca la placa; un toque en una pieza puesta abre «Girar / Quitar» y arrastrarla la mueve (fuera de la placa, vuelve a la
 * gaveta). Los cables se arrastran de una tira a otra (o toque y toque). Con el multímetro encendido, dos toques miden entre dos agujeros.
 * La lógica pura vive en placa3.ts; el árbitro decide si el montaje cumple el problema.
 */
import * as Phaser from "phaser";
import { diodo, img, letras, marco, resistenciaBandas } from "./arte";
import { arrastrable, type Toque } from "./arrastre";
import { bandas } from "./colores";
import {
  ALTO3, ANCHO3, AYUDA_CABLES, CANAL, COLOR_LED, GAVETAS, PASO, RIEL_MAS, RIEL_MENOS, VACIO, Y0, cableEn3, colorCable3, colX, coordHoyo, enGaveta, filaY, girar3,
  hoyoCerca, hoyoLibre, nombrePieza, ocupados, piezaEn3, polar, poner3, ponerCable3, quitar3, quitarCable3, ranuraPieza, ruta, tiraEn, tipoDe, TODOS, valorDe,
  type Gaveta, type Hoyo, type Montaje3, type P2,
} from "./placa3";
import { textoVolts } from "./vista";

const OSCURO = 0x140f1f, CIAN = 0x5ef0ff, GRIS = 0x9aa4c0;
/** Pestañas (y local −30) y fila de piezas (y local 264), en coordenadas del tablero. Zonas táctiles ≥ 55 de lienzo (44 px en pantalla). */
export const GAV3 = { tabY: -30, tabW: 60, tabH: 56, filaY: 264, slotW: 82, slotH: 58 } as const;
export type Estado3 = "normal" | "encendido" | "quemado";

export interface Eventos3 {
  cambio: (m: Montaje3) => void;
  aviso: (t: string) => void;
  /** Multímetro encendido: medir entre dos agujeros («h1~h2»). null = no se mide. */
  medir: () => ((punto: string) => void) | null;
  bloqueado: () => boolean;
  /** Se eligió una pestaña (la de «Medir» muestra el multímetro). */
  gaveta: (g: Gaveta) => void;
}

/** Dibujo vertical de una pieza: patas en (0, −PASO/2) y (0, +PASO/2); ánodo arriba salvo girada. */
export function dibujoPieza(s: Phaser.Scene, id: string, girada = false, estado: Estado3 = "normal"): Phaser.GameObjects.Container {
  const c = s.add.container(0, 0), g = s.add.graphics(), t = tipoDe(id), v = valorDe(id), h = PASO / 2;
  g.lineStyle(3, 0xb8c0d0).lineBetween(0, -h, 0, h);
  c.add(g);
  if (t === "R") c.add(resistenciaBandas(s, 0, 0, 2, bandas(Number(v))).setAngle(90));
  else if (t === "D") c.add(diodo(s, 0, 0, 2, girada).setAngle(90));
  else if (t === "L") {
    const color = COLOR_LED[v] ?? 0xff3b3b, y = girada ? 5 : -5, d = s.add.graphics();
    if (estado === "encendido") d.fillStyle(color, 0.35).fillCircle(0, y, 19);
    d.fillStyle(estado === "quemado" ? 0x3a3438 : color, estado === "normal" ? 0.45 : 1).fillCircle(0, y, 10).fillRect(-10, y, 20, girada ? -8 : 8)
      .fillStyle(0xffffff, estado === "quemado" ? 0.1 : 0.55).fillRect(-5, y - 6, 3, 5)
      .fillStyle(0xd8dee9).fillRect(-12, girada ? y - 9 : y + 7, 24, 3); // aro de la base
    c.add([d, letras(s, 13, girada ? h - 14 : -h + 2, "+", 1.5, 0xffe27a)]); // + = pata larga (ánodo)
  } else if (t === "S") {
    if (v === "int") c.add(img(s, 0, 0, "interruptor_cerrado", 2).setOrigin(0.5).setAngle(90));
    else c.add(s.add.graphics().fillStyle(0x2a2433).fillRect(-10, -10, 20, 20).fillStyle(0xe8363c).fillCircle(0, 0, 6).lineStyle(2, 0xd8dee9).strokeRect(-10, -10, 20, 20));
  } else c.add(s.add.graphics().fillStyle(0x2f5fd0).fillRoundedRect(-8, -13, 16, 26, 3).fillStyle(0xd8dee9).fillRect(3, -13, 3, 26).fillStyle(0x9ab0e8).fillRect(-8, -13, 16, 3));
  return c;
}

export class Tablero3 {
  readonly c: Phaser.GameObjects.Container;
  private m: Montaje3 = VACIO;
  private opciones: string[] = [];
  private volts = 9;
  private estado: Estado3 = "normal";
  gavetaActual: Gaveta = "R";
  /** Pieza de la gaveta tocada (sin arrastrar), esperando un toque en la placa. */
  private elegida: string | null = null;
  /** Pieza puesta seleccionada (menú Girar / Quitar). */
  private sel: string | null = null;
  /** Primer agujero del cable (toque-toque) o arrastre en curso desde la placa. */
  private origen: Hoyo | null = null;
  private arr?: { x0: number; y0: number; id: number; activo: boolean; hoyo?: Hoyo; pieza?: string; fantasma?: Phaser.GameObjects.Container };
  /** Multímetro: punta roja puesta y la última medida (para dibujar las puntas). */
  private punta: Hoyo | null = null;
  private medida: [Hoyo, Hoyo] | null = null;
  private readonly fondo: Phaser.GameObjects.Graphics;
  private readonly marcas: Phaser.GameObjects.Graphics;
  private readonly piezasC: Phaser.GameObjects.Container;
  private readonly cablesG: Phaser.GameObjects.Graphics;
  private readonly zona: Phaser.GameObjects.Zone;
  private readonly voltsT: Phaser.GameObjects.BitmapText;
  private readonly tabs: { g: Gaveta; fondo: Phaser.GameObjects.NineSlice; t: Phaser.GameObjects.BitmapText; zona: Phaser.GameObjects.Zone }[];
  private readonly slots: { fondo: Phaser.GameObjects.NineSlice; zona: Phaser.GameObjects.Zone; dib: Phaser.GameObjects.Container; nombre: Phaser.GameObjects.BitmapText; id: string | null; clave: string }[];
  private readonly ayuda: Phaser.GameObjects.BitmapText;
  private readonly menu: Phaser.GameObjects.Container;
  private readonly menuB: { fondo: Phaser.GameObjects.NineSlice; t: Phaser.GameObjects.BitmapText; zona: Phaser.GameObjects.Zone }[];

  constructor(private readonly s: Phaser.Scene, x: number, y: number, private readonly ev: Eventos3) {
    this.c = s.add.container(x, y);
    this.fondo = s.add.graphics();
    const signos = this.dibujarPlaca();
    this.marcas = s.add.graphics();
    this.cablesG = s.add.graphics();
    this.piezasC = s.add.container(0, 0);
    this.voltsT = letras(s, RIEL_MAS - 9, 0, "", 1.5, OSCURO);
    this.zona = s.add.zone(-10, Y0 - 8, ANCHO3 + 20, PASO * 4 + 16).setOrigin(0).setInteractive({ useHandCursor: true });
    this.zona.on("pointerdown", (p: Phaser.Input.Pointer) => this.bajar(p));
    s.input.on("pointermove", (p: Phaser.Input.Pointer) => this.mover(p));
    s.input.on("pointerup", (p: Phaser.Input.Pointer) => this.soltar(p));
    // Pestañas de las gavetas: 6 de 60 px (todo el ancho del panel).
    this.tabs = GAVETAS.map(({ id, titulo }, i) => {
      const tx = -30 + GAV3.tabW / 2 + GAV3.tabW * i;
      const zona = s.add.zone(tx, GAV3.tabY, GAV3.tabW, GAV3.tabH).setInteractive({ useHandCursor: true }).on("pointerdown", () => this.elegirGaveta(id));
      return { g: id, fondo: marco(s, tx, GAV3.tabY, "boton_secundario", GAV3.tabW - 2, 40), t: letras(s, tx, GAV3.tabY, titulo, 1.5).setOrigin(0.5), zona };
    });
    this.slots = [0, 1, 2, 3].map((i) => {
      const sx = ANCHO3 / 2 + (i - 1.5) * 88, zona = s.add.zone(sx, GAV3.filaY, GAV3.slotW, GAV3.slotH).setInteractive({ useHandCursor: true });
      const slot = { fondo: marco(s, sx, GAV3.filaY, "boton_secundario", GAV3.slotW, 52), zona, dib: s.add.container(sx, GAV3.filaY - 8), nombre: letras(s, sx, GAV3.filaY + 14, "", 1.5).setOrigin(0.5), id: null as string | null, clave: "" };
      arrastrable(s, zona, {
        puede: () => this.c.visible && !this.ev.bloqueado() && !!slot.id,
        fantasma: () => dibujoPieza(s, slot.id!).setScale(1.2),
        sobre: (p) => this.marcar(p && slot.id ? this.ranuraBajo(slot.id, p) : null),
        soltar: (p) => this.colocar(slot.id!, p),
        tocar: () => { this.elegida = this.elegida === slot.id ? null : slot.id; this.sel = null; if (this.elegida) this.ev.aviso("Ahora toca la placa donde va la pieza."); this.repintar(); },
      });
      return slot;
    });
    this.ayuda = letras(s, ANCHO3 / 2, GAV3.filaY, AYUDA_CABLES, 1.5, GRIS).setOrigin(0.5).setCenterAlign().setMaxWidth(340).setVisible(false);
    // Menú de la pieza puesta: Girar (LED y diodo) y Quitar, botones de 64 × 56.
    this.menuB = ["Girar", "Quitar"].map((t, i) => {
      const yy = i ? 30 : -30, zona = s.add.zone(0, yy, 72, 58).setInteractive({ useHandCursor: true }).on("pointerdown", () => this.accionMenu(i ? "quitar" : "girar"));
      return { fondo: marco(s, 0, yy, "boton_primario", 68, 52), t: letras(s, 0, yy, t, 1.5, OSCURO).setOrigin(0.5), zona };
    });
    this.menu = s.add.container(0, 0, this.menuB.flatMap((b) => [b.fondo, b.t, b.zona])).setVisible(false);
    this.c.add([this.fondo, ...signos, this.marcas, this.piezasC, this.cablesG, this.voltsT, this.zona, ...this.tabs.flatMap((t) => [t.fondo, t.t, t.zona]),
      ...this.slots.flatMap((sl) => [sl.fondo, sl.dib, sl.nombre, sl.zona]), this.ayuda, this.menu]);
  }

  /** Protoboard: cuerpo crema, rieles rojo (+) y azul (−), canal central y tiras de 5 agujeros unidas por su pletina. */
  private dibujarPlaca() {
    const g = this.fondo, CREMA = 0xf1e8cf, HOYO = 0x5a5444;
    g.fillStyle(0x2a2433).fillRoundedRect(-4, -4, ANCHO3 + 8, ALTO3 + 8, 8).fillStyle(CREMA).fillRoundedRect(0, 0, ANCHO3, ALTO3, 6);
    ([[RIEL_MAS, 0xe8363c], [RIEL_MENOS, 0x3e6af0]] as const).forEach(([x, color]) => g.fillStyle(color, 0.25).fillRoundedRect(x - 11, Y0, 22, PASO * 4, 4).fillStyle(color).fillRect(x + (x < CANAL ? 10 : -12), Y0, 2, PASO * 4));
    g.fillStyle(0xa79a74).fillRect(CANAL - 5, 4, 10, ALTO3 - 8).fillStyle(0x6d6652).fillRect(CANAL - 3, 4, 6, ALTO3 - 8);
    for (let f = 0; f < 4; f++) {
      const y = filaY(f);
      for (const [x0, x1] of [[colX(0), colX(4)], [colX(5), colX(9)]] as const) g.fillStyle(0xe2d6b4).fillRoundedRect(x0 - 12, y - 14, x1 - x0 + 24, 28, 6).fillStyle(0xc9bb93).fillRect(x0, y - 1, x1 - x0, 3);
      if (f) g.fillStyle(0xd9cca6).fillRect(28, Y0 + PASO * f - 1, ANCHO3 - 56, 2);
    }
    for (const h of TODOS) { const { x, y } = coordHoyo(h); g.fillStyle(HOYO).fillRect(x - 3, y - 3, 6, 6); }
    return ([[RIEL_MAS, "+"], [RIEL_MENOS, "-"]] as const).map(([x, signo]) => letras(this.s, x, ALTO3 - 2, signo, 2, x < CANAL ? 0xe8363c : 0x3e6af0).setOrigin(0.5, 1));
  }

  private local(p: Toque) { const v = this.c.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY); return { x: v.x, y: v.y }; }
  private ranuraBajo(id: string, p: Toque) { const { x, y } = this.local(p); return ranuraPieza(this.m, id, x, y); }
  private colocar(id: string, p: Toque) {
    const r = this.ranuraBajo(id, p);
    if (!r) { this.ev.aviso("Ahí no cabe: suelta la pieza sobre dos tiras libres de la placa."); return false; }
    this.elegida = null; this.sel = null;
    this.ev.cambio(poner3(this.m, id, r));
    return true;
  }

  private elegirGaveta(g: Gaveta) {
    if (!this.c.visible) return;
    this.gavetaActual = g; this.elegida = null; this.sel = null; this.punta = null;
    this.ev.gaveta(g);
    if (g === "cable") this.ev.aviso(AYUDA_CABLES);
    this.repintar();
  }

  /** Pinta la placa de la zona: montaje, piezas de la gaveta y si los LED lucen (zona reparada) o se quemaron. */
  pintar(opciones: string[], volts: number, m: Montaje3, estado: Estado3) {
    if (m !== this.m) { this.origen = null; this.punta = null; this.medida = null; if (this.sel && !m.piezas.some((p) => p.id === this.sel)) this.sel = null; }
    if (opciones.join() !== this.opciones.join()) { this.elegida = null; this.sel = null; this.punta = null; this.medida = null; this.gavetaActual = "R"; }
    this.opciones = opciones; this.volts = volts; this.m = m; this.estado = estado;
    this.repintar();
  }
  /** Tras medir o cambiar de modo: borra la punta roja pendiente. */
  limpiarPuntas() { this.punta = null; this.medida = null; this.marcar(null); }
  /** Agujeros de la última medida en coordenadas del panel (para las puntas animadas). */
  puntasPanel(): { a: P2; b: P2 } | null {
    if (!this.medida) return null;
    const [a, b] = this.medida.map(coordHoyo) as [P2, P2];
    return { a: { x: this.c.x + a.x, y: this.c.y + a.y }, b: { x: this.c.x + b.x, y: this.c.y + b.y } };
  }

  private repintar() {
    const s = this.s, m = this.m;
    this.voltsT.setText(textoVolts(this.volts));
    this.piezasC.removeAll(true);
    for (const p of m.piezas) {
      const d = dibujoPieza(s, p.id, p.g, tipoDe(p.id) === "L" ? this.estado : "normal").setPosition(colX(p.c), (filaY(p.f) + filaY(p.f + 1)) / 2);
      if (p.id === this.sel) this.piezasC.add(s.add.rectangle(d.x, d.y, 30, PASO + 6).setStrokeStyle(2, CIAN));
      this.piezasC.add(d);
    }
    this.cablesG.clear();
    for (const k of m.cables) {
      const r = ruta(k[0], k[1]).map(({ x, y }) => new Phaser.Math.Vector2(x, y)), A = r[0]!, B = r.at(-1)!;
      this.cablesG.lineStyle(7, OSCURO).strokePoints(r).lineStyle(4, this.estado === "encendido" ? 0xfff3a0 : colorCable3(k)).strokePoints(r)
        .fillStyle(OSCURO).fillCircle(A.x, A.y, 5).fillCircle(B.x, B.y, 5).fillStyle(colorCable3(k)).fillCircle(A.x, A.y, 3).fillCircle(B.x, B.y, 3);
    }
    // Gaveta: pestaña activa y sus piezas (las ya puestas no salen).
    const ver = this.c.visible;
    for (const t of this.tabs) { t.fondo.setTexture(t.g === this.gavetaActual ? "boton_primario" : "boton_secundario"); t.t.setTint(t.g === this.gavetaActual ? OSCURO : 0xffffff); t.zona.input!.enabled = ver; }
    const piezas = this.gavetaActual === "medir" || this.gavetaActual === "cable" ? [] : enGaveta(this.opciones, m, this.gavetaActual);
    this.slots.forEach((sl, i) => {
      const id = piezas[i] ?? null, vis = !!id && this.gavetaActual !== "medir";
      sl.id = id;
      sl.fondo.setVisible(vis).setTexture(id && id === this.elegida ? "boton_primario" : "boton_secundario");
      sl.zona.input!.enabled = ver && vis;
      if (sl.clave !== (id ?? "")) { sl.clave = id ?? ""; sl.dib.removeAll(true); if (id) sl.dib.add(dibujoPieza(s, id).setAngle(-90)); }
      sl.dib.setVisible(vis);
      sl.nombre.setVisible(vis).setText(id && tipoDe(id) !== "R" ? nombrePieza(id) : "").setTint(id === this.elegida ? OSCURO : 0xffffff);
    });
    const vacia = this.gavetaActual !== "medir" && this.gavetaActual !== "cable" && !piezas.length;
    this.ayuda.setVisible(this.gavetaActual === "cable" || vacia).setText(vacia ? "Gaveta vacía: lo que había está en la placa." : AYUDA_CABLES);
    // Menú de la pieza seleccionada, al lado de la pieza (hacia el centro de la placa).
    const p = this.sel ? m.piezas.find((q) => q.id === this.sel) : undefined;
    this.menu.setVisible(!!p);
    this.menuB.forEach((b, i) => { const on = !!p && (i === 1 || polar(p.id)); b.fondo.setVisible(on); b.t.setVisible(on); b.zona.input!.enabled = on && ver; });
    if (p) this.menu.setPosition(colX(p.c) < CANAL ? Math.max(colX(p.c) + 52, colX(4) + 4) : Math.min(colX(p.c) - 52, colX(5) - 4), // junto al canal: no tapa la columna vecina
      Math.min(ALTO3 - 60, Math.max(60, (filaY(p.f) + filaY(p.f + 1)) / 2)));
    this.marcar(null);
  }

  mostrar(ver: boolean) {
    this.c.setVisible(ver);
    this.zona.input!.enabled = ver;
    if (!ver) { this.menu.setVisible(false); for (const t of this.tabs) t.zona.input!.enabled = false; for (const sl of this.slots) sl.zona.input!.enabled = false; for (const b of this.menuB) b.zona.input!.enabled = false; }
  }

  private accionMenu(a: "girar" | "quitar") {
    const id = this.sel;
    if (!id || this.ev.bloqueado()) return;
    if (a === "quitar") { this.sel = null; this.ev.cambio(quitar3(this.m, id)); }
    else this.ev.cambio(girar3(this.m, id));
  }

  private bajar(p: Phaser.Input.Pointer) {
    if (!this.c.visible || this.ev.bloqueado()) return;
    const { x, y } = this.local(p), medir = this.ev.medir();
    if (medir) { // dos toques: punta roja y punta negra
      const h = hoyoCerca(x, y);
      if (!h) return this.ev.aviso("Toca un agujero de la placa o un riel.");
      if (!this.punta) { this.punta = h; this.medida = null; this.ev.aviso("Punta roja puesta. Toca el segundo punto (punta negra)."); return this.marcar(null); }
      const a = this.punta; this.punta = null; this.medida = [a, h];
      this.marcar(null);
      return medir(`${a}~${h}`);
    }
    if (this.elegida) { const id = this.elegida; this.colocar(id, p); return this.repintar(); }
    const pz = piezaEn3(this.m, x, y);
    if (pz) { this.arr = { x0: x, y0: y, id: p.id, activo: false, pieza: pz.id }; return; }
    const i = cableEn3(this.m, x, y);
    if (i >= 0) { this.origen = null; this.sel = null; return this.ev.cambio(quitarCable3(this.m, i)); }
    if (this.sel) { this.sel = null; this.repintar(); }
    const h = hoyoLibre(this.m, x, y);
    if (!h) { this.origen = null; if (tiraEn(x, y)) this.ev.aviso("Esa tira está llena: usa otra."); return this.marcar(null); }
    this.arr = { x0: x, y0: y, id: p.id, activo: false, hoyo: h };
  }

  private mover(p: Phaser.Input.Pointer) {
    const d = this.arr;
    if (!d || p.id !== d.id) return;
    const { x, y } = this.local(p);
    if (!d.activo) { if (Math.hypot(x - d.x0, y - d.y0) < 10) return; d.activo = true; this.origen = null; this.sel = null; }
    if (d.pieza) {
      d.fantasma ??= dibujoPieza(this.s, d.pieza, this.m.piezas.find((q) => q.id === d.pieza)?.g).setDepth(1000).setAlpha(0.85);
      d.fantasma.setPosition(p.worldX, p.worldY);
      return this.marcar(ranuraPieza(this.m, d.pieza, x, y));
    }
    this.marcar(null, d.hoyo, hoyoLibre(this.m, x, y), { x, y });
  }

  private soltar(p: Phaser.Input.Pointer) {
    const d = this.arr;
    if (!d || p.id !== d.id) return;
    this.arr = undefined;
    d.fantasma?.destroy();
    const { x, y } = this.local(p);
    if (d.pieza) {
      if (!d.activo) { this.sel = this.sel === d.pieza ? null : d.pieza; this.origen = null; if (this.sel) this.ev.aviso(polar(d.pieza) ? "Girar cambia su polaridad; Quitar la devuelve a la gaveta." : "Quitar la devuelve a la gaveta. Arrástrala para moverla."); return this.repintar(); }
      const r = ranuraPieza(this.m, d.pieza, x, y);
      if (r) return this.ev.cambio(poner3(this.m, d.pieza, r));
      if (!tiraEn(x, y)) return this.ev.cambio(quitar3(this.m, d.pieza)); // soltada fuera de la placa: vuelve a la gaveta
      this.ev.aviso("Ahí no cabe: elige dos tiras libres.");
      return this.repintar();
    }
    if (!d.activo) { // toque-toque: origen y luego destino
      if (!this.origen) { this.origen = d.hoyo!; this.ev.aviso("Toca otra tira o un riel para tender el cable."); return this.marcar(null); }
      const a = this.origen; this.origen = null;
      return a === d.hoyo ? this.marcar(null) : this.unir(a, d.hoyo!);
    }
    const b = hoyoLibre(this.m, x, y);
    if (b) return this.unir(d.hoyo!, b);
    this.ev.aviso("Suelta el cable sobre otra tira o un riel.");
    this.marcar(null);
  }

  private unir(a: Hoyo, b: Hoyo) {
    const n = ponerCable3(this.m, a, b);
    if (!n) { this.ev.aviso("Ese cable no sirve: une dos agujeros libres distintos."); return this.marcar(null); }
    this.ev.cambio(n);
  }

  /** Resaltes: ranura de la pieza que se arrastra, origen del cable y su vista previa, tiras destino y la punta roja del multímetro. */
  private marcar(ranura: { f: number; c: number } | null, desde: Hoyo | null = this.origen, sobre: Hoyo | null = null, dedo?: P2) {
    const g = this.marcas.clear();
    if (ranura) for (const f of [ranura.f, ranura.f + 1]) g.lineStyle(3, CIAN).strokeCircle(colX(ranura.c), filaY(f), 9);
    if (ranura) g.fillStyle(CIAN, 0.25).fillRect(colX(ranura.c) - 12, filaY(ranura.f), 24, PASO);
    if (this.elegida || ranura) {
      const us = ocupados(this.m);
      for (let f = 0; f < 4; f++) for (let c = 0; c < 10; c++) if (!us.has(`${f},${c}`)) g.fillStyle(0x56d364, 0.5).fillRect(colX(c) - 3, filaY(f) - 3, 6, 6);
    }
    if (desde) {
      const A = coordHoyo(desde);
      g.lineStyle(3, CIAN).strokeCircle(A.x, A.y, 11);
      if (sobre) { const B = coordHoyo(sobre); g.lineStyle(3, CIAN).strokeCircle(B.x, B.y, 11); }
      const fin = sobre ? coordHoyo(sobre) : dedo;
      if (fin && dedo) g.lineStyle(4, CIAN, sobre ? 1 : 0.5).strokePoints([new Phaser.Math.Vector2(A.x, A.y), new Phaser.Math.Vector2(fin.x, A.y), new Phaser.Math.Vector2(fin.x, fin.y)]);
    }
    for (const [h, color] of [[this.punta, 0xff4a4a], ...(this.medida ? [[this.medida[0], 0xff4a4a], [this.medida[1], 0x202432]] : [])] as [Hoyo | null, number][]) {
      if (!h) continue;
      const { x, y } = coordHoyo(h);
      g.lineStyle(3, 0xffffff).strokeCircle(x, y, 10).lineStyle(3, color).strokeCircle(x, y, 7);
    }
  }
}
