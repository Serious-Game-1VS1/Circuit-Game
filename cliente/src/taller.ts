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
import { botonSilencio, sonar } from "./audio";
import { arrastrable, dentro } from "./arrastre";
import { casillas, DIAGNOSTICO, MAX_LLAMAS, puntosPod, rachaLlamas, textoGlobo, textoObjetivo, textoPod, tiempoPod } from "./progreso";
import { cargarPerfil, guardarPerfil, registrarTiempo } from "./perfil";
import { cableDelCorto, cargasPuestas, conPlaca, faltaColocar, faltaCablear, montaje, textoCorto, todasPuestas, type Cable, type Puestas } from "./placa";
import { Tablero, TC } from "./tablero";
import { QUEMADAS_OLEADAS } from "../../spike/src/arbiter/penalties";
import { conDoble, etiquetas, MEJORAS, medirMs, ofrecer } from "./mejoras";
import { actual, avanzar, esFin, iniciar, permite, saltar, textoPaso, type EstadoTut, type Objetivo, type Tutorial } from "./tutorial";
import { cargas, cola, estadoZona, nivelCarga, pestanasArte, podDe, sprite, spriteBateria, spriteCarga, spritePieza, spriteTarjeta } from "./sprites";
import { botonesGaveta, CARTEL, FRENA, GAVETA, LEYENDA_ZONAS, NOMBRE_ZONA, PISTA_DEMO, probarActivo, RETO, textoOpcion, textoProbarEspera, textoVolts, type Aguja } from "./vista";

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
  /** Última elección mandada a probar por zona (como lastPieza del árbitro): igual a la actual = «sin cambios». */
  private probadas = new Map<string, string>();
  /** Cables de la placa por "pod-zona" (Cabina y Turbina). */
  private cables = new Map<string, Cable[]>();
  /** Piezas arrastradas a la placa por "pod-zona" (Cabina y Turbina); empiezan en la gaveta. */
  private puestas = new Map<string, Puestas>();
  /** Multímetro: modo activo, medición en curso (~1 s) y última lectura de esta zona. */
  private modo: ModoMedir | null = null;
  private midiendo?: Midiendo;
  private lectura?: Medida;
  private avisoVisto: string | null = null; // para limpiar el multímetro cuando llega un aviso nuevo del árbitro
  private bloqueado = false;
  private avisoLocal?: { texto: string; hasta: number };
  private podC?: Bloque;
  private podNum = 0;
  /** Carteles y aviso de despacho caducan por reloj real (no por el de Phaser): con pocos fps los tweens y timers van lentos y el cartel se quedaba sobre el pod nuevo. */
  private carteles: { c: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; hasta: number }[] = [];
  private despachoHasta = 0;
  /** Progreso y recompensa (SCRUM-166): zonas reparadas y pods despachados ya vistos, y si el pod en curso lleva algún fallo. */
  private reparadasVistas = 0;
  private despachadosVistos = 0;
  /** Falla encadenada: segundas fallas y diagnósticos ya celebrados (los cuenta Net). */
  private hayMasVistas = 0;
  private diagVistos = 0;
  private sucio = false;
  /** Pods limpios seguidos (llamas del HUD) y hora local en que entró el pod en la bahía (cronómetro del pod). */
  private racha = 0;
  private podDesde = 0;
  private rivalCasillas!: Phaser.GameObjects.Graphics;
  /** Cuenta atrás sobre el botón Probar mientras dura el bloqueo («Probar · 2 s»). */
  private esperaProbar!: Bloque;
  /** Modo demo: ya probó una vez (la pista del primer pod no vuelve). */
  private intento = false;
  /** Tutorial: paso en curso (null si no es el tutorial) y qué paso se pintó por última vez. */
  private tut: Tutorial | null = null;
  /** Estado del tutorial calculado AHORA (no una copia del último cuadro: un clic de elegir seguido de Probar llegaba antes del siguiente update). */
  private estTut(): EstadoTut | undefined {
    const z = this.zonaActual(), v = z && this.net.estado.vistas[z.zona];
    return z && { elegida: this.elegidas.get(this.clave()), modo: this.modo, medido: this.lectura?.modo === "tension",
      aguja: v?.aguja, quemado: !!v?.quemado, reparada: z.reparada, despachados: this.net.estado.despachados, circuito: z.circuito, falta: this.falta(z) };
  }
  private guiaClave = "";
  /** Botón «Salir» del HUD (práctica y Oleadas). */
  private salirB: Phaser.GameObjects.GameObject[] = [];
  /** Alto táctil mínimo en unidades del lienzo para que valga 44 px en pantalla; ver ajustarGolpes(). */
  private golpe = 48;
  private guia!: { caja: Bloque; titulo: Letras; texto: Letras; saltar: Letras; sig: Letras; jugar: Phaser.GameObjects.GameObject[]; zonas: Phaser.GameObjects.Zone[]; resaltes: Phaser.GameObjects.NineSlice[] };
  private ui!: {
    escena: Bloque; panel: Bloque; estado: Letras; rival: Letras; salir: Phaser.GameObjects.Zone; reloj: Letras; contador: Phaser.GameObjects.Image;
    podT: Letras; llamas: Phaser.GameObjects.Sprite[]; mejorasT: Letras;
    pestanas: Phaser.GameObjects.Image[]; globo: Letras; bocadillo: Phaser.GameObjects.Image; cola: Bloque; bahia: Phaser.GameObjects.Sprite;
    circuito: Bloque; carga: Phaser.GameObjects.Image[]; aguja: Phaser.GameObjects.Image; aviso: Letras; gaveta: Letras;
    opciones: { fondo: Phaser.GameObjects.NineSlice; zona: Phaser.GameObjects.Zone; texto: Letras; nombre: Letras }[]; probar: Phaser.GameObjects.Image; despachar: Phaser.GameObjects.Image; golpes: Phaser.GameObjects.Zone[];
    tarjeta: Bloque; cables: Phaser.GameObjects.Graphics; tablero: Tablero; fila: Bloque; etiquetas: Letras[];
    modos: { modo: ModoMedir; fondo: Phaser.GameObjects.NineSlice; icono: Phaser.GameObjects.Image; rotulo: Letras }[]; pasa: Phaser.GameObjects.Image; zonasMedir: Phaser.GameObjects.Zone[];
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
    if (!todasPuestas(this.puestasZona())) return undefined; // placa incompleta: no se puede probar ni medir
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
    if (!pieza) return this.avisar(conPlaca(z.circuito) ? TM.sinMontaje : TM.sinEleccion);
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
    const rival = letras(this, 36, 44, "", 2, 0xe6ecff); // casi blanco: en gris se perdía sobre la barra
    // Práctica: sin rival; su línea del HUD sirve para salir.
    const salir = toque(this, 180, 58, 360, 28, () => { if (net.estado.practica) void net.salir(); });
    // Botón visible con marco del kit (bajo el contador de pods, sin tapar el HUD); el área táctil mide 44 px de alto.
    const sx = an ? 1440 - 70 : 292;
    this.salirB = [marco(this, sx, 52, "boton_secundario", 120, 30, 2), letras(this, sx, 52, "Salir", 2).setOrigin(0.5), toque(this, sx, 50, 120, 44, () => { if (net.estado.practica) void net.salir(); })];

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
    const podT = letras(this, 12, 274, "", 2, GRIS);
    const llamas = Array.from({ length: MAX_LLAMAS }, (_, i) => anim(this, 150 + i * 26, 282, "llama_turbo_cian", 2).setAlpha(0.35));
    const mejorasT = letras(this, 12, 252, "", 2, PISTA); // mejoras activas (práctica)
    const bocadillo = img(this, 8, 62, "globo_sintoma", 3).setOrigin(0);
    const leyenda = letras(this, 180, 334, LEYENDA_ZONAS, 2, GRIS).setOrigin(0.5, 0); // bajo la bahía, fuera del pod; sin leyenda los iconos de las pestañas no se entendían
    escena.add([...pestanas, bocadillo, globo, colaC, bahia, podT, mejorasT, ...llamas, leyenda]);
    this.rivalCasillas = this.add.graphics(); // pods del rival (n/5) en casillas, junto a su línea del HUD

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
      // Rótulo del modo (el dial solo no se entendía); pintar() lo baja bajo el botón en la placa.
      const rotulo = letras(this, i ? 354 : 6, 146, i ? TM.continuidad : TM.tension, 1.5, GRIS).setOrigin(i, 0.5);
      return { modo, fondo, icono: img(this, x, 178, `multimetro_modo_${modo}`, 2).setOrigin(0.5), rotulo };
    });
    const fila = this.add.container(0, 0, [medidor, aguja, pasa, ...etiquetas, ...modos.flatMap((m) => [m.fondo, m.icono, m.rotulo])]);
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
      cambio: (c) => { sonar("cable"); this.cables.set(this.clave(), c); this.limpiarMedida(); this.pintar(net.estado); },
      poner: (pz) => { sonar("pieza"); this.puestas.set(this.clave(), pz); this.limpiarMedida(); this.pintar(net.estado); },
      aviso: (t) => this.avisar(t),
      medir: () => (this.modo ? (punto) => this.medir(punto) : null),
      bloqueado: () => !!this.zonaActual()?.reparada,
    });
    const aviso = letras(this, 180, 206, "", 2).setOrigin(0.5, 0).setCenterAlign().setMaxWidth(340);
    const gaveta = letras(this, 180, 238, "", 2, GRIS).setOrigin(0.5, 0).setCenterAlign().setMaxWidth(340); // el texto largo del fusible se salía del panel
    // Hasta 4 botones (el modo demo ofrece las 4 resistencias); pintar() los reparte según cuántas opciones haya.
    // Cada pieza se ARRASTRA hasta la ranura del circuito (resaltada); un toque la pone directo (accesibilidad).
    const resalteRanura = marco(this, RANURA.x, RANURA.y, "recuadro_resaltado", RANURA.w, RANURA.h).setVisible(false);
    const opciones = [0, 1, 2, 3].map((i) => {
      const fondo = marco(this, 0, 290, "boton_secundario", 104, 48);
      const zona = this.add.zone(0, 290, 104, 48).setInteractive({ useHandCursor: true }); // área táctil aparte: crece con ajustarGolpes()
      const pieza = () => { const z = this.zonaActual(); return z && !z.reparada ? z.opciones[i] : undefined; };
      const elegir = (o: string) => {
        const no = permite(this.tut, { elegir: o }, this.estTut());
        if (no) { this.avisar(no); return false; }
        sonar("pieza"); this.elegidas.set(this.clave(), o); this.pintar(net.estado); return true;
      };
      const enRanura = (p: Phaser.Input.Pointer) => { const v = panel.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY); return dentro(RANURA, v.x, v.y); };
      arrastrable(this, zona, {
        puede: () => !!pieza(),
        fantasma: () => this.add.container(0, 0, [marco(this, 0, 0, "boton_primario", 104, 48),
          letras(this, 0, 0, textoOpcion(pieza()!, this.zonaActual()!.circuito), 2, OSCURO).setOrigin(0.5)]),
        sobre: (p) => resalteRanura.setVisible(!!p).setAlpha(p && enRanura(p) ? 1 : 0.45),
        soltar: (p) => { const o = pieza(); return !!o && enRanura(p) && elegir(o); },
        tocar: () => { const o = pieza(); if (o) elegir(o); },
      });
      // Valor impreso ("470 Ω") y, en resistencias, su nombre estable ("Frena medio") debajo, más pequeño.
      return { fondo, zona, texto: letras(this, 0, 290, "", 2).setOrigin(0.5), nombre: letras(this, 0, 302, "", 2).setOrigin(0.5) }; // k entero: 1,5 se veía borroso
    });
    const probar = img(this, 92, 340, "boton_probar_normal", 2);
    const despachar = img(this, 268, 340, "boton_despachar_deshabilitado", 2);
    this.esperaProbar = this.add.container(92, 340, [marco(this, 0, 0, "boton_secundario", 156, 40), letras(this, 0, 0, "", 2, ALERTA).setOrigin(0.5)]).setVisible(false);
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
      ...opciones.flatMap((o) => [o.fondo, o.zona, o.texto, o.nombre]), probar, despachar, this.esperaProbar, resalteGaveta, resalteProbar, resalteDespachar, flecha, flechaPlaca,
      // Probar/Despachar miden 34 px de alto: el área táctil es de 48 o más (ajustarGolpes).
      golpes[0] = toque(this, 92, 340, 150, 48, pulsar(probar, "boton_probar", () => {
        const z = this.zonaActual(), elegida = z && this.eleccion(z);
        const no = permite(this.tut, "probar", this.estTut());
        if (z && !z.reparada && elegida && no) this.avisar(no);
        // Respuesta inmediata en el cliente: antes el clic bloqueado esperaba el rechazo del árbitro y parecía perdido.
        else if (z && !z.reparada && elegida && net.estado.esperaHasta > Date.now()) this.avisar(`Espera ${Math.ceil((net.estado.esperaHasta - Date.now()) / 1000)} s y vuelve a probar`);
        else if (z && !z.reparada && elegida && elegida === this.probadas.get(this.clave())) this.avisar("No cambiaste nada. Cambia una pieza o un cable y prueba.");
        else if (z && !z.reparada && elegida) { net.probar(z.zona, elegida); this.intento = true; this.probadas.set(this.clave(), elegida); this.pintar(net.estado); }
        else if (z && !z.reparada && conPlaca(z.circuito)) {
          this.avisar(faltaColocar(this.puestasZona(), z.circuito) ?? faltaCablear(this.cablesZona(), z.circuito, cargasPuestas(this.puestasZona())));
        }
      })),
      // Siempre visible; solo se activa con todas las zonas reparadas (Net.despachar lo comprueba).
      golpes[1] = toque(this, 268, 340, 150, 48, () => {
        if (despachable(net.estado)) pulsar(despachar, "boton_despachar", () => net.despachar())();
        else if (faltan(net.estado.pod)) this.avisar(`Aún falta reparar: ${faltan(net.estado.pod)}`);
      }),
      tarjeta,
    ]);

    botonSilencio(this, escena.x + 330, escena.y + 213); // el HUD va lleno: esquina libre de la bahía, a la derecha del cartel y bajo la cola de pods
    this.ui = {
      escena, panel, estado, rival, salir, reloj: relojT, contador, podT, llamas, mejorasT, pestanas, globo, bocadillo, cola: colaC, bahia, circuito, carga, aguja, aviso, gaveta, opciones, probar, despachar, tarjeta,
      cables, tablero, fila, etiquetas, modos, pasa, zonasMedir, flecha, resalteGaveta, resalteProbar, resalteDespachar, flechaPlaca, resalteRanura, golpes,
    };
    this.crearGuia();
    this.tut = net.tutorial ? iniciar(net.parteTutorial) : null;
    // Phaser reusa la escena: sin esto, la pieza del pod 1 del tutorial salía ya elegida en el pod 1 de la práctica.
    this.elegidas.clear(); this.probadas.clear(); this.cables.clear(); this.puestas.clear();
    this.guiaClave = "";
    this.golpe = 0;
    this.podNum = 0;
    this.carteles = [];
    this.despachoHasta = 0;
    this.intento = false;
    this.sucio = false;
    this.racha = 0;
    this.reparadasVistas = net.estado.pod?.zonas.filter((z) => z.reparada).length ?? 0;
    this.despachadosVistos = net.estado.despachados;
    this.hayMasVistas = net.hayMas;
    this.avisoVisto = net.estado.aviso;
    this.bloqueado = false;
    this.diagVistos = net.diagnosticos;
    this.pintar(net.estado);
  }

  update(_t: number, dt: number) {
    const p = this.net.estado, z = this.zonaActual(), ahora = Date.now();
    this.ajustarGolpes();
    // Un aviso nuevo (resultado, despacho) manda sobre la lectura del multímetro; sin esto el panel seguía en «Pasa…».
    if (p.aviso !== this.avisoVisto) { this.avisoVisto = p.aviso; if (p.aviso) { this.limpiarMedida(); this.modo = null; this.pintar(p); } }
    if ((p.esperaHasta > ahora) !== this.bloqueado) { this.bloqueado = !this.bloqueado; this.pintar(p); } // Probar se apaga mientras dura el bloqueo
    const espera = textoProbarEspera(p.esperaHasta, ahora);
    this.esperaProbar.setVisible(!!espera && !!z && !z.reparada);
    if (espera) (this.esperaProbar.getAt(1) as Letras).setText(espera);
    this.ui.reloj.setText(p.practica ? "--:--" : reloj(p, ahora)); // la práctica no tiene límite de tiempo
    this.ui.podT.setText(tiempoPod(ahora - this.podDesde));
    // Multímetro: «Midiendo…» ~1 s con la aguja buscando; luego la lectura del árbitro.
    if (this.midiendo) {
      const l = lecturaLista(this.midiendo, p.medida, ahora, medirMs(this.net.mejoras));
      if (l) { this.midiendo = undefined; this.lectura = l; this.pintarMedidor(); }
      else if (ahora - this.midiendo.desde > 5000) this.midiendo = undefined; // rechazo o red caída: se puede volver a medir
      else if (this.modo === "tension") this.ui.aguja.setVisible(true).setAngle(Math.sin(ahora / 90) * 50);
    }
    this.carteles = this.carteles.filter((k) => {
      if (!k.c.active) return false;
      if (ahora < k.hasta) return true;
      this.tweens.killTweensOf(k.c);
      k.c.destroy();
      return false;
    });
    if (this.despachoHasta && ahora >= this.despachoHasta) { // el «¡Pod despachado!» ya cumplió: al entrar el pod nuevo vuelve el objetivo
      this.despachoHasta = 0;
      if (p.aviso === "¡Pod despachado!") this.net.limpiarAviso();
    }
    const local = this.avisoLocal && ahora < this.avisoLocal.hasta ? this.avisoLocal.texto : null;
    const corto = z && conPlaca(z.circuito) ? cableDelCorto(this.cablesZona()) : null; // persiste mientras exista el cable que lo provoca
    const medidor = !this.modo ? null : this.midiendo ? TM.midiendo : this.lectura ? textoMedida(this.lectura, z?.circuito) : textoModo(this.modo, z?.circuito);
    const placa = !!z && conPlaca(z.circuito);
    const falta = z ? this.falta(z) : null, pista = z ? pistaDemo(p, this.intento, falta) : null;
    this.ui.aviso.setText(local ?? (corto && textoCorto(corto, z!.circuito, cargasPuestas(this.puestasZona()))) ?? medidor ?? (pista && PISTA_DEMO[pista]) ?? avisoVivo(p, ahora) ?? (despachable(p) ? "Pod reparado: pulsa Despachar" : z?.reparada ? "Zona reparada"
      : placa && falta === "colocar" ? faltaColocar(this.puestasZona(), z!.circuito)! : placa && falta ? TC.cablesAyuda : `${this.tut?.activo ? "" : `${textoObjetivo(p)}. `}Elige y pulsa Probar`));
    this.ui.gaveta.setAlpha(this.ui.aviso.y + this.ui.aviso.height > this.ui.gaveta.y - 2 ? 0 : 1); // el aviso de 3 líneas no se pisa con «Elige…»
    // El motor (ícono de turbina) gira cuando la corriente es la correcta.
    if (z?.circuito === "interruptor" && nivelCarga(z, p.vistas[z.zona]) === 2) this.ui.tablero.girar(dt * 0.3);
    // Tutorial: la lectura del multímetro llega aquí y no en pintar(), así que el paso se comprueba cada cuadro.
    if (this.tut?.activo && z) { // avanzar() exige que cada paso lleve ≥0,7 s visible
      const antes = this.tut;
      this.tut = avanzar(this.tut, this.estTut()!, ahora);
      if (this.tut !== antes) this.avisoLocal = undefined; // «Sigue el paso: …» del paso anterior ya no aplica
    }
    this.pintarGuia(placa);
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
    u.estado.setText(`${p.demo ? "Demo · " : ""}${textoPod(pod.numero, p.total)}`);
    this.pintarProgreso(p);
    u.contador.setTexture(`contador_pods_${Math.min(p.despachados, 5)}`);
    u.rival.setText(p.oleadas ? `Oleadas · Quemadas ${p.quemadas}/${QUEMADAS_OLEADAS}` : p.practica ? "Práctica" : textoRival(p.rival, p.total));
    u.mejorasT.setText(etiquetas(this.net.mejoras));
    u.salir.input!.enabled = p.practica;
    this.salirB.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(p.practica));
    this.salirB[2]!.input!.enabled = p.practica;
    // En modo demo solo se muestran las pestañas de las zonas que trae el pod (Radar, o Cabina/Turbina).
    pestanasArte(pod, this.zona).forEach((t, i) => u.pestanas[i]!.setTexture(t.sprite).setAlpha(t.zona == null ? 0.6 : 1).setVisible(!p.demo || t.zona != null));
    u.globo.setText(textoGlobo(z, pod));
    // El bocadillo mide 3 líneas: con más (retos largos) se estira hacia abajo para que el texto no se corte.
    u.bocadillo.setScale(3, 3 * Math.max(1, (u.globo.height + 26) / 80));
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
    u.aviso.setY(placa ? 282 : 206);
    u.etiquetas[1]!.setY(placa ? 210 : 146); // en la placa, la etiqueta del centro va debajo del medidor

    u.gaveta.setText(z.reparada ? "" : GAVETA[z.circuito]);
    const botones = botonesGaveta(z, elegida);
    // 3 botones de 104 px o 4 de 82 px, centrados en el panel de 360 px.
    const nb = botones.length, ancho = nb > 3 ? 82 : 104, paso = nb > 3 ? 88 : 116;
    u.opciones.forEach((b, i) => {
      const o = botones[i], ver = !!o && !z.reparada && !placa, x = 180 + (i - (nb - 1) / 2) * paso;
      const nombre = o ? (FRENA[o.pieza] ?? "").replace(/^Frena /, "") : "", color = o?.elegida ? OSCURO : 0xffffff;
      b.fondo.setVisible(ver).setTexture(o?.elegida ? "boton_primario" : "boton_secundario").setPosition(x, 290).setSize(ancho / 4, 12);
      b.zona.setPosition(x, 290).setSize(ancho, b.zona.height);
      b.zona.input!.enabled = ver;
      b.texto.setVisible(ver).setText(o?.texto ?? "").setTint(color).setPosition(x, nombre ? 282 : 290);
      b.nombre.setVisible(ver && !!nombre).setText(nombre).setTint(color).setPosition(x, 302);
    });
    // Modo demo: sin multímetro (solo se usa en otras zonas).
    if (p.demo) this.modo = null;
    for (const m of u.modos) { m.fondo.setVisible(!p.demo); m.icono.setVisible(!p.demo); m.rotulo.setVisible(!p.demo).setY(placa ? 210 : 146); }
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
    u.probar.setTexture(probarActivo(this.eleccion(z), this.probadas.get(this.clave()), z.reparada, p.esperaHasta > Date.now()) ? "boton_probar_normal" : "boton_probar_deshabilitado");
    u.despachar.setTexture(despachable(p) ? "boton_despachar_normal" : "boton_despachar_deshabilitado");

    this.pintarMedidor();
    u.aviso.setTint(v?.quemado || v?.cortocircuito ? ALERTA : pista ? PISTA : 0xffffff);
    if (v?.cortocircuito) this.cameras.main.shake(250, 0.01);
  }

  /** Progreso visible (zonas, objetivo, pods del rival) y recompensa inmediata al reparar una zona o despachar un pod. */
  private pintarProgreso(p: Pantalla) {
    const g = this.rivalCasillas, rep = p.pod!.zonas.filter((z) => z.reparada).length;
    g.clear();
    casillas(p.rival?.despachados ?? 0, p.total).forEach((h, i) => g.fillStyle(h ? 0x6ee7a0 : 0x4a5680).fillRect(36 + i * 20, 62, 16, 8));
    g.setVisible(!p.practica && !!p.rival);
    if (Object.values(p.vistas).some((v) => v.aguja !== "correcto")) this.sucio = true;
    if (p.despachados > this.despachadosVistos) {
      const limpio = !this.sucio, d = conDoble(this.net.mejoras, puntosPod(limpio, p.practica));
      this.net.mejoras = d.a;
      this.net.extra += d.extra;
      this.flotar(`+${d.pts} puntos`, CARTEL.puntosMs); // se va antes de que el pod nuevo ocupe la bahía
      this.racha = rachaLlamas(this.racha, limpio);
      this.net.mejorRacha = Math.max(this.net.mejorRacha, this.racha);
      this.sucio = false;
      if (!this.net.tutorial && !p.oleadas) this.anotarTiempo(p);
      // Mejoras entre pods: tras un pod limpio de la práctica (no tras el último de las 5, que termina la partida).
      if (limpio && p.practica && !this.net.tutorial && !(p.total && p.despachados >= p.total)) this.ofertar();
    } else if (rep > this.reparadasVistas) this.destello();
    if (this.net.hayMas > this.hayMasVistas) { // la primera falla cedió: sale la segunda y se vuelve a elegir pieza
      this.hayMasVistas = this.net.hayMas;
      this.elegidas.delete(`${p.pod!.numero}-${this.net.segunda?.zona}`);
      this.probadas.delete(`${p.pod!.numero}-${this.net.segunda?.zona}`);
      this.limpiarMedida();
      this.destello();
      this.flotar("¡Hay más!");
    }
    if (this.net.diagnosticos > this.diagVistos) {
      this.diagVistos = this.net.diagnosticos;
      this.destello();
      this.flotar(`Diagnóstico +${DIAGNOSTICO}`);
    }
    this.ui.llamas.forEach((l, i) => l.setAlpha(i < this.racha ? 1 : 0.35));
    this.despachadosVistos = p.despachados;
    this.reparadasVistas = rep;
  }

  /** Elige 1 de hasta 3 mejoras al azar; el reloj del siguiente pod empieza al elegir. */
  private ofertar() {
    const op = ofrecer(this.net.mejoras);
    if (!op.length) return;
    const { width, height } = this.scale.gameSize, cx = width / 2, cy = height / 2, partes: Phaser.GameObjects.GameObject[] = [];
    const poner = <T extends Phaser.GameObjects.GameObject>(g: T) => { partes.push(g); (g as unknown as Phaser.GameObjects.Components.Depth).setDepth(960); return g; };
    poner(this.add.rectangle(cx, cy, width, height, 0x10141e, 0.94).setInteractive()); // tapa y bloquea lo de abajo
    poner(letras(this, cx, cy - 170, "ELIGE UNA MEJORA", 3, PISTA).setOrigin(0.5));
    op.forEach((m, i) => {
      const y = cy - 90 + i * 96, d = MEJORAS[m];
      poner(marco(this, cx, y, "boton_secundario", 320, 80));
      poner(letras(this, cx, y - 14, d.nombre, 2).setOrigin(0.5));
      poner(letras(this, cx, y + 14, d.texto, 1.5, GRIS).setOrigin(0.5));
      poner(toque(this, cx, y, 320, 80, () => {
        sonar("clic");
        this.net.elegirMejora(m);
        partes.forEach((g) => g.destroy());
        this.podDesde = Date.now();
        this.pintar(this.net.estado);
      }));
    });
  }

  /** Récord personal: guarda el tiempo del pod despachado (`p.despachados` = su número) y muestra la medalla frente a la marca anterior. */
  private anotarTiempo(p: Pantalla) {
    const ms = Date.now() - this.podDesde, alias = (p.alias ?? "").trim() || "Aprendiz";
    this.net.podMs.push(ms);
    const r = registrarTiempo(cargarPerfil(alias), p.nivel, p.despachados, ms);
    guardarPerfil(r.perfil);
    const x = letras(this, 180, 226, `${tiempoPod(ms)}${r.medalla ? ` ${r.medalla.toUpperCase()}` : ""}`, 2, GRIS).setOrigin(0.5).setDepth(950);
    const m = r.medalla && img(this, 180, 262, `medalla_${r.medalla}`, 3).setDepth(950);
    this.ui.escena.add(m ? [x, m] : [x]);
    this.tweens.add({ targets: m ? [x, m] : [x], y: "-=50", alpha: 0, duration: 1800, ease: "Cubic.Out", onComplete: () => { x.destroy(); m?.destroy(); } });
  }

  /** Estrellas que saltan del pod al reparar una zona (sin arte nuevo: cuadritos amarillos). */
  private destello() {
    const e = this.ui.escena;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, c = this.add.rectangle(180, POD_Y + 40, 8, 8, PISTA).setDepth(950);
      e.add(c);
      this.tweens.add({ targets: c, x: 180 + Math.cos(a) * 90, y: POD_Y + 40 + Math.sin(a) * 60, alpha: 0, angle: 180, duration: 600, ease: "Cubic.Out", onComplete: () => c.destroy() });
    }
  }

  /** «+N puntos» que sube y se desvanece. */
  private flotar(t: string, ms = 1400) {
    // Sobre la bahía (abajo), lejos del globo y del panel del tutorial, con placa oscura para que no se mezcle con el pod.
    // Con el panel del tutorial a la vista (depth 900) los puntos quedan por debajo: nunca tapan su texto ni «Saltar tutorial».
    const d = this.guia.caja.visible ? 880 : 950;
    const x = letras(this, 180, 262, t, 3, PISTA).setOrigin(0.5).setDropShadow(1, 1, OSCURO, 1).setDepth(d + 1);
    const f = this.add.rectangle(180, 262, x.width + 16, x.height + 10, 0x0b1020, 0.85).setStrokeStyle(1, 0xffe27a).setDepth(d);
    this.tweens.add({ targets: [x, f], y: 230, alpha: 0, duration: ms, ease: "Cubic.Out", onComplete: () => { x.destroy(); f.destroy(); } });
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
      const t = letras(this, x, 62, "", 2, color).setOrigin(0.5);
      return { t, partes: [marco(this, x, 62, fondo, 152, 52), t, toque(this, x, 62, 152, 56, fn)] as Phaser.GameObjects.GameObject[] };
    };
    // En el último paso del Tutorial 1 este botón abre el Tutorial 2; en los demás pasos es «Saltar».
    const saltarB = boton(-84, "boton_secundario", 0xffffff, () => {
      if (this.tut?.activo && esFin(this.tut) && this.tut.parte === 1) void this.net.practicar(this.net.estado.alias || "Aprendiz", 2, true, false, 2);
      else { this.tut = saltar(this.tut!); this.pintar(this.net.estado); }
    });
    // Solo en el último paso: los demás avanzan cuando el Taller confirma la acción (tutorial.ts, avanzar).
    const sigB = boton(84, "boton_primario", OSCURO, () => {
      if (this.tut?.activo && esFin(this.tut)) void this.net.practicar(this.net.estado.alias || "Aprendiz", 1); // práctica normal: cuenta XP
    });
    const titulo = letras(this, -150, -80, "", 2, PISTA), texto = letras(this, -150, -54, "", 2).setMaxWidth(300);
    caja.add([marco(this, 0, 0, "panel_oscuro", 328, 190), titulo, texto, ...saltarB.partes, ...sigB.partes]);
    const resaltes = [0, 1].map(() => marco(this, 0, 0, "recuadro_resaltado", 100, 100).setVisible(false).setDepth(890));
    this.tweens.add({ targets: resaltes, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    this.guia = { caja, titulo, texto, saltar: saltarB.t, sig: sigB.t, jugar: sigB.partes, resaltes, zonas: [saltarB.partes[2], sigB.partes[2]] as Phaser.GameObjects.Zone[] };
  }

  /** Rectángulos (x, y, ancho, alto, en el lienzo) que resalta cada paso del tutorial. */
  private rectas(o: Objetivo, placa: boolean): [number, number, number, number][] {
    const P = this.ui.panel, E = this.ui.escena, fila = P.y + (placa ? 60 : 0) + 178, c = this.ui.contador.getBounds();
    const contador: [number, number, number, number] = [c.centerX, c.centerY, c.width + 16, c.height + 16];
    switch (o) {
      case "gaveta": return [placa ? [P.x + 180, P.y + 240, 220, 68] : [P.x + 180, P.y + 290, 358, 60]];
      case "probar": return [[P.x + 92, P.y + 340, 160, 52], [P.x + 180, fila, 110, 52]];
      case "tension": return [[P.x + 34, fila - 8, 64, 72]];
      case "pieza": return [[P.x + 180, P.y + 44, 130, 92], [P.x + 180, fila, 110, 52]];
      case "despachar": return [[P.x + 268, P.y + 340, 160, 52]];
      case "contador": return [contador];
      case "pestanas": { const a = this.ui.pestanas[0]!.getBounds(), b = this.ui.pestanas[3]!.getBounds(); return [[(a.left + b.right) / 2, a.centerY, b.right - a.left, a.height]]; }
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
    g.saltar.setText(esFin(t) && t.parte === 1 ? "Tutorial 2" : "Saltar tutorial");
    g.sig.setText("Jugar práctica");
    g.jugar.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(esFin(t)));
    (g.jugar[2] as Phaser.GameObjects.Zone).input!.enabled = esFin(t);
    // Vertical: la caja (a 0,8) va en el hueco bajo las pestañas, sin tapar HUD, pestañas ni Salir, y deja libre la gaveta, Probar
    // y Despachar; en el último paso baja sobre el circuito (su objetivo, el contador, queda arriba). Apaisado: bajo los paneles.
    const vertical = width <= height;
    g.caja.setScale(vertical ? 0.8 : 1).setPosition(width / 2, vertical ? (esFin(t) ? 520 : 207) : 780);
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

  /** Cartel que aparece tras `retraso` ms, se queda `ms` y se desvanece (SCRUM-145). */
  private cartel(c: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, retraso: number, ms: number) {
    this.ui.escena.add(c);
    c.setAlpha(0).setDepth(940);
    this.tweens.add({ targets: c, alpha: 1, duration: 150, delay: retraso, hold: ms, yoyo: true, onComplete: () => c.destroy() });
    this.carteles.push({ c, hasta: Date.now() + retraso + ms + 300 });
  }

  /** Pod en la bahía armado por zonas; al cambiar de pod el anterior sale a la derecha y el nuevo entra. */
  private pintarPod(p: Pantalla) {
    const pod = p.pod!, num = p.oleadas || pod.numero <= p.total ? pod.numero : 0;
    if (num !== this.podNum) {
      const viejo = this.podC;
      if (viejo) this.tweens.add({ targets: viejo, x: 420, alpha: 0, duration: 450, ease: "Cubic.In", onComplete: () => viejo.destroy() });
      this.podC = num ? this.add.container(-400, POD_Y) : undefined;
      if (this.podC) {
        this.ui.escena.add(this.podC);
        this.tweens.add({ targets: this.podC, x: POD_X, duration: 550, ease: "Cubic.Out", delay: viejo ? 250 : 0 });
      }
      this.ui.bahia.play(num ? "bahia_ocupada" : "bahia");
      if (viejo) this.cartel(img(this, 180, 210, "cartel_reparado", 3), 0, CARTEL.reparadoMs);
      if (num) this.cartel(anim(this, 180, 210, "cartel_averia"), viejo ? CARTEL.averiaRetraso : 0, 1500);
      this.podNum = num;
      this.podDesde = Date.now();
      this.limpiarMedida();
      // El «¡Pod despachado!» ya cumplió: al entrar el pod nuevo vuelve el objetivo.
      if (viejo) this.despachoHasta = Date.now() + CARTEL.avisoDespachoMs;
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
