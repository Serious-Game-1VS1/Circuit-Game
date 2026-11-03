import { describe, expect, it } from "vitest";
import { Arbiter } from "../src/arbiter/arbiter";
import { generar, mulberry32, validarZona, type Pod } from "../src/engine/generador";
import { evaluar, piezaValida } from "../src/engine/pods";
import { medir } from "../src/engine/medir";
import {
  ENUNCIADOS, PLANTILLAS, candidatosPlaca3, codificar, decodificar, evaluarMontaje, medirPlaca3, objetivoDe, rama, sortearProblema, unir, validarProblema, type Montaje3,
} from "../src/engine/placa3";
import type { ServerMsg } from "../src/protocol";

const SEMILLAS = 400; // miles más en `npm run validar:sorteos` (placa3 por plantilla)
const ops = ["R:470:1", "R:100:1", "L:rojo:1", "L:rojo:2", "D:1N4007:1", "S:int:1", "C:100uF:1"];

describe("placa3: prueba de propiedad del generador", () => {
  it(`${SEMILLAS} semillas por plantilla: la referencia cumple con ±5 %, ninguna trampa valida, determinista`, () => {
    let trampas = 0;
    for (const p of PLANTILLAS) {
      for (let s = 0; s < SEMILLAS; s++) {
        const x = sortearProblema(mulberry32(s), p);
        expect(validarProblema(x), `${p} semilla ${s}`).toBeNull();
        expect(JSON.stringify(sortearProblema(mulberry32(s), p))).toBe(JSON.stringify(x));
        expect(x.trampas.length).toBeGreaterThanOrEqual(2);
        trampas += x.trampas.length;
        // sobrantes: la gaveta trae más piezas de las que pide la referencia
        expect(x.opciones.length).toBeGreaterThan(decodificar(x.solucion, x.opciones)!.piezas.length);
      }
    }
    expect(trampas).toBeGreaterThan(PLANTILLAS.length * SEMILLAS * 2);
  });

  it("nivel 3: 1 000 partidas válidas y todas con al menos un pod placa3 en Cabina (pods 4-5)", () => {
    for (let s = 0; s < 1000; s++) {
      const z = generar(s, 3).flatMap((p, i) => p.zonas.map((x) => ({ ...x, i }))).filter((x) => x.circuito === "placa3");
      expect(z.length, `semilla ${s}`).toBeGreaterThan(0);
      for (const x of z) { expect(x.i).toBeGreaterThanOrEqual(3); expect(x.nombre).toBe("cabina"); expect(validarZona(x)).toBeNull(); }
    }
  });
});

describe("placa3: el bot", () => {
  it("halla al menos una solución con solo las piezas visibles (300 semillas por plantilla) y no prueba piezas ajenas", () => {
    for (const p of PLANTILLAS) for (let s = 0; s < 300; s++) {
      const x = sortearProblema(mulberry32(s), p), z = { volts: x.volts, plantilla: p, opciones: x.opciones };
      const js = candidatosPlaca3(p, x.opciones).map(codificar);
      expect(js.every((j) => decodificar(j, x.opciones) !== null)).toBe(true);
      expect(js.some((j) => evaluar({ circuito: "placa3", ...z }, j) === "correcto"), `${p} ${s}`).toBe(true);
      expect(js.length).toBeLessThan(400);
    }
  });
});

describe("placa3: validación por objetivo eléctrico", () => {
  const led = objetivoDe("led", ["R:470:1", "L:rojo:1"]);
  it("LED con 470 Ω a 9 V: correcto; sin resistencia se quema; capacitor en serie = abierto (mal); al revés = mal", () => {
    expect(evaluarMontaje(rama(["R:470:1", "L:rojo:1"], 0), 9, led)).toBe("correcto");
    expect(evaluarMontaje(rama(["L:rojo:1"], 0), 9, led)).toBe("se quema");
    expect(evaluarMontaje(rama(["C:100uF:1", "L:rojo:1"], 0), 9, led)).toBe("mal");
    expect(evaluarMontaje(rama(["R:470:1", "L:rojo:1"], 0, ["L:rojo:1"]), 9, led)).toBe("mal");
    expect(evaluarMontaje(rama(["R:1000:1", "L:rojo:1"], 0), 9, led)).toBe("poco"); // 7 mA
  });

  it("cortocircuito de la batería con un cable del + al −", () => {
    expect(evaluarMontaje({ piezas: [], cables: [["+0", "-0"]] }, 9, led)).toBe("corto");
    // las dos patas en la misma tira (por un cable): el LED queda puenteado y el corto lo limita la resistencia
    const m = rama(["R:470:1", "L:rojo:1"], 0);
    expect(evaluarMontaje({ ...m, cables: [...m.cables, ["1,3", "2,3"]] }, 9, led)).toBe("mal");
  });

  it("varias soluciones: la protección con diodo en serie o en antiparalelo con el LED valen; sin diodo no", () => {
    const o = objetivoDe("protegido", ["L:rojo:1"]);
    expect(evaluarMontaje(rama(["R:470:1", "D:1N4007:1", "L:rojo:1"], 0), 9, o)).toBe("correcto");
    const anti: Montaje3 = { piezas: [...rama(["R:470:1", "L:rojo:1"], 0).piezas, { id: "D:1N4007:1", f: 1, c: 2, g: true }], cables: rama(["R:470:1", "L:rojo:1"], 0).cables };
    expect(evaluarMontaje(anti, 9, o)).toBe("correcto");
    expect(evaluarMontaje(rama(["R:470:1", "L:rojo:1"], 0), 9, o)).toBe("mal");
  });

  it("interruptor: en serie controla el LED; en paralelo no; apagar solo el rojo", () => {
    const o = objetivoDe("interruptor", ["L:rojo:1"]);
    expect(evaluarMontaje(rama(["S:int:1", "R:470:1", "L:rojo:1"], 0), 9, o)).toBe("correcto");
    expect(evaluarMontaje(rama(["R:470:1", "S:int:1", "L:rojo:1"], 0), 9, o)).toBe("correcto"); // otro orden: también vale
    const r = objetivoDe("soloRojo", ["L:rojo:1", "L:verde:1"]);
    expect(evaluarMontaje(unir(rama(["S:int:1", "R:470:1", "L:rojo:1"], 0), rama(["R:470:2", "L:verde:1"], 1)), 9, r)).toBe("correcto");
    expect(evaluarMontaje(unir(rama(["R:470:1", "L:rojo:1"], 0), rama(["S:int:1", "R:470:2", "L:verde:1"], 1)), 9, r)).toBe("mal");
  });

  it("serie y paralelo de dos LED", () => {
    expect(evaluarMontaje(rama(["R:330:1", "L:rojo:1", "L:rojo:2"], 0), 9, objetivoDe("serie2", ["L:rojo:1", "L:rojo:2"]))).toBe("correcto");
    const p = objetivoDe("paralelo2", ["L:rojo:1", "L:rojo:2"]);
    expect(evaluarMontaje(unir(rama(["R:470:1", "L:rojo:1"], 0), rama(["R:470:2", "L:rojo:2"], 1)), 9, p)).toBe("correcto");
    expect(evaluarMontaje(rama(["R:220:1", ["L:rojo:1", "L:rojo:2"]], 0), 9, p)).toBe("mal"); // una R para los dos: no son independientes
  });
});

describe("placa3: la jugada es un dato no fiable", () => {
  it("rechaza formato, piezas ajenas o repetidas, agujeros ocupados dos veces, filas fuera de la placa y textos largos", () => {
    const bien = codificar(rama(["R:470:1", "L:rojo:1"], 0));
    expect(decodificar(bien, ops)).not.toBeNull();
    expect(decodificar("|", ops)).toEqual({ piezas: [], cables: [] });
    for (const malo of ["", "x", "R:470:1@0,0", "R:999:1@0,0|", "R:470:1@0,0;R:470:1@0,1|", "R:470:1@0,0;L:rojo:1@0,0|", "R:470:1@3,0|",
      "R:470:1@0,0|0,0>+0", "|+0>+0", "|+9>0,0", "|0,0>1,1>2,2", `|${Array.from({ length: 30 }, (_, i) => `+${i % 8}>${i % 4},${i % 10}`).join(";")}`, "R".repeat(3000), 42])
      expect(decodificar(malo, ops), String(malo).slice(0, 40)).toBeNull();
    expect(piezaValida({ circuito: "placa3", opciones: ops }, bien)).toBe(true);
    expect(piezaValida({ circuito: "placa3", opciones: ["L:rojo:1"] }, bien)).toBe(false);
  });
});

describe("placa3: multímetro entre dos agujeros", () => {
  const z = { volts: 9, plantilla: "led", opciones: ["R:470:1", "L:rojo:1", "C:100uF:1"] };
  const j = codificar(rama(["R:470:1", "L:rojo:1"], 0));
  it("tensión del LED ≈ 2 V y del riel + al − = la batería; continuidad en la misma tira pasa", () => {
    const t = medirPlaca3(z, j, "tension", "1,0~2,1") as { voltios: number; dial?: string };
    expect(t.voltios).toBeCloseTo(2, 1);
    expect(t.dial).toBe("correcto");
    expect((medirPlaca3(z, j, "tension", "+3~-5") as { voltios: number }).voltios).toBeGreaterThan(8.9);
    expect(medirPlaca3(z, j, "continuidad", "0,0~0,3")).toMatchObject({ pasa: true });
    expect(medirPlaca3(z, j, "continuidad", "0,0~0,7")).toMatchObject({ pasa: false }); // el canal central aísla los dos lados
    expect(medir({ circuito: "placa3", ...z }, j, "tension", "nada")).toBeNull();
  });
  it("circuito incompleto o mal conectado: lectura sin dial (gris)", () => {
    const l = medirPlaca3(z, codificar(rama(["C:100uF:1", "L:rojo:1"], 0)), "tension", "0,0~1,0") as { dial?: string; voltios: number };
    expect(l.dial).toBeUndefined();
    expect(l.voltios).toBeGreaterThan(8); // todo cae en el capacitor abierto
  });
  it("propiedad: el dial coincide con el veredicto en referencia y trampas (300 semillas por plantilla)", () => {
    for (const p of PLANTILLAS) for (let s = 0; s < 300; s++) {
      const x = sortearProblema(mulberry32(s), p), zz = { volts: x.volts, plantilla: p, opciones: x.opciones };
      for (const jug of [x.solucion, ...x.trampas]) {
        const v = evaluar({ circuito: "placa3", ...zz }, jug), d = (medirPlaca3(zz, jug, "tension", "+0~-0") as { dial?: string }).dial;
        expect(d, `${p} ${s} ${v}`).toBe(v === "mal" ? undefined : v === "correcto" || v === "poco" ? v : "demasiado");
      }
    }
  });
});

describe("placa3 en el árbitro", () => {
  const prob = sortearProblema(mulberry32(7), "soloRojo");
  const pods: Pod[] = [{ numero: 1, zonas: [{ zona: 1, nombre: "cabina", circuito: "placa3", ...prob }] }];
  const nueva = () => {
    const out: ServerMsg[] = [];
    const arb = new Arbiter((_to, m) => out.push(m), { now: () => 0, semilla: 1, practica: true, pods, nivel: 3 });
    arb.handle("p", { t: "hello", alias: "ana" });
    return { arb, out };
  };
  it("envía enunciado, batería y piezas; nunca la solución, las trampas ni la plantilla", () => {
    const { out } = nueva(), start = out.find((m) => m.t === "start")!;
    const z = (start as Extract<ServerMsg, { t: "start" }>).pod.zonas[0]!;
    expect(z.enunciado).toBe(ENUNCIADOS.soloRojo);
    expect(z.opciones.sort()).toEqual([...prob.opciones].sort());
    const txt = JSON.stringify(start);
    expect(txt).not.toContain(prob.solucion);
    expect(txt).not.toMatch(/solucion|trampas|plantilla/);
  });
  it("CHECK: la referencia repara; una trampa no; una jugada inválida se rechaza; medir no penaliza", () => {
    const { arb, out } = nueva();
    arb.handle("p", { t: "medir", seq: 1, t0: 0, zone: 1, pieza: prob.trampas[0], modo: "tension", punto: "+0~-0" });
    expect(out.at(-1)).toMatchObject({ t: "medida" });
    arb.handle("p", { t: "test", seq: 2, t0: 0, zone: 1, pieza: "R:470:1@0,0;R:470:1@0,1|" });
    expect(out.at(-1)).toMatchObject({ t: "reject", reason: "pieza no válida" });
    arb.handle("p", { t: "test", seq: 3, t0: 0, zone: 1, pieza: prob.trampas[0] });
    const r = out.at(-1) as Extract<ServerMsg, { t: "result" }>;
    expect(r.t).toBe("result");
    expect(r.veredicto).not.toBe("correcto");
    expect(r.waitMs).toBeGreaterThan(0); // mismas penalizaciones
  });
  it("la referencia repara la zona", () => {
    const { arb, out } = nueva();
    arb.handle("p", { t: "test", seq: 1, t0: 0, zone: 1, pieza: prob.solucion });
    expect(out.at(-1)).toMatchObject({ t: "result", veredicto: "correcto" });
  });
});
