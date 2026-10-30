import { join } from "node:path";
import { dirDatos, leerJson } from "./almacen.js";
import type { Alumno, AlumnoPublico } from "./types.js";

/** Id opaco válido: alfanumérico (con - y _), 1 a 40 caracteres. Evita `../` y rutas. */
export const idAlumnoValido = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(id);

/**
 * Busca un alumno en `<dir>/alumnos.json` y devuelve solo lo público ({id, nombre, alias}); null si el id es
 * inválido, el archivo falta/está dañado o no existe. `alias` cae al primer nombre recortado a 12 si el docente no lo puso.
 * shortcut: lee el archivo en cada llamada (clases pequeñas); cachear si hay cientos de alumnos y mucho tráfico.
 */
export function buscarAlumno(dir: string = dirDatos(), id: unknown): AlumnoPublico | null {
  if (!idAlumnoValido(id)) return null;
  const lista = leerJson<unknown>(join(dir, "alumnos.json"), []);
  const a = Array.isArray(lista) ? (lista as Alumno[]).find((x) => x && x.id === id && typeof x.nombre === "string" && x.nombre.trim()) : undefined;
  if (!a) return null;
  const nombre = a.nombre.trim();
  return { id: a.id, nombre, alias: (typeof a.alias === "string" && a.alias.trim() ? a.alias.trim() : nombre.split(/\s+/)[0]!).slice(0, 12) };
}
