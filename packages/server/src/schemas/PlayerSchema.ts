import { Schema, type } from '@colyseus/schema';
import {
  PLAYER_HP,
  type Team,
  type WeaponId,
  WEAPONS,
  DEFAULT_WEAPON,
} from '@browserstrike/shared';

export class PlayerSchema extends Schema {
  @type('string') sessionId!: string;
  @type('string') nickname!: string;
  @type('string') team!: Team;
  @type('boolean') isAlive!: boolean;
  @type('int16') hp!: number;

  // Position
  @type('float32') x!: number;
  @type('float32') y!: number;
  @type('float32') z!: number;

  // Rotation
  @type('float32') yaw!: number;
  @type('float32') pitch!: number;

  // Weapon state
  @type('string') currentWeapon!: WeaponId;
  @type('uint8') ammo!: number;
  @type('boolean') isReloading!: boolean;

  // Input acknowledgement (for client-side prediction reconciliation)
  @type('uint32') lastProcessedSeq!: number;

  // Stats
  @type('uint16') kills!: number;
  @type('uint16') deaths!: number;

  // Server-only state (not replicated via @type)
  velocityY: number = 0;
  isGrounded: boolean = true;
  lastShootTime: number = 0;

  constructor() {
    super();
    this.sessionId = '';
    this.nickname = '';
    this.team = 'unassigned';
    this.isAlive = true;
    this.hp = PLAYER_HP;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.currentWeapon = DEFAULT_WEAPON;
    this.ammo = WEAPONS[DEFAULT_WEAPON].magazine;
    this.isReloading = false;
    this.lastProcessedSeq = 0;
    this.kills = 0;
    this.deaths = 0;
  }
}
