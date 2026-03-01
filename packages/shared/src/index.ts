// Constants
export {
  TICK_RATE, PLAYER_SPEED, JUMP_VELOCITY, GRAVITY, PLAYER_HP,
  ROUND_COUNTDOWN, WEAPON_SELECT_TIME, ROUND_END_PAUSE, ROUND_TIME_LIMIT,
  ROOM_CODE_LENGTH, MIN_NICKNAME_LENGTH, MAX_NICKNAME_LENGTH, MAX_PLAYERS_PER_ROOM,
  PLAYER_HEIGHT, PLAYER_RADIUS, HEAD_RADIUS, HEAD_OFFSET_Y, EYE_HEIGHT,
  HEADSHOT_MULTIPLIER,
} from './constants/game.js';

export { WEAPONS, DEFAULT_WEAPON, WEAPON_IDS } from './constants/weapons.js';
export { MAPS, MAP_IDS, DEFAULT_MAP } from './constants/maps.js';
export { getMapCollisionData, WAREHOUSE_DATA } from './constants/mapCollisions.js';
export type { CollisionBox, VisualBox, MapCollisionData } from './constants/mapCollisions.js';

// Types
export type {
  GameStatus, Team, GameMode, RoundsToWin, MapId,
  Vec3, Rotation, MapConfig, RoomSettings,
} from './types/game.js';

export type { WeaponId, WeaponType, WeaponConfig } from './types/weapons.js';
export type { PlayerState, KeyState } from './types/player.js';

export type {
  InputMessage, ShootMessage, ReloadMessage, SelectWeaponMessage,
  JoinTeamMessage, StartGameMessage,
  HitEvent, KillEvent, RoundEndEvent, MatchEndEvent,
  PlayerDiedEvent, SoundEvent,
} from './types/network.js';

export type { RoomState } from './types/room.js';

// Physics
export { applyMovement } from './physics/movement.js';
export type { MovementInput, PhysicsState } from './physics/movement.js';
export { createAABB, aabbOverlap, resolveAABB } from './physics/aabb.js';
export type { AABB } from './physics/aabb.js';
