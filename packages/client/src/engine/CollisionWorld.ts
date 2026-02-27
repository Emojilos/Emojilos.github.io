import {
  PLAYER_RADIUS, PLAYER_HEIGHT,
  type AABB, type PhysicsState,
  createAABB, aabbOverlap, resolveAABB,
} from '@browserstrike/shared';

/**
 * Holds static AABB collision volumes for the current map.
 * Resolves player movement against them each frame.
 */
export class CollisionWorld {
  private readonly boxes: AABB[] = [];

  /** Register a static axis-aligned box (center + half-extents). */
  addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void {
    this.boxes.push(createAABB(cx, cy, cz, hx, hy, hz));
  }

  /** Build a player AABB from feet position. */
  private playerAABB(x: number, y: number, z: number): AABB {
    return createAABB(
      x, y + PLAYER_HEIGHT / 2, z,
      PLAYER_RADIUS, PLAYER_HEIGHT / 2, PLAYER_RADIUS,
    );
  }

  /**
   * Resolve collisions for a player physics state after movement.
   * Mutates and returns the corrected state.
   */
  resolve(state: PhysicsState): PhysicsState {
    // Run up to 4 iterations to handle corner cases
    for (let iter = 0; iter < 4; iter++) {
      const pBox = this.playerAABB(state.x, state.y, state.z);
      let resolved = false;

      for (const box of this.boxes) {
        if (!aabbOverlap(pBox, box)) continue;

        const correction = resolveAABB(pBox, box);
        if (!correction) continue;

        state.x += correction.dx;
        state.y += correction.dy;
        state.z += correction.dz;

        // Landing on top of something
        if (correction.dy > 0) {
          state.velocityY = 0;
          state.isGrounded = true;
        }
        // Hit ceiling
        if (correction.dy < 0 && state.velocityY > 0) {
          state.velocityY = 0;
        }

        resolved = true;
        break; // re-check from scratch after correction
      }

      if (!resolved) break;
    }

    return state;
  }
}
