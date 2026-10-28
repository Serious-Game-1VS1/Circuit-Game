import { describe, expect, it } from "vitest";
import { generar } from "../../spike/src/engine/generador";
import { actual, avanzar, esFin, esUltimo, iniciar, permite, saltar, SEMILLA_TUTORIAL, SEMILLA_TUTORIAL_2, textoPaso, type EstadoTut } from "../src/tutorial";

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

  it("probar → quemado: cada número se muestra ≥0,7 s y en orden, aunque la condición ya se cumpla", () => {
    // Un cuadro cada 16 ms; el jugador elige 100 y pulsa Probar casi a la vez (quemado llega 50 ms después).
    const est = (ms: number): Partial<EstadoTut> => ms < 5000 ? { elegida: "100", aguja: "poco" } : { elegida: "100", quemado: true, aguja: "demasiado" };
    let t = avanzar(avanzar(iniciar(), { ...base, elegida: "1000" }, 1000), { ...base, aguja: "poco" }, 2000); // paso 3 desde t=2000
    const vistos: { n: number; desde: number; hasta: number }[] = [];
    for (let ms = 2000; ms < 8000; ms += 16) {
      const antes = t.i;
      t = avanzar(t, { ...base, ...est(ms) }, ms);
      if (t.i !== antes) { vistos.at(-1)!.hasta = ms; vistos.push({ n: t.i + 1, desde: ms, hasta: Infinity }); }
      else if (!vistos.length) vistos.push({ n: t.i + 1, desde: 2000, hasta: Infinity });
    }
    expect(vistos.map((v) => v.n)).toEqual([3, 4, 5]); // consecutivos
    vistos.slice(0, -1).forEach((v) => expect(v.hasta - v.desde).toBeGreaterThanOrEqual(700));
    expect(vistos[1]!.desde).toBeGreaterThanOrEqual(2700); // el 4 aparece en cuanto el 3 cumple su tiempo y no se salta
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

  it("jugador rápido: con el paso cumplido acepta la acción del siguiente (<700 ms), pero no la de dos pasos más allá", () => {
    const t = avanzar(iniciar(), base, 0); // paso 1 recién mostrado
    const elegida = { ...base, elegida: "1000" };
    expect(permite(t, "probar", elegida)).toBeNull(); // elegir 1000 y Probar al instante
    expect(permite(t, "probar", base)).not.toBeNull(); // sin cumplir el paso actual, no
    expect(permite(t, { elegir: "100" }, elegida)).not.toBeNull(); // paso 3 está dos adelante
    expect(avanzar(t, elegida, 100)).toBe(t); // el avance visual sigue esperando 0,7 s
    const t2 = { ...iniciar(2), i: 0 };
    expect(permite(t2, "probar", { ...base, circuito: "fusible", elegida: "3" })).toBeNull();
    expect(permite(t2, { elegir: "empalmar" }, { ...base, circuito: "fusible", elegida: "3" })).not.toBeNull();
  });

  it("elegir y Probar en el mismo cuadro (<50 ms): el estado se calcula al hacer clic, no el del cuadro anterior", () => {
    let elegida: string | undefined; // lo que el jugador tiene elegido ahora mismo
    const estado = (): EstadoTut => ({ ...base, elegida }); // como Taller.estTut(): se evalúa en cada clic
    let t = avanzar(iniciar(), { ...base, elegida: "1000" }, 0);
    for (let i = 0; i < 3; i++) t = { ...t, i: t.i + 1, desde: 0 };
    // buscar el paso «elegir» cuyo siguiente es «probar» y recorrerlo con clics rápidos
    const idx = t.pasos.findIndex((p, k) => typeof p.pide === "object" && t.pasos[k + 1]?.pide === "probar" && k >= 2);
    t = { ...t, i: idx, desde: 0 };
    const pide = (t.pasos[idx]!.pide as { elegir: string }).elegir;
    expect(permite(t, { elegir: pide }, estado())).toBeNull();
    elegida = pide; // el clic de elegir ya guardó la pieza; el update aún no corrió
    expect(permite(t, "probar", estado())).toBeNull();
    expect(avanzar(t, estado(), 40)).toBe(t); // 40 ms: el paso sigue siendo el mismo
    expect(permite(t, { elegir: "otra" }, estado())).not.toBeNull(); // ajeno: rechazado
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
  it("el texto de cada paso cabe en 4 líneas de la caja sin tocar los botones (<= 125 caracteres)", () => {
    for (const parte of [1, 2] as const) for (const p of iniciar(parte).pasos) expect(p.texto.length, p.titulo).toBeLessThanOrEqual(125);
  });

  it("avanza un paso por llamada: la numeración nunca salta (7/10 a 9/10)", () => {
    let t = avanzar(iniciar(), { ...base, elegida: "1000", aguja: "poco" });
    expect(t.i).toBe(1); // aunque el estado ya confirma los pasos 1 y 2
    t = avanzar(t, { ...base, elegida: "1000", aguja: "poco" });
    expect(t.i).toBe(2);
  });

  it("el paso del multímetro avisa del bloqueo y del cartel «SE QUEMÓ»", () => {
    const p = iniciar().pasos;
    expect(p[4]!.texto).toContain("bloqueado");
    expect(p[5]!.texto).toContain("cartel");
  });

  it("Tutorial 2: la semilla da fusible, resistencias, placa de luces y LED girado + corte en el pod 5 (nivel 2)", () => {
    const pods = generar(SEMILLA_TUTORIAL_2, 2, false);
    expect(pods[0]!.zonas).toMatchObject([{ circuito: "fusible", solucion: "1" }]);
    expect(pods[1]!.zonas[0]!.circuito).toBe("cabina");
    expect(pods[2]!.zonas[0]!.circuito).toBe("led");
    expect(pods[3]!.zonas).toMatchObject([{ circuito: "luces", solucion: "paralelo" }]);
    expect(pods[4]!.zonas).toMatchObject([{ zona: 0, circuito: "invertido", solucion: "directa" }, { zona: 2, circuito: "abierto", solucion: "empalmar" }]);
  });

  it("Tutorial 2: recorre los pasos con el estado real y termina en Despachar (sin botón de salida)", () => {
    const e = (x: Partial<EstadoTut>): EstadoTut => ({ ...base, ...x });
    const estados: EstadoTut[] = [
      e({ circuito: "fusible", elegida: "3" }), e({ circuito: "fusible", elegida: "3", quemado: true }),
      e({ circuito: "fusible", elegida: "1" }), e({ circuito: "fusible", elegida: "1", reparada: true }), e({ despachados: 1 }), e({ despachados: 3 }),
      e({ circuito: "luces", falta: "cablear", despachados: 3 }), e({ circuito: "luces", falta: null, despachados: 3 }), e({ circuito: "luces", reparada: true, despachados: 3 }),
      e({ despachados: 4 }), e({ circuito: "invertido", elegida: "directa", despachados: 4 }), e({ circuito: "invertido", reparada: true, despachados: 4 }),
      e({ circuito: "abierto", despachados: 4 }), e({ circuito: "abierto", elegida: "empalmar", despachados: 4 }), e({ circuito: "abierto", reparada: true, despachados: 4 }),
    ];
    let t = iniciar(2);
    expect(t.pasos).toHaveLength(estados.length + 1);
    estados.forEach((s, k) => { expect(avanzar(t, s).i).toBe(k + 1); t = avanzar(t, s); });
    expect(esUltimo(t)).toBe(true);
    expect(esFin(t)).toBe(false);
    expect(textoPaso(t)).toBe(`T2 ${estados.length + 1}/${estados.length + 1} Despacha`);
    expect(esFin(avanzar(iniciar(), base))).toBe(false);
  });

  it("Tutorial 2: la placa y las resistencias libres no se frenan; Probar solo en su paso", () => {
    const pasos = iniciar(2).pasos;
    const en = (titulo: string, k = 0) => ({ ...iniciar(2), i: pasos.findIndex((p, j) => p.titulo === titulo && j >= k) });
    expect(permite(en("Resistencias"), { elegir: "470" })).toBeNull();
    expect(permite(en("Cables"), "probar")).not.toBeNull();
    expect(permite(en("Prueba", 8), "probar")).toBeNull();
    expect(permite(en("Girar el LED"), { elegir: "inversa" })).not.toBeNull();
  });
});
