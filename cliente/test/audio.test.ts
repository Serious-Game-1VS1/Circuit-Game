import { afterEach, describe, expect, it, vi } from "vitest";
import type { End } from "../../spike/src/protocol";
import { alternarSilencio, desbloquear, eventosDe, medallaDe, reiniciar, setVolumen, silenciado, sonar, SONIDOS, volumen, type Evento } from "../src/audio";
import { BPM, escenaDe, pasoDe, ponerMusica, tensa, turbinaOff, turbinaOn } from "../src/musica";
import { inicial, reducir, type Pantalla } from "../src/pantalla";

afterEach(() => { reiniciar(); vi.unstubAllGlobals(); });

const vista = (aguja: "poco" | "correcto" | "demasiado" | null, quemado = false) => ({ aguja, quemado, cortocircuito: false, mensaje: "" });
const taller = (o: Partial<Pantalla> = {}): Pantalla => ({ ...inicial(), fase: "taller", station: "A", ...o });

describe("tabla de sonidos", () => {
  it("todos los eventos tienen notas válidas", () => {
    for (const ev of Object.keys(SONIDOS) as Evento[]) {
      expect(SONIDOS[ev].length).toBeGreaterThan(0);
      for (const x of SONIDOS[ev]) {
        expect(x.hz).toBeGreaterThan(0);
        expect(x.ms).toBeGreaterThan(10);
        expect(x.ms).toBeLessThan(800);
        expect(Number.isFinite(x.en + x.vol + (x.hasta ?? 1))).toBe(true);
      }
    }
  });
  it("la cuenta sube de 3 a 1 y «¡Ya!» es brillante y corto de pulso", () => {
    expect(SONIDOS.tic3[0]!.hz).toBeLessThan(SONIDOS.tic2[0]!.hz);
    expect(SONIDOS.tic2[0]!.hz).toBeLessThan(SONIDOS.tic1[0]!.hz);
    expect(SONIDOS.ya[0]!.hz).toBe(1000);
  });
  it("duraciones: despacho ~200 ms, ganaste <= 600 ms, tic ~25 ms", () => {
    const fin = (e: Evento) => Math.max(...SONIDOS[e].map((x) => x.en + x.ms));
    expect(fin("despacho")).toBeLessThanOrEqual(220);
    expect(fin("ganaste")).toBeLessThanOrEqual(600);
    expect(fin("tic3")).toBe(25);
  });
  it("cada evento tiene un sonido distinto", () => {
    const firmas = Object.values(SONIDOS).map((v) => JSON.stringify(v));
    expect(new Set(firmas).size).toBe(firmas.length);
  });
  it("las medallas dependen del ganador", () => {
    const end = (winner: "A" | "B" | null) => ({ t: "end", phase: "fin", winner, reason: "", score: {} }) as End;
    expect([medallaDe(end("A"), "A"), medallaDe(end("B"), "A"), medallaDe(end(null), "A")]).toEqual(["oro", "plata", "bronce"]);
  });
});

describe("eventos desde los cambios de pantalla", () => {
  it("veredictos", () => {
    const antes = taller();
    expect(eventosDe(antes, taller({ vistas: { 0: vista("poco") } }))).toEqual(["poco"]);
    // Dos zonas a la vez: un solo veredicto, el más grave.
    expect(eventosDe(antes, taller({ vistas: { 0: vista("correcto"), 1: vista("poco"), 2: vista("demasiado", true) } }))).toEqual(["quemada"]);
    expect(eventosDe(antes, taller({ vistas: { 0: vista("correcto"), 1: vista("poco"), 2: vista("demasiado") } }))).toEqual(["demasiado"]);
    expect(eventosDe(antes, taller({ vistas: { 0: vista("correcto"), 1: vista("poco") } }))).toEqual(["poco"]);
    expect(eventosDe(antes, taller({ vistas: { 0: { aguja: null, quemado: false, cortocircuito: true, mensaje: "" } } }))).toEqual(["fusible"]);
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
    expect(eventosDe(inicial(), c(3))).toEqual(["tic3"]);
    expect(eventosDe(c(3), c(3))).toEqual([]);
    expect(eventosDe(c(1), taller())).toEqual(["ya"]);
    expect(eventosDe(c(3), c(2))).toEqual(["tic2"]);
    expect(eventosDe(c(2), c(1))).toEqual(["tic1"]);
    const riv = (despachados: number) => taller({ rival: { alias: "R", despachados, estado: "ok" } as never });
    expect(eventosDe(riv(0), riv(1))).toEqual(["rival"]);
    expect(eventosDe(taller(), riv(1))).toEqual([]);
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
    expect(eventosDe(prac, finPrac)).toEqual(["correcto"]);
    expect(eventosDe(taller({ practica: true }), { ...inicial(), aviso: "Práctica terminada: ¡buen trabajo!" })).toEqual(["correcto"]);
  });
});

/** AudioContext simulado con todos los nodos que usa audio.ts/musica.ts; cuenta los arranques. */
function falso(estado = "suspended") {
  const empieza = vi.fn(), pulsoCreado = vi.fn(), compresor = { threshold: { value: 0 }, ratio: { value: 0 }, connect: vi.fn() };
  const gains: { gain: { value: number } }[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const buffers = vi.fn();
  class Falso {
    static ultimo: Falso;
    state = estado; currentTime = 0; sampleRate = 8000; destination = {};
    constructor() { Falso.ultimo = this; }
    resume = vi.fn(async () => { if (estado === "suspended") this.state = "running"; });
    createGain = () => { const g = { gain: param(), connect: vi.fn() }; gains.push(g); return g; };
    createDynamicsCompressor = () => compresor;
    createPeriodicWave = (...a: unknown[]) => { pulsoCreado(...a); return {}; };
    createBiquadFilter = () => ({ frequency: param(), connect: vi.fn(), type: "" });
    createOscillator = () => ({ frequency: param(), connect: vi.fn(), start: empieza, stop: vi.fn(), type: "", setPeriodicWave: vi.fn() });
    createBuffer = (_c: number, len: number) => { buffers(); return { length: len, getChannelData: () => new Float32Array(len) }; };
    createBufferSource = () => ({ connect: vi.fn(), start: empieza, stop: vi.fn(), buffer: null });
  }
  vi.stubGlobal("AudioContext", Falso);
  return { empieza, pulsoCreado, compresor, gains, buffers, ctx: () => Falso.ultimo };
}

describe("audio y silencio", () => {
  it("suspendido no suena ni acumula notas", () => {
    const f = falso("bloqueado"); // resume() no lo despierta: sigue sin estar «running»
    desbloquear();
    sonar("correcto");
    expect(f.empieza).not.toHaveBeenCalled();
  });
  it("sin AudioContext ni localStorage nada lanza", () => {
    expect(() => { desbloquear(); sonar("clic"); setVolumen(0.5); alternarSilencio(); alternarSilencio(); }).not.toThrow();
  });
  it("con AudioContext simulado suena, y en silencio no", () => {
    const f = falso();
    sonar("clic");
    expect(f.empieza).not.toHaveBeenCalled(); // aún sin gesto del usuario
    desbloquear();
    sonar("correcto");
    expect(f.empieza).toHaveBeenCalledTimes(SONIDOS.correcto.length);
    sonar("quemada");
    expect(f.empieza).toHaveBeenCalledTimes(SONIDOS.correcto.length + SONIDOS.quemada.length);
    expect(silenciado()).toBe(false);
    expect(alternarSilencio()).toBe(true);
    f.empieza.mockClear();
    sonar("correcto");
    expect(f.empieza).not.toHaveBeenCalled();
  });
  it("mezcla: compresor en master, buses de música y efectos, pulso calculado una vez y un solo búfer de ruido", () => {
    const f = falso();
    desbloquear();
    expect(f.compresor.threshold.value).toBe(-10);
    expect(f.compresor.ratio.value).toBe(4);
    expect(f.gains[0]!.gain.value).toBe(0.15); // master
    expect(f.gains[2]!.gain.value).toBe(0.25); // música ~12 dB bajo los efectos (que van a 1)
    sonar("correcto"); f.ctx().currentTime = 2; sonar("correcto");
    expect(f.pulsoCreado).toHaveBeenCalledTimes(1);
    sonar("poco"); f.ctx().currentTime = 4; sonar("pieza"); f.ctx().currentTime = 6; sonar("quemada");
    expect(f.buffers).toHaveBeenCalledTimes(1);
  });
  it("silencio y volumen actúan sobre el master (música incluida)", () => {
    const f = falso();
    desbloquear();
    const master = f.gains[0]!;
    setVolumen(0.4);
    expect(master.gain.value).toBe(0.4);
    alternarSilencio();
    expect(master.gain.value).toBe(0);
    alternarSilencio();
    expect(master.gain.value).toBe(0.4);
  });
  it("límites: máx. 3 efectos por segundo (los graves siempre suenan) y el rival como mucho cada 2 s", () => {
    const f = falso();
    desbloquear();
    for (const e of ["clic", "clic", "elegir", "cable"] as Evento[]) sonar(e);
    expect(f.empieza).toHaveBeenCalledTimes(SONIDOS.clic.length * 2 + SONIDOS.elegir.length); // el 4.º se descarta
    f.empieza.mockClear();
    sonar("quemada");
    expect(f.empieza).toHaveBeenCalledTimes(SONIDOS.quemada.length);
    f.empieza.mockClear(); f.ctx().currentTime = 10;
    sonar("rival"); f.ctx().currentTime = 11; sonar("rival");
    expect(f.empieza).toHaveBeenCalledTimes(SONIDOS.rival.length);
    f.ctx().currentTime = 12.5; sonar("rival");
    expect(f.empieza).toHaveBeenCalledTimes(SONIDOS.rival.length * 2);
  });
  it("ducking de la música en quemada", () => {
    const f = falso();
    desbloquear();
    sonar("quemada");
    const musica = f.gains[2]!.gain as unknown as { setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> };
    expect(musica.setValueAtTime).toHaveBeenCalledWith(0.125, 0);
    expect(musica.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, 0.4);
  });
});

describe("preferencias guardadas", () => {
  const guardar = () => {
    const m = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
  };
  it("el silencio se guarda en localStorage y se lee al reiniciar", () => {
    guardar();
    expect(alternarSilencio()).toBe(true);
    reiniciar();
    expect(silenciado()).toBe(true);
    expect(alternarSilencio()).toBe(false);
    reiniciar();
    expect(silenciado()).toBe(false);
  });
  it("el volumen se guarda; sin localStorage sigue en memoria", () => {
    guardar();
    expect(volumen()).toBe(0.15);
    setVolumen(0.6);
    reiniciar();
    expect(volumen()).toBe(0.6);
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } });
    reiniciar();
    expect(() => setVolumen(0.3)).not.toThrow();
    expect(volumen()).toBe(0.3);
  });
});

describe("música", () => {
  it("escena según la fase y tempos", () => {
    expect([escenaDe(inicial()), escenaDe(taller()), escenaDe(taller({ fase: "carrera" })), escenaDe(taller({ fase: "podio" }))]).toEqual(["menu", "taller", "carrera", "podio"]);
    expect([BPM.menu, BPM.taller, BPM.carrera, BPM.podio]).toEqual([96, 118, 150, 0]);
  });
  it("el taller se acelera con poco tiempo o riesgo (solo si hay reloj)", () => {
    expect(tensa(taller({ terminaEn: 100_000 }), 0)).toBe(true);
    expect(tensa(taller({ terminaEn: 300_000 }), 0)).toBe(false);
    expect(tensa(taller(), 0)).toBe(false); // sin reloj de partida
    expect(tensa(taller({ oleadas: true, quemadas: 2 }), 0)).toBe(true);
    expect(tensa(inicial(), 0)).toBe(false);
  });
  it("patrón de 16 pasos en La menor pentatónica con variación cada 4 compases", () => {
    const pent = [220, 261.63, 293.66, 329.63, 392];
    const enEscala = (hz: number) => pent.some((p) => { const r = Math.log2(hz / p) % 1; return Math.abs(r) < 0.001 || Math.abs(r) > 0.999; });
    for (const esc of ["menu", "taller", "carrera"] as const) {
      for (let c = 0; c < 8; c++) for (let p = 0; p < 16; p++) {
        const s = pasoDe(esc, p, c);
        if (s.arp) expect(enEscala(s.arp)).toBe(true);
        if (s.bajo) expect(enEscala(s.bajo)).toBe(true);
      }
    }
    const comp = (c: number) => Array.from({ length: 16 }, (_, p) => pasoDe("taller", p, c).arp).join();
    expect(comp(0)).toBe(comp(3));
    expect(comp(0)).not.toBe(comp(4));
    expect(pasoDe("taller", 0, 0).bajo).toBe(110);
  });
  it("arranca solo con audio listo, se detiene al cambiar a podio y respeta el silencio", () => {
    vi.useFakeTimers();
    try {
      const f = falso();
      ponerMusica(taller());
      vi.advanceTimersByTime(100);
      expect(f.empieza).not.toHaveBeenCalled(); // contexto aún sin crear
      desbloquear(); f.ctx().currentTime = 1;
      vi.advanceTimersByTime(30);
      const n1 = f.empieza.mock.calls.length;
      expect(n1).toBeGreaterThan(0);
      ponerMusica(taller({ fase: "podio" })); // fanfarria sin bucle
      f.ctx().currentTime = 5; vi.advanceTimersByTime(500);
      expect(f.empieza.mock.calls.length).toBe(n1);
      ponerMusica(taller()); alternarSilencio(); f.empieza.mockClear();
      f.ctx().currentTime = 9; vi.advanceTimersByTime(200);
      expect(f.empieza).not.toHaveBeenCalled();
    } finally {
      ponerMusica(taller({ fase: "podio" })); // limpia el intervalo
      vi.useRealTimers();
    }
  });
  it("la turbina solo suena con el audio listo y se puede parar", () => {
    const f = falso();
    turbinaOn();
    expect(f.empieza).not.toHaveBeenCalled();
    desbloquear();
    turbinaOn();
    expect(f.empieza).toHaveBeenCalledTimes(2); // sierra + LFO
    expect(() => turbinaOff()).not.toThrow();
  });
});
