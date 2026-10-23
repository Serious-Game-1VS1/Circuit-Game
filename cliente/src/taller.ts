/**
 * Escena Taller con el arte del kit: pod nave en la bahía (entra y sale con tween), pestañas de las
 * 4 zonas, humo en la zona dañada, cola de pods, y el panel del circuito (debajo en móvil 360×800,
 * al lado en escritorio 1440×900). Solo pinta la Pantalla; la mecánica la decide el árbitro.
 */
import * as Phaser from "phaser";
import type { Circuito, Medida, ModoMedir, ZonaNombre, ZonaView } from "../../spike/src/protocol";
import type { Net } from "./net";
import { anim, cargarArte, img, letras, marco, toque } from "./arte";
import { anguloTension, lecturaLista, T as TM, textoMedida, textoModo, TRAMO, type Midiendo } from "./multimetro";
import { avisoVivo, despachable, faltan, pistaDemo, reloj, tarjetaVisible, textoRival, type Falta, type Pantalla } from "./pantalla";
import { arrastrable, dentro } from "./arrastre";
import { cargasPuestas, conPlaca, montaje, todasPuestas, type Cable, type Puestas } from "./placa";
import { Tablero, TC } from "./tablero";
import { actual, esUltimo, iniciar, saltar, siguiente, textoPaso, type Objetivo, type Tutorial } from "./tutorial";
import { cargas, cola, estadoZona, nivelCarga, pestanasArte, podDe, sprite, spriteBateria, spriteCarga, spritePieza, spriteTarjeta } from "./sprites";
import { botonesGaveta, FRENA, GAVETA, NOMBRE_ZONA, PISTA_DEMO, RETO, textoOpcion, textoVolts, type Aguja } from "./vista";

const K = 4;
const ANGULO: Record<Aguja, number> = { poco: -60, correcto: 0, demasiado: 60 };
const OSCURO = 0x140f1f, ALERTA = 0xff8a7a, GRIS = 0x9aa4c0, PISTA = 0xffd23f;
/** Coordenadas locales de la escena (bloque de 360 px de ancho). */
const POD_X = -12, POD_Y = 130, BAHIA_Y = 294;
type Bloque = Phaser.GameObjects.Container;
const puntos = (...p: [number, number][]) => p.map(([x, y]) => new Phaser.Math.Vector2(x, y));
/** Ranura de la pieza en el dibujo del circuito (coordenadas del panel): ahí se suelta lo que se arrastra de la gaveta. */
const RANURA = { x: 180, y: 34, w: 140, h: 96 };
type Letras = Phaser.GameObjects.BitmapText;

export class Taller extends Phaser.Scene {
  private zona = 0;
  /** Pieza elegida por zona, con clave "pod-zona": la gaveta empieza sin elección. */
  private elegidas = new Map<string, string>();
  /** Cables de la placa por "pod-zona" (Cabina y Turbina). */
  private cables = new Map<string, Cable[]>();
  /** Piezas arrastradas a la placa por "pod-zona" (Cabina y Turbina); empiezan en la gaveta. */
  private puestas = new Map<string, Puestas>();
  /** Multímetro: modo activo, medición en curso (~1 s) y última lectura de esta zona. */
  private modo: ModoMedir | null = null;
  private midiendo?: Midiendo;
  private lectura?: Medida;
  private avisoLocal?: { texto: string; hasta: number };
  private podC?: Bloque;
  private podNum = 0;
  /** Modo demo: ya probó una vez (la pista del primer pod no vuelve). */
  private intento = false;
  /** Tutorial: paso en curso (null si no es el tutorial) y qué paso se pintó por última vez. */
  private tut: Tutorial | null = null;
  private guiaClave = "";
  /** Alto táctil mínimo en unidades del lienzo para que valga 44 px en pantalla; ver ajustarGolpes(). */
  private golpe = 48;
  private guia!: { caja: Bloque; titulo: Letras; texto: Letras; saltar: Letras; sig: Letras; zonas: Phaser.GameObjects.Zone[]; resaltes: Phaser.GameObjects.NineSlice[] };
  private ui!: {
    escena: Bloque; panel: Bloque; estado: Letras; rival: Letras; salir: Phaser.GameObjects.Zone; reloj: Letras; contador: Phaser.GameObjects.Image;
    pestanas: Phaser.GameObjects.Image[]; globo: Letras; cola: Bloque; bahia: Phaser.GameObjects.Sprite;
    circuito: Bloque; carga: Phaser.GameObjects.Image[]; aguja: Phaser.GameObjects.Image; aviso: Letras; gaveta: Letras;
    opciones: { fondo: Phaser.GameObjects.NineSlice; zona: Phaser.GameObjects.Zone; texto: Letras; nombre: Letras }[]; probar: Phaser.GameObjects.Image; despachar: Phaser.GameObjects.Image; golpes: Phaser.GameObjects.Zone[];
    tarjeta: Bloque; cables: Phaser.GameObjects.Graphics; tablero: Tablero; fila: Bloque; etiquetas: Letras[];
    modos: { modo: ModoMedir; fondo: Phaser.GameObjects.NineSlice; icono: Phaser.GameObjects.Image }[]; pasa: Phaser.GameObjects.Image; zonasMedir: Phaser.GameObjects.Zone[];
    /** Pista del primer pod en modo demo: flecha a la gaveta y resaltes (gaveta o Probar). */
    flecha: Phaser.GameObjects.Sprite; resalteGaveta: Phaser.GameObjects.NineSlice; resalteProbar: Phaser.GameObjects.NineSlice; resalteDespachar: Phaser.GameObjects.NineSlice;
    /** Demo de cableado: flecha de la gaveta de la placa hacia arriba (hacia la placa). */
    flechaPlaca: Phaser.GameObjects.Sprite;
    /** Resalte de la ranura del circuito mientras se arrastra una pieza de la gaveta. */
    resalteRanura: Phaser.GameObjects.NineSlice;
  };

  constructor(private readonly net: Net) { super("Taller"); }

  private clave() { return `${this.net.estado.pod?.numero}-${this.zona}`; }
  /** Cables de la zona actual (el mismo arreglo mientras no cambien, para no perder el punto de origen). */
  private cablesZona() {
    const k = this.clave();
    if (!this.cables.has(k)) this.cables.set(k, []);
    return this.cables.get(k)!;
  }
  /** Lo que se manda al árbitro: la pieza de la gaveta o, en la placa, el montaje de los cables. */
  private puestasZona() {
    const k = this.clave();
    if (!this.puestas.has(k)) this.puestas.set(k, {});
    return this.puestas.get(k)!;
  }
  /** Lo que se manda al árbitro: la pieza de la gaveta o, en la placa, el montaje de las piezas puestas y sus cables. */
  private eleccion(z: ZonaView): string | undefined {
    if (!conPlaca(z.circuito)) return this.elegidas.get(this.clave());
    const m = montaje(this.cablesZona(), cargasPuestas(this.puestasZona()));
    return m && z.opciones.includes(m) ? m : undefined;
  }
  /** Qué le falta para poder probar (pistas del demo y aviso por defecto). */
  private falta(z: ZonaView): Falta {
    if (!conPlaca(z.circuito)) return this.eleccion(z) ? null : "elegir";
    return !todasPuestas(this.puestasZona()) ? "colocar" : this.eleccion(z) ? null : "cablear";
  }
  private avisar(texto: string) { this.avisoLocal = { texto, hasta: Date.now() + 2600 }; }
  private limpiarMedida() { this.lectura = undefined; this.midiendo = undefined; }
  private medir(punto: string) {
    const z = this.zonaActual(), modo = this.modo;
    if (!z || !modo || this.midiendo) return;
    const pieza = this.eleccion(z);
    if (!pieza) return this.avisar(TM.sinPieza);
    this.lectura = undefined;
    this.midiendo = { seq: this.net.medir(z.zona, pieza, modo, punto), desde: Date.now(), punto };
  }
  private zonaActual() {
    const zonas = this.net.estado.pod?.zonas ?? [];
    return zonas.find((x) => x.zona === this.zona) ?? zonas[0];
  }

  preload() { cargarArte(this); }

  create() {
    const net = this.net, an = innerWidth > innerHeight;
    // El Taller usa su propio lienzo (360×800 vertical o 1440×900 apaisado) y devuelve el de las demás escenas al salir.
    const { width, height } = this.scale.gameSize;
    this.scale.setGameSize(an ? 1440 : 360, an ? 900 : 800);
    this.events.once("shutdown", () => this.scale.setGameSize(width, height));
    this.cameras.main.setRoundPixels(true);
    img(this, 0, 0, an ? "fondo_taller_ancho" : "fondo_taller").setOrigin(0);
    img(this, 0, 0, an ? "hud_barra_ancho" : "hud_barra").setOrigin(0);
    img(this, 22, 20, "icono_reloj", 2);
    const relojT = letras(this, 36, 12, "", 2);
    const estado = letras(this, 86, 12, "", 2);
    const contador = img(this, an ? 1440 - 70 : 296, 20, "contador_pods_0", 2);
    img(this, 22, 52, "icono_rival", 2);
    const rival = letras(this, 36, 44, "", 2, GRIS);
    // Práctica: sin rival; su línea del HUD sirve para salir.
    const salir = toque(this, 180, 52, 360, 32, () => { if (net.estado.practica) void net.salir(); });

    // Escena: pestañas, globo con el reto, cola, bahía y pod.
    const escena = this.add.container(an ? 200 : 0, an ? 290 : 72);
    const pestanas = [0, 1, 2, 3].map((i) => img(this, 46 + i * 90, 30, "pestana_radar_inactiva").setOrigin(0.5)
      .setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        const pod = net.estado.pod, t = pod && pestanasArte(pod, this.zona)[i];
        if (t?.zona != null && t.zona !== this.zona) { this.zona = t.zona; this.limpiarMedida(); net.limpiarAviso(); this.pintar(net.estado); }
      }));
    const globo = letras(this, 22, 72, "", 2, OSCURO).setMaxWidth(190);
    const colaC = this.add.container(0, 0);
    const bahia = anim(this, 180, BAHIA_Y, "bahia_ocupada");
    escena.add([...pestanas, img(this, 8, 62, "globo_sintoma", 3).setOrigin(0), globo, colaC, bahia]);

    // Panel del circuito: batería → pieza elegida → carga; medidor; gaveta; Probar y Despachar.
    const panel = this.add.container(an ? 840 : 0, an ? 290 : 430);
    const cables = this.add.graphics();
    cables.lineStyle(4, 0xe8363c).strokePoints(puntos([50, 50], [50, 34], [310, 34], [310, 44]));
    cables.lineStyle(4, 0x3e6af0).strokePoints(puntos([50, 102], [50, 118], [310, 118], [310, 108]));
    const circuito = this.add.container(0, 0);
    const carga = [0, 1].map(() => img(this, 310, 76, "led_rojo_apagado").setOrigin(0.5));
    // Fila del medidor de aguja (veredicto o multímetro) con los dos modos del multímetro a los lados.
    const medidor = img(this, 180, 178, "medidor_fondo", 2).setOrigin(0.5);
    const aguja = img(this, 180, medidor.y - 22 + 40, "medidor_aguja", 2).setVisible(false);
    const pasa = img(this, 180, 172, "icono_pasa", 3).setOrigin(0.5).setVisible(false);
    const etiquetas = [letras(this, 136, 182, "", 2, GRIS).setOrigin(1, 0.5), letras(this, 180, 146, "", 2, GRIS).setOrigin(0.5), letras(this, 224, 182, "", 2, GRIS).setOrigin(0, 0.5)];
    const modos = (["tension", "continuidad"] as const).map((modo, i) => {
      const x = i ? 326 : 34;
      const fondo = marco(this, x, 178, "boton_secundario", 48, 48).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        this.modo = this.modo === modo ? null : modo;
        this.limpiarMedida();
        this.pintar(net.estado);
      });
      return { modo, fondo, icono: img(this, x, 178, `multimetro_modo_${modo}`, 2).setOrigin(0.5) };
    });
    const fila = this.add.container(0, 0, [medidor, aguja, pasa, ...etiquetas, ...modos.flatMap((m) => [m.fondo, m.icono])]);
    // Fuera de la placa se mide tocando la pieza de la gaveta o la carga del dibujo.
    const medirToque = (x: number, y: number, w: number, h: number, punto: (ly: number) => string) =>
      this.add.zone(x, y, w, h).setInteractive().on("pointerdown", (_p: unknown, _lx: number, ly: number) => {
        const z = this.zonaActual();
        if (!z || conPlaca(z.circuito)) return;
        if (this.modo) this.medir(punto(ly));
      });
    const zonasMedir = [
      medirToque(180, 44, 120, 84, () => "pieza"),
      medirToque(310, 76, 72, 110, (ly) => (this.zonaActual()?.circuito === "cabina" && ly > 55 ? "carga2" : "carga1")),
    ];
    const tablero = new Tablero(this, 30, -28, {
      cambio: (c) => { this.cables.set(this.clave(), c); this.limpiarMedida(); this.pintar(net.estado); },
      poner: (pz) => { this.puestas.set(this.clave(), pz); this.limpiarMedida(); this.pintar(net.estado); },
      aviso: (t) => this.avisar(t),
      medir: () => (this.modo ? (punto) => this.medir(punto) : null),
      bloqueado: () => !!this.zonaActual()?.reparada,
    });
    const aviso = letras(this, 180, 206, "", 2).setOrigin(0.5, 0).setCenterAlign().setMaxWidth(340);
    const gaveta = letras(this, 180, 248, "", 2, GRIS).setOrigin(0.5, 0);
    // Hasta 4 botones (el modo demo ofrece las 4 resistencias); pintar() los reparte según cuántas opciones haya.
    // Cada pieza se ARRASTRA hasta la ranura del circuito (resaltada); un toque la pone directo (accesibilidad).
    const resalteRanura = marco(this, RANURA.x, RANURA.y, "recuadro_resaltado", RANURA.w, RANURA.h).setVisible(false);
    const opciones = [0, 1, 2, 3].map((i) => {
      const fondo = marco(this, 0, 290, "boton_secundario", 104, 48);
      const zona = this.add.zone(0, 290, 104, 48).setInteractive({ useHandCursor: true }); // área táctil aparte: crece con ajustarGolpes()
      const pieza = () => { const z = this.zonaActual(); return z && !z.reparada ? z.opciones[i] : undefined; };
      const elegir = (o: string) => { this.elegidas.set(this.clave(), o); this.pintar(net.estado); };
      const enRanura = (p: Phaser.Input.Pointer) => { const v = panel.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY); return dentro(RANURA, v.x, v.y); };
      arrastrable(this, zona, {
        puede: () => !!pieza(),
        fantasma: () => this.add.container(0, 0, [marco(this, 0, 0, "boton_primario", 104, 48),
          letras(this, 0, 0, textoOpcion(pieza()!, this.zonaActual()!.circuito), 2, OSCURO).setOrigin(0.5)]),
        sobre: (p) => resalteRanura.setVisible(!!p).setAlpha(p && enRanura(p) ? 1 : 0.45),
        soltar: (p) => { const o = pieza(); if (!o || !enRanura(p)) return false; elegir(o); return true; },
        tocar: () => { const o = pieza(); if (o) elegir(o); },
      });
      // Valor impreso ("470 Ω") y, en resistencias, su nombre estable ("Frena medio") debajo, más pequeño.
      return { fondo, zona, texto: letras(this, 0, 290, "", 2).setOrigin(0.5), nombre: letras(this, 0, 302, "", 1.5).setOrigin(0.5) };
    });
    const probar = img(this, 92, 340, "boton_probar_normal", 2);
    const despachar = img(this, 268, 340, "boton_despachar_deshabilitado", 2);
    const pulsar = (b: Phaser.GameObjects.Image, base: string, fn: () => void) => () => {
      b.setTexture(`${base}_presionado`); this.time.delayedCall(120, () => this.pintar(net.estado)); fn();
    };
    const golpes: Phaser.GameObjects.Zone[] = [];
    const tarjeta = this.add.container(180, 76).setVisible(false);
    // Pista del modo demo: se ven solo en el primer pod hasta el primer intento (pistaDemo en pantalla.ts).
    const flecha = anim(this, 180, 268, "flecha_guia", 2).setVisible(false);
    const resalteGaveta = marco(this, 180, 290, "recuadro_resaltado", 358, 60).setVisible(false);
    const resalteProbar = marco(this, 92, 340, "recuadro_resaltado", 160, 46).setVisible(false);
    const resalteDespachar = marco(this, 268, 340, "recuadro_resaltado", 160, 46).setVisible(false);
    this.tweens.add({ targets: [resalteGaveta, resalteProbar, resalteDespachar], alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: flecha, y: 274, duration: 400, yoyo: true, repeat: -1 });
    // Demo de cableado: flecha girada que sale de la gaveta de la placa (entre sus dos huecos) hacia la placa.
    const flechaPlaca = anim(this, 180, 246, "flecha_guia", 2).setAngle(180).setVisible(false);
    this.tweens.add({ targets: flechaPlaca, y: 238, duration: 400, yoyo: true, repeat: -1 });
    panel.add([
      marco(this, 180, 177, "panel_oscuro", 360, 356), cables, circuito, resalteRanura, ...carga, ...zonasMedir, tablero.c, fila, aviso, gaveta,
      ...opciones.flatMap((o) => [o.fondo, o.zona, o.texto, o.nombre]), probar, despachar, resalteGaveta, resalteProbar, resalteDespachar, flecha, flechaPlaca,
      // Probar/Despachar miden 34 px de alto: el área táctil es de 48 o más (ajustarGolpes).
      golpes[0] = toque(this, 92, 340, 150, 48, pulsar(probar, "boton_probar", () => {
        const z = this.zonaActual(), elegida = z && this.eleccion(z);
        if (z && !z.reparada && elegida) { net.probar(z.zona, elegida); this.intento = true; }
        else if (z && !z.reparada && conPlaca(z.circuito)) {
          this.avisar(this.falta(z) === "colocar" ? TC.ponerPiezas : montaje(this.cablesZona(), cargasPuestas(this.puestasZona())) ? "Un cable une + con − sin pasar por nada. Quítalo." : TC.terminalSuelto);
        }
      })),
      // Siempre visible; solo se activa con todas las zonas reparadas (Net.despachar lo comprueba).
      golpes[1] = toque(this, 268, 340, 150, 48, () => {
        if (despachable(net.estado)) pulsar(despachar, "boton_despachar", () => net.despachar())();
        else if (faltan(net.estado.pod)) this.avisar(`Aún falta reparar: ${faltan(net.estado.pod)}`);
      }),
      tarjeta,
    ]);

    this.ui = {
      escena, panel, estado, rival, salir, reloj: relojT, contador, pestanas, globo, cola: colaC, bahia, circuito, carga, aguja, aviso, gaveta, opciones, probar, despachar, tarjeta,
      cables, tablero, fila, etiquetas, modos, pasa, zonasMedir, flecha, resalteGaveta, resalteProbar, resalteDespachar, flechaPlaca, resalteRanura, golpes,
    };
    this.crearGuia();
    this.tut = net.tutorial ? iniciar([...(net.estado.demo ? ["multimetro" as const] : []), ...(net.estado.pod?.zonas.some((z) => conPlaca(z.circuito)) ? [] : ["placa" as const])]) : null;
    this.guiaClave = "";
    this.golpe = 0;
    this.podNum = 0;
    this.intento = false;
    this.pintar(net.estado);
  }

  update(_t: number, dt: number) {
    const p = this.net.estado, z = this.zonaActual(), ahora = Date.now();
    this.ajustarGolpes();
    this.ui.reloj.setText(p.practica ? "--:--" : reloj(p, ahora)); // la práctica no tiene límite de tiempo
    // Multímetro: «Midiendo…» ~1 s con la aguja buscando; luego la lectura del árbitro.
    if (this.midiendo) {
      const l = lecturaLista(this.midiendo, p.medida, ahora);
      if (l) { this.midiendo = undefined; this.lectura = l; this.pintarMedidor(); }
      else if (ahora - this.midiendo.desde > 5000) this.midiendo = undefined; // rechazo o red caída: se puede volver a medir
      else if (this.modo === "tension") this.ui.aguja.setVisible(true).setAngle(Math.sin(ahora / 90) * 50);
    }
    const local = this.avisoLocal && ahora < this.avisoLocal.hasta ? this.avisoLocal.texto : null;
    const medidor = !this.modo ? null : this.midiendo ? TM.midiendo : this.lectura ? textoMedida(this.lectura) : textoModo(this.modo);
    const placa = !!z && conPlaca(z.circuito);
    const falta = z ? this.falta(z) : null, pista = z ? pistaDemo(p, this.intento, falta) : null;
    this.ui.aviso.setText(local ?? medidor ?? (pista && PISTA_DEMO[pista]) ?? avisoVivo(p, ahora) ?? (despachable(p) ? "Pod reparado: pulsa Despachar" : z?.reparada ? "Zona reparada"
      : placa && falta === "colocar" ? TC.ponerPiezas : placa && falta ? TC.cablesAyuda : "Elige y pulsa Probar"));
    // El motor (ícono de turbina) gira cuando la corriente es la correcta.
    if (z?.circuito === "interruptor" && nivelCarga(z, p.vistas[z.zona]) === 2) this.ui.tablero.girar(dt * 0.3);
    const ver = !!z && tarjetaVisible(p, z.zona, ahora);
    if (ver !== this.ui.tarjeta.visible && z) {
      if (ver) this.armarTarjeta(z.circuito, p);
      this.ui.tarjeta.setVisible(ver);
    }
  }

  private armarTarjeta(c: Circuito, p: Pantalla) {
    const t = this.ui.tarjeta.removeAll(true), v = p.vistas[this.zona], nombre = spriteTarjeta(c, v);
    if (nombre) return t.add(img(this, 0, 0, nombre, 3).setOrigin(0.5));
    const z = this.zonaActual(), elegida = z && this.eleccion(z);
    t.add([marco(this, 0, 0, "panel_alerta", 300, 112),
      letras(this, 0, 0, `¡Pieza quemada!\n${elegida ? textoOpcion(elegida, c) : ""}`, 3).setOrigin(0.5).setCenterAlign()]);
  }

  pintar(p: Pantalla) {
    const u = this.ui, pod = p.pod, z = this.zonaActual();
    if (!pod || !z) return;
    this.zona = z.zona;
    u.estado.setText(`${p.demo ? "Demo" : `Nivel ${p.nivel}`} · Pod ${Math.min(pod.numero, p.total)}`);
    u.contador.setTexture(`contador_pods_${Math.min(p.despachados, 5)}`);
    u.rival.setText(p.practica ? "Práctica · toca aquí para salir" : textoRival(p.rival, p.total));
    u.salir.input!.enabled = p.practica;
    // En modo demo solo se muestran las pestañas de las zonas que trae el pod (Radar, o Cabina/Turbina).
    pestanasArte(pod, this.zona).forEach((t, i) => u.pestanas[i]!.setTexture(t.sprite).setAlpha(t.zona == null ? 0.6 : 1).setVisible(!p.demo || t.zona != null));
    u.globo.setText(`${NOMBRE_ZONA[z.nombre]}: ${RETO[z.circuito]}`);
    this.pintarCola(pod.numero, p.total);
    this.pintarPod(p);

    // Circuito: batería, pieza elegida (sprite o texto) y carga según el último veredicto.
    const elegida = this.elegidas.get(this.clave()), v = p.vistas[this.zona];
    const pieza = spritePieza(z.circuito, elegida), bat = spriteBateria(z.volts);
    u.circuito.removeAll(true).add([
      img(this, 50, 76, bat, bat === "icono_bateria" ? 4 : 2).setOrigin(0.5),
      letras(this, 50, 126, textoVolts(z.volts), 2).setOrigin(0.5, 0),
      pieza ? img(this, 180, 34, pieza).setOrigin(0.5) : marco(this, 180, 34, "boton_secundario", 104, 40),
      letras(this, 180, pieza ? 66 : 34, elegida ? textoOpcion(elegida, z.circuito) : "?", 2).setOrigin(0.5, pieza ? 0 : 0.5),
    ]);
    const nivel = nivelCarga(z, v), n = cargas(z.circuito);
    u.carga.forEach((c, i) => c.setVisible(i < n).setTexture(spriteCarga(z.circuito, nivel)).setAngle(0)
      .setScale(n === 2 ? 3 : 4).setPosition(310, n === 2 ? 52 + i * 48 : 76));

    // Cabina y Turbina: la placa con cables reemplaza el dibujo y la gaveta; el medidor baja debajo de la placa.
    const placa = conPlaca(z.circuito);
    u.tablero.mostrar(placa);
    if (placa) u.tablero.pintar(z.circuito, z.volts, this.cablesZona(), this.puestasZona(), nivel, z.reparada);
    for (const o of [u.circuito, u.cables, ...u.carga, u.gaveta]) o.setVisible(!placa && (o !== u.carga[1] || n === 2));
    for (const o of u.zonasMedir) o.input!.enabled = !placa; // una Zone invisible sigue recibiendo toques
    // Mientras quedan piezas en la gaveta de la placa, esta ocupa el lugar del medidor.
    u.fila.setY(placa ? 60 : 0).setVisible(!placa || !u.tablero.faltanPiezas());
    u.aviso.setY(placa ? 288 : 206);
    u.etiquetas[1]!.setY(placa ? 210 : 146); // en la placa, la etiqueta del centro va debajo del medidor

    u.gaveta.setText(z.reparada ? "" : GAVETA[z.circuito]);
    const botones = botonesGaveta(z, elegida);
    // 3 botones de 104 px o 4 de 82 px, centrados en el panel de 360 px.
    const nb = botones.length, ancho = nb > 3 ? 82 : 104, paso = nb > 3 ? 88 : 116;
    u.opciones.forEach((b, i) => {
      const o = botones[i], ver = !!o && !z.reparada && !placa, x = 180 + (i - (nb - 1) / 2) * paso;
      const nombre = o ? FRENA[o.pieza] ?? "" : "", color = o?.elegida ? OSCURO : 0xffffff;
      b.fondo.setVisible(ver).setTexture(o?.elegida ? "boton_primario" : "boton_secundario").setPosition(x, 290).setSize(ancho / 4, 12);
      b.zona.setPosition(x, 290).setSize(ancho, b.zona.height);
      b.zona.input!.enabled = ver;
      b.texto.setVisible(ver).setText(o?.texto ?? "").setTint(color).setPosition(x, nombre ? 282 : 290);
      b.nombre.setVisible(ver && !!nombre).setText(nombre).setTint(color).setPosition(x, 302);
    });
    // Modo demo: sin multímetro (solo se usa en otras zonas).
    if (p.demo) this.modo = null;
    for (const m of u.modos) { m.fondo.setVisible(!p.demo); m.icono.setVisible(!p.demo); }
    const pista = pistaDemo(p, this.intento, this.falta(z));
    u.flecha.setVisible(pista === "elegir");
    u.flechaPlaca.setVisible(pista === "colocar");
    // El mismo recuadro resalta la gaveta (Radar), la gaveta de la placa (colocar) o la placa entera (cablear).
    const recuadro = pista === "colocar" ? [180, 240, 220, 68] : pista === "cablear" ? [180, 92, 340, 252] : [180, 290, 358, 60];
    u.resalteGaveta.setVisible(pista === "elegir" || pista === "colocar" || pista === "cablear")
      .setPosition(recuadro[0], recuadro[1]).setSize(recuadro[2]! / 4, recuadro[3]! / 4);
    u.resalteProbar.setVisible(pista === "probar");
    u.resalteDespachar.setVisible(despachable(p));
    if (pista === "elegir") u.gaveta.setText(""); // la pista dice lo mismo y la flecha ocupa su lugar
    u.probar.setTexture(this.eleccion(z) && !z.reparada ? "boton_probar_normal" : "boton_probar_deshabilitado");
    u.despachar.setTexture(despachable(p) ? "boton_despachar_normal" : "boton_despachar_deshabilitado");

    this.pintarMedidor();
    u.aviso.setTint(v?.quemado || v?.cortocircuito ? ALERTA : pista ? PISTA : 0xffffff);
    if (v?.cortocircuito) this.cameras.main.shake(250, 0.01);
    this.pintarGuia(placa);
  }

  /** Áreas táctiles de la gaveta y de Probar/Despachar: >= 44 px en pantalla (el lienzo se escala con FIT) sin solaparse. */
  private ajustarGolpes() {
    const h = Math.ceil(Math.max(48, 44 * this.scale.displayScale.y));
    if (h === this.golpe) return;
    this.golpe = h;
    for (const o of this.ui.opciones) o.zona.setSize(o.zona.width, h);
    // Probar/Despachar empiezan donde acaba la gaveta (290 + h/2).
    for (const z of this.ui.golpes) z.setSize(z.width, h).setY(Math.max(340, 290 + h));
    for (const z of this.guia.zonas) z.setSize(z.width, Math.max(56, h));
  }

  private crearGuia() {
    const caja = this.add.container(0, 0).setVisible(false).setDepth(900);
    const boton = (x: number, fondo: string, color: number, fn: () => void) => {
      const t = letras(this, x, 50, "", 2, color).setOrigin(0.5);
      return { t, partes: [marco(this, x, 50, fondo, 152, 52), t, toque(this, x, 50, 152, 56, fn)] as Phaser.GameObjects.GameObject[] };
    };
    const saltarB = boton(-84, "boton_secundario", 0xffffff, () => { this.tut = saltar(this.tut!); this.pintar(this.net.estado); });
    const sigB = boton(84, "boton_primario", OSCURO, () => {
      if (esUltimo(this.tut!)) return void this.net.salir(); // vuelve a Entrar
      this.tut = siguiente(this.tut!); this.pintar(this.net.estado);
    });
    const titulo = letras(this, -150, -70, "", 2, PISTA), texto = letras(this, -150, -44, "", 2).setMaxWidth(300);
    caja.add([marco(this, 0, 0, "panel_oscuro", 328, 168), titulo, texto, ...saltarB.partes, ...sigB.partes]);
    const resaltes = [0, 1].map(() => marco(this, 0, 0, "recuadro_resaltado", 100, 100).setVisible(false).setDepth(890));
    this.tweens.add({ targets: resaltes, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    this.guia = { caja, titulo, texto, saltar: saltarB.t, sig: sigB.t, resaltes, zonas: [saltarB.partes[2], sigB.partes[2]] as Phaser.GameObjects.Zone[] };
  }

  /** Rectángulos (x, y, ancho, alto, en el lienzo) que resalta cada paso del tutorial. */
  private rectas(o: Objetivo, placa: boolean): [number, number, number, number][] {
    const P = this.ui.panel, E = this.ui.escena, fila = P.y + (placa ? 60 : 0) + 178, c = this.ui.contador.getBounds();
    const contador: [number, number, number, number] = [c.centerX, c.centerY, c.width + 16, c.height + 16];
    switch (o) {
      case "pestanas": return [[E.x + 180, E.y + 30, 356, 54], contador];
      case "gaveta": return [placa ? [P.x + 180, P.y + 240, 220, 68] : [P.x + 180, P.y + 290, 358, 60]];
      case "placa": return [[P.x + 180, P.y + 92, 340, 252]];
      case "multimetro": return [[P.x + 180, fila, 352, 52]];
      case "aguja": return [[P.x + 180, fila, 110, 52]];
      case "probar": return [[P.x + 180, P.y + 340, 358, 52]];
      case "contador": return [contador];
    }
  }

  private pintarGuia(placa: boolean) {
    const g = this.guia, t = this.tut, activo = !!t?.activo, clave = activo ? `${t!.i}${placa}` : "";
    if (clave === this.guiaClave) return;
    this.guiaClave = clave;
    g.caja.setVisible(activo);
    if (!t || !activo) return g.resaltes.forEach((r) => r.setVisible(false));
    const paso = actual(t), { width, height } = this.scale.gameSize;
    g.titulo.setText(textoPaso(t));
    g.texto.setText(paso.texto);
    g.saltar.setText("Saltar");
    g.sig.setText(esUltimo(t) ? "Empezar a jugar" : "Siguiente");
    // Vertical: la caja queda sobre la escena (los objetivos están arriba o en el panel, no entre medias); apaisado: bajo los paneles.
    g.caja.setPosition(width / 2, width > height ? 780 : 250);
    const rs = this.rectas(paso.objetivo, placa);
    g.resaltes.forEach((r, i) => { const x = rs[i]; r.setVisible(!!x); if (x) r.setPosition(x[0], x[1]).setSize(x[2] / 4, x[3] / 4); });
  }

  /** Medidor de aguja: veredicto del último «Probar» o, con el multímetro activo, la lectura (Nada/Parte/Toda o pasa/no pasa). */
  private pintarMedidor() {
    const u = this.ui, v = this.net.estado.vistas[this.zona], l = this.lectura;
    u.modos.forEach((m) => m.fondo.setTexture(m.modo === this.modo ? "boton_primario" : "boton_secundario"));
    const textos = this.modo === "tension" ? [TRAMO.nada.etiqueta, TRAMO.parte.etiqueta, TRAMO.toda.etiqueta] : this.modo ? ["", "", ""] : ["poco", "correcto", "demasiado"];
    u.etiquetas.forEach((e, i) => e.setText(textos[i]!));
    u.pasa.setVisible(this.modo === "continuidad" && !!l).setTexture(l?.pasa ? "icono_pasa" : "icono_no_pasa");
    if (!this.modo) return u.aguja.setVisible(!!v?.aguja).setAngle(v?.aguja ? ANGULO[v.aguja] : 0);
    const tension = this.modo === "tension" && l?.fraccion !== undefined;
    u.aguja.setVisible(tension).setAngle(tension ? anguloTension(l.fraccion!) : 0);
  }

  private pintarCola(numero: number, total: number) {
    this.ui.cola.removeAll(true).add(cola(numero, total).flatMap((n, i) => [
      letras(this, 262, 70 + i * 26, String(n), 2, GRIS),
      img(this, 278, 64 + i * 26, `${podDe(n).id}_mini_espera`, 2).setOrigin(0),
    ]));
  }

  /** Pod en la bahía armado por zonas; al cambiar de pod el anterior sale a la derecha y el nuevo entra. */
  private pintarPod(p: Pantalla) {
    const pod = p.pod!, num = pod.numero <= p.total ? pod.numero : 0;
    if (num !== this.podNum) {
      const viejo = this.podC;
      if (viejo) this.tweens.add({ targets: viejo, x: 420, alpha: 0, duration: 450, ease: "Cubic.In", onComplete: () => viejo.destroy() });
      this.podC = num ? this.add.container(-400, POD_Y) : undefined;
      if (this.podC) {
        this.ui.escena.add(this.podC);
        this.tweens.add({ targets: this.podC, x: POD_X, duration: 550, ease: "Cubic.Out", delay: viejo ? 250 : 0 });
      }
      this.ui.bahia.play(num ? "bahia_ocupada" : "bahia");
      this.podNum = num;
      this.limpiarMedida();
    }
    if (!this.podC) return;
    const m = podDe(pod.numero);
    this.podC.removeAll(true);
    for (const zona of m.orden) {
      const estado = estadoZona(pod, zona as ZonaNombre, p.vistas), s = sprite(`${m.id}_${zona}_${estado}`)!;
      const o = s.offset ?? { x: 0, y: 0 };
      this.podC.add(img(this, o.x * K, o.y * K, s.nombre).setOrigin(0));
      if (estado === "averiado" || estado === "quemado") {
        const h = (s.puntos?.humo as { x: number; y: number } | undefined) ?? { x: s.ancho / 2, y: 0 };
        this.podC.add(anim(this, (o.x + h.x) * K, (o.y + h.y) * K, estado === "quemado" ? "humo_negro" : "humo"));
      }
    }
  }
}
