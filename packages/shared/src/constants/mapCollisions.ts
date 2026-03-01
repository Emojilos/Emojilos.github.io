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

// ── Dust Alley ───────────────────────────────────────────

const DA_WALL_HEIGHT = 5;
const DA_WALL_T = 0.4;

function daWall(w: number, h: number, d: number, x: number, y: number, z: number): VisualBox {
  return { cx: x, cy: y, cz: z, hx: w / 2, hy: h / 2, hz: d / 2, material: 'wall' };
}

function daCrate(w: number, h: number, d: number, x: number, z: number, dark = false): VisualBox {
  return { cx: x, cy: h / 2, cz: z, hx: w / 2, hy: h / 2, hz: d / 2, material: dark ? 'crate_dark' : 'crate' };
}

const DUST_ALLEY_VISUALS: VisualBox[] = [
  // Outer walls (40×40 arena, taller for desert feel)
  daWall(40, DA_WALL_HEIGHT, DA_WALL_T, 0, DA_WALL_HEIGHT / 2, -20),   // North
  daWall(40, DA_WALL_HEIGHT, DA_WALL_T, 0, DA_WALL_HEIGHT / 2, 20),    // South
  daWall(DA_WALL_T, DA_WALL_HEIGHT, 40, -20, DA_WALL_HEIGHT / 2, 0),   // West
  daWall(DA_WALL_T, DA_WALL_HEIGHT, 40, 20, DA_WALL_HEIGHT / 2, 0),    // East

  // ── Route 1 (North alley) ─────────────────────────────
  // North corridor walls creating a narrow alley at z = -12
  daWall(14, DA_WALL_HEIGHT, DA_WALL_T, -6, DA_WALL_HEIGHT / 2, -10),  // North alley south wall (west)
  daWall(10, DA_WALL_HEIGHT, DA_WALL_T, 8, DA_WALL_HEIGHT / 2, -10),   // North alley south wall (east)
  daWall(14, DA_WALL_HEIGHT, DA_WALL_T, -6, DA_WALL_HEIGHT / 2, -14),  // North alley north wall (west)
  daWall(6, DA_WALL_HEIGHT, DA_WALL_T, 10, DA_WALL_HEIGHT / 2, -14),   // North alley north wall (east)

  // ── Route 2 (Central open square) ─────────────────────
  // Low walls around center square creating partial cover
  daWall(DA_WALL_T, DA_WALL_HEIGHT, 8, -6, DA_WALL_HEIGHT / 2, 0),     // West side of square
  daWall(DA_WALL_T, DA_WALL_HEIGHT, 8, 6, DA_WALL_HEIGHT / 2, 0),      // East side of square

  // ── Route 3 (South alley) ─────────────────────────────
  // South corridor walls creating offset alley at z = +12
  daWall(10, DA_WALL_HEIGHT, DA_WALL_T, -8, DA_WALL_HEIGHT / 2, 10),   // South alley north wall (west)
  daWall(14, DA_WALL_HEIGHT, DA_WALL_T, 6, DA_WALL_HEIGHT / 2, 10),    // South alley north wall (east)
  daWall(6, DA_WALL_HEIGHT, DA_WALL_T, -10, DA_WALL_HEIGHT / 2, 14),   // South alley south wall (west)
  daWall(14, DA_WALL_HEIGHT, DA_WALL_T, 6, DA_WALL_HEIGHT / 2, 14),    // South alley south wall (east)

  // ── Cover objects (crates, market stalls) ──────────────
  // North alley cover
  daCrate(1.5, 1.2, 1.5, -4, -12),
  daCrate(1, 1.5, 1, 5, -12, true),

  // Central square cover
  daCrate(2, 1.0, 2, 0, 0),                                             // Center crate
  daCrate(1.5, 1.8, 1.5, -3, 2, true),                                  // Left of center
  daCrate(1.5, 1.8, 1.5, 3, -2),                                        // Right of center

  // South alley cover
  daCrate(1, 1.2, 2, -4, 12, true),
  daCrate(1.5, 1.0, 1.5, 4, 12),

  // Spawn area cover
  daCrate(2, 1.5, 1, -14, -5),                                          // Team A spawn area
  daCrate(1.5, 1.2, 2, -16, 5, true),
  daCrate(2, 1.5, 1, 14, 5, true),                                      // Team B spawn area
  daCrate(1.5, 1.2, 2, 16, -5),
];

export const DUST_ALLEY_DATA: MapCollisionData = {
  id: 'dust_alley',
  collisions: DUST_ALLEY_VISUALS,
  visuals: DUST_ALLEY_VISUALS,
  floorSize: { width: 40, depth: 40 },
};

// ── Office ────────────────────────────────────────────────

const OF_WALL_HEIGHT = 4;
const OF_FLOOR2_Y = 4;  // Second floor at y=4
const OF_WALL_T = 0.4;

function ofWall(w: number, h: number, d: number, x: number, y: number, z: number): VisualBox {
  return { cx: x, cy: y, cz: z, hx: w / 2, hy: h / 2, hz: d / 2, material: 'wall' };
}

function ofCrate(w: number, h: number, d: number, x: number, z: number, baseY = 0, dark = false): VisualBox {
  return { cx: x, cy: baseY + h / 2, cz: z, hx: w / 2, hy: h / 2, hz: d / 2, material: dark ? 'crate_dark' : 'crate' };
}

const OFFICE_VISUALS: VisualBox[] = [
  // ── Outer walls (40×40, ground floor) ──────────────────
  ofWall(40, OF_WALL_HEIGHT, OF_WALL_T, 0, OF_WALL_HEIGHT / 2, -20),   // North
  ofWall(40, OF_WALL_HEIGHT, OF_WALL_T, 0, OF_WALL_HEIGHT / 2, 20),    // South
  ofWall(OF_WALL_T, OF_WALL_HEIGHT, 40, -20, OF_WALL_HEIGHT / 2, 0),   // West
  ofWall(OF_WALL_T, OF_WALL_HEIGHT, 40, 20, OF_WALL_HEIGHT / 2, 0),    // East

  // ── Outer walls (second floor) ─────────────────────────
  ofWall(40, OF_WALL_HEIGHT, OF_WALL_T, 0, OF_FLOOR2_Y + OF_WALL_HEIGHT / 2, -20),
  ofWall(40, OF_WALL_HEIGHT, OF_WALL_T, 0, OF_FLOOR2_Y + OF_WALL_HEIGHT / 2, 20),
  ofWall(OF_WALL_T, OF_WALL_HEIGHT, 40, -20, OF_FLOOR2_Y + OF_WALL_HEIGHT / 2, 0),
  ofWall(OF_WALL_T, OF_WALL_HEIGHT, 40, 20, OF_FLOOR2_Y + OF_WALL_HEIGHT / 2, 0),

  // ── Second floor platform (covers east half: x=0 to x=20) ──
  // Thick slab acting as floor/ceiling
  ofWall(20, 0.3, 40, 10, OF_FLOOR2_Y - 0.15, 0),

  // ── Ground floor interior walls ────────────────────────
  // Long corridor wall dividing ground floor (x=-6, partial)
  ofWall(OF_WALL_T, OF_WALL_HEIGHT, 16, -6, OF_WALL_HEIGHT / 2, -12),  // North section
  ofWall(OF_WALL_T, OF_WALL_HEIGHT, 12, -6, OF_WALL_HEIGHT / 2, 10),   // South section (gap at z=2..4)

  // Cross wall creating rooms on west side
  ofWall(14, OF_WALL_HEIGHT, OF_WALL_T, -13, OF_WALL_HEIGHT / 2, -4),  // Divider at z=-4
  ofWall(10, OF_WALL_HEIGHT, OF_WALL_T, -15, OF_WALL_HEIGHT / 2, 4),   // Divider at z=4 (gap at east end)

  // Wall under the 2nd floor east side (creates room at ground level)
  ofWall(OF_WALL_T, OF_WALL_HEIGHT, 14, 6, OF_WALL_HEIGHT / 2, -6),    // Pillar wall at x=6 north
  ofWall(OF_WALL_T, OF_WALL_HEIGHT, 10, 6, OF_WALL_HEIGHT / 2, 11),    // Pillar wall at x=6 south (gap for passage)

  // ── Stairs (3 step blocks forming a ramp, west side of 2nd floor edge) ──
  // Stair at x=0..3, z=-2..2 — ascending from ground to 2nd floor
  ofWall(3, 1.0, 4, 1.5, 0.5, 0),     // Step 1: y=0 to 1
  ofWall(3, 2.0, 4, 1.5, 1.0, 0),     // Step 2: y=0 to 2 (overlap creates stair shape via AABB)
  ofWall(3, 3.0, 4, 1.5, 1.5, 0),     // Step 3: y=0 to 3

  // Second staircase at back (x=14, z=0) — south-east corner
  ofWall(3, 1.0, 4, 14, 0.5, 0),
  ofWall(3, 2.0, 4, 14, 1.0, 0),
  ofWall(3, 3.0, 4, 14, 1.5, 0),

  // ── Second floor interior walls ────────────────────────
  // Divider creating two rooms on 2nd floor
  ofWall(OF_WALL_T, OF_WALL_HEIGHT, 16, 10, OF_FLOOR2_Y + OF_WALL_HEIGHT / 2, -12),  // North office
  ofWall(OF_WALL_T, OF_WALL_HEIGHT, 12, 10, OF_FLOOR2_Y + OF_WALL_HEIGHT / 2, 10),   // South office (gap for door)

  // Cross wall on 2nd floor
  ofWall(10, OF_WALL_HEIGHT, OF_WALL_T, 15, OF_FLOOR2_Y + OF_WALL_HEIGHT / 2, 0),

  // ── Cover objects ──────────────────────────────────────
  // Ground floor west rooms
  ofCrate(1.5, 1.0, 1.5, -14, -14),               // NW room
  ofCrate(2, 1.2, 1, -10, -8, 0, true),            // NW room desk
  ofCrate(1.5, 1.0, 2, -14, 8),                    // SW room
  ofCrate(1, 1.5, 1, -18, 14, 0, true),            // SW corner

  // Ground floor east (under 2nd floor)
  ofCrate(2, 1.0, 2, 14, -14, 0, true),            // NE storage
  ofCrate(1.5, 1.2, 1.5, 10, 14),                  // SE storage

  // Second floor cover
  ofCrate(2, 1.0, 1, 16, -10, OF_FLOOR2_Y, true),  // 2nd floor NE
  ofCrate(1.5, 1.2, 1.5, 12, 10, OF_FLOOR2_Y),     // 2nd floor SE
  ofCrate(1, 1.0, 2, 4, -16, OF_FLOOR2_Y, true),    // 2nd floor ledge cover
  ofCrate(1.5, 1.0, 1.5, 4, 16, OF_FLOOR2_Y),       // 2nd floor south ledge
];

export const OFFICE_DATA: MapCollisionData = {
  id: 'office',
  collisions: OFFICE_VISUALS,
  visuals: OFFICE_VISUALS,
  floorSize: { width: 40, depth: 40 },
};

// ── Map registry ─────────────────────────────────────────

const MAP_COLLISION_DATA: Record<string, MapCollisionData> = {
  warehouse: WAREHOUSE_DATA,
  dust_alley: DUST_ALLEY_DATA,
  office: OFFICE_DATA,
};

/**
 * Get collision/visual data for a map.
 * Returns warehouse data as fallback for unknown maps.
 */
export function getMapCollisionData(mapId: MapId | string): MapCollisionData {
  return MAP_COLLISION_DATA[mapId] ?? WAREHOUSE_DATA;
}
