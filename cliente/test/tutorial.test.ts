import { describe, expect, it } from "vitest";
import { actual, esUltimo, iniciar, saltar, siguiente, textoPaso } from "../src/tutorial";

describe("tutorial", () => {
  it("tiene 8 pasos y avanza hasta el último sin pasarse", () => {
    let t = iniciar();
    expect(t.pasos).toHaveLength(8);
    for (let i = 0; i < 20; i++) t = siguiente(t);
    expect(esUltimo(t)).toBe(true);
    expect(textoPaso(t)).toBe("8/8 La carrera final");
    expect(t.activo).toBe(true);
  });

  it("omite los pasos cuyo elemento no existe", () => {
    const t = iniciar(["multimetro"]);
    expect(t.pasos).toHaveLength(7);
    expect(t.pasos.some((p) => p.objetivo === "multimetro")).toBe(false);
  });

  it("el paso del multímetro dice el orden: pieza, Tensión, pieza", () => {
    expect(iniciar().pasos.find((p) => p.objetivo === "multimetro")!.texto).toBe("Primero pon una pieza. Luego toca Tensión y toca la pieza.");
  });

  it("saltar lo desactiva en cualquier paso y no pierde el paso", () => {
    const t = saltar(siguiente(iniciar()));
    expect(t.activo).toBe(false);
    expect(actual(t).titulo).toBe("Pon una pieza");
    expect(t.i).toBe(1);
  });
});
