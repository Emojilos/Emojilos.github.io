import * as THREE from 'three';
import { WEAPONS } from '@browserstrike/shared';
import type { WeaponId } from '@browserstrike/shared';

/**
 * First-person weapon model rendered relative to the camera.
 * Uses a separate scene + camera overlay so the weapon never clips into world geometry.
 *
 * Currently implements Desert Eagle (low-poly primitives).
 */
export class WeaponModel {
  /** Overlay scene rendered on top of the main scene */
  readonly scene = new THREE.Scene();
  /** Dedicated camera for the weapon overlay (narrow near plane to avoid clipping) */
  readonly camera: THREE.PerspectiveCamera;

  private readonly weaponGroup = new THREE.Group();

  // Rest position (right-lower corner, classic FPS)
  private readonly restPosition = new THREE.Vector3(0.25, -0.22, -0.45);
  private readonly restRotation = new THREE.Euler(0, 0, 0);

  // Recoil animation state
  private recoilTimer = 0;
  private readonly recoilDuration = 0.12; // seconds for full recoil cycle
  private readonly recoilKickBack = 0.06;
  private readonly recoilKickUp = 0.04;
  private readonly recoilRotation = 0.15; // radians pitch kick

  // Fire state
  private lastFireTime = 0;
  private mouseWasDown = false;
  private readonly weaponId: WeaponId = 'deagle';

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.01, 10);

    // Lighting for weapon scene
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffeedd, 0.8);
    dirLight.position.set(1, 2, 1);
    this.scene.add(dirLight);

    this.buildDeagleModel();
    this.weaponGroup.position.copy(this.restPosition);
    this.scene.add(this.weaponGroup);
  }

  private buildDeagleModel(): void {
    const gunMetal = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.8,
      roughness: 0.3,
    });
    const gripMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.2,
      roughness: 0.8,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0xc0c0c0,
      metalness: 0.9,
      roughness: 0.2,
    });

    // Slide (main upper body) — long box
    const slide = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.22),
      gunMetal,
    );
    slide.position.set(0, 0.02, -0.03);
    this.weaponGroup.add(slide);

    // Barrel extension (slightly wider front)
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.035, 0.06),
      accentMaterial,
    );
    barrel.position.set(0, 0.02, -0.16);
    this.weaponGroup.add(barrel);

    // Muzzle (small cylinder at front)
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.015, 8),
      gunMetal,
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.025, -0.195);
    this.weaponGroup.add(muzzle);

    // Frame / lower receiver
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.025, 0.15),
      gunMetal,
    );
    frame.position.set(0, -0.01, -0.01);
    this.weaponGroup.add(frame);

    // Trigger guard
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.025, 0.04),
      gunMetal,
    );
    guard.position.set(0, -0.025, -0.02);
    this.weaponGroup.add(guard);

    // Trigger
    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, 0.018, 0.006),
      accentMaterial,
    );
    trigger.position.set(0, -0.02, -0.015);
    this.weaponGroup.add(trigger);

    // Grip (angled slightly back)
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.08, 0.035),
      gripMaterial,
    );
    grip.position.set(0, -0.06, 0.03);
    grip.rotation.x = 0.15; // slight angle
    this.weaponGroup.add(grip);

    // Magazine base plate
    const magBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.01, 0.03),
      accentMaterial,
    );
    magBase.position.set(0, -0.1, 0.03);
    this.weaponGroup.add(magBase);

    // Rear sight (small notch on top rear of slide)
    const rearSight = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.008, 0.005),
      accentMaterial,
    );
    rearSight.position.set(0, 0.045, 0.06);
    this.weaponGroup.add(rearSight);

    // Front sight (small post)
    const frontSight = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, 0.01, 0.005),
      accentMaterial,
    );
    frontSight.position.set(0, 0.045, -0.12);
    this.weaponGroup.add(frontSight);
  }

  /**
   * Attempt to fire. Returns true if a shot was fired.
   * Enforces semi-auto (no hold-to-fire) and fire rate.
   */
  tryFire(mouseDown: boolean, now: number): boolean {
    const config = WEAPONS[this.weaponId];

    // Semi-auto: only fire on fresh click (mouseDown && !mouseWasDown)
    const freshClick = mouseDown && !this.mouseWasDown;
    this.mouseWasDown = mouseDown;

    if (!freshClick) return false;

    // Fire rate limiting
    if (now - this.lastFireTime < config.fireRate) return false;

    this.lastFireTime = now;
    this.recoilTimer = this.recoilDuration;
    return true;
  }

  /** Called every frame to animate recoil recovery */
  update(dt: number): void {
    if (this.recoilTimer > 0) {
      this.recoilTimer = Math.max(0, this.recoilTimer - dt);
      const t = this.recoilTimer / this.recoilDuration; // 1→0 as recoil recovers
      // Smooth ease-out for recoil snap, ease-in for recovery
      const kick = Math.sin(t * Math.PI);

      this.weaponGroup.position.set(
        this.restPosition.x,
        this.restPosition.y + this.recoilKickUp * kick,
        this.restPosition.z + this.recoilKickBack * kick,
      );
      this.weaponGroup.rotation.set(
        -this.recoilRotation * kick,
        this.restRotation.y,
        this.restRotation.z,
      );
    } else {
      this.weaponGroup.position.copy(this.restPosition);
      this.weaponGroup.rotation.copy(this.restRotation);
    }
  }

  /** Update overlay camera aspect to match window resize */
  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
