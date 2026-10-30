import { describe, expect, it } from "vitest";
import { inicial, type Pantalla } from "../src/pantalla";
import { firmaEnd, aplicarPartida, cargarPerfil, guardarPerfil, INSIGNIAS, marcarTutorial, tutorialCompletado, cambiarNivel, nivelBotElegido, nivelElegido, textoNivel, perfilNuevo, progresoRango, rangoDe, registrarOleada, registrarTiempo, registrarTotal, resultadoDe, UMBRALES_MEDALLA, type Resultado } from "../src/perfil";

const res = (o: Partial<Resultado> = {}): Resultado => ({ puntos: 0, pods: 0, total: 5, quemadas: 0, limpios: 0, gano: false, nivel: 1, ...o });
const ids = (r: ReturnType<typeof aplicarPartida>) => r.eventos.insignias.map((i) => i.id);

describe("aplicarPartida", () => {
  it("suma XP y estadísticas", () => {
    const { perfil, eventos } = aplicarPartida(perfilNuevo("ana"), res({ puntos: 220, pods: 2, limpios: 1, gano: true }));
    expect(perfil).toMatchObject({ xp: 220, partidas: 1, ganadas: 1, pods: 2, limpios: 1 });
    expect(eventos).toMatchObject({ xp: 220, rango: null });
  });
  it("avisa del rango nuevo solo al cruzarlo", () => {
    const a = aplicarPartida(perfilNuevo("ana"), res({ puntos: 300 }));
    expect(a.eventos.rango).toBe("Técnico");
    expect(aplicarPartida(a.perfil, res({ puntos: 10 })).eventos.rango).toBeNull();
  });
  it("partida sin pods: suma la partida, sin insignias de pods", () => {
    const a = aplicarPartida(perfilNuevo("ana"), res());
    expect(a.perfil.partidas).toBe(1);
    expect(ids(a)).toEqual([]);
  });
  it("las insignias salen una sola vez", () => {
    const a = aplicarPartida(perfilNuevo("ana"), res({ puntos: 100, pods: 1 }));
    expect(ids(a)).toEqual(["primer-pod", "sin-quemadas"]);
    expect(ids(aplicarPartida(a.perfil, res({ puntos: 100, pods: 1 })))).toEqual([]);
  });
  it("racha limpia, ganador y constante", () => {
    expect(ids(aplicarPartida(perfilNuevo("a"), res({ pods: 3, limpios: 3, quemadas: 1, gano: true })))).toEqual(["primer-pod", "racha-limpia", "ganador"]);
    let p = perfilNuevo("a");
    for (let i = 0; i < 4; i++) p = aplicarPartida(p, res()).perfil;
    expect(ids(aplicarPartida(p, res()))).toEqual(["constante"]);
  });
  it("despachar los pods del nivel 1 abre el nivel 2, con insignia y aviso una sola vez", () => {
    const a = aplicarPartida(perfilNuevo("a"), res({ pods: 5 }));
    expect(a.perfil.nivelDesbloqueado).toBe(2);
    expect(ids(a)).toContain("nivel-2");
    expect(a.eventos.nivel2).toBe(true);
    const b = aplicarPartida(a.perfil, res({ pods: 5 }));
    expect(ids(b)).not.toContain("nivel-2");
    expect(b.eventos.nivel2).toBe(false);
  });
  it("no abre el nivel 2: partida incompleta, Oleadas o partida de nivel 2", () => {
    for (const r of [res({ pods: 4 }), res({ pods: 9, total: Infinity }), res({ pods: 5, nivel: 2 })]) expect(aplicarPartida(perfilNuevo("a"), r).perfil.nivelDesbloqueado).toBe(1);
  });
  it("el desbloqueo se guarda y se carga", () => {
    guardarPerfil(aplicarPartida(perfilNuevo("desb"), res({ pods: 5 })).perfil, null);
    expect(cargarPerfil("desb", null).nivelDesbloqueado).toBe(2);
  });
  it("selector de nivel: el 2 con candado hasta desbloquearlo", () => {
    const p = perfilNuevo("a"), abierto = { ...p, nivelDesbloqueado: 2 as const };
    expect(textoNivel(p, 1)).toContain("Completa el nivel 1 para abrirlo");
    expect(cambiarNivel(p, 1)).toBe(1);
    expect(nivelElegido(p, 2)).toBe(1);
    expect(nivelBotElegido(p, "mixto")).toBe(1); // bloqueado hasta abrir el nivel 2
    expect(cambiarNivel(abierto, 1)).toBe(2);
    expect(cambiarNivel(abierto, 2)).toBe(1);
    expect(nivelElegido(abierto, 2)).toBe(2);
    expect([nivelBotElegido(abierto, "1"), nivelBotElegido(abierto, "2"), nivelBotElegido(abierto, "mixto")]).toEqual([1, 2, "mixto"]);
    expect(textoNivel(abierto, 2)).not.toContain("🔒");
    expect(textoNivel(p, 1)).toContain("bloqueado");
    expect(textoNivel(p, 1)).not.toContain("🔒");
  });
});

describe("rangos y catálogo", () => {
  it("rango y progreso al siguiente", () => {
    expect(rangoDe(299).nombre).toBe("Aprendiz");
    expect(progresoRango(100)).toEqual({ actual: "Aprendiz", siguiente: "Técnico", n: 100, m: 300 });
    expect(progresoRango(800)).toEqual({ actual: "Experto", siguiente: "Maestro", n: 0, m: 700 });
    expect(progresoRango(9999)).toEqual({ actual: "Maestro", siguiente: null, n: 0, m: 0 });
  });
  it("el catálogo no repite ids", () => {
    expect(new Set(INSIGNIAS.map((i) => i.id)).size).toBe(INSIGNIAS.length);
  });
});

describe("resultadoDe", () => {
  const end = { t: "end" as const, phase: "fin" as const, winner: "A" as const, reason: "tiempo", score: { A: { alias: "a", despachados: 2, quemadas: 1 } }, carrera: { A: { pod: 1, llamas: 1, podMs: [], repasar: [] } } };
  const taller: Pantalla = { ...inicial(), fase: "taller", station: "A", nivel: 1 };
  it("duelo: puntos, limpios y victoria; no repite al pasar de carrera a podio", () => {
    const carrera: Pantalla = { ...taller, fase: "carrera", end };
    expect(resultadoDe(taller, carrera)).toMatchObject({ puntos: 210, pods: 2, quemadas: 1, limpios: 1, gano: true });
    expect(resultadoDe(carrera, { ...carrera, fase: "podio" })).toBeNull();
  });
  it("práctica: limpios 0 y sin ganar", () => {
    const r = resultadoDe({ ...taller, practica: true }, { ...inicial(), end: { ...end, carrera: undefined, winner: null } });
    expect(r).toMatchObject({ puntos: 190, limpios: 0, gano: false });
  });
  it("práctica con winner A del árbitro: no suma ganadas ni da «Ganador»", () => {
    const r = resultadoDe({ ...taller, practica: true }, { ...inicial(), end: { ...end, carrera: undefined, winner: "A" } })!;
    expect(r.gano).toBe(false);
    const a = aplicarPartida(perfilNuevo("a"), r);
    expect(a.perfil.ganadas).toBe(0);
    expect(ids(a)).not.toContain("ganador");
  });
  it("End reenviado tras recargar: la misma firma se reconoce y se guarda", () => {
    const f = firmaEnd(end, "ABC123");
    expect(f).toBe(firmaEnd({ ...end }, "ABC123"));
    expect(f).not.toBe(firmaEnd(end, "XYZ789"));
    const a = aplicarPartida(perfilNuevo("a"), res({ puntos: 50 }), f);
    expect(a.perfil.ultimoEnd).toBe(f);
    guardarPerfil(a.perfil, null);
    expect(cargarPerfil("a", null).ultimoEnd).toBe(f); // quien llama (main.ts) no aplica si coincide
  });
  it("partida anulada no cuenta", () => {
    expect(resultadoDe(taller, { ...taller, fase: "fin", end: { ...end, phase: "anulada" } })).toBeNull();
  });
});

describe("almacenamiento", () => {
  const roto = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
  it("si falla no lanza y el perfil se queda en memoria", () => {
    const p = { ...perfilNuevo("Zoe"), xp: 50 };
    expect(() => guardarPerfil(p, roto)).not.toThrow();
    expect(cargarPerfil("zoe", roto).xp).toBe(50); // clave por alias en minúsculas
    expect(() => cargarPerfil("x", null)).not.toThrow();
  });
  it("si el disco falla (cuota), lo último guardado en memoria gana al disco viejo", () => {
    const viejo = { getItem: () => JSON.stringify({ xp: 10 }), setItem: () => { throw new Error("cuota"); } };
    guardarPerfil({ ...perfilNuevo("Lu"), xp: 90 }, viejo);
    expect(cargarPerfil("lu", viejo).xp).toBe(90);
  });
  it("datos corruptos dan un perfil nuevo", () => {
    expect(cargarPerfil("mal", { getItem: () => "{no json", setItem: () => {} })).toEqual(perfilNuevo("mal"));
  });
});

describe("récord personal por pod", () => {
  it("la primera vez solo registra la marca, sin medalla", () => {
    const r = registrarTiempo(perfilNuevo("a"), 1, 2, 40_000);
    expect(r.medalla).toBeNull();
    expect(r.perfil.records).toEqual({ "1-2": 40_000 });
  });
  it("oro al igualar o mejorar la marca (y la actualiza), plata y bronce según los umbrales, nada si se pasa", () => {
    const base = registrarTiempo(perfilNuevo("a"), 1, 2, 40_000).perfil;
    const mejor = registrarTiempo(base, 1, 2, 30_000);
    expect(mejor.medalla).toBe("oro");
    expect(mejor.perfil.records["1-2"]).toBe(30_000);
    expect(registrarTiempo(base, 1, 2, 40_000).medalla).toBe("oro");
    expect(registrarTiempo(base, 1, 2, 40_000 * UMBRALES_MEDALLA.plata).medalla).toBe("plata");
    expect(registrarTiempo(base, 1, 2, 40_000 * UMBRALES_MEDALLA.bronce).medalla).toBe("bronce");
    const peor = registrarTiempo(base, 1, 2, 80_000);
    expect(peor.medalla).toBeNull();
    expect(peor.perfil.records["1-2"]).toBe(40_000); // la marca no empeora
  });
  it("cada nivel y número de pod tiene su marca; se guarda y se lee del almacén; datos raros se ignoran", () => {
    const p = registrarTiempo(registrarTiempo(perfilNuevo("rec"), 1, 1, 10_000).perfil, 2, 1, 20_000).perfil;
    expect(p.records).toEqual({ "1-1": 10_000, "2-1": 20_000 });
    guardarPerfil(p, null);
    expect(cargarPerfil("rec", null).records).toEqual(p.records);
    expect(cargarPerfil("x", { getItem: () => JSON.stringify({ records: { "1-1": -3, "1-2": "a", "1-3": 5 } }), setItem: () => {} }).records).toEqual({ "1-3": 5 });
  });
});

describe("récord de Oleadas", () => {
  it("guarda los pods por nivel solo si superan la marca", () => {
    const a = registrarOleada(perfilNuevo("ana"), 1, 7);
    expect(a).toMatchObject({ record: 7, nuevo: true });
    const b = registrarOleada(a.perfil, 1, 5);
    expect(b).toMatchObject({ record: 7, nuevo: false });
    expect(b.perfil.oleadas).toEqual({ "1": 7 });
    expect(registrarOleada(b.perfil, 2, 3).perfil.oleadas).toEqual({ "1": 7, "2": 3 });
  });

  it("se guarda y se recarga; valores raros se descartan", () => {
    const almacen = new Map<string, string>();
    const disco = { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => void almacen.set(k, v) };
    guardarPerfil(registrarOleada(perfilNuevo("lola"), 1, 9).perfil, disco);
    expect(cargarPerfil("lola", disco).oleadas).toEqual({ "1": 9 });
    almacen.clear();
    almacen.set("circuitsync.perfil.mia", JSON.stringify({ oleadas: { "1": -3, "2": "x", "3": 4 } }));
    expect(cargarPerfil("mia", disco).oleadas).toEqual({ "3": 4 });
  });

  it("guarda el mejor tiempo total por nivel y dice la marca anterior", () => {
    const a = registrarTotal(perfilNuevo("ana"), 1, 200_000);
    expect(a.previo).toBeUndefined();
    expect(a.perfil.totales).toEqual({ "1": 200_000 });
    const b = registrarTotal(a.perfil, 1, 250_000);
    expect(b.previo).toBe(200_000);
    expect(b.perfil.totales).toEqual({ "1": 200_000 });
    const c = registrarTotal(b.perfil, 1, 150_000);
    expect(c.perfil.totales).toEqual({ "1": 150_000 });
    expect(registrarTotal(c.perfil, 2, 90_000).perfil.totales).toEqual({ "1": 150_000, "2": 90_000 });
  });
  it("carga los totales descartando valores raros", () => {
    const almacen = new Map<string, string>();
    const disco = { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => void almacen.set(k, v) };
    almacen.set("circuitsync.perfil.tot", JSON.stringify({ totales: { "1": 120_000, "2": -5, "3": "x" } }));
    expect(cargarPerfil("tot", disco).totales).toEqual({ "1": 120_000 });
  });
});


describe("mini-tutoriales completados", () => {
  it("perfil nuevo sin tutoriales; perfil viejo sin el campo carga con []", () => {
    expect(perfilNuevo("ana").tutoriales).toEqual([]);
    const viejo = cargarPerfil("viejo", { getItem: () => JSON.stringify({ xp: 40, insignias: ["primer-pod"] }), setItem: () => {} });
    expect(viejo.tutoriales).toEqual([]);
    expect(tutorialCompletado(viejo, "t1")).toBe(false);
  });
  it("marcar dos veces no duplica y no altera el perfil original", () => {
    const p = perfilNuevo("ana");
    const a = marcarTutorial(p, "t1");
    const b = marcarTutorial(a, "t1");
    expect(b.tutoriales).toEqual(["t1"]);
    expect(p.tutoriales).toEqual([]);
    expect(a.tutoriales).toEqual(["t1"]);
    expect(marcarTutorial(a, "t2").tutoriales).toEqual(["t1", "t2"]);
    expect(tutorialCompletado(b, "t1")).toBe(true);
    expect(tutorialCompletado(b, "t2")).toBe(false);
  });
  it("id inválido (vacío, solo espacios o no string) no se marca", () => {
    const p = perfilNuevo("ana");
    expect(marcarTutorial(p, "").tutoriales).toEqual([]);
    expect(marcarTutorial(p, "   ").tutoriales).toEqual([]);
    expect(marcarTutorial(p, 7 as unknown as string).tutoriales).toEqual([]);
  });
  it("al cargar descarta valores no string, vacíos y duplicados; se guarda y se lee", () => {
    const almacen = new Map<string, string>();
    const disco = { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => void almacen.set(k, v) };
    almacen.set("circuitsync.perfil.sucio", JSON.stringify({ tutoriales: ["a", 3, "a", null, "", "b"] }));
    expect(cargarPerfil("sucio", disco).tutoriales).toEqual(["a", "b"]);
    guardarPerfil(marcarTutorial(perfilNuevo("gio"), "t1"), disco);
    expect(cargarPerfil("gio", disco).tutoriales).toEqual(["t1"]);
  });
});

describe("bienvenida del menú", () => {
  it("primer uso, con partidas y con nivel 2", async () => {
    const { bienvenida, perfilNuevo } = await import("../src/perfil");
    expect(bienvenida(perfilNuevo("ana"))).toBe("Bienvenido al taller. Tu primer pod te espera.");
    const p = { ...perfilNuevo("ana"), partidas: 2, xp: 180 };
    expect(bienvenida(p)).toBe("Hola, ana. Rango Aprendiz. Te faltan 120 XP para Técnico.");
    expect(bienvenida({ ...p, nivelDesbloqueado: 2 })).toContain("Nivel 2 abierto.");
  });
});
