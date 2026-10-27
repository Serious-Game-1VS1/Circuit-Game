import { describe, expect, it } from "vitest";
import type { PodView, ServerMsg } from "../../spike/src/protocol";
import { cambios, habilidad, registrar, type Dominio } from "../src/dominio";
import { inicial } from "../src/pantalla";
import { aplicarPartida, cargarPerfil, guardarPerfil, INSIGNIAS, mejorNave, navesDesbloqueadas, perfilNuevo, resultadoDe, type Resultado } from "../src/perfil";

const res = (o: Partial<Resultado> = {}): Resultado => ({ puntos: 0, pods: 0, total: 5, quemadas: 0, limpios: 0, gano: false, nivel: 1, ...o });
const c = (aciertos: number, fallos: number) => ({ aciertos, fallos });
const pod: PodView = { numero: 1, zonas: [
  { zona: 0, nombre: "radar", circuito: "led", volts: 9, opciones: [], reparada: false },
  { zona: 1, nombre: "cabina", circuito: "luces", volts: 9, opciones: [], reparada: false }] };
const start = (despachados = 0) => ({ t: "start", despachados } as unknown as ServerMsg);
const fallo = (zona: number) => ({ t: "result", zona, veredicto: "poco" } as unknown as ServerMsg);
const despachado = { t: "despachado" } as unknown as ServerMsg;

describe("habilidad", () => {
  it("mínimo 3 intentos para puntuar", () => {
    expect(habilidad(c(2, 0))).toMatchObject({ puntuada: false, estrellas: 0 });
    expect(habilidad(undefined).intentos).toBe(0);
    expect(habilidad(c(3, 0))).toMatchObject({ puntuada: true, estrellas: 2 });
  });
  it("estrellas en los umbrales: 60 %, 80 % y 95 % con ≥ 5 intentos", () => {
    expect(habilidad(c(1, 2)).estrellas).toBe(0); // 33 %
    expect(habilidad(c(3, 2)).estrellas).toBe(1); // 60 %
    expect(habilidad(c(4, 1)).estrellas).toBe(2); // 80 %
    expect(habilidad(c(19, 1)).estrellas).toBe(3); // 95 %
  });
  it("3 estrellas pide 5 intentos aunque sea 100 %", () => {
    expect(habilidad(c(4, 0)).estrellas).toBe(2);
    expect(habilidad(c(5, 0)).estrellas).toBe(3);
  });
});

describe("registrar (conteo de la partida)", () => {
  it("fallos por veredicto y aciertos por pod despachado; led y cabina comparten concepto", () => {
    let d: Dominio = {};
    d = registrar(d, fallo(0), pod);
    d = registrar(d, { t: "result", zona: 0, veredicto: "correcto" } as unknown as ServerMsg, pod);
    d = registrar(d, despachado, pod);
    expect(d).toEqual({ led: c(1, 1), luces: c(1, 0) });
  });
  it("un start de partida nueva reinicia; el de reconexión no", () => {
    expect(registrar({ led: c(1, 1) }, start(0), pod)).toEqual({});
    expect(registrar({ led: c(1, 1) }, start(2), pod)).toEqual({ led: c(1, 1) });
  });
  it("tutorial/práctica a medias no cuentan: sin End, resultadoDe es null (nada se aplica)", () => {
    const a = { ...inicial(), fase: "taller" as const, station: "A" as const, practica: true };
    expect(resultadoDe(a, { ...a, despachados: 3 })).toBeNull();
  });
});

describe("aplicarPartida con dominio", () => {
  it("acumula por concepto y avisa de los que cambiaron, con flecha al subir", () => {
    const a = aplicarPartida(perfilNuevo("a"), res({ dominio: { luces: c(3, 0) } }));
    expect(a.perfil.dominio.luces).toEqual(c(3, 0));
    expect(a.eventos.habilidades).toEqual([{ clave: "luces", nombre: "Luces en paralelo (un camino cada una)", estrellas: 2, antes: 0 }]);
    const b = aplicarPartida(a.perfil, res({ dominio: { luces: c(1, 0) } }));
    expect(b.perfil.dominio.luces).toEqual(c(4, 0));
    expect(cambios({}, { led: c(1, 0) })).toEqual([]); // sin 3 intentos no se anuncia
  });
  it("sin dominio en el resultado no cambia habilidades", () => {
    expect(aplicarPartida(perfilNuevo("a"), res()).eventos.habilidades).toEqual([]);
  });
  it("«Dominio» sale con 3 estrellas y una sola vez", () => {
    const a = aplicarPartida(perfilNuevo("a"), res({ dominio: { fusible: c(5, 0) } }));
    expect(a.eventos.insignias.map((i) => i.id)).toContain("dominio");
    expect(aplicarPartida(a.perfil, res({ dominio: { fusible: c(1, 0) } })).eventos.insignias.map((i) => i.id)).not.toContain("dominio");
    expect(INSIGNIAS).toHaveLength(7);
  });
  it("el dominio sobrevive a guardar y cargar", () => {
    const a = aplicarPartida(perfilNuevo("dom"), res({ dominio: { led: c(2, 1) } }));
    guardarPerfil(a.perfil, null);
    expect(cargarPerfil("dom", null).dominio).toEqual({ led: c(2, 1) });
    expect(cargarPerfil("x", { getItem: () => JSON.stringify({ dominio: { led: { aciertos: "mal" } } }), setItem: () => {} }).dominio).toEqual({ led: c(0, 0) });
  });
});

describe("naves", () => {
  const con = (xp: number, insignias: string[] = []) => ({ ...perfilNuevo("a"), xp, insignias });
  it("una por rango", () => {
    expect(navesDesbloqueadas(con(0))).toEqual([1]);
    expect(navesDesbloqueadas(con(300))).toEqual([1, 2]);
    expect(navesDesbloqueadas(con(800))).toEqual([1, 2, 3]);
    expect(navesDesbloqueadas(con(1500))).toEqual([1, 2, 3, 4]);
  });
  it("la 5 con las 6 insignias; con 5 no", () => {
    const todas = INSIGNIAS.map((i) => i.id);
    expect(navesDesbloqueadas(con(0, todas))).toEqual([1, 5]);
    expect(mejorNave(con(0, todas))).toBe(5);
    expect(navesDesbloqueadas(con(1500, todas.slice(1)))).toEqual([1, 2, 3, 4]);
  });
  it("avisa de la nave nueva al subir de rango", () => {
    expect(aplicarPartida(perfilNuevo("a"), res({ puntos: 300 })).eventos.naves).toEqual(["Burbuja"]);
    expect(aplicarPartida(perfilNuevo("a"), res({ puntos: 10 })).eventos.naves).toEqual([]);
  });
});

describe("falla encadenada", () => {
  it("acertar la primera suma un acierto de su concepto; la segunda cuenta al despachar y sus fallos, como cualquier zona", () => {
    let d: Dominio = {};
    d = registrar(d, { t: "result", zona: 0, veredicto: "correcto", hayMas: true } as unknown as ServerMsg, pod);
    expect(d).toEqual({ led: c(1, 0) });
    d = registrar(d, fallo(0), pod); // fallo en la segunda
    d = registrar(d, despachado, { numero: 1, zonas: [pod.zonas[0]!] }); // la segunda, ya reparada
    expect(d).toEqual({ led: c(2, 1) });
  });
});
