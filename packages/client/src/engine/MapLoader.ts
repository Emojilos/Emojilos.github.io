import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MapId, CollisionBox, MapCollisionData } from '@browserstrike/shared';
import { getMapCollisionData } from '@browserstrike/shared';
import { CollisionWorld } from './CollisionWorld';

/**
 * Result of loading a map — visual scene objects + collision world.
 */
export interface MapLoadResult {
  /** Root group containing all visual meshes */
  root: THREE.Group;
  /** Collision world built from map data */
  collisionWorld: CollisionWorld;
}

// Naming convention: meshes with "_collision" suffix are collision-only (invisible)
const COLLISION_SUFFIX = '_collision';

/**
 * Materials for procedural map rendering.
 */
const MATERIALS = {
  floor: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.7 }),
  crate_dark: new THREE.MeshStandardMaterial({ color: 0x6b4f10, roughness: 0.7 }),
};

/**
 * Build a CollisionWorld from an array of CollisionBox data.
 */
function buildCollisionWorldFromData(boxes: CollisionBox[]): CollisionWorld {
  const world = new CollisionWorld();
  for (const b of boxes) {
    world.addBox(b.cx, b.cy, b.cz, b.hx, b.hy, b.hz);
  }
  return world;
}

/**
 * Build procedural visual meshes from MapCollisionData.
 * Used when no GLTF model is available for the map.
 */
function buildProceduralMap(data: MapCollisionData): THREE.Group {
  const root = new THREE.Group();
  root.name = `map_${data.id}`;

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(data.floorSize.width, data.floorSize.depth),
    MATERIALS.floor,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // Visual boxes
  for (const v of data.visuals) {
    const w = v.hx * 2;
    const h = v.hy * 2;
    const d = v.hz * 2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      MATERIALS[v.material],
    );
    mesh.position.set(v.cx, v.cy, v.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  return root;
}

/**
 * Extract collision boxes from a GLTF scene by naming convention.
 * Meshes whose name ends with "_collision" are treated as collision volumes.
 * Their bounding boxes become AABB collision entries.
 * Collision meshes are made invisible.
 */
function extractCollisionsFromGLTF(scene: THREE.Group): CollisionBox[] {
  const boxes: CollisionBox[] = [];

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const isCollision = child.name.endsWith(COLLISION_SUFFIX);

    if (isCollision) {
      // Compute world-space bounding box
      child.updateWorldMatrix(true, false);
      const box = new THREE.Box3().setFromObject(child);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);

      boxes.push({
        cx: center.x,
        cy: center.y,
        cz: center.z,
        hx: size.x / 2,
        hy: size.y / 2,
        hz: size.z / 2,
      });

      // Hide collision-only meshes
      child.visible = false;
    }
  });

  return boxes;
}

// GLTF loader singleton
const gltfLoader = new GLTFLoader();

// Map of known GLTF paths (populated as maps get GLTF models)
const GLTF_PATHS: Partial<Record<MapId, string>> = {
  warehouse: '/models/maps/warehouse.glb',
  // Future: dust_alley: '/models/maps/dust_alley.glb',
  // Future: office: '/models/maps/office.glb',
  // Future: trainyard: '/models/maps/trainyard.glb',
};

/**
 * Load a map by ID (sync).
 * Uses procedural generation from shared collision data.
 * For GLTF models, use loadMapAsync() instead.
 */
export function loadMap(mapId: MapId): MapLoadResult {
  return loadProceduralMap(mapId);
}

/**
 * Load a map by ID (async).
 * Tries to load GLTF model first; falls back to procedural generation from shared data.
 */
export async function loadMapAsync(mapId: MapId): Promise<MapLoadResult> {
  const gltfPath = GLTF_PATHS[mapId];

  if (gltfPath) {
    return loadGLTFMap(mapId, gltfPath);
  }

  // Fallback: procedural map from shared collision data
  return loadProceduralMap(mapId);
}

/**
 * Load a GLTF map model and extract collisions.
 */
async function loadGLTFMap(mapId: MapId, path: string): Promise<MapLoadResult> {
  const gltf = await gltfLoader.loadAsync(path);
  const root = gltf.scene;
  root.name = `map_${mapId}`;

  // Enable shadows on all visible meshes
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Extract collision boxes from meshes with _collision naming
  const collisionBoxes = extractCollisionsFromGLTF(root);

  // If no collision meshes found in GLTF, fall back to shared data
  let collisionWorld: CollisionWorld;
  if (collisionBoxes.length > 0) {
    collisionWorld = buildCollisionWorldFromData(collisionBoxes);
  } else {
    const data = getMapCollisionData(mapId);
    collisionWorld = buildCollisionWorldFromData(data.collisions);
  }

  return { root, collisionWorld };
}

/**
 * Load a procedural map from shared collision data.
 */
function loadProceduralMap(mapId: MapId): MapLoadResult {
  const data = getMapCollisionData(mapId);
  const root = buildProceduralMap(data);
  const collisionWorld = buildCollisionWorldFromData(data.collisions);
  return { root, collisionWorld };
}
