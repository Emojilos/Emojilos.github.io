import * as THREE from 'three';
import { CollisionWorld } from './CollisionWorld';

/** Creates a prototype Warehouse map from Three.js primitives and collision volumes. */
export function buildWarehouseMap(scene: THREE.Scene): CollisionWorld {
  const collisionWorld = new CollisionWorld();

  // --- Materials ---
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.7 });
  const crateDarkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f10, roughness: 0.7 });

  // --- Floor (40x40) ---
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    floorMat,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- Walls ---
  const wallHeight = 4;
  const wallThickness = 0.4;

  function addWall(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      wallMat,
    );
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    collisionWorld.addBox(x, y, z, width / 2, height / 2, depth / 2);
  }

  // Outer walls (4 sides)
  addWall(40, wallHeight, wallThickness, 0, wallHeight / 2, -20);
  addWall(40, wallHeight, wallThickness, 0, wallHeight / 2, 20);
  addWall(wallThickness, wallHeight, 40, -20, wallHeight / 2, 0);
  addWall(wallThickness, wallHeight, 40, 20, wallHeight / 2, 0);

  // Interior walls (warehouse corridors)
  addWall(12, wallHeight, wallThickness, -7, wallHeight / 2, 0);
  addWall(12, wallHeight, wallThickness, 7, wallHeight / 2, 0);
  addWall(wallThickness, wallHeight, 10, -8, wallHeight / 2, -10);
  addWall(wallThickness, wallHeight, 10, 8, wallHeight / 2, 10);

  // --- Crates ---
  function addCrate(
    w: number,
    h: number,
    d: number,
    x: number,
    z: number,
    mat?: THREE.Material,
  ): void {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      mat ?? crateMat,
    );
    crate.position.set(x, h / 2, z);
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);
    collisionWorld.addBox(x, h / 2, z, w / 2, h / 2, d / 2);
  }

  // Spawn A area (NW corner)
  addCrate(2, 1.2, 2, -14, -14);
  addCrate(1.5, 1, 1.5, -12, -16, crateDarkMat);

  // Spawn B area (SE corner)
  addCrate(2, 1.2, 2, 14, 14, crateDarkMat);
  addCrate(1.5, 1, 1.5, 12, 16);

  // Mid-map cover
  addCrate(1.5, 2, 1.5, 0, -6);
  addCrate(1.5, 1, 3, 0, 6, crateDarkMat);

  // Side cover
  addCrate(2, 1.5, 1, -5, 8);
  addCrate(1, 1, 2, 6, -8, crateDarkMat);

  return collisionWorld;
}
