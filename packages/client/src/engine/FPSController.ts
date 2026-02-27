import * as THREE from 'three';
import { EYE_HEIGHT, applyMovement, type PhysicsState } from '@browserstrike/shared';
import { InputManager } from './InputManager';
import { PointerLock } from './PointerLock';
import type { CollisionWorld } from './CollisionWorld';

const DEG2RAD = Math.PI / 180;
const MAX_PITCH = 89 * DEG2RAD;
const MOUSE_SENSITIVITY = 0.002;

/**
 * First-person shooter controller:
 * - Mouse look (yaw / pitch) via Pointer Lock
 * - WASD movement with shared physics (gravity, jump)
 * - AABB collision resolution via CollisionWorld
 */
export class FPSController {
  readonly input: InputManager;
  readonly pointerLock: PointerLock;

  yaw = 0;
  pitch = 0;

  /** World position of the player's feet */
  readonly position = new THREE.Vector3(0, 0, 5);

  private physics: PhysicsState = {
    x: 0, y: 0, z: 5,
    velocityY: 0,
    isGrounded: true,
  };

  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private collisionWorld: CollisionWorld | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ) {
    this.input = new InputManager();
    this.pointerLock = new PointerLock(canvas);
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
  }

  setCollisionWorld(world: CollisionWorld): void {
    this.collisionWorld = world;
  }

  update(dt: number): void {
    this.updateRotation();
    this.updateMovement(dt);
    this.syncCamera();
  }

  private updateRotation(): void {
    if (!this.pointerLock.locked) return;

    const { dx, dy } = this.input.consumeMouseDelta();
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch -= dy * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
  }

  private updateMovement(dt: number): void {
    if (!this.pointerLock.locked) return;

    const { keys } = this.input;

    let forward = 0;
    let right = 0;
    if (keys.w) forward += 1;
    if (keys.s) forward -= 1;
    if (keys.d) right += 1;
    if (keys.a) right -= 1;

    // Sync physics state from position
    this.physics.x = this.position.x;
    this.physics.y = this.position.y;
    this.physics.z = this.position.z;

    // Apply shared movement physics (gravity, jump, horizontal move)
    this.physics = applyMovement(this.physics, {
      forward,
      right,
      jump: keys.space,
      yaw: this.yaw,
    }, dt);

    // Resolve collisions with map geometry
    if (this.collisionWorld) {
      this.physics = this.collisionWorld.resolve(this.physics);
    }

    this.position.set(this.physics.x, this.physics.y, this.physics.z);
  }

  private syncCamera(): void {
    this.camera.position.set(
      this.position.x,
      this.position.y + EYE_HEIGHT,
      this.position.z,
    );
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }

  dispose(): void {
    this.input.dispose();
    this.pointerLock.dispose();
  }
}
