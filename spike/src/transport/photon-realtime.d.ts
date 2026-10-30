// Tipos mínimos del SDK oficial photon-realtime 4.4.0 (Exit Games), que no trae .d.ts. Solo lo que usa photon.ts.
declare module "photon-realtime" {
  class RoomInfo {
    name: string; isVisible: boolean; removed: boolean;
    getCustomPropertyOrElse(name: string, def: unknown): unknown;
  }
  class Room extends RoomInfo {
    setCustomProperties(props: Record<string, unknown>): void;
    setIsOpen(open: boolean): void;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- se usa vía `typeof` en Photon.LoadBalancing
  class LoadBalancingClient {
    constructor(protocol: number, appId: string, appVersion: string);
    static State: Record<"Error" | "JoinedLobby" | "Joined" | "Disconnected", number>;
    static StateToName(state: number): string;
    setLogLevel(level: number): void;
    setNameServerAddress(address: string): void;
    connectToRegionMaster(region: string): boolean;
    createRoom(name: string, options?: { maxPlayers?: number; isVisible?: boolean; isOpen?: boolean; customGameProperties?: Record<string, unknown>; propsListedInLobby?: string[] }): boolean;
    myRoom(): Room;
    availableRooms(): RoomInfo[];
    onRoomList: (rooms: RoomInfo[]) => void;
    joinRoom(name: string): boolean;
    raiseEvent(code: number, data: unknown, options?: { receivers?: number; targetActors?: number[] }): void;
    disconnect(): void;
    myActor(): { actorNr: number };
    myRoomMasterActorNr(): number;
    onStateChange: (state: number) => void;
    onError: (code: number, msg: string) => void;
    onOperationResponse: (errorCode: number, errorMsg: string, opCode: number, content: unknown) => void;
    onEvent: (code: number, content: unknown, actorNr: number) => void;
    onActorLeave: (actor: { actorNr: number }, cleanup: boolean) => void;
  }
  const Photon: {
    ConnectionProtocol: { Ws: number; Wss: number };
    LogLevel: { ERROR: number; WARN: number; INFO: number; DEBUG: number };
    LoadBalancing: {
      LoadBalancingClient: typeof LoadBalancingClient;
      Constants: { ReceiverGroup: { Others: number; All: number; MasterClient: number } };
    };
    PhotonPeer: { webSocketImpl: unknown; setWebSocketImpl(impl: unknown): void };
  };
  export default Photon;
}
