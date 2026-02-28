import { Client, Room } from 'colyseus.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:2567';

export interface RoomCallbacks {
  onStateChange?: (state: unknown) => void;
  onPlayerAdd?: (sessionId: string, player: unknown) => void;
  onPlayerRemove?: (sessionId: string) => void;
  onError?: (code: number, message?: string) => void;
  onLeave?: (code: number) => void;
}

export class NetworkManager {
  private client: Client;
  private room: Room | null = null;

  constructor() {
    this.client = new Client(SERVER_URL);
  }

  /** Create a new room and become the admin. Returns the room code. */
  async createRoom(nickname: string): Promise<string> {
    this.room = await this.client.create('game_room', { nickname });
    console.log(`Room created | id: ${this.room.id} | sessionId: ${this.room.sessionId}`);
    return this.getRoomCode();
  }

  /** Join an existing room by its 6-char code. */
  async joinByCode(roomCode: string, nickname: string): Promise<void> {
    const code = roomCode.toUpperCase().trim();

    // Query available rooms and find one with matching code
    const rooms = await this.client.getAvailableRooms('game_room');
    const match = rooms.find(
      (r) => r.metadata && (r.metadata as Record<string, unknown>).roomCode === code,
    );
    if (!match) {
      throw new Error(`Room with code "${code}" not found`);
    }

    this.room = await this.client.joinById(match.roomId, { nickname });
    console.log(`Joined room | id: ${this.room.id} | sessionId: ${this.room.sessionId}`);
  }

  /** Register callbacks for state changes and player events. */
  listen(callbacks: RoomCallbacks): void {
    if (!this.room) {
      throw new Error('Not connected to a room');
    }

    if (callbacks.onStateChange) {
      this.room.onStateChange(callbacks.onStateChange);
    }

    if (callbacks.onPlayerAdd || callbacks.onPlayerRemove) {
      // Access the state's players MapSchema
      const state = this.room.state as Record<string, unknown>;
      const players = state.players as {
        onAdd: (cb: (player: unknown, key: string) => void) => void;
        onRemove: (cb: (player: unknown, key: string) => void) => void;
      };
      if (players) {
        if (callbacks.onPlayerAdd) {
          players.onAdd((player, key) => callbacks.onPlayerAdd!(key, player));
        }
        if (callbacks.onPlayerRemove) {
          players.onRemove((_player, key) => callbacks.onPlayerRemove!(key));
        }
      }
    }

    if (callbacks.onError) {
      this.room.onError(callbacks.onError);
    }

    if (callbacks.onLeave) {
      this.room.onLeave(callbacks.onLeave);
    }
  }

  /** Send a message to the server. */
  send(type: string, data?: unknown): void {
    if (!this.room) {
      throw new Error('Not connected to a room');
    }
    this.room.send(type, data);
  }

  /** Register a handler for a specific message type from the server. */
  onMessage<T = unknown>(type: string, callback: (message: T) => void): void {
    if (!this.room) {
      throw new Error('Not connected to a room');
    }
    this.room.onMessage(type, callback);
  }

  /** Leave the current room. */
  async leave(consented = true): Promise<void> {
    if (this.room) {
      await this.room.leave(consented);
      this.room = null;
    }
  }

  /** Get room code from state. */
  getRoomCode(): string {
    if (!this.room) return '';
    const state = this.room.state as Record<string, unknown>;
    return (state.roomCode as string) || '';
  }

  /** Get the local player's session ID. */
  get sessionId(): string {
    return this.room?.sessionId ?? '';
  }

  /** Whether we're currently connected to a room. */
  get connected(): boolean {
    return this.room !== null;
  }

  /** Get the underlying Colyseus room (for advanced state access). */
  get currentRoom(): Room | null {
    return this.room;
  }
}
