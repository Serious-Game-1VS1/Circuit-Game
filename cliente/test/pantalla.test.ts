import { describe, expect, it } from "vitest";
import { avisoVivo, despachable, faltan, inicial, textoRechazo, pistaDemo, tarjetaVisible, reducir, reloj, textoFin, textoRival, validarEntrada } from "../src/pantalla";
import type { PodView, ServerMsg } from "../../spike/src/protocol";
import { vistaDeVeredicto } from "../src/vista";
import { eventosDe } from "../src/audio";

describe("start tras una práctica", () => {
  it("borra el end anterior para que suenen ganaste/perdiste en el duelo siguiente", () => {
    const end = { t: "end", phase: "fin", winner: "A", reason: "", score: {} } as const;
    const tras = reducir({ ...inicial(), practica: true }, end, 0);
    expect(tras.end).toBeDefined();
    const p = reducir(tras, { t: "start", despachados: 0, total: 5, pod: { numero: 1, zonas: [] }, rival: null, restanteMs: 1000 } as never, 0);
    expect(p.end).toBeUndefined();
  });
});

describe("Oleadas y escudo (práctica)", () => {
  const pod: PodView = { numero: 1, zonas: [{ zona: 0, nombre: "radar", circuito: "led", volts: 9, opciones: ["a", "b"], reparada: false }] };
  const start = (p = inicial()) => reducir(p, { t: "start", despachados: 0, total: 0, oleadas: true, practica: true, pod, rival: null, restanteMs: 0, nivel: 1, demo: false }, 0);
  const result = (veredicto: "se quema" | "corto" | "poco", escudo?: true): ServerMsg => ({ t: "result", seq: 1, t0: 0, zona: 0, veredicto, waitMs: 0, despachados: 0, pod, ...(escudo && { escudo }) });

  it("el start de Oleadas marca la partida, sin total, y empieza sin quemadas", () => {
    expect(start()).toMatchObject({ oleadas: true, total: 0, quemadas: 0, practica: true });
    expect(start({ ...inicial(), quemadas: 2 }).quemadas).toBe(0);
  });

  it("cuenta las quemadas (se quema y corto), no los fallos normales", () => {
    let p = start();
    p = reducir(p, result("poco"), 0);
    expect(p.quemadas).toBe(0);
    p = reducir(p, result("se quema"), 0);
    p = reducir(p, result("corto"), 0);
    expect(p.quemadas).toBe(2);
  });

  it("con Escudo la quemada no cuenta ni muestra tarjeta, y el mensaje lo dice", () => {
    const p = reducir(start(), result("se quema", true), 1000);
    expect(p.quemadas).toBe(0);
    expect(p.tarjeta).toBeNull();
    expect(p.vistas[0]).toMatchObject({ quemado: false });
    expect(p.aviso).toMatch(/Escudo/);
  });
});

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
    const q = { ...p, aviso: "El LED casi no brilla · espera 2 s", esperaHasta: 2000 };
    expect(avisoVivo(q, 1500)).toBe("El LED casi no brilla · espera 1 s");
    expect(avisoVivo(q, 2000)).toBe("El LED casi no brilla");
    expect(avisoVivo({ ...q, aviso: "Espera 2 s y vuelve a probar" }, 2000)).toBe("Ya puedes volver a probar");
  });

  it("al reconectar en el taller, el welcome no devuelve a la sala", () => {
    const p = reducir({ ...inicial(), fase: "taller" }, { t: "welcome", station: "B", alias: "beto" }, 0);
    expect(p.fase).toBe("taller");
  });

  it("en práctica el welcome no pasa por la Sala; en duelo sí", () => {
    const w = { t: "welcome", station: "A", alias: "ana" } as const;
    expect(reducir({ ...inicial(), practica: true }, w, 0).fase).toBe("entrar");
    expect(reducir(inicial(), w, 0).fase).toBe("sala");
  });

  it("empate y anulada", () => {
    expect(textoFin({ t: "end", phase: "fin", winner: null, reason: "tiempo", score: {} }, "A").titulo).toBe("Empate");
    expect(textoFin({ t: "end", phase: "anulada", winner: null, reason: "x", score: {} }, "A").titulo).toBe("Partida anulada");
  });

  const pod = { numero: 2, zonas: [
    { zona: 0, nombre: "radar" as const, circuito: "led" as const, volts: 9, opciones: ["220", "1000", "470"], reparada: false },
    { zona: 3, nombre: "reactor" as const, circuito: "fusible" as const, volts: 9, opciones: ["3", "0.5", "1"], reparada: true },
  ] };
  const taller = { ...inicial(), fase: "taller" as const, despachados: 1, pod };

  it("pieza quemada: mensaje según el circuito y tarjeta de al menos 3 s solo en esa zona", () => {
    const p = reducir(taller, { t: "result", seq: 1, t0: 0, zona: 0, veredicto: "se quema", waitMs: 4000, despachados: 1, pod }, 0);
    expect(p.vistas[0]).toMatchObject({ quemado: true, mensaje: "¡El LED se quemó! Frenaste muy poco. Espera y prueba una que frene más." });
    expect(tarjetaVisible(p, 0, 3000)).toBe(true);
    expect(tarjetaVisible(p, 3, 1000)).toBe(false);
    expect(tarjetaVisible(p, 0, 4000)).toBe(false);
  });

  it("al reparar una zona con otras pendientes, el aviso nombra las que faltan", () => {
    const pod2 = { ...pod, zonas: pod.zonas.map((z) => ({ ...z, reparada: false })) };
    const bien = { ...pod2, zonas: [{ ...pod2.zonas[0]!, reparada: true }, pod2.zonas[1]!] };
    const p = reducir(taller, { t: "result", seq: 1, t0: 0, zona: 0, veredicto: "correcto", waitMs: 0, despachados: 1, pod: bien }, 0);
    expect(p.aviso).toBe("¡Correcto! Falta reparar: Reactor");
    expect(faltan(pod2)).toBe("Radar, Reactor");
    expect(faltan(undefined)).toBe("");
  });

  it("rechazo sin cambios con dirección", () => {
    expect(textoRechazo("sin-cambios", 0)).toBe("No cambiaste nada. Cambia una pieza o un cable y prueba.");
  });

  it("al reparar la última zona 'Despachar' se activa; el contador sube solo con la confirmación del árbitro", () => {
    expect(despachable(taller)).toBe(false);
    const hecho = { ...pod, zonas: pod.zonas.map((z) => ({ ...z, reparada: true })) };
    const p = reducir(taller, { t: "result", seq: 1, t0: 0, zona: 0, veredicto: "correcto", waitMs: 0, despachados: 1, pod: hecho }, 0);
    expect(p).toMatchObject({ despachados: 1, aviso: "¡Pod reparado! Pulsa Despachar" });
    expect(despachable(p)).toBe(true);
    expect(despachable({ ...p, despachando: true })).toBe(false); // sin doble envío mientras espera
    const sig = { numero: 3, zonas: [{ ...pod.zonas[0]!, zona: 1, nombre: "cabina" as const, circuito: "cabina" as const }] };
    const q = reducir({ ...p, despachando: true }, { t: "despachado", seq: 2, t0: 0, despachados: 2, pod: sig }, 0);
    expect(q).toMatchObject({ pod: sig, aviso: "¡Pod despachado!", vistas: {}, despachados: 2, despachando: false });
    const r = reducir({ ...p, despachando: true }, { t: "reject", seq: 2, t0: 0, reason: "faltan zonas por reparar", waitMs: 0 }, 0);
    expect(r).toMatchObject({ despachados: 1, despachando: false, aviso: "Faltan zonas por reparar" });
  });

  it("el start guarda el nivel y el modo demo y limpia lo del pod anterior", () => {
    const p = reducir({ ...taller, despachando: true, tarjeta: { zona: 0, hasta: 9e9 } },
      { t: "start", restanteMs: 1000, despachados: 1, total: 5, nivel: 2, demo: true, pod, rival: null }, 0);
    expect(p).toMatchObject({ nivel: 2, demo: true, despachando: false, tarjeta: null, vistas: {} });
    expect(inicial().demo).toBe(false);
  });
  it("la lectura del multímetro solo se guarda: no toca aviso, bloqueo ni veredictos", () => {
    const p = { ...inicial(), fase: "taller" as const, aviso: "¡Correcto!", esperaHasta: 5 };
    const q = reducir(p, { t: "medida", seq: 4, t0: 0, zona: 1, modo: "continuidad", punto: "carga1", pasa: true }, 100);
    expect(q).toEqual({ ...p, medida: { t: "medida", seq: 4, t0: 0, zona: 1, modo: "continuidad", punto: "carga1", pasa: true } });
  });

  it("modo demo: pista del primer pod (elegir → probar) que desaparece al primer intento", () => {
    const p = { ...inicial(), fase: "taller" as const, demo: true, pod: { ...pod, numero: 1 } };
    expect(pistaDemo(p, false, "elegir")).toBe("elegir");
    expect(pistaDemo(p, false, null)).toBe("probar");
    expect(pistaDemo(p, true, null)).toBeNull();
    expect(pistaDemo({ ...p, vistas: { 0: vistaDeVeredicto("poco") } }, false, null)).toBeNull();
    expect(pistaDemo({ ...p, pod: { ...pod, numero: 2 } }, false, "elegir")).toBeNull();
    expect(pistaDemo({ ...p, demo: false }, false, "elegir")).toBeNull();
  });

  it("demo de cableado: pista colocar → cablear → probar, y se va al primer intento", () => {
    const p = { ...inicial(), fase: "taller" as const, demo: true, pod: { ...pod, numero: 1 } };
    expect(pistaDemo(p, false, "colocar")).toBe("colocar");
    expect(pistaDemo(p, false, "cablear")).toBe("cablear");
    expect(pistaDemo(p, false, null)).toBe("probar");
    expect(pistaDemo(p, true, "cablear")).toBeNull();
  });
});

describe("falla encadenada (Oleadas)", () => {
  const zona = (reparada: boolean, volts: number) => ({ zona: 0, nombre: "radar" as const, circuito: "led" as const, volts, opciones: ["100", "470"], reparada });
  const p0: PodView = { numero: 7, zonas: [zona(false, 4.5)] };
  const segunda: PodView = { numero: 7, zonas: [zona(false, 9)] };
  const result = (pod: PodView, hayMas?: true): ServerMsg => ({ t: "result", seq: 1, t0: 0, zona: 0, veredicto: "correcto", waitMs: 0, despachados: 6, pod, ...(hayMas && { hayMas }) });
  const antes = { ...inicial(), fase: "taller" as const, oleadas: true, pod: p0, vistas: { 0: vistaDeVeredicto("poco", "led") } };

  it("hayMas: la zona sigue dañada con su segunda falla, la aguja vuelve a cero y el aviso lo anuncia", () => {
    const p = reducir(antes, result(segunda, true), 0);
    expect(p.vistas).toEqual({});
    expect(p.pod?.zonas[0]).toMatchObject({ volts: 9, reparada: false });
    expect(p.aviso).toMatch(/^¡Hay más! Radar tiene otra falla/);
    expect(despachable(p)).toBe(false);
  });

  it("sin hayMas un acierto sigue siendo un acierto normal", () => {
    const p = reducir(antes, result({ numero: 7, zonas: [zona(true, 4.5)] }), 0);
    expect(p.vistas[0]).toBeDefined();
    expect(p.aviso).toMatch(/Despachar/);
  });

  it("suena como «correcto» y no como rechazo", () => {
    expect(eventosDe(antes, reducir(antes, result(segunda, true), 5))).toEqual(["correcto"]);
  });
});
