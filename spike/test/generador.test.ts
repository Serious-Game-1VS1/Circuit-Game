import { describe, expect, it } from "vitest";
import { encadena, generar, generarOleada, mulberry32, oleadaDe, presupuesto, validarPartida, validarPodOleada, validarZona, type Pod } from "../src/engine/generador.js";
import { evaluar } from "../src/engine/pods.js";
import type { Nivel } from "../src/protocol.js";

const NIVELES: Nivel[] = [1, 2];

describe("generador de pods (RF-06)", () => {
  it("mulberry32 es determinista y distinto por semilla", () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it.each(NIVELES)("nivel %i: la misma semilla regenera los mismos pods; otra semilla, otros", (nivel) => {
    expect(generar(123, nivel)).toEqual(generar(123, nivel));
    const distintas = new Set(Array.from({ length: 20 }, (_, s) => JSON.stringify(generar(s, nivel))));
    expect(distintas.size).toBeGreaterThan(15);
  });

  it.each(NIVELES)("nivel %i: 500 sorteos válidos (el CI corre 10 000 con npm run validar:sorteos)", (nivel) => {
    for (let s = 0; s < 500; s++) expect(validarPartida(generar(s, nivel), nivel)).toBeNull();
  });

  it("estructura: 5 pods, los 3 primeros con una zona; cada zona con exactamente una opción correcta", () => {
    const pods = generar(7, 2);
    expect(pods.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5]);
    expect(pods.slice(0, 3).every((p) => p.zonas.length === 1)).toBe(true);
    for (const z of pods.flatMap((p) => p.zonas)) {
      expect(z.opciones.filter((o) => evaluar(z, o) === "correcto")).toEqual([z.solucion]);
    }
  });

  it("cada zona de resistencia ofrece 3 de las 4 y el voltaje fija la correcta (Figura 8)", () => {
    const zonas = Array.from({ length: 200 }, (_, s) => generar(s, 1)).flat().flatMap((p) => p.zonas).filter((z) => z.circuito === "led");
    expect(zonas.every((z) => z.opciones.length === 3)).toBe(true);
    const porVolts = new Map(zonas.map((z) => [z.volts, z.solucion]));
    expect(Object.fromEntries(porVolts)).toEqual({ 3.7: "100", 4.5: "220", 9: "470" });
    // la correcta no está siempre en la misma posición
    expect(new Set(zonas.map((z) => z.opciones.indexOf(z.solucion))).size).toBe(3);
  });

  it("nivel 2 cubre focos en paralelo, interruptor y fusible con sus veredictos", () => {
    const zonas = Array.from({ length: 50 }, (_, s) => generar(s, 2)).flat().flatMap((p) => p.zonas);
    const de = (c: string) => zonas.find((z) => z.circuito === c)!;
    const v = (c: string) => Object.fromEntries(de(c).opciones.map((o) => [o, evaluar(de(c), o)]));
    expect(v("luces")).toEqual({ paralelo: "correcto", serie: "poco", puente: "corto" });
    expect(v("interruptor")).toEqual({ serie: "correcto", paralelo: "corto" });
    expect(v("fusible")).toEqual({ "0.5": "poco", "1": "correcto", "3": "se quema" });
  });

  it("presupuesto: igual para ambos jugadores porque reciben la misma secuencia; pods 1 a 3 acotados", () => {
    for (const nivel of NIVELES) {
      const pods = generar(99, nivel);
      expect(pods.slice(0, 3).every((p) => presupuesto(p) <= 2)).toBe(true);
    }
  });

  it.each([1, 2, "mixto"] as const)("justicia, perfil %s: 1000 semillas, presupuesto por pod acotado (≤2 en pods 1-3, ≤7 en 4-5) y regenerado igual para el otro jugador", (perfil) => {
    for (let s = 0; s < 1000; s++) {
      const a = generar(s, perfil), b = generar(s, perfil);
      expect(a.map(presupuesto)).toEqual(b.map(presupuesto));
      a.forEach((p, i) => expect(presupuesto(p)).toBeLessThanOrEqual(i < 3 ? 2 : 7));
    }
  });

  it("el validador rechaza soluciones falsas, opciones triviales y falta de cobertura", () => {
    const pods = generar(5, 1);
    const copia = (): Pod[] => structuredClone(pods);
    const z = pods[0]!.zonas[0]!;

    const malaSolucion = copia();
    malaSolucion[0]!.zonas[0]!.solucion = z.opciones.find((o) => o !== z.solucion)!;
    expect(validarPartida(malaSolucion, 1)).toMatch(/solución no única/);

    expect(validarZona({ ...z, opciones: [z.solucion] })).toMatch(/insuficientes/);
    expect(validarZona({ ...z, opciones: [z.solucion, "47"] })).toMatch(/catálogo/);
    // cabina de nivel 1 a 3,7 V: ninguna resistencia deja los dos LED en verde
    expect(validarZona({ zona: 1, nombre: "cabina", circuito: "cabina", volts: 3.7, opciones: ["100", "220", "470"], solucion: "100" })).not.toBeNull();

    const sinCobertura = copia().map((p) => ({ ...p, zonas: p.zonas.filter((x) => x.circuito !== "cabina") }));
    expect(validarPartida(sinCobertura, 1)).not.toBeNull();
  });
});

describe("generador en modo demo (solo Radar)", () => {
  it("10 000 sorteos demo son válidos y deterministas: 5 pods, solo Radar, LED, 4,5 o 9 V, 4 resistencias", () => {
    const semillas = mulberry32(7);
    for (let i = 0; i < 10_000; i++) {
      const s = Math.floor(semillas() * 2 ** 32);
      const pods = generar(s, 1, "radar");
      expect(validarPartida(pods, 1, "radar")).toBeNull();
      if (i < 50) expect(generar(s, 1, "radar")).toEqual(pods);
    }
  });

  it("las fuentes varían y la solución es la del motor (4,5 V → 220 Ω, 9 V → 470 Ω)", () => {
    const zonas = Array.from({ length: 200 }, (_, s) => generar(s, 1, "radar")).flat().map((p) => p.zonas[0]!);
    expect(new Set(zonas.map((z) => z.volts))).toEqual(new Set([4.5, 9]));
    for (const z of zonas) expect(z.solucion).toBe(z.volts === 9 ? "470" : "220");
  });

  it("validarPartida en demo rechaza un pod con otra zona", () => {
    const pods = generar(1, 1, "radar");
    pods[2]!.zonas[0] = { ...pods[2]!.zonas[0]!, zona: 1, nombre: "cabina" };
    expect(validarPartida(pods, 1, "radar")).toMatch(/demo, pod 3/);
  });
});

describe("generador en modo demo de cableado (Cabina y Turbina)", () => {
  it("10 000 sorteos válidos y deterministas: pods 1-3 con una zona, 4-5 con una o dos, ambas mecánicas en la partida", () => {
    const semillas = mulberry32(11);
    const tamanos = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const s = Math.floor(semillas() * 2 ** 32);
      const pods = generar(s, 1, "cableado");
      expect(validarPartida(pods, 1, "cableado")).toBeNull();
      if (i < 50) expect(generar(s, 1, "cableado")).toEqual(pods);
      expect(pods.slice(0, 3).every((p) => p.zonas.length === 1)).toBe(true);
      pods.slice(3).forEach((p) => tamanos.add(p.zonas.length));
    }
    expect(tamanos).toEqual(new Set([1, 2]));
  });

  it("veredictos del motor: Cabina pide paralelo, Turbina pide serie; la gaveta ofrece todos los montajes", () => {
    const zonas = Array.from({ length: 30 }, (_, s) => generar(s, 1, "cableado")).flat().flatMap((p) => p.zonas);
    for (const z of zonas) {
      expect(z.solucion).toBe(z.circuito === "luces" ? "paralelo" : "serie");
      expect(z.opciones.length).toBe(z.circuito === "luces" ? 3 : 2);
    }
  });

  it("validarPartida en demo de cableado rechaza el Radar y un pod pequeño con dos zonas", () => {
    const radar = generar(1, 1, "cableado");
    radar[0]!.zonas[0] = generar(1, 1, "radar")[0]!.zonas[0]!;
    expect(validarPartida(radar, 1, "cableado")).toMatch(/demo, pod 1/);
    const doble = generar(2, 1, "cableado");
    const otra = doble.flatMap((p) => p.zonas).find((z) => z.zona !== doble[0]!.zonas[0]!.zona)!;
    doble[0]!.zonas.push(otra);
    expect(validarPartida(doble, 1, "cableado")).toMatch(/2 zonas/);
  });
});

// En spike/test/generador.test.ts
describe("generador en modo demo de cableado (Cabina y Turbina)", () => {
  it("10 000 sorteos válidos y deterministas: pods 1-3 con una zona, 4-5 con una o dos, ambas mecánicas en la partida", () => {
     // ...
  }, 15000); 
});

describe("falla encadenada (solo Oleadas)", () => {
  const h = (x: string) => { let a = 5381; for (const c of x) a = (Math.imul(a, 33) ^ c.charCodeAt(0)) >>> 0; return a; };
  // Huellas (nivel 2 actualizado al añadir LED invertido y circuito abierto); tomadas antes de añadir la encadenada: el duelo, la práctica normal y las zonas de Oleadas no deben cambiar.
  const HUELLAS: [Nivel, number, number, number][] = [
    [1, 1, 3303168567, 644005380], [1, 7, 350318067, 1267894063], [1, 42, 210100651, 2322169135], [1, 20261019, 1966667399, 4137727553],
    [2, 1, 3355728347, 2966361371], [2, 7, 3147094937, 3772403275], [2, 42, 2982547121, 2629610711], [2, 20261019, 4235179758, 4285239548],
  ];
  it.each(HUELLAS)("nivel %i, semilla %i: mismos pods que antes (partida y zonas de las 18 primeras oleadas)", (nivel, s, partida, oleada) => {
    expect(h(JSON.stringify(generar(s, nivel)))).toBe(partida);
    const zonas = Array.from({ length: 18 }, (_, i) => { const p = generarOleada(s, nivel, i + 1); return { numero: p.numero, zonas: p.zonas }; });
    expect(h(JSON.stringify(zonas))).toBe(oleada);
  });

  it("rampa: ninguna en las oleadas 1 y 2; un pod de cada 3 desde la 3 y uno de cada 2 desde la 5", () => {
    for (let s = 0; s < 200; s++) {
      for (let n = 1; n <= 6; n++) expect(encadena(s, n)).toBe(false);
      for (const g of [7, 10]) expect([0, 1, 2].filter((i) => encadena(s, g + i))).toHaveLength(1);
      for (let g = 13; g < 31; g += 2) expect([0, 1].filter((i) => encadena(s, g + i))).toHaveLength(1);
    }
    expect(oleadaDe(7)).toBe(3);
    expect(oleadaDe(13)).toBe(5);
  });

  it.each(NIVELES)("nivel %i: 300 sorteos de 18 pods válidos; la segunda falla se resuelve con otra pieza y es determinista", (nivel) => {
    let vistas = 0;
    for (let s = 0; s < 300; s++) {
      for (let n = 1; n <= 18; n++) {
        const p = generarOleada(s, nivel, n);
        expect(validarPodOleada(p, nivel)).toBeNull();
        expect(JSON.stringify(generarOleada(s, nivel, n))).toBe(JSON.stringify(p));
        if (!encadena(s, n)) expect(p.encadenada).toBeUndefined();
        if (p.encadenada) {
          vistas++;
          const b = p.zonas.find((z) => z.zona === p.encadenada!.zona)!;
          expect(p.encadenada.opciones.map((o) => evaluar(p.encadenada!, o)).filter((v) => v === "correcto")).toHaveLength(1);
          expect(evaluar(p.encadenada, b.solucion)).not.toBe("correcto"); // repetir la pieza de la primera no sirve
        }
      }
    }
    expect(vistas).toBeGreaterThan(300);
  });
});
