import type { MapId } from '../types/game.js';

/**
 * A static axis-aligned collision box defined by center + half-extents.
 * Used by both client and server to build CollisionWorld.
 */
export interface CollisionBox {
  /** Center X */
  cx: number;
  /** Center Y */
  cy: number;
  /** Center Z */
  cz: number;
  /** Half-extent X */
  hx: number;
  /** Half-extent Y */
  hy: number;
  /** Half-extent Z */
  hz: number;
}

/**
 * Visual box for procedural map rendering (client only).
 * Extends CollisionBox with material hint.
 */
export interface VisualBox extends CollisionBox {
  material: 'wall' | 'floor' | 'crate' | 'crate_dark';
}

/**
 * Complete map collision/visual data that can be shared between client and server.
 */
export interface MapCollisionData {
  id: MapId;
  /** Collision-only boxes (walls, floors that are visual + collidable) */
  collisions: CollisionBox[];
  /** Visual boxes with material hints (for procedural rendering) */
  visuals: VisualBox[];
  /** Floor dimensions */
  floorSize: { width: number; depth: number };
}

// ── Warehouse ────────────────────────────────────────────

const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.4;

function wallBox(w: number, h: number, d: number, x: number, y: number, z: number): VisualBox {
  return { cx: x, cy: y, cz: z, hx: w / 2, hy: h / 2, hz: d / 2, material: 'wall' };
}

function crateBox(w: number, h: number, d: number, x: number, z: number, dark = false): VisualBox {
  return { cx: x, cy: h / 2, cz: z, hx: w / 2, hy: h / 2, hz: d / 2, material: dark ? 'crate_dark' : 'crate' };
}

const WAREHOUSE_VISUALS: VisualBox[] = [
  // Outer walls
  wallBox(40, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT / 2, -20),
  wallBox(40, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT / 2, 20),
  wallBox(WALL_THICKNESS, WALL_HEIGHT, 40, -20, WALL_HEIGHT / 2, 0),
  wallBox(WALL_THICKNESS, WALL_HEIGHT, 40, 20, WALL_HEIGHT / 2, 0),
  // Interior walls
  wallBox(12, WALL_HEIGHT, WALL_THICKNESS, -7, WALL_HEIGHT / 2, 0),
  wallBox(12, WALL_HEIGHT, WALL_THICKNESS, 7, WALL_HEIGHT / 2, 0),
  wallBox(WALL_THICKNESS, WALL_HEIGHT, 10, -8, WALL_HEIGHT / 2, -10),
  wallBox(WALL_THICKNESS, WALL_HEIGHT, 10, 8, WALL_HEIGHT / 2, 10),
  // Crates — spawn A area
  crateBox(2, 1.2, 2, -14, -14),
  crateBox(1.5, 1, 1.5, -12, -16, true),
  // Crates — spawn B area
  crateBox(2, 1.2, 2, 14, 14, true),
  crateBox(1.5, 1, 1.5, 12, 16),
  // Mid-map cover
  crateBox(1.5, 2, 1.5, 0, -6),
  crateBox(1.5, 1, 3, 0, 6, true),
  // Side cover
  crateBox(2, 1.5, 1, -5, 8),
  crateBox(1, 1, 2, 6, -8, true),
];

export const WAREHOUSE_DATA: MapCollisionData = {
  id: 'warehouse',
  collisions: WAREHOUSE_VISUALS, // All visual boxes are also collidable
  visuals: WAREHOUSE_VISUALS,
  floorSize: { width: 40, depth: 40 },
};

// ── Map registry ─────────────────────────────────────────

const MAP_COLLISION_DATA: Record<string, MapCollisionData> = {
  warehouse: WAREHOUSE_DATA,
};

/**
 * Get collision/visual data for a map.
 * Returns warehouse data as fallback for unknown maps.
 */
export function getMapCollisionData(mapId: MapId | string): MapCollisionData {
  return MAP_COLLISION_DATA[mapId] ?? WAREHOUSE_DATA;
}
