import { mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { eliminarDatosDeAlumno, purgarVencidos } from "../src/docente/retencion.js";

const AHORA = new Date("2026-10-30T12:00:00Z");
const nuevo = () => { const d = mkdtempSync(join(tmpdir(), "ret-")); mkdirSync(join(d, "partidas")); return d; };
const partida = (d: string, id: string, inicio: string, alumnoId?: string) => {
  writeFileSync(join(d, "partidas", `${id}.json`), JSON.stringify({ id, inicio, jugadores: [{ alias: "x", alumnoId }] }));
  writeFileSync(join(d, "partidas", `${id}.csv`), "a");
};

describe("retención", () => {
  it("borra lo viejo (json+csv+sesiones), conserva lo reciente y no toca alumnos.json ni ajenos", () => {
    const d = nuevo();
    partida(d, "vieja", "2025-09-01T00:00:00Z");
    partida(d, "nueva", "2026-09-01T00:00:00Z");
    writeFileSync(join(d, "partidas", "otro.txt"), "z");
    writeFileSync(join(d, "alumnos.json"), '[{"id":"a1","nombre":"Ana"}]');
    writeFileSync(join(d, "sesiones.json"), JSON.stringify([{ codigo: "A", creada: "2025-01-01T00:00:00Z" }, { codigo: "B", creada: "2026-10-01T00:00:00Z" }]));
    expect(purgarVencidos(d, AHORA, 12)).toBe(2);
    expect(existsSync(join(d, "partidas", "vieja.json"))).toBe(false);
    expect(existsSync(join(d, "partidas", "vieja.csv"))).toBe(false);
    expect(existsSync(join(d, "partidas", "nueva.json"))).toBe(true);
    expect(existsSync(join(d, "partidas", "otro.txt"))).toBe(true);
    expect(readFileSync(join(d, "alumnos.json"), "utf8")).toContain("Ana");
    expect(JSON.parse(readFileSync(join(d, "sesiones.json"), "utf8"))).toHaveLength(1);
  });
  it("carpeta vacía, ausente o json dañado no falla", () => {
    expect(purgarVencidos(join(tmpdir(), "no-existe-ret"), AHORA, 12)).toBe(0);
    const d = nuevo();
    writeFileSync(join(d, "partidas", "mala.json"), "{{");
    writeFileSync(join(d, "sesiones.json"), "");
    expect(purgarVencidos(d, AHORA, 12)).toBe(0);
    expect(existsSync(join(d, "partidas", "mala.json"))).toBe(true);
  });
  it("eliminarDatosDeAlumno borra solo sus partidas y valida el id", () => {
    const d = nuevo();
    partida(d, "p1", "2026-10-01T00:00:00Z", "a1");
    partida(d, "p2", "2026-10-01T00:00:00Z", "b2");
    expect(eliminarDatosDeAlumno(d, "../x")).toBe(0);
    expect(eliminarDatosDeAlumno(d, "a1")).toBe(1);
    expect(existsSync(join(d, "partidas", "p1.csv"))).toBe(false);
    expect(existsSync(join(d, "partidas", "p2.json"))).toBe(true);
  });
});
