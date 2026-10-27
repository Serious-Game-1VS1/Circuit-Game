import { describe, expect, it } from "vitest";
import { evaluar } from "../../spike/src/engine/pods";
import { cableEn, cableTocado, cargaEn, cargasPuestas, conPlaca, coord, curva, montaje, poner, ponerCable, puntoEn, PUNTOS, quitarCable, ranuraEn, ranuraValida, todasPuestas, type Cable } from "../src/placa";

const cables = (...xs: [string, string][]): Cable[] => xs.map(([a, b]) => ({ a, b }));
const SERIE = cables(["+", "1,1"], ["2,1", "1,2"], ["2,2", "-"]);
const PARALELO = cables(["+", "1,1"], ["2,1", "-"], ["+", "1,2"], ["2,2", "-"]);

describe("placa 4×4: del cableado al montaje que juzga el árbitro", () => {
  it("serie, paralelo y puente, sin importar el orden ni el sentido de los cables", () => {
    expect(montaje(SERIE)).toBe("serie");
    expect(montaje([...SERIE].reverse().map(({ a, b }) => ({ a: b, b: a })))).toBe("serie");
    expect(montaje(PARALELO)).toBe("paralelo");
    // Pasando por casillas libres (empalmes) también vale.
    expect(montaje(cables(["+", "0,0"], ["0,0", "1,1"], ["0,0", "1,2"], ["2,1", "3,3"], ["2,2", "3,3"], ["3,3", "-"]))).toBe("paralelo");
    expect(montaje([...PARALELO, { a: "+", b: "-" }])).toBe("puente");
    expect(montaje(cables(["+", "1,1"], ["2,1", "-"], ["2,1", "3,0"], ["3,0", "+"]))).toBe("puente");
  });

  it("incompleto o carga puenteada: sin montaje (no se puede probar)", () => {
    expect(montaje([])).toBeNull();
    expect(montaje(SERIE.slice(0, 2))).toBeNull();
    expect(montaje(cables(["+", "1,1"], ["2,1", "-"]))).toBeNull(); // la segunda carga sin conectar
    expect(montaje(cables(["+", "1,1"], ["1,1", "2,1"], ["2,1", "1,2"], ["2,2", "-"]))).toBeNull(); // luz 1 puenteada
  });

  it("el árbitro da el veredicto del montaje dibujado (Cabina: paralelo; Turbina: serie)", () => {
    const luces = { circuito: "luces" as const, volts: 9 }, turbina = { circuito: "interruptor" as const, volts: 9 };
    expect(evaluar(luces, montaje(PARALELO)!)).toBe("correcto");
    expect(evaluar(luces, montaje(SERIE)!)).toBe("poco");
    expect(evaluar(luces, montaje([...PARALELO, { a: "+", b: "-" }])!)).toBe("corto");
    expect(evaluar(turbina, montaje(SERIE)!)).toBe("correcto");
    expect(evaluar(turbina, montaje(PARALELO)!)).toBe("corto");
  });

  it("poner y quitar cables: no se une un punto consigo mismo ni se repite un cable", () => {
    expect(ponerCable([], "+", "+")).toBeNull();
    const uno = ponerCable([], "+", "1,1")!;
    expect(ponerCable(uno, "1,1", "+")).toBeNull();
    expect(quitarCable(ponerCable(uno, "2,1", "-")!, 0)).toEqual([{ a: "2,1", b: "-" }]);
  });

  it("objetivos táctiles ≥ 44 px: cada punto se encuentra en su centro y en un margen de 22 px", () => {
    for (const p of PUNTOS.filter((x) => x.includes(","))) {
      const { x, y } = coord(p);
      for (const [dx, dy] of [[0, 0], [-22, 0], [22, 0], [0, -22], [0, 22]] as const) expect(puntoEn(x + dx, y + dy)).toBe(p);
    }
    expect(puntoEn(coord("+").x, 120)).toBe("+");
    expect(puntoEn(coord("-").x + 10, 30)).toBe("-");
  });

  it("tocar un cable lo encuentra por su curva; los bornes son de las cargas", () => {
    const cs = cables(["+", "1,3"]);
    const medio = curva(cs[0]!, 0)[10]!;
    expect(cableEn(cs, medio.x, medio.y)).toBe(0);
    expect(cableEn(cs, coord("1,3").x, coord("1,3").y)).toBe(-1); // en el extremo manda la casilla
    // Objetivo táctil: acierta a 20 px de la curva (en vertical, la curva es oblicua: ≤ 20) y falla a 30 px.
    expect(cableEn(cs, medio.x, medio.y + 20)).toBe(0);
    expect(cableEn(cs, medio.x, medio.y + 40)).toBe(-1);
    // Un cable que pasa por encima de otra casilla no le roba el toque en su centro.
    const fila = cables(["2,1", "-"]), c22 = coord("2,2");
    expect(cableTocado(fila, c22.x, c22.y)).toBe(-1);
    // Y el medio de cualquier cable se puede tocar para quitarlo.
    for (const c of cables(["+", "2,1"], ["0,1", "3,1"], ["1,0", "2,3"], ["+", "-"])) {
      const m = curva(c, 0)[10]!;
      expect(cableTocado([c], m.x, m.y)).toBe(0);
    }
    expect(cargaEn("2,2")?.punto).toBe("carga2");
    expect(cargaEn("0,0")).toBeUndefined();
    expect(conPlaca("luces") && conPlaca("interruptor") && !conPlaca("led") && !conPlaca("fusible")).toBe(true);
  });
});

describe("piezas arrastradas a la placa", () => {
  it("cada carga ocupa su casilla y la de abajo; no cabe en la fila 3 ni encima de la otra", () => {
    const una = poner({}, "carga1", "0,3")!;
    expect(cargasPuestas(una)).toEqual([{ punto: "carga1", col: 3, a: "0,3", b: "1,3" }]);
    expect(todasPuestas(una)).toBe(false);
    expect(ranuraValida(una, "carga2", "3,0")).toBe(false); // no hay casilla debajo
    expect(ranuraValida(una, "carga2", "1,3")).toBe(false); // pisa la carga 1
    expect(ranuraValida(una, "carga2", "2,3")).toBe(true);
    expect(ranuraValida(una, "carga2", "+")).toBe(false); // un riel no es ranura
    expect(ranuraValida(una, "carga2", null)).toBe(false);
    expect(poner(una, "carga2", "1,3")).toBeNull(); // soltada donde no va: vuelve a la gaveta
    expect(todasPuestas(poner(una, "carga2", "2,0")!)).toBe(true);
  });

  it("la ranura bajo el centro de la pieza arrastrada (entre sus dos casillas)", () => {
    const entre = (f: number, c: string) => ({ x: coord(`${f},${c}`).x, y: (coord(`${f},${c}`).y + coord(`${f + 1},${c}`).y) / 2 });
    for (const f of [0, 1, 2]) expect(ranuraEn(entre(f, "1").x, entre(f, "1").y)).toBe(`${f},1`);
    expect(ranuraEn(coord("3,2").x, coord("3,2").y)).toBe("2,2"); // en la fila de abajo, sube una
    expect(ranuraEn(coord("+").x, 100)).toBeNull();
  });

  it("montaje usa las piezas donde se pusieron; sin las dos puestas no se puede probar", () => {
    const puestas = { carga1: "0,0", carga2: "2,3" };
    const serie = cables(["+", "0,0"], ["1,0", "2,3"], ["3,3", "-"]);
    expect(montaje(serie, cargasPuestas(puestas))).toBe("serie");
    expect(montaje(cables(["+", "0,0"], ["1,0", "-"], ["+", "2,3"], ["3,3", "-"]), cargasPuestas(puestas))).toBe("paralelo");
    expect(montaje(serie, cargasPuestas({ carga1: "0,0" }))).toBeNull();
    expect(montaje(serie.slice(0, 2), cargasPuestas(puestas))).toBeNull(); // un borne sin cable
    expect(cargaEn("3,3", cargasPuestas(puestas))?.punto).toBe("carga2");
  });
});
