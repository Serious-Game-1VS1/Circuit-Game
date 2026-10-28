/**
 * Audio «Taller de 8 bits» (SCRUM-165): efectos sintetizados con la Web Audio API, sin archivos.
 * PROVISIONAL (afinable): identidad propia en La menor pentatónica (A C D E G); timbres: triangle para bajo/melodía,
 * pulso 25 % para acentos, ruido filtrado para chispa/relé/tick, seno para el ding del LED, sierra solo en fusible y turbina.
 * Regla de gesto: acierto = ascendente y mayor; fallo = descendente o con ruido. La tabla SONIDOS y eventosDe() son puras
 * (test/audio.test.ts); lo demás toca AudioContext y es un no-op silencioso si el navegador no lo tiene. La música vive en musica.ts.
 */
import type { End, Station } from "../../spike/src/protocol";
import type { Pantalla } from "./pantalla";

export type Evento =
  | "clic" | "elegir" | "pieza" | "cable" | "correcto" | "poco" | "demasiado" | "rechazo" | "fusible" | "quemada" | "reparada" | "insignia"
  | "despacho" | "rival" | "tic3" | "tic2" | "tic1" | "ya" | "listo" | "ganaste" | "perdiste" | "oro" | "plata" | "bronce";

/** Una nota: `en` ms tras el inicio, `hz` (y `hasta` si barre), duración `ms`. En "ruido", `hz` es el centro del filtro pasabanda. */
export interface Nota { en: number; hz: number; hasta?: number; ms: number; onda: "pulso" | "triangle" | "sawtooth" | "seno" | "ruido"; vol: number }
const n = (en: number, hz: number, ms: number, onda: Nota["onda"] = "pulso", vol = 1, hasta?: number): Nota => ({ en, hz, ms, onda, vol, hasta });

export const SONIDOS: Record<Evento, Nota[]> = {
  clic: [n(0, 880, 40, "pulso", 0.6)],
  elegir: [n(0, 660, 35, "triangle", 0.5)],
  pieza: [n(0, 900, 30, "ruido", 1.5), n(0, 220, 70, "triangle", 1, 110)], // «thunk» de relé
  cable: [n(0, 294, 35, "triangle", 0.9), n(35, 392, 45, "triangle", 0.9)],
  correcto: [n(0, 523, 80, "pulso", 0.7), n(80, 659, 150, "pulso", 0.7)],
  poco: [n(0, 2500, 110, "ruido", 1.2, 900), n(0, 330, 110, "triangle", 0.5, 247)], // «pff»
  demasiado: [n(0, 294, 150, "triangle", 0.8, 784), n(0, 5000, 150, "ruido", 0.8)],
  rechazo: [n(0, 110, 150, "pulso", 0.9), n(0, 500, 150, "ruido", 1.2)], // «bzzt»
  fusible: [n(0, 1200, 260, "sawtooth", 0.5, 200), n(0, 800, 260, "ruido", 1, 300)],
  quemada: [n(0, 6000, 60, "ruido", 1.5), n(0, 110, 320, "triangle", 1, 55), n(20, 300, 250, "ruido", 1)],
  reparada: [n(0, 880, 350, "seno", 1), n(0, 1760, 200, "seno", 0.3)], // ding de LED
  insignia: [n(0, 440, 80, "pulso", 0.6), n(80, 523, 80, "pulso", 0.6), n(160, 659, 80, "pulso", 0.6), n(240, 1319, 320, "seno", 0.8)],
  despacho: [n(0, 1200, 25, "ruido", 1.2), n(10, 392, 90, "triangle", 1), n(100, 587, 110, "triangle", 1)],
  rival: [n(0, 330, 60, "triangle", 0.3), n(60, 440, 80, "triangle", 0.3)],
  tic3: [n(0, 1000, 25, "ruido", 1.5)],
  tic2: [n(0, 1500, 25, "ruido", 1.5)],
  tic1: [n(0, 2200, 25, "ruido", 1.5)],
  ya: [n(0, 1000, 200, "pulso", 1), n(0, 2000, 90, "seno", 0.3)],
  listo: [n(0, 587, 50, "triangle", 0.5), n(50, 784, 100, "triangle", 0.5)],
  ganaste: [n(0, 523, 100), n(100, 659, 100), n(200, 784, 100), n(300, 1047, 300, "triangle"), n(300, 131, 300, "triangle", 0.8)],
  perdiste: [n(0, 330, 200, "triangle", 1, 247), n(200, 247, 200, "triangle", 1, 196), n(400, 196, 400, "triangle", 1, 110), n(400, 300, 400, "ruido", 0.8, 120)],
  oro: [n(0, 523, 110), n(110, 659, 110), n(220, 784, 110), n(330, 1047, 140), n(470, 1319, 500, "triangle"), n(0, 131, 470, "triangle", 0.8)],
  plata: [n(0, 392, 120), n(120, 523, 120), n(240, 659, 420, "triangle")],
  bronce: [n(0, 330, 120), n(120, 392, 120), n(240, 523, 300, "triangle")],
};

/** Veredicto de una zona, de más a menos importante: solo suena uno por actualización. */
const VEREDICTOS: Evento[] = ["quemada", "fusible", "demasiado", "poco", "reparada", "correcto"];

/** Eventos que se oyen al pasar de una pantalla a otra (veredicto, rechazo, despacho, rival, cuenta, fin). */
export function eventosDe(prev: Pantalla, next: Pantalla): Evento[] {
  const e: Evento[] = [], ver: Evento[] = [];
  for (const [k, v] of Object.entries(next.vistas ?? {})) {
    if (prev.vistas?.[Number(k)] === v) continue;
    const reparada = next.pod?.zonas.find((z) => z.zona === Number(k))?.reparada;
    ver.push(v.quemado ? "quemada" : v.cortocircuito ? "fusible" : v.aguja === "correcto" ? (reparada ? "reparada" : "correcto") : v.aguja === "demasiado" ? "demasiado" : "poco");
  }
  // Falla encadenada: la zona sigue dañada pero el acierto suena como cualquier «correcto».
  if (next.aviso?.startsWith("¡Hay más!") && prev.aviso !== next.aviso) ver.push("correcto");
  const v = VEREDICTOS.find((x) => ver.includes(x));
  if (v) e.push(v);
  else if (next.fase === "taller" && next.esperaHasta !== prev.esperaHasta) e.push("rechazo");
  if (prev.despachando && !next.despachando && next.despachados > prev.despachados) e.push("despacho");
  if (next.rival && prev.rival && next.rival.despachados > prev.rival.despachados) e.push("rival");
  if (next.fase === "cuenta" && (prev.fase !== "cuenta" || prev.cuenta !== next.cuenta)) e.push(next.cuenta <= 1 ? "tic1" : next.cuenta === 2 ? "tic2" : "tic3");
  if (prev.fase === "cuenta" && next.fase === "taller") e.push("ya");
  // Sin station (práctica/tutorial: el reductor reinicia el estado) no hay ganador ni perdedor que anunciar.
  if (!prev.end && next.end && next.end.winner && next.station && !prev.practica) e.push(next.end.winner === next.station ? "ganaste" : "perdiste");
  if (next.fase === "entrar" && next.aviso?.startsWith("Práctica terminada") && prev.aviso !== next.aviso) e.push("correcto");
  return e;
}

/** Fanfarria del podio: ganador oro, perdedor plata, empate bronce. */
export const medallaDe = (e: End, yo?: Station): Evento => e.winner === null ? "bronce" : e.winner === yo ? "oro" : "plata";

// --- Parte que toca el navegador ---
const CLAVE = "circuitsync-mudo", CLAVE_VOL = "circuitsync-volumen", VOLUMEN = 0.15, MUSICA = 0.25; // música ~12 dB bajo los efectos
const MAX_VOCES = 6, MAX_EFECTOS = 3; // simultáneas / por segundo; los eventos de PRIORIDAD no se descartan
const PRIORIDAD = new Set<Evento>(["quemada", "fusible", "ganaste", "perdiste", "oro", "plata", "bronce"]);
const DUCKING = new Set<Evento>(["quemada", "ganaste", "perdiste"]); // la música baja ~6 dB durante ~400 ms
const ESPERA_MS: Partial<Record<Evento, number>> = { rival: 2000 };
let ctx: AudioContext | undefined, mudo: boolean | undefined, vol: number | undefined;
let master: GainNode | undefined, sfx: GainNode | undefined, mus: GainNode | undefined, ruido: AudioBuffer | undefined, onda: PeriodicWave | undefined;
let finales: number[] = [], recientes: number[] = [], ultimo: Partial<Record<Evento, number>> = {};

const construir = (c: AudioContext) => {
  master = c.createGain();
  master.gain.value = silenciado() ? 0 : volumen();
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10; comp.ratio.value = 4;
  master.connect(comp); comp.connect(c.destination);
  sfx = c.createGain(); sfx.connect(master);
  mus = c.createGain(); mus.gain.value = MUSICA; mus.connect(master);
};

const nuevoContexto = (): AudioContext | undefined => {
  try {
    const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
    const K = C.AudioContext ?? C.webkitAudioContext;
    if (!K) return undefined;
    const c = new K();
    construir(c);
    return c;
  } catch { return undefined; }
};

/** Llamar en un gesto del usuario: los móviles no dejan sonar antes. */
export function desbloquear(): void {
  try {
    ctx ??= nuevoContexto();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch { /* sin audio */ }
}

/** Cierto si el contexto ya suena (en iOS puede seguir suspendido tras un gesto). */
export const audioListo = (): boolean => ctx?.state === "running";

/** Contexto para la música y la turbina (musica.ts), solo si ya suena. */
export const contexto = (): AudioContext | undefined => (audioListo() ? ctx : undefined);

/** Bus de efectos (la turbina de musica.ts cuelga de aquí). */
export const salidaSfx = (): GainNode | undefined => sfx;

/** Reintenta desbloquear en cada gesto y deja de escuchar solo cuando el contexto está `running`. */
export function desbloquearEnGestos(): void {
  const gestos = ["pointerdown", "pointerup", "touchend", "click"];
  const al = () => { desbloquear(); if (audioListo()) gestos.forEach((g) => removeEventListener(g, al, true)); };
  gestos.forEach((g) => addEventListener(g, al, { capture: true }));
}

export function silenciado(): boolean {
  if (mudo === undefined) {
    try { mudo = localStorage.getItem(CLAVE) === "1"; } catch { mudo = false; }
  }
  return mudo;
}

export function volumen(): number {
  if (vol === undefined) {
    try { const v = parseFloat(localStorage.getItem(CLAVE_VOL) ?? ""); vol = v >= 0 && v <= 1 ? v : VOLUMEN; } catch { vol = VOLUMEN; }
  }
  return vol;
}

export function setVolumen(v: number): void {
  vol = Math.min(1, Math.max(0, v));
  try { localStorage.setItem(CLAVE_VOL, String(vol)); } catch { /* sigue en memoria */ }
  if (master && !silenciado()) master.gain.value = vol;
}

export function alternarSilencio(): boolean {
  mudo = !silenciado();
  try { localStorage.setItem(CLAVE, mudo ? "1" : "0"); } catch { /* sigue en memoria */ }
  if (master) master.gain.value = mudo ? 0 : volumen(); // mudo silencia también la música y la turbina
  if (!mudo) sonar("clic");
  return mudo;
}

/** Pulso al 25 % (calculado una vez): coeficientes de Fourier de un tren de pulsos con ciclo 0,25. */
const pulso = (c: AudioContext) => onda ??= c.createPeriodicWave(Float32Array.from({ length: 33 }, (_, k) => (k ? (2 * Math.sin(k * Math.PI * 0.25)) / (k * Math.PI) : 0)), new Float32Array(33));

/** Programa una nota en el instante absoluto `t` del bus de efectos (o el de música). */
export function tocar(nota: Nota, t: number, musica = false): void {
  const c = ctx, destino = musica ? mus : sfx;
  if (!c || !destino) return;
  const fin = t + nota.ms / 1000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(nota.vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, fin);
  g.connect(destino);
  if (nota.onda === "ruido") {
    if (!ruido) { // un solo búfer de 1 s para todos los golpes de ruido
      ruido = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = ruido.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(), f = c.createBiquadFilter();
    s.buffer = ruido; f.type = "bandpass";
    f.frequency.setValueAtTime(nota.hz, t);
    if (nota.hasta) f.frequency.exponentialRampToValueAtTime(nota.hasta, fin);
    s.connect(f); f.connect(g); s.start(t); s.stop(fin + 0.02);
  } else {
    const o = c.createOscillator();
    if (nota.onda === "pulso") o.setPeriodicWave(pulso(c)); else o.type = nota.onda === "seno" ? "sine" : nota.onda;
    o.frequency.setValueAtTime(nota.hz, t);
    if (nota.hasta) o.frequency.exponentialRampToValueAtTime(nota.hasta, fin);
    o.connect(g); o.start(t); o.stop(fin + 0.02);
  }
}

export function sonar(evento: Evento): void {
  try {
    if (silenciado() || !ctx || !sfx || ctx.state !== "running") return; // suspendido: no acumular notas para soltarlas al reanudar
    const t0 = ctx.currentTime, notas = SONIDOS[evento], prio = PRIORIDAD.has(evento);
    if (t0 - (ultimo[evento] ?? -9) < (ESPERA_MS[evento] ?? 0) / 1000) return;
    finales = finales.filter((f) => f > t0); recientes = recientes.filter((r) => r > t0 - 1);
    if (!prio && (recientes.length >= MAX_EFECTOS || finales.length + notas.length > MAX_VOCES)) return;
    ultimo[evento] = t0; recientes.push(t0);
    for (const nota of notas) { tocar(nota, t0 + nota.en / 1000); finales.push(t0 + (nota.en + nota.ms) / 1000); }
    if (DUCKING.has(evento) && mus) { mus.gain.setValueAtTime(MUSICA / 2, t0); mus.gain.linearRampToValueAtTime(MUSICA, t0 + 0.4); }
  } catch { /* el audio nunca debe romper el juego */ }
}

/** Solo para pruebas: olvida contexto, mute y volumen. */
export function reiniciar(): void {
  ctx = mudo = vol = master = sfx = mus = ruido = onda = undefined;
  finales = []; recientes = []; ultimo = {};
}

/** Botón ♪/× de silencio (zona táctil 44×44). Importa Phaser solo como tipo. */
export function botonSilencio(s: import("phaser").Scene, x: number, y: number) {
  const t = s.add.text(x, y, "", { fontSize: "22px", color: "#fff", backgroundColor: "#3a4466", fixedWidth: 44, fixedHeight: 44, align: "center", padding: { y: 8 } })
    .setOrigin(0.5).setDepth(1000).setInteractive({ useHandCursor: true });
  const pintar = () => t.setText(silenciado() ? "×" : "♪");
  t.on("pointerdown", () => { desbloquear(); alternarSilencio(); pintar(); });
  pintar();
  return t;
}
