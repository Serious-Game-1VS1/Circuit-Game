import { beforeEach, describe, expect, it, vi } from "vitest";
import { Arbiter } from "../../spike/src/arbiter/arbiter";
import type { Transport } from "../../spike/src/transport/transport";
import { PracticaTransport } from "../src/practica";
import { crearTransporte, elegirTransporte, Net, salasAbiertas, textoSala } from "../src/net";
import { evaluar } from "../../spike/src/engine/pods";
import { despachable, reloj } from "../src/pantalla";
import { DIAGNOSTICO } from "../src/progreso";
import { conPlaca } from "../src/placa";
import { botonesGaveta, pestanas, reparadas, vistaDeVeredicto } from "../src/vista";

/** Cliente contra el árbitro real en memoria (sin red), con reloj falso. */
const CODE = "ABC234";
let t: number;
let arb: Arbiter;
const peers = new Map<string, Transport>();
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)); // como si cruzara la red

class Mem implements Transport {
  onMessage: Transport["onMessage"] = () => {};
  constructor(private readonly peer: string) { peers.set(peer, this); }
  async create() {}
  async join(code: string) { if (code !== CODE) throw new Error("la sala no existe"); }
  send(data: unknown) { arb.handle(this.peer, copia(data)); }
  async close() { arb.leave(this.peer); }
}

let ana: Net, beto: Net;
beforeEach(async () => {
  t = 0;
  peers.clear();
  arb = new Arbiter((peer, m) => peers.get(peer)?.onMessage(copia(m), "0"), { now: () => t, semilla: 1 });
  ana = new Net(new Mem("p1"), () => t);
  beto = new Net(new Mem("p2"), () => t);
});

const empezar = async () => {
  await ana.entrar(" abc234 ", "ana");
  await beto.entrar(CODE, "beto");
  ana.listo();
  beto.listo();
  t += 3000;
  arb.tick();
};

/** Solo en pruebas: la zona con su solución, leída del árbitro. */
const zonaReal = (n: Net, i: number) => arb.pods[n.estado.despachados]!.zonas[i]!;
/** Repara todas las zonas del pod actual con la solución y pulsa "Despachar". */
const reparar = (n: Net) => {
  for (const z of arb.pods[n.estado.despachados]!.zonas) n.probar(z.zona, z.solucion);
  n.despachar();
};

describe("cliente conectado al árbitro", () => {
  it("valida la entrada y avisa si la sala no existe (SCRUM-21)", async () => {
    await ana.entrar("abc", "ana");
    expect(ana.estado).toMatchObject({ fase: "entrar", aviso: "El código tiene 6 letras o números" });
    await ana.entrar("ZZZZZZ", "ana");
    expect(ana.estado.aviso).toBe("No hay una sala abierta con ese código");
    await ana.entrar("abc234", "ana");
    expect(ana.estado).toMatchObject({ fase: "sala", aviso: null, station: "A", alias: "ana" });
  });

  it("Entrar → Sala → Listo → 3-2-1 → Taller (SCRUM-22)", async () => {
    const fases: string[] = [];
    ana.onCambio = (p) => { if (fases.at(-1) !== p.fase) fases.push(p.fase); };
    await ana.entrar(CODE, "ana");
    await beto.entrar(CODE, "beto");
    expect(ana.estado.jugadores.map((j) => j.alias)).toEqual(["ana", "beto"]);
    ana.listo();
    beto.listo();
    expect(ana.estado).toMatchObject({ fase: "cuenta", cuenta: 3 });
    t += 3000;
    arb.tick();
    expect(fases).toEqual(["sala", "cuenta", "taller"]);
    expect(reloj(ana.estado, t)).toBe("12:00");
    expect(ana.estado.rival).toEqual({ alias: "beto", despachados: 0, estado: "reparando" });
  });

  it("'medir' devuelve el seq con el que llega su Medida (el Taller espera esa lectura)", async () => {
    await empezar();
    const z = zonaReal(ana, 0);
    const seq = ana.medir(z.zona, z.solucion, "continuidad", "carga1");
    expect(ana.estado.medida).toMatchObject({ t: "medida", seq, modo: "continuidad" });
    expect(ana.medir(z.zona, z.solucion, "tension", "carga1")).toBe(seq + 1);
  });

  it("'Probar' manda `pieza` y muestra el veredicto del árbitro; el rival lo ve penalizado (SCRUM-90, SCRUM-23, SCRUM-129)", async () => {
    await empezar();
    const z = zonaReal(ana, 0);
    const mala = z.opciones.find((o) => evaluar(z, o) === "poco")!;
    const enviado: unknown[] = [];
    const mem = peers.get("p1")!;
    const send = mem.send.bind(mem);
    mem.send = (d) => { enviado.push(d); send(d); };
    ana.probar(z.zona, mala);
    expect(enviado[0]).toMatchObject({ t: "test", zone: z.zona, pieza: mala });
    expect(enviado[0]).not.toHaveProperty("ohms");
    expect(ana.estado.vistas[z.zona]).toMatchObject({ aguja: "poco" });
    expect(ana.estado.aviso).toBe(`${vistaDeVeredicto("poco", z.circuito).mensaje} · espera 2 s`);
    expect(beto.estado.rival).toMatchObject({ alias: "ana", estado: "penalizado" });
    ana.probar(z.zona, z.solucion);
    expect(ana.estado.aviso).toBe("Espera 2 s y vuelve a probar");
    t += 2000;
    ana.probar(z.zona, mala);
    expect(ana.estado.aviso).toBe("No cambiaste nada. Cambia una pieza o un cable y prueba.");
    ana.probar(z.zona, z.solucion);
    // El pod reparado espera "Despachar": todavía no cuenta ni para mí ni para el rival.
    expect(ana.estado).toMatchObject({ despachados: 0, aviso: "¡Pod reparado! Pulsa Despachar" });
    expect(ana.estado.pod?.zonas.every((x) => x.reparada)).toBe(true);
    expect(despachable(ana.estado)).toBe(true);
    t += 4000;
    arb.tick();
    expect(beto.estado.rival).toEqual({ alias: "ana", despachados: 0, estado: "reparando" });
    ana.despachar();
    expect(enviado.at(-1)).toMatchObject({ t: "despachar" });
    expect(ana.estado).toMatchObject({ despachados: 1, despachando: false, aviso: "¡Pod despachado!", vistas: {} });
    expect(ana.estado.pod?.numero).toBe(2);
    expect(beto.estado.rival).toEqual({ alias: "ana", despachados: 1, estado: "reparando" });
  });

  it("'Despachar' solo se activa con todo reparado; el rechazo del árbitro se muestra y no cuenta", async () => {
    await empezar();
    const enviado: unknown[] = [];
    const mem = peers.get("p1")!;
    const send = mem.send.bind(mem);
    mem.send = (d) => { enviado.push(d); send(d); };
    expect(despachable(ana.estado)).toBe(false);
    ana.despachar();
    expect(enviado).toEqual([]); // el botón inactivo no manda nada
    mem.send({ t: "despachar", seq: 99, t0: 0 }); // p. ej. un cliente desfasado: decide el árbitro
    expect(ana.estado).toMatchObject({ despachados: 0, despachando: false, aviso: "Faltan zonas por reparar" });
    expect(beto.estado.rival?.despachados).toBe(0);
  });

  it("cambiar de pestaña de zona limpia el aviso", async () => {
    await empezar();
    const z = zonaReal(ana, 0);
    ana.probar(z.zona, z.solucion);
    expect(ana.estado.aviso).not.toBeNull();
    ana.limpiarAviso();
    expect(ana.estado.aviso).toBeNull();
  });

  it("al despachar 5 pods: ganaste / perdiste", async () => {
    await empezar();
    for (let i = 0; i < 5; i++) reparar(ana);
    expect(ana.estado.fase).toBe("carrera");
    expect(ana.estado.fin?.titulo).toBe("¡Ganaste!");
    expect(beto.estado.fin?.titulo).toBe("Perdiste");
    expect(beto.estado.fin?.detalle).toContain("ana: 5 pods, 0 quemadas");
    ana.verPodio();
    expect(ana.estado.fase).toBe("podio");
    expect(beto.estado.fase).toBe("carrera");
  });

  it("tras el fin, quien recarga (mismo alias, < 30 s) recupera el resultado; el podio no reinicia la carrera", async () => {
    await empezar();
    for (let i = 0; i < 5; i++) reparar(ana);
    const end = ana.estado.end;
    const antes = ana.estado;
    await ana.reconectar(); // terminada: no reintenta ni toca el estado
    expect(ana.estado).toBe(antes);
    arb.leave("p1");
    t += 20_000;
    const vuelta = new Net(new Mem("p3"), () => t);
    await vuelta.entrar(CODE, "ana");
    expect(vuelta.estado).toMatchObject({ fase: "carrera", station: "A", fin: { titulo: "¡Ganaste!" } });
    expect(vuelta.estado.end).toEqual(end);
    vuelta.verPodio();
    await vuelta.reconectar();
    expect(vuelta.estado.fase).toBe("podio");
  });

  it("nivel 2: pods de 1 a 4 zonas con todos los circuitos; pestañas, gaveta e indicador por zona", async () => {
    arb = new Arbiter((peer, m) => peers.get(peer)?.onMessage(copia(m), "0"), { now: () => t, semilla: 7, nivel: 2 });
    await empezar();
    expect(ana.estado.nivel).toBe(2);
    const vistos = new Set<string>();
    for (let i = 0; i < 5 && ana.estado.fase === "taller"; i++) {
      const pod = ana.estado.pod!;
      expect(pestanas(pod, pod.zonas[0]!.zona)).toHaveLength(pod.zonas.length);
      expect(reparadas(pod)).toBe(`Zonas reparadas: 0/${pod.zonas.length}`);
      for (const z of pod.zonas) {
        vistos.add(z.circuito);
        expect(botonesGaveta(z, undefined).map((b) => b.pieza)).toEqual(z.opciones);
      }
      reparar(ana);
    }
    expect([...vistos].sort()).toEqual(expect.arrayContaining(["fusible", "invertido", "abierto", "led", "luces"]));
    expect(ana.estado.fin?.titulo).toBe("¡Ganaste!");
  });

  it("demo de cableado: el cliente lo sabe por el start y cada pod trae solo Cabina y/o Turbina con su placa", async () => {
    arb = new Arbiter((peer, m) => peers.get(peer)?.onMessage(copia(m), "0"), { now: () => t, semilla: 7, demo: "cableado" });
    await empezar();
    expect(ana.estado.demo).toBe(true);
    for (let i = 0; i < 5 && ana.estado.fase === "taller"; i++) {
      expect(ana.estado.pod!.zonas.every((z) => conPlaca(z.circuito) && (z.nombre === "cabina" || z.nombre === "turbina"))).toBe(true);
      reparar(ana);
    }
    expect(ana.estado.fin?.titulo).toBe("¡Ganaste!");
  });

  it("demo radar (--demo radar): el cliente lo sabe por el start y los 5 pods son solo Radar con las 4 resistencias", async () => {
    arb = new Arbiter((peer, m) => peers.get(peer)?.onMessage(copia(m), "0"), { now: () => t, semilla: 7, demo: "radar" });
    await empezar();
    expect(ana.estado.demo).toBe(true);
    for (let i = 0; i < 5 && ana.estado.fase === "taller"; i++) {
      expect(ana.estado.pod!.zonas.map((z) => [z.nombre, z.opciones.length])).toEqual([["radar", 4]]);
      reparar(ana);
    }
    expect(ana.estado.fin?.titulo).toBe("¡Ganaste!");
  });

  it("el cliente nunca recibe ni muestra la solución", async () => {
    for (const nivel of [1, 2] as const) for (const semilla of [1, 2, 3]) {
      arb = new Arbiter((peer, m) => peers.get(peer)?.onMessage(copia(m), "0"), { now: () => t, semilla, nivel });
      ana = new Net(new Mem("p1"), () => t);
      beto = new Net(new Mem("p2"), () => t);
      await empezar();
      for (let i = 0; i < 5 && ana.estado.fase === "taller"; i++) {
        expect(JSON.stringify(ana.estado)).not.toMatch(/solucion/);
        for (const z of ana.estado.pod!.zonas) {
          // Lo que se pinta solo depende de la ZonaView: ningún botón se distingue sin elegirlo.
          expect(botonesGaveta(z, undefined).every((b) => !b.elegida && Object.keys(b).join() === "pieza,texto,elegida")).toBe(true);
        }
        reparar(ana);
      }
    }
  });

  it("reconexión: volver con el mismo código y alias recupera el taller (SCRUM-89)", async () => {
    await empezar();
    reparar(ana);
    arb.leave("p1");
    expect(beto.estado.rival?.estado).toBe("sin-conexion");
    t += 10_000;
    const vuelta = new Net(new Mem("p3"), () => t);
    await vuelta.entrar(CODE, "ana");
    expect(vuelta.estado).toMatchObject({ fase: "taller", station: "A", despachados: 1 });
    expect(reloj(vuelta.estado, t)).toBe("11:50");
  });

  it("reconexión automática: al caerse el transporte reentra con el mismo código y alias", async () => {
    await empezar();
    reparar(ana);
    arb.leave("p1"); // el árbitro ve salir al jugador
    await ana.reconectar(); // lo que dispara Transport.onClose
    expect(beto.estado.rival?.estado).toBe("reparando");
    expect(ana.estado).toMatchObject({ fase: "taller", station: "A", aviso: null });
    expect(ana.estado).toMatchObject({ despachados: 1, despachando: false });
  });

  it("entrar distingue sala inexistente, App ID inválido y fallo de conexión", async () => {
    const falla = async (msg: string) => {
      const m = new Mem("pe");
      m.join = async () => { throw new Error(msg); };
      const n = new Net(m, () => t);
      await n.entrar(CODE, "eva");
      return n.estado.aviso;
    };
    expect(await falla("Photon op 226 error 32758: Game does not exist")).toBe("No hay una sala abierta con ese código");
    expect(await falla("Photon op 226 error 32765: Game full")).toBe("No hay una sala abierta con ese código");
    expect(await falla("Photon op 230 error 32767: Invalid AppId")).toMatch(/configurado.*docente/);
    expect(await falla("desconectado de Photon")).toBe("No se pudo conectar con el servidor de juego. Revisa tu conexión.");
    expect(await falla("conexión cerrada")).toMatch(/No se pudo conectar/);
  });

  it("SCRUM-43: al perder el transporte avisa, reintenta cada 2 s (15 veces) y al reconectar quita el aviso", async () => {
    vi.useFakeTimers();
    try {
      const m = new Mem("pr");
      const n = new Net(m, () => t); // pausa real de 2 s, con timers falsos
      await n.entrar(CODE, "eva");
      let fallos = 0;
      m.join = async () => { if (fallos++ < 3) throw new Error("sin red"); };
      const p = n.reconectar();
      expect(n.estado.aviso).toBe("Conexión perdida: reconectando…");
      await vi.advanceTimersByTimeAsync(2000 * 3);
      await p;
      expect(fallos).toBe(4);
      expect(n.estado.aviso).toBeNull();
      // Nunca vuelve: 15 intentos separados por 2 s y se rinde.
      let intentos = 0;
      m.join = async () => { intentos++; throw new Error("sin red"); };
      const q = n.reconectar();
      await vi.advanceTimersByTimeAsync(2000 * 14);
      await q;
      expect(intentos).toBe(15);
      expect(n.estado.aviso).toBe("No se pudo reconectar a la sala");
    } finally { vi.useRealTimers(); }
  });

  it("sin red durante toda la ventana: vuelve a Entrar con aviso; 'Volver a jugar' conserva el alias", async () => {
    const m = new Mem("p9");
    const caido = new Net(m, () => t, 0);
    await caido.entrar(CODE, "eva");
    m.join = async () => { throw new Error("sin red"); };
    await caido.reconectar();
    expect(caido.estado).toMatchObject({ fase: "entrar", alias: "eva", aviso: "No se pudo reconectar a la sala" });
    await empezar();
    for (let i = 0; i < 5; i++) reparar(ana);
    await ana.salir();
    expect(ana.estado).toMatchObject({ fase: "entrar", alias: "ana", aviso: null });
  });

  it("práctica: entra sola al Taller sin rival ni sala y al despachar los 5 pods vuelve a Entrar", async () => {
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const solo = new Net(new Mem("p5"), () => t);
    await solo.practicar("  ", 2);
    expect(solo.estado.aviso).toMatch(/alias/);
    const fases: string[] = [];
    solo.onCambio = (p) => { if (fases.at(-1) !== p.fase) fases.push(p.fase); };
    await solo.practicar("pepa", 2);
    await flush();
    expect(fases).not.toContain("sala");
    expect(solo.estado).toMatchObject({ fase: "taller", practica: true, nivel: 2, rival: null, alias: "pepa" });
    const practica = (solo as unknown as { transport: PracticaTransport }).transport;
    for (let i = 0; i < 5; i++) {
      for (const z of practica.arbiter.pods[i]!.zonas) solo.probar(z.zona, z.solucion);
      await flush();
      solo.despachar();
      await flush();
    }
    expect(solo.estado).toMatchObject({ fase: "entrar", alias: "pepa", practica: false, aviso: "Práctica terminada: ¡buen trabajo!" });
    expect((solo as unknown as { transport: unknown }).transport).not.toBe(practica);
  });

  it("jugar solo: duelo contra el bot (rival, start, 5 pods, no es práctica)", async () => {
    vi.useFakeTimers();
    try {
      const solo = new Net(new Mem("p6"));
      await solo.jugarSolo("  ");
      expect(solo.estado.aviso).toMatch(/alias/);
      await solo.jugarSolo("pepa", 1, "facil");
      await vi.advanceTimersByTimeAsync(5000);
      expect(solo.estado).toMatchObject({ fase: "taller", practica: false, alias: "pepa" });
      expect(solo.estado.rival).toBeTruthy();
      expect(solo.estado.total).toBe(5);
      await solo.salir();
    } finally { vi.useRealTimers(); }
  });

  it("salas abiertas: solo «esperando», las más llenas primero; texto de la tarjeta", () => {
    const s = (codigo: string, jugadores: number, estado: "esperando" | "llena" | "jugando") => ({ codigo, nivel: 1 as const, jugadores, max: 2 as const, estado });
    const r = salasAbiertas([s("ZZZ222", 0, "esperando"), s("AAA111", 2, "llena"), s("BBB333", 1, "esperando"), s("CCC444", 1, "jugando"), s("AAA999", 0, "esperando")]);
    expect(r.map((x) => x.codigo)).toEqual(["BBB333", "AAA999", "ZZZ222"]);
    expect(textoSala(r[0]!)).toBe("BBB333  NIVEL 1  1/2");
  });

  it("Tutorial por mecánica: práctica de un solo pod con su id", async () => {
    const solo = new Net(new Mem("p7"), () => t);
    await solo.practicar("lola", 1, true, false, "resistencia");
    await new Promise((r) => setTimeout(r, 0));
    expect(solo.tutorial).toBe(true);
    expect(solo.idTutorial).toBe("resistencia");
    expect(solo.estado.total).toBe(1);
    await solo.salir();
    expect(solo.idTutorial).toBeNull();
  });

  it("Tutorial de un pod: al despachar se queda en el Taller (sin «Práctica terminada») y sigue siendo tutorial", async () => {
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const solo = new Net(new Mem("p8"), () => t);
    await solo.practicar("lola", 1, true, false, "resistencia");
    await flush();
    const arb = (solo as unknown as { transport: PracticaTransport }).transport.arbiter;
    for (const z of arb.pods[0]!.zonas) solo.probar(z.zona, z.solucion);
    await flush();
    solo.despachar();
    await flush();
    expect(solo.estado).toMatchObject({ fase: "taller", practica: true, despachados: 1, end: undefined });
    expect(solo.idTutorial).toBe("resistencia");
    await solo.salir();
    expect(solo.estado.fase).toBe("entrar");
  });

  it("Oleadas: pasa de 5 pods sin terminar, y el Escudo se gasta cuando el árbitro lo usa", async () => {
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const solo = new Net(new Mem("p6"), () => t);
    await solo.practicar("lola", 1, false, true);
    await flush();
    expect(solo.estado).toMatchObject({ fase: "taller", oleadas: true, total: 0, quemadas: 0 });
    const practica = (solo as unknown as { transport: PracticaTransport }).transport;
    for (let i = 0; i < 6; i++) {
      for (const z of practica.arbiter.pods[i]!.zonas) solo.probar(z.zona, z.solucion);
      await flush();
      solo.despachar();
      await flush();
    }
    expect(solo.estado).toMatchObject({ fase: "taller", despachados: 6, pod: { numero: 7 } });
    solo.elegirMejora("escudo");
    solo.elegirMejora("enfriamiento");
    expect(solo.mejoras).toMatchObject({ escudo: true, enfriamiento: true, doble: false });
    expect(solo.usadas).toEqual(["escudo", "enfriamiento"]);
    solo.onMessage({ t: "result", seq: 1, t0: 0, zona: 0, veredicto: "se quema", waitMs: 2000, despachados: 6, pod: solo.estado.pod, escudo: true });
    expect(solo.mejoras.escudo).toBe(false);
    expect(solo.mejoras.enfriamiento).toBe(true);
    expect(solo.estado.quemadas).toBe(0);
    await solo.practicar("lola", 1); // una práctica nueva empieza sin mejoras
    expect(solo.mejoras).toMatchObject({ enfriamiento: false, escudo: false });
    expect(solo.usadas).toEqual([]);
  });

  it("elige el transporte por configuración", () => {
    expect(elegirTransporte({})).toBe("local");
    expect(elegirTransporte({ VITE_PHOTON_APP_ID: "x" })).toBe("photon");
    expect(elegirTransporte({ VITE_PHOTON_APP_ID: "x", VITE_TRANSPORT: "local" })).toBe("local");
    expect(() => crearTransporte({ VITE_TRANSPORT: "photon" }, { hostname: "", search: "" })).toThrow(/VITE_PHOTON_APP_ID/);
  });
});

describe("falla encadenada: bono Diagnóstico", () => {
  it("solo si midió después de salir la segunda y la acierta a la primera", () => {
    const solo = new Net(new Mem("p8"), () => t);
    const pod = { numero: 7, zonas: [{ zona: 0, nombre: "radar" as const, circuito: "led" as const, volts: 9, opciones: ["100", "470"], reparada: false }] };
    const res = (veredicto: "correcto" | "poco", hayMas?: true) => solo.onMessage({ t: "result", seq: 1, t0: 0, zona: 0, veredicto, waitMs: 0, despachados: 6, pod, ...(hayMas && { hayMas }) });
    const medir = () => solo.medir(0, "470", "tension", "pieza");

    medir(); res("correcto", true); res("correcto"); // midió antes de salir la segunda: no cuenta
    expect(solo.hayMas).toBe(1);
    expect(solo.diagnosticos).toBe(0);
    res("correcto", true); medir(); res("correcto"); // midió y acertó a la primera
    expect(solo.diagnosticos).toBe(1);
    expect(solo.extra).toBe(DIAGNOSTICO);
    res("correcto", true); medir(); res("poco"); res("correcto"); // falló antes de acertar
    res("correcto", true); res("correcto"); // no midió
    expect(solo.diagnosticos).toBe(1);
    expect(solo.segunda).toBeUndefined();
  });
});

describe("listarSalas", () => {
  const sala = { codigo: CODE, nivel: 1, jugadores: 1, max: 2, estado: "esperando" } as const;
  const conLista = (listar?: () => Promise<typeof sala[]>) => new Net({ ...new Mem("x"), listar } as unknown as Transport, () => 0);

  it("devuelve las salas del transporte", async () => {
    expect(await conLista(async () => [sala]).listarSalas()).toEqual({ salas: [sala] });
  });
  it("sin conexión, sin soporte o con timeout: lista vacía y motivo", async () => {
    for (const net of [conLista(async () => { throw new Error("caído"); }), conLista(), conLista(() => new Promise(() => {}))]) {
      const r = await net.listarSalas(20);
      expect(r.salas).toEqual([]);
      expect(r.motivo).toMatch(/consultar/);
    }
  });
  it("no abre una segunda consulta mientras hay una en curso, y dejarDeListar suelta el lobby", async () => {
    let abiertas = 0, soltadas = 0, fin!: () => void;
    const tr = { ...new Mem("x"), listar: () => { abiertas++; return new Promise<typeof sala[]>((r) => { fin = () => r([sala]); }); }, soltarLobby: () => { soltadas++; } };
    const net = new Net(tr as unknown as Transport, () => 0);
    const a = net.listarSalas(1000), b = net.listarSalas(1000);
    expect(abiertas).toBe(1);
    fin();
    expect(await a).toEqual({ salas: [sala] });
    expect(await b).toEqual({ salas: [sala] });
    void net.listarSalas(1000); expect(abiertas).toBe(2); // terminada la anterior, se puede consultar otra vez
    net.dejarDeListar();
    expect(soltadas).toBe(1);
  });
  it("el timeout suelta la conexión a medias y la siguiente consulta empieza limpia", async () => {
    let soltadas = 0, llamadas = 0;
    const tr = { ...new Mem("x"), listar: () => { llamadas++; return new Promise<typeof sala[]>(() => {}); }, soltarLobby: () => { soltadas++; } };
    const net = new Net(tr as unknown as Transport, () => 0);
    expect((await net.listarSalas(10)).motivo).toMatch(/consultar/);
    expect(soltadas).toBe(1);
    void net.listarSalas(10);
    expect(llamadas).toBe(2);
  });
});
