import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ Scene: class {} })); // la lógica pura no necesita el motor (no corre en Node)
import { lanzarIntro, mostrarIntro } from "../src/intro";

describe("intro", () => {
  it("sin parámetro se muestra siempre (cada carga)", () => {
    expect(mostrarIntro("")).toBe(true);
    expect(mostrarIntro("?x=2")).toBe(true);
  });
  it("?intro=0 omite; ?intro=1 y otros valores la muestran", () => {
    expect(mostrarIntro("?x=2&intro=0")).toBe(false);
    expect(mostrarIntro("?intro=1")).toBe(true);
    expect(mostrarIntro("?intro=")).toBe(true);
  });
  it("lanzarIntro arranca la escena Intro forzada (ignora ?intro=0)", () => {
    const start = vi.fn();
    lanzarIntro({ scene: { start } } as never);
    expect(start).toHaveBeenCalledWith("Intro", { forzar: true });
  });
});
