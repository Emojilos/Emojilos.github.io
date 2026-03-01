import * as THREE from 'three';
import { PLAYER_HEIGHT, EYE_HEIGHT } from '@browserstrike/shared';
import type { WeaponId } from '@browserstrike/shared';
import { InterpolationBuffer } from './InterpolationBuffer';

// ── Humanoid body proportions ──────────────────────────────

const HEAD_RADIUS = 0.16;
const HEAD_Y = 1.55; // center of head sphere from feet

const TORSO_W = 0.36; // width (x)
const TORSO_H = 0.45; // height (y)
const TORSO_D = 0.20; // depth (z)
const TORSO_Y = 1.10; // center-y from feet

const ARM_RADIUS = 0.06;
const ARM_LENGTH = 0.45;
const ARM_Y = 1.18; // shoulder height
const ARM_X = TORSO_W / 2 + ARM_RADIUS + 0.01; // outside torso

const LEG_RADIUS = 0.07;
const LEG_LENGTH = 0.50;
const LEG_Y = 0.45; // hip center
const LEG_X = 0.10; // offset from center

// ── Shared geometries (reused across all humanoids) ────────

let _sharedGeo: SharedGeometries | null = null;

interface SharedGeometries {
  head: THREE.SphereGeometry;
  torso: THREE.BoxGeometry;
  arm: THREE.CylinderGeometry;
  leg: THREE.CylinderGeometry;
  // Simplified weapon shapes
  deagleParts: THREE.BufferGeometry[];
  ssg08Parts: THREE.BufferGeometry[];
  mp9Parts: THREE.BufferGeometry[];
}

function getSharedGeometries(): SharedGeometries {
  if (_sharedGeo) return _sharedGeo;

  _sharedGeo = {
    head: new THREE.SphereGeometry(HEAD_RADIUS, 8, 6),
    torso: new THREE.BoxGeometry(TORSO_W, TORSO_H, TORSO_D),
    arm: new THREE.CylinderGeometry(ARM_RADIUS, ARM_RADIUS, ARM_LENGTH, 6),
    leg: new THREE.CylinderGeometry(LEG_RADIUS, LEG_RADIUS, LEG_LENGTH, 6),
    // Weapon geometries — simplified 3rd-person versions
    deagleParts: [
      new THREE.BoxGeometry(0.04, 0.08, 0.18), // slide
      new THREE.BoxGeometry(0.03, 0.10, 0.03), // grip
    ],
    ssg08Parts: [
      new THREE.CylinderGeometry(0.015, 0.015, 0.50, 5), // barrel
      new THREE.BoxGeometry(0.04, 0.06, 0.14), // receiver
      new THREE.BoxGeometry(0.03, 0.06, 0.16), // stock
    ],
    mp9Parts: [
      new THREE.BoxGeometry(0.04, 0.06, 0.20), // body
      new THREE.BoxGeometry(0.025, 0.12, 0.025), // magazine
    ],
  };

  return _sharedGeo;
}

// ── Weapon mesh builders ───────────────────────────────────

const WEAPON_COLOR = 0x333333; // dark grey for weapons

function buildWeaponGroup(weaponId: WeaponId): THREE.Group {
  const geo = getSharedGeometries();
  const mat = new THREE.MeshLambertMaterial({ color: WEAPON_COLOR });
  const group = new THREE.Group();

  if (weaponId === 'deagle') {
    const slide = new THREE.Mesh(geo.deagleParts[0], mat);
    slide.position.set(0, 0, -0.09);
    group.add(slide);
    const grip = new THREE.Mesh(geo.deagleParts[1], mat);
    grip.position.set(0, -0.06, 0);
    group.add(grip);
  } else if (weaponId === 'ssg08') {
    const barrel = new THREE.Mesh(geo.ssg08Parts[0], mat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.25);
    group.add(barrel);
    const receiver = new THREE.Mesh(geo.ssg08Parts[1], mat);
    group.add(receiver);
    const stock = new THREE.Mesh(geo.ssg08Parts[2], mat);
    stock.position.set(0, 0, 0.15);
    group.add(stock);
  } else if (weaponId === 'mp9') {
    const body = new THREE.Mesh(geo.mp9Parts[0], mat);
    body.position.set(0, 0, -0.05);
    group.add(body);
    const mag = new THREE.Mesh(geo.mp9Parts[1], mat);
    mag.position.set(0, -0.07, 0.02);
    group.add(mag);
  }

  return group;
}

// ── Remote player data ─────────────────────────────────────

interface RemotePlayer {
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  weaponGroup: THREE.Group;
  currentWeapon: WeaponId;
  team: string;
  interpolation: InterpolationBuffer;
  // Walking animation
  prevX: number;
  prevZ: number;
  walkPhase: number;
  speed: number; // smoothed speed for animation blending
  // Spatial footstep tracking
  footstepAccum: number;
}

const TEAM_COLORS: Record<string, number> = {
  A: 0x4488ff, // blue
  B: 0xff4444, // red
  unassigned: 0x888888, // grey
};

const WALK_SWING = 0.45; // max leg/arm swing angle (radians)
const WALK_FREQUENCY = 8; // swing cycles per unit of movement
const SPEED_SMOOTH = 12; // how fast speed ramps up/down

/** Callback for spatial footstep audio. */
export type SpatialFootstepCallback = (x: number, y: number, z: number) => void;

/**
 * Manages Three.js representations of remote (non-local) players.
 * Renders low-poly humanoid figures with team colors, walking animation,
 * and weapon in hand.
 */
export class RemotePlayerManager {
  private players = new Map<string, RemotePlayer>();
  private onSpatialFootstep: SpatialFootstepCallback | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly localSessionId: string,
  ) {}

  /** Register a callback for spatial footstep sounds from remote players. */
  setSpatialFootstepCallback(cb: SpatialFootstepCallback): void {
    this.onSpatialFootstep = cb;
  }

  /** Add a remote player humanoid to the scene. */
  addPlayer(sessionId: string, team: string): void {
    if (sessionId === this.localSessionId) return;
    if (this.players.has(sessionId)) return;

    const color = TEAM_COLORS[team] ?? TEAM_COLORS.unassigned;
    const geo = getSharedGeometries();

    // Slightly lighter shade for head to differentiate
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const headMat = new THREE.MeshLambertMaterial({ color });

    // Head
    const head = new THREE.Mesh(geo.head, headMat);
    head.position.y = HEAD_Y;
    head.castShadow = true;

    // Torso
    const torso = new THREE.Mesh(geo.torso, bodyMat.clone());
    torso.position.y = TORSO_Y;
    torso.castShadow = true;

    // Arms
    const armMat = bodyMat.clone();
    // Slightly darker arms for visual depth
    armMat.color.multiplyScalar(0.85);

    const armL = new THREE.Mesh(geo.arm, armMat);
    armL.position.set(-ARM_X, ARM_Y, 0);
    armL.castShadow = true;

    const armR = new THREE.Mesh(geo.arm, armMat.clone());
    armR.position.set(ARM_X, ARM_Y, 0);
    armR.castShadow = true;

    // Legs
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a }); // dark pants

    const legL = new THREE.Mesh(geo.leg, legMat);
    legL.position.set(-LEG_X, LEG_Y, 0);
    legL.castShadow = true;

    const legR = new THREE.Mesh(geo.leg, legMat.clone());
    legR.position.set(LEG_X, LEG_Y, 0);
    legR.castShadow = true;

    // Weapon in right hand
    const weaponGroup = buildWeaponGroup('deagle');
    weaponGroup.position.set(ARM_X, ARM_Y - ARM_LENGTH / 2, -0.12);
    weaponGroup.castShadow = true;

    const group = new THREE.Group();
    group.add(head);
    group.add(torso);
    group.add(armL);
    group.add(armR);
    group.add(legL);
    group.add(legR);
    group.add(weaponGroup);
    this.scene.add(group);

    this.players.set(sessionId, {
      group,
      head,
      torso,
      armL,
      armR,
      legL,
      legR,
      weaponGroup,
      currentWeapon: 'deagle',
      team,
      interpolation: new InterpolationBuffer(),
      prevX: 0,
      prevZ: 0,
      walkPhase: 0,
      speed: 0,
      footstepAccum: 0,
    });
  }

  /** Remove a remote player from the scene. */
  removePlayer(sessionId: string): void {
    const rp = this.players.get(sessionId);
    if (!rp) return;

    this.scene.remove(rp.group);
    // Dispose materials (geometries are shared — don't dispose them)
    rp.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    });
    rp.interpolation.clear();

    this.players.delete(sessionId);
  }

  /**
   * Push a new server snapshot for a remote player.
   * Called on every Colyseus state change.
   */
  pushSnapshot(
    sessionId: string,
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    team: string,
    currentWeapon?: WeaponId,
  ): void {
    if (sessionId === this.localSessionId) return;

    const rp = this.players.get(sessionId);
    if (!rp) return;

    rp.interpolation.push(x, y, z, yaw, pitch);

    // Update colour if team changed
    if (rp.team !== team) {
      rp.team = team;
      this.recolorPlayer(rp, team);
    }

    // Update weapon model if changed
    if (currentWeapon && currentWeapon !== rp.currentWeapon) {
      this.updatePlayerWeapon(rp, currentWeapon);
    }
  }

  /** Recolor all body parts when team changes. */
  private recolorPlayer(rp: RemotePlayer, team: string): void {
    const color = TEAM_COLORS[team] ?? TEAM_COLORS.unassigned;
    (rp.head.material as THREE.MeshLambertMaterial).color.setHex(color);
    (rp.torso.material as THREE.MeshLambertMaterial).color.setHex(color);

    const armColor = new THREE.Color(color).multiplyScalar(0.85);
    (rp.armL.material as THREE.MeshLambertMaterial).color.copy(armColor);
    (rp.armR.material as THREE.MeshLambertMaterial).color.copy(armColor);
  }

  /** Swap the weapon model held by a remote player. */
  private updatePlayerWeapon(rp: RemotePlayer, weaponId: WeaponId): void {
    // Remove old weapon meshes
    rp.group.remove(rp.weaponGroup);
    rp.weaponGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        ((child as THREE.Mesh).material as THREE.Material).dispose();
      }
    });

    // Build new weapon
    const newWeapon = buildWeaponGroup(weaponId);
    newWeapon.position.set(ARM_X, ARM_Y - ARM_LENGTH / 2, -0.12);
    rp.group.add(newWeapon);
    rp.weaponGroup = newWeapon;
    rp.currentWeapon = weaponId;
  }

  /**
   * Tick interpolation and walking animation for all remote players.
   * Called every frame from the render loop.
   */
  updateInterpolation(dt?: number): void {
    const frameDt = dt ?? 0.016; // fallback 60fps

    for (const rp of this.players.values()) {
      const interp = rp.interpolation.getInterpolated();
      if (!interp) continue;

      rp.group.position.set(interp.x, interp.y, interp.z);
      rp.group.rotation.y = interp.yaw;

      // Head pitch (look up/down)
      rp.head.rotation.x = interp.pitch;

      // ── Walking animation ──
      const dx = interp.x - rp.prevX;
      const dz = interp.z - rp.prevZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      // Instantaneous speed from position delta
      const instantSpeed = frameDt > 0 ? dist / frameDt : 0;
      // Smooth speed to avoid jitter
      rp.speed += (instantSpeed - rp.speed) * Math.min(1, SPEED_SMOOTH * frameDt);

      rp.prevX = interp.x;
      rp.prevZ = interp.z;

      // Only animate when moving above threshold
      const isMoving = rp.speed > 0.3;

      // Spatial footstep sounds
      if (isMoving && this.onSpatialFootstep) {
        rp.footstepAccum += frameDt;
        if (rp.footstepAccum >= 0.4) {
          rp.footstepAccum -= 0.4;
          this.onSpatialFootstep(interp.x, interp.y, interp.z);
        }
      } else {
        rp.footstepAccum = 0;
      }

      if (isMoving) {
        rp.walkPhase += dist * WALK_FREQUENCY;
        const swing = Math.sin(rp.walkPhase) * WALK_SWING * Math.min(rp.speed / 4, 1);

        // Legs swing opposite
        rp.legL.rotation.x = swing;
        rp.legR.rotation.x = -swing;

        // Arms swing opposite to legs (natural walking)
        rp.armL.rotation.x = -swing * 0.6;
        rp.armR.rotation.x = swing * 0.6;

        // Weapon follows right arm
        rp.weaponGroup.rotation.x = swing * 0.6;
      } else {
        // Smoothly return to rest pose
        rp.legL.rotation.x *= 0.85;
        rp.legR.rotation.x *= 0.85;
        rp.armL.rotation.x *= 0.85;
        rp.armR.rotation.x *= 0.85;
        rp.weaponGroup.rotation.x *= 0.85;
      }
    }
  }

  /** Get the interpolated transform of a specific remote player (for spectating). */
  getInterpolatedTransform(sessionId: string): { x: number; y: number; z: number; yaw: number; pitch: number } | null {
    const rp = this.players.get(sessionId);
    if (!rp) return null;
    return rp.interpolation.getInterpolated();
  }

  /** Clear all interpolation buffers (e.g. on round reset). */
  clearBuffers(): void {
    for (const rp of this.players.values()) {
      rp.interpolation.clear();
      rp.speed = 0;
      rp.walkPhase = 0;
    }
  }

  /** Dispose all remote player meshes. */
  dispose(): void {
    for (const [id] of this.players) {
      this.removePlayer(id);
    }
  }
}
