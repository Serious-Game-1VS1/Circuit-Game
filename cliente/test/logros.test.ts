import { describe, expect, it } from "vitest";
import { CONDICION, HABILIDAD, filasHabilidades, filasInsignias, filasNaves, resumenLogros } from "../src/logros";
import { claves } from "../src/dominio";
import { INSIGNIAS, NAVES, cargarPerfil } from "../src/perfil";

describe("logros", () => {
  // Cuerpo de Logros: 14 px Courier (0,6 em por carácter) en 312 px; se resta margen porque ★ ☆ ✔ 🔒 salen más anchos.
  const MAX = Math.floor((360 - 48) / (14 * 0.6)) - 5;
  const p = { ...cargarPerfil("Ana"), insignias: ["primer-pod"], dominio: { [claves[0]!]: { aciertos: 1, fallos: 0 } } };
  it("textos cortos, sin «…» ni cortes", () => {
    for (const i of INSIGNIAS) expect(CONDICION[i.id], i.id).toBeTruthy();
    for (const k of claves) expect(HABILIDAD[k], k).toBeTruthy();
    const filas = [...filasInsignias({ ...p, insignias: [] }).flatMap((f) => f.split(String.fromCharCode(10))), ...filasHabilidades(p), ...filasHabilidades({ ...p, dominio: Object.fromEntries(claves.map((k) => [k, { aciertos: 1, fallos: 0 }])) }), ...filasNaves(p)];
    for (const f of filas) { expect(f).not.toContain("…"); expect(f.length, f).toBeLessThanOrEqual(MAX); }
  });
  it("resumen y filas", () => {
    expect(resumenLogros(p)).toBe(`Insignias 1/${INSIGNIAS.length} · Habilidades 0/${claves.length} · Naves 1/${NAVES.length}`);
    expect(filasInsignias(p)[0]).toBe("✔ Primer pod");
    expect(filasInsignias(p)[1]).toMatch(/^· Sin quemadas\n/);
    expect(filasHabilidades(p)[0]).toMatch(/^☆☆☆ .* \(1\/3\)$/);
    expect(filasHabilidades(p)[1]).not.toMatch(/intentos|\(/);
    expect(filasNaves(p)[0]).toBe("✔ Cometa");
    expect(filasNaves(p)[3]).toMatch(/^🔒 Yunque/);
  });
});
