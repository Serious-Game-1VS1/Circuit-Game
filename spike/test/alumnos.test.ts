import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buscarAlumno, idAlumnoValido } from "../src/docente/alumnos.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "alumnos-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("buscarAlumno", () => {
  it("devuelve solo id, nombre y alias (sin curso, correo ni notas)", () => {
    writeFileSync(join(dir, "alumnos.json"), JSON.stringify([{ id: "a1", nombre: "Ana Pérez", alias: "Ana", curso: "X", correo: "a@b.c", nota: 9 }]));
    expect(buscarAlumno(dir, "a1")).toEqual({ id: "a1", nombre: "Ana Pérez", alias: "Ana" });
  });
  it("sin alias usa el primer nombre, máx. 12", () => {
    writeFileSync(join(dir, "alumnos.json"), JSON.stringify([{ id: "b", nombre: "Maximiliano Carlos Ruiz" }]));
    expect(buscarAlumno(dir, "b")?.alias).toBe("Maximiliano");
  });
  it("404 (null): no existe, archivo ausente o dañado", () => {
    expect(buscarAlumno(dir, "x")).toBeNull();
    writeFileSync(join(dir, "alumnos.json"), "{roto");
    expect(buscarAlumno(dir, "x")).toBeNull();
    writeFileSync(join(dir, "alumnos.json"), JSON.stringify([{ id: "x", nombre: "Z" }]));
    expect(buscarAlumno(dir, "x")?.nombre).toBe("Z");
  });
  it("rechaza ids inválidos", () => {
    for (const id of ["../x", "a b", "", "a".repeat(41), 5, null]) expect(idAlumnoValido(id)).toBe(false);
    expect(idAlumnoValido("a".repeat(40))).toBe(true);
    expect(buscarAlumno(dir, "../alumnos")).toBeNull();
  });
});
