import { TICK_RATE } from '@browserstrike/shared';

/** A single snapshot of a remote player's transform. */
interface Snapshot {
  time: number; // client timestamp (performance.now() / 1000)
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/**
 * Stores a short history of server snapshots for one remote player
 * and interpolates between them with a fixed render delay.
 *
 * Render delay = 2 × server tick interval, so we always have
 * at least one pair of snapshots to interpolate between.
 */
export class InterpolationBuffer {
  /** Ring buffer of recent snapshots, newest last. */
  private snapshots: Snapshot[] = [];

  /** Maximum snapshots to keep (about 1 second of history). */
  private static readonly MAX_SNAPSHOTS = Math.ceil(TICK_RATE) + 2;

  /**
   * Render delay in seconds: 2 server ticks behind real-time.
   * At 20 Hz → 100ms delay.
   */
  private static readonly RENDER_DELAY = 2 / TICK_RATE;

  /** Push a new server snapshot. Call once per state-change event. */
  push(x: number, y: number, z: number, yaw: number, pitch: number): void {
    const time = performance.now() / 1000;
    this.snapshots.push({ time, x, y, z, yaw, pitch });

    // Trim old snapshots
    if (this.snapshots.length > InterpolationBuffer.MAX_SNAPSHOTS) {
      this.snapshots.splice(
        0,
        this.snapshots.length - InterpolationBuffer.MAX_SNAPSHOTS,
      );
    }
  }

  /**
   * Get the interpolated transform for the current render time.
   * Returns null if there aren't enough snapshots yet (player just spawned).
   */
  getInterpolated(): { x: number; y: number; z: number; yaw: number; pitch: number } | null {
    if (this.snapshots.length === 0) return null;

    const renderTime = performance.now() / 1000 - InterpolationBuffer.RENDER_DELAY;

    // If only one snapshot, use it directly
    if (this.snapshots.length === 1) {
      const s = this.snapshots[0];
      return { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch };
    }

    // Find the two snapshots that bracket renderTime
    // Snapshots are in chronological order (newest last)
    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    // If renderTime is before our oldest snapshot, use oldest
    if (renderTime <= first.time) {
      return { x: first.x, y: first.y, z: first.z, yaw: first.yaw, pitch: first.pitch };
    }

    // If renderTime is after our newest snapshot, extrapolate (clamp to newest)
    if (renderTime >= last.time) {
      return { x: last.x, y: last.y, z: last.z, yaw: last.yaw, pitch: last.pitch };
    }

    // Find the pair that brackets renderTime
    for (let i = 0; i < this.snapshots.length - 1; i++) {
      const a = this.snapshots[i];
      const b = this.snapshots[i + 1];

      if (renderTime >= a.time && renderTime <= b.time) {
        const duration = b.time - a.time;
        const t = duration > 0 ? (renderTime - a.time) / duration : 0;

        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
          yaw: lerpAngle(a.yaw, b.yaw, t),
          pitch: a.pitch + (b.pitch - a.pitch) * t,
        };
      }
    }

    // Fallback — shouldn't reach here
    return { x: last.x, y: last.y, z: last.z, yaw: last.yaw, pitch: last.pitch };
  }

  /** Clear all snapshots (e.g. on round reset). */
  clear(): void {
    this.snapshots.length = 0;
  }
}

/**
 * Interpolate between two angles (radians), taking the shortest path.
 * Handles wrap-around at ±PI.
 */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;

  // Wrap to [-PI, PI]
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  return a + diff * t;
}
