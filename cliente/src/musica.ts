/**
 * Música por escena y turbina de la carrera (Web Audio, sin archivos). PROVISIONAL, como audio.ts.
 * Un scheduler con lookahead (~0,1 s) programa 16 pasos por compás: bajo triangle, arpegio pulso 25 %, hi-hat de ruido,
 * en La menor pentatónica; el arpegio varía cada 4 compases. Solo suena cuando el audio está listo y no hay silencio.
 * pasoDe/escenaDe/tensa son puras (test/audio.test.ts).
 */
import { contexto, salidaSfx, silenciado, tocar } from "./audio";
import type { Pantalla } from "./pantalla";

export type Escena = "menu" | "taller" | "carrera" | "podio";
/** podio: 0 = sin bucle (la fanfarria la toca audio.ts por medalla). */
export const BPM: Record<Escena, number> = { menu: 96, taller: 118, carrera: 150, podio: 0 };

const ESC = [220, 261.63, 293.66, 329.63, 392]; // A C D E G
const grado = (g: number) => ESC[g % 5]! * 2 ** Math.floor(g / 5);
const BAJOS = [110, 130.81, 146.83, 98]; // A2 C3 D3 G2, uno por compás
const ARP_A = [0, 2, 4, 2, 3, 2, 4, 2, 0, 2, 4, 2, 3, 4, 5, 4];
const ARP_B = [4, 3, 2, 0, 2, 3, 4, 6, 5, 4, 3, 2, 4, 3, 2, 0];

/** Qué suena en el paso (0-15) del compás: frecuencias de bajo y arpegio, y si hay hi-hat. */
export function pasoDe(esc: Escena, paso: number, compas: number): { bajo?: number; arp?: number; hat: boolean } {
  const menu = esc === "menu";
  const arp = (compas >> 2) & 1 ? ARP_B : ARP_A; // variación cada 4 compases
  return {
    bajo: paso % (menu ? 8 : esc === "carrera" ? 2 : 4) === 0 ? BAJOS[compas % 4]! : undefined,
    arp: menu && paso % 2 ? undefined : grado(arp[paso]! + 5),
    hat: menu ? paso % 4 === 2 : paso % 2 === 1,
  };
}

export const escenaDe = (p: Pantalla): Escena => p.fase === "carrera" ? "carrera" : p.fase === "taller" ? "taller" : p.fase === "podio" || p.fase === "fin" ? "podio" : "menu";

/** Tempo más rápido en el taller cuando quedan menos de 2 min (duelo) o en Oleadas con 2 quemadas. */
export const tensa = (p: Pantalla, ahora: number): boolean =>
  p.fase === "taller" && ((!p.practica && p.terminaEn > 0 && p.terminaEn - ahora < 120000) || (p.oleadas && p.quemadas >= 2));

let escena: Escena | undefined, estado: Pantalla | undefined, reloj: ReturnType<typeof setInterval> | undefined;
let paso = 0, compas = 0, proxima = 0, oculto = false, vigila = false;

function tick() {
  const c = contexto();
  if (!escena || !BPM[escena] || !c || silenciado() || oculto) { proxima = 0; return; } // al volver, se reengancha sin acumular
  if (proxima < c.currentTime) proxima = c.currentTime + 0.05;
  while (proxima < c.currentTime + 0.1) {
    const paso16 = 60 / (BPM[escena] * (estado && tensa(estado, Date.now()) ? 1.12 : 1)) / 4, s = pasoDe(escena, paso, compas);
    if (s.bajo) tocar({ en: 0, hz: s.bajo, ms: paso16 * (escena === "menu" ? 1800 : 900), onda: "triangle", vol: 1 }, proxima, true);
    if (s.arp) tocar({ en: 0, hz: s.arp, ms: paso16 * 800, onda: "pulso", vol: 0.45 }, proxima, true);
    if (s.hat) tocar({ en: 0, hz: 8000, ms: 30, onda: "ruido", vol: 0.5 }, proxima, true);
    proxima += paso16;
    if (++paso === 16) { paso = 0; compas++; }
  }
}

/** Fija la música según la pantalla (o la escena indicada). Se detiene y reinicia al cambiar de escena. */
export function ponerMusica(p: Pantalla, nueva: Escena = escenaDe(p)): void {
  estado = p;
  if (!vigila && typeof document !== "undefined") { vigila = true; document.addEventListener("visibilitychange", () => { oculto = document.hidden; proxima = 0; }); }
  if (nueva === escena) return;
  escena = nueva; paso = compas = proxima = 0;
  if (BPM[nueva] && !reloj) reloj = setInterval(tick, 25);
  else if (!BPM[nueva] && reloj) { clearInterval(reloj); reloj = undefined; }
}

let turbina: (() => void) | undefined;

/** Turbina de la carrera: sierra 70 Hz + lowpass 400 Hz + LFO 6 Hz, solo mientras dura. */
export function turbinaOn(): void {
  const c = contexto();
  if (!c || turbina) return;
  try {
    const t = c.currentTime, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), prof = c.createGain();
    o.type = "sawtooth"; o.frequency.value = 70; lp.type = "lowpass"; lp.frequency.value = 400;
    lfo.frequency.value = 6; prof.gain.value = 0.12;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.2);
    lfo.connect(prof); prof.connect(g.gain);
    o.connect(lp); lp.connect(g);
    g.connect(salidaSfx()!);
    o.start(t); lfo.start(t);
    turbina = () => { const f = c.currentTime; g.gain.cancelScheduledValues(f); g.gain.linearRampToValueAtTime(0.0001, f + 0.2); o.stop(f + 0.25); lfo.stop(f + 0.25); };
  } catch { /* sin turbina */ }
}

export function turbinaOff(): void { turbina?.(); turbina = undefined; }
