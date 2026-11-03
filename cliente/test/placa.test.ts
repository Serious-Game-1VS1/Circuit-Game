import { describe, expect, it } from "vitest";
import { evaluar } from "../../spike/src/engine/pods";
import { conectable, destinoValido, pinesTocados, cableDelCorto, faltaCablear, faltaColocar, cableEn, cableTocado, cargaEn, cargasPuestas, conPlaca, coord, montaje, piezaEn, poner, ponerCable, motivoCableNoValido, puntoEn, puntoSoltar, destinoSoltar, PUNTOS, quitarCable, quitarPieza, ranuraEn, rutas, ranuraValida, todasPuestas, type Cable } from "../src/placa";

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

  /** Punto medio del tramo más largo de la ruta del cable i. */
  const medioDe = (cs: Cable[], i = 0) => {
    const r = rutas(cs)[i]!, [p, q] = r.slice(0, -1).map((u, k) => [u, r[k + 1]!] as const).sort((m, n) => Math.hypot(n[1].x - n[0].x, n[1].y - n[0].y) - Math.hypot(m[1].x - m[0].x, m[1].y - m[0].y))[0]!;
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  };

  it("los cables son rectos con ángulos de 90°, y evitan cruzarse cuando es fácil", () => {
    const recto = (r: { x: number; y: number }[]) => r.slice(0, -1).every((p, k) => p.x === r[k + 1]!.x || p.y === r[k + 1]!.y);
    for (const c of cables(["+", "2,1"], ["0,1", "3,1"], ["1,0", "2,3"], ["+", "-"], ["0,0", "3,3"])) expect(recto(rutas([c])[0]!)).toBe(true);
    // Dos cables cuyo primer trazo en L se cruzaría: el segundo toma otra ruta y no cruza.
    const [r1, r2] = rutas(cables(["0,0", "2,2"], ["0,2", "2,0"]));
    const cruces = (a: { x: number; y: number }[], b: { x: number; y: number }[]) => a.slice(0, -1).flatMap((p, i) => b.slice(0, -1).map((q, j) => [p, a[i + 1]!, q, b[j + 1]!] as const))
      .filter(([p, p2, q, q2]) => (p.y === p2.y && q.x === q2.x && q.x > Math.min(p.x, p2.x) && q.x < Math.max(p.x, p2.x) && p.y > Math.min(q.y, q2.y) && p.y < Math.max(q.y, q2.y))
        || (q.y === q2.y && p.x === p2.x && p.x > Math.min(q.x, q2.x) && p.x < Math.max(q.x, q2.x) && q.y > Math.min(p.y, p2.y) && q.y < Math.max(p.y, p2.y))).length;
    expect(cruces(r1!, r2!)).toBeLessThanOrEqual(1);
  });

  it("tocar un cable lo encuentra por su ruta; los bornes son de las cargas", () => {
    const cs = cables(["+", "1,3"]);
    const medio = medioDe(cs);
    expect(cableEn(cs, medio.x, medio.y)).toBe(0);
    expect(cableEn(cs, coord("1,3").x, coord("1,3").y)).toBe(-1); // en el extremo manda la casilla
    // Objetivo táctil: acierta a 20 px de la ruta y falla a 40 px.
    expect(cableEn(cs, medio.x, medio.y + 20)).toBe(0);
    expect(cableEn(cs, medio.x, medio.y + 40)).toBe(-1);
    // Un cable que pasa por encima de otra casilla no le roba el toque en su centro.
    const fila = cables(["2,1", "-"]), c22 = coord("2,2");
    expect(cableTocado(fila, c22.x, c22.y)).toBe(-1);
    // Y el medio de cualquier cable se puede tocar para quitarlo.
    for (const c of cables(["+", "2,1"], ["0,1", "3,1"], ["1,0", "2,3"], ["+", "-"])) {
      // En el centro de una casilla manda la casilla; en alguna parte del tramo largo siempre se puede tocar.
      const r = rutas([c])[0]!, tramo = r.slice(0, -1).map((u, k) => [u, r[k + 1]!] as const).sort((m, n) => Math.hypot(n[1].x - n[0].x, n[1].y - n[0].y) - Math.hypot(m[1].x - m[0].x, m[1].y - m[0].y))[0]!;
      expect([0.3, 0.4, 0.5, 0.6, 0.7].some((t) => cableTocado([c], tramo[0].x + (tramo[1].x - tramo[0].x) * t, tramo[0].y + (tramo[1].y - tramo[0].y) * t) === 0)).toBe(true);
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

describe("tocar una pieza puesta la devuelve a la gaveta", () => {
  const puestas = { carga1: "1,1", carga2: "1,2" };
  it("piezaEn: el cuerpo entre los dos bornes sí, los pines (donde se arrastra el cable) no", () => {
    const A = coord("1,1"), B = coord("2,1");
    expect(piezaEn(puestas, A.x, (A.y + B.y) / 2)).toBe("carga1");
    expect(piezaEn(puestas, coord("1,2").x, (A.y + B.y) / 2)).toBe("carga2");
    expect(piezaEn(puestas, A.x, A.y)).toBeNull();
    expect(piezaEn(puestas, B.x, B.y)).toBeNull();
    expect(piezaEn(puestas, coord("0,0").x, 100)).toBeNull();
    expect(piezaEn({}, A.x, (A.y + B.y) / 2)).toBeNull();
  });

  it("quitarPieza: la pieza vuelve a la gaveta con sus cables; el resto queda igual", () => {
    const antes = cables(["+", "1,1"], ["2,1", "1,2"], ["2,2", "-"], ["0,0", "3,3"]);
    const { puestas: p, cables: c } = quitarPieza(puestas, antes, "carga1");
    expect(p).toEqual({ carga2: "1,2" });
    expect(c).toEqual(cables(["2,2", "-"], ["0,0", "3,3"]));
    expect(todasPuestas(p)).toBe(false);
    expect(montaje(c, cargasPuestas(p))).toBeNull(); // sin las dos piezas no hay montaje que mandar al árbitro
    expect(quitarPieza({}, antes, "carga1")).toEqual({ puestas: {}, cables: antes });
  });
});

describe("mensajes específicos del cableado", () => {
  it("nombra la pieza y el punto que falta", () => {
    expect(faltaColocar({}, "luces")).toBe("Falta colocar: la luz 1 y la luz 2.");
    expect(faltaColocar({ carga1: "0,0" }, "luces")).toBe("Falta colocar: la luz 2.");
    expect(faltaColocar({ carga2: "0,0" }, "interruptor")).toBe("Falta colocar: el motor.");
    expect(faltaColocar({ carga1: "0,0", carga2: "0,1" }, "luces")).toBeNull();
    expect(faltaCablear(cables(["+", "1,1"]), "interruptor")).toBe("El motor necesita un cable en su punto inferior.");
    expect(faltaCablear(cables(["2,1", "1,2"]), "interruptor")).toBe("El motor necesita un cable en su punto superior.");
    expect(faltaCablear(cables(["+", "1,1"], ["2,1", "-"]), "interruptor")).toBe("El interruptor necesita un cable en sus dos puntos.");
    expect(faltaCablear(cables(["+", "1,1"], ["2,1", "-"]), "luces")).toContain("La luz 2 necesita");
  });

  it("el corto señala el cable que hay que quitar", () => {
    const c = cables(["+", "1,1"], ["2,1", "1,2"], ["2,2", "-"], ["+", "-"]);
    expect(cableDelCorto(c)).toEqual({ a: "+", b: "-" });
    expect(cableDelCorto(SERIE)).toBeNull();
    expect(faltaCablear(c, "luces")).toMatch(/cable entre el riel \+ y el riel −.*quitarlo/);
  });

  it("todo cableado pero sin montaje: explica sin culpar a una pieza", () => {
    expect(faltaCablear(cables(["+", "1,1"], ["1,1", "2,1"], ["2,1", "1,2"], ["2,2", "-"]), "luces")).toContain("no están unidas bien");
  });
});

describe("cableado: soltar y mensajes", () => {
  it("soltar sobre el carril manda sobre las casillas cercanas, y el aro de un pin sobre el carril", () => {
    expect(puntoSoltar(coord("1,0").x - 14, coord("1,0").y + 24)).toBe("+"); // a la izquierda de la casilla 0, dentro de la banda ampliada
    expect(puntoSoltar(coord("1,3").x + 14, coord("1,3").y + 24)).toBe("-");
    expect(puntoSoltar(coord("1,0").x, coord("1,0").y)).toBe("1,0");
    expect(puntoSoltar(coord("1,1").x + 5, coord("1,1").y - 5)).toBe("1,1");
    expect(puntoSoltar(5, 2)).toBeNull();
  });
  it("destinoSoltar: engancha al borne válido más cercano aunque se suelte en la casilla vecina", () => {
    const puestas = { carga1: "1,1", carga2: "1,2" }; // bornes: 1,1 2,1 1,2 2,2
    expect(destinoSoltar(puestas, "+", coord("2,1").x, coord("2,1").y)).toBe("2,1");
    expect(destinoSoltar(puestas, "+", coord("3,1").x, coord("3,1").y - 25)).toBe("2,1"); // 25 px por encima de una casilla vacía: el borne está a 26 px
    expect(destinoSoltar(puestas, "+", coord("0,0").x, coord("0,0").y)).toBeNull(); // casilla vacía lejos de todo
    expect(destinoSoltar(puestas, "1,1", coord("1,1").x + 3, coord("1,1").y)).toBeNull(); // no se une consigo mismo
    expect(destinoSoltar(puestas, "1,1", 20, 100)).toBe("+");
  });
  it("el motivo del cable no válido depende de la causa", () => {
    const uno = [{ a: "+", b: "1,1" }];
    expect(motivoCableNoValido(uno, "1,1", "+")).toMatch(/ya tienen cable/);
    expect(motivoCableNoValido(uno, "1,1", "1,1")).toMatch(/mismo punto/);
  });
});


describe("cables que no engañan", () => {
  const dos = { carga1: "1,1", carga2: "1,2" };
  it("solo rieles y bornes de piezas puestas admiten cable (soltar en una casilla vacía no deja cable fantasma)", () => {
    expect(conectable(dos, "-")).toBe(true);
    expect(conectable(dos, "2,2")).toBe(true);
    expect(conectable(dos, "0,3")).toBe(false);
    expect(destinoValido(dos, "1,1", "0,3")).toBe(false);
    expect(destinoValido(dos, "1,1", "-")).toBe(true);
    expect(destinoValido(dos, "1,1", "1,1")).toBe(false);
    expect(destinoValido({}, "1,1", "-")).toBe(false);
  });
  it("el cable de la luz 1 al riel − no pasa por los pines de la luz 2", () => {
    const cs = cargasPuestas(dos), c = cables(["1,1", "-"]), c2 = cables(["2,1", "-"]);
    expect(pinesTocados(rutas(c)[0]!, cs)).toBeGreaterThan(0); // sin saber de las piezas, va recto y las atraviesa
    expect(pinesTocados(rutas(c, cs)[0]!, cs)).toBe(0);
    expect(pinesTocados(rutas(c2, cs)[0]!, cs)).toBe(0);
    expect(rutas(cables(["1,1", "+"]), cs)[0]).toHaveLength(2); // hacia el + no hay obstáculo: recto
  });
});
