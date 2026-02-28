/**
 * Damage indicator (red vignette with direction) and hitmarker (crosshair flash).
 * All elements are pointer-events: none overlays inside the playing screen.
 */

const VIGNETTE_FADE_TIME = 0.5; // seconds
const HITMARKER_FADE_TIME = 0.2; // seconds

export class DamageEffects {
  private container: HTMLElement;

  // Damage vignette: 4 gradient edges (top, bottom, left, right)
  private vignetteTop!: HTMLElement;
  private vignetteBottom!: HTMLElement;
  private vignetteLeft!: HTMLElement;
  private vignetteRight!: HTMLElement;
  private vignetteTimer = 0;
  private vignetteAlphas = [0, 0, 0, 0]; // top, bottom, left, right initial values

  // Hitmarker: 4 small lines around crosshair center
  private hitmarker!: HTMLElement;
  private hitmarkerTimer = 0;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'damage-effects';
    this.build();
    parent.appendChild(this.container);
  }

  private build(): void {
    this.vignetteTop = this.makeVignetteEdge('vignette-top');
    this.vignetteBottom = this.makeVignetteEdge('vignette-bottom');
    this.vignetteLeft = this.makeVignetteEdge('vignette-left');
    this.vignetteRight = this.makeVignetteEdge('vignette-right');

    this.container.appendChild(this.vignetteTop);
    this.container.appendChild(this.vignetteBottom);
    this.container.appendChild(this.vignetteLeft);
    this.container.appendChild(this.vignetteRight);

    // Hitmarker (4 diagonal lines around crosshair)
    this.hitmarker = document.createElement('div');
    this.hitmarker.className = 'hitmarker';
    this.hitmarker.style.opacity = '0';
    this.hitmarker.innerHTML = `
      <div class="hitmarker-line hitmarker-tl"></div>
      <div class="hitmarker-line hitmarker-tr"></div>
      <div class="hitmarker-line hitmarker-bl"></div>
      <div class="hitmarker-line hitmarker-br"></div>
    `;
    this.container.appendChild(this.hitmarker);
  }

  private makeVignetteEdge(cls: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `damage-vignette ${cls}`;
    el.style.opacity = '0';
    return el;
  }

  /**
   * Show damage vignette with directional emphasis.
   * @param damage Amount of damage taken (affects intensity)
   * @param dirX Attack direction X (from server 'damaged' event)
   * @param dirZ Attack direction Z (from server 'damaged' event)
   * @param playerYaw Player's current yaw angle
   */
  showDamage(damage: number, dirX: number, dirZ: number, playerYaw: number): void {
    const intensity = Math.min(damage / 60, 1.0);
    const baseAlpha = 0.3 + intensity * 0.5; // 0.3..0.8

    // Direction vector points FROM victim TOWARD attacker (server sends reversed direction)
    // So negate to get direction TO attacker
    const toAttackerX = -dirX;
    const toAttackerZ = -dirZ;

    // Angle of attacker relative to player's facing direction
    const attackAngle = Math.atan2(toAttackerX, toAttackerZ) - playerYaw;
    // Normalize to [-PI, PI]
    const norm = ((attackAngle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

    // Per-edge weights: front(top)=0, right=PI/2, back(bottom)=PI, left=-PI/2
    const frontWeight = Math.max(0, Math.cos(norm));
    const backWeight = Math.max(0, -Math.cos(norm));
    const rightWeight = Math.max(0, Math.sin(norm));
    const leftWeight = Math.max(0, -Math.sin(norm));

    const minBase = 0.15;
    this.vignetteAlphas[0] = baseAlpha * (minBase + (1 - minBase) * frontWeight);
    this.vignetteAlphas[1] = baseAlpha * (minBase + (1 - minBase) * backWeight);
    this.vignetteAlphas[2] = baseAlpha * (minBase + (1 - minBase) * leftWeight);
    this.vignetteAlphas[3] = baseAlpha * (minBase + (1 - minBase) * rightWeight);

    this.vignetteTimer = VIGNETTE_FADE_TIME;
    this.applyVignette(1);
  }

  private applyVignette(scale: number): void {
    this.vignetteTop.style.opacity = String(this.vignetteAlphas[0] * scale);
    this.vignetteBottom.style.opacity = String(this.vignetteAlphas[1] * scale);
    this.vignetteLeft.style.opacity = String(this.vignetteAlphas[2] * scale);
    this.vignetteRight.style.opacity = String(this.vignetteAlphas[3] * scale);
  }

  /**
   * Show hitmarker (confirmed hit on enemy).
   * @param isHeadshot True for headshot (red), false for body (white)
   */
  showHitmarker(isHeadshot: boolean): void {
    const color = isHeadshot ? '#ff3c3c' : '#ffffff';
    const lines = this.hitmarker.querySelectorAll('.hitmarker-line') as NodeListOf<HTMLElement>;
    lines.forEach(l => { l.style.backgroundColor = color; });
    this.hitmarker.style.opacity = '1';
    this.hitmarkerTimer = HITMARKER_FADE_TIME;
  }

  /** Call every frame to fade effects. */
  update(dt: number): void {
    // Fade vignette
    if (this.vignetteTimer > 0) {
      this.vignetteTimer -= dt;
      if (this.vignetteTimer <= 0) {
        this.vignetteTimer = 0;
        this.applyVignette(0);
      } else {
        this.applyVignette(this.vignetteTimer / VIGNETTE_FADE_TIME);
      }
    }

    // Fade hitmarker
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) {
        this.hitmarker.style.opacity = '0';
        this.hitmarkerTimer = 0;
      } else {
        this.hitmarker.style.opacity = String(this.hitmarkerTimer / HITMARKER_FADE_TIME);
      }
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
