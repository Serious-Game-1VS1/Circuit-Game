/** Alumno desde la base del docente (opcional): `?alumno=<id>` en el enlace/QR → GET {VITE_DOCENTE_URL}/alumno/:id. Si algo falla, null y se usa el alias local. */
export interface AlumnoInfo { id: string; nombre: string; alias: string }

const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Id de alumno del query string (`?alumno=...`) o null si falta o no es válido. */
export function leerAlumnoDeUrl(search: string): string | null {
  try { const v = new URLSearchParams(search).get("alumno")?.trim(); return v && ID.test(v) ? v : null; } catch { return null; }
}

/** Pide el alumno al servidor del docente (timeout 3 s). Nunca lanza: cualquier fallo devuelve null. */
export async function resolverAlumno(id: string, base: string | undefined = (import.meta as { env?: { VITE_DOCENTE_URL?: string } }).env?.VITE_DOCENTE_URL, ms = 3000): Promise<AlumnoInfo | null> {
  if (!base || !ID.test(id)) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`${base.replace(/\/+$/, "")}/alumno/${encodeURIComponent(id)}`, { signal: ctl.signal });
    if (!r.ok) return null;
    const o = (await r.json()) as Partial<AlumnoInfo>;
    return typeof o.nombre === "string" && typeof o.alias === "string" && o.id === id ? { id, nombre: o.nombre, alias: o.alias } : null;
  } catch { return null; } finally { clearTimeout(t); }
}
