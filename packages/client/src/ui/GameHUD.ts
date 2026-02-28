import { WEAPONS, type WeaponId } from '@browserstrike/shared';

export interface HUDState {
  hp: number;
  ammo: number;
  magazineSize: number;
  weaponId: WeaponId;
  isReloading?: boolean;
  reloadProgress?: number; // 0..1
  scoreA: number;
  scoreB: number;
  roundTime: number; // seconds remaining
}

/**
 * In-game HUD overlay: crosshair, HP, ammo, round score, timer.
 * All elements are pointer-events: none so they don't interfere with gameplay.
 */
export class GameHUD {
  private container: HTMLElement;

  // Element refs
  private hpEl!: HTMLElement;
  private ammoCurrentEl!: HTMLElement;
  private ammoMagEl!: HTMLElement;
  private weaponNameEl!: HTMLElement;
  private reloadEl!: HTMLElement;
  private scoreAEl!: HTMLElement;
  private scoreBEl!: HTMLElement;
  private timerEl!: HTMLElement;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'game-hud';
    this.build();
    parent.appendChild(this.container);
  }

  private build(): void {
    this.container.innerHTML = `
      <!-- Crosshair -->
      <div class="hud-crosshair">
        <div class="hud-cross-h"></div>
        <div class="hud-cross-v"></div>
        <div class="hud-cross-dot"></div>
      </div>

      <!-- Score + Timer (top center) -->
      <div class="hud-top-center">
        <div class="hud-score">
          <span class="hud-score-a">0</span>
          <span class="hud-score-sep">:</span>
          <span class="hud-score-b">0</span>
        </div>
        <div class="hud-timer">2:00</div>
      </div>

      <!-- HP (bottom center) -->
      <div class="hud-bottom-center">
        <div class="hud-hp">
          <span class="hud-hp-icon">+</span>
          <span class="hud-hp-value">100</span>
        </div>
      </div>

      <!-- Ammo + Weapon (bottom right) -->
      <div class="hud-bottom-right">
        <div class="hud-ammo">
          <span class="hud-ammo-current">7</span>
          <span class="hud-ammo-sep">/</span>
          <span class="hud-ammo-mag">7</span>
        </div>
        <div class="hud-weapon-name">Desert Eagle</div>
        <div class="hud-reload" style="display:none;">RELOADING...</div>
      </div>
    `;

    // Cache element references
    this.hpEl = this.container.querySelector('.hud-hp-value')!;
    this.ammoCurrentEl = this.container.querySelector('.hud-ammo-current')!;
    this.ammoMagEl = this.container.querySelector('.hud-ammo-mag')!;
    this.weaponNameEl = this.container.querySelector('.hud-weapon-name')!;
    this.reloadEl = this.container.querySelector('.hud-reload')!;
    this.scoreAEl = this.container.querySelector('.hud-score-a')!;
    this.scoreBEl = this.container.querySelector('.hud-score-b')!;
    this.timerEl = this.container.querySelector('.hud-timer')!;
  }

  update(state: HUDState): void {
    // HP
    this.hpEl.textContent = String(Math.max(0, Math.round(state.hp)));

    // Color HP based on value
    if (state.hp > 60) {
      this.hpEl.style.color = '#fff';
    } else if (state.hp > 25) {
      this.hpEl.style.color = '#ffaa00';
    } else {
      this.hpEl.style.color = '#ff3c3c';
    }

    // Ammo
    this.ammoCurrentEl.textContent = String(state.ammo);
    this.ammoMagEl.textContent = String(state.magazineSize);

    // Ammo color: red when low
    if (state.ammo === 0) {
      this.ammoCurrentEl.style.color = '#ff3c3c';
    } else if (state.ammo <= Math.ceil(state.magazineSize * 0.3)) {
      this.ammoCurrentEl.style.color = '#ffaa00';
    } else {
      this.ammoCurrentEl.style.color = '#fff';
    }

    // Weapon name
    const weapon = WEAPONS[state.weaponId];
    this.weaponNameEl.textContent = weapon ? weapon.name : state.weaponId;

    // Reload indicator
    if (state.isReloading) {
      this.reloadEl.style.display = '';
    } else {
      this.reloadEl.style.display = 'none';
    }

    // Score
    this.scoreAEl.textContent = String(state.scoreA);
    this.scoreBEl.textContent = String(state.scoreB);

    // Timer
    const mins = Math.floor(state.roundTime / 60);
    const secs = Math.floor(state.roundTime % 60);
    this.timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Timer color: red when low
    if (state.roundTime <= 10) {
      this.timerEl.style.color = '#ff3c3c';
    } else if (state.roundTime <= 30) {
      this.timerEl.style.color = '#ffaa00';
    } else {
      this.timerEl.style.color = '#aaa';
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
