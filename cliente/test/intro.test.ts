import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ Scene: class {} })); // la lógica pura no necesita el motor (no corre en Node)
import { marcarIntroVista, mostrarIntro } from "../src/intro";

const mem = (visto?: string) => { const d: Record<string, string> = visto ? { "circuitsync.intro": visto } : {}; return { getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => { d[k] = v; } }; };
const roto = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };

describe("intro", () => {
  it("primera vez: se muestra; después de marcarla, no", () => {
    const s = mem();
    expect(mostrarIntro("", s)).toBe(true);
    marcarIntroVista(s);
    expect(mostrarIntro("", s)).toBe(false);
  });
  it("?intro=1 fuerza y ?intro=0 omite", () => {
    expect(mostrarIntro("?intro=1", mem("1"))).toBe(true);
    expect(mostrarIntro("?x=2&intro=0", mem())).toBe(false);
  });
  it("storage roto o ausente no lanza", () => {
    expect(mostrarIntro("", roto)).toBe(true);
    expect(mostrarIntro("", undefined)).toBe(true);
    expect(() => marcarIntroVista(roto)).not.toThrow();
    expect(() => marcarIntroVista(undefined)).not.toThrow();
  });
});
