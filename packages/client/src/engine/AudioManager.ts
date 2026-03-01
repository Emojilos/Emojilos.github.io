import type { WeaponId } from '@browserstrike/shared';

/** Volume categories for independent control. */
export interface VolumeSettings {
  master: number;   // 0..1
  effects: number;  // 0..1
  footsteps: number; // 0..1
}

const STORAGE_KEY = 'browserstrike_audio';
const DEFAULT_VOLUMES: VolumeSettings = { master: 0.5, effects: 1, footsteps: 0.6 };

/**
 * AudioManager — Web Audio API based sound system.
 * Uses procedural synthesis (no audio files needed).
 * Categories: master, effects, footsteps with independent volume.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private footstepsGain: GainNode | null = null;
  private volumes: VolumeSettings;
  private resumed = false;
  private footstepPhase = 0;
  private lastFootstepTime = 0;

  constructor() {
    this.volumes = this.loadVolumes();
  }

  /** Must be called from a user gesture (click/keydown) to unlock AudioContext. */
  tryResume(): void {
    if (this.resumed) return;
    this.initContext();
  }

  private initContext(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      this.resumed = true;
      return;
    }

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);

    this.effectsGain = this.ctx.createGain();
    this.effectsGain.connect(this.masterGain);

    this.footstepsGain = this.ctx.createGain();
    this.footstepsGain.connect(this.masterGain);

    this.applyVolumes();
    this.resumed = true;
  }

  private applyVolumes(): void {
    if (!this.masterGain || !this.effectsGain || !this.footstepsGain) return;
    this.masterGain.gain.value = this.volumes.master;
    this.effectsGain.gain.value = this.volumes.effects;
    this.footstepsGain.gain.value = this.volumes.footsteps;
  }

  // ── Volume control ──────────────────────────────────

  getVolumes(): VolumeSettings {
    return { ...this.volumes };
  }

  setVolume(category: keyof VolumeSettings, value: number): void {
    this.volumes[category] = Math.max(0, Math.min(1, value));
    this.applyVolumes();
    this.saveVolumes();
  }

  private loadVolumes(): VolumeSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<VolumeSettings>;
        return {
          master: parsed.master ?? DEFAULT_VOLUMES.master,
          effects: parsed.effects ?? DEFAULT_VOLUMES.effects,
          footsteps: parsed.footsteps ?? DEFAULT_VOLUMES.footsteps,
        };
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_VOLUMES };
  }

  private saveVolumes(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.volumes));
    } catch { /* ignore */ }
  }

  // ── Sound effects (procedural synthesis) ────────────

  /** Play weapon fire sound. Each weapon has distinct character. */
  playGunshot(weaponId: WeaponId): void {
    if (!this.ctx || !this.effectsGain) return;
    const t = this.ctx.currentTime;

    switch (weaponId) {
      case 'deagle':
        this.playDeagleShot(t);
        break;
      case 'ssg08':
        this.playSniperShot(t);
        break;
      case 'mp9':
        this.playSMGShot(t);
        break;
    }
  }

  /** Deagle: punchy mid-range pistol shot. */
  private playDeagleShot(t: number): void {
    const ctx = this.ctx!;
    const dest = this.effectsGain!;

    // Noise burst for the crack
    const noise = this.createNoiseBurst(0.08);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.06);
    filter.Q.value = 1.2;

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(dest);
    noise.start(t);
    noise.stop(t + 0.1);

    // Low thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /** SSG-08: heavy, boomy sniper shot with echo tail. */
  private playSniperShot(t: number): void {
    const ctx = this.ctx!;
    const dest = this.effectsGain!;

    // Sharp noise crack
    const noise = this.createNoiseBurst(0.12);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.1);
    filter.Q.value = 0.8;

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(dest);
    noise.start(t);
    noise.stop(t + 0.15);

    // Deep bass thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.15);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.7, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.25);

    // Echo tail
    const echoNoise = this.createNoiseBurst(0.15);
    const echoGain = ctx.createGain();
    echoGain.gain.setValueAtTime(0, t);
    echoGain.gain.setValueAtTime(0.15, t + 0.05);
    echoGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 800;
    echoNoise.connect(echoFilter);
    echoFilter.connect(echoGain);
    echoGain.connect(dest);
    echoNoise.start(t + 0.05);
    echoNoise.stop(t + 0.35);
  }

  /** MP9: short, snappy SMG burst. */
  private playSMGShot(t: number): void {
    const ctx = this.ctx!;
    const dest = this.effectsGain!;

    // Quick noise pop
    const noise = this.createNoiseBurst(0.04);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(1000, t + 0.03);
    filter.Q.value = 1.5;

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(dest);
    noise.start(t);
    noise.stop(t + 0.05);

    // Light thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.03);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.25, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  /** Play reload sound (mechanical click + slide). */
  playReload(): void {
    if (!this.ctx || !this.effectsGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.effectsGain;

    // Magazine out click
    const click1 = this.createNoiseBurst(0.02);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.3, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'highpass';
    f1.frequency.value = 3000;
    click1.connect(f1);
    f1.connect(g1);
    g1.connect(dest);
    click1.start(t);
    click1.stop(t + 0.04);

    // Magazine in click (delayed)
    const click2 = this.createNoiseBurst(0.025);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.35, t + 0.15);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 2500;
    f2.Q.value = 2;
    click2.connect(f2);
    f2.connect(g2);
    g2.connect(dest);
    click2.start(t + 0.15);
    click2.stop(t + 0.2);

    // Slide rack sound
    const slide = this.createNoiseBurst(0.04);
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.25, t + 0.25);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    const f3 = ctx.createBiquadFilter();
    f3.type = 'bandpass';
    f3.frequency.value = 1800;
    f3.Q.value = 3;
    slide.connect(f3);
    f3.connect(g3);
    g3.connect(dest);
    slide.start(t + 0.25);
    slide.stop(t + 0.32);
  }

  /** Play hitmarker sound (short high-pitched ping). */
  playHitmarker(isHeadshot: boolean): void {
    if (!this.ctx || !this.effectsGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.effectsGain;

    const freq = isHeadshot ? 1200 : 800;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.12);

    if (isHeadshot) {
      // Extra high ping for headshot
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 1800;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.15, t + 0.03);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc2.connect(g2);
      g2.connect(dest);
      osc2.start(t + 0.03);
      osc2.stop(t + 0.12);
    }
  }

  /** Play damage taken sound (low thud). */
  playDamage(): void {
    if (!this.ctx || !this.effectsGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.effectsGain;

    // Low impact thud
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.18);

    // Noise burst for impact
    const noise = this.createNoiseBurst(0.06);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 600;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(dest);
    noise.start(t);
    noise.stop(t + 0.08);
  }

  /** Play death sound (heavy thud + fade). */
  playDeath(): void {
    if (!this.ctx || !this.effectsGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.effectsGain;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  /** Play weapon switch click. */
  playWeaponSwitch(): void {
    if (!this.ctx || !this.effectsGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.effectsGain;

    const noise = this.createNoiseBurst(0.015);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3500;
    filter.Q.value = 4;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(t);
    noise.stop(t + 0.03);
  }

  /** Play footstep sound. Call from game loop when player is moving + grounded. */
  playFootstep(isMoving: boolean, isGrounded: boolean, dt: number): void {
    if (!this.ctx || !this.footstepsGain) return;
    if (!isMoving || !isGrounded) {
      this.footstepPhase = 0;
      return;
    }

    const STEP_INTERVAL = 0.35; // seconds between steps
    const now = this.ctx.currentTime;
    this.footstepPhase += dt;

    if (this.footstepPhase >= STEP_INTERVAL && now - this.lastFootstepTime > 0.2) {
      this.footstepPhase -= STEP_INTERVAL;
      this.lastFootstepTime = now;
      this.playStepSound();
    }
  }

  private playStepSound(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dest = this.footstepsGain!;

    // Subtle noise tap
    const noise = this.createNoiseBurst(0.03);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Slight pitch variation for natural feel
    filter.frequency.value = 800 + Math.random() * 400;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(t);
    noise.stop(t + 0.05);
  }

  /** Play round start horn. */
  playRoundStart(): void {
    if (!this.ctx || !this.effectsGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.effectsGain;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.setValueAtTime(550, t + 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.setValueAtTime(0.12, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  /** Play countdown beep. */
  playCountdownBeep(): void {
    if (!this.ctx || !this.effectsGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.effectsGain;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 660;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  // ── Utility ─────────────────────────────────────────

  /** Create a white noise buffer source node. */
  private createNoiseBurst(duration: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const sampleRate = ctx.sampleRate;
    const length = Math.ceil(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  dispose(): void {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.masterGain = null;
    this.effectsGain = null;
    this.footstepsGain = null;
    this.resumed = false;
  }
}
