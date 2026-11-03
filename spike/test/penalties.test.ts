import { beforeEach, describe, expect, it } from "vitest";
import { PenaltyTracker } from "../src/arbiter/penalties.js";

/** SCRUM-129: equivocarse solo cuesta tiempo. Reloj falso, sin timers reales. */
describe("PenaltyTracker", () => {
  let t: number;
  let p: PenaltyTracker;
  beforeEach(() => {
    t = 1_000_000;
    p = new PenaltyTracker(() => t);
  });

  it("enfriamiento 2 → 4 → 8 → 8 s por fallos consecutivos", () => {
    expect([1, 2, 3, 4].map(() => p.registerFailure(0, ["R1"]))).toEqual([2000, 4000, 8000, 8000]);
  });

  it("bloquea justo hasta el final del enfriamiento", () => {
    p.registerFailure(0, []);
    t += 1999;
    expect(p.canTest(0, true)).toEqual({ ok: false, reason: "enfriamiento", waitMs: 1 });
    t += 1;
    expect(p.canTest(0, true)).toEqual({ ok: true });
  });

  it("el enfriamiento es por zona", () => {
    p.registerFailure(0, []);
    expect(p.canTest(1, true).ok).toBe(true);
  });

  it("pod nuevo devuelve el enfriamiento a 2 s y libera las zonas", () => {
    p.registerFailure(0, []);
    p.registerFailure(0, []);
    p.newPod();
    expect(p.canTest(0, true).ok).toBe(true);
    expect(p.registerFailure(0, [])).toBe(2000);
  });

  it("un acierto reinicia la racha de la zona", () => {
    p.registerFailure(0, []);
    t += 2000;
    p.registerSuccess(0, []);
    expect(p.registerFailure(0, [])).toBe(2000);
  });

  it("'Probar' se desactiva si no hubo cambios", () => {
    expect(p.canTest(0, false)).toEqual({ ok: false, reason: "sin-cambios", waitMs: 0 });
  });

  it("medir no cuesta nada ni cuenta como intento", () => {
    p.measure();
    p.measure();
    expect(p.attemptsLog).toHaveLength(0);
    expect(p.canTest(0, true).ok).toBe(true);
    expect(p.registerFailure(0, [])).toBe(2000);
  });

  it("pieza quemada bloquea 4 s en todas las zonas y la tarjeta se ve 3 s", () => {
    p.registerBurn(2, ["LED1"]);
    expect(p.canTest(0, true)).toEqual({ ok: false, reason: "quemada", waitMs: 4000 });
    t += 2999;
    expect(p.burnCardVisible()).toBe(true);
    t += 1;
    expect(p.burnCardVisible()).toBe(false);
    expect(p.canTest(3, true).ok).toBe(false);
    t += 1000;
    expect(p.canTest(3, true).ok).toBe(true);
  });

  it("registra cada intento con piezas, resultado, tiempo y quemada", () => {
    t += 500;
    p.registerFailure(1, ["R1", "LED1"]);
    expect(p.attemptsLog).toEqual([{ zone: 1, pieces: ["R1", "LED1"], passed: false, atMs: 500, burned: false }]);
  });

  it("exporta CSV UTF-8 con ';', cabecera y escape", () => {
    p.registerSuccess(0, ["R1", "R2"]);
    t += 1500;
    p.registerBurn(1, ['x;"y"']);
    expect(p.toCsv()).toBe(
      "﻿intento;zona;piezas;resultado;tiempo_ms;quemada\r\n" +
        "1;0;R1|R2;ok;0;no\r\n" +
        '2;1;"x;""y""";fallo;1500;si\r\n',
    );
  });

  describe("racha y bono de enfriamiento reducido", () => {
    const ok = (n: number) => { for (let i = 0; i < n; i++) p.registerSuccess(10 + i, []); };
    const fail = (n: number) => { for (let i = 0; i < n; i++) p.registerFailure(0, []); };

    it("3 despachos seguidos arman el bono; con 2 no", () => {
      ok(2);
      expect([p.racha, p.bono]).toEqual([2, false]);
      ok(1);
      expect([p.racha, p.bono, p.bonoEvento]).toEqual([3, true, "listo"]);
    });
    it("el próximo fallo espera la mitad (8→4, 4→2, 2→1), una sola vez, y reinicia la racha", () => {
      fail(2); // fails=2 en la zona 0
      ok(3);
      expect(p.registerFailure(0, [])).toBe(4000); // 3.er fallo = 8 s → 4 s
      expect([p.racha, p.bono, p.bonoEvento]).toEqual([0, false, "usado"]);
      expect(p.registerFailure(0, [])).toBe(8000); // sin bono, vuelve la tabla normal
      p.newPod();
      ok(3);
      expect(p.registerFailure(0, [])).toBe(1000); // mitad de 2 s, mínimo 1 s
    });
    it("fallar antes de armar reinicia la racha; la quemada pierde racha y bono", () => {
      ok(2); fail(1);
      expect(p.racha).toBe(0);
      ok(3); p.registerBurn(0, []);
      expect([p.racha, p.bono, p.bonoEvento]).toEqual([0, false, "perdido"]);
    });
    it("no se acumula: más aciertos con el bono armado no dan un segundo", () => {
      ok(7);
      expect(p.racha).toBe(3);
      fail(3); // el primero gasta el bono; los otros siguen 2→4 s normales
      expect(p.bono).toBe(false);
    });
    it("un acierto parcial (falla encadenada) no cuenta; se conserva al pasar de pod", () => {
      p.registerSuccess(0, [], false);
      expect(p.racha).toBe(0);
      ok(3); p.newPod();
      expect(p.bono).toBe(true);
    });
    it("el factor de la mejora se aplica y el mínimo de 1 s se respeta", () => {
      p.cooldownFactor = 0.5; fail(2); ok(3);
      expect(p.registerFailure(0, [])).toBe(2000); // 8 s * 0.5 = 4 s, mitad = 2 s
      p.newPod(); p.cooldownFactor = 0.25; ok(3);
      expect(p.registerFailure(0, [])).toBe(1000); // el piso de 1 s acota también la mejora (antes 500 ms): el bono no lo sube
    });
  });
});
