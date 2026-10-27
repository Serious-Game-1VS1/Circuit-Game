/**
 * Audio básico (SCRUM-165): sonidos de 8 bits sintetizados con la Web Audio API, sin archivos.
 * PROVISIONAL: se cambiarán por sonidos propios. La tabla SONIDOS y eventosDe() son puras (test/audio.test.ts);
 * lo demás toca AudioContext y es un no-op silencioso si el navegador no lo tiene.
 */
import type { Pantalla } from "./pantalla";

export type Evento =
  | "clic" | "pieza" | "cable" | "correcto" | "poco" | "demasiado" | "rechazo" | "quemada" | "reparada"
  | "despacho" | "tic" | "ya" | "ganaste" | "perdiste" | "practica";

/** Una nota: `en` ms tras el inicio, `hz` (y `hasta` si barre), duración `ms`, forma de onda. */
export interface Nota { en: number; hz: number; hasta?: number; ms: number; onda: "square" | "triangle" | "sawtooth" | "ruido"; vol: number }
const n = (en: number, hz: number, ms: number, onda: Nota["onda"] = "square", vol = 1, hasta?: number): Nota => ({ en, hz, ms, onda, vol, hasta });

export const SONIDOS: Record<Evento, Nota[]> = {
  clic: [n(0, 660, 50)],
  pieza: [n(0, 440, 45, "triangle"), n(45, 587, 55, "triangle")],
  cable: [n(0, 880, 35), n(40, 1175, 50)],
  correcto: [n(0, 523, 90), n(90, 784, 160)],
  poco: [n(0, 330, 130, "triangle"), n(130, 262, 180, "triangle")],
  demasiado: [n(0, 392, 90, "sawtooth", 0.7), n(90, 262, 90, "sawtooth", 0.7), n(180, 196, 160, "sawtooth", 0.7)],
  rechazo: [n(0, 220, 120, "square", 0.8)],
  quemada: [n(0, 110, 320, "ruido", 1), n(0, 140, 320, "sawtooth", 0.5, 60)],
  reparada: [n(0, 523, 80), n(80, 659, 80), n(160, 784, 80), n(240, 1047, 220)],
  despacho: [n(0, 392, 70), n(70, 523, 70), n(140, 659, 70), n(210, 784, 200, "square", 1, 1047)],
  tic: [n(0, 600, 90, "triangle")],
  ya: [n(0, 1200, 260)],
  ganaste: [n(0, 523, 120), n(120, 659, 120), n(240, 784, 120), n(360, 1047, 380)],
  perdiste: [n(0, 392, 160, "triangle"), n(160, 330, 160, "triangle"), n(320, 262, 360, "triangle")],
  practica: [n(0, 523, 100), n(100, 659, 100), n(200, 784, 260)],
};

/** Eventos que se oyen al pasar de una pantalla a otra (veredictos, rechazos, despacho, cuenta, fin). */
export function eventosDe(prev: Pantalla, next: Pantalla): Evento[] {
  const e: Evento[] = [];
  for (const [k, v] of Object.entries(next.vistas ?? {})) {
    if (prev.vistas?.[Number(k)] === v) continue;
    const reparada = next.pod?.zonas.find((z) => z.zona === Number(k))?.reparada;
    e.push(v.quemado || v.cortocircuito ? "quemada" : v.aguja === "correcto" ? (reparada ? "reparada" : "correcto") : v.aguja === "demasiado" ? "demasiado" : "poco");
  }
  // Falla encadenada: la zona sigue dañada pero el acierto suena como cualquier «correcto».
  if (next.aviso?.startsWith("¡Hay más!") && prev.aviso !== next.aviso) e.push("correcto");
  if (!e.length && next.fase === "taller" && next.esperaHasta !== prev.esperaHasta) e.push("rechazo");
  if (prev.despachando && !next.despachando && next.despachados > prev.despachados) e.push("despacho");
  if (next.fase === "cuenta" && (prev.fase !== "cuenta" || prev.cuenta !== next.cuenta)) e.push("tic");
  if (prev.fase === "cuenta" && next.fase === "taller") e.push("ya");
  // Sin station (práctica/tutorial: el reductor reinicia el estado) no hay ganador ni perdedor que anunciar.
  if (!prev.end && next.end && next.end.winner && next.station && !prev.practica) e.push(next.end.winner === next.station ? "ganaste" : "perdiste");
  if (next.fase === "entrar" && next.aviso?.startsWith("Práctica terminada") && prev.aviso !== next.aviso) e.push("practica");
  return e;
}

// --- Parte que toca el navegador ---
const CLAVE = "circuitsync-mudo", VOLUMEN = 0.15;
let ctx: AudioContext | undefined, mudo: boolean | undefined;

const nuevoContexto = (): AudioContext | undefined => {
  try {
    const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
    const K = C.AudioContext ?? C.webkitAudioContext;
    return K ? new K() : undefined;
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

export function alternarSilencio(): boolean {
  mudo = !silenciado();
  try { localStorage.setItem(CLAVE, mudo ? "1" : "0"); } catch { /* sigue en memoria */ }
  if (!mudo) sonar("clic");
  return mudo;
}

export function sonar(evento: Evento): void {
  try {
    if (silenciado() || !ctx || ctx.state !== "running") return; // suspendido: no acumular notas para soltarlas al reanudar
    const t0 = ctx.currentTime;
    for (const nota of SONIDOS[evento]) {
      const t = t0 + nota.en / 1000, fin = t + nota.ms / 1000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(VOLUMEN * nota.vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, fin);
      g.connect(ctx.destination);
      if (nota.onda === "ruido") {
        const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * nota.ms / 1000), ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const s = ctx.createBufferSource();
        s.buffer = b; s.connect(g); s.start(t);
      } else {
        const o = ctx.createOscillator();
        o.type = nota.onda;
        o.frequency.setValueAtTime(nota.hz, t);
        if (nota.hasta) o.frequency.exponentialRampToValueAtTime(nota.hasta, fin);
        o.connect(g); o.start(t); o.stop(fin + 0.02);
      }
    }
  } catch { /* el audio nunca debe romper el juego */ }
}

/** Solo para pruebas: olvida contexto y mute. */
export function reiniciar(): void { ctx = undefined; mudo = undefined; }

/** Botón ♪/× de silencio (zona táctil 44×44). Importa Phaser solo como tipo. */
export function botonSilencio(s: import("phaser").Scene, x: number, y: number) {
  const t = s.add.text(x, y, "", { fontSize: "22px", color: "#fff", backgroundColor: "#3a4466", fixedWidth: 44, fixedHeight: 44, align: "center", padding: { y: 8 } })
    .setOrigin(0.5).setDepth(1000).setInteractive({ useHandCursor: true });
  const pintar = () => t.setText(silenciado() ? "×" : "♪");
  t.on("pointerdown", () => { desbloquear(); alternarSilencio(); pintar(); });
  pintar();
  return t;
}
