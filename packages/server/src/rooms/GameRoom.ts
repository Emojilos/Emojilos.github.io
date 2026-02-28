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
  EYE_HEIGHT,
  applyMovement,
} from '@browserstrike/shared';
import type {
  InputMessage,
  JoinTeamMessage,
  HitEvent,
  KillEvent,
  GameMode,
  MapId,
  RoundsToWin,
  Vec3,
} from '@browserstrike/shared';
import { GameState } from '../schemas/GameState.js';
import { PlayerSchema } from '../schemas/PlayerSchema.js';
import { KillEventSchema } from '../schemas/KillEventSchema.js';
import { CollisionWorld } from '../physics/CollisionWorld.js';
import { buildMapCollisions } from '../physics/mapCollisions.js';
import { performHitDetection } from '../physics/hitDetection.js';
import type { HitTarget } from '../physics/hitDetection.js';

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

    this.onMessage('shoot', (client, message: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.isAlive) return;

      // Validate basic shape
      if (typeof message !== 'object' || message === null) return;

      // Reject if reloading
      if (player.isReloading) return;

      // Reject if no ammo
      if (player.ammo <= 0) return;

      const config = WEAPONS[player.currentWeapon];

      // Fire rate enforcement: check lastShootTime (server-only field)
      const now = Date.now();
      if (now - player.lastShootTime < config.fireRate) return;
      player.lastShootTime = now;

      // Decrement ammo
      player.ammo--;

      // --- Hit detection (TASK-024) ---

      // Use server-authoritative origin (player position + eye height)
      const origin: Vec3 = { x: player.x, y: player.y + EYE_HEIGHT, z: player.z };

      // Validate and use client direction
      const msg = message as Record<string, unknown>;
      const dir = msg.direction as Record<string, unknown> | undefined;
      if (!dir || !isFiniteNum(dir.x) || !isFiniteNum(dir.y) || !isFiniteNum(dir.z)) return;

      // Normalize direction
      const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
      if (len < 0.001) return;
      const direction: Vec3 = { x: dir.x / len, y: dir.y / len, z: dir.z / len };

      // Build targets list from alive enemy players
      const targets: HitTarget[] = [];
      const targetTeams = new Map<string, string>();
      this.state.players.forEach((p, id) => {
        if (!p.isAlive) return;
        targets.push({ sessionId: id, x: p.x, y: p.y, z: p.z });
        targetTeams.set(id, p.team);
      });

      const hitResult = performHitDetection(
        origin,
        direction,
        config.range,
        client.sessionId,
        player.team,
        targets,
        targetTeams,
      );

      if (!hitResult) return;

      const victim = this.state.players.get(hitResult.targetId);
      if (!victim || !victim.isAlive) return;

      // Calculate damage
      const damage = hitResult.isHeadshot ? config.damage.head : config.damage.body;

      // Apply damage
      victim.hp -= damage;

      // Send hit confirmation to the shooter
      const hitEvent: HitEvent = {
        targetId: hitResult.targetId,
        damage,
        isHeadshot: hitResult.isHeadshot,
        direction,
      };
      client.send('hit', hitEvent);

      // Send damage notification to the victim
      const victimClient = this.clients.find(c => c.sessionId === hitResult.targetId);
      if (victimClient) {
        victimClient.send('damaged', {
          damage,
          isHeadshot: hitResult.isHeadshot,
          attackerId: client.sessionId,
          direction: { x: -direction.x, y: -direction.y, z: -direction.z },
        });
      }

      // Check for kill
      if (victim.hp <= 0) {
        victim.hp = 0;
        victim.isAlive = false;

        // Update stats
        player.kills++;
        victim.deaths++;

        // Add to kill feed
        const killEvent = new KillEventSchema();
        killEvent.killerNickname = player.nickname;
        killEvent.victimNickname = victim.nickname;
        killEvent.weapon = player.currentWeapon;
        killEvent.isHeadshot = hitResult.isHeadshot;
        killEvent.timestamp = Date.now();
        this.state.killFeed.push(killEvent);

        // Broadcast kill event
        const killMsg: KillEvent = {
          killerId: client.sessionId,
          killerName: player.nickname,
          victimId: hitResult.targetId,
          victimName: victim.nickname,
          weaponId: player.currentWeapon,
          isHeadshot: hitResult.isHeadshot,
        };
        this.broadcast('kill', killMsg);

        console.log(
          `Kill: ${player.nickname} -> ${victim.nickname} [${player.currentWeapon}]${hitResult.isHeadshot ? ' HEADSHOT' : ''}`,
        );
      }
    });

    this.onMessage('reload', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.isAlive) return;
      if (player.isReloading) return;

      const config = WEAPONS[player.currentWeapon];

      // Don't reload if magazine is full
      if (player.ammo >= config.magazine) return;

      player.isReloading = true;

      // Schedule reload completion
      this.clock.setTimeout(() => {
        // Verify player still exists and is still reloading
        const p = this.state.players.get(client.sessionId);
        if (!p || !p.isReloading) return;

        p.isReloading = false;
        p.ammo = WEAPONS[p.currentWeapon].magazine;
      }, config.reloadTime);
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
