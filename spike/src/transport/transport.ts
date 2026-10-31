/** Identificador de un participante dentro de la sala (en Photon, el actorNr). */
export type PeerId = string;

/** Una sala abierta tal como la ve la lista: sin solución, sin alias de jugadores. `nivel` 1|2|3 (3 = Experto) o "mixto" (pods 1-3 de nivel 1 y 4-5 con fallas de nivel 2). */
export interface SalaInfo { codigo: string; nivel: 1 | 2 | 3 | "mixto"; jugadores: number; max: 2; estado: "esperando" | "llena" | "jugando" }
/** Nivel de una sala leído del lobby (Photon guarda lo que publicó el anfitrión): lo desconocido cuenta como 1. */
export const nivelDeSala = (v: unknown): SalaInfo["nivel"] => (v === "mixto" ? "mixto" : v === 2 || v === 3 ? v : Number(v) === 2 ? 2 : Number(v) === 3 ? 3 : 1);
/** Lo que el anfitrión publica de su sala para la lista (el código ya es el de la sala). */
export type SalaPublica = Pick<SalaInfo, "nivel" | "jugadores" | "estado">;

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
  /** Anfitrión: publica nivel, jugadores y estado de la sala para la lista (se llama al cambiar). */
  publicar?(info: SalaPublica): void;
  /** Cliente fuera de sala: salas abiertas ahora. Rechaza si no hay conexión. */
  listar?(): Promise<SalaInfo[]>;
  /** Suelta la conexión de solo-lobby que abrió `listar` (no toca una sala en curso). */
  soltarLobby?(): void;
  close(): Promise<void>;
}
