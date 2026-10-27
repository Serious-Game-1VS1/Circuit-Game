import { afterEach, describe, expect, it, vi } from "vitest";
import type { End } from "../../spike/src/protocol";
import { alternarSilencio, desbloquear, eventosDe, reiniciar, silenciado, sonar, SONIDOS, type Evento } from "../src/audio";
import { inicial, reducir, type Pantalla } from "../src/pantalla";

afterEach(() => { reiniciar(); vi.unstubAllGlobals(); });

const vista = (aguja: "poco" | "correcto" | "demasiado" | null, quemado = false) => ({ aguja, quemado, cortocircuito: false, mensaje: "" });
const taller = (o: Partial<Pantalla> = {}): Pantalla => ({ ...inicial(), fase: "taller", station: "A", ...o });

describe("tabla de sonidos", () => {
  it("todos los eventos tienen notas válidas", () => {
    for (const ev of ["clic", "pieza", "cable", "correcto", "poco", "demasiado", "rechazo", "quemada", "reparada", "despacho", "tic", "ya", "ganaste", "perdiste", "practica"] as Evento[]) {
      expect(SONIDOS[ev].length).toBeGreaterThan(0);
      for (const x of SONIDOS[ev]) {
        expect(x.hz).toBeGreaterThan(0);
        expect(x.ms).toBeGreaterThan(10);
        expect(x.ms).toBeLessThan(800);
        expect(Number.isFinite(x.en + x.vol + (x.hasta ?? 1))).toBe(true);
      }
    }
  });
  it("«¡Ya!» suena más agudo que el tic", () => {
    expect(SONIDOS.ya[0]!.hz).toBeGreaterThan(SONIDOS.tic[0]!.hz);
  });
});

describe("eventos desde los cambios de pantalla", () => {
  it("veredictos", () => {
    const antes = taller();
    expect(eventosDe(antes, taller({ vistas: { 0: vista("poco") } }))).toEqual(["poco"]);
    expect(eventosDe(antes, taller({ vistas: { 0: vista("demasiado") } }))).toEqual(["demasiado"]);
    expect(eventosDe(antes, taller({ vistas: { 0: vista("correcto") } }))).toEqual(["correcto"]);
    expect(eventosDe(antes, taller({ vistas: { 0: vista("demasiado", true) } }))).toEqual(["quemada"]);
    const mismo = taller({ vistas: { 0: vista("poco") } });
    expect(eventosDe(mismo, { ...mismo })).toEqual([]);
  });
  it("rechazo, despacho, cuenta y ya", () => {
    expect(eventosDe(taller(), taller({ esperaHasta: 5 }))).toEqual(["rechazo"]);
    expect(eventosDe(taller({ despachando: true }), taller({ despachados: 1 }))).toEqual(["despacho"]);
    expect(eventosDe(taller({ despachando: true }), taller({ despachando: false }))).toEqual([]);
    const c = (cuenta: number): Pantalla => ({ ...inicial(), fase: "cuenta", cuenta });
    expect(eventosDe(inicial(), c(3))).toEqual(["tic"]);
    expect(eventosDe(c(3), c(3))).toEqual([]);
    expect(eventosDe(c(1), taller())).toEqual(["ya"]);
  });
  it("fin y práctica terminada", () => {
    const end = (winner: "A" | "B" | null) => ({ t: "end", phase: "fin", winner, reason: "", score: {} }) as End;
    expect(eventosDe(taller(), taller({ fase: "carrera", end: end("A") }))).toEqual(["ganaste"]);
    expect(eventosDe(taller(), taller({ fase: "carrera", end: end("B") }))).toEqual(["perdiste"]);
    expect(eventosDe(taller(), taller({ fase: "carrera", end: end(null) }))).toEqual([]);
    const fin = taller({ fase: "carrera", end: end("A") });
    expect(eventosDe(fin, { ...fin, fase: "podio" })).toEqual([]);
    // Fin de práctica real: el reductor deja el estado sin station y el árbitro pone winner "A": solo suena «práctica».
    const prac = taller({ practica: true }), finPrac = reducir(prac, end("A"), 0);
    expect(eventosDe(prac, finPrac)).toEqual(["practica"]);
    expect(eventosDe(taller({ practica: true }), { ...inicial(), aviso: "Práctica terminada: ¡buen trabajo!" })).toEqual(["practica"]);
  });
});

describe("audio y silencio", () => {
  it("suspendido no suena ni acumula notas", () => {
    const empieza = vi.fn();
    const param = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    class Suspendido {
      state = "suspended"; currentTime = 0; sampleRate = 8000; destination = {};
      resume = vi.fn(async () => {});
      createGain = () => ({ gain: param, connect: vi.fn() });
      createOscillator = () => ({ frequency: param, connect: vi.fn(), start: empieza, stop: vi.fn(), type: "" });
    }
    vi.stubGlobal("AudioContext", Suspendido);
    desbloquear();
    sonar("correcto");
    expect(empieza).not.toHaveBeenCalled();
  });
  it("sin AudioContext ni localStorage nada lanza", () => {
    expect(() => { desbloquear(); sonar("clic"); alternarSilencio(); alternarSilencio(); }).not.toThrow();
  });
  it("con AudioContext simulado suena, y en silencio no", () => {
    const empieza = vi.fn();
    const param = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    class Falso {
      state = "suspended"; currentTime = 0; sampleRate = 8000; destination = {};
      resume = vi.fn(async () => { this.state = "running"; });
      createGain = () => ({ gain: param, connect: vi.fn() });
      createOscillator = () => ({ frequency: param, connect: vi.fn(), start: empieza, stop: vi.fn(), type: "" });
      createBuffer = (_c: number, len: number) => ({ length: len, getChannelData: () => new Float32Array(len) });
      createBufferSource = () => ({ connect: vi.fn(), start: empieza, buffer: null });
    }
    vi.stubGlobal("AudioContext", Falso);
    sonar("clic");
    expect(empieza).not.toHaveBeenCalled(); // aún sin gesto del usuario
    desbloquear();
    sonar("correcto");
    expect(empieza).toHaveBeenCalledTimes(SONIDOS.correcto.length);
    sonar("quemada");
    expect(empieza).toHaveBeenCalledTimes(SONIDOS.correcto.length + SONIDOS.quemada.length);
    expect(silenciado()).toBe(false);
    expect(alternarSilencio()).toBe(true);
    empieza.mockClear();
    sonar("correcto");
    expect(empieza).not.toHaveBeenCalled();
  });
});

describe("preferencia de silencio guardada", () => {
  it("se guarda en localStorage y se lee al reiniciar", () => {
    const m = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
    expect(alternarSilencio()).toBe(true);
    reiniciar();
    expect(silenciado()).toBe(true);
    expect(alternarSilencio()).toBe(false);
    reiniciar();
    expect(silenciado()).toBe(false);
  });
});
