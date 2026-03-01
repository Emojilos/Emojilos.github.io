import { TICK_RATE } from '@browserstrike/shared';

/** Position snapshot for a single player at a specific tick. */
export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  isAlive: boolean;
}

/** Full world snapshot: positions of all players at a given server tick. */
export interface WorldSnapshot {
  /** Server timestamp (Date.now()) when this snapshot was taken. */
  timestamp: number;
  /** Player positions keyed by sessionId. */
  players: Map<string, PlayerSnapshot>;
}

/** Maximum rewind in milliseconds. Shots older than this are not rewound. */
const MAX_REWIND_MS = 200;

/** Number of snapshots to keep (~1 second of history at TICK_RATE). */
const BUFFER_SIZE = Math.ceil(TICK_RATE * (MAX_REWIND_MS / 1000)) + 2; // +2 for safety margin

/**
 * Ring buffer of world snapshots for lag compensation.
 * Stores player positions each server tick so that the shoot handler
 * can rewind to the tick that matches the client's perceived time.
 */
export class SnapshotBuffer {
  private buffer: WorldSnapshot[] = [];
  private writeIndex = 0;
  private count = 0;

  /** Record a snapshot of all player positions at the current tick. */
  record(
    timestamp: number,
    players: Iterable<[string, { x: number; y: number; z: number; isAlive: boolean }]>,
  ): void {
    const snapshot: WorldSnapshot = {
      timestamp,
      players: new Map(),
    };

    for (const [id, p] of players) {
      snapshot.players.set(id, {
        x: p.x,
        y: p.y,
        z: p.z,
        isAlive: p.isAlive,
      });
    }

    if (this.buffer.length < BUFFER_SIZE) {
      this.buffer.push(snapshot);
    } else {
      this.buffer[this.writeIndex] = snapshot;
    }
    this.writeIndex = (this.writeIndex + 1) % BUFFER_SIZE;
    if (this.count < BUFFER_SIZE) this.count++;
  }

  /**
   * Find the snapshot closest to the given timestamp.
   * Returns null if no snapshots exist or timestamp is too old (> MAX_REWIND_MS).
   */
  getSnapshotAt(targetTimestamp: number): WorldSnapshot | null {
    if (this.count === 0) return null;

    const now = this.getNewestTimestamp();
    if (now === null) return null;

    // Clamp rewind to MAX_REWIND_MS
    const clampedTimestamp = Math.max(targetTimestamp, now - MAX_REWIND_MS);

    let bestSnapshot: WorldSnapshot | null = null;
    let bestDiff = Infinity;

    for (let i = 0; i < this.count; i++) {
      const idx = (this.writeIndex - 1 - i + BUFFER_SIZE * 2) % BUFFER_SIZE;
      const snap = this.buffer[idx];
      if (!snap) continue;

      const diff = Math.abs(snap.timestamp - clampedTimestamp);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSnapshot = snap;
      }
    }

    return bestSnapshot;
  }

  /** Get the timestamp of the newest snapshot, or null if empty. */
  private getNewestTimestamp(): number | null {
    if (this.count === 0) return null;
    const idx = (this.writeIndex - 1 + BUFFER_SIZE) % BUFFER_SIZE;
    return this.buffer[idx]?.timestamp ?? null;
  }

  /** Clear all snapshots (e.g., on round reset). */
  clear(): void {
    this.buffer.length = 0;
    this.writeIndex = 0;
    this.count = 0;
  }
}
