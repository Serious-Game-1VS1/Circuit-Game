import Photon from "photon-realtime";
import type { PeerId, Transport } from "./transport.js";

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
        this.readyForRooms = undefined; // el próximo create/join vuelve a conectar
        this.settle(new Error("desconectado de Photon"));
        if (this.inRoom) { this.inRoom = false; this.onClose?.(); }
      }
    });
    lbc.onError = mine((code: number, msg: string) => this.settle(new Error(`Photon error ${code}: ${msg}`)));
    lbc.onOperationResponse = mine((err: number, msg: string, op: number) => { if (err) this.settle(new Error(`Photon op ${op} error ${err}: ${msg}`)); });
    // cleanup = true es nuestra propia salida, no la de otro participante.
    lbc.onActorLeave = mine((actor: { actorNr: number }, cleanup: boolean) => { if (!cleanup) this.onLeave?.(String(actor.actorNr)); });
    lbc.onEvent = mine((code: number, content: unknown, actorNr: number) => {
      if (code !== EVENT || typeof content !== "string") return;
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
      old?.disconnect();
      return this.lbc.connectToRegionMaster(this.region);
    }));
  }

  async create(code: string) {
    await this.connect();
    // isVisible=false: el código no aparece en el lobby; solo entra quien lo conoce. 3 = árbitro + 2 jugadores.
    await this.step(() => this.lbc!.createRoom(code, { maxPlayers: 3, isVisible: false }));
  }

  async join(code: string) {
    await this.connect();
    await this.step(() => this.lbc!.joinRoom(code));
  }

  send(data: unknown, to?: PeerId) {
    const opts = to ? { targetActors: [Number(to)] } : { receivers: Photon.LoadBalancing.Constants.ReceiverGroup.MasterClient };
    if (this.inRoom) this.lbc?.raiseEvent(EVENT, JSON.stringify(data), opts);
  }

  async close() {
    this.pending = undefined;
    this.inRoom = false; // cierre propio: no es una pérdida de conexión
    this.readyForRooms = undefined;
    this.lbc?.disconnect();
  }
}