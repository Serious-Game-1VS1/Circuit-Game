import Photon from "photon-realtime";
import { nivelDeSala, type PeerId, type SalaInfo, type SalaPublica, type Transport } from "./transport.js";

const LBC = Photon.LoadBalancing.LoadBalancingClient;
const EVENT = 1;
// Photon Cloud acepta WSS por 443 en Name, Master y Game Server; el SDK usa 19093 por defecto,
// así que fijamos el Name Server en 443 y este devuelve Master/Game sin puerto (= 443).
const NAME_SERVER = "wss://ns.photonengine.io:443";

// El paquete npm envuelve el paquete `ws` de Node (require perezoso); en el navegador ese `ws` es un stub
// que lanza, así que allí se usa el WebSocket nativo (el que el núcleo del SDK usa por defecto).
const BaseSocket = ("window" in globalThis ? WebSocket : Photon.PhotonPeer.webSocketImpl) as new (uri: string, prot: string) => object;
// Garantía del requisito de red de la UDLA: ningún socket de Photon sale por un puerto distinto de 443.
function Only443(uri: string, prot: string) {
  const u = new URL(uri);
  if (u.protocol !== "wss:" || (u.port && u.port !== "443")) throw new Error(`Photon intentó salir por ${u.protocol}${u.port || "443"}; solo se permite WSS:443`);
  return Reflect.construct(BaseSocket, [uri, prot]);
}
Photon.PhotonPeer.setWebSocketImpl(Only443);

/**
 * Cierra un cliente del SDK sin cortar un socket que aún se está abriendo: eso lo registran el navegador y el SDK como
 * 3001/3004 «WebSocket closed before established». Si el cliente sigue conectando, espera a que termine esa fase y entonces lo cierra.
 */
function cerrar(lbc: InstanceType<typeof LBC>) {
  const S = LBC.State;
  const conectando = (s: number) => s === S.ConnectingToNameServer || s === S.ConnectingToMasterserver || s === S.ConnectingToGameserver;
  if (!conectando(lbc.state())) { lbc.disconnect(); return; }
  lbc.onStateChange = (s: number) => {
    if (conectando(s)) return;
    lbc.onStateChange = () => {};
    setTimeout(() => lbc.disconnect(), 0); // después de que el SDK termine de atender este cambio (p. ej. la autenticación)
  };
}

/**
 * S-03: el anfitrión (árbitro) acepta eventos de cualquiera, pero un cliente solo los del anfitrión de la sala.
 * Photon entrega `actorNr` verdadero (lo pone el servidor); el contenido JSON, en cambio, lo escribe el remitente.
 */
export function eventoAceptable(yo: number, anfitrion: number, de: number): boolean {
  return yo === anfitrion || de === anfitrion;
}

/**
 * Transporte sobre Photon Realtime (Photon Cloud) con el SDK oficial `photon-realtime`.
 * Cada instancia es un participante (1 CCU). El que crea la sala es su MasterClient: el árbitro.
 * Los datos van como JSON en un evento propio; el destino es el actorNr o, sin `to`, el MasterClient.
 */
export class PhotonTransport implements Transport {
  private lbc?: InstanceType<typeof LBC>;
  private pending?: { resolve: () => void; reject: (e: Error) => void };
  private readyForRooms?: Promise<void>;
  onMessage: (data: unknown, from: PeerId) => void = () => {};
  onLeave?: (peer: PeerId) => void;
  onClose?: () => void;
  private inRoom = false;
  private listaLista = false;
  private alLista?: () => void;
  /** create/join en marcha o hecho: la conexión ya no es solo de lobby y soltarLobby() no la toca. */
  private ocupado = false;

  constructor(private readonly appId: string, private readonly region = "us", private readonly appVersion = "circuitsync-spike") {}

  /** Un cliente del SDK por conexión: tras un Error el SDK no deja volver a conectar el mismo (reconexión). */
  private build() {
    const lbc = new LBC(Photon.ConnectionProtocol.Wss, this.appId, this.appVersion);
    const mine = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { if (this.lbc === lbc) fn(...a); };
    // ERROR: los niveles más verbosos del SDK registran la petición de autenticación (con el App ID).
    lbc.setLogLevel(Photon.LogLevel.ERROR);
    lbc.setNameServerAddress(NAME_SERVER);
    lbc.onStateChange = mine((s: number) => {
      if (s === LBC.State.JoinedLobby || s === LBC.State.Joined) this.settle();
      if (s === LBC.State.Joined) this.inRoom = true;
      // Si el servidor cierra el socket, el SDK pasa a Error (2003…) sin pasar por Disconnected.
      if (s === LBC.State.Disconnected || s === LBC.State.Error) {
        this.readyForRooms = undefined; this.listaLista = false; // el próximo create/join vuelve a conectar
        this.settle(new Error("desconectado de Photon"));
        if (this.inRoom) { this.inRoom = false; this.onClose?.(); }
      }
    });
    // El lobby manda la lista completa una vez y luego solo cambios; el SDK los mantiene en availableRooms().
    lbc.onRoomList = mine(() => { this.listaLista = true; this.alLista?.(); });
    lbc.onError = mine((code: number, msg: string) => this.settle(new Error(`Photon error ${code}: ${msg}`)));
    lbc.onOperationResponse = mine((err: number, msg: string, op: number) => { if (err) this.settle(new Error(`Photon op ${op} error ${err}: ${msg}`)); });
    // cleanup = true es nuestra propia salida, no la de otro participante.
    lbc.onActorLeave = mine((actor: { actorNr: number }, cleanup: boolean) => { if (!cleanup) this.onLeave?.(String(actor.actorNr)); });
    lbc.onEvent = mine((code: number, content: unknown, actorNr: number) => {
      if (code !== EVENT || typeof content !== "string") return;
      if (!eventoAceptable(lbc.myActor().actorNr, lbc.myRoomMasterActorNr(), actorNr)) return; // un rival no puede hacerse pasar por el árbitro
      try { this.onMessage(JSON.parse(content), String(actorNr)); } catch { /* evento mal formado: se ignora */ }
    });
    return lbc;
  }

  private settle(err?: Error) {
    const p = this.pending;
    this.pending = undefined;
    if (err) p?.reject(err); else p?.resolve();
  }

  private step(start: () => boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      if (!start()) this.settle(new Error("Photon rechazó la operación en el estado actual"));
    });
  }

  private connect() {
    return (this.readyForRooms ??= this.step(() => {
      const old = this.lbc;
      this.lbc = this.build();
      if (old) cerrar(old);
      return this.lbc.connectToRegionMaster(this.region);
    }));
  }

  /** Suelta la conexión de solo-lobby (panel cerrado, escena cerrada, consulta que no llegó); no toca una sala ni un create/join. */
  soltarLobby() {
    if (this.inRoom || this.ocupado || !this.lbc) return;
    const lbc = this.lbc;
    this.lbc = undefined; // los callbacks del cliente viejo ya no cuentan (ver mine)
    this.readyForRooms = undefined; this.listaLista = false; this.alLista = undefined;
    this.settle(new Error("lobby cerrado"));
    cerrar(lbc);
  }

  async create(code: string) {
    this.ocupado = true;
    await this.connect();
    // Visible en el lobby solo con nivel/jugadores/estado (propsListedInLobby): ni solución ni alias. 3 = árbitro + 2 jugadores.
    await this.step(() => this.lbc!.createRoom(code, { maxPlayers: 3, isVisible: true, isOpen: true, customGameProperties: { nivel: 1, jug: 0, est: "esperando" }, propsListedInLobby: ["nivel", "jug", "est"] }));
  }

  /** Anfitrión: actualiza lo que muestra el lobby; cerrada (sin entradas nuevas) en cuanto deja de esperar. */
  publicar({ nivel, jugadores, estado }: SalaPublica) {
    if (!this.inRoom) return;
    const sala = this.lbc?.myRoom();
    sala?.setCustomProperties({ nivel, jug: jugadores, est: estado });
    sala?.setIsOpen(estado === "esperando");
  }

  /** Salas del lobby con espacio o en juego; solo desde fuera de una sala (en sala el SDK ya no está en el lobby). */
  async listar(): Promise<SalaInfo[]> {
    if (this.inRoom) return [];
    await this.connect();
    if (!this.listaLista) await new Promise<void>((r) => { this.alLista = r; });
    return (this.lbc?.availableRooms() ?? []).filter((r) => !r.removed && r.isVisible).map((r) => {
      const est = r.getCustomPropertyOrElse("est", "esperando");
      return {
        codigo: r.name,
        nivel: nivelDeSala(r.getCustomPropertyOrElse("nivel", 1)),
        jugadores: Math.min(2, Math.max(0, Number(r.getCustomPropertyOrElse("jug", 0)) || 0)),
        max: 2 as const,
        estado: est === "llena" || est === "jugando" ? est : "esperando",
      };
    });
  }

  async join(code: string) {
    this.ocupado = true;
    await this.connect();
    await this.step(() => this.lbc!.joinRoom(code));
  }

  send(data: unknown, to?: PeerId) {
    const opts = to ? { targetActors: [Number(to)] } : { receivers: Photon.LoadBalancing.Constants.ReceiverGroup.MasterClient };
    if (this.inRoom) this.lbc?.raiseEvent(EVENT, JSON.stringify(data), opts);
  }

  async close() {
    this.pending = undefined;
    this.inRoom = false; this.ocupado = false; this.listaLista = false; // cierre propio: no es una pérdida de conexión
    this.readyForRooms = undefined;
    if (this.lbc) cerrar(this.lbc);
  }
}