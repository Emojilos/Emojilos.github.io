import * as THREE from 'three';
import { PLAYER_SPEED, EYE_HEIGHT } from '@browserstrike/shared';
import { InputManager } from './InputManager';
import { PointerLock } from './PointerLock';

const DEG2RAD = Math.PI / 180;
const MAX_PITCH = 89 * DEG2RAD;
const MOUSE_SENSITIVITY = 0.002;

/**
 * First-person shooter controller:
 * - Mouse look (yaw / pitch) via Pointer Lock
 * - WASD movement relative to camera facing direction
 * - Diagonal movement normalized to prevent speed boost
 */
export class FPSController {
  readonly input: InputManager;
  readonly pointerLock: PointerLock;

  /** Yaw (horizontal rotation) in radians, 0 = looking along -Z */
  yaw = 0;
  /** Pitch (vertical rotation) in radians, clamped to ±89° */
  pitch = 0;

  /** World position of the player's feet */
  readonly position = new THREE.Vector3(0, 0, 5);

  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly moveDir = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ) {
    this.input = new InputManager();
    this.pointerLock = new PointerLock(canvas);

    // Set initial camera position
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
  }

  /**
   * Call once per frame with the frame delta time (seconds).
   */
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

    // Clamp pitch to ±89°
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
  }

  private updateMovement(dt: number): void {
    if (!this.pointerLock.locked) return;

    const { keys } = this.input;

    // Build movement vector in local space (forward = -Z, right = +X)
    let mx = 0;
    let mz = 0;
    if (keys.w) mz -= 1;
    if (keys.s) mz += 1;
    if (keys.a) mx -= 1;
    if (keys.d) mx += 1;

    if (mx === 0 && mz === 0) return;

    // Normalize diagonal movement
    this.moveDir.set(mx, 0, mz).normalize();

    // Rotate movement direction by yaw (horizontal only)
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const worldX = this.moveDir.x * cosYaw + this.moveDir.z * sinYaw;
    const worldZ = -this.moveDir.x * sinYaw + this.moveDir.z * cosYaw;

    const speed = PLAYER_SPEED * dt;
    this.position.x += worldX * speed;
    this.position.z += worldZ * speed;
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
