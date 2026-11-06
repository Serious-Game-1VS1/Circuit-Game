import { afterEach, describe, expect, it, vi } from "vitest";
import { ahoraJuego, juegoPausado, pausarJuego } from "../src/relojJuego";
import { guiaPartida, MECANICAS } from "../src/tutorial";
import { modoBloqueado, T } from "../src/multimetro";
import { preferenciasSolo } from "../src/perfil";

afterEach(() => { pausarJuego(false); vi.useRealTimers(); });

describe("reloj de la partida", () => {
  it("se detiene mientras la guía está abierta y sigue desde donde quedó", () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const a = ahoraJuego();
    vi.setSystemTime(2000); pausarJuego(true);
    const congelado = ahoraJuego();
    vi.setSystemTime(9000);
    expect(juegoPausado()).toBe(true);
    expect(ahoraJuego()).toBe(congelado);
    pausarJuego(false);
    expect(ahoraJuego()).toBe(congelado); // sin salto al reanudar
    vi.setSystemTime(9500);
    expect(ahoraJuego() - a).toBe(1500); // 1000 antes de pausar + 500 después; los 7000 de pausa no cuentan
  });
});

describe("guía en partida y duelo en línea", () => {
  it("en duelo en línea no hay guía (y por tanto nada se marca como visto)", () => {
    expect(guiaPartida("fusible", 2, [], false).length).toBeGreaterThan(0);
    expect(guiaPartida("fusible", 2, [], true)).toEqual([]);
  });
});

describe("textos del fusible coherentes con el modelo", () => {
  const texto = (id: string) => JSON.stringify(MECANICAS.find((m) => m.id === id)!.pasos);
  it("nivel 2: la falla pasa 2,5 A; nivel 3: la falla pasa 2,3 A (1,3 × 1,8 A)", () => {
    expect(texto("fusible")).toContain("2,5 A");
    expect(texto("fusible")).not.toContain("pasan 3 A");
    expect(texto("fusibles")).toContain("2,3 A");
    expect(texto("fusibles")).not.toContain("no corta con 1,8 A");
  });
});

describe("cadena: solo continuidad", () => {
  it("bloquea la tensión sólo en la cadena", () => {
    expect(modoBloqueado("cadena", "tension")).toBe(true);
    expect(modoBloqueado("cadena", "continuidad")).toBe(false);
    expect(modoBloqueado("led", "tension")).toBe(false);
    expect(T.soloContinuidad).toBe("En esta falla mide continuidad.");
  });
});

describe("preferencias de Jugar solo", () => {
  const alm = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });
  it("perfil nuevo: nivel 1 y bot Fácil", () => {
    expect(preferenciasSolo(alm({}))).toEqual({ dif: "facil", nivBot: "1" });
    expect(preferenciasSolo(null)).toEqual({ dif: "facil", nivBot: "1" });
  });
  it("respeta lo guardado", () => {
    expect(preferenciasSolo(alm({ "circuitsync.dificultad": "dificil", "circuitsync.nivelbot": "mixto" }))).toEqual({ dif: "dificil", nivBot: "mixto" });
  });
});

describe("medir y guía abierta", () => {
  it("la medida se congela con la guía y nunca da tiempo negativo", async () => {
    const { lecturaLista } = await import("../src/multimetro");
    vi.useFakeTimers(); vi.setSystemTime(1000);
    pausarJuego(true); vi.setSystemTime(5000); pausarJuego(false); // una guía previa deja ahoraJuego atrasado
    const m = { seq: 1, desde: ahoraJuego(), punto: "pieza" }, medida = { seq: 1 } as never;
    expect(ahoraJuego() - m.desde).toBe(0);
    vi.setSystemTime(6000); pausarJuego(true); vi.setSystemTime(20000); // guía abierta >3 s
    expect(lecturaLista(m, medida, ahoraJuego(), 3000)).toBeNull();
    pausarJuego(false); vi.setSystemTime(22000);
    expect(lecturaLista(m, medida, ahoraJuego(), 3000)).toBe(medida);
  });
});
