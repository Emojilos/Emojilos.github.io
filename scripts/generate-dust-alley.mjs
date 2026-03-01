#!/usr/bin/env node
/**
 * Generate Dust Alley GLB map file.
 *
 * Usage:  node scripts/generate-dust-alley.mjs
 * Output: packages/client/public/models/maps/dust_alley.glb
 *
 * Desert-themed map with sandstone walls, arches, narrow alleys, and an open square.
 * 2-3 routes between spawn zones. Asymmetric layout.
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
      Promise.resolve().then(() => blob.arrayBuffer()).then((ab) => {
        this.result = ab;
        const evt = { target: this };
        if (this.onloadend) this.onloadend(evt);
        if (this.onload) this.onload(evt);
      }).catch((err) => {
        if (this.onerror) this.onerror(err);
      });
    }
    readAsDataURL() {}
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
const OUTPUT = path.resolve(__dirname, '../packages/client/public/models/maps/dust_alley.glb');

// ─── Constants (mirror shared/constants/mapCollisions.ts DUST_ALLEY) ──
const MAP_SIZE = 40;
const WALL_HEIGHT = 5;
const WALL_T = 0.4;

// ─── Materials (desert / sandstone theme) ─────────────────────────────
const matFloor = new THREE.MeshStandardMaterial({
  color: 0xc2a060, roughness: 0.95, name: 'sand_floor',
});
const matFloorDetail = new THREE.MeshStandardMaterial({
  color: 0xb09050, roughness: 0.95, name: 'sand_floor_detail',
});
const matWallOuter = new THREE.MeshStandardMaterial({
  color: 0xd4b878, roughness: 0.85, name: 'sandstone_outer',
});
const matWallInner = new THREE.MeshStandardMaterial({
  color: 0xc8a868, roughness: 0.8, name: 'sandstone_inner',
});
const matWallTrim = new THREE.MeshStandardMaterial({
  color: 0xa08848, roughness: 0.75, name: 'sandstone_trim',
});
const matCrate = new THREE.MeshStandardMaterial({
  color: 0x9e7c3c, roughness: 0.7, name: 'crate_wood',
});
const matCrateDark = new THREE.MeshStandardMaterial({
  color: 0x7a5c28, roughness: 0.7, name: 'crate_dark',
});
const matCrateStrap = new THREE.MeshStandardMaterial({
  color: 0x665530, roughness: 0.6, name: 'crate_strap',
});
const matArch = new THREE.MeshStandardMaterial({
  color: 0xbfa060, roughness: 0.8, name: 'arch_stone',
});
const matRoof = new THREE.MeshStandardMaterial({
  color: 0xa09070, roughness: 0.9, name: 'roof_tile',
});
const matAwning = new THREE.MeshStandardMaterial({
  color: 0xcc6633, roughness: 0.8, name: 'awning_fabric',
});
const matPot = new THREE.MeshStandardMaterial({
  color: 0xb05830, roughness: 0.7, name: 'clay_pot',
});
const matCollision = new THREE.MeshBasicMaterial({
  color: 0xff00ff, name: 'collision',
});

// ─── Scene ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.name = 'dust_alley';

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

// ─── Floor ────────────────────────────────────────────────────────────
addMesh('floor', new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), matFloor, 0, 0, 0)
  .rotation.x = -Math.PI / 2;

// Sandy floor patches for visual variety
for (const [px, pz, ps] of [[-8, -8, 5], [6, 10, 4], [0, 0, 6], [12, -6, 3], [-10, 14, 4]]) {
  addMesh(
    `floor_patch_${px}_${pz}`,
    new THREE.PlaneGeometry(ps, ps),
    matFloorDetail,
    px, 0.005, pz,
  ).rotation.x = -Math.PI / 2;
}

// ─── Outer Walls ──────────────────────────────────────────────────────
function addOuterWall(name, w, h, d, x, y, z) {
  addMesh(name, new THREE.BoxGeometry(w, h, d), matWallOuter, x, y, z);
  // Top trim (desert parapet)
  const trimH = 0.2;
  const isXWall = w > d;
  addMesh(name + '_trim',
    new THREE.BoxGeometry(
      isXWall ? w + 0.05 : d + 0.05,
      trimH,
      isXWall ? d + 0.08 : w + 0.08
    ),
    matWallTrim, x, h + trimH / 2, z);
  // Bottom trim
  addMesh(name + '_base',
    new THREE.BoxGeometry(
      isXWall ? w + 0.02 : d + 0.02,
      0.15,
      isXWall ? d + 0.04 : w + 0.04
    ),
    matWallTrim, x, 0.075, z);
  addCollisionBox(name, w, h, d, x, y, z);
}

addOuterWall('wall_north', MAP_SIZE, WALL_HEIGHT, WALL_T, 0, WALL_HEIGHT / 2, -20);
addOuterWall('wall_south', MAP_SIZE, WALL_HEIGHT, WALL_T, 0, WALL_HEIGHT / 2, 20);
addOuterWall('wall_west', WALL_T, WALL_HEIGHT, MAP_SIZE, -20, WALL_HEIGHT / 2, 0);
addOuterWall('wall_east', WALL_T, WALL_HEIGHT, MAP_SIZE, 20, WALL_HEIGHT / 2, 0);

// ─── Interior Walls ───────────────────────────────────────────────────
function addInteriorWall(name, w, h, d, x, y, z) {
  addMesh(name, new THREE.BoxGeometry(w, h, d), matWallInner, x, y, z);
  // Top trim
  const trimH = 0.15;
  const isXWall = w > d;
  addMesh(name + '_trim',
    new THREE.BoxGeometry(
      isXWall ? w + 0.04 : d + 0.04,
      trimH,
      isXWall ? d + 0.06 : w + 0.06
    ),
    matWallTrim, x, h + trimH / 2, z);
  addCollisionBox(name, w, h, d, x, y, z);
}

// Route 1: North alley (z = -10 to -14)
addInteriorWall('nalley_s_w', 14, WALL_HEIGHT, WALL_T, -6, WALL_HEIGHT / 2, -10);
addInteriorWall('nalley_s_e', 10, WALL_HEIGHT, WALL_T, 8, WALL_HEIGHT / 2, -10);
addInteriorWall('nalley_n_w', 14, WALL_HEIGHT, WALL_T, -6, WALL_HEIGHT / 2, -14);
addInteriorWall('nalley_n_e', 6, WALL_HEIGHT, WALL_T, 10, WALL_HEIGHT / 2, -14);

// Route 2: Central area — side walls
addInteriorWall('center_w', WALL_T, WALL_HEIGHT, 8, -6, WALL_HEIGHT / 2, 0);
addInteriorWall('center_e', WALL_T, WALL_HEIGHT, 8, 6, WALL_HEIGHT / 2, 0);

// Route 3: South alley (z = +10 to +14)
addInteriorWall('salley_n_w', 10, WALL_HEIGHT, WALL_T, -8, WALL_HEIGHT / 2, 10);
addInteriorWall('salley_n_e', 14, WALL_HEIGHT, WALL_T, 6, WALL_HEIGHT / 2, 10);
addInteriorWall('salley_s_w', 6, WALL_HEIGHT, WALL_T, -10, WALL_HEIGHT / 2, 14);
addInteriorWall('salley_s_e', 14, WALL_HEIGHT, WALL_T, 6, WALL_HEIGHT / 2, 14);

// ─── Arches (decorative openings above alley passages) ────────────────
function addArch(name, x, z, rotY = 0) {
  // Two pillar sides
  const pillarW = 0.3;
  const pillarH = 3.0;
  const archSpan = 3.0;
  const halfSpan = archSpan / 2;

  // Left pillar
  const lp = addMesh(name + '_lp',
    new THREE.BoxGeometry(pillarW, pillarH, pillarW),
    matArch, x - halfSpan, pillarH / 2, z);
  lp.rotation.y = rotY;
  // Right pillar
  const rp = addMesh(name + '_rp',
    new THREE.BoxGeometry(pillarW, pillarH, pillarW),
    matArch, x + halfSpan, pillarH / 2, z);
  rp.rotation.y = rotY;
  // Top arch (flat lintel — low poly)
  addMesh(name + '_top',
    new THREE.BoxGeometry(archSpan + pillarW, 0.4, pillarW),
    matArch, x, pillarH + 0.2, z)
    .rotation.y = rotY;
  // Keystone
  addMesh(name + '_key',
    new THREE.BoxGeometry(0.25, 0.5, pillarW + 0.04),
    matWallTrim, x, pillarH + 0.45, z)
    .rotation.y = rotY;
}

// Arches at alley entrances
addArch('arch_n_center', 2, -10);       // North alley gap
addArch('arch_n_east', 14, -12, Math.PI / 2); // North alley east entrance
addArch('arch_s_center', -2, 10);       // South alley gap
addArch('arch_s_west', -14, 12, Math.PI / 2); // South alley west entrance
addArch('arch_c_north', 0, -4);         // Central square north entrance
addArch('arch_c_south', 0, 4);          // Central square south entrance

// ─── Crates / Market Cover ───────────────────────────────────────────
function addCrate(name, w, h, d, x, z, dark = false) {
  const mat = dark ? matCrateDark : matCrate;
  const y = h / 2;
  addMesh(name, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  // Strap
  addMesh(name + '_strap',
    new THREE.BoxGeometry(w + 0.02, 0.06, d + 0.02),
    matCrateStrap, x, y, z);
  // Lid
  addMesh(name + '_lid',
    new THREE.BoxGeometry(w + 0.04, 0.04, d + 0.04),
    matCrateStrap, x, h - 0.02, z);
  addCollisionBox(name, w, h, d, x, y, z);
}

// North alley cover
addCrate('crate_na1', 1.5, 1.2, 1.5, -4, -12);
addCrate('crate_na2', 1, 1.5, 1, 5, -12, true);

// Central square cover
addCrate('crate_c1', 2, 1.0, 2, 0, 0);
addCrate('crate_c2', 1.5, 1.8, 1.5, -3, 2, true);
addCrate('crate_c3', 1.5, 1.8, 1.5, 3, -2);

// South alley cover
addCrate('crate_sa1', 1, 1.2, 2, -4, 12, true);
addCrate('crate_sa2', 1.5, 1.0, 1.5, 4, 12);

// Spawn area cover
addCrate('crate_spa1', 2, 1.5, 1, -14, -5);
addCrate('crate_spa2', 1.5, 1.2, 2, -16, 5, true);
addCrate('crate_spb1', 2, 1.5, 1, 14, 5, true);
addCrate('crate_spb2', 1.5, 1.2, 2, 16, -5);

// ─── Awnings (colored fabric over alley walls) ───────────────────────
function addAwning(name, x, z, w, d) {
  // Angled awning plane
  const awning = addMesh(name,
    new THREE.PlaneGeometry(w, d),
    matAwning, x, WALL_HEIGHT - 0.8, z);
  awning.rotation.x = -Math.PI / 2 + 0.25;  // Slight tilt
}

addAwning('awning_n1', -8, -12, 4, 3);
addAwning('awning_s1', 8, 12, 4, 3);
addAwning('awning_c1', -4, 0, 3, 2.5);

// ─── Clay Pots (decorative details) ──────────────────────────────────
function addPot(name, x, z) {
  addMesh(name,
    new THREE.CylinderGeometry(0.2, 0.25, 0.5, 6),
    matPot, x, 0.25, z);
}

addPot('pot_1', -18, -18);
addPot('pot_2', 18, 18);
addPot('pot_3', -2, -18);
addPot('pot_4', 2, 18);
addPot('pot_5', -12, 0);
addPot('pot_6', 12, 0);

// ─── Partial Roof Sections (over alleys) ─────────────────────────────
// North alley partial roof
addMesh('roof_nalley',
  new THREE.PlaneGeometry(10, 4),
  matRoof, -6, WALL_HEIGHT - 0.05, -12)
  .rotation.x = Math.PI / 2;

// South alley partial roof
addMesh('roof_salley',
  new THREE.PlaneGeometry(10, 4),
  matRoof, 6, WALL_HEIGHT - 0.05, 12)
  .rotation.x = Math.PI / 2;

// ─── Spawn Markers ────────────────────────────────────────────────────
const markerMatA = new THREE.MeshStandardMaterial({
  color: 0x335588, roughness: 0.8, name: 'marker_a',
});
const markerMatB = new THREE.MeshStandardMaterial({
  color: 0x885533, roughness: 0.8, name: 'marker_b',
});

addMesh('spawn_marker_a',
  new THREE.RingGeometry(0.8, 1.0, 16),
  markerMatA, -16, 0.01, 0)
  .rotation.x = -Math.PI / 2;

addMesh('spawn_marker_b',
  new THREE.RingGeometry(0.8, 1.0, 16),
  markerMatB, 16, 0.01, 0)
  .rotation.x = -Math.PI / 2;

// ─── Export ───────────────────────────────────────────────────────────
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
