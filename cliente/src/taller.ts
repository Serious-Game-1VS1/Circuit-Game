/**
 * Escena Taller con el arte del kit: pod nave en la bahía (entra y sale con tween), pestañas de las
 * 4 zonas, humo en la zona dañada, cola de pods, y el panel del circuito (debajo en móvil 360×800,
 * al lado en escritorio 1440×900). Solo pinta la Pantalla; la mecánica la decide el árbitro.
 */
import * as Phaser from "phaser";
import type { Circuito, Medida, ModoMedir, ZonaNombre, ZonaView } from "../../spike/src/protocol";
import type { Net } from "./net";
import { anim, cargarArte, img, letras, marco, pintarMontaje, toque } from "./arte";
import { anguloTension, COLOR_LUZ, lecturaLista, leerMedida, luzValidacion, TEXTO_LUZ, T as TM, textoMedida, textoModo, TRAMO, type LecturaVista, type Midiendo } from "./multimetro";
import { generarPuerta, mostrarPuerta } from "./puerta";
import { avisoVivo, despachable, faltan, pistaDemo, reloj, tarjetaVisible, textoRival, type EcoTipo, type Falta, type Pantalla } from "./pantalla";
import { crearChispa, expresionGuia, reaccion, type Chispa } from "./chispa";
import { AYUDA, avisoEnviado, avisoRecibido, HUMO_BAHIA, HUMO_GAVETA, HUMO_TOQUES, humoVisible, limpiaHumo, PODS_LIMPIOS, sabotajeActivo, sinPista, type Recta } from "./sabotaje";
import { alternarSilencio, desbloquear, silenciado, sonar } from "./audio";
import { arrastrable, dentro } from "./arrastre";
import { casillas, DIAGNOSTICO, MAX_LLAMAS, puntosPod, rachaLlamas, textoGlobo, textoObjetivo, textoPod, tiempoPod } from "./progreso";
import { cargarPerfil, guardarPerfil, marcarTutorial, registrarTiempo, ultimoAlias } from "./perfil";
import { cableDelCorto, cargasPuestas, conPlaca, faltaColocar, faltaCablear, montaje, textoCorto, todasPuestas, type Cable, type Puestas } from "./placa";
import { ayudaCables, Tablero } from "./tablero";
import { QUEMADAS_OLEADAS } from "../../spike/src/arbiter/penalties";
import { conDoble, etiquetas, MEJORAS, medirMs, ofrecer } from "./mejoras";
import { mecanica, actual, avanzar, esFin, iniciar, permite, siguiente, textoPaso, type EstadoTut, type Objetivo, type Tutorial } from "./tutorial";
import { huecosCadena, montajeCarga, montajePieza, cargas, cola, estadoZona, etiquetaCarga, nivelCarga, pestanasArte, podDe, sprite, spriteBateria, spriteCadena, spriteCarga, spritePieza, spriteTarjeta } from "./sprites";
import { botonesGaveta, CARTEL, conHueco, FRENA, GAVETA, LEYENDA_ZONAS, NOMBRE_ZONA, PISTA_DEMO, RETO, retrasoCola, textoOpcion, textoPiezaCadena, textoVolts, type Aguja } from "./vista";

const K = 4;
const ANGULO: Record<Aguja, number> = { poco: -60, correcto: 0, demasiado: 60 };
const OSCURO = 0x140f1f, ALERTA = 0xff8a7a, GRIS = 0x9aa4c0, PISTA = 0xffd23f;
/** Coordenadas locales de la escena (bloque de 360 px de ancho). */
const POD_X = -12, POD_Y = 130, BAHIA_Y = 294;
const REDUCIDO = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
type Bloque = Phaser.GameObjects.Container;
type BotonGuia = { t: Phaser.GameObjects.BitmapText; partes: Phaser.GameObjects.GameObject[] };
const puntos = (...p: [number, number][]) => p.map(([x, y]) => new Phaser.Math.Vector2(x, y));
/** Ranura de la pieza en el dibujo del circuito (coordenadas del panel): ahí se suelta lo que se arrastra de la gaveta. */
const RANURA = { x: 180, y: 34, w: 140, h: 96 };
/** Centro del montaje de carga de varias piezas (protegido, divisor): a la derecha, cabe en los 360 px (ancho ≤ 110). */
const MC = { x: 288, y: 62 };
type Letras = Phaser.GameObjects.BitmapText;

export class Taller extends Phaser.Scene {
  private zona = 0;
  private ranura = RANURA;
  private dibujarCables!: (hueco: boolean) => void;
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
  /** La misma lectura ya interpretada (cifra, estado, luz) y los voltios de la última en cada punto, para «más que antes». */
  private leida?: LecturaVista;
  private previas = new Map<string, number>();
  /** Cadena: lo que dijo el multímetro de cada hueco, por "pod-zona|tN": false = no pasa (muerta, se marca roja con «?»), true = pasa. */
  private tramos = new Map<string, boolean>();
  private simbolo!: Phaser.GameObjects.Image;
  private tinteLectura = false;
  private avisoVisto: string | null = null; // para limpiar el multímetro cuando llega un aviso nuevo del árbitro
  private bloqueado = false;
  /** Flujo único (todas las mecánicas y modos): hueco rojo de la pieza que falta, soltar = probar, luz del multímetro y botón CHECK (= Despachar). */
  private hueco!: Phaser.GameObjects.Rectangle;
  private check!: { c: Bloque; fondo: Phaser.GameObjects.NineSlice; marca: Phaser.GameObjects.Graphics; texto: Letras };
  private avisoClave = "";
  private avisoLocal?: { texto: string; hasta: number };
  private podC?: Bloque;
  private podNum = 0;
  /** Carteles y aviso de despacho caducan por reloj real (no por el de Phaser): con pocos fps los tweens y timers van lentos y el cartel se quedaba sobre el pod nuevo. */
  private carteles: { c: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; hasta: number }[] = [];
  private despachoHasta = 0;
  /** Puerta (puerta.ts): semilla propia de la sesión, puertas vistas (índice), la que está viva y la racha de aciertos. */
  private puertaSemilla = Math.floor(Math.random() * 2 ** 32);
  private puertasVistas = 0;
  private puertaViva: { cerrar(): void } | null = null;
  private puertaRacha = 0;
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
  /** Modo demo: ya probó una vez (la pista del primer pod no vuelve). */
  private intento = false;
  /** Tutorial: paso en curso (null si no es el tutorial) y qué paso se pintó por última vez. */
  private tut: Tutorial | null = null;
  /** Estado del tutorial calculado AHORA (no una copia del último cuadro: un clic de elegir seguido de Probar llegaba antes del siguiente update). */
  private estTut(): EstadoTut | undefined {
    const z = this.zonaActual(), v = z && this.net.estado.vistas[z.zona], d = this.net.estado.despachados;
    if (!z) return { modo: null, medido: false, quemado: false, reparada: d > 0, despachados: d, pruebas: this.pruebas, medidas: this.medidas }; // pod ya despachado: el tutorial sigue hasta el cierre
    return { elegida: this.elegidas.get(this.clave()), modo: this.modo, medido: this.lectura?.modo === "tension",
      aguja: v?.aguja, quemado: !!v?.quemado, reparada: z.reparada, despachados: d, circuito: z.circuito, falta: this.falta(z),
      pruebas: this.pruebas, medidas: this.medidas, localizada: this.muertaLocalizada() !== null };
  }
  /** Veredictos de Probar y lecturas del multímetro recibidos (el tutorial exige uno NUEVO tras entrar en el paso). */
  private pruebas = 0;
  /** Chispa (hueco bajo el globo, a la izquierda de la nave): señala en tutorial y práctica, solo reacciona en partidas. */
  private chispa!: Chispa;
  private exprBase: "normal" | "feliz" | "preocupada" | "senalando" = "normal";
  /** Flecha que rebota sobre el objetivo y chispitas que viajan de la mano de Chispa hasta ella. */
  private senal!: { c: Phaser.GameObjects.Container; flecha: Phaser.GameObjects.Sprite; chispitas: Phaser.GameObjects.Rectangle[]; clave: string };
  /** Racha del árbitro: rayos del HUD y último aviso ya mostrado. */
  private rayos!: { g: Phaser.GameObjects.Graphics; bono: Letras };
  private ecoVisto = 0;
  private chispaHasta = 0;
  /** Sabotajes (sabotaje.ts): humo sobre la bahía y la gaveta, aviso y pods limpios del HUD. */
  private sab!: { humo: Bloque[]; fondos: Phaser.GameObjects.Rectangle[]; texto: Letras; aviso: Bloque; fondoAviso: Phaser.GameObjects.Rectangle; titulo: Letras; ayuda: Letras; pods: Phaser.GameObjects.Graphics; etiqueta: Letras };
  private humoToques = 0;
  private humoLimpio = 0;
  private humoVisto = 0;
  private sinPistaVisto = false;
  /** Fusible viejo colgando/cayendo del portafusible (una vez por pod-zona). */
  private fusibleVisto = new Set<string>();
  private fusibleAnim?: { c: Phaser.GameObjects.Container; clave: string };
  /** El ✓ del tutorial ya se guardó (al despachar). */
  private marcado = false;
  private leyenda!: Letras;
  /** El mismo alias que muestra el menú (Aprender > Mecánicas): ahí se carga y guarda el ✓. */
  private aliasPerfil() { return ultimoAlias().trim() || this.net.estado.alias?.trim() || "Aprendiz"; }
  /** Probaste otra elección: el veredicto y el aviso de la anterior ya no valen (el estado del tutorial sí los conserva). */
  private rancio(z: ZonaView) { const k = this.probadas.get(this.clave()); return k !== undefined && !z.reparada && this.eleccion(z) !== k; }
  private vistasVivas(p: Pantalla) { const z = this.zonaActual(); return z && this.rancio(z) ? Object.fromEntries(Object.entries(p.vistas).filter(([k]) => Number(k) !== z.zona)) : p.vistas; }
  private medidas = 0;
  private vistasVistas = new Map<string, unknown>();
  private guiaClave = "";
  /** Botón «Salir» del HUD (práctica y Oleadas). */
  private salirB: Phaser.GameObjects.GameObject[] = [];
  /** Alto táctil mínimo en unidades del lienzo para que valga 44 px en pantalla; ver ajustarGolpes(). */
  private golpe = 48;
  private guia!: { caja: Bloque; titulo: Letras; texto: Letras; esquema: Phaser.GameObjects.Container; saltar: BotonGuia; fin: BotonGuia[]; zonas: Phaser.GameObjects.Zone[]; resaltes: Phaser.GameObjects.NineSlice[]; chispa: Chispa };
  private ui!: {
    escena: Bloque; panel: Bloque; estado: Letras; rival: Letras; salir: Phaser.GameObjects.Zone; reloj: Letras; contador: Phaser.GameObjects.Image;
    podT: Letras; llamas: Phaser.GameObjects.Sprite[]; mejorasT: Letras;
    pestanas: Phaser.GameObjects.Image[]; globo: Letras; bocadillo: Phaser.GameObjects.Image; cola: Bloque; bahia: Phaser.GameObjects.Sprite;
    circuito: Bloque; carga: Phaser.GameObjects.Image[]; aguja: Phaser.GameObjects.Image; aviso: Letras; gaveta: Letras;
    opciones: { fondo: Phaser.GameObjects.NineSlice; zona: Phaser.GameObjects.Zone; texto: Letras; nombre: Letras }[]; golpes: Phaser.GameObjects.Zone[];
    tarjeta: Bloque; cables: Phaser.GameObjects.Graphics; tablero: Tablero; fila: Bloque; etiquetas: Letras[];
    /** Cadena: un área táctil por pieza (medir al tocarla). */
    huecos: Phaser.GameObjects.Zone[];
    modos: { modo: ModoMedir; fondo: Phaser.GameObjects.NineSlice; icono: Phaser.GameObjects.Image; rotulo: Letras }[]; pasa: Phaser.GameObjects.Image; zonasMedir: Phaser.GameObjects.Zone[];
    /** Pista del primer pod en modo demo: flecha a la gaveta y resaltes (gaveta o Probar). */
    flecha: Phaser.GameObjects.Sprite; resalteGaveta: Phaser.GameObjects.NineSlice; resalteCheck: Phaser.GameObjects.NineSlice;
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
  private limpiarMedida() { this.lectura = this.leida = this.midiendo = undefined; }
  private medir(punto: string) {
    const z = this.zonaActual(), modo = this.modo;
    if (!z || !modo || this.midiendo) return;
    const pieza = this.eleccion(z) ?? (z.circuito === "cadena" ? "ninguna" : undefined); // cadena: sin repuesto puesto se mide la cadena tal cual
    if (!pieza) return this.avisar(conPlaca(z.circuito) ? TM.sinMontaje : TM.sinEleccion);
    this.lectura = undefined;
    this.midiendo = { seq: this.net.medir(z.zona, pieza, modo, punto), desde: Date.now(), punto };
  }
  /** Cadena: hueco (1..n) que el multímetro dijo que no pasa y aún no se ha reemplazado; null si no hay o no es cadena. */
  private muertaLocalizada(): number | null {
    const z = this.zonaActual();
    if (z?.circuito !== "cadena" || z.reparada) return null;
    const k = Number(this.elegidas.get(this.clave())?.[0]) || 0;
    for (let i = 1; i <= z.cadena!.length; i++) if (i !== k && this.tramos.get(`${this.clave()}|t${i}`) === false) return i;
    return null;
  }
  private zonaActual() {
    const zonas = this.net.estado.pod?.zonas ?? [];
    return zonas.find((x) => x.zona === this.zona) ?? zonas[0];
  }

  preload() { cargarArte(this); }

  create() {
    const net = this.net, an = false; // shortcut: siempre vertical (360x640 FIT); el layout apaisado (innerWidth > innerHeight) queda sin uso
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
    this.colaNaves = new Map(); // la escena se reusa: las naves anteriores ya se destruyeron
    const bahia = anim(this, 180, BAHIA_Y, "bahia_ocupada");
    const podT = letras(this, 12, 274, "", 2, GRIS);
    const llamas = Array.from({ length: MAX_LLAMAS }, (_, i) => anim(this, 150 + i * 26, 282, "llama_turbo_cian", 2).setAlpha(0.35));
    const mejorasT = letras(this, 12, 252, "", 2, PISTA); // mejoras activas (práctica)
    const bocadillo = img(this, 8, 62, "globo_sintoma", 3).setOrigin(0);
    const leyenda = this.leyenda = letras(this, 180, 334, LEYENDA_ZONAS, 2, GRIS).setOrigin(0.5, 0); // bajo la bahía, fuera del pod; sin leyenda los iconos de las pestañas no se entendían
    escena.add([...pestanas, bocadillo, globo, colaC, bahia, podT, mejorasT, ...llamas, leyenda]);
    this.rivalCasillas = this.add.graphics(); // pods del rival (n/5) en casillas, junto a su línea del HUD
    // Chispa: el hueco bajo el globo y a la izquierda de la nave (pies en 28, 290 del lienzo). Por encima del pod, por debajo de la caja del tutorial.
    this.chispa = crearChispa(this, 28, 72 + 218, 2, "normal", { ancho: 170 });
    this.chispa.cont.setDepth(20);
    // Señal del objetivo (tutorial y práctica): flecha + chispitas; por debajo de la caja del tutorial (depth 900).
    const flechaS = anim(this, 0, 0, "flecha_guia", 2), chispitas = [0, 1, 2].map((i) => this.add.rectangle(0, 0, 6 - i, 6 - i, PISTA).setAlpha(0));
    this.senal = { c: this.add.container(0, 0, [...chispitas, flechaS]).setDepth(895).setVisible(false), flecha: flechaS, chispitas, clave: "" };
    // Rayos de la racha (3 despachos seguidos sin fallar = bono de enfriamiento reducido), justo bajo Chispa.
    this.rayos = { g: this.add.graphics().setDepth(5), bono: letras(this, 30, 327, "BONO", 1.5, PISTA).setOrigin(0.5).setDepth(5).setVisible(false) };

    // Panel del circuito: batería → pieza elegida → carga; medidor; gaveta; Probar y Despachar.
    const panel = this.add.container(an ? 840 : 0, an ? 290 : 430);
    const cables = this.add.graphics();
    this.dibujarCables = (hueco) => { // cable roto sin empalmar: el hilo rojo se interrumpe bajo la pieza del centro
      cables.clear();
      cables.lineStyle(4, 0xe8363c);
      if (hueco) { cables.strokePoints(puntos([50, 50], [50, 34], [140, 34])); cables.strokePoints(puntos([220, 34], [310, 34], [310, 44])); }
      else cables.strokePoints(puntos([50, 50], [50, 34], [310, 34], [310, 44]));
      cables.lineStyle(4, 0x3e6af0).strokePoints(puntos([50, 102], [50, 118], [310, 118], [310, 108]));
    };
    this.dibujarCables(false);
    const circuito = this.add.container(0, 0);
    const carga = [0, 1].map(() => img(this, 310, 76, "led_rojo_apagado").setOrigin(0.5));
    // Fila del medidor de aguja (veredicto o multímetro) con los dos modos del multímetro a los lados.
    const medidor = img(this, 180, 178, "medidor_fondo", 2).setOrigin(0.5);
    const aguja = img(this, 180, medidor.y - 22 + 40, "medidor_aguja", 2).setVisible(false);
    const pasa = img(this, 180, 172, "icono_pasa", 3).setOrigin(0.5).setVisible(false);
    this.simbolo = img(this, 0, 146, "icono_pasa", 1.5).setOrigin(0.5).setVisible(false); // ✓ / ✗ junto a la cifra de tensión
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
    const fila = this.add.container(0, 0, [medidor, aguja, pasa, this.simbolo, ...etiquetas, ...modos.flatMap((m) => [m.fondo, m.icono, m.rotulo])]);
    // Fuera de la placa se mide tocando la pieza de la gaveta o la carga del dibujo.
    const medirToque = (x: number, y: number, w: number, h: number, punto: (ly: number) => string) =>
      this.add.zone(x, y, w, h).setInteractive().on("pointerdown", (_p: unknown, _lx: number, ly: number) => {
        const z = this.zonaActual();
        if (!z || conPlaca(z.circuito)) return;
        if (!this.modo) return;
        if (z.circuito === "invertido" && punto(ly) === "pieza") return this.avisar("Eso es la resistencia. Toca el LED, a la derecha."); // el centro solo muestra cómo queda el LED
        this.medir(punto(ly));
      });
    const zonasMedir = [
      medirToque(180, 44, 120, 84, () => "pieza"),
      medirToque(310, 76, 72, 110, (ly) => (this.zonaActual()?.circuito === "cabina" && ly > 55 ? "carga2" : "carga1")),
    ];
    const huecos = [0, 1, 2, 3].map((i) => this.add.zone(0, 0, 58, 76).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      const z = this.zonaActual();
      if (z?.circuito !== "cadena" || z.reparada) return;
      if (this.modo) this.medir(`t${i + 1}`); else this.avisar(TM.ayuda);
    }));
    const tablero = new Tablero(this, 30, -28, {
      cambio: (c) => { sonar("cable"); this.cables.set(this.clave(), c); this.limpiarMedida(); this.net.limpiarAviso(); this.pintar(net.estado); },
      poner: (pz) => { sonar("pieza"); this.puestas.set(this.clave(), pz); this.limpiarMedida(); this.net.limpiarAviso(); this.pintar(net.estado); },
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
      const elegir = (o: string, hueco?: number) => {
        const z = this.zonaActual()!, jugada = hueco ? `${hueco}:${o}` : o; // cadena: «hueco:repuesto»
        const no = permite(this.tut, { arrastrar: o }, this.estTut());
        if (no) { this.avisar(no); return false; }
        if (hueco && this.tut?.activo && this.muertaLocalizada() !== hueco) { this.avisar("Suéltalo en la pieza roja con «?»"); return false; }
        // soltar = probar: mismo test, misma espera y mismo «sin cambios» que el antiguo botón Probar (ni un ensayo gratis)
        const falta = net.estado.esperaHasta - Date.now();
        if (falta > 0) { this.avisar(`Espera ${Math.ceil(falta / 1000)} s y arrastra otra pieza`); return false; }
        if (jugada === this.probadas.get(this.clave())) { this.avisar("Esa ya la probaste. Arrastra otra."); return false; }
        sonar("elegir");
        if (this.elegidas.get(this.clave()) !== jugada) this.limpiarMedida();
        this.elegidas.set(this.clave(), jugada);
        net.probar(z.zona, jugada); this.intento = true; this.probadas.set(this.clave(), jugada);
        this.pintar(net.estado); return true;
      };
      const enRanura = (p: Phaser.Input.Pointer) => { const v = panel.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY); return dentro(this.ranura, v.x, v.y); };
      const huecoEn = (p: Phaser.Input.Pointer): number | null => {
        const z = this.zonaActual();
        if (z?.circuito !== "cadena") return null;
        const v = panel.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY), k = huecosCadena(z.cadena!.length).findIndex((h) => dentro(h, v.x, v.y));
        return k < 0 ? null : k + 1;
      };
      arrastrable(this, zona, {
        puede: () => !!pieza(),
        fantasma: () => this.add.container(0, 0, [marco(this, 0, 0, "boton_primario", 104, 48),
          letras(this, 0, 0, textoOpcion(pieza()!, this.zonaActual()!.circuito), 2, OSCURO).setOrigin(0.5)]),
        sobre: (p) => {
          const z = this.zonaActual();
          if (z?.circuito !== "cadena") return void resalteRanura.setVisible(!!p).setAlpha(p && enRanura(p) ? 1 : 0.45);
          const k = p && huecoEn(p), h = k ? huecosCadena(z.cadena!.length)[k - 1]! : null; // resalta la pieza sobre la que se suelta
          resalteRanura.setVisible(!!h);
          if (h) resalteRanura.setPosition(h.x, h.y).setSize(h.w / 4, h.h / 4).setAlpha(1);
        },
        soltar: (p) => {
          const o = pieza();
          if (!o) return false;
          if (this.zonaActual()?.circuito !== "cadena") return enRanura(p) && elegir(o);
          const k = huecoEn(p);
          return k !== null && elegir(o, k);
        },
        tocar: () => { const o = pieza(); if (o) { if (this.zonaActual()?.circuito === "cadena") this.avisar("Arrastra el repuesto a una pieza de la cadena."); else elegir(o); } },
      });
      // Valor impreso ("470 Ω") y, en resistencias, su nombre estable ("Frena medio") debajo, más pequeño.
      return { fondo, zona, texto: letras(this, 0, 290, "", 2).setOrigin(0.5), nombre: letras(this, 0, 302, "", 2).setOrigin(0.5) }; // k entero: 1,5 se veía borroso
    });
    const golpes: Phaser.GameObjects.Zone[] = [];
    const tarjeta = this.add.container(180, 76).setVisible(false);
    // Pista del modo demo: se ven solo en el primer pod hasta el primer intento (pistaDemo en pantalla.ts).
    const flecha = anim(this, 180, 268, "flecha_guia", 2).setVisible(false);
    const resalteGaveta = marco(this, 180, 290, "recuadro_resaltado", 358, 60).setVisible(false);
    const resalteCheck = marco(this, 180, 340, "recuadro_resaltado", 300, 46).setVisible(false);
    this.tweens.add({ targets: [resalteGaveta, resalteCheck], alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: flecha, y: 274, duration: 400, yoyo: true, repeat: -1 });
    // Demo de cableado: flecha girada que sale de la gaveta de la placa (entre sus dos huecos) hacia la placa.
    const flechaPlaca = anim(this, 180, 246, "flecha_guia", 2).setAngle(180).setVisible(false);
    this.tweens.add({ targets: flechaPlaca, y: 238, duration: 400, yoyo: true, repeat: -1 });
    // Hueco de la resistencia que falta: rojo con parpadeo suave (sin parpadeo duro; quieto con prefers-reduced-motion).
    this.hueco = this.add.rectangle(RANURA.x, RANURA.y, 108, 44, 0xe8363c, 0.5).setStrokeStyle(2, ALERTA).setVisible(false);
    if (!REDUCIDO) this.tweens.add({ targets: this.hueco, alpha: 0.25, duration: 1100, ease: "Sine.InOut", yoyo: true, repeat: -1 });
    const checkMarca = this.add.graphics().lineStyle(5, 0x0b1020).strokePoints(puntos([-88, 0], [-80, 9], [-64, -9]));
    this.check = { c: this.add.container(180, 340).setVisible(false), fondo: marco(this, 0, 0, "boton_primario", 300, 40), marca: checkMarca, texto: letras(this, 14, 0, "CHECK", 3, OSCURO).setOrigin(0.5) };
    this.check.c.add([this.check.fondo, checkMarca, this.check.texto]);
    panel.add([
      marco(this, 180, 177, "panel_oscuro", 360, 356), cables, this.hueco, circuito, resalteRanura, ...carga, ...zonasMedir, ...huecos, tablero.c, fila, aviso, gaveta,
      ...opciones.flatMap((o) => [o.fondo, o.zona, o.texto, o.nombre]), this.check.c, resalteGaveta, resalteCheck, flecha, flechaPlaca,
      // CHECK mide 40 px de alto: el área táctil es de 48 o más (ajustarGolpes).
      golpes[0] = toque(this, 180, 340, 300, 48, () => this.pulsarCheck()),
      tarjeta,
    ]);

    this.crearSabotajes(escena, panel);

    // Esquina superior del HUD (entre «Pod n/5» y el contador): 36×36 visibles, zona táctil 44×44 sin tocar «Salir».
    const mudo = this.add.text(212, 21, "", { fontSize: "22px", color: "#fff", fixedWidth: 36, fixedHeight: 36, align: "center", padding: { y: 4 } }).setOrigin(0.5).setDepth(1000);
    const pintarMudo = () => mudo.setText(silenciado() ? "×" : "♪").setBackgroundColor(silenciado() ? "#8a2f3a" : "#3a4466");
    this.add.zone(212, 21, 44, 44).setDepth(1001).setInteractive({ useHandCursor: true }).on("pointerdown", () => { desbloquear(); alternarSilencio(); pintarMudo(); });
    pintarMudo();
    this.ui = {
      escena, panel, estado, rival, salir, reloj: relojT, contador, podT, llamas, mejorasT, pestanas, globo, bocadillo, cola: colaC, bahia, circuito, carga, aguja, aviso, gaveta, opciones, tarjeta,
      cables, tablero, fila, etiquetas, modos, pasa, zonasMedir, huecos, flecha, resalteGaveta, resalteCheck, flechaPlaca, resalteRanura, golpes,
    };
    this.crearGuia();
    this.tut = net.tutorial ? iniciar(net.idTutorial!) : null;
    // Phaser reusa la escena: sin esto, la pieza del pod 1 del tutorial salía ya elegida en el pod 1 de la práctica.
    this.previas.clear(); this.tinteLectura = false; this.modo = null; this.limpiarMedida(); // la escena se reusa: el modo del multímetro de la partida anterior no pasa a la nueva
    this.elegidas.clear(); this.probadas.clear(); this.tramos.clear(); this.cables.clear(); this.puestas.clear();
    this.guiaClave = ""; this.avisoClave = "";
    this.ecoVisto = net.estado.eco?.n ?? 0; this.fusibleVisto.clear(); this.fusibleAnim = undefined;
    this.humoToques = 0; this.humoLimpio = 0; this.humoVisto = 0; this.sinPistaVisto = false;
    this.golpe = 0;
    this.podNum = 0;
    this.carteles = [];
    this.despachoHasta = 0; this.puertaViva = null; this.puertasVistas = 0; this.puertaRacha = 0; this.puertaSemilla = Math.floor(Math.random() * 2 ** 32);
    this.intento = false;
    this.marcado = false;
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
    this.pintarSabotaje(p, ahora);
    // Un aviso nuevo (resultado, despacho) manda sobre la lectura del multímetro; sin esto el panel seguía en «Pasa…».
    if (p.aviso !== this.avisoVisto) { this.avisoVisto = p.aviso; if (p.aviso) { this.limpiarMedida(); this.modo = null; this.pintar(p); } }
    if ((p.esperaHasta > ahora) !== this.bloqueado) { if (this.bloqueado) sonar("listo"); this.bloqueado = !this.bloqueado; this.pintar(p); } // Probar se apaga mientras dura el bloqueo
    this.ui.reloj.setText(p.practica ? "--:--" : reloj(p, ahora)); // la práctica no tiene límite de tiempo
    this.ui.podT.setText(tiempoPod(ahora - this.podDesde));
    // Multímetro: «Midiendo…» ~1 s con la aguja buscando; luego la lectura del árbitro.
    if (this.midiendo) {
      const l = lecturaLista(this.midiendo, p.medida, ahora, medirMs(this.net.mejoras));
      if (l) {
        this.midiendo = undefined; this.lectura = l; this.medidas++;
        const clave = `${this.clave()}|${l.modo}|${l.punto}`, v = this.vistasVivas(p)[this.zona];
        this.leida = leerMedida(l, { circuito: z?.circuito, volts: z?.volts ?? 0, previa: this.previas.get(clave), vistaLuz: this.tut?.activo ? luzValidacion(v) : null });
        if (this.leida.voltios !== undefined) this.previas.set(clave, this.leida.voltios);
        this.pintarMedidor();
        if (z?.circuito === "cadena" && l.modo === "continuidad") { // la pieza que no pasa queda marcada en rojo (la tensión no marca: con el LED aguas abajo el corte no siempre lee «toda»)
          this.tramos.set(`${this.clave()}|${l.punto}`, !!l.pasa);
          this.pintar(p);
        }
      }
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
    const medidor = !this.modo ? null : this.midiendo ? TM.midiendo : this.lectura ? (this.leida?.estado ?? textoMedida(this.lectura, z?.circuito)) : textoModo(this.modo, z?.circuito);
    const placa = !!z && conPlaca(z.circuito);
    const falta = z ? this.falta(z) : null, pista = z ? pistaDemo(p, this.intento, falta) : null;
    const texto = this.acabo(p) ? "" : (local ?? (corto && textoCorto(corto, z!.circuito, cargasPuestas(this.puestasZona()))) ?? medidor ?? (pista && PISTA_DEMO[pista]) ?? (z && this.rancio(z) ? null : this.sinRespuesta(z, avisoVivo(p, ahora))) ?? (despachable(p) || z?.reparada ? "Multímetro en verde: pulsa CHECK"
      : placa && falta === "colocar" ? faltaColocar(this.puestasZona(), z!.circuito)! : placa && falta ? ayudaCables(z!.circuito) : `${this.tut?.activo ? "" : `${textoObjetivo(p, sinPista(p, ahora))}. `}${placa ? "Pulsa CHECK para probar" : z!.circuito === "cadena" ? (this.muertaLocalizada() ? "Arrastra un repuesto al hueco rojo" : "Mide las piezas con Continuidad para hallar la muerta") : `Arrastra ${["led", "cabina", "protegido", "divisor"].includes(z!.circuito) ? "una resistencia" : "una pieza"} al hueco rojo`}`)) as string;
    const tinte = this.modo && this.lectura && !this.midiendo && this.leida && texto === this.leida.estado ? COLOR_LUZ[this.leida.luz] : null; // el aviso lleva el color de la lectura
    const clave = `${placa}|${texto}|${tinte}`;
    if (clave !== this.avisoClave) {
      if (tinte !== null) this.ui.aviso.setTint(tinte); else if (this.tinteLectura) this.ui.aviso.setTint(0xffffff);
      this.tinteLectura = tinte !== null; // en la placa el aviso cabe entre «Correcto» y Probar (44 px): 1-2 líneas a 16 px, 3 a 12 px
      this.avisoClave = clave;
      this.ui.aviso.setText(texto);
      for (const k of placa ? [16, 12, 8] : [16]) { this.ui.aviso.setFontSize(k); if (!placa || this.ui.aviso.height <= 44) break; }
    }
    if (placa) this.ui.aviso.setY(283);
    this.ui.gaveta.setAlpha(this.ui.aviso.y + this.ui.aviso.height > this.ui.gaveta.y - 2 ? 0 : 1); // el aviso de 3 líneas no se pisa con «Elige…»
    // El motor (ícono de turbina) gira cuando la corriente es la correcta.
    if (z?.circuito === "interruptor" && nivelCarga(z, p.vistas[z.zona]) === 2) this.ui.tablero.girar(dt * 0.3);
    // Tutorial: la lectura del multímetro llega aquí y no en pintar(), así que el paso se comprueba cada cuadro.
    const vistas = new Map(Object.entries(p.vistas)); // cada Vista es un objeto nuevo por veredicto
    for (const [k, v] of vistas) if (this.vistasVistas.get(k) !== v) this.pruebas++;
    this.vistasVistas = vistas;
    if (this.tut?.activo) { // avanzar() exige que cada paso lleve ≥1,4 s visible
      const antes = this.tut;
      this.tut = avanzar(this.tut, this.estTut()!, ahora);
      if (this.tut !== antes) { // «Sigue el paso: …» del paso anterior ya no aplica
        this.avisoLocal = undefined;
        if (this.tut.activo && !["tension", "pieza", "carga", "cadena"].includes(actual(this.tut).objetivo) && z?.circuito !== "divisor") { this.modo = null; this.limpiarMedida(); this.pintar(p); } // «Batería desconectada…» no va con «Pulsa Probar»
      }
    }
    if (this.tut && !this.marcado && p.despachados > 0) { this.marcado = true; guardarPerfil(marcarTutorial(cargarPerfil(this.aliasPerfil()), this.tut.id)); }
    this.pintarGuia(placa);
    if (z) this.pintarSenal(this.acabo(p) ? null : this.objetivoSenal(p, z, placa), placa, !!this.tut?.activo && actual(this.tut).titulo === "Continuidad"); // el paso del tutorial cambia aquí, no en pintar()
    const ver = !!z && tarjetaVisible(p, z.zona, ahora);
    if (ver !== this.ui.tarjeta.visible && z) {
      if (ver) this.armarTarjeta(z.circuito, p);
      this.ui.tarjeta.setVisible(ver);
    }
  }

  /** En el tutorial del LED girado el aviso del árbitro regalaba la causa («está al revés»): se mide para descubrirla. */
  private sinRespuesta(z: ZonaView | undefined, aviso: string | null) {
    if (aviso) aviso = aviso.replace(/pulsa Despachar/i, (m) => m.replace("Despachar", "CHECK")); // el botón se llama CHECK
    return aviso && this.tut?.activo && z?.circuito === "invertido" && !z.reparada && aviso.includes("al revés") ? "El LED no enciende. Averigua por qué con el multímetro." : aviso;
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
    pestanasArte(pod, this.zona, sinPista(p, Date.now())).forEach((t, i) => u.pestanas[i]!.setTexture(t.sprite).setAlpha(t.zona == null && !sinPista(p, Date.now()) ? 0.6 : 1).setVisible(!p.demo || t.zona != null));
    u.globo.setText(textoGlobo(z, pod));
    // El bocadillo mide 3 líneas: con más (retos largos) se estira hacia abajo para que el texto no se corte.
    u.bocadillo.setScale(3, 3 * Math.max(1, (u.globo.height + 26) / 80));
    this.pintarCola(pod.numero, p.total);
    this.pintarPod(p);

    // Circuito: batería, pieza elegida (sprite o texto) y carga según el último veredicto.
    const elegida = this.elegidas.get(this.clave()), vivas = this.vistasVivas(p), v = vivas[this.zona];
    const nivel = nivelCarga(z, v), n = cargas(z.circuito);
    const mp = montajePieza(z.circuito, elegida), mc = montajeCarga(z, nivel, elegida);
    const pieza = spritePieza(z.circuito, elegida), bat = spriteBateria(z.volts);
    u.circuito.removeAll(true).add([
      img(this, 50, 76, bat, bat === "icono_bateria" ? 4 : 2).setOrigin(0.5),
      letras(this, 50, 122, textoVolts(z.volts), 2).setOrigin(0.5, 0),
      ...(mp ? pintarMontaje(this, mp, 180, 34) : pieza ? [img(this, 180, 34, pieza).setOrigin(0.5)] : z.circuito === "divisor" || !elegida ? [] : [marco(this, 180, 34, "boton_secundario", 104, 40)]),
      ...(z.circuito === "divisor" ? (elegida ? [] : [letras(this, MC.x + 28, MC.y, "?", 2).setOrigin(0.5)]) : [letras(this, 180, mp ? 34 + mp.alto + 4 : pieza ? 66 : 34, elegida ? textoOpcion(elegida, z.circuito) : "?", 2).setOrigin(0.5, mp || pieza ? 0 : 0.5)]),
      ...(mc ? [...pintarMontaje(this, mc, MC.x, MC.y), ...(z.circuito === "divisor" ? [] : [letras(this, MC.x, MC.y + mc.alto + 4, etiquetaCarga(z), 2).setOrigin(0.5, 0)])] : [letras(this, 310, 122, etiquetaCarga(z), 2).setOrigin(0.5, 0)]),
    ]);
    this.dibujarCables(z.circuito === "abierto" && elegida === "dejar" && !z.reparada);
    const cad = z.circuito === "cadena";
    if (cad) this.pintarCadena(z, nivel, elegida);
    huecosCadena(4).forEach((_, i) => { // áreas táctiles de la cadena (medir al tocar); fuera de ella no reciben nada
      const r = cad ? huecosCadena(z.cadena!.length)[i] : undefined, h = u.huecos[i]!;
      h.input!.enabled = !!r && !z.reparada;
      if (r) h.setPosition(r.x, r.y).setSize(r.w, r.h);
    });
    if (mc) { // lazo: + de la batería al borne izquierdo (por arriba) y borne derecho al − (por abajo); el montaje va a la derecha, dentro de los 360 px
      const [bi, bd] = mc.bornes!, g = this.add.graphics();
      g.lineStyle(4, 0xe8363c).strokePoints(puntos([50, 50], [50, 34], [MC.x + bi[0], 34], [MC.x + bi[0], MC.y + bi[1]]));
      g.lineStyle(4, 0x3e6af0).strokePoints(puntos([MC.x + bd[0], MC.y + bd[1]], [MC.x + bd[0], 118], [50, 118], [50, 102]));
      u.circuito.addAt(g, 0);
    }
    // Toques de medir y ranura de soltar: en el divisor la pieza elegida es R2 (a la derecha del montaje), no el centro.
    const div = z.circuito === "divisor";
    u.zonasMedir[0]!.setPosition(div ? MC.x + 28 : 180, div ? MC.y : 44).setSize(div ? 52 : 120, div ? 70 : 84);
    u.zonasMedir[1]!.setPosition(mc ? (div ? MC.x - 28 : MC.x) : 310, mc ? MC.y : 76).setSize(mc ? (div ? 52 : 110) : 72, mc ? 70 : 110);
    this.ranura = div ? { x: MC.x + 28, y: MC.y, w: 64, h: 70 } : RANURA;
    this.hueco.setPosition(this.ranura.x, this.ranura.y).setSize(div ? this.ranura.w : 108, div ? this.ranura.h : 44);
    u.resalteRanura.setPosition(this.ranura.x, this.ranura.y).setSize(this.ranura.w / 4, this.ranura.h / 4);
    u.carga.forEach((c, i) => c.setVisible(i < n).setTexture(spriteCarga(z.circuito, nivel, z.fija)).setAngle(0)
      .setScale(n === 2 ? 3 : 4).setPosition(310, n === 2 ? 52 + i * 48 : 76));
    const fin = this.acabo(p);
    u.panel.setVisible(!fin); // tutorial terminado: solo queda la caja «¡Listo!» (el pod 2 no existe)
    u.globo.setVisible(!fin); u.bocadillo.setVisible(!fin);

    // Cabina y Turbina: la placa con cables reemplaza el dibujo y la gaveta; el medidor baja debajo de la placa.
    const placa = conPlaca(z.circuito);
    u.tablero.mostrar(placa);
    if (placa) u.tablero.pintar(z.circuito, z.volts, this.cablesZona(), this.puestasZona(), nivel, z.reparada);
    for (const o of [u.circuito, u.cables, ...u.carga, u.gaveta]) o.setVisible(!placa && (o !== u.carga[1] || n === 2) && !((mc || cad) && (o === u.cables || u.carga.includes(o as Phaser.GameObjects.Image))));
    for (const o of u.zonasMedir) o.input!.enabled = !placa && !cad; // una Zone invisible sigue recibiendo toques
    // Mientras quedan piezas en la gaveta de la placa, esta ocupa el lugar del medidor.
    u.fila.setY(placa ? 60 : 0).setVisible(!placa || !u.tablero.faltanPiezas());
    u.aviso.setY(placa ? 283 : 206);
    u.etiquetas[1]!.setY(placa ? 210 : 146); // en la placa, la etiqueta del centro va debajo del medidor

    u.gaveta.setText(z.reparada || fin ? "" : GAVETA[z.circuito]);
    this.hueco.setVisible(conHueco(z.circuito, elegida, z.reparada) && !fin);
    const botones = botonesGaveta(z, elegida);
    // 3 botones de 104 px o 4 de 82 px, centrados en el panel de 360 px.
    const nb = botones.length, ancho = nb > 3 ? 82 : 104, paso = nb > 3 ? 88 : 116;
    u.opciones.forEach((b, i) => {
      const o = botones[i], ver = !!o && !z.reparada && !placa && !fin, x = 180 + (i - (nb - 1) / 2) * paso;
      const nombre = o && z.circuito !== "divisor" ? (FRENA[o.pieza] ?? "").replace(/^Frena /, "") : "", color = o?.elegida ? OSCURO : 0xffffff;
      b.fondo.setVisible(ver).setTexture(o?.elegida ? "boton_primario" : "boton_secundario").setPosition(x, 290).setSize(ancho / 4, 12);
      b.zona.setPosition(x, 290).setSize(ancho, b.zona.height);
      b.zona.input!.enabled = ver;
      b.texto.setVisible(ver).setText(o?.texto ?? "").setTint(color).setPosition(x, nombre ? 282 : 290);
      b.nombre.setVisible(ver && !!nombre).setText(nombre).setTint(color).setPosition(x, 302);
    });
    // Modo demo: sin multímetro (solo se usa en otras zonas).
    if (p.demo) this.modo = null;
    for (const m of u.modos) { m.fondo.setVisible(!p.demo); m.icono.setVisible(!p.demo); m.rotulo.setVisible(!p.demo).setY(placa ? 210 : 150); }
    const pista = pistaDemo(p, this.intento, this.falta(z));
    u.flecha.setVisible(pista === "elegir");
    u.flechaPlaca.setVisible(pista === "colocar");
    // El mismo recuadro resalta la gaveta (Radar), la gaveta de la placa (colocar) o la placa entera (cablear).
    const recuadro = pista === "colocar" ? [180, 240, 220, 68] : pista === "cablear" ? [180, 92, 340, 252] : [180, 290, 358, 60];
    u.resalteGaveta.setVisible(pista === "elegir" || pista === "colocar" || pista === "cablear")
      .setPosition(recuadro[0], recuadro[1]).setSize(recuadro[2]! / 4, recuadro[3]! / 4);
    const e = this.eleccion(z), probable = conPlaca(z.circuito) && !z.reparada && !!e && e !== this.probadas.get(this.clave());
    const verde = z.reparada && !p.despachando; // CHECK habilitado: el multímetro está en verde (o, en la placa, el circuito está listo para probar)
    u.resalteCheck.setVisible(!fin && (verde || pista === "probar" || probable));
    if (pista === "elegir") u.gaveta.setText(""); // la pista dice lo mismo y la flecha ocupa su lugar
    u.golpes[0]!.input!.enabled = !fin;
    this.check.c.setVisible(!fin);
    this.check.fondo.setTexture(verde || probable ? "boton_primario" : "boton_secundario");
    this.check.marca.setVisible(verde || probable);
    this.check.texto.setText(verde || probable ? "CHECK" : "Aún no está verde").setTint(verde || probable ? OSCURO : GRIS).setX(verde || probable ? 14 : 0); // tras el último pod de un tutorial el árbitro manda un pod 2 que no existe
    this.pintarMedidor();
    this.pintarChispa(p, z, placa, fin, !!v?.quemado);
    this.pintarRayos(p);
    this.fusibleColgando(z, elegida);
    u.aviso.setTint(v?.quemado || v?.cortocircuito ? ALERTA : pista ? PISTA : 0xffffff);
    if (v?.cortocircuito) this.cameras.main.shake(250, 0.01);
  }

  /**
   * Cadena: batería y 3-4 piezas en serie. Todas se ven sanas (la muerta está abierta por dentro). El hueco rojo con «?» sale en la pieza
   * que el multímetro dijo que no pasa; las que pasan llevan una marca verde. El repuesto soltado ocupa el hueco (el LED se enciende al acertar).
   */
  private pintarCadena(z: ZonaView, nivel: number, elegida: string | undefined) {
    const c = this.ui.circuito.removeAll(true), cad = z.cadena!, hs = huecosCadena(cad.length), bat = spriteBateria(z.volts);
    const k = elegida ? Number(elegida[0]) : 0, rep = elegida ? elegida.slice(2) : "", xFin = hs.at(-1)!.x + 40, y = 34, g = this.add.graphics();
    g.lineStyle(4, 0xe8363c).strokePoints(puntos([50, 50], [50, y], [xFin, y], [xFin, 76]));
    g.lineStyle(4, 0x3e6af0).strokePoints(puntos([xFin, 76], [xFin, 118], [50, 118], [50, 102]));
    c.add([g, img(this, 50, 76, bat, bat === "icono_bateria" ? 4 : 2).setOrigin(0.5), letras(this, 50, 122, textoVolts(z.volts), 2).setOrigin(0.5, 0)]);
    cad.forEach((tipo, i) => {
      const h = hs[i]!, id = i + 1 === k ? rep : tipo, sp = spriteCadena(id, nivel), marca = z.reparada ? undefined : this.tramos.get(`${this.clave()}|t${i + 1}`);
      if (sp) c.add(img(this, h.x, y, sp, 3).setOrigin(0.5).setFlipX(id === "ledInv"));
      else c.add(this.add.graphics().lineStyle(6, 0xaab4c8).lineBetween(h.x - 24, y, h.x + 24, y).fillStyle(0xaab4c8).fillCircle(h.x - 24, y, 4).fillCircle(h.x + 24, y, 4));
      c.add(letras(this, h.x, 60, textoPiezaCadena(id), 1.5, GRIS).setOrigin(0.5, 0));
      if (i + 1 === k || marca === undefined) return;
      if (marca) c.add(img(this, h.x, 88, "icono_pasa", 2).setOrigin(0.5));
      else c.add([this.add.rectangle(h.x, y + 6, h.w - 4, 60, 0xe8363c, 0.55).setStrokeStyle(2, ALERTA), letras(this, h.x, y + 6, "?", 4).setOrigin(0.5)]); // hueco rojo = pieza muerta
    });
  }

  /** Tutorial terminado: el árbitro ya despachó su único pod y el «siguiente» no existe. */
  private acabo(p: Pantalla) { return !!this.net.tutorial && !!p.pod && !!p.total && p.pod.numero > p.total; }

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

  /**
   * CHECK. Con la zona reparada (multímetro en verde) despacha el pod o pasa a la siguiente zona sin reparar. En la placa (dos piezas y
   * cables, soltar no tiene sentido) también PRUEBA: con el circuito completo manda el mismo `test` que antes mandaba Probar.
   */
  private pulsarCheck() {
    const z = this.zonaActual(), p = this.net.estado;
    if (!z) return;
    const no = permite(this.tut, "check", this.estTut());
    if (no) return this.avisar(no);
    if (!z.reparada) return conPlaca(z.circuito) ? this.probarPlaca(z) : this.avisar("Aún no está verde");
    sonar("clic");
    if (despachable(p)) return this.net.despachar();
    const sig = p.pod?.zonas.find((x) => !x.reparada);
    if (sig) { this.zona = sig.zona; this.limpiarMedida(); this.net.limpiarAviso(); this.pintar(p); }
  }

  private probarPlaca(z: ZonaView) {
    const e = this.eleccion(z), falta = this.net.estado.esperaHasta - Date.now();
    if (!e) return this.avisar(faltaColocar(this.puestasZona(), z.circuito) ?? faltaCablear(this.cablesZona(), z.circuito, cargasPuestas(this.puestasZona())));
    if (falta > 0) return this.avisar(`Espera ${Math.ceil(falta / 1000)} s y vuelve a probar`);
    if (e === this.probadas.get(this.clave())) return this.avisar("No cambiaste nada. Cambia una pieza o un cable y prueba.");
    sonar("clic");
    this.net.probar(z.zona, e); this.intento = true; this.probadas.set(this.clave(), e); this.pintar(this.net.estado);
  }

  /** Áreas táctiles de la gaveta y de CHECK: >= 44 px en pantalla (el lienzo se escala con FIT) sin solaparse. */
  private ajustarGolpes() {
    const h = Math.ceil(Math.max(48, 44 * this.scale.displayScale.y));
    if (h === this.golpe) return;
    this.golpe = h;
    for (const o of this.ui.opciones) o.zona.setSize(o.zona.width, h);
    // CHECK empieza donde acaba la gaveta (290 + h/2).
    for (const z of this.ui.golpes) z.setSize(z.width, h).setY(Math.max(340, 290 + h));
    for (const z of this.guia.zonas) z.setSize(z.width, Math.max(56, h));
  }

  private crearGuia() {
    const caja = this.add.container(0, 0).setVisible(false).setDepth(900);
    const boton = (x: number, fondo: string, color: number, fn: () => void, w = 152) => {
      const t = letras(this, x, 40, "", 2, color).setOrigin(0.5);
      return { t, partes: [marco(this, x, 40, fondo, w, 32), t, toque(this, x, 40, w, 56, fn)] as Phaser.GameObjects.GameObject[] };
    };
    const alias = () => this.aliasPerfil();
    const saltarB = boton(-84, "boton_secundario", 0xffffff, () => void this.net.salir()); // «Saltar» vuelve al menú
    // Solo en el paso final (`fin`): los demás avanzan cuando el Taller confirma la acción (tutorial.ts, avanzar).
    // Siguiente mecánica (se oculta en la última), práctica normal del nivel de la mecánica y menú.
    const finB = [-104, 0, 104].map((x, k) => boton(x, k ? "boton_secundario" : "boton_primario", k ? 0xffffff : OSCURO, () => {
      const t = this.tut, id = t?.activo && esFin(t) ? t.id : null, m = id ? mecanica(id) : undefined;
      if (!id || !m) return;
      const sig = siguiente(id), ms = sig ? mecanica(sig) : undefined;
      if (k === 0 && sig && ms) void this.net.practicar(alias(), ms.nivel, true, false, sig);
      else if (k === 1) void this.net.practicar(alias(), m.nivel);
      else if (k === 2) void this.net.salir();
    }, 100));
    const titulo = letras(this, -150, -52, "", 2, PISTA), texto = letras(this, -150, -32, "", 2).setMaxWidth(300);
    // Esquema «paralelo» (solo en su paso): carril + rojo y − azul con dos luces entre ambos, cada una unida arriba al carril + y abajo al carril −.
    const r = (x: number, y: number, w: number, h: number, c: number) => this.add.rectangle(x, y, w, h, c);
    const esquema = this.add.container(98, -8, [
      r(0, -22, 76, 4, 0xe8423b), r(0, 22, 76, 4, 0x3b82f6),
      ...[-18, 18].flatMap((x) => [r(x, -11, 4, 18, 0xe8423b), r(x, 0, 14, 14, 0xffe27a).setStrokeStyle(2, 0xffffff), r(x, 11, 4, 18, 0x3b82f6)]),
      letras(this, 52, -22, "+", 2, 0xe8423b).setOrigin(0.5), letras(this, 52, 22, "-", 2, 0x3b82f6).setOrigin(0.5),
    ]).setVisible(false);
    caja.add([marco(this, 0, 0, "panel_oscuro", 328, 120), titulo, texto, esquema, ...saltarB.partes, ...finB.flatMap((b) => b.partes)]);
    const resaltes = [0, 1].map(() => marco(this, 0, 0, "recuadro_resaltado", 100, 100).setVisible(false).setDepth(890));
    this.tweens.add({ targets: resaltes, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    this.guia = { caja, titulo, texto, esquema, saltar: saltarB, fin: finB, resaltes, zonas: [saltarB, ...finB].map((b) => b.partes[2]) as Phaser.GameObjects.Zone[], chispa: this.chispa };
  }

  /** Qué señala Chispa. Tutorial: el objetivo del paso. Práctica: lo siguiente por hacer. Partidas (bot, 1v1, Oleadas): nada (sin pistas: justicia entre jugadores). */
  private objetivoSenal(p: Pantalla, z: ZonaView, placa: boolean): Objetivo | null {
    const t = this.tut;
    if (t?.activo) { const o = actual(t); return esFin(t) || o.libre ? null : o.objetivo; }
    if (!p.practica || p.oleadas) return null;
    if (z.reparada) return "check";
    const f = this.falta(z);
    if (placa) return f === "colocar" ? "gaveta" : f === "cablear" ? "pieza" : "check";
    if (conHueco(z.circuito, this.elegidas.get(this.clave()), z.reparada)) return "gaveta";
    return p.esperaHasta > Date.now() ? "multimetro" : "gaveta"; // en el enfriamiento, la luz del multímetro; luego, otra pieza
  }

  private pintarChispa(p: Pantalla, z: ZonaView, placa: boolean, fin: boolean, quemado: boolean) {
    const activo = !!this.tut?.activo, obj = fin ? null : this.objetivoSenal(p, z, placa);
    if (!activo) { // en el tutorial la expresión la pone pintarGuia
      this.exprBase = quemado ? "preocupada" : z.reparada ? "feliz" : obj ? "senalando" : "normal";
      if (Date.now() > this.chispaHasta) this.chispa.poner(this.exprBase);
    }
    if (p.eco && p.eco.n !== this.ecoVisto) {
      this.ecoVisto = p.eco.n;
      if (!activo) this.reaccionar(p, p.eco.tipo);
    }
  }

  /** Chispa reacciona al aviso del árbitro (racha, bono, fallo): ánimo y enfriamiento, nunca el contenido del pod. */
  private reaccionar(p: Pantalla, tipo: EcoTipo) {
    const m = reaccion(tipo, p.racha, Math.ceil(Math.max(0, p.esperaHasta - Date.now()) / 1000));
    this.chispa.poner(m.expr);
    this.chispa.decir(m.texto, 2800);
    if (m.expr === "feliz") this.chispa.animar();
    this.chispaHasta = Date.now() + 2800;
    window.setTimeout(() => { if (this.chispa.cont.active) this.chispa.poner(this.exprBase); }, 2900); // tiempo real
  }

  /** Flecha rebotando sobre el objetivo y chispitas que viajan de la mano de Chispa hasta ella. */
  private pintarSenal(obj: Objetivo | null, placa: boolean, cont: boolean) {
    const s = this.senal, P = this.ui.panel;
    const r = obj ? (placa && obj === "pieza" ? [P.x + 180, P.y + 92, 340, 252] : this.rectas(obj, placa, cont)[0]) : undefined;
    const clave = r ? r.join() : "";
    if (clave === s.clave) return;
    s.clave = clave;
    this.tweens.killTweensOf([s.flecha, ...s.chispitas]);
    s.c.setVisible(!!r);
    s.chispitas.forEach((c) => c.setAlpha(0));
    if (!r) return;
    const [cx, y, w, h] = r as [number, number, number, number], abajo = y < 200, x = obj === "gaveta" || obj === "check" ? cx + w / 2 - 36 : cx, // a la derecha: no tapa el texto de la gaveta
       fy = abajo ? y + h / 2 + 2 : y - h / 2 - 2; // objetivos del HUD: la flecha va debajo y apunta hacia arriba
    s.flecha.setOrigin(0.5, 1).setAngle(abajo ? 180 : 0).setPosition(x, fy);
    if (REDUCIDO) return;
    this.tweens.add({ targets: s.flecha, y: abajo ? fy + 8 : fy - 8, duration: 400, yoyo: true, repeat: -1 });
    const mx = this.chispa.cont.x + 16, my = this.chispa.cont.y - 10;
    s.chispitas.forEach((c, i) => {
      c.setPosition(mx, my);
      this.tweens.add({ targets: c, x, y: fy, alpha: { from: 1, to: 0.2 }, duration: 1000, delay: i * 120, repeat: -1, repeatDelay: 800 });
    });
  }

  /** Humo (bahía y gaveta, con alpha), aviso del sabotaje y pods limpios seguidos; todo lo manda el árbitro, aquí solo se pinta. */
  private crearSabotajes(escena: Bloque, panel: Bloque) {
    const humo = (c: Bloque, r: Recta) => {
      const fondo = this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0x4a566e, 0.92).setInteractive({ useHandCursor: true }).on("pointerdown", () => this.tocarHumo());
      const nube = this.add.container(0, 0, [fondo]);
      for (let i = 0; i < 7; i++) {
        const b = this.add.circle(r.x + 24 + ((i * 53) % (r.w - 48)), r.y + r.h * (0.25 + 0.5 * ((i * 37 % 10) / 10)), 22 + (i % 3) * 8, 0x93a3bd, 0.5);
        nube.add(b);
        if (!REDUCIDO) this.tweens.add({ targets: b, x: b.x + (i % 2 ? 14 : -14), duration: 1400 + i * 120, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      }
      nube.setVisible(false);
      c.add(nube);
      return { nube, fondo };
    };
    const a = humo(escena, HUMO_BAHIA), g = humo(panel, HUMO_GAVETA);
    const texto = letras(this, HUMO_BAHIA.x + HUMO_BAHIA.w / 2, HUMO_BAHIA.y + HUMO_BAHIA.h / 2, "", 2).setOrigin(0.5).setCenterAlign();
    a.nube.add(texto);
    // Aviso: franja sobre las rayas de la bahía (no tapa las pestañas, el HUD ni el CHECK).
    const fondoAviso = this.add.rectangle(0, 0, 344, 44, 0x8a2f3a, 0.96).setStrokeStyle(2, 0xffd23f);
    const titulo = letras(this, 0, -9, "", 2).setOrigin(0.5), ayuda = letras(this, 0, 10, "", 1.5, 0xe8f6ff).setOrigin(0.5);
    const aviso = this.add.container(180, 392, [fondoAviso, titulo, ayuda]).setDepth(12).setVisible(false);
    const pods = this.add.graphics().setDepth(20), etiqueta = letras(this, 294, 51, "SABOTAJE", 1.5, 0xe6ecff).setOrigin(1, 0.5).setDepth(20); // HUD, fila del rival
    this.sab = { humo: [a.nube, g.nube], fondos: [a.fondo, g.fondo], texto, aviso, fondoAviso, titulo, ayuda, pods, etiqueta };
  }

  private tocarHumo() {
    sonar("elegir");
    if (limpiaHumo(++this.humoToques)) this.humoLimpio = this.net.estado.sabotaje?.n ?? 0;
  }

  private mostrarHumo(on: boolean) {
    for (const f of this.sab.fondos) if (f.input) f.input.enabled = on;
    for (const c of this.sab.humo) {
      this.tweens.killTweensOf(c);
      if (on) { c.parentContainer?.bringToTop(c); /* por encima del pod, que se añade después */ c.setVisible(true).setAlpha(REDUCIDO ? 1 : 0); if (!REDUCIDO) this.tweens.add({ targets: c, alpha: 1, duration: 250 }); }
      else if (REDUCIDO) c.setVisible(false);
      else this.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => c.setVisible(false) });
    }
  }

  private pintarSabotaje(p: Pantalla, ahora: number) {
    const s = this.sab, rec = p.sabotaje, env = p.enviado;
    const hv = humoVisible(p, ahora, this.humoLimpio);
    if (hv && this.humoVisto !== rec!.n) { this.humoVisto = rec!.n; this.humoToques = 0; this.mostrarHumo(true); }
    else if (!hv && this.humoVisto) { this.humoVisto = 0; this.mostrarHumo(false); }
    if (hv) s.texto.setText(`¡HUMO!\nToca 3 veces para limpiar\n${this.humoToques}/${HUMO_TOQUES}`);
    // «Sin pista» empieza y termina sin un evento de pantalla propio: se repinta al cambiar.
    const sp = sinPista(p, ahora);
    if (sp !== this.sinPistaVisto) { this.sinPistaVisto = sp; this.pintar(p); }
    // Aviso: lo que sufres (mientras dura; el humo desaparece al limpiarlo) o, 3 s, lo que enviaste.
    const mio = rec && sabotajeActivo(p, ahora) && !(rec.tipo === "humo" && !hv), suyo = !mio && env && ahora < env.hasta;
    s.aviso.setVisible(!!(mio || suyo));
    if (mio) { s.fondoAviso.setFillStyle(0x8a2f3a, 0.96); s.titulo.setText(avisoRecibido(rec.tipo)); s.ayuda.setText(AYUDA[rec.tipo]); }
    else if (suyo) { s.fondoAviso.setFillStyle(0x1f6f8a, 0.96); s.titulo.setText(avisoEnviado(env.tipo)); s.ayuda.setText("Tu rival lo notará en su pantalla"); }
    // Pods limpios seguidos (0-3): al tercero, sabotaje.
    const ver = !!p.rival && !p.practica && !this.tut?.activo && p.fase === "taller";
    s.pods.clear(); s.etiqueta.setVisible(ver);
    if (!ver) return;
    for (let i = 0; i < PODS_LIMPIOS; i++) s.pods.fillStyle(i < p.limpios ? PISTA : 0x6b7599).fillRect(300 + i * 16, 45, 12, 12).lineStyle(2, OSCURO).strokeRect(300 + i * 16, 45, 12, 12);
  }

  /** Rayos de la racha (HUD, partidas y práctica): 1-3 despachos seguidos sin fallar; con 3, el bono listo. */
  private pintarRayos(p: Pantalla) {
    const { g, bono } = this.rayos, ver = !this.tut?.activo;
    g.clear();
    bono.setVisible(ver && p.racha >= 3);
    if (!ver) return;
    for (let i = 0; i < 3; i++) {
      const x = 12 + i * 18, y = 308;
      const rayo = puntos([x + 3, y - 10], [x - 6, y + 1], [x - 1, y + 1], [x - 4, y + 10], [x + 6, y - 2], [x + 1, y - 2]);
      g.fillStyle(i < p.racha ? PISTA : 0x6b7599).fillPoints(rayo, true).lineStyle(2, OSCURO).strokePoints(rayo, true);
    }
  }

  /** Fusible: al llegar el pod, el viejo cuelga ~2,4 s de un extremo del portafusible y cae fuera de pantalla. No bloquea el arrastre: el hueco se puede usar mientras tanto. */
  private fusibleColgando(z: ZonaView, elegida: string | undefined) {
    const clave = this.clave(), a = this.fusibleAnim;
    if (a && a.clave !== clave) { this.tweens.killTweensOf(a.c); a.c.destroy(); this.fusibleAnim = undefined; }
    if (REDUCIDO || z.circuito !== "fusible" || !conHueco(z.circuito, elegida, z.reparada) || this.fusibleVisto.has(clave)) return;
    this.fusibleVisto.add(clave);
    const c = this.add.container(130, 30, [this.add.rectangle(0, 5, 3, 10, 0x9aa4c0), img(this, 0, 10, "fusible_medio", 3).setOrigin(0.5, 0).setTint(0x4a4a52)]);
    this.ui.panel.add(c);
    this.fusibleAnim = { c, clave };
    const cae = () => this.tweens.add({ targets: c, x: 96, y: 640, angle: -70, duration: 700, ease: "Cubic.In", onComplete: () => { c.destroy(); if (this.fusibleAnim?.c === c) this.fusibleAnim = undefined; } });
    this.tweens.add({ targets: c, angle: { from: -9, to: 9 }, duration: 600, yoyo: true, repeat: 1, ease: "Sine.InOut", onComplete: cae });
    window.setTimeout(() => { if (c.active) c.destroy(); }, 5000); // tiempo real: pestaña oculta
  }

  /** Rectángulos (x, y, ancho, alto, en el lienzo) que resalta cada paso del tutorial. */
  private rectas(o: Objetivo, placa: boolean, cont: boolean): [number, number, number, number][] {
    const div = this.zonaActual()?.circuito === "divisor", P = this.ui.panel, E = this.ui.escena, fila = P.y + (placa ? 60 : 0) + 178, c = this.ui.contador.getBounds();
    const contador: [number, number, number, number] = [c.centerX, c.centerY, c.width + 16, c.height + 16];
    switch (o) {
      case "gaveta": return [placa ? [P.x + 180, P.y + 240, 220, 68] : [P.x + 180, P.y + 290, 358, 60]];
      case "tension": return [[P.x + (cont ? 326 : 36), fila - 4, 68, 64]]; // «Toca Continuidad» usa el mismo objetivo que Tensión
      case "pieza": return [div ? [P.x + MC.x + 30, P.y + MC.y + 10, 56, 68] : [P.x + 180, P.y + 44, 130, 92], [P.x + 180, fila, 110, 52]];
      case "carga": return [[P.x + 310, P.y + 76, 84, 118], [P.x + 180, fila, 110, 52]];
      case "cadena": { // la pieza localizada o, antes, toda la cadena
        const hs = huecosCadena(this.zonaActual()?.cadena?.length ?? 4), k = this.muertaLocalizada(), h = k ? hs[k - 1]! : null;
        return [h ? [P.x + h.x, P.y + 40, h.w + 10, 90] : [P.x + 200, P.y + 40, 300, 90], [P.x + 180, fila, 110, 52]];
      }
      case "contador": return [contador];
      case "multimetro": return [[P.x + 180, fila, 200, 64]];
      case "check": return [[P.x + 180, P.y + 340, 308, 52]];
      case "pestanas": { const a = this.ui.pestanas[0]!.getBounds(), b = this.ui.pestanas[3]!.getBounds(); return [[(a.left + b.right) / 2, a.centerY, b.right - a.left, a.height]]; }
    }
  }

  private pintarGuia(placa: boolean) {
    const g = this.guia, t = this.tut, activo = !!t?.activo, ex = activo ? expresionGuia(actual(t!).texto, esFin(t!), this.estTut()) : "normal", clave = activo ? `${t!.i}${placa}${ex}` : "";
    if (clave === this.guiaClave) return;
    this.guiaClave = clave;
    g.caja.setVisible(activo);
    this.leyenda.setVisible(!activo); // bajo la caja del tutorial quedaba ilegible
    if (!t || !activo) return g.resaltes.forEach((r) => r.setVisible(false));
    const paso = actual(t), { width, height } = this.scale.gameSize;
    g.titulo.setText(textoPaso(t));
    g.titulo.setFontSize(16); // el título cabe en 300 px, si no se achica
    if (g.titulo.width > 300) g.titulo.setFontSize(Math.max(8, Math.floor((16 * 300) / g.titulo.width)));
    g.texto.setText(paso.texto).setMaxWidth(paso.esquema ? 200 : 300);
    g.esquema.setVisible(!!paso.esquema);
    g.chispa.poner(ex);
    const fin = esFin(t);
    g.saltar.t.setText("Saltar tutorial");
    g.saltar.partes.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!fin));
    (g.saltar.partes[2] as Phaser.GameObjects.Zone).input!.enabled = !fin;
    g.fin.forEach((b, k) => {
      const ver = fin && !!mecanica(t.id) && (k > 0 || !!siguiente(t.id));
      b.t.setText(["Siguiente", "Práctica", "Menú"][k]!);
      b.partes.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(ver));
      (b.partes[2] as Phaser.GameObjects.Zone).input!.enabled = ver;
    });
    // Vertical: caja compacta (a 0,8) sobre la base de la bahía (y 294-396): deja libres pestañas, HUD, la placa (desde y 430), gaveta,
    // Probar y Despachar. Apaisado: bajo los paneles.
    const vertical = width <= height;
    g.caja.setScale(vertical ? 0.8 : 1).setPosition(width / 2, vertical ? 340 : 780);
    const rs = this.rectas(paso.objetivo, placa, paso.titulo === "Continuidad");
    g.resaltes.forEach((r, i) => { const x = rs[i]; r.setVisible(!!x); if (x) r.setPosition(x[0], x[1]).setSize(x[2] / 4, x[3] / 4); });
  }

  /** Medidor de aguja: veredicto del último «Probar» o, con el multímetro activo, la lectura (Nada/Parte/Toda o pasa/no pasa). */
  private pintarMedidor() {
    const u = this.ui, v = this.vistasVivas(this.net.estado)[this.zona], l = this.lectura;
    u.modos.forEach((m) => m.fondo.setTexture(m.modo === this.modo ? "boton_primario" : "boton_secundario"));
    const luz = this.modo ? undefined : luzValidacion(v); // undefined: lectura del modo activo; null: multímetro apagado (aún sin veredicto)
    u.fila.setAlpha(luz === null ? 0.4 : 1);
    this.simbolo.setVisible(false);
    u.aguja.clearTint();
    u.etiquetas.forEach((e) => e.setTint(GRIS));
    if (luz !== undefined) { // validación: apagado hasta colocar la pieza; luego verde / ámbar / rojo según el veredicto del árbitro
      u.etiquetas.forEach((e, i) => e.setText(i === 1 ? (luz ? TEXTO_LUZ[luz] : "Apagado") : ""));
      u.pasa.setVisible(false);
      if (luz) { u.etiquetas[1]!.setTint(COLOR_LUZ[luz]); u.aguja.setTint(COLOR_LUZ[luz]); }
      return u.aguja.setVisible(!!luz).setAngle(v?.aguja ? ANGULO[v.aguja] : 0);
    }
    const lv = this.modo && l && this.leida ? this.leida : null; // lectura interpretada: cifra con unidad + luz (✓ verde, ! ámbar, ✗ rojo)
    const cifra = lv ? `${lv.luz === "ambar" ? "! " : ""}${lv.cifra}` : "";
    const textos = this.modo === "tension" ? [TRAMO.nada.etiqueta, lv ? cifra : TRAMO.parte.etiqueta, TRAMO.toda.etiqueta] : ["", cifra, ""];
    u.etiquetas.forEach((e, i) => e.setText(textos[i]!));
    u.pasa.setVisible(this.modo === "continuidad" && !!l).setTexture(l?.pasa ? "icono_pasa" : "icono_no_pasa");
    const centro = u.etiquetas[1]!;
    this.simbolo.setVisible(this.modo === "tension" && lv?.luz !== undefined && lv.luz !== "ambar").setTexture(lv?.luz === "rojo" ? "icono_no_pasa" : "icono_pasa").setPosition(centro.x - centro.displayWidth / 2 - 14, centro.y);
    if (lv) { centro.setTint(COLOR_LUZ[lv.luz]); u.aguja.setTint(COLOR_LUZ[lv.luz]); }
    const tension = this.modo === "tension" && l?.fraccion !== undefined;
    u.aguja.setVisible(tension).setAngle(tension ? anguloTension(l.fraccion!) : 0);
  }

  /** Naves pendientes: cada una es un contenedor que entra deslizándose; al despachar las demás suben un lugar. */
  private colaNaves = new Map<number, Phaser.GameObjects.Container>();
  private pintarCola(numero: number, total: number) {
    const lista = cola(numero, total), primera = this.colaNaves.size === 0;
    for (const [n, c] of this.colaNaves) if (!lista.includes(n)) { this.colaNaves.delete(n); c.destroy(); }
    lista.forEach((n, i) => {
      const y = i * 26, ya = this.colaNaves.get(n);
      if (ya) { this.tweens.killTweensOf(ya); this.tweens.add({ targets: ya, y, duration: 250, ease: "Cubic.Out", onComplete: () => ya.setY(y) }); return; }
      const c = this.add.container(0, y, [letras(this, 262, 70, String(n), 2, GRIS), img(this, 278, 64, `${podDe(n).id}_mini_espera`, 2).setOrigin(0)]);
      this.ui.cola.add(c); this.colaNaves.set(n, c);
      if (REDUCIDO) return;
      const retraso = retrasoCola(i, primera);
      c.setX(120).setAlpha(0);
      this.tweens.add({ targets: c, x: 0, alpha: 1, duration: 450, delay: retraso, ease: "Back.Out", onComplete: () => c.setPosition(0, c.y).setAlpha(1) });
      // Tiempo real: una pestaña oculta frena los tweens; esto deja la nave en su sitio.
      setTimeout(() => { if (c.active) { this.tweens.killTweensOf(c); c.setPosition(0, i * 26).setAlpha(1); } }, retraso + 700);
    });
  }

  /** Cartel que aparece tras `retraso` ms, se queda `ms` y se desvanece (SCRUM-145). */
  private cartel(c: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, retraso: number, ms: number) {
    this.ui.escena.add(c);
    c.setAlpha(0).setDepth(940);
    this.tweens.add({ targets: c, alpha: 1, duration: 150, delay: retraso, hold: ms, yoyo: true, onComplete: () => c.destroy() });
    this.carteles.push({ c, hasta: Date.now() + retraso + ms + 300 });
  }

  /** Puerta de ~3,5 s al entrar un pod nuevo (no el primero ni tras el último): solo práctica normal de nivel 1/2; `?puertas=0` la apaga, `?puertas=1` la fuerza (pruebas). */
  private abrirPuerta(p: Pantalla) {
    const q = new URLSearchParams(location.search).get("puertas");
    const ok = q === "1" || (q !== "0" && p.practica && !this.net.tutorial && !p.oleadas);
    if (!ok || this.puertaViva || (p.nivel !== 1 && p.nivel !== 2)) return;
    const h = mostrarPuerta(this, generarPuerta(this.puertaSemilla, p.nivel, this.puertasVistas++), (a) => {
      this.puertaViva = null;
      if (a === null) return;
      this.puertaRacha = a ? this.puertaRacha + 1 : 0;
      if (a) this.flotar(`+10 · racha ${this.puertaRacha}`);
    });
    this.puertaViva = h;
  }

  /** Pod en la bahía armado por zonas; al cambiar de pod el anterior sale a la derecha y el nuevo entra. */
  private pintarPod(p: Pantalla) {
    const pod = p.pod!, num = p.oleadas || pod.numero <= p.total ? pod.numero : 0;
    if (num !== this.podNum) {
      const viejo = this.podC;
      if (viejo) this.tweens.add({ targets: viejo, x: 420, alpha: 0, duration: 450, ease: "Cubic.In", onComplete: () => viejo.destroy() });
      this.podC = num ? this.add.container(REDUCIDO ? POD_X : -400, POD_Y) : undefined;
      const nuevo = this.podC;
      if (nuevo && !REDUCIDO) {
        this.ui.escena.add(nuevo);
        const retraso = viejo ? 250 : 0;
        // Llega desde fuera de pantalla con un leve rebote (~1 s, ease-out).
        this.tweens.add({ targets: nuevo, x: POD_X, duration: 1000, ease: "Back.Out", easeParams: [0.8], delay: retraso, onStart: () => sonar("clic"), onComplete: () => nuevo.setX(POD_X) });
        setTimeout(() => { if (nuevo.active) { this.tweens.killTweensOf(nuevo); nuevo.setX(POD_X); } }, retraso + 1300); // tiempo real: pestaña oculta
      } else if (nuevo) this.ui.escena.add(nuevo);
      this.ui.bahia.play(num ? "bahia_ocupada" : "bahia");
      if (viejo) this.cartel(img(this, 180, 210, "cartel_reparado", 3), 0, CARTEL.reparadoMs);
      if (num) this.cartel(anim(this, 180, 210, "cartel_averia"), viejo ? CARTEL.averiaRetraso : 0, 1500);
      this.podNum = num;
      this.podDesde = Date.now();
      this.limpiarMedida();
      // El «¡Pod despachado!» ya cumplió: al entrar el pod nuevo vuelve el objetivo.
      if (viejo) this.despachoHasta = Date.now() + CARTEL.avisoDespachoMs;
      if (viejo && num) this.abrirPuerta(p); else if (!num) this.puertaViva?.cerrar();
    }
    if (!this.podC) return;
    const m = podDe(pod.numero);
    this.podC.removeAll(true);
    for (const zona of m.orden) {
      const estado = estadoZona(pod, zona as ZonaNombre, this.vistasVivas(p), sinPista(p, Date.now())), s = sprite(`${m.id}_${zona}_${estado}`)!;
      const o = s.offset ?? { x: 0, y: 0 };
      this.podC.add(img(this, o.x * K, o.y * K, s.nombre).setOrigin(0));
      if (estado === "averiado" || estado === "quemado") {
        const h = (s.puntos?.humo as { x: number; y: number } | undefined) ?? { x: s.ancho / 2, y: 0 };
        this.podC.add(anim(this, (o.x + h.x) * K, (o.y + h.y) * K, estado === "quemado" ? "humo_negro" : "humo"));
      }
    }
  }
}
