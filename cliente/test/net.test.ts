import { beforeEach, describe, expect, it } from "vitest";
import { Arbiter } from "../../spike/src/arbiter/arbiter";
import type { Transport } from "../../spike/src/transport/transport";
import { crearTransporte, elegirTransporte, Net } from "../src/net";
import { evaluar } from "../../spike/src/engine/pods";
import { despachable, reloj } from "../src/pantalla";
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
    expect(ana.estado.aviso).toBe("Espera 2 s para volver a probar esta zona");
    t += 2000;
    ana.probar(z.zona, mala);
    expect(ana.estado.aviso).toBe("Cambia la pieza antes de probar");
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
    expect([...vistos].sort()).toEqual(expect.arrayContaining(["fusible", "interruptor", "led", "luces"]));
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

  it("elige el transporte por configuración", () => {
    expect(elegirTransporte({})).toBe("local");
    expect(elegirTransporte({ VITE_PHOTON_APP_ID: "x" })).toBe("photon");
    expect(elegirTransporte({ VITE_PHOTON_APP_ID: "x", VITE_TRANSPORT: "local" })).toBe("local");
    expect(() => crearTransporte({ VITE_TRANSPORT: "photon" }, { hostname: "", search: "" })).toThrow(/VITE_PHOTON_APP_ID/);
  });
});
