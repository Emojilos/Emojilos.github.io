import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';
import type { GameStatus } from '@browserstrike/shared';
import { SettingsSchema } from './SettingsSchema.js';
import { PlayerSchema } from './PlayerSchema.js';
import { KillEventSchema } from './KillEventSchema.js';

export class GameState extends Schema {
  @type('string') roomCode!: string;
  @type('string') status!: GameStatus;
  @type(SettingsSchema) settings!: SettingsSchema;
  @type('string') adminId!: string;
  @type('uint8') scoreTeamA!: number;
  @type('uint8') scoreTeamB!: number;
  @type('uint8') currentRound!: number;
  @type('float32') roundTimer!: number;
  @type({ map: PlayerSchema }) players!: MapSchema<PlayerSchema>;
  @type([KillEventSchema]) killFeed!: ArraySchema<KillEventSchema>;

  constructor() {
    super();
    this.roomCode = '';
    this.status = 'lobby';
    this.settings = new SettingsSchema();
    this.adminId = '';
    this.scoreTeamA = 0;
    this.scoreTeamB = 0;
    this.currentRound = 0;
    this.roundTimer = 0;
    this.players = new MapSchema<PlayerSchema>();
    this.killFeed = new ArraySchema<KillEventSchema>();
  }
}
