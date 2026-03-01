import { Schema, type } from '@colyseus/schema';
import type { GameMode, MapId, RoundsToWin } from '@browserstrike/shared';

export class SettingsSchema extends Schema {
  @type('string') mode!: GameMode;
  @type('string') mapId!: MapId;
  @type('uint8') roundsToWin!: RoundsToWin;
  @type('uint16') roundTimeLimit!: number;

  constructor() {
    super();
    this.mode = '1v1';
    this.mapId = 'warehouse';
    this.roundsToWin = 5;
    this.roundTimeLimit = 120;
  }
}
