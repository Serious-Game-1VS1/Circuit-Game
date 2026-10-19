/**
 * Motor de simulación del pod. Biblioteca pura, sin dependencias del motor gráfico
 * ni de la red, para compartirla entre el cliente y el árbitro (RNF-07).
 * Unidades: voltios, ohmios y miliamperios.
 */

export type LoadId = "radar" | "escudo" | "prop";
export type Topology = "par" | "ser";

export const LOADS: Record<LoadId, { ohms: number }> = {
  radar: { ohms: 90 },
  escudo: { ohms: 45 },
  prop: { ohms: 60 },
};

export const LED = { vf: 2, maxMa: 20 } as const;
export const MIN_LOAD_VOLTS = 7;

export interface PodState {
  vSource: number;
  limitMa: number;
  topology: Topology;
  loads: Record<LoadId, boolean>;
  baliza: { connected: boolean; ohms: number; reversed: boolean };
}

export type ModuleStatus = "off" | "ok" | "low" | "dead" | "burnt";

export interface ModuleReading {
  status: ModuleStatus;
  volts: number;
  ma: number;
}

export interface PodResult {
  totalMa: number;
  powerW: number;
  overload: boolean;
  loads: Record<LoadId, ModuleReading>;
  baliza: ModuleReading;
}

const off = (): ModuleReading => ({ status: "off", volts: 0, ma: 0 });

export function defaultPod(): PodState {
  return {
    vSource: 9,
    limitMa: 400,
    topology: "par",
    loads: { radar: false, escudo: false, prop: false },
    baliza: { connected: false, ohms: 470, reversed: false },
  };
}

/**
 * La baliza LED es siempre una rama en paralelo con la fuente, sea cual sea la
 * topología elegida para las cargas resistivas (Radar, Escudo, Propulsor).
 */
export function solve(pod: PodState): PodResult {
  const ids = (Object.keys(LOADS) as LoadId[]).filter((k) => pod.loads[k]);
  const loads: Record<LoadId, ModuleReading> = { radar: off(), escudo: off(), prop: off() };

  let resistiveMa = 0;
  if (ids.length > 0) {
    if (pod.topology === "par") {
      for (const id of ids) {
        const ma = (pod.vSource / LOADS[id].ohms) * 1000;
        loads[id] = { status: "ok", volts: pod.vSource, ma };
        resistiveMa += ma;
      }
    } else {
      const rTotal = ids.reduce((sum, id) => sum + LOADS[id].ohms, 0);
      const ma = (pod.vSource / rTotal) * 1000;
      for (const id of ids) {
        loads[id] = { status: "ok", volts: (ma / 1000) * LOADS[id].ohms, ma };
      }
      resistiveMa = ma;
    }
  }

  let baliza = off();
  if (pod.baliza.connected && !pod.baliza.reversed && pod.vSource > LED.vf) {
    const ma = ((pod.vSource - LED.vf) / pod.baliza.ohms) * 1000;
    baliza = { status: ma > LED.maxMa ? "burnt" : "ok", volts: LED.vf, ma };
  } else if (pod.baliza.connected) {
    baliza = { status: "dead", volts: 0, ma: 0 };
  }

  const totalMa = resistiveMa + baliza.ma;
  const overload = totalMa > pod.limitMa;

  for (const id of ids) {
    const r = loads[id];
    if (overload) loads[id] = { status: "dead", volts: 0, ma: 0 };
    else if (r.volts < MIN_LOAD_VOLTS) loads[id] = { ...r, status: "low" };
  }
  if (overload && baliza.status !== "off") baliza = { status: "dead", volts: 0, ma: 0 };

  return {
    totalMa,
    powerW: overload ? 0 : (pod.vSource * totalMa) / 1000,
    overload,
    loads,
    baliza,
  };
}
