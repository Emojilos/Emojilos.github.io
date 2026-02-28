import { Room, Client, ServerError } from 'colyseus';
import {
  MAX_PLAYERS_PER_ROOM,
  ROOM_CODE_LENGTH,
  PLAYER_HP,
  DEFAULT_WEAPON,
  WEAPONS,
  MIN_NICKNAME_LENGTH,
  MAX_NICKNAME_LENGTH,
} from '@browserstrike/shared';
import type { JoinTeamMessage } from '@browserstrike/shared';
import { GameState } from '../schemas/GameState.js';
import { PlayerSchema } from '../schemas/PlayerSchema.js';

const NICKNAME_REGEX = /^[A-Za-z0-9_]+$/;

function generateRoomCode(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function validateNickname(nickname: unknown): string {
  if (typeof nickname !== 'string') {
    throw new ServerError(400, 'Nickname must be a string');
  }
  const trimmed = nickname.trim();
  if (trimmed.length < MIN_NICKNAME_LENGTH || trimmed.length > MAX_NICKNAME_LENGTH) {
    throw new ServerError(
      400,
      `Nickname must be ${MIN_NICKNAME_LENGTH}-${MAX_NICKNAME_LENGTH} characters`,
    );
  }
  if (!NICKNAME_REGEX.test(trimmed)) {
    throw new ServerError(400, 'Nickname must contain only latin letters, digits, and underscores');
  }
  return trimmed;
}

export interface GameRoomOptions {
  nickname?: string;
  roomCode?: string;
}

export class GameRoom extends Room<GameState> {
  maxClients = MAX_PLAYERS_PER_ROOM;

  onCreate(options: GameRoomOptions) {
    this.setState(new GameState());
    this.state.roomCode = generateRoomCode(ROOM_CODE_LENGTH);
    this.state.adminId = '';

    // Register message handlers
    this.onMessage('joinTeam', (client, message: JoinTeamMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (message.team !== 'A' && message.team !== 'B' && message.team !== 'unassigned') return;
      player.team = message.team;
      console.log(`${player.nickname} joined team ${message.team}`);
    });

    // Expose room code as metadata so clients can find rooms by code
    this.setMetadata({ roomCode: this.state.roomCode });

    console.log(`GameRoom created | id: ${this.roomId} | code: ${this.state.roomCode}`);
  }

  onJoin(client: Client, options: GameRoomOptions) {
    const nickname = validateNickname(options.nickname);

    const player = new PlayerSchema();
    player.sessionId = client.sessionId;
    player.nickname = nickname;
    player.hp = PLAYER_HP;
    player.currentWeapon = DEFAULT_WEAPON;
    player.ammo = WEAPONS[DEFAULT_WEAPON].magazine;

    this.state.players.set(client.sessionId, player);

    // First player to join becomes admin
    if (this.state.adminId === '') {
      this.state.adminId = client.sessionId;
    }

    console.log(
      `Player joined: ${client.sessionId} (${nickname}) [${this.state.players.size}/${this.maxClients}]`,
    );
  }

  onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    const nickname = player?.nickname ?? 'unknown';
    this.state.players.delete(client.sessionId);

    // Reassign admin if the admin left
    if (this.state.adminId === client.sessionId) {
      const remaining = Array.from(this.state.players.keys());
      this.state.adminId = remaining.length > 0 ? remaining[0] : '';
    }

    console.log(`Player left: ${client.sessionId} (${nickname}, consented: ${consented})`);
  }

  onDispose() {
    console.log(`GameRoom disposed | id: ${this.roomId}`);
  }
}
