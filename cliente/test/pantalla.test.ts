import { describe, expect, it } from "vitest";
import { avisoVivo, inicial, reducir, reloj, textoFin, textoRival, validarEntrada } from "../src/pantalla";

describe("lógica de pantalla", () => {
  it("valida código (6) y alias (1–12)", () => {
    expect(validarEntrada("ab12cd", "ana")).toBeNull();
    expect(validarEntrada("ab12c", "ana")).toMatch(/código/);
    expect(validarEntrada("ab12cd", "   ")).toMatch(/alias/);
    expect(validarEntrada("ab12cd", "trece_letras!")).toMatch(/alias/);
  });

  it("si la cuenta se cancela, vuelve a la sala", () => {
    const p = reducir({ ...inicial(), fase: "cuenta" }, { t: "lobby", phase: "esperando", players: [] }, 0);
    expect(p.fase).toBe("sala");
  });

  it("texto del rival sin piezas ni soluciones", () => {
    expect(textoRival({ alias: "beto", despachados: 2, estado: "sin-conexion" })).toBe("beto: 2/5 pods · sin conexión");
    expect(textoRival(null)).toBe("Rival: —");
  });

  it("reloj mm:ss que no baja de cero", () => {
    const p = { ...inicial(), terminaEn: 65_000 };
    expect(reloj(p, 0)).toBe("1:05");
    expect(reloj(p, 99_000)).toBe("0:00");
  });

  it("el 'espera N s' del bloqueo descuenta en vivo y desaparece al terminar", () => {
    const p = reducir(inicial(), { t: "reject", seq: 1, t0: 0, reason: "quemada", waitMs: 5000 }, 0);
    expect(avisoVivo(p, 0)).toBe("Pieza quemada: espera 5 s");
    expect(avisoVivo(p, 3200)).toBe("Pieza quemada: espera 2 s");
    expect(avisoVivo(p, 5000)).toBe("Pieza quemada: ya puedes volver a probar");
    const q = { ...p, aviso: "Poco: el LED casi no brilla · espera 2 s", esperaHasta: 2000 };
    expect(avisoVivo(q, 1500)).toBe("Poco: el LED casi no brilla · espera 1 s");
    expect(avisoVivo(q, 2000)).toBe("Poco: el LED casi no brilla");
    expect(avisoVivo({ ...q, aviso: "Espera 2 s para volver a probar esta zona" }, 2000)).toBe("Ya puedes volver a probar");
  });

  it("al reconectar en el taller, el welcome no devuelve a la sala", () => {
    const p = reducir({ ...inicial(), fase: "taller" }, { t: "welcome", station: "B", alias: "beto" }, 0);
    expect(p.fase).toBe("taller");
  });

  it("empate y anulada", () => {
    expect(textoFin({ t: "end", phase: "fin", winner: null, reason: "tiempo", score: {} }, "A").titulo).toBe("Empate");
    expect(textoFin({ t: "end", phase: "anulada", winner: null, reason: "x", score: {} }, "A").titulo).toBe("Partida anulada");
  });
});
