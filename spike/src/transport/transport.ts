/** Identificador de un participante dentro de la sala (en Photon, el actorNr). */
export type PeerId = string;

/**
 * Lo único que el árbitro y los clientes necesitan de la red. Hay dos implementaciones:
 * LocalTransport (relé WebSocket en localhost, sin red externa) y PhotonTransport (Photon Cloud, WSS:443).
 * La sala la crea el árbitro y es su anfitrión; los clientes solo pueden entrar a una sala existente.
 */
export interface Transport {
  /** Crea la sala con ese código; falla si ya existe (así no hay códigos duplicados). */
  create(code: string): Promise<void>;
  /** Entra a una sala existente; falla si no existe. */
  join(code: string): Promise<void>;
  /** Envía a un participante; sin `to`, al anfitrión de la sala (el árbitro). */
  send(data: unknown, to?: PeerId): void;
  onMessage: (data: unknown, from: PeerId) => void;
  /** Solo en el anfitrión: un participante salió de la sala (para la reconexión de 30 s). */
  onLeave?: (peer: PeerId) => void;
  /** Se perdió la conexión estando en la sala (no se llama tras close()); el cliente la usa para reconectar. */
  onClose?: () => void;
  close(): Promise<void>;
}
