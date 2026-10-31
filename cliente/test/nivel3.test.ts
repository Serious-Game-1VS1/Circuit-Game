import { describe, expect, it } from "vitest";
import { Arbiter } from "../../spike/src/arbiter/arbiter";
import { generar } from "../../spike/src/engine/generador";
import type { Circuito, ServerMsg } from "../../spike/src/protocol";
import { bandas, COLORES, CUCHILLAS, infoFusible, ohmiosDe, textoOhmios } from "../src/colores";
import { aplicarPartida, cambiarNivel, cargarPerfil, completoNivel2, etiquetaNivel, guardarPerfil, nivelBotElegido, nivelElegido, perfilNuevo, textoNivel, type Resultado } from "../src/perfil";
import { montajeOpcion, montajePieza } from "../src/sprites";
import { textoSala } from "../src/net";
import { esResistencia, ocultaValor, textoOpcion, textoRotulo } from "../src/vista";

const res = (o: Partial<Resultado> = {}): Resultado => ({ puntos: 0, pods: 0, total: 5, quemadas: 0, limpios: 0, gano: false, nivel: 1, ...o });

describe("código de colores (nivel 3)", () => {
  it("bandas de los valores del juego y de la serie E12 (cifra, cifra, ceros, oro)", () => {
    expect(bandas(100)).toEqual(["marrón", "negro", "marrón", "oro"]);
    expect(bandas(220)).toEqual(["rojo", "rojo", "marrón", "oro"]);
    expect(bandas(470)).toEqual(["amarillo", "violeta", "marrón", "oro"]);
    expect(bandas(1000)).toEqual(["marrón", "negro", "rojo", "oro"]);
    expect(bandas(2200)).toEqual(["rojo", "rojo", "rojo", "oro"]);
    expect(bandas(330)).toEqual(["naranja", "naranja", "marrón", "oro"]);
    expect(bandas(10000)).toEqual(["marrón", "negro", "naranja", "oro"]);
  });
  it("lectura inversa: ohmiosDe(bandas(x)) == x para toda la serie E12", () => {
    const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
    for (const d of [1, 10, 100, 1000, 10000]) for (const v of E12) expect(ohmiosDe(bandas(v * d)), `${v * d}`).toBe(v * d);
    expect(ohmiosDe(["no", "es", "color"])).toBeNull();
    expect(textoOhmios(1000)).toBe("1 kΩ");
    expect(textoOhmios(2200)).toBe("2,2 kΩ");
  });
  it("las 10 cifras van en orden y cada banda del juego es un color de la tabla", () => {
    expect(COLORES.map((c) => c.cifra)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(COLORES.map((c) => c.hex)).size).toBe(10);
  });
});

describe("fusibles por aspecto (nivel 3)", () => {
  it("cuchillas de coche: 5 beige, 7,5 marrón, 10 rojo, 15 azul claro, 20 amarillo, 25 blanco, 30 verde", () => {
    expect(Object.fromEntries(Object.entries(CUCHILLAS).map(([a, c]) => [a, c.nombre]))).toEqual({ "5": "beige", "7.5": "marrón", "10": "rojo", "15": "azul claro", "20": "amarillo", "25": "blanco", "30": "verde" });
    expect(infoFusible("car:7.5")).toMatchObject({ tipo: "cuchilla", amperios: 7.5, marca: "", letra: null });
  });
  it("vidrio: 5x20 corto o 6,3x32 largo, F rápido o T lento, con su marca", () => {
    expect(infoFusible("5x20T:2")).toMatchObject({ tipo: "vidrio", grande: false, letra: "T", marca: "T2" });
    expect(infoFusible("6x32F:10")).toMatchObject({ tipo: "vidrio", grande: true, letra: "F", marca: "F10" });
    expect(infoFusible("5x20F:0.5")?.marca).toBe("F0,5");
    expect(infoFusible("1")).toBeNull();
  });
  it("todo fusible que sortea el motor tiene aspecto, sin texto de amperios en la gaveta", () => {
    for (let s = 0; s < 300; s++) for (const p of generar(s, 3)) for (const z of p.zonas.filter((x) => x.circuito === "fusible3")) {
      for (const o of z.opciones) {
        const m = montajeOpcion("fusible3", o);
        expect(m.elementos[0]?.fusible, o).toBe(o);
        expect(textoOpcion(o, "fusible3"), o).toBe("");
        expect(textoRotulo(o, "fusible3"), o).toBe("");
        if (infoFusible(o)!.tipo === "cuchilla") expect(m.textos ?? []).toEqual([]);
      }
    }
  });
});

describe("presentación en la gaveta (ocultarValor)", () => {
  it("solo se oculta en nivel 3 y solo en resistencias", () => {
    for (const c of ["led", "cabina", "protegido", "divisor"] as Circuito[]) { expect(esResistencia(c)).toBe(true); expect(ocultaValor(3, c)).toBe(true); expect(ocultaValor(1, c)).toBe(false); expect(ocultaValor(2, c)).toBe(false); expect(ocultaValor(undefined, c)).toBe(false); }
    for (const c of ["fusible", "fusible3", "luces", "combinar", "cadena"] as Circuito[]) expect(ocultaValor(3, c)).toBe(false);
  });
  it("sin ocultar se ve el valor; ocultando no hay texto y el dibujo lleva las bandas correctas", () => {
    expect(textoRotulo("470", "led", false)).toBe("470 Ω");
    expect(textoRotulo("470", "led", true)).toBe("");
    for (const v of ["100", "220", "470", "1000"]) {
      expect(montajeOpcion("led", v, false).elementos[0]).toMatchObject({ sprite: expect.stringContaining("resistencia") });
      const e = montajeOpcion("led", v, true).elementos[0]!;
      expect(e.sprite).toBeUndefined();
      expect(e.bandas).toEqual(bandas(Number(v)));
      expect(montajePieza("led", v, true)?.elementos[0]?.bandas).toEqual(bandas(Number(v)));
    }
    expect(montajePieza("led", "470", false)).toBeNull(); // niveles 1 y 2 siguen con su sprite
  });
});

describe("perfil: desbloqueo del nivel 3", () => {
  it("completar el nivel 2 (con el 2 abierto) abre el Experto, con aviso una sola vez", () => {
    const a = aplicarPartida(perfilNuevo("a"), res({ pods: 5 }));
    expect(a.perfil.nivelDesbloqueado).toBe(2);
    const b = aplicarPartida(a.perfil, res({ pods: 5, nivel: 2 }));
    expect(b.perfil.nivelDesbloqueado).toBe(3);
    expect(b.eventos).toMatchObject({ nivel2: false, nivel3: true });
    expect(aplicarPartida(b.perfil, res({ pods: 5, nivel: 2 })).eventos.nivel3).toBe(false);
    expect(aplicarPartida(b.perfil, res({ pods: 5 })).perfil.nivelDesbloqueado).toBe(3); // jugar el 1 no lo baja
  });
  it("no se abre con partida incompleta, Oleadas, nivel 2 aún cerrado o una partida del propio nivel 3", () => {
    const abierto2 = { ...perfilNuevo("a"), nivelDesbloqueado: 2 as const };
    for (const r of [res({ pods: 4, nivel: 2 }), res({ pods: 9, total: Infinity, nivel: 2 })]) expect(aplicarPartida(abierto2, r).perfil.nivelDesbloqueado).toBe(2);
    expect(aplicarPartida(perfilNuevo("a"), res({ pods: 5, nivel: 2 })).perfil.nivelDesbloqueado).toBe(1);
    expect(aplicarPartida(abierto2, res({ pods: 5, nivel: 3 })).perfil.nivelDesbloqueado).toBe(2);
    expect(completoNivel2(res({ pods: 5, nivel: 2 }))).toBe(true);
  });
  it("se guarda y se carga; el alias de prueba con nivelDesbloqueado 3 lo juega", () => {
    guardarPerfil({ ...perfilNuevo("exp"), nivelDesbloqueado: 3 }, null);
    const p = cargarPerfil("exp", null);
    expect(p.nivelDesbloqueado).toBe(3);
    expect([nivelBotElegido(p, "1"), nivelBotElegido(p, "2"), nivelBotElegido(p, "mixto"), nivelBotElegido(p, "3")]).toEqual([1, 2, "mixto", 3]);
    expect(nivelElegido(p, 3)).toBe(3);
    expect(cambiarNivel(p, 3)).toBe(1);
    expect(cambiarNivel(p, 2)).toBe(3);
    expect(textoNivel(p, 3)).toContain("EXPERTO");
  });
  it("con el nivel 3 cerrado, el selector cae al 2 (o al 1) y avisa", () => {
    const p2 = { ...perfilNuevo("a"), nivelDesbloqueado: 2 as const };
    expect(nivelBotElegido(p2, "3")).toBe(2);
    expect(nivelElegido(p2, 3)).toBe(2);
    expect(textoNivel(p2, 2)).toContain("completa el nivel 2");
    expect(nivelBotElegido(perfilNuevo("a"), "3")).toBe(1);
  });
  it("etiquetas de nivel en menú y lista de salas", () => {
    expect([1, 2, 3].map((n) => etiquetaNivel(n as 1 | 2 | 3))).toEqual(["NIVEL 1", "NIVEL 2", "EXPERTO"]);
    expect(textoSala({ codigo: "ABC123", nivel: 3, jugadores: 1, max: 2, estado: "esperando" })).toBe("ABC123  EXPERTO  1/2");
    expect(textoSala({ codigo: "ABC123", nivel: "mixto", jugadores: 1, max: 2, estado: "esperando" })).toBe("ABC123  MIXTO  1/2");
    expect(textoSala({ codigo: "ABC123", nivel: 2, jugadores: 1, max: 2, estado: "esperando" })).toBe("ABC123  NIVEL 2  1/2");
  });
});

describe("árbitro: nivel 3 de extremo a extremo", () => {
  it("el pod llega con nivel 3, sin soluciones y con el consumo impreso solo en el fusible", () => {
    const msgs: ServerMsg[] = [];
    const arb = new Arbiter((_p, m) => msgs.push(m), { nivel: 3, semilla: 5, practica: true });
    arb.handle("yo", { t: "hello", alias: "ana" });
    const inicio = msgs.find((m) => m.t === "start");
    expect(inicio?.t === "start" && inicio.nivel).toBe(3);
    const pod = inicio?.t === "start" ? inicio.pod : undefined;
    expect(pod?.nivel).toBe(3);
    expect(JSON.stringify(msgs)).not.toContain("solucion");
    for (const z of arb.pods.flatMap((p) => p.zonas)) {
      const vista = arb.pods[0]!.zonas.includes(z) ? pod!.zonas.find((x) => x.zona === z.zona) : undefined;
      if (vista) expect(vista.fija !== undefined).toBe(z.circuito === "fusible3");
    }
  });
});
