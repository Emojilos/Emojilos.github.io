import { Schema, type } from '@colyseus/schema';
import type { WeaponId } from '@browserstrike/shared';

export class KillEventSchema extends Schema {
  @type('string') killerNickname!: string;
  @type('string') victimNickname!: string;
  @type('string') weapon!: WeaponId;
  @type('boolean') isHeadshot!: boolean;
  @type('float64') timestamp!: number;

  constructor() {
    super();
    this.killerNickname = '';
    this.victimNickname = '';
    this.weapon = 'deagle';
    this.isHeadshot = false;
    this.timestamp = 0;
  }
}
