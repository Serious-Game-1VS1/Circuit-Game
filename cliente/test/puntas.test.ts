import { describe, expect, it } from "vitest";
import { agujaEn, curva, dibujarPuntas, duracionFases, extension, extremosPlaca, faseEn, JACK, puntosMedida } from "../src/puntas";

const g = () => { const llamadas: string[] = []; const f = (n: string) => () => (llamadas.push(n), o); const o: any = { llamadas, clear: f("clear"), lineStyle: f("lineStyle"), strokePoints: f("strokePoints"), fillStyle: f("fillStyle"), fillCircle: f("fillCircle"), strokeCircle: f("strokeCircle"), lineBetween: f("lineBetween") }; return o; };

describe("puntas del multímetro", () => {
  it("las fases escalan con medirMs del árbitro (35 % / 50 % / 15 %)", () => {
    for (const ms of [1000, 3000]) {
      const d = duracionFases(ms);
      expect(d.viajeMs + d.contactoMs + d.retiradaMs).toBeCloseTo(ms);
      expect(d.viajeMs).toBeCloseTo(ms * 0.35);
      expect(faseEn(d.viajeMs - 1, ms).fase).toBe("viaje");
      expect(faseEn(d.viajeMs + 1, ms).fase).toBe("contacto");
      expect(faseEn(d.viajeMs + d.contactoMs + 1, ms).fase).toBe("retirada");
      expect(faseEn(ms + 1, ms).fase).toBe("fin");
    }
    expect(faseEn(1500, 3000).fase).toBe("contacto"); // a 1,5 s con 3 s ya toca; con 1 s ya terminó (no hay 1 s fijo)
    expect(faseEn(1500, 1000).fase).toBe("fin");
  });

  it("prefers-reduced-motion: cables ya conectados, sin viaje ni destello", () => {
    expect(faseEn(0, 3000, true).fase).toBe("contacto");
    expect(faseEn(2000, 3000, true).fase).toBe("contacto");
    expect(faseEn(2600, 3000, true).fase).toBe("retirada");
    const gr = g(), f = dibujarPuntas(gr, { transcurrido: 0, medirMs: 3000, reducido: true, rojo: { x: 140, y: 34 }, negro: { x: 220, y: 34 } });
    expect(f.fase).toBe("contacto");
    expect(gr.llamadas).not.toContain("lineBetween"); // sin destello
    expect(extension("contacto", 0)).toBe(1);
  });

  it("el cable viaja del jack a la punta y se retira; fin o cancelar dejan el Graphics vacío", () => {
    const c = curva(JACK.rojo, { x: 140, y: 34 });
    expect(c[0]).toEqual(JACK.rojo);
    expect(c.at(-1)!.x).toBeCloseTo(140);
    expect(extension("viaje", 0)).toBe(0);
    expect(extension("viaje", 1)).toBe(1);
    expect(extension("retirada", 1)).toBe(0);
    const gr = g();
    dibujarPuntas(gr, { transcurrido: 5000, medirMs: 3000, reducido: false, rojo: { x: 1, y: 1 }, negro: { x: 2, y: 2 } });
    expect(gr.llamadas).toEqual(["clear"]); // pasado el tiempo (o midiendo limpiado) no queda nada dibujado
    const g2 = g();
    dibujarPuntas(g2, { transcurrido: 3000 * 0.35 + 50, medirMs: 3000, reducido: false, rojo: { x: 1, y: 1 }, negro: { x: 2, y: 2 } });
    expect(g2.llamadas).toContain("lineBetween"); // destello al hacer contacto
  });

  it("la aguja reposa al viajar, va a su zona al tocar y tiembla si aún no hay lectura", () => {
    expect(agujaEn("viaje", 0.5, 30)).toBe(-60);
    expect(agujaEn("contacto", 1, 30)).toBeCloseTo(30);
    expect(agujaEn("retirada", 0.5, 30)).toBe(30);
    expect(Math.abs(agujaEn("contacto", 0.5, null, 90 * Math.PI / 2))).toBeCloseTo(50);
  });

  it("qué puntos se conectan: pieza, carga, cadena, montaje y placa; los mismos en tensión y continuidad", () => {
    for (const modo of ["tension", "continuidad"] as const) {
      expect(puntosMedida({ circuito: "led", punto: "pieza", modo })).toEqual({ rojo: { x: 140, y: 34 }, negro: { x: 220, y: 34 } });
      expect(puntosMedida({ circuito: "led", punto: "carga1", modo })).toEqual({ rojo: { x: 310, y: 44 }, negro: { x: 310, y: 108 } });
      const cab = puntosMedida({ circuito: "cabina", punto: "carga2", modo, cargas: 2 });
      expect(cab.rojo.y).toBeGreaterThan(puntosMedida({ circuito: "cabina", punto: "carga1", modo, cargas: 2 }).negro.y);
      const h = puntosMedida({ circuito: "cadena", punto: "t2", modo, cadenaN: 4 });
      expect(h.negro.x - h.rojo.x).toBe(48);
      expect(puntosMedida({ circuito: "protegido", punto: "carga1", modo, bornes: [[-54, 0], [53, 0]] })).toEqual({ rojo: { x: 234, y: 62 }, negro: { x: 341, y: 62 } });
      expect(puntosMedida({ circuito: "divisor", punto: "pieza", modo, bornes: [[-54, 0], [54, 0]] }).rojo).toEqual({ x: 288, y: 62 }); // nodo medio
    }
    const pl = extremosPlaca("1,1", "2,1", { x: 30, y: -28 });
    expect(puntosMedida({ circuito: "luces", punto: "carga1", modo: "tension", placa: pl })).toEqual({ rojo: pl.a, negro: pl.b });
    expect(pl.b.y).toBeGreaterThan(pl.a.y);
  });
});
