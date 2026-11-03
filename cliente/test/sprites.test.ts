import { describe, expect, it } from "vitest";
import { PIEZAS } from "../../spike/src/engine/pods";
import { BATTERY_VOLTS } from "../../spike/src/engine/circuit";
import type { Circuito, PodView } from "../../spike/src/protocol";
import { cola, etiquetaCarga, huecosCadena, spriteCadena, montajeCarga, montajePieza, estadoZona, pestanasArte, podDe, sprite, spriteBateria, spriteCarga, spritePieza, spriteTarjeta, ZONAS } from "../src/sprites";
import { vistaDeVeredicto } from "../src/vista";

const CIRCUITOS: Circuito[] = ["led", "cabina", "luces", "interruptor", "fusible"];
const pod: PodView = {
  numero: 4,
  zonas: [
    { zona: 1, nombre: "cabina", circuito: "cabina", volts: 9, opciones: ["100", "470"], reparada: true },
    { zona: 3, nombre: "reactor", circuito: "fusible", volts: 9, opciones: ["1", "3"], reparada: false },
  ],
};

describe("sprites del Taller", () => {
  it("modelo de nave por número de pod", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => podDe(n).nombre)).toEqual(["Cometa", "Burbuja", "Aguijón", "Yunque", "Raya", "Cometa"]);
  });

  it("estado de cada zona y de su pestaña", () => {
    const quemado = { 3: vistaDeVeredicto("se quema", "fusible") };
    expect(ZONAS.map((z) => estadoZona(pod, z, {}))).toEqual(["sano", "reparado", "sano", "averiado"]);
    expect(estadoZona(pod, "reactor", quemado)).toBe("quemado");
    expect(pestanasArte(pod, 3).map((t) => [t.sprite, t.zona])).toEqual([
      ["pestana_radar_inactiva", null], ["pestana_cabina_reparada", 1], ["pestana_turbina_inactiva", null], ["pestana_reactor_activa", 3],
    ]);
  });

  it("cola de pods detrás de la bahía", () => {
    expect(cola(1, 5)).toEqual([2, 3, 4, 5]);
    expect(cola(5, 5)).toEqual([]);
    expect(cola(6, 5)).toEqual([]);
  });

  it("todo sprite que se puede pedir está en el atlas copiado (npm run arte)", () => {
    const nombres = [
      ...[1, 2, 3, 4, 5].flatMap((n) => ZONAS.flatMap((z) => ["sano", "averiado", "quemado", "reparado"].map((e) => `${podDe(n).id}_${z}_${e}`))),
      ...[1, 2, 3, 4, 5].flatMap((n) => [`${podDe(n).id}_mini_espera`, `${podDe(n).id}_reparado_0`]),
      ...ZONAS.flatMap((z) => ["activa", "inactiva", "alerta", "reparada"].map((e) => `pestana_${z}_${e}`)),
      ...CIRCUITOS.flatMap((c) => [0, 1, 2, 3, 4].map((n) => spriteCarga(c, n))),
      ...CIRCUITOS.flatMap((c) => PIEZAS[c].map((p) => spritePieza(c, p) ?? "boton_secundario")),
      ...BATTERY_VOLTS.map(spriteBateria),
      ...CIRCUITOS.flatMap((c) => [spriteTarjeta(c, vistaDeVeredicto("se quema", c)), spriteTarjeta(c, vistaDeVeredicto("corto", c))]).flatMap((t) => t ?? []),
      ...[0, 1, 2, 3, 4, 5].map((n) => `contador_pods_${n}`), ...[1, 2, 3, 4, 5].map((n) => `puesto_cola_${n}`),
      "fondo_taller", "fondo_taller_ancho", "hud_barra", "hud_barra_ancho", "globo_sintoma", "bahia_0", "bahia_ocupada_0", "humo_0", "humo_negro_0",
      "boton_probar_normal", "boton_probar_deshabilitado", "boton_despachar_normal", "boton_despachar_deshabilitado", "boton_primario",
      "panel_oscuro", "panel_alerta", "medidor_fondo", "medidor_aguja", "icono_reloj", "icono_rival",
    ];
    expect(nombres.filter((n) => !sprite(n))).toEqual([]);
  });

  it("nivel 2: sprites de combinar, divisor y protegido existen y no caen en el icono de turbina", () => {
    const N2: Circuito[] = ["combinar", "divisor", "protegido"];
    for (const c of N2) {
      for (const n of [0, 1, 2, 3, 4]) { expect(sprite(spriteCarga(c, n, "R1 470 Ω"))).toBeTruthy(); expect(spriteCarga(c, n, "R1 470 Ω")).not.toBe("icono_turbina"); }
      if (c !== "divisor") for (const p of PIEZAS[c]) expect(sprite(spritePieza(c, p) ?? "")).toBeTruthy();
    }
    expect(spriteCarga("divisor", 2, "R1 470 Ω")).toBe("resistencia_470");
    expect(spriteCarga("divisor", 2)).toBe("resistencia_220");
    expect(spriteCarga("protegido", 4)).toBe("led_rojo_quemado");
    const z = { zona: 0, nombre: "reactor" as const, circuito: "divisor" as const, volts: 9, opciones: [], reparada: false, fija: "R1 470 Ω" };
    expect(etiquetaCarga(z)).toBe("R1 470 Ω");
    expect(etiquetaCarga({ ...z, circuito: "protegido", fija: undefined })).toBe("DIODO");
    expect(etiquetaCarga({ ...z, circuito: "combinar", fija: undefined })).toBe("");
    expect(spriteBateria(6)).toBe("icono_bateria");
  });

  it("montajes: combinar (1, 2 en serie, 2 en paralelo), divisor R1→R2 y protegido con diodo", () => {
    const rs = (p: string) => montajePieza("combinar", p)!;
    expect(rs("una").elementos).toHaveLength(1);
    expect([rs("una").rotulo, rs("serie").rotulo, rs("paralelo").rotulo]).toEqual(["220 Ω", "440 Ω", "110 Ω"]);
    const [a, b] = rs("serie").elementos, [c, d] = rs("paralelo").elementos;
    expect(a!.y).toBe(b!.y); expect(a!.x).toBeLessThan(b!.x); // en fila
    expect(c!.x).toBe(d!.x); expect(c!.y).toBeLessThan(d!.y); // apiladas
    for (const m of ["una", "serie", "paralelo"].map(rs)) for (const e of m.elementos) expect(sprite(e.sprite!)).toBeTruthy();
    expect(montajePieza("combinar", undefined)).toBeNull();
    expect(montajePieza("led", "220")).toBeNull();
    expect(montajePieza("invertido", "inversa")!.elementos[0]).toMatchObject({ diodo: true, giro: true }); // LED con su polaridad en el centro
    expect(montajePieza("invertido", "directa")!.elementos[0]!.giro).toBe(false);
    expect(montajePieza("abierto", "empalmar")!.cables).toHaveLength(1); // cable seguido
    expect(montajePieza("abierto", "dejar")!.cables.length).toBeGreaterThan(1); // cable cortado
    expect(rs("serie").textos!.filter((t) => t.t === "220 Ω")).toHaveLength(2); // cada resistencia rotulada
    expect(rs("paralelo").textos!.filter((t) => t.t === "220 Ω")).toHaveLength(2);
    const z = { zona: 0, nombre: "reactor" as const, circuito: "protegido" as const, volts: 9, opciones: [], reparada: false };
    const p = montajeCarga(z, 2, "220")!;
    expect(p.elementos.map((e) => e.sprite ?? "diodo")).toEqual(["diodo", "led_rojo_encendido"]);
    const dv = montajeCarga({ ...z, circuito: "divisor", fija: "R1 470 Ω" }, 2, "100")!;
    expect(dv.elementos.map((e) => e.sprite)).toEqual(["resistencia_470", "resistencia_100"]); // R1 primero
    expect(montajeCarga({ ...z, circuito: "divisor", fija: "R1 470 Ω" }, 2, undefined)!.elementos).toHaveLength(1);
    expect(montajeCarga({ ...z, circuito: "led" }, 2, "220")).toBeNull();
    expect(p.ancho).toBeLessThanOrEqual(110);
    expect(dv.ancho).toBeLessThanOrEqual(110);
    expect(dv.puntos).toEqual([[0, 0]]); // nodo medio
    expect(dv.textos!.map((t) => t.t)).toEqual(["V", "R1", "470 Ω", "R2", "100 Ω"]);
    expect(montajeCarga({ ...z, circuito: "divisor", fija: "R1 470 Ω" }, 2, undefined)!.textos!.map((t) => t.t).slice(3)).toEqual(["R2", "?"]);
    for (const c of ["una", "serie", "paralelo"]) expect(rs(c).textos!.map((t) => t.t)).toContain(rs(c).rotulo); // el Ω se dibuja en el montaje
  });

  it("piezas de cada familia", () => {
    expect(PIEZAS.led.map((p) => spritePieza("led", p))).toEqual(["resistencia_100", "resistencia_220", "resistencia_470", "resistencia_1k"]);
    expect(PIEZAS.fusible.map((p) => spritePieza("fusible", p))).toEqual(["fusible_fino", "fusible_medio", "fusible_grueso"]);
    expect(spritePieza("luces", "serie")).toBeNull();
    expect(spritePieza("led", undefined)).toBeNull();
    expect(spriteCarga("led", 4)).toBe("led_rojo_quemado");
    expect(spriteCarga("luces", 4)).toBe("foco_fundido");
    expect(spriteBateria(3.7)).toBe("icono_bateria");
  });

  it("cadena: piezas con sprite del kit (el cable se dibuja) y huecos sin solaparse dentro de los 360 px", () => {
    expect(["cable", "led", "ledInv", "r220", "r1000"].map((p) => spriteCadena(p, 2))).toEqual([null, "led_rojo_encendido", "led_rojo_encendido", "resistencia_220", "resistencia_1k"]);
    expect(spriteCadena("led", 0)).toBe("led_rojo_apagado");
    expect(spriteCarga("cadena", 4)).toBe("led_rojo_quemado");
    for (const n of [3, 4]) {
      const hs = huecosCadena(n);
      expect(hs).toHaveLength(n);
      hs.forEach((h, i) => { expect(h.x - h.w / 2).toBeGreaterThan(70); expect(h.x + h.w / 2).toBeLessThan(335); if (i) expect(h.x - hs[i - 1]!.x).toBeGreaterThanOrEqual(h.w); });
    }
  });
});
