import { Room, Client, ServerError } from 'colyseus';
import {
  MAX_PLAYERS_PER_ROOM,
  ROOM_CODE_LENGTH,
  PLAYER_HP,
  DEFAULT_WEAPON,
  WEAPONS,
  MIN_NICKNAME_LENGTH,
  MAX_NICKNAME_LENGTH,
  TICK_RATE,
  applyMovement,
} from '@browserstrike/shared';
import type {
  InputMessage,
  JoinTeamMessage,
  GameMode,
  MapId,
  RoundsToWin,
} from '@browserstrike/shared';
import { GameState } from '../schemas/GameState.js';
import { PlayerSchema } from '../schemas/PlayerSchema.js';
import { CollisionWorld } from '../physics/CollisionWorld.js';
import { buildMapCollisions } from '../physics/mapCollisions.js';

const NICKNAME_REGEX = /^[A-Za-z0-9_]+$/;

/** Maximum allowed deltaTime per input (seconds). Prevents time manipulation. */
const MAX_DELTA_TIME = 0.25;

function generateRoomCode(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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

/** Returns true if the value is a finite number. */
function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Validates an InputMessage. Returns true if valid. */
function validateInput(msg: unknown): msg is InputMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  if (!isFiniteNum(m.seq)) return false;
  if (!isFiniteNum(m.yaw)) return false;
  if (!isFiniteNum(m.pitch)) return false;
  if (!isFiniteNum(m.deltaTime)) return false;
  if (m.deltaTime <= 0 || m.deltaTime > MAX_DELTA_TIME) return false;

  if (typeof m.keys !== 'object' || m.keys === null) return false;
  const keys = m.keys as Record<string, unknown>;
  if (typeof keys.w !== 'boolean') return false;
  if (typeof keys.a !== 'boolean') return false;
  if (typeof keys.s !== 'boolean') return false;
  if (typeof keys.d !== 'boolean') return false;
  if (typeof keys.space !== 'boolean') return false;

  return true;
}

export interface GameRoomOptions {
  nickname?: string;
  roomCode?: string;
}

export class GameRoom extends Room<GameState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  private collisionWorld!: CollisionWorld;

  onCreate(options: GameRoomOptions) {
    this.setState(new GameState());
    this.state.roomCode = generateRoomCode(ROOM_CODE_LENGTH);
    this.state.adminId = '';

    // Build collision world for the current map
    this.collisionWorld = buildMapCollisions(this.state.settings.mapId);

    // --- Message handlers ---

    this.onMessage('joinTeam', (client, message: JoinTeamMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (message.team !== 'A' && message.team !== 'B' && message.team !== 'unassigned') return;
      player.team = message.team;
      console.log(`${player.nickname} joined team ${message.team}`);
    });

    this.onMessage('updateSettings', (client, message: unknown) => {
      // Only admin can update settings
      if (client.sessionId !== this.state.adminId) return;
      if (this.state.status !== 'lobby') return;
      if (typeof message !== 'object' || message === null) return;

      const msg = message as Record<string, unknown>;

      if (typeof msg.mode === 'string' && (msg.mode === '1v1' || msg.mode === '2v2')) {
        this.state.settings.mode = msg.mode as GameMode;
      }
      if (typeof msg.mapId === 'string' && ['warehouse', 'dust_alley', 'office', 'trainyard'].includes(msg.mapId)) {
        this.state.settings.mapId = msg.mapId as MapId;
        // Rebuild collision world for new map
        this.collisionWorld = buildMapCollisions(this.state.settings.mapId);
      }
      if (typeof msg.roundsToWin === 'number' && [5, 7, 10, 13].includes(msg.roundsToWin)) {
        this.state.settings.roundsToWin = msg.roundsToWin as RoundsToWin;
      }

      console.log(`Settings updated by ${client.sessionId}: mode=${this.state.settings.mode}, map=${this.state.settings.mapId}, rounds=${this.state.settings.roundsToWin}`);
    });

    this.onMessage('startGame', (client) => {
      // Only admin can start
      if (client.sessionId !== this.state.adminId) return;
      if (this.state.status !== 'lobby') return;

      // Check teams are staffed
      const players = Array.from(this.state.players.values());
      const teamA = players.filter(p => p.team === 'A');
      const teamB = players.filter(p => p.team === 'B');
      const requiredPerTeam = this.state.settings.mode === '1v1' ? 1 : 2;

      if (teamA.length < requiredPerTeam || teamB.length < requiredPerTeam) {
        console.warn(`Cannot start: teams not ready (A: ${teamA.length}, B: ${teamB.length}, need ${requiredPerTeam})`);
        return;
      }

      this.state.status = 'weapon_select';
      console.log(`Game starting! Status → weapon_select`);
    });

    this.onMessage('input', (client, message: unknown) => {
      if (!validateInput(message)) {
        console.warn(`Invalid input from ${client.sessionId}`);
        return;
      }

      const player = this.state.players.get(client.sessionId);
      if (!player || !player.isAlive) return;

      // Update rotation immediately
      player.yaw = message.yaw;
      player.pitch = message.pitch;

      // Convert key booleans to movement input
      const forward = (message.keys.w ? 1 : 0) - (message.keys.s ? 1 : 0);
      const right = (message.keys.d ? 1 : 0) - (message.keys.a ? 1 : 0);

      // Apply movement physics (same shared function as client)
      const physState = applyMovement(
        {
          x: player.x,
          y: player.y,
          z: player.z,
          velocityY: player.velocityY,
          isGrounded: player.isGrounded,
        },
        {
          forward,
          right,
          jump: message.keys.space,
          yaw: message.yaw,
        },
        message.deltaTime,
      );

      // Resolve collisions
      const resolved = this.collisionWorld.resolve(physState);

      // Update player state
      player.x = resolved.x;
      player.y = resolved.y;
      player.z = resolved.z;
      player.velocityY = resolved.velocityY;
      player.isGrounded = resolved.isGrounded;
      player.lastProcessedSeq = message.seq;
    });

    // --- Game loop ---
    this.setSimulationInterval(() => this.onTick(), 1000 / TICK_RATE);

    // Expose room code as metadata so clients can find rooms by code
    this.setMetadata({ roomCode: this.state.roomCode });

    console.log(`GameRoom created | id: ${this.roomId} | code: ${this.state.roomCode}`);
  }

  private onTick() {
    // Currently a no-op — movement is processed per-input in the message handler.
    // Future: round timer, respawn logic, game state transitions.
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
