#!/usr/bin/env node
/**
 * Generate Warehouse GLB map file.
 *
 * Usage:  node scripts/generate-warehouse.mjs
 * Output: packages/client/public/models/maps/warehouse.glb
 *
 * The scene contains:
 *   - Visual meshes (floor, walls, crates, details) for rendering
 *   - Collision meshes (name ending in "_collision") for hit detection
 *     These are invisible boxes matching the collision AABBs from shared/mapCollisions.ts
 *
 * Target: < 10k polygons (triangles).
 */

// Polyfill browser globals needed by GLTFExporter in Node.js
import { Blob as NodeBlob } from 'buffer';
globalThis.Blob = globalThis.Blob ?? NodeBlob;
if (!globalThis.FileReader) {
  class FileReaderPolyfill extends EventTarget {
    result = null;
    onloadend = null;
    onload = null;
    onerror = null;
    readAsArrayBuffer(blob) {
      // Must be async to let GLTFExporter set onload after calling readAsArrayBuffer
      Promise.resolve().then(() => blob.arrayBuffer()).then((ab) => {
        this.result = ab;
        const evt = { target: this };
        if (this.onloadend) this.onloadend(evt);
        if (this.onload) this.onload(evt);
      }).catch((err) => {
        if (this.onerror) this.onerror(err);
      });
    }
    readAsDataURL() {
      // Not needed for binary export
    }
  }
  globalThis.FileReader = FileReaderPolyfill;
}
if (!globalThis.document) {
  globalThis.document = {
    createElementNS: () => ({ getContext: () => null }),
  };
}

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, '../packages/client/public/models/maps/warehouse.glb');

// ─── Constants (mirror shared/constants/mapCollisions.ts) ───────────
const MAP_SIZE = 40;
const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.4;

// ─── Materials ──────────────────────────────────────────────────────
// GLTF export preserves material name + color via MeshStandardMaterial.
const matFloor = new THREE.MeshStandardMaterial({
  color: 0x4a4a4a, roughness: 0.95, name: 'floor',
});
const matFloorLine = new THREE.MeshStandardMaterial({
  color: 0x3a3a3a, roughness: 0.95, name: 'floor_line',
});
const matWallOuter = new THREE.MeshStandardMaterial({
  color: 0x5a5a5a, roughness: 0.85, name: 'wall_outer',
});
const matWallInner = new THREE.MeshStandardMaterial({
  color: 0x606060, roughness: 0.8, name: 'wall_inner',
});
const matWallTrim = new THREE.MeshStandardMaterial({
  color: 0x444444, roughness: 0.7, name: 'wall_trim',
});
const matCrate = new THREE.MeshStandardMaterial({
  color: 0x8b6914, roughness: 0.7, name: 'crate',
});
const matCrateDark = new THREE.MeshStandardMaterial({
  color: 0x6b4f10, roughness: 0.7, name: 'crate_dark',
});
const matCrateStrap = new THREE.MeshStandardMaterial({
  color: 0x555544, roughness: 0.6, name: 'crate_strap',
});
const matMetal = new THREE.MeshStandardMaterial({
  color: 0x707080, roughness: 0.4, metalness: 0.6, name: 'metal',
});
const matRoof = new THREE.MeshStandardMaterial({
  color: 0x3d3d3d, roughness: 0.9, name: 'roof',
});
const matCollision = new THREE.MeshBasicMaterial({
  color: 0xff00ff, name: 'collision',
});

// ─── Scene ──────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.name = 'warehouse';

let totalTriangles = 0;

function countTris(geom) {
  const idx = geom.index;
  const tris = idx ? idx.count / 3 : geom.attributes.position.count / 3;
  totalTriangles += tris;
  return tris;
}

function addMesh(name, geom, mat, x, y, z) {
  countTris(geom);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

function addCollisionBox(name, w, h, d, x, y, z) {
  const geom = new THREE.BoxGeometry(w, h, d);
  countTris(geom);
  const mesh = new THREE.Mesh(geom, matCollision);
  mesh.name = name + '_collision';
  mesh.position.set(x, y, z);
  mesh.visible = false;
  scene.add(mesh);
}

// ─── Floor ──────────────────────────────────────────────────────────
// Main floor plane
addMesh('floor', new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), matFloor, 0, 0, 0)
  .rotation.x = -Math.PI / 2;

// Floor grid lines (subtle warehouse markings)
for (let i = -16; i <= 16; i += 8) {
  addMesh(
    `floor_line_x_${i}`,
    new THREE.PlaneGeometry(MAP_SIZE - 1, 0.08),
    matFloorLine,
    0, 0.005, i,
  ).rotation.x = -Math.PI / 2;
  addMesh(
    `floor_line_z_${i}`,
    new THREE.PlaneGeometry(0.08, MAP_SIZE - 1),
    matFloorLine,
    i, 0.005, 0,
  ).rotation.x = -Math.PI / 2;
}

// ─── Outer Walls ────────────────────────────────────────────────────
function addOuterWall(name, w, h, d, x, y, z) {
  // Main wall body
  addMesh(name, new THREE.BoxGeometry(w, h, d), matWallOuter, x, y, z);
  // Bottom trim
  const trimH = 0.15;
  const trimD = d > w ? d : w;
  const trimW = d > w ? w + 0.05 : 0.05;
  addMesh(name + '_trim_bot',
    new THREE.BoxGeometry(d > w ? w + 0.05 : trimD + 0.05, trimH, d > w ? trimD : d + 0.05),
    matWallTrim, x, trimH / 2, z);
  // Top trim
  addMesh(name + '_trim_top',
    new THREE.BoxGeometry(d > w ? w + 0.05 : trimD + 0.05, trimH, d > w ? trimD : d + 0.05),
    matWallTrim, x, h - trimH / 2, z);
  // Collision box (matches shared data exactly)
  addCollisionBox(name, w, h, d, x, y, z);
}

// North wall (z = -20)
addOuterWall('wall_north', MAP_SIZE, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT / 2, -20);
// South wall (z = +20)
addOuterWall('wall_south', MAP_SIZE, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT / 2, 20);
// West wall (x = -20)
addOuterWall('wall_west', WALL_THICKNESS, WALL_HEIGHT, MAP_SIZE, -20, WALL_HEIGHT / 2, 0);
// East wall (x = +20)
addOuterWall('wall_east', WALL_THICKNESS, WALL_HEIGHT, MAP_SIZE, 20, WALL_HEIGHT / 2, 0);

// ─── Interior Walls ─────────────────────────────────────────────────
function addInteriorWall(name, w, h, d, x, y, z) {
  addMesh(name, new THREE.BoxGeometry(w, h, d), matWallInner, x, y, z);
  // Collision box
  addCollisionBox(name, w, h, d, x, y, z);
}

// West corridor wall
addInteriorWall('iwall_west', 12, WALL_HEIGHT, WALL_THICKNESS, -7, WALL_HEIGHT / 2, 0);
// East corridor wall
addInteriorWall('iwall_east', 12, WALL_HEIGHT, WALL_THICKNESS, 7, WALL_HEIGHT / 2, 0);
// North-south wall segments
addInteriorWall('iwall_nw', WALL_THICKNESS, WALL_HEIGHT, 10, -8, WALL_HEIGHT / 2, -10);
addInteriorWall('iwall_se', WALL_THICKNESS, WALL_HEIGHT, 10, 8, WALL_HEIGHT / 2, 10);

// ─── Crates ─────────────────────────────────────────────────────────
function addCrate(name, w, h, d, x, z, dark = false) {
  const mat = dark ? matCrateDark : matCrate;
  const y = h / 2;

  // Main crate body
  addMesh(name, new THREE.BoxGeometry(w, h, d), mat, x, y, z);

  // Horizontal strap across middle
  const strapH = 0.06;
  const strapInset = 0.02;
  addMesh(name + '_strap_h',
    new THREE.BoxGeometry(w + strapInset, strapH, d + strapInset),
    matCrateStrap, x, y, z);
  // Vertical strap
  addMesh(name + '_strap_v',
    new THREE.BoxGeometry(strapH, h + strapInset, d + strapInset),
    matCrateStrap, x, y, z);

  // Lid edge (slightly wider top)
  const lidH = 0.04;
  addMesh(name + '_lid',
    new THREE.BoxGeometry(w + 0.04, lidH, d + 0.04),
    matCrateStrap, x, h - lidH / 2, z);

  // Collision box
  addCollisionBox(name, w, h, d, x, y, z);
}

// Spawn A area (NW corner)
addCrate('crate_a1', 2, 1.2, 2, -14, -14);
addCrate('crate_a2', 1.5, 1, 1.5, -12, -16, true);
// Spawn B area (SE corner)
addCrate('crate_b1', 2, 1.2, 2, 14, 14, true);
addCrate('crate_b2', 1.5, 1, 1.5, 12, 16);
// Mid-map cover
addCrate('crate_mid1', 1.5, 2, 1.5, 0, -6);
addCrate('crate_mid2', 1.5, 1, 3, 0, 6, true);
// Side cover
addCrate('crate_side1', 2, 1.5, 1, -5, 8);
addCrate('crate_side2', 1, 1, 2, 6, -8, true);

// ─── Roof Beams (visual detail) ────────────────────────────────────
const beamW = 0.3;
const beamH = 0.25;
for (let z = -16; z <= 16; z += 8) {
  addMesh(
    `roof_beam_${z}`,
    new THREE.BoxGeometry(MAP_SIZE - 1, beamH, beamW),
    matRoof,
    0, WALL_HEIGHT - beamH / 2, z,
  );
}

// ─── Ceiling ────────────────────────────────────────────────────────
addMesh('ceiling', new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), matRoof, 0, WALL_HEIGHT, 0)
  .rotation.x = Math.PI / 2;

// ─── Support Pillars (corners of interior walls) ────────────────────
function addPillar(name, x, z) {
  const pillarR = 0.15;
  const pillarH = WALL_HEIGHT;
  const geom = new THREE.CylinderGeometry(pillarR, pillarR, pillarH, 6);
  addMesh(name, geom, matMetal, x, pillarH / 2, z);
}

addPillar('pillar_nw', -13, 0);
addPillar('pillar_ne', -1, 0);
addPillar('pillar_sw', 1, 0);
addPillar('pillar_se', 13, 0);
addPillar('pillar_n1', -8, -5);
addPillar('pillar_n2', -8, -15);
addPillar('pillar_s1', 8, 5);
addPillar('pillar_s2', 8, 15);

// ─── Overhead Lights (visual detail) ────────────────────────────────
function addLight(name, x, z) {
  // Light housing
  addMesh(name,
    new THREE.BoxGeometry(0.8, 0.1, 0.3),
    matMetal, x, WALL_HEIGHT - 0.15, z);
  // Light panel (emissive)
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.3, name: 'light_panel',
  });
  addMesh(name + '_panel',
    new THREE.PlaneGeometry(0.6, 0.2),
    lightMat, x, WALL_HEIGHT - 0.21, z)
    .rotation.x = Math.PI / 2;
}

addLight('light_a', -10, -10);
addLight('light_b', 10, 10);
addLight('light_c', 0, 0);
addLight('light_d', -10, 10);
addLight('light_e', 10, -10);

// ─── Spawn Markers (small floor decals) ─────────────────────────────
const markerMat = new THREE.MeshStandardMaterial({
  color: 0x335588, roughness: 0.8, name: 'marker_a',
});
const markerMatB = new THREE.MeshStandardMaterial({
  color: 0x885533, roughness: 0.8, name: 'marker_b',
});

addMesh('spawn_marker_a',
  new THREE.RingGeometry(0.8, 1.0, 16),
  markerMat, -16, 0.01, -16)
  .rotation.x = -Math.PI / 2;

addMesh('spawn_marker_b',
  new THREE.RingGeometry(0.8, 1.0, 16),
  markerMatB, 16, 0.01, 16)
  .rotation.x = -Math.PI / 2;

// ─── Export ─────────────────────────────────────────────────────────
console.log(`Total triangles: ${totalTriangles}`);

const exporter = new GLTFExporter();
exporter.parse(
  scene,
  (glb) => {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, Buffer.from(glb));
    const stats = fs.statSync(OUTPUT);
    console.log(`Wrote ${OUTPUT}`);
    console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`Triangles: ${totalTriangles} (limit: 10000)`);
    if (totalTriangles > 10000) {
      console.error('WARNING: Exceeded 10k triangle budget!');
      process.exit(1);
    }
  },
  (err) => {
    console.error('Export error:', err);
    process.exit(1);
  },
  { binary: true },
);
