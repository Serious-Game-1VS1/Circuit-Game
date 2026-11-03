/**
 * «Puerta»: mini-pantalla mientras entra el siguiente pod, con una pregunta de 1 toque (resistencia o tensión).
 * Saltable, sin penalización de tiempo ni de puntos: solo refuerzo. La lógica es pura y determinista (generarPuerta);
 * el dibujo (mostrarPuerta) usa Phaser, temporizadores reales y respeta prefers-reduced-motion.
 */
import * as Phaser from "phaser";
import { sonar } from "./audio";
import { letras, marco, toque } from "./arte";

export type Puerta = {
  tipo: "resistencia" | "tension";
  pregunta: string;
  opciones: string[];
  correcta: number;
  explicacion: string;
  /** Resistencia a dibujar con sus bandas (claves de COLORES), si la pregunta la muestra. */
  imagen?: { bandas: string[] };
};

/** Colores del código que usan los valores del juego (pods.ts: 100, 220, 470 y 1000 Ω). */
export const COLORES: Record<string, number> = { marron: 0x8b4513, negro: 0x111111, rojo: 0xd32f2f, amarillo: 0xf2d023, violeta: 0x7e57c2 };
export const CODIGOS: Record<number, string[]> = {
  100: ["marron", "negro", "marron"], 220: ["rojo", "rojo", "marron"],
  470: ["amarillo", "violeta", "marron"], 1000: ["marron", "negro", "rojo"],
};
const VALORES = [100, 220, 470, 1000];
const ohm = (r: number) => `${r} Ω`;
const bandasTxt = (r: number) => CODIGOS[r]!.join("-").replace(/marron/g, "marrón");
const num = (v: number) => String(v).replace(".", ",");

const rng = (s: number) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Une la correcta con 2 distractores distintos, baraja y calcula el índice de la correcta. */
function armar(r: () => number, tipo: Puerta["tipo"], pregunta: string, ok: string, malas: string[], explicacion: string, imagen?: Puerta["imagen"]): Puerta {
  const ops = [ok, ...[...new Set(malas)].filter((m) => m !== ok).slice(0, 2)];
  for (let i = ops.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ops[i], ops[j]] = [ops[j]!, ops[i]!]; }
  return { tipo, pregunta, opciones: ops, correcta: ops.indexOf(ok), explicacion, imagen };
}

const BATS = [9, 6, 3.7];
const VAR1 = ["r-valor", "valor-r", "bateria"] as const;
const VAR2 = [...VAR1, "serie", "paralelo", "mitad", "dos-tercios"] as const;
type Var = (typeof VAR2)[number];

function construir(v: Var, r: () => number): Puerta {
  const R = VALORES[Math.floor(r() * 4)]!, otras = VALORES.filter((x) => x !== R);
  const V = BATS[Math.floor(r() * 3)]!;
  switch (v) {
    case "r-valor":
      return armar(r, "resistencia", "¿Qué valor tiene esta resistencia?", ohm(R), otras.map(ohm), `${bandasTxt(R)} es ${ohm(R)}.`, { bandas: CODIGOS[R]! });
    case "valor-r":
      return armar(r, "resistencia", `¿Qué bandas tiene la de ${ohm(R)}?`, bandasTxt(R), otras.map(bandasTxt), `${ohm(R)} se lee ${bandasTxt(R)}.`);
    case "bateria":
      return armar(r, "tension", `¿Qué marca el multímetro en una batería de ${num(V)} V?`, `${num(V)} V`,
        ["0 V", `${num(V * 2)} V`, `${num(V / 2)} V`], `Sin carga, la batería marca sus ${num(V)} V.`);
    case "serie":
      return armar(r, "resistencia", "Dos de 220 Ω en serie. ¿Cuánto suman?", "440 Ω", ["110 Ω", "220 Ω", "660 Ω"], "En serie se suman: 220 + 220 = 440 Ω.");
    case "paralelo":
      return armar(r, "resistencia", "Dos de 220 Ω en paralelo. ¿Cuánto dan?", "110 Ω", ["440 Ω", "220 Ω", "55 Ω"], "En paralelo, dos iguales dan la mitad: 110 Ω.");
    case "mitad":
      return armar(r, "tension", `Divisor con R1 = R2 y ${num(V)} V. ¿Cuánto marca al medio?`, `${num(V / 2)} V`,
        [`${num(V)} V`, "0 V", `${num(V / 4)} V`], `Con R1 = R2 la salida es la mitad: ${num(V / 2)} V.`);
    case "dos-tercios": { // R2 = 2·R1 se queda con 2/3 de la batería (9 V -> 6 V; 6 V -> 4 V)
      const B = r() < 0.5 ? 9 : 6, s = (B * 2) / 3;
      return armar(r, "tension", `Divisor con ${B} V y R2 el doble de R1. ¿Cuánto cae en R2?`, `${num(s)} V`,
        [`${num(B / 2)} V`, `${num(B / 3)} V`, `${num(B)} V`], `R2 se queda 2 de 3 partes: ${num(s)} V.`);
    }
  }
}

/** Puerta número `indice` de una partida: misma semilla, nivel e índice dan la misma puerta; nunca repite la variante de la anterior. */
export function generarPuerta(semilla: number, nivel: 1 | 2, indice: number): Puerta {
  const pool: readonly Var[] = nivel === 2 ? VAR2 : VAR1;
  let previa: Var | undefined, v: Var = pool[0]!, r = rng(0);
  for (let i = 0; i <= indice; i++) {
    r = rng((semilla ^ Math.imul(i + 1, 0x9e3779b1)) | 0);
    const cand = pool.filter((x) => x !== previa);
    v = cand[Math.floor(r() * cand.length)]!;
    previa = v;
  }
  return construir(v, r);
}

// ---------- dibujo ----------
const W = 360, DEPTH = 1900, ENTRADA_MS = 250, LEER_MS = 2600;
/** Tiempo para responder: 12 s + 80 ms por carácter de la pregunta y las opciones, entre 15 y 30 s (la barra corre solo tras mostrarla). */
export const duracionPuerta = (p: Puerta) => Math.min(30000, Math.max(15000, 12000 + 80 * (p.pregunta.length + p.opciones.join("").length)));
const reducido = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Dibuja la puerta sobre la escena. `onFin(true|false)` si respondió, `null` si saltó o se acabó el tiempo; se llama una vez.
 * Da `duracionPuerta(p)` para responder (la barra empieza al terminar de entrar las hojas); agotar el tiempo equivale a saltar, sin penalización.
 * Tras responder deja LEER_MS (2,6 s) para leer la explicación. Devuelve `cerrar()` para cerrarla
 * ya (p. ej. si el pod llegó); cuenta como `null`.
 */
export function mostrarPuerta(s: Phaser.Scene, p: Puerta, onFin: (acierto: boolean | null) => void, opts: { ms?: number } = {}): { cerrar: () => void } {
  const H = Math.max(640, s.cameras.main.height); // las hojas y su bloqueo cubren todo el lienzo (el Taller mide 800)
  const ms = opts.ms ?? duracionPuerta(p), quieto = reducido(), t0 = Date.now() + (quieto ? 0 : ENTRADA_MS);
  const o: Phaser.GameObjects.GameObject[] = [];
  const poner = <T extends Phaser.GameObjects.GameObject>(g: T, d = 1) => { o.push(g); (g as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH + d); return g; };
  const hojaI = poner(s.add.rectangle(0, H / 2, W / 2, H, 0x1c2233).setOrigin(0, 0.5).setStrokeStyle(3, 0x3a4466).setInteractive(), 0); // tapan y bloquean lo de abajo
  const hojaD = poner(s.add.rectangle(W, H / 2, W / 2, H, 0x1c2233).setOrigin(1, 0.5).setStrokeStyle(3, 0x3a4466).setInteractive(), 0);
  if (!quieto) {
    hojaI.x = -W / 2; hojaD.x = W + W / 2;
    s.tweens.add({ targets: hojaI, x: 0, duration: 220 }); s.tweens.add({ targets: hojaD, x: W, duration: 220 });
  }
  const txt = (y: number, t: string, k: number, color = 0xffffff) => poner(letras(s, W / 2, y, t, k, color).setOrigin(0.5, 0).setCenterAlign().setMaxWidth(W - 40));
  txt(36, "PASO 1", 2, 0xe0a43c);
  txt(64, p.pregunta, 2.5);
  if (p.imagen) { // resistencia: cuerpo beige, patas y 3 bandas
    const g = poner(s.add.graphics());
    g.fillStyle(0xaab4c0).fillRect(40, 168, 280, 6).fillStyle(0xd8c49a).fillRoundedRect(90, 146, 180, 50, 14);
    p.imagen.bandas.forEach((b, i) => g.fillStyle(COLORES[b] ?? 0xffffff).fillRect(116 + i * 42, 146, 22, 50));
    g.fillStyle(0xe0a43c).fillRect(236, 146, 10, 50); // tolerancia
  }

  let cerrado = false, respondido = false;
  let tCierre = 0, reloj = 0;
  const cierre = (a: boolean | null) => {
    if (cerrado) return; cerrado = true; window.clearInterval(reloj); window.clearTimeout(tCierre);
    const quitar = () => o.forEach((g) => g.destroy());
    if (quieto) quitar();
    else {
      hojaI.disableInteractive(); hojaD.disableInteractive();
      o.forEach((g) => { if (g !== hojaI && g !== hojaD) (g as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0); });
      s.tweens.add({ targets: hojaI, x: -W / 2, duration: 220 });
      s.tweens.add({ targets: hojaD, x: W + W / 2, duration: 220, onComplete: quitar });
    }
    onFin(a);
  };
  const oy = [250, 322, 394];
  const botones = p.opciones.map((t, i) => {
    const caja = poner(marco(s, W / 2, oy[i]!, "boton_secundario", 300, 56));
    poner(letras(s, W / 2, oy[i]!, t, 2.5).setOrigin(0.5));
    poner(toque(s, W / 2, oy[i]!, 300, 56, () => responder(i)));
    return caja;
  });
  function responder(i: number) {
    if (respondido || cerrado) return; respondido = true;
    const ok = i === p.correcta;
    sonar("clic");
    botones[i]!.setTint(ok ? 0x8fe3a0 : 0xe57373);
    botones[p.correcta]!.setTint(0x8fe3a0);
    txt(470, ok ? "¡CORRECTO! +XP" : "CASI", 3, ok ? 0x8fe3a0 : 0xe57373);
    txt(510, p.explicacion, 2);
    window.clearTimeout(tCierre);
    tCierre = window.setTimeout(() => cierre(ok), LEER_MS);
  }
  // Tiempo real; la barra solo informa, nunca castiga.
  poner(s.add.rectangle(30, 568, W - 60, 8, 0x3a4466).setOrigin(0, 0.5), 0);
  const barra = poner(s.add.rectangle(30, 568, W - 60, 8, 0x3bb273).setOrigin(0, 0.5));
  reloj = window.setInterval(() => { barra.width = Math.max(0, Math.min(W - 60, (W - 60) * (1 - (Date.now() - t0) / ms))); }, 60);
  tCierre = window.setTimeout(() => cierre(null), ms + ENTRADA_MS);
  poner(marco(s, W / 2, 606, "boton_secundario", 140, 44));
  poner(letras(s, W / 2, 606, "SALTAR", 2).setOrigin(0.5));
  poner(toque(s, W / 2, 606, 140, 48, () => cierre(null)));
  s.events.once("shutdown", () => { if (!cerrado) { cerrado = true; window.clearInterval(reloj); window.clearTimeout(tCierre); } });
  return { cerrar: () => cierre(null) };
}
