import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_RADIUS, EYE_HEIGHT } from '@browserstrike/shared';
import { InterpolationBuffer } from './InterpolationBuffer';

interface RemotePlayer {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  /** Last known team for colour updates */
  team: string;
  /** Snapshot buffer for smooth interpolation */
  interpolation: InterpolationBuffer;
}

const TEAM_COLORS: Record<string, number> = {
  A: 0x4488ff, // blue
  B: 0xff4444, // red
  unassigned: 0x888888, // grey
};

/**
 * Manages Three.js representations of remote (non-local) players.
 * Spawns/despawns capsule meshes and updates their transforms from
 * Colyseus PlayerSchema data via interpolation buffers.
 */
export class RemotePlayerManager {
  private players = new Map<string, RemotePlayer>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly localSessionId: string,
  ) {}

  /** Add a remote player capsule to the scene. */
  addPlayer(sessionId: string, team: string): void {
    if (sessionId === this.localSessionId) return;
    if (this.players.has(sessionId)) return;

    const color = TEAM_COLORS[team] ?? TEAM_COLORS.unassigned;
    const mat = new THREE.MeshLambertMaterial({ color });

    // Body — cylinder (capsule approximation)
    const bodyHeight = PLAYER_HEIGHT - PLAYER_RADIUS * 2;
    const bodyGeo = new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, bodyHeight, 8);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = PLAYER_RADIUS + bodyHeight / 2;
    body.castShadow = true;

    // Head — sphere
    const headGeo = new THREE.SphereGeometry(PLAYER_RADIUS, 8, 6);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = EYE_HEIGHT;
    head.castShadow = true;

    const group = new THREE.Group();
    group.add(body);
    group.add(head);
    this.scene.add(group);

    this.players.set(sessionId, {
      group,
      body,
      head,
      team,
      interpolation: new InterpolationBuffer(),
    });
  }

  /** Remove a remote player from the scene. */
  removePlayer(sessionId: string): void {
    const rp = this.players.get(sessionId);
    if (!rp) return;

    this.scene.remove(rp.group);
    rp.body.geometry.dispose();
    rp.head.geometry.dispose();
    (rp.body.material as THREE.Material).dispose();
    (rp.head.material as THREE.Material).dispose();
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
  ): void {
    if (sessionId === this.localSessionId) return;

    const rp = this.players.get(sessionId);
    if (!rp) return;

    rp.interpolation.push(x, y, z, yaw, pitch);

    // Update colour if team changed
    if (rp.team !== team) {
      rp.team = team;
      const color = TEAM_COLORS[team] ?? TEAM_COLORS.unassigned;
      (rp.body.material as THREE.MeshLambertMaterial).color.setHex(color);
      (rp.head.material as THREE.MeshLambertMaterial).color.setHex(color);
    }
  }

  /**
   * Tick interpolation for all remote players.
   * Called every frame from the render loop.
   */
  updateInterpolation(): void {
    for (const rp of this.players.values()) {
      const interp = rp.interpolation.getInterpolated();
      if (interp) {
        rp.group.position.set(interp.x, interp.y, interp.z);
        rp.group.rotation.y = interp.yaw;
      }
    }
  }

  /** Clear all interpolation buffers (e.g. on round reset). */
  clearBuffers(): void {
    for (const rp of this.players.values()) {
      rp.interpolation.clear();
    }
  }

  /** Dispose all remote player meshes. */
  dispose(): void {
    for (const [id] of this.players) {
      this.removePlayer(id);
    }
  }
}
