import { getMapCollisionData } from '@browserstrike/shared';
import type { MapId } from '@browserstrike/shared';
import { CollisionWorld } from './CollisionWorld.js';

/**
 * Build a CollisionWorld from shared map collision data.
 * Uses the same CollisionBox definitions as the client (via @browserstrike/shared).
 */
export function buildMapCollisions(mapId: MapId | string): CollisionWorld {
  const data = getMapCollisionData(mapId as MapId);
  const world = new CollisionWorld();
  for (const box of data.collisions) {
    world.addBox(box.cx, box.cy, box.cz, box.hx, box.hy, box.hz);
  }
  return world;
}
