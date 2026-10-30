import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ Scene: class {} })); // lógica pura: el motor no corre en Node
import { CELDAS, expresionGuia, mensajesMenu, pixeles, type Expresion } from "../src/chispa";
import { CONSEJOS } from "../src/vista";

describe("chispa: expresión de la guía", () => {
  it("fin y reparado = feliz; quemado = preocupada (gana a reparado); Toca/Pulsa = señalando", () => {
    expect(expresionGuia("Lo lograste.", true)).toBe("feliz");
    expect(expresionGuia("Rojo: se quema.", false, { quemado: true, reparada: false })).toBe("preocupada");
    expect(expresionGuia("Más ohmios.", false, { quemado: false, reparada: true })).toBe("feliz");
    expect(expresionGuia("Toca la pieza del centro.", false, { quemado: false, reparada: false })).toBe("senalando");
    expect(expresionGuia("Pulsa Probar.", false)).toBe("senalando");
    expect(expresionGuia("El LED solo pasa en un sentido.", false)).toBe("normal");
  });
});

describe("chispa: mensajes del menú", () => {
  const nuevo = { xp: 0, partidas: 0, tutoriales: [] as string[] };
  it("novato: primer pod primero y luego el consejo del día", () => {
    const m = mensajesMenu(nuevo, 10, 3);
    expect(m[0]!.texto).toBe("¡Tu primer pod te espera!");
    expect(m[1]!.texto).toBe(CONSEJOS[3]);
  });
  it("el consejo rota por día (también con día negativo) y con tutoriales hay felicitación", () => {
    expect(mensajesMenu({ ...nuevo, xp: 5 }, 10, CONSEJOS.length + 1)[0]!.texto).toBe(CONSEJOS[1]);
    expect(mensajesMenu({ ...nuevo, xp: 5 }, 10, -1)[0]!.texto).toBe(CONSEJOS[CONSEJOS.length - 1]);
    const m = mensajesMenu({ ...nuevo, xp: 5, tutoriales: ["a", "b"] }, 10, 0);
    expect(m.at(-1)).toEqual({ texto: "¡Bien! Ya llevas 2 de 10 tutoriales.", expr: "feliz" });
    expect(mensajesMenu({ ...nuevo, xp: 5, tutoriales: Array(10).fill("x") }, 10, 0).at(-1)!.texto).toMatch(/todos los tutoriales/);
  });
});

describe("chispa: dibujo", () => {
  it("cada expresión cabe en la cuadrícula y el parpadeo cambia los ojos", () => {
    for (const e of ["normal", "feliz", "preocupada", "senalando"] as Expresion[])
      for (const [x, y, w, h] of pixeles(e)) { expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); expect(x + w).toBeLessThanOrEqual(CELDAS); expect(y + h).toBeLessThanOrEqual(CELDAS); }
    expect(pixeles("normal", true)).not.toEqual(pixeles("normal"));
    expect(pixeles("senalando")).not.toEqual(pixeles("normal"));
  });
});
