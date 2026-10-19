import { describe, expect, it } from "vitest";
import { defaultPod, solve, type PodState } from "../src/engine/pod.js";

/** RNF-01: el motor debe coincidir con el cálculo analítico con error <= 1 %. */
const within1pct = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(0.01);

const pod = (patch: Omit<Partial<PodState>, "loads"> & { loads?: Partial<PodState["loads"]> }): PodState => {
  const base = defaultPod();
  return { ...base, ...patch, loads: { ...base.loads, ...patch.loads } };
};

describe("motor del pod: paralelo", () => {
  it("Radar + Escudo = 300 mA y ambos funcionan", () => {
    const r = solve(pod({ loads: { radar: true, escudo: true } }));
    within1pct(r.totalMa, 300);
    within1pct(r.powerW, 2.7);
    expect(r.overload).toBe(false);
    expect(r.loads.radar.status).toBe("ok");
    expect(r.loads.escudo.status).toBe("ok");
  });

  it("Radar + Escudo + Propulsor = 450 mA sobrecarga la fuente de 400 mA", () => {
    const r = solve(pod({ loads: { radar: true, escudo: true, prop: true } }));
    within1pct(r.totalMa, 450);
    expect(r.overload).toBe(true);
    expect(r.loads.radar.status).toBe("dead");
  });

  it("sin módulos conectados no hay corriente", () => {
    const r = solve(defaultPod());
    expect(r.totalMa).toBe(0);
    expect(r.overload).toBe(false);
  });
});

describe("motor del pod: serie", () => {
  it("Radar + Escudo en serie: 66,7 mA, 6 V y 3 V, ambos subalimentados", () => {
    const r = solve(pod({ topology: "ser", loads: { radar: true, escudo: true } }));
    within1pct(r.totalMa, 66.667);
    within1pct(r.loads.radar.volts, 6);
    within1pct(r.loads.escudo.volts, 3);
    expect(r.loads.radar.status).toBe("low");
    expect(r.loads.escudo.status).toBe("low");
  });

  it("un solo módulo en serie recibe los 9 V completos", () => {
    const r = solve(pod({ topology: "ser", loads: { escudo: true } }));
    within1pct(r.loads.escudo.volts, 9);
    expect(r.loads.escudo.status).toBe("ok");
  });

  it("los voltajes de la serie suman el de la fuente", () => {
    const r = solve(pod({ topology: "ser", loads: { radar: true, escudo: true, prop: true } }));
    within1pct(r.loads.radar.volts + r.loads.escudo.volts + r.loads.prop.volts, 9);
  });
});

describe("motor del pod: baliza LED", () => {
  const baliza = (ohms: number, vSource = 9, reversed = false) =>
    solve(pod({ vSource, baliza: { connected: true, ohms, reversed } }));

  it("9 V y 470 Ω: 14,9 mA (ejemplo del anteproyecto)", () => {
    const r = baliza(470);
    within1pct(r.baliza.ma, 14.894);
    expect(r.baliza.status).toBe("ok");
  });

  it("9 V y 220 Ω: 31,8 mA quema el LED", () => {
    const r = baliza(220);
    within1pct(r.baliza.ma, 31.818);
    expect(r.baliza.status).toBe("burnt");
  });

  it("5 V y 220 Ω: 13,6 mA funciona", () => {
    const r = baliza(220, 5);
    within1pct(r.baliza.ma, 13.636);
    expect(r.baliza.status).toBe("ok");
  });

  it("LED invertido no conduce", () => {
    const r = baliza(470, 9, true);
    expect(r.baliza.ma).toBe(0);
    expect(r.baliza.status).toBe("dead");
  });
});
