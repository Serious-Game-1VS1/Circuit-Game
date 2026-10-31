import { beforeEach, describe, expect, it, vi } from "vitest";

// Cliente falso del SDK: cada fase de conexión (NameServer -> Master -> Game) deja un socket «conectando» hasta que `llega()`.
// Cerrar un socket en ese momento es lo que el navegador y el SDK reportan como 3001/3004 «WebSocket closed before established».
const h = vi.hoisted(() => {
  const S = { Error: -1, Uninitialized: 0, ConnectingToNameServer: 1, ConnectedToNameServer: 2, ConnectingToMasterserver: 3, ConnectedToMaster: 4, JoinedLobby: 5, ConnectingToGameserver: 6, Joined: 8, Disconnected: 10 };
  const estado = { instancias: [] as Fake[], cerradosAntesDeAbrir: 0 };
  class Fake {
    static State = S;
    private estado_ = S.Uninitialized;
    socket: "ninguno" | "conectando" | "abierto" | "cerrado" = "ninguno";
    onStateChange: (s: number) => void = () => {};
    onRoomList: () => void = () => {};
    onError: (c: number, m: string) => void = () => {};
    onOperationResponse: () => void = () => {};
    onActorLeave: () => void = () => {};
    onEvent: () => void = () => {};
    constructor() { estado.instancias.push(this); }
    setLogLevel() {}
    setNameServerAddress() {}
    state() { return this.estado_; }
    cambia(s: number) { this.estado_ = s; this.onStateChange(s); }
    connectToRegionMaster() { this.socket = "conectando"; this.cambia(S.ConnectingToNameServer); return true; }
    /** El servidor responde a la fase en curso: abre el socket o pasa a la siguiente. */
    llega() {
      if (this.socket === "cerrado") return;
      const s = this.state();
      if (s === S.ConnectingToNameServer) { this.socket = "abierto"; this.cambia(S.ConnectedToNameServer); }
      else if (s === S.ConnectedToNameServer) { this.socket = "conectando"; this.cambia(S.ConnectingToMasterserver); }
      else if (s === S.ConnectingToMasterserver) { this.socket = "abierto"; this.cambia(S.ConnectedToMaster); this.cambia(S.JoinedLobby); this.onRoomList(); }
      else if (s === S.ConnectingToGameserver) { this.socket = "abierto"; this.cambia(S.Joined); }
    }
    /** Avanza hasta el lobby. */
    alLobby() { while (this.state() !== S.JoinedLobby) this.llega(); }
    createRoom() { this.socket = "conectando"; this.cambia(S.ConnectingToGameserver); return true; }
    joinRoom() { return this.createRoom(); }
    availableRooms() { return []; }
    myRoom() { return { setCustomProperties() {}, setIsOpen() {} }; }
    myActor() { return { actorNr: 1 }; }
    myRoomMasterActorNr() { return 1; }
    raiseEvent() {}
    disconnect() {
      if (this.socket === "conectando") estado.cerradosAntesDeAbrir++;
      this.socket = "cerrado";
      this.cambia(S.Disconnected);
    }
  }
  const Photon = {
    LoadBalancing: { LoadBalancingClient: Fake, Constants: { ReceiverGroup: { MasterClient: 1 } } },
    ConnectionProtocol: { Wss: 1 },
    LogLevel: { ERROR: 1 },
    PhotonPeer: { setWebSocketImpl() {}, webSocketImpl: class {} },
  };
  return { estado, Photon, S };
});
vi.mock("photon-realtime", () => ({ default: h.Photon }));

import { PhotonTransport } from "../src/transport/photon.js";

const ultimo = () => h.estado.instancias[h.estado.instancias.length - 1]!;
/** Deja correr los temporizadores a 0 ms (el cierre diferido del SDK). */
const flush = () => new Promise<void>((r) => setTimeout(r, 5));

beforeEach(() => { h.estado.instancias.length = 0; h.estado.cerradosAntesDeAbrir = 0; });

describe("PhotonTransport: nunca cierra un socket que aún se está abriendo", () => {
  it("soltarLobby con la consulta de lobby conectando espera a que abra y entonces cierra", async () => {
    const t = new PhotonTransport("app");
    void t.listar().catch(() => {});
    const lbc = ultimo();
    expect(lbc.socket).toBe("conectando");
    t.soltarLobby();
    expect(h.estado.cerradosAntesDeAbrir).toBe(0);
    expect(lbc.socket).toBe("conectando"); // se deja terminar la fase
    lbc.llega(); // el NameServer abre
    await flush();
    expect(h.estado.cerradosAntesDeAbrir).toBe(0);
    expect(lbc.socket).toBe("cerrado");
  });

  it("soltarLobby ya conectado al lobby cierra al instante", async () => {
    const t = new PhotonTransport("app");
    const p = t.listar();
    ultimo().alLobby();
    await p;
    t.soltarLobby();
    expect(ultimo().socket).toBe("cerrado");
    expect(h.estado.cerradosAntesDeAbrir).toBe(0);
  });

  it("Salir (close) mientras la reconexión aún abre el NameServer no corta ese socket", async () => {
    const t = new PhotonTransport("app");
    const cierres = vi.fn();
    t.onClose = cierres;
    const c = t.create("ABC123");
    ultimo().alLobby();
    await Promise.resolve();
    ultimo().llega(); // Joined
    await c;
    ultimo().cambia(h.S.Error); // el servidor tira el socket de la sala
    expect(cierres).toHaveBeenCalledTimes(1);
    void t.join("ABC123").catch(() => {}); // lo que hace Net.reconectar
    const nueva = ultimo();
    expect(nueva.state()).toBe(h.S.ConnectingToNameServer);
    await t.close(); // el jugador pulsa «Salir»
    expect(h.estado.cerradosAntesDeAbrir).toBe(0);
    nueva.llega();
    await flush();
    expect(nueva.socket).toBe("cerrado");
    expect(h.estado.cerradosAntesDeAbrir).toBe(0);
  });

  it("una conexión nueva no corta la anterior que aún estaba abriendo", async () => {
    const t = new PhotonTransport("app");
    void t.listar().catch(() => {});
    const vieja = ultimo();
    await t.close(); // reinicia la conexión mientras la consulta seguía abriendo
    void t.join("ABC123").catch(() => {});
    expect(h.estado.instancias).toHaveLength(2);
    expect(h.estado.cerradosAntesDeAbrir).toBe(0);
    vieja.llega();
    await flush();
    expect(vieja.socket).toBe("cerrado");
    expect(h.estado.cerradosAntesDeAbrir).toBe(0);
  });

  it("crear sala sigue funcionando y cerrar dentro de la sala cierra el socket ya abierto", async () => {
    const t = new PhotonTransport("app");
    const c = t.create("ABC123");
    ultimo().alLobby();
    await Promise.resolve();
    ultimo().llega();
    await c;
    await t.close();
    expect(ultimo().socket).toBe("cerrado");
    expect(h.estado.cerradosAntesDeAbrir).toBe(0);
  });
});
