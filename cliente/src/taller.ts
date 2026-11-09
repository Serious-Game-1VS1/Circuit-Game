/**
 * Escena Taller con el arte del kit: pod nave en la bahía (entra y sale con tween), pestañas de las
 * 4 zonas, humo en la zona dañada, cola de pods, y el panel del circuito (debajo en móvil 360×800,
 * al lado en escritorio 1440×900). Solo pinta la Pantalla; la mecánica la decide el árbitro.
 */
import * as Phaser from "phaser";
import type { Circuito, Medida, ModoMedir, ZonaNombre, ZonaView } from "../../spike/src/protocol";
import type { Net } from "./net";
import { anim, cargarArte, img, letras, marco, pintarMontaje, toque } from "./arte";
import { modoBloqueado, anguloTension, AYUDA_USO, ayudaPrimerasVeces, COLOR_LUZ, LUZ_DIAL, lecturaLista, leerMedida, luzValidacion, TEXTO_LUZ, T as TM, textoMedida, textoModo, TRAMO, type LecturaVista, type Midiendo } from "./multimetro";
import { generarPuerta, mostrarPuerta } from "./puerta";
import { agujaEn, dibujarInsignia, dibujarPuntas, extremosPlaca, JACK, puntosMedida } from "./puntas";
import { avisoVivo, checkActivo, despachable, terminada, textoCheck, faltan, pistaDemo, reloj, tarjetaVisible, textoRival, type EcoTipo, type Falta, type Pantalla } from "./pantalla";
import { ahoraJuego, pausarJuego } from "./relojJuego";
import { crearChispa, expresionGuia, reaccion, type Chispa } from "./chispa";
import { AYUDA, avisoEnviado, avisoSabotajeVencido, avisoRecibido, HUMO_BAHIA, HUMO_GAVETA, HUMO_TOQUES, humoVisible, limpiaHumo, PODS_LIMPIOS, sabotajeActivo, sinPista, type Recta } from "./sabotaje";
import { alternarSilencio, desbloquear, silenciado, sonar } from "./audio";
import { arrastrable, dentro, generosa, type Toque } from "./arrastre";
import { casillas, DIAGNOSTICO, MAX_LLAMAS, puntosPod, rachaLlamas, textoGlobo, textoObjetivo, textoPod, tiempoPod } from "./progreso";
import { cargarPerfil, guardarPerfil, marcarTutorial, registrarTiempo, tutorialCompletado, ultimoAlias } from "./perfil";
import { velo, type Rect } from "./velo";
import { crearMano, type Mano } from "./mano";
import { cableDelCorto, cargasPuestas, conPlaca, faltaColocar, faltaCablear, montaje, textoCorto, todasPuestas, type Cable, type Puestas } from "./placa";
import { ayudaCables, Tablero } from "./tablero";
import { Tablero3 } from "./tablero3";
import { codificar, faltaPlaca3, VACIO, X0, type Montaje3 } from "./placa3";
import { QUEMADAS_OLEADAS } from "../../spike/src/arbiter/penalties";
import { conDoble, etiquetas, MEJORAS, medirMs, ofrecer } from "./mejoras";
import { mecanica, actual, adelantar, avanzar, esFin, guiaPartida, iniciar, manoDe, marcarBasicoVisto, permite, siguiente, type EstadoTut, type Objetivo, type Tutorial } from "./tutorial";
import { kFusible, huecosCadena, montajeCarga, montajeOpcion, montajePieza, punteado, cargas, cola, estadoZona, etiquetaCarga, nivelCarga, pestanasArte, podDe, sprite, spriteBateria, spriteCadena, spriteCarga, spritePieza, spriteTarjeta } from "./sprites";
import { AJUSTES_GAVETA, ocultaValor, botonesGaveta, CARTEL, conHueco, FRENA, LEYENDA_ZONAS, NOMBRE_ZONA, PISTA_DEMO, RETO, retrasoCola, textoOpcion, textoPiezaCadena, textoRotulo, textoVolts, type Aguja } from "./vista";

const K = 4;
/** Gaveta de piezas: centro y alto de los botones (>= 44 px táctiles; ver ajustarGolpes). Orden de lectura del panel: circuito → gaveta → multímetro → CHECK. */
const GY = 168, GH = 60;
/** Zonas de hueco (sin placa): el multímetro baja 78 px, bajo la gaveta (cuerpo en y 202-282). */
const FILA_HUECO = 78;
type Rect4 = [number, number, number, number];
/**
 * Bloques del panel en las zonas de hueco, en orden de lectura: [x centro, y centro, ancho, alto] en coordenadas del PANEL
 * (sumar panel.x/panel.y para el lienzo). Para el velo y la mano del tutorial; no se solapan entre sí.
 */
export function rectasTaller(dy = FILA_HUECO): Record<"circuito" | "gaveta" | "multimetro" | "check", Rect4> {
  return { circuito: [180, 69, 360, 138], gaveta: [180, GY, 358, GH], multimetro: [180, 164 + dy, 356, 80], check: [180, 340, 300, 48] };
}
/** Cian del contorno punteado de lo que se arrastra (distinto del amarillo de las pistas). */
const CIAN = 0x5ee6ff;
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
  private timerSalirBasico = 0;
  private ranura = RANURA;
  /** Pieza de la gaveta elegida con un toque (alternativa al arrastre): el siguiente toque en el hueco la coloca. */
  private sel: string | null = null;
  private dibujarCables!: (hueco: boolean) => void;
  /** Pieza elegida por zona, con clave "pod-zona": la gaveta empieza sin elección. */
  private elegidas = new Map<string, string>();
  /** Pieza que se acaba de quitar del hueco (vuelve a la gaveta): con Continuidad se mide suelta; sin penalización. */
  private retiradas = new Map<string, string>();
  /** Última elección mandada a probar por zona (como lastPieza del árbitro): igual a la actual = «sin cambios». */
  private probadas = new Map<string, string>();
  /** Cables de la placa por "pod-zona" (Cabina y Turbina). */
  private cables = new Map<string, Cable[]>();
  /** Piezas arrastradas a la placa por "pod-zona" (Cabina y Turbina); empiezan en la gaveta. */
  private puestas = new Map<string, Puestas>();
  /** Placa experta (nivel 3): montaje por "pod-zona" (piezas y cables); empieza vacío. */
  private montajes = new Map<string, Montaje3>();
  private montajeZona() { return this.montajes.get(this.clave()) ?? VACIO; }
  private filaDy(z = this.zonaActual()) { return z?.circuito === "placa3" ? 108 : z && conPlaca(z.circuito) ? 76 : FILA_HUECO; } // placa: el multímetro baja 76 px (su cuerpo queda bajo la fila D, sin tapar agujeros); hueco: bajo la gaveta
  /** Clave (pod-zona) en la que ya aparecieron la gaveta y el multímetro. */
  private aparecio = "";
  private modo: ModoMedir | null = null;
  private midiendo?: Midiendo;
  private puntasG!: Phaser.GameObjects.Graphics;
  private cancelada = -1;
  private senalTag!: Phaser.GameObjects.Container;
  private cartelMulti?: Phaser.GameObjects.Container;
  private sono = -1;
  private montajeBornes?: [[number, number], [number, number]];
  private lectura?: Medida;
  private leida?: LecturaVista;
  private previas = new Map<string, number>();
  private tramos = new Map<string, boolean>();
  private simbolo!: Phaser.GameObjects.Image;
  private tinteLectura = false;
  private avisoVisto: string | null = null; 
  private bloqueado = false;
  private hueco!: Phaser.GameObjects.Rectangle;
  private check!: { c: Bloque; fondo: Phaser.GameObjects.NineSlice; marca: Phaser.GameObjects.Graphics; texto: Letras };
  private avisoClave = "";
  private avisoLocal?: { texto: string; hasta: number };
  private podC?: Bloque;
  private podNum = 0;
  private carteles: { c: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; hasta: number }[] = [];
  private despachoHasta = 0;
  private puertaSemilla = Math.floor(Math.random() * 2 ** 32);
  private puertasVistas = 0;
  private puertaViva: { cerrar(): void } | null = null;
  private puertaRacha = 0;
  private reparadasVistas = 0;
  private despachadosVistos = 0;
  private hayMasVistas = 0;
  private diagVistos = 0;
  private sucio = false;
  private racha = 0;
  private podDesde = 0;
  private rivalCasillas!: Phaser.GameObjects.Graphics;
  private intento = false;
  private tut: Tutorial | null = null;
  private estTut(): EstadoTut | undefined {
    const z = this.zonaActual(), v = z && this.net.estado.vistas[z.zona], d = this.net.estado.despachados;
    if (!z) return { modo: null, medido: false, quemado: false, reparada: d > 0, despachados: d, pruebas: this.pruebas, medidas: this.medidas }; // pod ya despachado: el tutorial sigue hasta el cierre
    return { elegida: this.elegidas.get(this.clave()), modo: this.modo, medido: this.lectura?.modo === "tension",
      aguja: v?.aguja, quemado: !!v?.quemado, reparada: z.reparada, despachados: d, circuito: z.circuito, falta: this.falta(z),
      pruebas: this.pruebas, medidas: this.medidas, localizada: this.muertaLocalizada() !== null,
      ...(z.circuito === "placa3" && { piezas: this.montajeZona().piezas.map((x) => x.id), cables: this.montajeZona().cables.length }) };
  }
  private pruebas = 0;
  private chispa!: Chispa;
  private exprBase: "normal" | "feliz" | "preocupada" | "senalando" = "normal";
  private senal!: { c: Phaser.GameObjects.Container; flecha: Phaser.GameObjects.Sprite; chispitas: Phaser.GameObjects.Rectangle[]; clave: string };
  private rayos!: { g: Phaser.GameObjects.Graphics; bono: Letras };
  private ecoVisto = 0;
  private chispaHasta = 0;
  private sab!: { humo: Bloque[]; fondos: Phaser.GameObjects.Rectangle[]; texto: Letras; aviso: Bloque; fondoAviso: Phaser.GameObjects.Rectangle; titulo: Letras; ayuda: Letras; pods: Phaser.GameObjects.Graphics; etiqueta: Letras };
  private humoToques = 0;
  private humoLimpio = 0;
  private humoVisto = 0;
  private sinPistaVisto = false;
  private fusibleVisto = new Set<string>();
  private fusibleAnim?: { c: Phaser.GameObjects.Container; clave: string };
  private marcado = false;
  private leyenda!: Letras;
  private aliasPerfil() { return ultimoAlias().trim() || this.net.estado.alias?.trim() || "Aprendiz"; }
  private rancio(z: ZonaView) { const k = this.probadas.get(this.clave()); return k !== undefined && !z.reparada && this.eleccion(z) !== k; }
  private vistasVivas(p: Pantalla) { const z = this.zonaActual(); return z && this.rancio(z) ? Object.fromEntries(Object.entries(p.vistas).filter(([k]) => Number(k) !== z.zona)) : p.vistas; }
  private medidas = 0;
  private vistasVistas = new Map<string, unknown>();
  private guiaClave = "";
  private salirB!: { marco: Phaser.GameObjects.GameObject; texto: Phaser.GameObjects.BitmapText; base: Phaser.GameObjects.Zone; si: Phaser.GameObjects.Zone; no: Phaser.GameObjects.Zone; panel: Phaser.GameObjects.GameObject[] };
  private salirPide = 0;
  private golpe = 48;
  private guia!: { caja: Bloque; esquema: Phaser.GameObjects.Container; saltar: BotonGuia; fin: BotonGuia[]; zonas: Phaser.GameObjects.Zone[]; resaltes: Phaser.GameObjects.NineSlice[]; chispa: Chispa;
    partida: { caja: Bloque } };
  private guiaP: { pasos: { titulo: string; texto: string; obj: Objetivo; cont: boolean }[]; i: number } | null = null;
  /** Velo del tutorial y de la guía (rectángulos que oscurecen y tragan toques fuera del foco), mano y su fantasma. */
  private veloR: Phaser.GameObjects.Zone[] = [];
  private veloG?: Phaser.GameObjects.Graphics;
  private veloClave = "";
  private mano!: Mano;
  private manoFant?: Phaser.GameObjects.Container;
  private manoClave = "";
  /** Instante en que un toque dentro del foco escondió la mano (0 = visible); vuelve a los 4 s sin progreso. */
  private manoOculta = 0;
  private saleBasico = false;
  private guiaVistos: string[] = [];
  private multi!: { cta: Letras; ayuda: Bloque; prox: Letras };
  private apagado = false;
  private ayudaMulti(ver: boolean) { sonar("clic"); this.multi.ayuda.setVisible(ver); }
  private ui!: {
    escena: Bloque; panel: Bloque; estado: Letras; rival: Letras; salir: Phaser.GameObjects.Zone; reloj: Letras; contador: Phaser.GameObjects.Image;
    podT: Letras; llamas: Phaser.GameObjects.Sprite[]; mejorasT: Letras;
    pestanas: Phaser.GameObjects.Image[]; globo: Letras; bocadillo: Phaser.GameObjects.Image; cola: Bloque; bahia: Phaser.GameObjects.Sprite;
    circuito: Bloque; carga: Phaser.GameObjects.Image[]; aguja: Phaser.GameObjects.Image; aviso: Letras; gavetaC: Bloque;
    opciones: { fondo: Phaser.GameObjects.NineSlice; zona: Phaser.GameObjects.Zone; icono: Phaser.GameObjects.Container; clave: string; texto: Letras; nombre: Letras; borde: Phaser.GameObjects.Graphics }[]; golpes: Phaser.GameObjects.Zone[];
    tarjeta: Bloque; cables: Phaser.GameObjects.Graphics; tablero: Tablero; tablero3: Tablero3; fila: Bloque; etiquetas: Letras[];
    huecos: Phaser.GameObjects.Zone[];
    modos: { modo: ModoMedir; fondo: Phaser.GameObjects.NineSlice; icono: Phaser.GameObjects.Image; rotulo: Letras }[]; pasa: Phaser.GameObjects.Image; zonasMedir: Phaser.GameObjects.Zone[];
    flecha: Phaser.GameObjects.Sprite; resalteGaveta: Phaser.GameObjects.NineSlice; resalteCheck: Phaser.GameObjects.NineSlice;
    flechaPlaca: Phaser.GameObjects.Sprite;
    resalteRanura: Phaser.GameObjects.NineSlice;
  };

  constructor(private readonly net: Net) { super("Taller"); }

  private clave() { return `${this.net.estado.pod?.numero}-${this.zona}`; }
  private cablesZona() {
    const k = this.clave();
    if (!this.cables.has(k)) this.cables.set(k, []);
    return this.cables.get(k)!;
  }
  private puestasZona() {
    const k = this.clave();
    if (!this.puestas.has(k)) this.puestas.set(k, {});
    return this.puestas.get(k)!;
  }
  private eleccion(z: ZonaView): string | undefined {
    if (z.circuito === "placa3") return this.montajeZona().piezas.length ? codificar(this.montajeZona()) : undefined;
    if (!conPlaca(z.circuito)) return this.elegidas.get(this.clave());
    if (!todasPuestas(this.puestasZona())) return undefined; // placa incompleta: no se puede probar ni medir
    const m = montaje(this.cablesZona(), cargasPuestas(this.puestasZona()));
    return m && z.opciones.includes(m) ? m : undefined;
  }
  private falta(z: ZonaView): Falta {
    if (z.circuito === "placa3") return this.montajeZona().piezas.length ? null : "colocar";
    if (!conPlaca(z.circuito)) return this.eleccion(z) ? null : "elegir";
    return !todasPuestas(this.puestasZona()) ? "colocar" : this.eleccion(z) ? null : "cablear";
  }
  private avisar(texto: string) { this.avisoLocal = { texto, hasta: Date.now() + 2600 }; }
  private limpiarMedida() { this.lectura = this.leida = this.midiendo = undefined; this.puntasG?.clear(); }
  /** Lo que dura esta medición: la Medida del árbitro (con su seq) manda; antes de que llegue, el coste previsto. */
  private durMedir(p: Pantalla, m: Midiendo) { return (p.medida?.seq === m.seq ? p.medida.medirMs : undefined) ?? m.ms ?? medirMs(this.net.mejoras); }
  private medir(punto: string) {
    const z = this.zonaActual(), modo = this.modo;
    if (!z || !modo) return;
    if (modoBloqueado(z.circuito, modo, this.tensionLibre())) { this.modo = null; this.pintar(this.net.estado); return this.avisar(TM.soloContinuidad); }
    if (this.midiendo) return this.avisar(AYUDA_USO.sigue); // misma regla que el árbitro («el multímetro sigue midiendo»); la animación sigue sin reiniciarse
    const puesta = this.eleccion(z);
    // Continuidad: sin tensión y con la pieza fuera (placa de cables y protoboard miden con su montaje). Cadena: el hueco no puede llevar repuesto.
    const aislar = modo === "continuidad" && !conPlaca(z.circuito) && z.circuito !== "placa3";
    if (aislar && puesta && (z.circuito !== "cadena" || punto === `t${puesta[0]}`)) return this.avisar(TM.quitaPieza); // el árbitro también lo rechaza, pero sin ir a la red
    const fuera = aislar && z.circuito !== "cadena";
    const pieza = fuera ? (punto === "pieza" ? this.retiradas.get(this.clave()) : undefined) ?? "ninguna"
      : puesta ?? (z.circuito === "cadena" ? "ninguna" : z.circuito === "placa3" ? "|" : undefined); // placa experta vacía: se mide igual // cadena: sin repuesto puesto se mide la cadena tal cual
    if (!pieza) return this.avisar(conPlaca(z.circuito) ? TM.sinMontaje : TM.sinEleccion);
    this.lectura = undefined;
    const p = this.net.estado, ms = p.proxMedir?.[z.zona] ?? p.medirBase;
    this.midiendo = { seq: this.net.medir(z.zona, pieza, modo, punto, fuera), desde: ahoraJuego(), punto, ...(ms !== undefined && { ms }) };
  }
  private mostrarCartelMulti(ms: number) {
    const z = this.zonaActual();
    if (!z || conPlaca(z.circuito) || z.circuito === "placa3" || this.cartelMulti) return;
    const flecha = anim(this, 0, 0, "flecha_guia", 2).setOrigin(0.5, 1), alto = flecha.displayHeight, dy = this.filaDy(z); // apunta al cuerpo del multímetro (bajo la gaveta)
    const c = this.cartelMulti = this.add.container(180, dy, [
      this.add.rectangle(0, 106 - alto - 16, 252, 22, OSCURO, 0.94).setStrokeStyle(2, PISTA), letras(this, 0, 106 - alto - 16, AYUDA_USO.cartel, 1.5, 0xffffff).setOrigin(0.5), flecha.setPosition(0, 120),
    ]);
    this.ui.panel.add(c);
    if (!REDUCIDO) this.tweens.add({ targets: flecha, y: 127, duration: 400, yoyo: true, repeat: -1 });
    window.setTimeout(() => this.quitarCartelMulti(c), ms); // tiempo real
  }
  private quitarCartelMulti(c = this.cartelMulti) {
    if (!c) return;
    if (c.active) { this.tweens.killTweensOf(c.list); c.destroy(); }
    if (this.cartelMulti === c) this.cartelMulti = undefined;
  }


  private pintarPuntas(p: Pantalla, z: ZonaView | undefined, ahora: number, juego: number) {
    const m = this.midiendo, g = this.puntasG, u = this.ui;
    if (!m || !z || !this.modo) return void g.clear();
    if (humoVisible(p, juego, this.humoLimpio)) this.cancelada = m.seq; 
    const ml = p.medida?.seq === m.seq ? p.medida : undefined;
    if (this.cancelada === m.seq) { g.clear(); return void (this.modo === "tension" && u.aguja.setVisible(true).setAngle(Math.sin(ahora / 90) * 50)); }
    const dy = u.fila.y, placa = conPlaca(z.circuito), origen = u.tablero.c, p3 = z.circuito === "placa3" ? u.tablero3.puntasPanel() : null;
    if (z.circuito === "placa3" && !p3) return void g.clear();
    const k = placa ? cargasPuestas(this.puestasZona()).find((c) => c.punto === m.punto) : undefined;
    const { rojo, negro } = puntosMedida({ circuito: z.circuito, punto: m.punto, modo: this.modo, cadenaN: z.cadena?.length, bornes: this.montajeBornes, cargas: cargas(z.circuito), placa: p3 ?? (k ? extremosPlaca(k.a, k.b, origen) : null) });
    const f = dibujarPuntas(g, { transcurrido: juego - m.desde, medirMs: this.durMedir(p, m), reducido: REDUCIDO, rojo, negro, jackRojo: { x: JACK.rojo.x, y: JACK.rojo.y + dy }, jackNegro: { x: JACK.negro.x, y: JACK.negro.y + dy } });
    if (f.fase === "fin") return;
    const objetivo = !ml ? null : ml.modo === "tension" ? anguloTension(ml.fraccion ?? 0) : ml.pasa ? 50 : -50;
    if (this.modo === "tension" || ml) u.aguja.setVisible(true).setAngle(agujaEn(f.fase, f.t, objetivo, ahora));
    if (ml && f.fase === "contacto" && f.t > 0.3 && ml.modo === "continuidad" && ml.pasa && this.sono !== m.seq) { this.sono = m.seq; sonar("beep"); } // continuidad que pasa: pitido corto
    if (ml && f.fase === "retirada") { 
      const luz = ml.dial ? LUZ_DIAL[ml.dial] : "gris";
      u.aguja.setTint(COLOR_LUZ[luz]);
      dibujarInsignia(g, 180, 131 + dy, luz, COLOR_LUZ[luz]);
    }
  }

  private medirPieza(punto: string) {
    const z = this.zonaActual();
    if (!z || conPlaca(z.circuito) || !this.modo) return;
    if (z.circuito === "invertido" && punto === "pieza") return this.avisar("Eso es la resistencia. Toca el LED, a la derecha."); // el centro solo muestra cómo queda el LED
    this.medir(punto);
  }
  private devolver() {
    const z = this.zonaActual(), k = this.clave();
    if (!z || z.reparada || !this.elegidas.has(k)) return;
    sonar("clic");
    this.retiradas.set(k, this.elegidas.get(k)!);
    this.elegidas.delete(k); this.limpiarMedida();
    this.pintar(this.net.estado);
  }
  /** Cadena: hueco (1..n) que el multímetro dijo que no pasa y aún no se ha reemplazado; null si no hay o no es cadena. */
  private muertaLocalizada(): number | null {
    const z = this.zonaActual();
    if (z?.circuito !== "cadena" || z.reparada) return null;
    const k = Number(this.elegidas.get(this.clave())?.[0]) || 0;
    for (let i = 1; i <= z.cadena!.length; i++) if (i !== k && this.tramos.get(`${this.clave()}|t${i}`) === false) return i;
    return null;
  }
  /** Tensión en la cadena: libre en multijugador y desde el nivel 2. */
  private tensionLibre() { return this.net.enLinea || (this.net.estado.pod?.nivel ?? 1) >= 2; }
  /** Pieza elegida del circuito; el fusible de nivel 2 escala con sus amperios y, tras «poco» (se fundió), se ve más grande, oscuro y con el hilo roto. */
  private fusiblePuesto(z: ZonaView, elegida: string | undefined, v: { aguja: string | null } | undefined, pieza: string) {
    if (z.circuito !== "fusible" || !elegida) return [img(this, 180, 34, pieza).setOrigin(0.5)];
    const fundido = v?.aguja === "poco", k = kFusible(elegida) + 1 + (fundido ? 0.6 : 0), f = img(this, 180, 34, pieza, k).setOrigin(0.5);
    return fundido ? [f.setTint(0x555555), this.add.rectangle(180, 34, 6, k * 3, 0x0b1020)] : [f];
  }
  private zonaActual() {
    const zonas = this.net.estado.pod?.zonas ?? [];
    return zonas.find((x) => x.zona === this.zona) ?? zonas[0];
  }

  preload() { cargarArte(this); }

  create() {
    this.salirPide = 0;
    window.clearTimeout(this.timerSalirBasico);
    const net = this.net, an = false; 
    const { width, height } = this.scale.gameSize;
    this.scale.setGameSize(an ? 1440 : 360, an ? 900 : 800);
    const antes = document.body.style.background;
    document.body.style.background = `#1e1838 url(arte/taller/fondo_taller.png) repeat-x center / auto 100%`;
    document.body.style.imageRendering = "pixelated";
    this.events.once("shutdown", () => { window.clearTimeout(this.timerSalirBasico); this.scale.setGameSize(width, height); document.body.style.background = antes; document.body.style.imageRendering = ""; });
    this.cameras.main.setRoundPixels(true);
    img(this, 0, 0, an ? "fondo_taller_ancho" : "fondo_taller").setOrigin(0);
    img(this, 0, 0, an ? "hud_barra_ancho" : "hud_barra").setOrigin(0);
    img(this, 22, 20, "icono_reloj", 2);
    const relojT = letras(this, 36, 12, "", 2);
    const estado = letras(this, 86, 12, "", 2);
    const contador = img(this, an ? 1440 - 70 : 296, 20, "contador_pods_0", 2);
    img(this, 22, 52, "icono_rival", 2);
    const rival = letras(this, 36, 44, "", 2, 0xe6ecff); 
    
    const salir = toque(this, 180, 58, 360, 28, () => { if (net.estado.practica) void net.salir(); });
    
    const sx = an ? 1440 - 70 : 326;
   
    const pedir = (v: boolean) => { this.salirPide = v ? Date.now() + 4000 : 0; this.pintarSalir(net.estado); };
    
    const D = 1100, confirma = [this.add.rectangle(253, 52, 206, 44, 0x1b2132, 1).setStrokeStyle(2, 0xffd23f).setDepth(D), letras(this, 202, 52, "¿Salir?", 2).setOrigin(0.5).setDepth(D + 1),
      marco(this, 272, 52, "boton_secundario", 48, 30, 2).setDepth(D + 1), letras(this, 272, 52, "SÍ", 2).setOrigin(0.5).setDepth(D + 2),
      marco(this, 332, 52, "boton_secundario", 48, 30, 2).setDepth(D + 1), letras(this, 332, 52, "NO", 2).setOrigin(0.5).setDepth(D + 2)];
    const alto = (z: Phaser.GameObjects.Zone) => z.setDepth(D + 3);
    this.salirB = { marco: marco(this, sx, 52, "boton_secundario", 56, 30, 2), texto: letras(this, sx, 52, "Salir", 1.5).setOrigin(0.5),
      base: toque(this, sx, 52, 56, 44, () => { if (net.estado.practica) void net.salir(); else pedir(true); }),
      si: alto(toque(this, 272, 52, 48, 44, () => void net.abandonar())), no: alto(toque(this, 332, 52, 48, 44, () => pedir(false))), panel: confirma };

   
    const escena = this.add.container(an ? 200 : 0, an ? 290 : 72);
    const pestanas = [0, 1, 2, 3].map((i) => img(this, 46 + i * 90, 30, "pestana_radar_inactiva").setOrigin(0.5)
      .setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        const pod = net.estado.pod, t = pod && pestanasArte(pod, this.zona)[i];
        if (t?.zona != null && t.zona !== this.zona) { this.zona = t.zona; this.limpiarMedida(); net.limpiarAviso(); this.pintar(net.estado); }
      }));
    const globo = letras(this, 22, 72, "", 2, OSCURO).setMaxWidth(190);
    const colaC = this.add.container(0, 0);
    this.colaNaves = new Map(); 
    const bahia = anim(this, 180, BAHIA_Y, "bahia_ocupada");
    const podT = letras(this, 12, 274, "", 2, GRIS);
    const llamas = Array.from({ length: MAX_LLAMAS }, (_, i) => anim(this, 150 + i * 26, 282, "llama_turbo_cian", 2).setAlpha(0.35));
    const mejorasT = letras(this, 12, 252, "", 2, PISTA); 
    const bocadillo = img(this, 8, 62, "globo_sintoma", 3).setOrigin(0);
    const leyenda = this.leyenda = letras(this, 180, 334, LEYENDA_ZONAS, 2, GRIS).setOrigin(0.5, 0); 
    escena.add([...pestanas, bocadillo, globo, colaC, bahia, podT, mejorasT, ...llamas, leyenda]);
    this.rivalCasillas = this.add.graphics(); 
    this.chispa = crearChispa(this, 28, 72 + 218, 2, "normal", { ancho: 230 });
    this.chispa.cont.setDepth(20);
    const flechaS = anim(this, 0, 0, "flecha_guia", 2), chispitas = [0, 1, 2].map((i) => this.add.rectangle(0, 0, 6 - i, 6 - i, PISTA).setAlpha(0));
    this.senalTag = this.add.container(0, 0, [this.add.rectangle(0, 0, 150, 20, OSCURO, 0.92).setStrokeStyle(2, PISTA), letras(this, 0, 0, AYUDA_USO.senal, 1.5, PISTA).setOrigin(0.5)]).setVisible(false);
    this.senal = { c: this.add.container(0, 0, [...chispitas, flechaS, this.senalTag]).setDepth(895).setVisible(false), flecha: flechaS, chispitas, clave: "" };
    // Rayos de la racha (3 despachos seguidos sin fallar = bono de enfriamiento reducido), justo bajo Chispa.
    this.rayos = { g: this.add.graphics().setDepth(5), bono: letras(this, 30, 327, "BONO", 2, PISTA).setOrigin(0.5).setDepth(5).setVisible(false) };

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
    const medidor = img(this, 180, 178, "medidor_fondo", 2).setOrigin(0.5);
    const aguja = img(this, 180, medidor.y - 22 + 40, "medidor_aguja", 2).setVisible(false);
    const pasa = img(this, 180, 172, "icono_pasa", 3).setOrigin(0.5).setVisible(false);
    this.simbolo = img(this, 0, 146, "icono_pasa", 1.5).setOrigin(0.5).setVisible(false); // ✓ / ✗ junto a la cifra de tensión
    const etiquetas = [letras(this, 136, 182, "", 2, GRIS).setOrigin(1, 0.5), letras(this, 180, 146, "", 2, GRIS).setOrigin(0.5), letras(this, 224, 182, "", 2, GRIS).setOrigin(0, 0.5)];
    const modos = (["tension", "continuidad"] as const).map((modo, i) => {
      const x = i ? 326 : 34;
      const fondo = marco(this, x, 178, "boton_secundario", 48, 48).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        if (modoBloqueado(this.zonaActual()?.circuito, modo, this.tensionLibre())) return this.avisar(TM.soloContinuidad);
        this.modo = this.modo === modo ? null : modo;
        this.limpiarMedida();
        this.pintar(net.estado);
      });
      const rotulo = letras(this, i ? 354 : 6, 146, i ? TM.continuidad : TM.tension, 1.5, GRIS).setOrigin(i, 0.5);
      return { modo, fondo, icono: img(this, x, 178, `multimetro_modo_${modo}`, 2).setOrigin(0.5), rotulo };
    });
    const cta = letras(this, 180, 146, AYUDA_USO.encender, 1.5, PISTA).setOrigin(0.5).setCenterAlign().setVisible(false);
    const ayudaB = [marco(this, 88, 146, "boton_secundario", 24, 24), letras(this, 88, 146, "?", 2).setOrigin(0.5),
      toque(this, 88, 146, 44, 44, () => { if (this.ui.fila.visible && !this.multi.ayuda.visible) this.ayudaMulti(true); })];
    // Carcasa del multímetro (cuerpo oscuro con borde amarillo) y sus dos jacks: roja (+) y negra (COM), de donde salen las puntas.
    const cuerpo = this.add.graphics();
    cuerpo.fillStyle(0x232a42, 1).fillRoundedRect(76, 124, 208, 80, 10).lineStyle(2, 0xd9a21b, 1).strokeRoundedRect(76, 124, 208, 80, 10);
    for (const [j, color] of [[JACK.rojo, 0xff4a4a], [JACK.negro, 0x0b0d14]] as const) cuerpo.fillStyle(color, 1).fillCircle(j.x, j.y, 6).lineStyle(2, 0xf4f7ff, 1).strokeCircle(j.x, j.y, 6);
    const jacks = [letras(this, JACK.rojo.x + 10, JACK.rojo.y, "+", 1.5, 0xff8a8a).setOrigin(0, 0.5), letras(this, JACK.negro.x - 10, JACK.negro.y, "COM", 1.5, 0xc9d2ea).setOrigin(1, 0.5)];
    const prox = letras(this, 190, 132, "", 1.5, 0xd9a21b).setOrigin(0.5); // coste de la próxima medida (solo en competitivo, si crece)
    const fila = this.add.container(0, 0, [cuerpo, medidor, aguja, pasa, this.simbolo, ...etiquetas, ...jacks, cta, prox, ...modos.flatMap((m) => [m.fondo, m.icono, m.rotulo]), ...ayudaB]);
    this.puntasG = this.add.graphics(); 
    const ayuda = this.add.container(0, 0, [
      this.add.zone(180, 177, 360, 356).setInteractive().on("pointerdown", () => this.ayudaMulti(false)),
      marco(this, 180, 177, "panel_oscuro", 344, 340),
      letras(this, 180, 38, AYUDA_USO.titulo, 2, PISTA).setOrigin(0.5),
      letras(this, 28, 62, AYUDA_USO.lineas.join("\n\n"), 2).setMaxWidth(304),
      marco(this, 180, 328, "boton_primario", 150, 32), letras(this, 180, 328, AYUDA_USO.cerrar, 2, OSCURO).setOrigin(0.5),
    ]).setVisible(false).setPosition(panel.x, panel.y).setDepth(960); // fuera del panel: por encima de la señal y la guía
    this.multi = { cta, ayuda, prox };
    // Fuera de la placa se mide tocando la pieza de la gaveta o la carga del dibujo.
    // La pieza puesta no usa pointerdown: se arrastra fuera del hueco (o se toca) para devolverla, y con el multímetro encendido el toque mide.
    const medirToque = (x: number, y: number, w: number, h: number, punto: (ly: number) => string, propio = false) => {
      const zona = this.add.zone(x, y, w, h).setInteractive();
      if (!propio) zona.on("pointerdown", (_p: unknown, _lx: number, ly: number) => { if (this.modo) this.medirPieza(punto(ly)); });
      return zona;
    };
    const zonasMedir = [
      medirToque(180, 44, 120, 84, () => "pieza", true),
      medirToque(310, 76, 72, 110, (ly) => (this.zonaActual()?.circuito === "cabina" && ly > 55 ? "carga2" : "carga1")),
    ];
    const huecos = [0, 1, 2, 3].map(() => this.add.zone(0, 0, 58, 76).setInteractive({ useHandCursor: true }));
    const tablero = new Tablero(this, 30, -28, {
      cambio: (c) => { sonar("cable"); this.cables.set(this.clave(), c); this.limpiarMedida(); this.net.limpiarAviso(); this.pintar(net.estado); },
      poner: (pz) => { sonar("pieza"); this.puestas.set(this.clave(), pz); this.limpiarMedida(); this.net.limpiarAviso(); this.pintar(net.estado); },
      aviso: (t) => this.avisar(t),
      medir: () => (this.modo ? (punto) => this.medir(punto) : null),
      bloqueado: () => !!this.zonaActual()?.reparada,
    });
    const tablero3 = new Tablero3(this, X0, 2, {
      cambio: (m) => { sonar("pieza"); this.montajes.set(this.clave(), m); this.limpiarMedida(); this.net.limpiarAviso(); this.pintar(net.estado); },
      aviso: (t) => this.avisar(t),
      medir: () => (this.modo ? (punto) => this.medir(punto) : null),
      bloqueado: () => !!this.zonaActual()?.reparada,
      gaveta: (g) => { sonar("clic"); if (g !== "medir") this.modo = null; this.limpiarMedida(); this.pintar(net.estado); },
    });
    const aviso = letras(this, 180, 286, "", 2).setOrigin(0.5, 0).setCenterAlign().setMaxWidth(340); // bajo el multímetro, sobre CHECK
    // Hasta 4 botones (el modo demo ofrece las 4 resistencias); pintar() los reparte según cuántas opciones haya.
    // Cada pieza se ARRASTRA hasta la ranura del circuito (resaltada); un toque la pone directo (accesibilidad).
    const resalteRanura = marco(this, RANURA.x, RANURA.y, "recuadro_resaltado", RANURA.w, RANURA.h).setVisible(false);
    const enRanura = (p: Toque) => { const v = panel.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY); return dentro(generosa(this.ranura), v.x, v.y); };
    const huecoEn = (p: Toque): number | null => {
      const z = this.zonaActual();
      if (z?.circuito !== "cadena") return null;
      const v = panel.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY); // el hueco más cercano dentro del área generosa
      let k = -1, mejor = Infinity;
      huecosCadena(z.cadena!.length).forEach((h, i) => { const dd = Math.hypot(h.x - v.x, h.y - v.y); if (dentro(generosa(h), v.x, v.y) && dd < mejor) { k = i; mejor = dd; } });
      return k < 0 ? null : k + 1;
    };
    const fantasmaPuesta = () => { const z = this.zonaActual()!; return this.fantasma(z.circuito, this.eleccion(z) ?? this.retiradas.get(this.clave()) ?? z.opciones[0]!); };
    const quitable = (hueco?: number) => () => {
      const z = this.zonaActual();
      return !!z && !z.reparada && !conPlaca(z.circuito) && !!this.elegidas.get(this.clave()) && (hueco ? z.circuito === "cadena" && Number(this.elegidas.get(this.clave())![0]) === hueco : z.circuito !== "cadena");
    };
    // Coloca la pieza `o` (cadena: en el hueco `hueco`). Sirve al soltar un arrastre y al «tocar pieza, tocar hueco».
    const elegir = (o: string, hueco?: number) => {
      const jugada = hueco ? `${hueco}:${o}` : o; // cadena: «hueco:repuesto»
      const no = permite(this.tut, { arrastrar: o }, this.estTut());
      if (no) { this.avisar(no); return false; }
      if (hueco && this.tut?.activo && this.muertaLocalizada() !== hueco) { this.avisar("Suéltalo en la pieza roja con «?»"); return false; }
      // soltar = SOLO colocar: se puede cambiar de pieza y medir con el multímetro cuantas veces se quiera; el test (y su coste) va con CHECK
      sonar("elegir");
      if (this.elegidas.get(this.clave()) !== jugada) this.limpiarMedida();
      this.elegidas.set(this.clave(), jugada);
      if (hueco && this.tramos.delete(`${this.clave()}|t${hueco}`)) this.avisar(`Mide el hueco ${hueco} sin repuesto, o pulsa CHECK`); // la marca era de la pieza vieja
      this.retiradas.delete(this.clave());
      this.sel = null;
      this.pintar(net.estado); return true;
    };
    arrastrable(this, zonasMedir[0]!, {
      puede: () => !!this.sel || quitable()() || (this.modo === "continuidad" && !conPlaca(this.zonaActual()?.circuito ?? "led") && this.zonaActual()?.circuito !== "cadena" && this.zonaActual()?.circuito !== "placa3" && !this.zonaActual()?.reparada),
      fantasma: fantasmaPuesta, sobre: (p) => void resalteRanura.setVisible(!!p && !!this.elegidas.get(this.clave())).setAlpha(p && enRanura(p) ? 1 : 0.45),
      soltar: (p) => { if (enRanura(p)) return false; this.devolver(); return true; },
      tocar: () => { if (this.sel) elegir(this.sel); else if (this.modo === "continuidad" && this.elegidas.get(this.clave())) { this.devolver(); this.avisar(TM.quitada); } else if (this.modo) this.medirPieza("pieza"); else this.devolver(); },
    });
    huecos.forEach((h, i) => arrastrable(this, h, {
      puede: () => quitable(i + 1)() || !!this.sel || (!!this.modo && this.zonaActual()?.circuito === "cadena" && !this.zonaActual()?.reparada), fantasma: fantasmaPuesta, sobre: () => undefined,
      soltar: (p) => { if (huecoEn(p) === i + 1 || !this.elegidas.get(this.clave())) return false; this.devolver(); return true; },
      tocar: () => {
        const z = this.zonaActual();
        if (z?.circuito !== "cadena" || z.reparada) return;
        if (this.sel) return void elegir(this.sel, i + 1);
        const aqui = this.elegidas.get(this.clave())?.[0] === String(i + 1);
        if (this.modo === "continuidad" && aqui) { this.devolver(); this.avisar(TM.quitada); } // el repuesto de ese hueco se quita para medirlo
        else if (this.modo) this.medir(`t${i + 1}`); else if (aqui) this.devolver(); else this.avisar(TM.ayuda);
      },
    }));
    const opciones = [0, 1, 2, 3].map((i) => {
      const fondo = marco(this, 0, GY, "boton_secundario", 104, GH);
      const zona = this.add.zone(0, GY, 104, GH).setInteractive({ useHandCursor: true }); // área táctil aparte: crece con ajustarGolpes()
      const pieza = () => { const z = this.zonaActual(); return z && !z.reparada ? z.opciones[i] : undefined; };
      arrastrable(this, zona, {
        puede: () => !!pieza(),
        fantasma: () => this.fantasma(this.zonaActual()!.circuito, pieza()!),
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
        tocar: () => { // tocar la pieza la elige (resaltada con el hueco); tocar el hueco la coloca; otro toque en ella la suelta
          const o = pieza();
          if (!o) return;
          if (this.tut?.id !== "basico") return void (this.zonaActual()?.circuito === "cadena" ? this.avisar("Arrastra el repuesto a una pieza de la cadena.") : elegir(o)); // fuera de «Primeros pasos»: un toque coloca
          const no = permite(this.tut, { arrastrar: o }, this.estTut());
          if (no) return this.avisar(no);
          this.sel = this.sel === o ? null : o;
          if (this.sel) this.avisar(this.zonaActual()?.circuito === "cadena" ? "Ahora toca la pieza a cambiar." : "Ahora toca el hueco rojo.");
          this.pintar(net.estado);
        },
      });
      return { fondo, zona, icono: this.add.container(0, GY), clave: "", texto: letras(this, 0, GY, "", 2).setOrigin(0.5), nombre: letras(this, 0, GY, "", 1.25).setOrigin(0.5), borde: this.add.graphics() }; // 10 px (1,25): el mínimo legible en móvil
    });
    // Misma posición local que el panel (el arrastre usa la matriz del panel): solo sirve para el fundido de entrada.
    const gavetaC = this.add.container(0, 0, opciones.flatMap((o) => [o.fondo, o.borde, o.zona, o.icono, o.texto, o.nombre]));
    const golpes: Phaser.GameObjects.Zone[] = [];
    const tarjeta = this.add.container(180, 76).setVisible(false);
    // Pista del modo demo: se ven solo en el primer pod hasta el primer intento (pistaDemo en pantalla.ts).
    const flecha = anim(this, 180, 150, "flecha_guia", 2).setVisible(false); // sobre la gaveta (GY 168)
    const resalteGaveta = marco(this, 180, GY, "recuadro_resaltado", 358, GH + 6).setVisible(false);
    const resalteCheck = marco(this, 180, 340, "recuadro_resaltado", 300, 46).setVisible(false);
    this.tweens.add({ targets: [resalteGaveta, resalteCheck], alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: flecha, y: 156, duration: 400, yoyo: true, repeat: -1 });
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
      marco(this, 180, 177, "panel_oscuro", 360, 356), cables, this.hueco, circuito, resalteRanura, ...carga, ...zonasMedir, ...huecos, tablero.c, tablero3.c, fila, aviso,
      gavetaC, this.puntasG, this.check.c, resalteGaveta, resalteCheck, flecha, flechaPlaca, // las puntas cruzan la gaveta al medir: van encima
      golpes[0] = toque(this, 180, 340, 300, 48, () => this.pulsarCheck()),
      tarjeta,
    ]);

    this.crearSabotajes(escena, panel);

    const mudo = this.add.text(210, 21, "", { fontSize: "22px", color: "#fff", fixedWidth: 36, fixedHeight: 36, align: "center", padding: { y: 4 } }).setOrigin(0.5).setDepth(1000);
    const pintarMudo = () => mudo.setText(silenciado() ? "×" : "♪").setBackgroundColor(silenciado() ? "#8a2f3a" : "#3a4466");
    this.add.zone(210, 21, 44, 44).setDepth(1001).setInteractive({ useHandCursor: true }).on("pointerdown", () => { desbloquear(); alternarSilencio(); pintarMudo(); });
    pintarMudo();
    this.ui = {
      escena, panel, estado, rival, salir, reloj: relojT, contador, podT, llamas, mejorasT, pestanas, globo, bocadillo, cola: colaC, bahia, circuito, carga, aguja, aviso, gavetaC, opciones, tarjeta,
      cables, tablero, tablero3, fila, etiquetas, modos, pasa, zonasMedir, huecos, flecha, resalteGaveta, resalteCheck, flechaPlaca, resalteRanura, golpes,
    };
    this.crearGuia();
    this.veloR = []; this.veloG = undefined; this.veloClave = ""; this.manoClave = ""; this.manoOculta = 0; this.manoFant = undefined; this.saleBasico = false; // la escena se reusa: lo viejo ya se destruyó
    this.mano = crearMano(this);
    this.input.on("pointerdown", (_p: Phaser.Input.Pointer, sobre: Phaser.GameObjects.GameObject[]) => this.tocarFoco(sobre));
    this.tut = net.tutorial ? iniciar(net.idTutorial!, Date.now()) : null; // `avanzar` usa Date.now: con desde=0 saltaba el paso 1
    this.pruebas = 0; this.medidas = 0; this.vistasVistas = new Map(); // la escena se reusa: los contadores de otro tutorial hacían cumplir «mide» sin medir
    if (this.tut?.id === "basico") try { marcarBasicoVisto(this.aliasPerfil(), localStorage); } catch { /* sin disco */ }
    // Phaser reusa la escena: sin esto, la pieza del pod 1 del tutorial salía ya elegida en el pod 1 de la práctica.
    this.previas.clear(); this.tinteLectura = false; this.modo = null; this.sel = null; this.limpiarMedida(); // la escena se reusa: el modo del multímetro de la partida anterior no pasa a la nueva
    this.elegidas.clear(); this.probadas.clear(); this.tramos.clear(); this.cables.clear(); this.puestas.clear(); this.montajes.clear();
    this.guiaClave = ""; this.avisoClave = ""; this.aparecio = "";
    this.ecoVisto = net.estado.eco?.n ?? 0; this.fusibleVisto.clear(); this.fusibleAnim = undefined;
    this.humoToques = 0; this.humoLimpio = 0; this.humoVisto = 0; this.sinPistaVisto = false;
    this.cartelMulti = undefined; this.cancelada = -1; this.sono = -1; this.montajeBornes = undefined;
    this.golpe = 0;
    this.podNum = 0;
    this.carteles = [];
    this.despachoHasta = 0; this.puertaViva = null; this.puertasVistas = 0; this.puertaRacha = 0; this.puertaSemilla = Math.floor(Math.random() * 2 ** 32);
    this.intento = false;
    this.marcado = false;
    this.guiaP = null; pausarJuego(false); this.guiaVistos = cargarPerfil(this.aliasPerfil()).tutoriales; this.pintarGuiaPartida();
    this.events.once("shutdown", () => pausarJuego(false)); // salir con la guía abierta no deja el reloj parado
    this.sucio = false;
    this.racha = 0;
    this.reparadasVistas = net.estado.pod?.zonas.filter((z) => z.reparada).length ?? 0;
    this.despachadosVistos = net.estado.despachados;
    this.hayMasVistas = net.hayMas;
    this.avisoVisto = net.estado.aviso;
    this.bloqueado = false;
    this.diagVistos = net.diagnosticos;
    this.pintar(net.estado);
    // Primeras veces por perfil (no en el tutorial, que ya lo enseña): Chispa dice cómo se usa la HERRAMIENTA, sin pistas del pod.
    let almacen: Storage | null = null;
    try { almacen = localStorage; } catch { /* sin almacenamiento: sin ayuda sola */ }
    if (!this.tut?.activo && !tutorialCompletado(cargarPerfil(this.aliasPerfil()), "basico") && ayudaPrimerasVeces(this.aliasPerfil(), almacen)) { // «Primeros pasos» ya enseñó el multímetro
      window.setTimeout(() => { if (this.chispa.cont.active && !this.guiaP) { /* la guía de mecánica nueva ya enseña a medir */ this.chispa.decir(AYUDA_USO.chispa, 7000); this.chispaHasta = Date.now() + 7000; this.mostrarCartelMulti(7000); } }, 1200);
    }
  }

  update(_t: number, dt: number) {
    const p = this.net.estado, z = this.zonaActual(), ahora = Date.now(), juego = ahoraJuego(); // `juego` se detiene con la guía abierta: todo lo que sale de la Pantalla (reloj, esperas, sabotaje, tarjeta) va con él
    this.ajustarGolpes();
    if (this.salirPide && ahora > this.salirPide) { this.salirPide = 0; this.pintarSalir(p); } // la confirmación caduca
    const k = this.apagado && !REDUCIDO ? 0.65 + 0.35 * Math.sin(ahora / 300) : 1; // parpadeo suave de Tensión / Continuidad mientras está apagado
    for (const m of this.ui.modos) { m.fondo.setAlpha(k); m.icono.setAlpha(k); m.rotulo.setAlpha(k); }
    this.pintarSabotaje(p, juego);
    // Un aviso nuevo (resultado, despacho) manda sobre la lectura del multímetro; sin esto el panel seguía en «Pasa…».
    if (p.aviso !== this.avisoVisto) { this.avisoVisto = p.aviso; if (p.aviso) { this.limpiarMedida(); this.modo = null; this.pintar(p); } }
    if ((p.esperaHasta > juego) !== this.bloqueado) { if (this.bloqueado) sonar("listo"); this.bloqueado = !this.bloqueado; this.pintar(p); } // Probar se apaga mientras dura el bloqueo
    const rotuloCheck = this.rotuloCheck(this.zonaActual()); // cuenta atrás en el botón mientras dura el enfriamiento
    if (this.check.texto.text !== rotuloCheck) this.check.texto.setText(rotuloCheck);
    this.ui.reloj.setText(p.practica ? "--:--" : reloj(p, juego)); // la práctica no tiene límite de tiempo
    this.ui.podT.setText(tiempoPod(juego - this.podDesde));
    // Multímetro: «Midiendo…» (Medida.medirMs: 1 s, 3 s en partidas competitivas) con la aguja buscando; luego la lectura del árbitro.
    if (this.midiendo) {
      const l = lecturaLista(this.midiendo, p.medida, juego, this.durMedir(p, this.midiendo));
      if (l) {
        this.midiendo = undefined; this.lectura = l; this.medidas++;
        const clave = `${this.clave()}|${l.modo}|${l.punto}`, v = this.vistasVivas(p)[this.zona];
        this.leida = leerMedida(l, { circuito: z?.circuito, volts: z?.volts ?? 0, previa: this.previas.get(clave), ocultarOhmios: AJUSTES_GAVETA.ocultarValor });
        if (this.leida.voltios !== undefined) this.previas.set(clave, this.leida.voltios);
        this.pintarMedidor();
        if (z?.circuito === "cadena" && l.modo === "continuidad") { // la pieza que no pasa queda marcada en rojo (la tensión no marca: con el LED aguas abajo el corte no siempre lee «toda»)
          this.tramos.set(`${this.clave()}|${l.punto}`, !!l.pasa);
          this.pintar(p);
        }
      }
      else if (juego - this.midiendo.desde > this.durMedir(p, this.midiendo) + 4000) this.midiendo = undefined; // rechazo o red caída (holgura de 4 s para una Medida lenta): se puede volver a medir
    }
    this.pintarPuntas(p, z, ahora, juego); // medir va todo en reloj de juego (`desde` incluido): se congela con la guía, como el árbitro, y nunca da tiempos negativos
    const prox = this.modo && !this.midiendo && z && p.proxMedir?.[z.zona] ? AYUDA_USO.prox(p.proxMedir[z.zona]!) : "";
    if (this.multi.prox.text !== prox) this.multi.prox.setText(prox);
    if (this.cartelMulti && this.modo) this.quitarCartelMulti();
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
    const texto = this.acabo(p) ? "" : (local ?? (corto && textoCorto(corto, z!.circuito, cargasPuestas(this.puestasZona()))) ?? medidor ?? (pista && PISTA_DEMO[pista]) ?? (z && this.rancio(z) ? null : this.sinRespuesta(z, avisoVivo(p, juego))) ?? (despachable(p) || z?.reparada ? "Verde: pulsa SIGUIENTE"
      : z!.circuito === "placa3" && falta === "colocar" ? faltaPlaca3(this.montajeZona())! : placa && falta === "colocar" ? faltaColocar(this.puestasZona(), z!.circuito)! : placa && falta ? ayudaCables(z!.circuito) : `${this.tut?.activo ? "" : `${textoObjetivo(p, sinPista(p, ahora))}. `}${placa ? "Pulsa CHECK para probar" : this.eleccion(z!) ? "Mide si quieres y pulsa CHECK para validar" : z!.circuito === "cadena" ? (this.muertaLocalizada() ? "Arrastra un repuesto al hueco rojo" : "Mide las piezas con Continuidad para hallar la muerta") : `Arrastra ${["led", "cabina", "protegido", "divisor"].includes(z!.circuito) ? "una resistencia" : "una pieza"} al hueco rojo`}`)) as string;
    const tinte = this.modo && this.lectura && !this.midiendo && this.leida && texto === this.leida.estado ? COLOR_LUZ[this.leida.luz] : null; // el aviso lleva el color de la lectura
    const p3 = z?.circuito === "placa3", medirP3 = p3 && this.ui.fila.visible;
    const clave = `${placa}|${p3}|${medirP3}|${texto}|${tinte}`;
    if (clave !== this.avisoClave) {
      if (tinte !== null) this.ui.aviso.setTint(tinte); else if (this.tinteLectura) this.ui.aviso.setTint(0xffffff);
      this.tinteLectura = tinte !== null; // en la placa el aviso cabe entre «Correcto» y Probar (44 px): 1-2 líneas a 16 px, 3 a 12 px
      this.avisoClave = clave;
      this.ui.aviso.setText(texto);
      const tope = p3 ? (medirP3 ? 16 : 28) : placa ? 44 : 32; // p3: 1 o 2 líneas de ~13,5 px
      for (const k of p3 ? [12, 11] : [16, 12, 11]) { this.ui.aviso.setFontSize(k); if (this.ui.aviso.height <= tope) break; }
      // placa experta: el aviso no puede pisar CHECK; si aun a 11 px no cabe, se recorta (el multímetro repite el veredicto)
      for (let t = texto; p3 && this.ui.aviso.height > tope && t.length > 12;) this.ui.aviso.setText((t = t.slice(0, -6).trimEnd()) + "…"); // sin placa: de y 286 a 318, sin rozar CHECK (316): 2 líneas a 16 px, 3-4 a 12 u 11 (mínimo legible)
    }
    if (placa) this.ui.aviso.setY(283);
    if (p3) this.ui.aviso.setY(medirP3 ? 313 : 300); // entre la fila de piezas (o el multímetro) y CHECK
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
    this.revisarGuiaPartida(p, z);
    if (z) this.pintarSenal(this.acabo(p) ? null : this.objetivoSenal(p, z, placa), placa, this.contPaso()); // el paso del tutorial cambia aquí, no en pintar()
    this.pintarVelo(this.acabo(p) ? null : this.focos(placa));
    this.pintarMano(placa);
    const ver = !!z && tarjetaVisible(p, z.zona, juego);
    if (ver !== this.ui.tarjeta.visible && z) {
      if (ver) this.armarTarjeta(z.circuito, p);
      this.ui.tarjeta.setVisible(ver);
    }
  }

  /** En el tutorial del LED girado el aviso del árbitro regalaba la causa («está al revés»): se mide para descubrirla. */
  private sinRespuesta(z: ZonaView | undefined, aviso: string | null) {
    if (aviso) aviso = aviso.replace(/pulsa Despachar/i, (m) => m.replace("Despachar", "SIGUIENTE")); // tras el verde el botón se llama SIGUIENTE
    return aviso && this.tut?.activo && z?.circuito === "invertido" && !z.reparada && aviso.includes("al revés") ? "El LED no enciende. Averigua por qué con el multímetro." : aviso;
  }

  private armarTarjeta(c: Circuito, p: Pantalla) {
    const t = this.ui.tarjeta.removeAll(true), v = p.vistas[this.zona], nombre = spriteTarjeta(c, v);
    if (nombre) return t.add(img(this, 0, 0, nombre, 3).setOrigin(0.5));
    const z = this.zonaActual(), elegida = z && this.eleccion(z);
    t.add([marco(this, 0, 0, "panel_alerta", 300, 112),
      letras(this, 0, -26, v?.cortocircuito ? "¡Cortocircuito!" : "¡Pieza quemada!", 3).setOrigin(0.5),
      letras(this, 0, 4, v?.cortocircuito ? "Atajo sin carga" : "Muy poca resistencia: pasó demasiada corriente", 1.5).setOrigin(0.5).setCenterAlign().setMaxWidth(270), // la causa, la misma del veredicto
      letras(this, 0, 36, elegida ? textoRotulo(elegida, c) : "", 3).setOrigin(0.5)]);
  }

  /** «Salir» visible mientras se juega; armado muestra «SÍ / NO». */
  private pintarSalir(p: Pantalla) {
    const { marco: marcoB, texto, base, si, no, panel } = this.salirB;
    const vivo = !terminada(p), armado = vivo && !p.practica && Date.now() < this.salirPide;
    (marcoB as unknown as Phaser.GameObjects.Components.Visible).setVisible(vivo && !armado);
    texto.setVisible(vivo && !armado);
    panel.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(armado));
    base.input!.enabled = vivo && !armado; si.input!.enabled = armado; no.input!.enabled = armado;
  }

  pintar(p: Pantalla) {
    const u = this.ui, pod = p.pod, z = this.zonaActual();
    if (!pod || !z) return;
    this.zona = z.zona;
    AJUSTES_GAVETA.ocultarValor = ocultaValor(pod.nivel, z.circuito); // nivel 3: resistencias por bandas, sin Ω ni «Frena…»
    u.estado.setText(`${p.demo ? "Demo · " : ""}${textoPod(pod.numero, p.total)}`);
    this.pintarProgreso(p);
    u.contador.setTexture(`contador_pods_${Math.min(p.despachados, 5)}`);
    const largo = p.oleadas ? `Oleadas · Quemadas ${p.quemadas}/${QUEMADAS_OLEADAS}` : p.practica ? "Práctica" : textoRival(p.rival, p.total);
    // El HUD debe acabar antes de «SABOTAJE ■■■» (x 246, 204 px de ancho): grande, sin «pods», más pequeño y al final el mínimo.
    for (const [t, k] of [[largo, 16], [largo.replace(" pods", ""), 16], [largo, 12], [largo.replace(" pods", ""), 12]] as const) { u.rival.setText(t).setFontSize(k); if (u.rival.width <= 204) break; }
    u.mejorasT.setText(etiquetas(this.net.mejoras));
    u.salir.input!.enabled = p.practica;
    this.pintarSalir(p);
    // En modo demo solo se muestran las pestañas de las zonas que trae el pod (Radar, o Cabina/Turbina).
    pestanasArte(pod, this.zona, sinPista(p, ahoraJuego())).forEach((t, i) => u.pestanas[i]!.setTexture(t.sprite).setAlpha(t.zona == null && !sinPista(p, ahoraJuego()) ? 0.6 : 1).setVisible(!p.demo || t.zona != null));
    u.globo.setText(textoGlobo(z, pod));
    // El bocadillo mide 3 líneas: con más (retos largos) se estira hacia abajo para que el texto no se corte.
    u.bocadillo.setScale(3, 3 * Math.max(1, (u.globo.height + 26) / 80));
    this.pintarCola(pod.numero, p.total);
    this.pintarPod(p);

    // Circuito: batería, pieza elegida (sprite o texto) y carga según el último veredicto.
    const elegida = this.elegidas.get(this.clave()), vivas = this.vistasVivas(p), v = vivas[this.zona];
    const nivel = nivelCarga(z, v), n = cargas(z.circuito);
    const mp = montajePieza(z.circuito, elegida, AJUSTES_GAVETA.ocultarValor), mc = montajeCarga(z, nivel, elegida);
    const pieza = spritePieza(z.circuito, elegida), bat = spriteBateria(z.volts);
    u.circuito.removeAll(true).add([
      img(this, 50, 76, bat, bat === "icono_bateria" ? 4 : 2).setOrigin(0.5),
      letras(this, 50, 120, textoVolts(z.volts), 2).setOrigin(0.5, 0),
      ...(mp ? pintarMontaje(this, mp, 180, 34) : pieza ? this.fusiblePuesto(z, elegida, v, pieza) : z.circuito === "divisor" || !elegida ? [] : [marco(this, 180, 34, "boton_secundario", 104, 40)]),
      ...(z.circuito === "divisor" ? (elegida ? [] : [letras(this, MC.x + 28, MC.y, "?", 2).setOrigin(0.5)]) : [letras(this, 180, mp ? 34 + mp.alto + 4 : pieza ? 66 : 34, elegida ? textoRotulo(elegida, z.circuito) : "?", 2).setOrigin(0.5, mp || pieza ? 0 : 0.5)]),
      ...(mc ? [...pintarMontaje(this, mc, MC.x, MC.y), ...(z.circuito === "divisor" ? [] : [letras(this, MC.x, MC.y + mc.alto + 4, etiquetaCarga(z), 2).setOrigin(0.5, 0)])] : [letras(this, 354, z.circuito === "fusible3" ? 6 : 122, etiquetaCarga(z), 2).setOrigin(1, 0)]),
    ]);
    this.dibujarCables(z.circuito === "abierto" && elegida === "dejar" && !z.reparada);
    const cad = z.circuito === "cadena";
    if (cad) this.pintarCadena(z, nivel, elegida);
    huecosCadena(4).forEach((_, i) => { // áreas táctiles de la cadena (medir al tocar); fuera de ella no reciben nada
      const r = cad ? huecosCadena(z.cadena!.length)[i] : undefined, h = u.huecos[i]!;
      h.input!.enabled = !!r && !z.reparada;
      if (r) h.setPosition(r.x, r.y).setSize(r.w, r.h);
    });
    this.montajeBornes = mc?.bornes;
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
    if (this.sel && (z.reparada || !z.opciones.includes(this.sel))) this.sel = null; // otra zona o ya reparada: nada que colocar
    u.resalteRanura.setPosition(this.ranura.x, this.ranura.y).setSize(this.ranura.w / 4, this.ranura.h / 4).setVisible(!!this.sel && !cad).setAlpha(1);
    u.carga.forEach((c, i) => c.setVisible(i < n).setTexture(spriteCarga(z.circuito, nivel, z.fija)).setAngle(0)
      .setScale(n === 2 ? 3 : 4).setPosition(310, n === 2 ? 52 + i * 48 : 76));
    const fin = this.acabo(p);
    u.panel.setVisible(!fin); // tutorial terminado: solo queda la caja «¡Listo!» (el pod 2 no existe)
    u.globo.setVisible(!fin); u.bocadillo.setVisible(!fin);

    // Cabina y Turbina: la placa con cables reemplaza el dibujo y la gaveta; el medidor baja debajo de la placa.
    const placa = conPlaca(z.circuito), p3 = z.circuito === "placa3";
    u.tablero.mostrar(placa);
    if (placa) u.tablero.pintar(z.circuito, z.volts, this.cablesZona(), this.puestasZona(), nivel, z.reparada);
    u.tablero3.mostrar(p3 && !fin);
    if (p3) u.tablero3.pintar(z.opciones, z.volts, this.montajeZona(), z.reparada ? "encendido" : v?.quemado ? "quemado" : "normal");
    for (const o of [u.circuito, u.cables, ...u.carga]) o.setVisible(!placa && !p3 && (o !== u.carga[1] || n === 2) && !((mc || cad) && (o === u.cables || u.carga.includes(o as Phaser.GameObjects.Image))));
    for (const o of u.zonasMedir) o.input!.enabled = !placa && !p3 && !cad; // una Zone invisible sigue recibiendo toques
    // Mientras quedan piezas en la gaveta de la placa, esta ocupa el lugar del medidor.
    u.fila.setY(this.filaDy(z)).setVisible(p3 ? u.tablero3.gavetaActual === "medir" && !fin : !placa || !u.tablero.faltanPiezas()); // placa experta: el multímetro es la pestaña «Medir»
    u.aviso.setY(placa ? 283 : p3 ? 300 : 286);
    u.etiquetas[1]!.setY(146);
    if (this.clave() !== this.aparecio) { this.aparecio = this.clave(); this.aparecer(); }
    // Pieza puesta en el circuito: se puede arrastrar de vuelta, lleva el mismo contorno que las de la gaveta.
    if (elegida && !z.reparada && !placa && !p3 && !fin) {
      const h = cad ? huecosCadena(z.cadena!.length)[Number(elegida[0]) - 1] : undefined, m = u.zonasMedir[0]!;
      const r: Rect4 | null = cad ? (h ? [h.x, h.y, h.w, h.h] : null) : [m.x, m.y, Math.min(m.width, 108), m.height];
      if (r) u.circuito.add(this.contorno(this.add.graphics(), ...r));
    }

    this.hueco.setVisible(conHueco(z.circuito, elegida, z.reparada) && !fin);
    const botones = botonesGaveta(z, elegida);
    // 3 botones de 104 px o 4 de 82 px, centrados en el panel de 360 px.
    const nb = botones.length, ancho = nb > 3 ? 82 : 104, paso = nb > 3 ? 88 : 116;
    u.opciones.forEach((b, i) => {
      const o = botones[i], ver = !!o && !z.reparada && !placa && !p3 && !fin, x = 180 + (i - (nb - 1) / 2) * paso;
      const nombre = o && z.circuito !== "divisor" && !AJUSTES_GAVETA.ocultarValor ? (FRENA[o.pieza] ?? "").replace(/^Frena /, "") : "", color = o?.elegida ? OSCURO : 0xffffff;
      const dibujo = o ? montajeOpcion(z.circuito, o.pieza, AJUSTES_GAVETA.ocultarValor) : null, conDibujo = !!dibujo && dibujo.elementos.length + dibujo.cables.length > 0;
      const clave = o ? `${z.circuito}|${o.pieza}` : "";
      if (clave !== b.clave) { // el dibujo solo se rehace si cambia la pieza de este botón
        b.clave = clave;
        b.icono.removeAll(true);
        if (dibujo) b.icono.add(this.dibujoOpcion(dibujo, 0, 0));
      }
      b.fondo.setVisible(ver).setTexture(o?.elegida ? "boton_primario" : "boton_secundario").setPosition(x, GY).setSize(ancho / 4, GH / 4);
      b.borde.clear(); if (ver) this.contorno(b.borde, x, GY, ancho, GH); // se arrastra: borde punteado y agarre (CHECK y los modos, lisos)
      if (ver && this.sel === o?.pieza) b.borde.lineStyle(3, PISTA).strokeRect(x - ancho / 2 - 5, GY - GH / 2 - 5, ancho + 10, GH + 10); // elegida con un toque
      const hz = Math.max(GH, b.zona.height);
      b.zona.setSize(ancho, hz).setPosition(x, GY + (GH - hz) / 2); // crece hacia el circuito: el borde de abajo (198) no pisa el multímetro
      b.zona.input!.enabled = ver;
      b.icono.setVisible(ver && conDibujo).setPosition(x, GY - 11);
      const rotulo = o ? textoRotulo(o.pieza, z.circuito) : "";
      b.texto.setVisible(ver && !!rotulo).setText(rotulo).setTint(color).setPosition(x, conDibujo ? GY + (nombre ? 10 : 15) : GY);
      b.nombre.setVisible(ver && !!nombre).setText(nombre).setTint(color).setPosition(x, GY + 23);
    });
    // Modo demo: sin multímetro (solo se usa en otras zonas).
    if (p.demo) this.modo = null;
    for (const m of u.modos) { m.fondo.setVisible(!p.demo); m.icono.setVisible(!p.demo); m.rotulo.setVisible(!p.demo).setY(150); }
    const pista = pistaDemo(p, this.intento, this.falta(z));
    u.flecha.setVisible(pista === "elegir");
    u.flechaPlaca.setVisible(pista === "colocar");
    // El mismo recuadro resalta la gaveta (Radar), la gaveta de la placa (colocar) o la placa entera (cablear).
    const recuadro = pista === "colocar" ? [180, 240, 220, 68] : pista === "cablear" ? [180, 92, 340, 252] : [180, GY, 358, GH + 6];
    u.resalteGaveta.setVisible(pista === "elegir" || pista === "colocar" || pista === "cablear")
      .setPosition(recuadro[0], recuadro[1]).setSize(recuadro[2]! / 4, recuadro[3]! / 4);
    const e = this.eleccion(z), probable = !z.reparada && !!e && e !== this.probadas.get(this.clave());
    const verde = z.reparada && !p.despachando; // CHECK habilitado: el multímetro está en verde (o, en la placa, el circuito está listo para probar)
    u.resalteCheck.setVisible(!fin && (verde || pista === "probar" || probable));
    u.golpes[0]!.input!.enabled = !fin;
    this.check.c.setVisible(!fin).setY(p3 ? 350 : 340);
    u.golpes[0]!.setY(p3 ? 350 : Math.max(340, GY + Math.max(GH, this.golpe) / 2 + this.golpe / 2));
    const activo = checkActivo(verde, probable, p.esperaHasta, ahoraJuego()); // gris sin pieza o en enfriamiento (ver pantalla.ts)
    this.check.fondo.setTexture(activo ? "boton_primario" : "boton_secundario");
    this.check.marca.setVisible(activo);
    this.check.texto.setText(this.rotuloCheck(z)).setTint(activo ? OSCURO : GRIS).setX(activo ? 14 : 0); // tras el último pod de un tutorial el árbitro manda un pod 2 que no existe
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
    c.add([g, img(this, 50, 76, bat, bat === "icono_bateria" ? 4 : 2).setOrigin(0.5), letras(this, 50, 120, textoVolts(z.volts), 2).setOrigin(0.5, 0)]);
    cad.forEach((tipo, i) => {
      const h = hs[i]!, id = i + 1 === k ? rep : tipo, sp = spriteCadena(id, nivel), marca = z.reparada ? undefined : this.tramos.get(`${this.clave()}|t${i + 1}`);
      if (sp) c.add(img(this, h.x, y, sp, 3).setOrigin(0.5).setFlipX(id === "ledInv"));
      else c.add(this.add.graphics().lineStyle(6, 0xaab4c8).lineBetween(h.x - 24, y, h.x + 24, y).fillStyle(0xaab4c8).fillCircle(h.x - 24, y, 4).fillCircle(h.x + 24, y, 4));
      c.add(letras(this, h.x, 60, textoPiezaCadena(id), 1.5, GRIS).setOrigin(0.5, 0));
      if (i + 1 === k) return;
      if (marca === undefined) return void c.add(letras(this, h.x, 88, "·", 3, GRIS).setOrigin(0.5)); // sin medir
      if (marca) c.add(img(this, h.x, 88, "icono_pasa", 2).setOrigin(0.5));
      else c.add([this.add.rectangle(h.x, y + 6, h.w - 4, 60, 0xe8363c, 0.55).setStrokeStyle(2, ALERTA), letras(this, h.x, y + 6, "?", 4).setOrigin(0.5)]); // hueco rojo = pieza muerta
    });
    const medidas = cad.filter((_, i) => i + 1 !== k && this.tramos.has(`${this.clave()}|t${i + 1}`)).length, v = this.vistasVivas(this.net.estado)[z.zona];
    c.add(letras(this, 200, 124, `Medidas: ${medidas}/${cad.length - (k ? 1 : 0)}`, 1.5, GRIS).setOrigin(0.5, 0));
    if (k && !z.reparada && (v?.quemado || v?.cortocircuito)) { // el repuesto no sirvió: el hueco k en rojo y qué reponer (la misma pieza impresa de la muerta)
      const h = hs[k - 1]!;
      c.add([this.add.rectangle(h.x, y + 6, h.w - 4, 60, 0xe8363c, 0.55).setStrokeStyle(2, ALERTA), img(this, h.x, 88, "icono_no_pasa", 2).setOrigin(0.5),
        letras(this, 200, 138, `Repón la misma: ${textoPiezaCadena(cad[k - 1]!)}`, 1.5, ALERTA).setOrigin(0.5, 0)]);
    }
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
        this.podDesde = ahoraJuego();
        this.pintar(this.net.estado);
      }));
    });
  }

  /** Récord personal: guarda el tiempo del pod despachado (`p.despachados` = su número) y muestra la medalla frente a la marca anterior. */
  private anotarTiempo(p: Pantalla) {
    const ms = ahoraJuego() - this.podDesde, alias = (p.alias ?? "").trim() || "Aprendiz";
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
   * CHECK. Con la zona reparada (luz verde) despacha el pod o pasa a la siguiente zona sin reparar. Si no, VALIDA: manda la pieza o el
   * montaje puesto al árbitro (el único `test`: luz, penalización y enfriamiento solo ocurren aquí; colocar y medir son libres).
   */
  /** CHECK valida; con la zona en verde el mismo botón avanza, y así se llama (antes «CHECK otra vez» confundía). */
  private rotuloCheck(z: ZonaView | undefined) {
    const t = textoCheck(this.net.estado.esperaHasta, ahoraJuego());
    return z?.reparada ? "SIGUIENTE" : t; // reparada: checkActivo ya es true y pulsarCheck no mira la espera
  }

  private pulsarCheck() {
    const z = this.zonaActual(), p = this.net.estado;
    if (!z) return;
    const no = permite(this.tut, "check", this.estTut());
    if (no) return this.avisar(no);
    if (!z.reparada) return this.probarZona(z);
    sonar("clic");
    if (despachable(p)) return this.net.despachar();
    const sig = p.pod?.zonas.find((x) => !x.reparada);
    if (sig) { this.zona = sig.zona; this.limpiarMedida(); this.net.limpiarAviso(); this.pintar(p); }
  }

  private probarZona(z: ZonaView) {
    const e = this.eleccion(z), falta = this.net.estado.esperaHasta - ahoraJuego(), placa = conPlaca(z.circuito);
    if (!e && z.circuito === "placa3") return this.avisar(faltaPlaca3(this.montajeZona())!);
    if (!e) return this.avisar(placa ? faltaColocar(this.puestasZona(), z.circuito) ?? faltaCablear(this.cablesZona(), z.circuito, cargasPuestas(this.puestasZona())) : z.circuito === "cadena" ? "Arrastra un repuesto al hueco rojo y pulsa CHECK" : "Arrastra una pieza al hueco rojo y pulsa CHECK");
    if (falta > 0) return this.avisar(`Espera ${Math.ceil(falta / 1000)} s y vuelve a pulsar CHECK`);
    if (e === this.probadas.get(this.clave())) return this.avisar(placa || z.circuito === "placa3" ? "No cambiaste nada. Cambia una pieza o un cable y pulsa CHECK." : "Ya validaste esa. Cambia la pieza y pulsa CHECK.");
    sonar("clic");
    this.net.probar(z.zona, e); this.intento = true; this.probadas.set(this.clave(), e); this.pintar(this.net.estado);
  }

  /** Dibujo de una opción de la gaveta; el LED, el cable y el empalme (sin sprite del kit) van sobre una placa oscura para que se lean sobre el botón claro. */
  private dibujoOpcion(m: ReturnType<typeof montajeOpcion>, x: number, y: number) {
    const placa = m.elementos.every((e) => e.diodo || e.fusible) ? [this.add.rectangle(x, y, m.ancho + 16, m.elementos[0]?.fusible ? 40 : 34, 0x262d45)] : [];
    return [...placa, ...pintarMontaje(this, m, x, y)];
  }

  /** Pieza que se arrastra: el mismo dibujo y rótulo del botón de la gaveta, sobre un botón claro. */
  private fantasma(c: Circuito, pieza: string) {
    const m = montajeOpcion(c, pieza, AJUSTES_GAVETA.ocultarValor), rotulo = textoRotulo(pieza, c), hay = m.elementos.length + m.cables.length > 0;
    return this.add.container(0, 0, [this.add.rectangle(3, 3, 104, GH, 0x000000, 0.45), marco(this, 0, 0, "boton_primario", 104, GH), // sombra: «levantada»
      this.contorno(this.add.graphics(), 0, 0, 104, GH), ...(hay ? this.dibujoOpcion(m, 0, rotulo ? -8 : 0) : []),
      ...(rotulo ? [letras(this, 0, hay ? 17 : 0, rotulo, 2, OSCURO).setOrigin(0.5)] : [])]);
  }

  /** «Esto se arrastra»: borde punteado cian 2 px por fuera del rectángulo centrado y 6 puntitos de agarre (2x3) arriba a la izquierda. */
  private contorno(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    g.lineStyle(2, CIAN, 1);
    for (const [x1, y1, x2, y2] of punteado(x, y, w + 4, h + 4)) g.lineBetween(x1, y1, x2, y2);
    g.fillStyle(CIAN, 1);
    for (let i = 0; i < 6; i++) g.fillRect(x - w / 2 + 5 + (i % 2) * 5, y - h / 2 + 5 + Math.floor(i / 2) * 5, 3, 3);
    return g;
  }

  /** Pod o zona nueva: la gaveta (350 ms) y el multímetro (700 ms) aparecen con fundido tras el circuito. Los toques siguen activos (solo cambia el alpha). */
  private aparecer() {
    [this.ui.gavetaC, this.ui.fila].forEach((o, i) => {
      this.tweens.killTweensOf(o);
      o.setAlpha(REDUCIDO ? 1 : 0);
      if (!REDUCIDO) this.tweens.add({ targets: o, alpha: 1, delay: 350 * (i + 1), duration: 250 });
    });
  }

  /** Áreas táctiles de la gaveta y de CHECK: >= 44 px en pantalla (el lienzo se escala con FIT) sin solaparse. */
  private ajustarGolpes() {
    const h = Math.ceil(Math.max(48, 44 * this.scale.displayScale.y));
    if (h === this.golpe) return;
    this.golpe = h;
    const hg = Math.max(GH, h);
    for (const o of this.ui.opciones) o.zona.setSize(o.zona.width, hg).setY(GY + (GH - hg) / 2); // crece hacia arriba (ver pintar)
    // CHECK empieza donde acaba la gaveta (GY + hg/2).
    for (const z of this.ui.golpes) z.setSize(z.width, h).setY(Math.max(340, GY + hg / 2 + h / 2));
    for (const z of this.guia.zonas) z.setSize(z.width, Math.max(56, h));
  }

  /** Sin caja de texto: Chispa dice el paso. Quedan solo botones pequeños (depth 960, sobre el velo) en un contenedor en (180, 380). */
  private crearGuia() {
    const caja = this.add.container(180, 380).setVisible(false).setDepth(960);
    const boton = (x: number, fondo: string, color: number, fn: () => void, w = 100, y = 0, k = 2) => {
      const t = letras(this, x, y, "", k, color).setOrigin(0.5);
      return { t, partes: [marco(this, x, y, fondo, w, 32), t, toque(this, x, y, w, 48, fn)] as Phaser.GameObjects.GameObject[] };
    };
    const alias = () => this.aliasPerfil();
    const saltarB = boton(138, "boton_secundario", 0xffffff, () => void this.net.salir(), 76, -328, 1.5); // «SALTAR» vuelve al menú: arriba a la derecha (318, 52), tapa «Salir» del HUD
    // Solo en el paso final (`fin`): los demás avanzan cuando el Taller confirma la acción (tutorial.ts, avanzar).
    // Siguiente mecánica (se oculta en la última), práctica normal del nivel de la mecánica y menú.
    const finB = [-112, 0, 112].map((x, k) => boton(x, k ? "boton_secundario" : "boton_primario", k ? 0xffffff : OSCURO, () => {
      const t = this.tut, id = t?.activo && esFin(t) ? t.id : null, m = id ? mecanica(id) : undefined;
      if (!id || !m) return;
      const sig = siguiente(id), ms = sig ? mecanica(sig) : undefined;
      if (k === 0 && sig && ms) void this.net.practicar(alias(), ms.nivel, true, false, sig);
      else if (k === 1) void this.net.practicar(alias(), m.nivel);
      else if (k === 2) void this.net.salir();
    }));
    // Esquema «paralelo» (solo en su paso): carril + rojo y − azul con dos luces entre ambos, cada una unida arriba al carril + y abajo al carril −.
    const r = (x: number, y: number, w: number, h: number, c: number) => this.add.rectangle(x, y, w, h, c);
    const esquema = this.add.container(98, -8, [
      r(0, -22, 76, 4, 0xe8423b), r(0, 22, 76, 4, 0x3b82f6),
      ...[-18, 18].flatMap((x) => [r(x, -11, 4, 18, 0xe8423b), r(x, 0, 14, 14, 0xffe27a).setStrokeStyle(2, 0xffffff), r(x, 11, 4, 18, 0x3b82f6)]),
      letras(this, 52, -22, "+", 2, 0xe8423b).setOrigin(0.5), letras(this, 52, 22, "-", 2, 0x3b82f6).setOrigin(0.5),
    ]).setVisible(false);
    caja.add([esquema, ...saltarB.partes, ...finB.flatMap((b) => b.partes)]);
    const resaltes = [0, 1].map(() => marco(this, 0, 0, "recuadro_resaltado", 100, 100).setVisible(false).setDepth(890));
    this.tweens.add({ targets: resaltes, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    // Guía en partida (mecánica nueva): Chispa dice el paso, el velo ilumina el foco; SALTAR / OK (o tocar el velo) siguen.
    const pc = this.add.container(180, 380).setVisible(false).setDepth(960);
    const pSaltar = boton(-64, "boton_secundario", 0xffffff, () => this.cerrarGuiaPartida(), 112), pOk = boton(64, "boton_primario", OSCURO, () => this.siguienteGuiaPartida(), 112);
    pSaltar.t.setText("SALTAR"); pOk.t.setText("OK");
    pc.add([...pSaltar.partes, ...pOk.partes]);
    this.guia = { caja, esquema, saltar: saltarB, fin: finB, resaltes, zonas: [saltarB, ...finB, pSaltar, pOk].map((b) => b.partes[2]) as Phaser.GameObjects.Zone[], chispa: this.chispa,
      partida: { caja: pc } };
  }

  /** ¿El paso (del tutorial o de la guía) señala el botón Continuidad en lugar de Tensión? */
  private contPaso(): boolean {
    const g = this.guiaP, t = this.tut;
    if (g) return g.pasos[g.i]!.cont;
    if (!t?.activo) return false;
    const p = actual(t);
    return p.objetivo === "tension" && /continuidad/i.test(`${p.titulo} ${p.texto}`);
  }

  /** Huecos del velo (esquina + tamaño, lienzo) del paso del tutorial o de la guía; null = sin velo. Orden de lectura: circuito → gaveta → multímetro → CHECK. */
  private focos(placa: boolean): Rect[] | null {
    const z = this.zonaActual(), t = this.tut, g = this.guiaP;
    if (!z) return null;
    let o: Objetivo, cont = this.contPaso(), arrastra = false, quita = false;
    if (g) o = g.pasos[g.i]!.obj;
    else if (t?.activo && !esFin(t) && !actual(t).libre) { const p = actual(t); o = p.objetivo; arrastra = typeof p.pide === "object"; quita = cont && /quita/i.test(p.texto); }
    else return null;
    const P = this.ui.panel, p3 = z.circuito === "placa3";
    // Tras un CHECK que no dio verde el paso «Valida» sigue vigente: el panel entero se ilumina para corregir (si no, el velo se traga todo menos CHECK).
    const corrige = !g && o === "check" && this.pruebas > 0 && !z.reparada;
    if (corrige) { o = "gaveta"; arrastra = true; }
    // Placa y protoboard: se arrastra y se cablea por todo el panel; solo CHECK y el multímetro tienen foco propio.
    const rs = (placa || p3) && !["check", "tension", "multimetro"].includes(o) ? [[P.x + 180, P.y + 177, 360, 356] as Rect4] : this.rectas(o, placa, cont);
    if (p3 && o === "gaveta") rs.push(this.rectas("gaveta", placa, cont)[0]!); // las pestañas de gaveta quedan fuera del panel: sin hueco el velo se traga el toque
    if (corrige) rs.push(...this.rectas("check", placa, cont), ...this.rectas("multimetro", placa, cont)); // CHECK y la luz siguen a mano
    if (arrastra && !placa && !p3) rs.push(...this.rectas("gaveta", placa, cont), ...this.rectas("circuito", placa, cont)); // de la pieza al hueco
    if (o === "check") rs.push(...this.rectas("multimetro", placa, cont)); // la luz del multímetro dice el veredicto
    if (quita) rs.push(this.rectas("pieza", placa, cont)[0]!); // «Continuidad: quita la pieza»
    if (["tension", "pieza", "carga", "cadena"].includes(o) && this.ui.fila.visible) rs.push(...this.rectas("multimetro", placa, cont)); // la lectura entera, no solo su centro
    rs.push([P.x + 180, P.y + this.ui.aviso.y + 16, 344, 36]); // el aviso bajo el multímetro («Ahora toca…», la lectura): nunca atenuado
    return rs.map(([x, y, w, h]) => ({ x: x - w / 2, y: y - h / 2, w, h }));
  }

  /** Recoloca el velo (pool de Rectangle a depth 880 que tragan los toques fuera del foco) con fundido de 200 ms. */
  private pintarVelo(huecos: Rect[] | null) {
    const clave = huecos ? JSON.stringify(huecos) : "";
    if (clave === this.veloClave) return;
    const antes = this.veloClave;
    this.veloClave = clave;
    const { width, height } = this.scale.gameSize, rs = huecos ? velo(huecos, width, height) : [];
    // Un Graphics pinta lo oscuro; las Zone (invisibles) tragan los toques fuera del foco.
    this.veloG ??= this.add.graphics().setDepth(880);
    this.veloG.clear().fillStyle(0x05070d, 0.72);
    for (const v of rs) this.veloG.fillRect(v.x, v.y, v.w, v.h);
    while (this.veloR.length < rs.length) this.veloR.push(this.add.zone(0, 0, 1, 1).setOrigin(0).setDepth(880).setInteractive().on("pointerdown", () => this.tocarVelo()));
    this.veloR.forEach((r, i) => {
      const v = rs[i];
      r.input!.enabled = !!v;
      if (v) r.setPosition(v.x, v.y).setSize(v.w, v.h); // Zone.setSize también ajusta el área táctil
    });
    this.tweens.killTweensOf(this.veloG);
    this.veloG.setAlpha(REDUCIDO ? 1 : antes ? 0.6 : 0);
    if (!REDUCIDO) this.tweens.add({ targets: this.veloG, alpha: 1, duration: 200 });
  }

  /** Toque en lo oscuro: la guía pasa al paso siguiente; en el tutorial Chispa da un saltito (la mano ya dice qué tocar). */
  private tocarVelo() {
    if (this.guiaP) return this.siguienteGuiaPartida();
    this.chispa.animar();
    if (this.tut?.activo) this.avisar(actual(this.tut).texto); // lo oscuro no responde: el aviso repite qué hacer
  }

  /** Cualquier toque: adelanta un paso de «mirar»; dentro del foco (no en el velo) esconde la mano hasta 4 s sin progreso. */
  private tocarFoco(sobre: Phaser.GameObjects.GameObject[]) {
    if (this.tut?.activo) this.tut = adelantar(this.tut);
    if (sobre.some((o) => this.veloR.includes(o as Phaser.GameObjects.Zone)) || !this.manoClave) return;
    this.mano.ocultar(); this.manoOculta = Date.now();
  }

  /** Mano del paso del tutorial: arrastra de la pieza pedida al hueco, o toca el botón / la pieza. Reaparece a los 4 s sin progreso. */
  private pintarMano(placa: boolean) {
    const t = this.tut, z = this.zonaActual(), paso = t?.activo && !esFin(t) && z && !this.acabo(this.net.estado) ? actual(t) : null, gesto = paso && manoDe(paso), P = this.ui.panel;
    let pts: number[] | null = null;
    const p3 = z?.circuito === "placa3";
    if (gesto === "arrastrar" && typeof paso!.pide === "object" && !placa && !p3) {
      const ids = z!.opciones, i = ids.indexOf(paso!.pide.arrastrar), nb = ids.length, k = this.muertaLocalizada();
      const h = z!.circuito === "cadena" && k ? huecosCadena(z!.cadena!.length)[k - 1]! : this.ranura;
      if (i >= 0) pts = [P.x + 180 + (i - (nb - 1) / 2) * (nb > 3 ? 88 : 116), P.y + GY, P.x + h.x, P.y + h.y];
    } else if (gesto === "tocar" && !((placa || p3) && paso!.objetivo !== "check" && paso!.objetivo !== "tension")) {
      const cont = this.contPaso(), quita = cont && this.modo === "continuidad" && /quita/i.test(paso!.texto); // Continuidad ya puesta: ahora la pieza
      const r = paso!.objetivo === "circuito" ? [P.x + this.ranura.x, P.y + this.ranura.y] : this.rectas(quita ? "pieza" : paso!.objetivo, placa, cont)[0]!;
      pts = [r[0]!, r[1]!];
    }
    const clave = pts ? `${t!.i}|${pts.join()}` : "";
    if (clave === this.manoClave && (!this.manoOculta || Date.now() - this.manoOculta < 4000)) return;
    this.manoClave = clave; this.manoOculta = 0;
    this.manoFant?.destroy(); this.manoFant = undefined;
    if (!pts) return this.mano.ocultar();
    if (pts.length === 2) return this.mano.tocar(pts[0]!, pts[1]!);
    this.manoFant = this.fantasma(z!.circuito, (paso!.pide as { arrastrar: string }).arrastrar).setDepth(949).setVisible(false);
    this.mano.arrastrar(pts[0]!, pts[1]!, pts[2]!, pts[3]!, this.manoFant);
  }

  /** Guía en partida: si la zona a la vista estrena mecánica (o medida) para este perfil, la abre. Nunca en el tutorial de Aprender. */
  private revisarGuiaPartida(p: Pantalla, z: ZonaView | undefined) {
    if (this.guiaP || this.net.tutorial || !z || z.reparada) return;
    const avisos = guiaPartida(z.circuito, p.pod?.nivel, this.guiaVistos, this.net.enLinea);
    if (!avisos.length) return;
    this.guiaP = { i: 0, pasos: avisos.flatMap((a) => a.pasos.map((texto, k) => ({ titulo: a.titulo, texto, obj: a.focos[k] === "pieza" && z.circuito === "cadena" ? "cadena" as const : a.focos[k]!, cont: !!a.cont }))) }; // la cadena se mide pieza a pieza
    // Vista al abrirse (no al cerrar): si la partida acaba con la guía abierta tampoco se repite.
    const perfil = avisos.reduce((q, a) => marcarTutorial(q, a.id), cargarPerfil(this.aliasPerfil()));
    guardarPerfil(perfil);
    this.guiaVistos = perfil.tutoriales;
    pausarJuego(true); // el reloj (y el del bot) se detiene mientras la guía está abierta
    this.chispa.poner("senalando"); this.chispaHasta = Infinity; // pintarChispa no le cambia la cara mientras la guía está abierta
    this.pintarGuiaPartida();
  }
  private pintarGuiaPartida() {
    const s = this.guiaP;
    this.guia.partida.caja.setVisible(!!s);
    this.leyenda.setVisible(!s && !this.tut?.activo);
    this.chispa.cont.setDepth(s || this.tut?.activo ? 892 : 20); // sobre el velo (880) mientras habla de la guía o del tutorial
    if (!s) return this.chispa.callar();
    this.chispa.decir(s.pasos[s.i]!.texto, undefined, 280); // sin caja: Chispa dice el paso
  }
  private siguienteGuiaPartida() {
    const s = this.guiaP;
    if (!s) return;
    if (s.i < s.pasos.length - 1) { s.i++; this.pintarGuiaPartida(); } else this.cerrarGuiaPartida();
  }
  /** ENTENDIDO en el último paso o SALTAR: un toque y se cierra (ya quedó guardada como vista al abrirse). */
  private cerrarGuiaPartida() {
    if (!this.guiaP) return;
    this.guiaP = null;
    pausarJuego(false);
    this.chispaHasta = 0;
    this.pintarGuiaPartida();
  }

  /** Qué señala Chispa. Tutorial: el objetivo del paso. Práctica: lo siguiente por hacer. Partidas (bot, 1v1, Oleadas): nada (sin pistas: justicia entre jugadores). */
  private objetivoSenal(p: Pantalla, z: ZonaView, placa: boolean): Objetivo | null {
    const t = this.tut;
    if (t?.activo) { const o = actual(t); return esFin(t) || o.libre ? null : o.objetivo; }
    if (this.guiaP) return this.guiaP.pasos[this.guiaP.i]!.obj; // guía de mecánica nueva: cómo se usa, no la respuesta
    if (!p.practica || p.oleadas) return null;
    if (z.reparada) return "check";
    const f = this.falta(z);
    if (placa) return f === "colocar" ? "gaveta" : f === "cablear" ? "pieza" : "check";
    if (z.circuito === "placa3") return f === "colocar" ? "gaveta" : this.eleccion(z) !== this.probadas.get(this.clave()) ? "check" : "pieza";
    if (conHueco(z.circuito, this.elegidas.get(this.clave()), z.reparada)) return "gaveta";
    if (this.eleccion(z) && this.eleccion(z) !== this.probadas.get(this.clave())) return "check"; // colocada y sin validar: lo siguiente es CHECK
    return p.esperaHasta > ahoraJuego() ? "multimetro" : "gaveta"; // en el enfriamiento, la luz del multímetro; luego, otra pieza
  }

  private pintarChispa(p: Pantalla, z: ZonaView, placa: boolean, fin: boolean, quemado: boolean) {
    const activo = !!this.tut?.activo, obj = fin ? null : this.objetivoSenal(p, z, placa);
    if (!activo) { // en el tutorial la expresión la pone pintarGuia
      this.exprBase = quemado ? "preocupada" : z.reparada ? "feliz" : obj ? "senalando" : "normal";
      if (Date.now() > this.chispaHasta) this.chispa.poner(this.exprBase);
    }
    if (p.eco && p.eco.n !== this.ecoVisto) {
      this.ecoVisto = p.eco.n;
      if (!activo && !this.guiaP) this.reaccionar(p, p.eco.tipo); // con la guía abierta el bocadillo es suyo
    }
  }

  /** Chispa reacciona al aviso del árbitro (racha, bono, fallo): ánimo y enfriamiento, nunca el contenido del pod. */
  private reaccionar(p: Pantalla, tipo: EcoTipo) {
    const m = reaccion(tipo, p.racha, Math.ceil(Math.max(0, p.esperaHasta - ahoraJuego()) / 1000));
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
    const clave = r ? `${r.join()}|${this.tut?.i}|${this.guiaP?.i}|${JSON.stringify(this.tut?.activo ? actual(this.tut).pide : null)}|${this.ranura.x},${this.ranura.y}|${this.zonaActual()?.opciones.join()}` : "";
    if (clave === s.clave) return;
    s.clave = clave;
    this.tweens.killTweensOf([s.flecha, ...s.chispitas]);
    s.c.setVisible(!!r);
    s.chispitas.forEach((c) => c.setAlpha(0));
    this.senalTag.setVisible(false);
    if (!r) return;
    let [cx, y, w, h] = r as [number, number, number, number];
    // Gaveta: la flecha marca el destino, el hueco rojo (la mano del tutorial lleva la pieza); en la cadena, el repuesto pedido.
    const z = this.zonaActual(), pide = this.tut?.activo ? actual(this.tut).pide : undefined, ids = z?.opciones ?? [], i = typeof pide === "object" ? ids.indexOf(pide.arrastrar) : -1;
    let x = obj === "check" ? cx + w / 2 - 36 : cx;
    if (obj === "gaveta" && !placa && z && z.circuito !== "placa3") {
      if (i >= 0 && z.circuito === "cadena") { const nb = ids.length; x = P.x + 180 + (i - (nb - 1) / 2) * (nb > 3 ? 88 : 116); }
      else if (z.circuito !== "cadena") [cx, y, w, h] = [P.x + this.ranura.x, P.y + this.ranura.y, this.hueco.width, this.hueco.height], x = cx; // el hueco dibujado, no el área generosa de soltar
      else x = cx + w / 2 - 36;
    } else if (obj === "gaveta") x = cx + w / 2 - 36;
    const abajo = y < 200;
    let fy = abajo ? y + h / 2 + 2 : y - h / 2 + (i >= 0 && z?.circuito === "cadena" ? 6 : -2); // sobre un botón de la gaveta la punta entra 6 px: no pisa el texto del objetivo // objetivos del HUD: la flecha va debajo y apunta hacia arriba
    if (obj === "circuito") { // paso de «mirar» sin mano: al LED apagado; si no, al hueco rojo
      const led = !!this.tut?.activo && !manoDe(actual(this.tut)) && cargas(z?.circuito ?? "led") > 0;
      x = P.x + (led ? 310 : this.ranura.x); fy = P.y + (led ? 56 : this.ranura.y - 24);
    }
    const lado = obj === "check"; // CHECK: la flecha entra por la derecha (encima pisaba el aviso de 2 líneas)
    if (lado) { x = cx + w / 2 - 16; fy = y; }
    s.flecha.setOrigin(0.5, 1).setAngle(lado ? 90 : abajo ? 180 : 0).setPosition(x, fy);
    if (REDUCIDO) return;
    this.tweens.add({ targets: s.flecha, ...(lado ? { x: x + 4 } : { y: abajo ? fy + 8 : fy - 8 }), duration: 400, yoyo: true, repeat: -1 });
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
    const pods = this.add.graphics().setDepth(20), etiqueta = letras(this, 270, 40, "LIMPIOS", 1.5, 0xe6ecff).setOrigin(0.5).setDepth(20); // HUD, sobre los 3 cuadros (x 246-294), a la izquierda de «Salir»
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
    if (avisoSabotajeVencido(p, ahora, this.humoLimpio)) this.net.limpiarAviso(); // vuelve el objetivo en la línea de estado
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
    for (let i = 0; i < PODS_LIMPIOS; i++) s.pods.fillStyle(i < p.limpios ? PISTA : 0x6b7599).fillRect(246 + i * 16, 47, 12, 12).lineStyle(2, OSCURO).strokeRect(246 + i * 16, 47, 12, 12);
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
    const div = this.zonaActual()?.circuito === "divisor", P = this.ui.panel, E = this.ui.escena, fila = P.y + this.filaDy() + 178, c = this.ui.contador.getBounds(), p3 = this.zonaActual()?.circuito === "placa3";
    const contador: [number, number, number, number] = [c.centerX, c.centerY, c.width + 16, c.height + 16];
    switch (o) {
      case "gaveta": if (p3) return [[P.x + 180, P.y - 28, 360, 50], [P.x + 180, P.y + 278, 358, 54]]; // pestañas y piezas de la gaveta
        return [placa ? [P.x + 180, P.y + 240, 220, 68] : [P.x + 180, P.y + GY, 358, GH + 6]];
      case "tension": return [[P.x + (cont ? 326 : 36), fila - 4, 68, 64]]; // «Toca Continuidad» usa el mismo objetivo que Tensión
      case "pieza": if (p3) return [[P.x + 180, P.y + 128, 354, 256]];
        return [div ? [P.x + MC.x + 30, P.y + MC.y + 10, 56, 68] : [P.x + 180, P.y + 44, 130, 92], [P.x + 180, fila, 110, 52]];
      case "carga": return [[P.x + 310, P.y + 76, 84, 118], [P.x + 180, fila, 110, 52]];
      case "cadena": { // la pieza localizada o, antes, toda la cadena
        const hs = huecosCadena(this.zonaActual()?.cadena?.length ?? 4), k = this.muertaLocalizada(), h = k ? hs[k - 1]! : null;
        return [h ? [P.x + h.x, P.y + 40, h.w + 10, 90] : [P.x + 200, P.y + 40, 300, 90], [P.x + 180, fila, 110, 52]];
      }
      case "contador": return [contador];
      case "multimetro": return [[P.x + 180, fila, 200, 64]];
      case "check": return [[P.x + 180, P.y + (p3 ? 350 : 340), 308, 52]];
      case "circuito": { const [x, y, w, h] = rectasTaller().circuito, b = this.ui.bocadillo.getBounds(); return [[P.x + x, P.y + y, w, h], [b.centerX, b.centerY, b.width, b.height]]; } // el circuito y el globo del reto
      case "pestanas": { const a = this.ui.pestanas[0]!.getBounds(), b = this.ui.pestanas[3]!.getBounds(); return [[(a.left + b.right) / 2, a.centerY, b.right - a.left, a.height]]; }
    }
  }

  private pintarGuia(placa: boolean) {
    const g = this.guia, t = this.tut, activo = !!t?.activo, ex = activo ? expresionGuia(actual(t!).texto, esFin(t!), this.estTut()) : "normal", clave = activo ? `${t!.i}${placa}${ex}` : "";
    if (clave === this.guiaClave) return;
    this.guiaClave = clave;
    g.caja.setVisible(activo);
    this.leyenda.setVisible(!activo); // bajo la caja del tutorial quedaba ilegible
    this.chispa.cont.setDepth(activo || this.guiaP ? 892 : 20);
    if (!t || !activo) return g.resaltes.forEach((r) => r.setVisible(false));
    const paso = actual(t), fin = esFin(t), basico = t.id === "basico";
    g.esquema.setVisible(!!paso.esquema);
    g.chispa.poner(ex);
    this.chispa.decir(paso.texto, undefined, 280); // sin caja de texto: Chispa dice la frase del paso
    g.saltar.t.setText("SALTAR");
    g.saltar.partes.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!fin));
    (g.saltar.partes[2] as Phaser.GameObjects.Zone).input!.enabled = !fin;
    g.fin.forEach((b, k) => {
      const ver = fin && !!mecanica(t.id) && (basico ? k === 2 : k > 0 || !!siguiente(t.id)); // «Primeros pasos» solo vuelve al menú
      b.t.setText(["Siguiente", "Práctica", "Menú"][k]!);
      b.partes.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(ver));
      (b.partes[2] as Phaser.GameObjects.Zone).input!.enabled = ver;
    });
    if (fin && basico && !this.saleBasico) { // terminado: queda visto y vuelve solo al menú
      this.saleBasico = true;
      try { marcarBasicoVisto(this.aliasPerfil(), localStorage); } catch { /* sin disco */ }
      this.timerSalirBasico = window.setTimeout(() => { if (this.sys.isActive() && this.tut?.id === "basico") void this.net.salir(); }, 3000); // tiempo real
    }
    const rs = this.rectas(paso.objetivo, placa, this.contPaso());
    g.resaltes.forEach((r, i) => { const x = rs[i]; r.setVisible(!!x); if (x) r.setPosition(x[0], x[1]).setSize(x[2] / 4, x[3] / 4); });
  }

  /** Medidor de aguja: veredicto del último «Probar» o, con el multímetro activo, la lectura (Nada/Parte/Toda o pasa/no pasa). */
  private pintarMedidor() {
    const u = this.ui, v = this.vistasVivas(this.net.estado)[this.zona], l = this.lectura;
    u.modos.forEach((m) => m.fondo.setTexture(m.modo === this.modo ? "boton_primario" : "boton_secundario"));
    const luz = this.modo ? undefined : luzValidacion(v); // undefined: lectura del modo activo; null: multímetro apagado (aún sin veredicto)
    this.apagado = luz === null && !this.net.estado.demo;
    (u.fila.list[1] as Phaser.GameObjects.Image).setAlpha(luz === null ? 0.4 : 1); // solo el dial se apaga: los botones de modo siguen vivos
    this.multi.cta.setVisible(this.apagado).setY(u.etiquetas[1]!.y);
    u.modos.forEach((m) => m.rotulo.setTint(this.apagado ? PISTA : GRIS));
    this.simbolo.setVisible(false);
    u.aguja.clearTint();
    u.etiquetas.forEach((e) => e.setTint(GRIS));
    if (luz !== undefined) { // validación: apagado hasta colocar la pieza; luego verde / ámbar / rojo según el veredicto del árbitro
      u.etiquetas.forEach((e, i) => e.setText(i === 1 && luz ? TEXTO_LUZ[luz] : ""));
      u.pasa.setVisible(false);
      if (luz) { u.etiquetas[1]!.setTint(COLOR_LUZ[luz]); u.aguja.setTint(COLOR_LUZ[luz]); }
      return u.aguja.setVisible(!!luz).setAngle(v?.aguja ? ANGULO[v.aguja] : 0);
    }
    const lv = this.modo && l && this.leida ? this.leida : null; // lectura interpretada: cifra con unidad + luz (✓ verde, ! ámbar, ✗ rojo)
    const cifra = lv ? `${lv.luz === "ambar" ? "! " : lv.luz === "gris" ? "? " : ""}${lv.cifra}` : "";
    const textos = this.modo === "tension" ? [TRAMO.nada.etiqueta, lv ? cifra : TRAMO.parte.etiqueta, TRAMO.toda.etiqueta] : ["", cifra, ""];
    u.etiquetas.forEach((e, i) => e.setText(textos[i]!));
    u.pasa.setVisible(this.modo === "continuidad" && !!l).setTexture(l?.pasa ? "icono_pasa" : "icono_no_pasa");
    const centro = u.etiquetas[1]!;
    this.simbolo.setVisible(this.modo === "tension" && (lv?.luz === "verde" || lv?.luz === "rojo")).setTexture(lv?.luz === "rojo" ? "icono_no_pasa" : "icono_pasa").setPosition(centro.x - centro.displayWidth / 2 - 14, centro.y);
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
      this.podDesde = ahoraJuego();
      this.limpiarMedida();
      // El «¡Pod despachado!» ya cumplió: al entrar el pod nuevo vuelve el objetivo.
      if (viejo) this.despachoHasta = Date.now() + CARTEL.avisoDespachoMs;
      if (viejo && num) this.abrirPuerta(p); else if (!num) this.puertaViva?.cerrar();
    }
    if (!this.podC) return;
    const m = podDe(pod.numero);
    this.podC.removeAll(true);
    this.ui.escena.bringToTop(this.ui.bocadillo); this.ui.escena.bringToTop(this.ui.globo); // la nave nunca tapa el enunciado
    for (const zona of m.orden) {
      const estado = estadoZona(pod, zona as ZonaNombre, this.vistasVivas(p), sinPista(p, ahoraJuego())), s = sprite(`${m.id}_${zona}_${estado}`)!;
      const o = s.offset ?? { x: 0, y: 0 };
      this.podC.add(img(this, o.x * K, o.y * K, s.nombre).setOrigin(0));
      if (estado === "averiado" || estado === "quemado") {
        const h = (s.puntos?.humo as { x: number; y: number } | undefined) ?? { x: s.ancho / 2, y: 0 };
        this.podC.add(anim(this, (o.x + h.x) * K, (o.y + h.y) * K, estado === "quemado" ? "humo_negro" : "humo"));
      }
    }
  }
}
