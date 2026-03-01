#!/usr/bin/env node
/**
 * Generate Office GLB map file.
 *
 * Usage:  node scripts/generate-office.mjs
 * Output: packages/client/public/models/maps/office.glb
 *
 * Two-story office building with corridors, rooms, and stairs.
 * Vertical gameplay — Team A spawns ground floor NW, Team B spawns 2nd floor SE.
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
const OUTPUT = path.resolve(__dirname, '../packages/client/public/models/maps/office.glb');

// ─── Constants (mirror shared/constants/mapCollisions.ts OFFICE) ─────
const MAP_SIZE = 40;
const WALL_HEIGHT = 4;
const FLOOR2_Y = 4;
const WALL_T = 0.4;

// ─── Materials (office / industrial theme) ───────────────────────────
const matFloor1 = new THREE.MeshStandardMaterial({
  color: 0x6a6a6a, roughness: 0.9, name: 'floor_concrete',
});
const matFloor2 = new THREE.MeshStandardMaterial({
  color: 0x888070, roughness: 0.85, name: 'floor_carpet',
});
const matFloorTile = new THREE.MeshStandardMaterial({
  color: 0x5a5a5a, roughness: 0.95, name: 'floor_tile',
});
const matWallOuter = new THREE.MeshStandardMaterial({
  color: 0x7a7a7a, roughness: 0.85, name: 'wall_concrete',
});
const matWallInner = new THREE.MeshStandardMaterial({
  color: 0x8a8880, roughness: 0.7, name: 'wall_drywall',
});
const matWallTrim = new THREE.MeshStandardMaterial({
  color: 0x555555, roughness: 0.6, name: 'wall_trim',
});
const matCeiling = new THREE.MeshStandardMaterial({
  color: 0x909090, roughness: 0.9, name: 'ceiling_tile',
});
const matStair = new THREE.MeshStandardMaterial({
  color: 0x606060, roughness: 0.8, name: 'stair_concrete',
});
const matStairTread = new THREE.MeshStandardMaterial({
  color: 0x555050, roughness: 0.7, name: 'stair_tread',
});
const matRailing = new THREE.MeshStandardMaterial({
  color: 0x808890, roughness: 0.4, metalness: 0.5, name: 'railing_metal',
});
const matCrate = new THREE.MeshStandardMaterial({
  color: 0x8b7040, roughness: 0.7, name: 'desk_wood',
});
const matCrateDark = new THREE.MeshStandardMaterial({
  color: 0x5a5a60, roughness: 0.6, name: 'filing_cabinet',
});
const matCrateStrap = new THREE.MeshStandardMaterial({
  color: 0x444444, roughness: 0.5, name: 'desk_edge',
});
const matMetal = new THREE.MeshStandardMaterial({
  color: 0x707888, roughness: 0.4, metalness: 0.6, name: 'metal_frame',
});
const matWindow = new THREE.MeshStandardMaterial({
  color: 0x88aacc, roughness: 0.2, metalness: 0.1, opacity: 0.6,
  transparent: true, name: 'window_glass',
});
const matCollision = new THREE.MeshBasicMaterial({
  color: 0xff00ff, name: 'collision',
});

// ─── Scene ──────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.name = 'office';

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

// ─── Ground Floor ────────────────────────────────────────────────────
addMesh('floor_ground', new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), matFloor1, 0, 0, 0)
  .rotation.x = -Math.PI / 2;

// Floor tile pattern (ground floor)
for (let x = -16; x <= 16; x += 8) {
  addMesh(`floor_tile_x_${x}`,
    new THREE.PlaneGeometry(MAP_SIZE - 1, 0.06), matFloorTile, 0, 0.003, x)
    .rotation.x = -Math.PI / 2;
}

// ─── Second Floor Slab ──────────────────────────────────────────────
// East half (x=0 to x=20)
addMesh('floor_2nd', new THREE.BoxGeometry(20, 0.3, 40), matCeiling, 10, FLOOR2_Y - 0.15, 0);
addCollisionBox('floor_2nd', 20, 0.3, 40, 10, FLOOR2_Y - 0.15, 0);

// 2nd floor carpet
addMesh('floor_2nd_carpet', new THREE.PlaneGeometry(19.5, 39.5), matFloor2, 10, FLOOR2_Y + 0.005, 0)
  .rotation.x = -Math.PI / 2;

// ─── Outer Walls ────────────────────────────────────────────────────
function addOuterWall(name, w, h, d, x, y, z) {
  addMesh(name, new THREE.BoxGeometry(w, h, d), matWallOuter, x, y, z);
  // Base trim
  const trimH = 0.12;
  const isXWall = w > d;
  addMesh(name + '_base',
    new THREE.BoxGeometry(
      isXWall ? w + 0.02 : d + 0.02,
      trimH,
      isXWall ? d + 0.04 : w + 0.04
    ), matWallTrim, x, y - h / 2 + trimH / 2, z);
  addCollisionBox(name, w, h, d, x, y, z);
}

// Ground floor outer walls
addOuterWall('gwall_north', MAP_SIZE, WALL_HEIGHT, WALL_T, 0, WALL_HEIGHT / 2, -20);
addOuterWall('gwall_south', MAP_SIZE, WALL_HEIGHT, WALL_T, 0, WALL_HEIGHT / 2, 20);
addOuterWall('gwall_west', WALL_T, WALL_HEIGHT, MAP_SIZE, -20, WALL_HEIGHT / 2, 0);
addOuterWall('gwall_east', WALL_T, WALL_HEIGHT, MAP_SIZE, 20, WALL_HEIGHT / 2, 0);

// Second floor outer walls
addOuterWall('f2wall_north', MAP_SIZE, WALL_HEIGHT, WALL_T, 0, FLOOR2_Y + WALL_HEIGHT / 2, -20);
addOuterWall('f2wall_south', MAP_SIZE, WALL_HEIGHT, WALL_T, 0, FLOOR2_Y + WALL_HEIGHT / 2, 20);
addOuterWall('f2wall_west', WALL_T, WALL_HEIGHT, MAP_SIZE, -20, FLOOR2_Y + WALL_HEIGHT / 2, 0);
addOuterWall('f2wall_east', WALL_T, WALL_HEIGHT, MAP_SIZE, 20, FLOOR2_Y + WALL_HEIGHT / 2, 0);

// ─── Interior Walls ─────────────────────────────────────────────────
function addInteriorWall(name, w, h, d, x, y, z) {
  addMesh(name, new THREE.BoxGeometry(w, h, d), matWallInner, x, y, z);
  // Top trim strip
  const trimH = 0.08;
  const isXWall = w > d;
  addMesh(name + '_trim',
    new THREE.BoxGeometry(
      isXWall ? w + 0.02 : d + 0.02,
      trimH,
      isXWall ? d + 0.04 : w + 0.04
    ), matWallTrim, x, y + h / 2 - trimH / 2, z);
  addCollisionBox(name, w, h, d, x, y, z);
}

// Ground floor: corridor wall at x=-6 (with gap at z=2..4 for passage)
addInteriorWall('giwall_corr_n', WALL_T, WALL_HEIGHT, 16, -6, WALL_HEIGHT / 2, -12);
addInteriorWall('giwall_corr_s', WALL_T, WALL_HEIGHT, 12, -6, WALL_HEIGHT / 2, 10);

// Ground floor: cross walls creating rooms on west side
addInteriorWall('giwall_div1', 14, WALL_HEIGHT, WALL_T, -13, WALL_HEIGHT / 2, -4);
addInteriorWall('giwall_div2', 10, WALL_HEIGHT, WALL_T, -15, WALL_HEIGHT / 2, 4);

// Ground floor: walls under 2nd floor at x=6
addInteriorWall('giwall_under_n', WALL_T, WALL_HEIGHT, 14, 6, WALL_HEIGHT / 2, -6);
addInteriorWall('giwall_under_s', WALL_T, WALL_HEIGHT, 10, 6, WALL_HEIGHT / 2, 11);

// 2nd floor interior walls
addInteriorWall('f2iwall_div', WALL_T, WALL_HEIGHT, 16, 10, FLOOR2_Y + WALL_HEIGHT / 2, -12);
addInteriorWall('f2iwall_div2', WALL_T, WALL_HEIGHT, 12, 10, FLOOR2_Y + WALL_HEIGHT / 2, 10);
addInteriorWall('f2iwall_cross', 10, WALL_HEIGHT, WALL_T, 15, FLOOR2_Y + WALL_HEIGHT / 2, 0);

// ─── Stairs ─────────────────────────────────────────────────────────
// Main staircase: x=0..3, z=-2..2 (west edge of 2nd floor)
function addStairBlock(name, w, h, d, x, y, z) {
  addMesh(name, new THREE.BoxGeometry(w, h, d), matStair, x, y, z);
  // Tread strip on top
  addMesh(name + '_tread',
    new THREE.BoxGeometry(w + 0.02, 0.05, d + 0.02),
    matStairTread, x, y + h / 2 + 0.025, z);
  addCollisionBox(name, w, h, d, x, y, z);
}

// West staircase (step blocks — ascending AABBs)
addStairBlock('stair_w1', 3, 1.0, 4, 1.5, 0.5, 0);
addStairBlock('stair_w2', 3, 2.0, 4, 1.5, 1.0, 0);
addStairBlock('stair_w3', 3, 3.0, 4, 1.5, 1.5, 0);

// East staircase (x=14, z=0)
addStairBlock('stair_e1', 3, 1.0, 4, 14, 0.5, 0);
addStairBlock('stair_e2', 3, 2.0, 4, 14, 1.0, 0);
addStairBlock('stair_e3', 3, 3.0, 4, 14, 1.5, 0);

// Stair railings (visual only)
function addRailing(name, x, z, length, rotY = 0) {
  // Vertical posts
  for (let i = 0; i <= 1; i++) {
    const offset = (i === 0 ? -length / 2 + 0.1 : length / 2 - 0.1);
    const postX = x + (rotY === 0 ? offset : 0);
    const postZ = z + (rotY !== 0 ? offset : 0);
    addMesh(name + `_post_${i}`,
      new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4),
      matRailing, postX, FLOOR2_Y + 0.5, postZ);
  }
  // Horizontal bar
  const bar = addMesh(name + '_bar',
    new THREE.CylinderGeometry(0.03, 0.03, length, 4),
    matRailing, x, FLOOR2_Y + 1.0, z);
  bar.rotation.z = Math.PI / 2;
  if (rotY !== 0) {
    bar.rotation.z = 0;
    bar.rotation.x = Math.PI / 2;
  }
}

// Railings along 2nd floor open edge (x=0 side, where you look down)
addRailing('rail_n', 0.2, -10, 16);
addRailing('rail_s', 0.2, 10, 16);

// ─── Crates / Desks / Filing Cabinets ───────────────────────────────
function addCrate(name, w, h, d, x, z, baseY = 0, dark = false) {
  const mat = dark ? matCrateDark : matCrate;
  const y = baseY + h / 2;
  addMesh(name, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  // Edge strip
  addMesh(name + '_edge',
    new THREE.BoxGeometry(w + 0.02, 0.04, d + 0.02),
    matCrateStrap, x, baseY + h - 0.02, z);
  addCollisionBox(name, w, h, d, x, y, z);
}

// Ground floor west rooms
addCrate('desk_nw1', 1.5, 1.0, 1.5, -14, -14);
addCrate('desk_nw2', 2, 1.2, 1, -10, -8, 0, true);
addCrate('desk_sw1', 1.5, 1.0, 2, -14, 8);
addCrate('desk_sw2', 1, 1.5, 1, -18, 14, 0, true);

// Ground floor east (under 2nd floor)
addCrate('crate_ne', 2, 1.0, 2, 14, -14, 0, true);
addCrate('crate_se', 1.5, 1.2, 1.5, 10, 14);

// Second floor
addCrate('desk_f2_ne', 2, 1.0, 1, 16, -10, FLOOR2_Y, true);
addCrate('desk_f2_se', 1.5, 1.2, 1.5, 12, 10, FLOOR2_Y);
addCrate('desk_f2_ledge1', 1, 1.0, 2, 4, -16, FLOOR2_Y, true);
addCrate('desk_f2_ledge2', 1.5, 1.0, 1.5, 4, 16, FLOOR2_Y);

// ─── Ceiling (ground floor west side — open to sky on east where 2nd floor exists) ──
addMesh('ceiling_gf_west',
  new THREE.PlaneGeometry(20, MAP_SIZE), matCeiling, -10, FLOOR2_Y - 0.01, 0)
  .rotation.x = Math.PI / 2;

// 2nd floor ceiling
addMesh('ceiling_2nd',
  new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), matCeiling, 0, FLOOR2_Y + WALL_HEIGHT, 0)
  .rotation.x = Math.PI / 2;

// ─── Window frames on outer walls (visual detail) ───────────────────
function addWindow(name, x, y, z, rotY = 0) {
  // Frame
  const frame = addMesh(name + '_frame',
    new THREE.BoxGeometry(2.0, 1.2, 0.1), matMetal, x, y, z);
  frame.rotation.y = rotY;
  // Glass pane
  const glass = addMesh(name + '_glass',
    new THREE.PlaneGeometry(1.8, 1.0), matWindow, x, y, z + (rotY === 0 ? 0.06 : 0));
  glass.rotation.y = rotY;
  if (rotY !== 0) {
    glass.position.x = x + 0.06 * Math.cos(rotY + Math.PI / 2);
    glass.position.z = z + 0.06 * Math.sin(rotY + Math.PI / 2);
  }
}

// Ground floor windows (south wall)
addWindow('win_gs1', -10, 2.2, 19.7);
addWindow('win_gs2', -4, 2.2, 19.7);
// 2nd floor windows (north wall)
addWindow('win_f2n1', 6, FLOOR2_Y + 2.2, -19.7);
addWindow('win_f2n2', 14, FLOOR2_Y + 2.2, -19.7);
// West wall windows
addWindow('win_gw1', -19.7, 2.2, -10, Math.PI / 2);
addWindow('win_gw2', -19.7, 2.2, 10, Math.PI / 2);

// ─── Overhead Lights ────────────────────────────────────────────────
function addLight(name, x, y, z) {
  addMesh(name,
    new THREE.BoxGeometry(1.0, 0.08, 0.3), matMetal, x, y - 0.12, z);
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 0.3, name: 'light_panel',
  });
  addMesh(name + '_panel',
    new THREE.PlaneGeometry(0.8, 0.2), lightMat, x, y - 0.17, z)
    .rotation.x = Math.PI / 2;
}

// Ground floor lights
addLight('light_gf1', -14, FLOOR2_Y, -12);
addLight('light_gf2', -14, FLOOR2_Y, 12);
addLight('light_gf3', 10, FLOOR2_Y, -12);
addLight('light_gf4', 10, FLOOR2_Y, 12);
// 2nd floor lights
addLight('light_f2_1', 6, FLOOR2_Y + WALL_HEIGHT, -10);
addLight('light_f2_2', 6, FLOOR2_Y + WALL_HEIGHT, 10);
addLight('light_f2_3', 16, FLOOR2_Y + WALL_HEIGHT, -10);
addLight('light_f2_4', 16, FLOOR2_Y + WALL_HEIGHT, 10);

// ─── Support Pillars (structural columns) ───────────────────────────
function addPillar(name, x, z) {
  const pillarR = 0.18;
  const pillarH = WALL_HEIGHT;
  addMesh(name,
    new THREE.CylinderGeometry(pillarR, pillarR, pillarH, 6),
    matMetal, x, pillarH / 2, z);
}

// Pillars along 2nd floor edge
addPillar('pillar_1', 0.2, -16);
addPillar('pillar_2', 0.2, -8);
addPillar('pillar_3', 0.2, 8);
addPillar('pillar_4', 0.2, 16);

// ─── Spawn Markers ──────────────────────────────────────────────────
const markerMatA = new THREE.MeshStandardMaterial({
  color: 0x335588, roughness: 0.8, name: 'marker_a',
});
const markerMatB = new THREE.MeshStandardMaterial({
  color: 0x885533, roughness: 0.8, name: 'marker_b',
});

// Team A: ground floor NW
addMesh('spawn_marker_a',
  new THREE.RingGeometry(0.8, 1.0, 16),
  markerMatA, -16, 0.01, -16)
  .rotation.x = -Math.PI / 2;

// Team B: 2nd floor SE
addMesh('spawn_marker_b',
  new THREE.RingGeometry(0.8, 1.0, 16),
  markerMatB, 16, FLOOR2_Y + 0.01, 16)
  .rotation.x = -Math.PI / 2;

// ─── Export ──────────────────────────────────────────────────────────
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
