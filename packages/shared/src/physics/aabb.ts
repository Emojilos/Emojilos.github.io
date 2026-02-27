/**
 * Axis-Aligned Bounding Box for collision detection.
 * min/max define the box corners in world space.
 */
export interface AABB {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

/**
 * Creates an AABB from center position and half-extents.
 */
export function createAABB(
  cx: number, cy: number, cz: number,
  hx: number, hy: number, hz: number,
): AABB {
  return {
    minX: cx - hx, minY: cy - hy, minZ: cz - hz,
    maxX: cx + hx, maxY: cy + hy, maxZ: cz + hz,
  };
}

/**
 * Tests if two AABBs overlap.
 */
export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX && a.maxX > b.minX &&
    a.minY < b.maxY && a.maxY > b.minY &&
    a.minZ < b.maxZ && a.maxZ > b.minZ
  );
}

/**
 * Resolves penetration of a moving AABB (player) against a static AABB (wall/crate).
 * Pushes the player out along the axis of least penetration.
 * Returns the corrected player position (cx, cy, cz) and whether grounded on top.
 */
export function resolveAABB(
  player: AABB,
  obstacle: AABB,
): { dx: number; dy: number; dz: number } | null {
  // Calculate overlap on each axis
  const overlapX1 = obstacle.maxX - player.minX; // push +X
  const overlapX2 = player.maxX - obstacle.minX; // push -X
  const overlapY1 = obstacle.maxY - player.minY; // push +Y
  const overlapY2 = player.maxY - obstacle.minY; // push -Y
  const overlapZ1 = obstacle.maxZ - player.minZ; // push +Z
  const overlapZ2 = player.maxZ - obstacle.minZ; // push -Z

  // Find minimum penetration axis
  const minOverlapX = overlapX1 < overlapX2 ? overlapX1 : -overlapX2;
  const minOverlapY = overlapY1 < overlapY2 ? overlapY1 : -overlapY2;
  const minOverlapZ = overlapZ1 < overlapZ2 ? overlapZ1 : -overlapZ2;

  const absX = Math.abs(minOverlapX);
  const absY = Math.abs(minOverlapY);
  const absZ = Math.abs(minOverlapZ);

  if (absX <= absY && absX <= absZ) {
    return { dx: minOverlapX, dy: 0, dz: 0 };
  } else if (absY <= absX && absY <= absZ) {
    return { dx: 0, dy: minOverlapY, dz: 0 };
  } else {
    return { dx: 0, dy: 0, dz: minOverlapZ };
  }
}
