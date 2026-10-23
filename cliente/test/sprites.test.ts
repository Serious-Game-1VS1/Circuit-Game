import { describe, expect, it } from "vitest";
import { PIEZAS } from "../../spike/src/engine/pods";
import { BATTERY_VOLTS } from "../../spike/src/engine/circuit";
import type { Circuito, PodView } from "../../spike/src/protocol";
import { cola, estadoZona, pestanasArte, podDe, sprite, spriteBateria, spriteCarga, spritePieza, spriteTarjeta, ZONAS } from "../src/sprites";
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

  it("piezas de cada familia", () => {
    expect(PIEZAS.led.map((p) => spritePieza("led", p))).toEqual(["resistencia_100", "resistencia_220", "resistencia_470", "resistencia_1k"]);
    expect(PIEZAS.fusible.map((p) => spritePieza("fusible", p))).toEqual(["fusible_fino", "fusible_medio", "fusible_grueso"]);
    expect(spritePieza("luces", "serie")).toBeNull();
    expect(spritePieza("led", undefined)).toBeNull();
    expect(spriteCarga("led", 4)).toBe("led_rojo_quemado");
    expect(spriteCarga("luces", 4)).toBe("foco_fundido");
    expect(spriteBateria(3.7)).toBe("icono_bateria");
  });
});
