import { describe, expect, it } from "vitest";
import { generar } from "../../spike/src/engine/generador";
import { actual, avanzar, esUltimo, iniciar, permite, saltar, SEMILLA_TUTORIAL, textoPaso, type EstadoTut } from "../src/tutorial";

const base: EstadoTut = { modo: null, medido: false, quemado: false, reparada: false, despachados: 0 };

describe("tutorial interactivo", () => {
  it("los pasos dependen del primer pod de la semilla: Cabina a 9 V, 100/220/1000 Ω, sale 220", () => {
    const z = generar(SEMILLA_TUTORIAL, 1, false)[0]!.zonas;
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ circuito: "cabina", volts: 9, solucion: "220" });
    expect([...z[0]!.opciones].sort()).toEqual(["100", "1000", "220"]);
  });

  it("no avanza sin la acción pedida", () => {
    const t = iniciar();
    expect(avanzar(t, base)).toBe(t);
    expect(avanzar(t, { ...base, elegida: "220" }).i).toBe(0); // otra resistencia no vale
  });

  it("recorre los 10 pasos con el estado real del pod del tutorial (1000 poco, 100 quema, 220 correcto)", () => {
    const estados: Partial<EstadoTut>[] = [
      { elegida: "1000" }, { elegida: "1000", aguja: "poco" }, { elegida: "100", aguja: "poco" },
      { elegida: "100", aguja: "demasiado", quemado: true }, { elegida: "100", quemado: true, modo: "tension" },
      { elegida: "100", quemado: true, modo: "tension", medido: true }, { elegida: "220", quemado: true, modo: "tension", medido: true },
      { elegida: "220", aguja: "correcto", reparada: true }, { despachados: 1 },
    ];
    let t = iniciar();
    expect(t.pasos).toHaveLength(10);
    estados.forEach((e, k) => { t = avanzar(t, { ...base, ...e }); expect(t.i).toBe(k + 1); });
    expect(esUltimo(t)).toBe(true);
    expect(textoPaso(t)).toBe("10/10 ¡Listo!");
    expect(avanzar(t, { ...base, despachados: 5 })).toBe(t); // el último solo se deja con su botón
  });

  it("solo deja elegir la pieza del paso y Probar en los pasos de Probar", () => {
    const t = iniciar();
    expect(permite(t, { elegir: "1000" })).toBeNull();
    expect(permite(t, { elegir: "220" })).toBe("Sigue el paso: Frena la corriente");
    expect(permite(t, "probar")).not.toBeNull();
    const t2 = avanzar(t, { ...base, elegida: "1000" });
    expect(permite(t2, "probar")).toBeNull();
    expect(permite(t2, { elegir: "100" })).not.toBeNull();
  });

  it("saltar lo desactiva, libera todo y no pierde el paso", () => {
    const t = saltar(avanzar(iniciar(), { ...base, elegida: "1000" }));
    expect(t.activo).toBe(false);
    expect(actual(t).titulo).toBe("Prueba");
    expect(permite(t, { elegir: "220" })).toBeNull();
    expect(permite(null, "probar")).toBeNull();
  });

  it("cubre los conceptos pedidos con una frase cada uno", () => {
    const todo = iniciar().pasos.map((p) => p.texto).join(" ");
    for (const f of ["empuja corriente", "más ohmios (Ω), menos corriente", "se quema si le pasa demasiada", "Nada, Parte o Toda", "9 V empujan más que 5 V", "bloqueado", "Despachar"])
      expect(todo).toContain(f);
  });
});
