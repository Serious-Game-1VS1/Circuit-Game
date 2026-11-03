import { afterEach, describe, expect, it, vi } from "vitest";
import { leerAlumnoDeUrl, resolverAlumno } from "../src/alumno";
import { aliasDeAlumno, aplicarAlumno, cargarPerfil, perfilNuevo } from "../src/perfil";
import { validAlias } from "../../spike/src/protocol";

afterEach(() => vi.unstubAllGlobals());

describe("leerAlumnoDeUrl", () => {
  it("lee y sanea el id", () => {
    expect(leerAlumnoDeUrl("?alumno=a1_B-2")).toBe("a1_B-2");
    expect(leerAlumnoDeUrl("?sala=X&alumno=zz")).toBe("zz");
    for (const s of ["", "?alumno=", "?alumno=../x", "?alumno=a b", `?alumno=${"a".repeat(41)}`, "?alumno=<script>"]) expect(leerAlumnoDeUrl(s)).toBeNull();
  });
});

describe("resolverAlumno", () => {
  it("devuelve el alumno y llama a /alumno/:id", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "a1", nombre: "Ana Pérez", alias: "Ana" })));
    vi.stubGlobal("fetch", f);
    expect(await resolverAlumno("a1", "http://d/")).toEqual({ id: "a1", nombre: "Ana Pérez", alias: "Ana" });
    expect((f.mock.calls as unknown[][])[0]![0]).toBe("http://d/alumno/a1");
  });
  it("null sin base, con id inválido, 404, JSON malo o red caída", async () => {
    expect(await resolverAlumno("a1", "")).toBeNull();
    expect(await resolverAlumno("../x", "http://d")).toBeNull();
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    expect(await resolverAlumno("a1", "http://d")).toBeNull();
    vi.stubGlobal("fetch", async () => new Response("{roto"));
    expect(await resolverAlumno("a1", "http://d")).toBeNull();
    vi.stubGlobal("fetch", async () => { throw new Error("red"); });
    expect(await resolverAlumno("a1", "http://d")).toBeNull();
  });
  it("timeout: aborta y devuelve null", async () => {
    vi.stubGlobal("fetch", (_u: string, o: { signal: AbortSignal }) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("abort")))));
    expect(await resolverAlumno("a1", "http://d", 20)).toBeNull();
  });
});

describe("aplicarAlumno", () => {
  it("usa el alias del alumno si cabe y guarda alumnoId", () => {
    const p = aplicarAlumno(perfilNuevo("x"), { id: "a1", nombre: "Ana Pérez", alias: "Ana" });
    expect(p.alias).toBe("Ana");
    expect(p.alumnoId).toBe("a1");
  });
  it("abrevia nombres largos a un alias válido", () => {
    expect(aliasDeAlumno({ nombre: "Ana Pérez" })).toBe("Ana Pérez");
    expect(aliasDeAlumno({ nombre: "Ana Patricia Rodríguez" })).toBe("Ana P.");
    for (const n of ["Maximiliano Alejandro Ruiz", "Maximilianoalejandrodelosángeles", "  ", "Ana María de la Cruz Pérez"]) expect(validAlias(aliasDeAlumno({ nombre: n }))).toBe(true);
    expect(aliasDeAlumno({ nombre: "Maximiliano Alejandro Ruiz" })).toBe("Maximilia A.");
  });
  it("perfil viejo sin alumnoId sigue cargando", () => {
    const mem = { getItem: () => JSON.stringify({ xp: 5 }), setItem: () => {} };
    expect(cargarPerfil("viejo", mem).alumnoId).toBeUndefined();
    expect(cargarPerfil("viejo", { ...mem, getItem: () => JSON.stringify({ alumnoId: "a1" }) }).alumnoId).toBe("a1");
  });
});
