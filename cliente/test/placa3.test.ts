import { describe, expect, it } from "vitest";
import { decodificar } from "../../spike/src/engine/placa3";
import {
  cableEn3, codificar, colX, coordHoyo, enGaveta, filaY, gavetaDe, girar3, hoyoCerca, hoyoLibre, mismaTira, nombrePieza, ocupados, PASO, piezaEn3, poner3, ponerCable3,
  quitar3, quitarCable3, ranuraPieza, tiraEn, VACIO, faltaPlaca3,
} from "../src/placa3";

const ops = ["R:470:1", "L:rojo:1", "D:1N4007:1", "S:int:1", "C:100uF:1"];

describe("placa experta (cliente): protoboard y gavetas", () => {
  it("tiras de 5 agujeros conectados a cada lado del canal; rieles + y −; ≥ 44 px de alto (55 de lienzo a 360x640)", () => {
    expect(PASO).toBeGreaterThanOrEqual(55);
    expect(tiraEn(colX(2), filaY(1))).toEqual(["1,0", "1,1", "1,2", "1,3", "1,4"]);
    expect(tiraEn(colX(7), filaY(3))).toEqual(["3,5", "3,6", "3,7", "3,8", "3,9"]);
    expect(tiraEn(5, filaY(0))![0]).toBe("+0");
    expect(tiraEn(295, filaY(0))![0]).toBe("-0");
    expect(tiraEn(150, filaY(0))).toBeNull(); // el canal no conecta
    expect(mismaTira("2,0", "2,4")).toBe(true);
    expect(mismaTira("2,4", "2,5")).toBe(false);
    expect(hoyoCerca(colX(3) + 2, filaY(2))).toBe("2,3");
  });

  it("colocar, mover, girar y quitar piezas; la ranura busca dos agujeros libres en vertical", () => {
    const r = ranuraPieza(VACIO, "R:470:1", colX(0), (filaY(0) + filaY(1)) / 2)!;
    expect(r).toEqual({ f: 0, c: 0 });
    let m = poner3(VACIO, "R:470:1", r);
    expect([...ocupados(m)].sort()).toEqual(["0,0", "1,0"]);
    expect(ranuraPieza(m, "L:rojo:1", colX(0), (filaY(0) + filaY(1)) / 2)).toEqual({ f: 0, c: 1 }); // ocupada: la columna libre más cercana
    m = poner3(m, "L:rojo:1", { f: 1, c: 1 });
    m = girar3(m, "L:rojo:1");
    expect(m.piezas.find((p) => p.id === "L:rojo:1")!.g).toBe(true);
    expect(piezaEn3(m, colX(1), (filaY(1) + filaY(2)) / 2)?.id).toBe("L:rojo:1");
    m = poner3(m, "L:rojo:1", { f: 2, c: 1 }); // mover conserva el giro
    expect(m.piezas.find((p) => p.id === "L:rojo:1")).toMatchObject({ f: 2, c: 1, g: true });
    expect(quitar3(m, "R:470:1").piezas.map((p) => p.id)).toEqual(["L:rojo:1"]);
    expect(enGaveta(ops, m, "LD")).toEqual(["D:1N4007:1"]);
    expect(gavetaDe("S:int:1")).toBe("S");
    expect(gavetaDe("C:100uF:1")).toBe("C");
    expect(nombrePieza("R:470:1")).toBe("Resistencia"); // el valor se lee por las bandas
    expect(nombrePieza("S:pul:1")).toBe("Pulsador");
  });

  it("cables: a agujeros libres, se tocan para quitarlos y el montaje viaja como texto que el árbitro acepta", () => {
    let m = poner3(VACIO, "R:470:1", { f: 0, c: 0 });
    expect(ponerCable3(m, "0,0", "+0")).toBeNull(); // agujero ocupado por una pata
    expect(hoyoLibre(m, colX(0), filaY(0))).toBe("0,1");
    m = ponerCable3(m, "+0", "0,4")!;
    m = ponerCable3(m, "1,4", "-2")!;
    expect(m.cables).toHaveLength(2);
    const A = coordHoyo("+0"), B = coordHoyo("0,4");
    expect(cableEn3(m, (A.x + B.x) / 2 - 20, A.y + (B.y - A.y))).toBeGreaterThanOrEqual(-1);
    expect(quitarCable3(m, 0).cables).toEqual([["1,4", "-2"]]);
    expect(decodificar(codificar(m), ops)).toEqual(m);
    expect(faltaPlaca3(VACIO)).toMatch(/gaveta/);
    expect(faltaPlaca3(m)).toBeNull();
  });
});
