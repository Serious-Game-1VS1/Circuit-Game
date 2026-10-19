import { beforeEach, describe, expect, it } from "vitest";
import { Arbiter } from "../../spike/src/arbiter/arbiter";
import type { Transport } from "../../spike/src/transport/transport";
import { crearTransporte, elegirTransporte, Net } from "../src/net";
import { reloj } from "../src/pantalla";

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
  arb = new Arbiter((peer, m) => peers.get(peer)?.onMessage(copia(m), "0"), { now: () => t });
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

  it("'Probar' muestra el veredicto del árbitro y el rival lo ve penalizado (SCRUM-90, SCRUM-23, SCRUM-129)", async () => {
    await empezar();
    ana.probar(0, 1000);
    expect(ana.estado.vistas[0]).toMatchObject({ aguja: "poco" });
    expect(ana.estado.aviso).toBe("Poco: el LED casi no brilla · espera 2 s");
    expect(beto.estado.rival).toMatchObject({ alias: "ana", estado: "penalizado" });
    ana.probar(0, 470);
    expect(ana.estado.aviso).toBe("Espera 2 s para volver a probar esta zona");
    ana.probar(1, 220);
    ana.probar(0, 1000);
    t += 2000;
    ana.probar(0, 1000);
    expect(ana.estado.aviso).toBe("Cambia la pieza antes de probar");
    ana.probar(0, 470);
    expect(ana.estado).toMatchObject({ despachados: 1, aviso: "¡Pod despachado!", vistas: {} });
    arb.tick();
    expect(beto.estado.rival).toEqual({ alias: "ana", despachados: 1, estado: "reparando" });
  });

  it("al despachar 5 pods: ganaste / perdiste", async () => {
    await empezar();
    for (let i = 0; i < 5; i++) { ana.probar(0, 470); ana.probar(1, 220); }
    expect(ana.estado.fase).toBe("fin");
    expect(ana.estado.fin?.titulo).toBe("¡Ganaste!");
    expect(beto.estado.fin?.titulo).toBe("Perdiste");
    expect(beto.estado.fin?.detalle).toContain("ana: 5 pods, 0 quemadas");
  });

  it("reconexión: volver con el mismo código y alias recupera el taller (SCRUM-89)", async () => {
    await empezar();
    ana.probar(0, 470);
    ana.probar(1, 220);
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
    ana.probar(0, 470);
    arb.leave("p1"); // el árbitro ve salir al jugador
    await ana.reconectar(); // lo que dispara Transport.onClose
    expect(beto.estado.rival?.estado).toBe("reparando");
    expect(ana.estado).toMatchObject({ fase: "taller", station: "A", aviso: null });
    expect(ana.estado.pod?.zonas.find((z) => z.zona === 0)?.reparada).toBe(true);
  });

  it("sin red durante toda la ventana: vuelve a Entrar con aviso; 'Volver a jugar' conserva el alias", async () => {
    const m = new Mem("p9");
    const caido = new Net(m, () => t, 0);
    await caido.entrar(CODE, "eva");
    m.join = async () => { throw new Error("sin red"); };
    await caido.reconectar();
    expect(caido.estado).toMatchObject({ fase: "entrar", alias: "eva", aviso: "No se pudo reconectar a la sala" });
    await empezar();
    for (let i = 0; i < 5; i++) { ana.probar(0, 470); ana.probar(1, 220); }
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
