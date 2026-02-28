import {
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  HEAD_RADIUS,
  HEAD_OFFSET_Y,
} from '@browserstrike/shared';
import type { Vec3 } from '@browserstrike/shared';

export interface HitTarget {
  sessionId: string;
  x: number;
  y: number;
  z: number;
}

export interface HitResult {
  targetId: string;
  isHeadshot: boolean;
  distance: number;
}

/**
 * Ray-AABB intersection (slab method).
 * Returns distance along ray to entry point, or null if no intersection.
 * The AABB is defined by min/max corners.
 */
function rayAABB(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): number | null {
  let tMin = 0;
  let tMax = Infinity;

  // X axis
  if (Math.abs(dx) < 1e-8) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const invD = 1 / dx;
    let t1 = (minX - ox) * invD;
    let t2 = (maxX - ox) * invD;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  // Y axis
  if (Math.abs(dy) < 1e-8) {
    if (oy < minY || oy > maxY) return null;
  } else {
    const invD = 1 / dy;
    let t1 = (minY - oy) * invD;
    let t2 = (maxY - oy) * invD;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  // Z axis
  if (Math.abs(dz) < 1e-8) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    const invD = 1 / dz;
    let t1 = (minZ - oz) * invD;
    let t2 = (maxZ - oz) * invD;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  return tMin;
}

/**
 * Ray-sphere intersection.
 * Returns distance along ray to entry point, or null if no intersection.
 */
function raySphere(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number,
  radius: number,
): number | null {
  const fx = ox - cx;
  const fy = oy - cy;
  const fz = oz - cz;

  // a = dot(d, d) — should be 1 for normalized direction, but compute anyway
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - radius * radius;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  // Return nearest positive intersection
  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return null;
}

/**
 * Performs server-side hit detection: casts a ray against all enemy targets.
 * Returns the closest hit, or null if no hit.
 *
 * Checks head hitbox (sphere) first — if headshot, returns that.
 * Otherwise checks body hitbox (AABB).
 * Friendly fire is skipped (shooterTeam === target team).
 */
export function performHitDetection(
  origin: Vec3,
  direction: Vec3,
  maxRange: number,
  shooterSessionId: string,
  shooterTeam: string,
  targets: HitTarget[],
  targetTeams: Map<string, string>,
): HitResult | null {
  let closestHit: HitResult | null = null;

  for (const target of targets) {
    // Skip self
    if (target.sessionId === shooterSessionId) continue;

    // Skip teammates (no friendly fire)
    const targetTeam = targetTeams.get(target.sessionId);
    if (targetTeam === shooterTeam) continue;

    // Head hitbox: sphere at (x, y + HEAD_OFFSET_Y, z) with HEAD_RADIUS
    const headDist = raySphere(
      origin.x, origin.y, origin.z,
      direction.x, direction.y, direction.z,
      target.x, target.y + HEAD_OFFSET_Y, target.z,
      HEAD_RADIUS,
    );

    if (headDist !== null && headDist <= maxRange) {
      if (!closestHit || headDist < closestHit.distance) {
        closestHit = {
          targetId: target.sessionId,
          isHeadshot: true,
          distance: headDist,
        };
        continue; // This target already hit via head, skip body check
      }
    }

    // Body hitbox: AABB from feet (y) to top (y + PLAYER_HEIGHT)
    const bodyDist = rayAABB(
      origin.x, origin.y, origin.z,
      direction.x, direction.y, direction.z,
      target.x - PLAYER_RADIUS, target.y,          target.z - PLAYER_RADIUS,
      target.x + PLAYER_RADIUS, target.y + PLAYER_HEIGHT, target.z + PLAYER_RADIUS,
    );

    if (bodyDist !== null && bodyDist <= maxRange) {
      if (!closestHit || bodyDist < closestHit.distance) {
        closestHit = {
          targetId: target.sessionId,
          isHeadshot: false,
          distance: bodyDist,
        };
      }
    }
  }

  return closestHit;
}
