/**
 * Kill Feed UI — shows last 5 kills in the top-right corner.
 * Format: "killerName [weapon] victimName" with headshot indicator.
 * Entries fade out after 5 seconds.
 */

import type { KillEvent } from '@browserstrike/shared';

const MAX_ENTRIES = 5;
const FADE_TIME = 5; // seconds before entry starts fading
const FADE_DURATION = 0.5; // seconds for the fade-out transition

interface KillFeedEntry {
  el: HTMLElement;
  age: number;
  fading: boolean;
}

export class KillFeed {
  private container: HTMLElement;
  private entries: KillFeedEntry[] = [];

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'kill-feed';
    parent.appendChild(this.container);
  }

  /** Add a kill event to the feed. */
  addKill(event: KillEvent): void {
    const el = document.createElement('div');
    el.className = 'kill-feed-entry';

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const headshotIcon = event.isHeadshot ? '<span class="kf-headshot">HS</span>' : '';

    el.innerHTML =
      `<span class="kf-killer">${esc(event.killerName)}</span>` +
      `<span class="kf-weapon">[${esc(event.weaponId)}]</span>` +
      headshotIcon +
      `<span class="kf-victim">${esc(event.victimName)}</span>`;

    this.container.appendChild(el);
    this.entries.push({ el, age: 0, fading: false });

    // Remove excess entries immediately
    while (this.entries.length > MAX_ENTRIES) {
      const removed = this.entries.shift()!;
      removed.el.remove();
    }
  }

  /** Call every frame to age entries and fade them out. */
  update(dt: number): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      entry.age += dt;

      if (!entry.fading && entry.age >= FADE_TIME) {
        entry.fading = true;
        entry.el.style.transition = `opacity ${FADE_DURATION}s ease-out`;
        entry.el.style.opacity = '0';
      }

      if (entry.age >= FADE_TIME + FADE_DURATION) {
        entry.el.remove();
        this.entries.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
