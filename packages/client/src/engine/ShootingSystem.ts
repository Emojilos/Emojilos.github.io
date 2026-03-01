import * as THREE from 'three';
import { WEAPONS, EYE_HEIGHT } from '@browserstrike/shared';
import type { WeaponId, ShootMessage } from '@browserstrike/shared';
import { ObjectPool } from './ObjectPool';

const MUZZLE_FLASH_DURATION = 0.05; // 50ms
const TRACER_FADE_DURATION = 0.15; // 150ms
const MAX_DECALS = 64;
const MAX_TRACERS = 32;
const DECAL_OFFSET = 0.01; // slight offset from wall surface

interface Tracer {
  line: THREE.Line;
  age: number;
  maxAge: number;
}

/**
 * Client-side shooting system:
 * - Raycasts from camera on fire
 * - Applies weapon spread (base + moving + sustained)
 * - Visual effects: muzzle flash, tracer lines, wall decals
 * - Optimistic ammo tracking with reload state machine
 * - Sends ShootMessage / ReloadMessage to server
 */
export class ShootingSystem {
  private readonly raycaster = new THREE.Raycaster();
  private readonly scene: THREE.Scene;

  // Muzzle flash
  private readonly muzzleLight: THREE.PointLight;
  private muzzleFlashTimer = 0;

  // Tracers — pooled to avoid GC spikes during rapid fire
  private readonly activeTracers: Tracer[] = [];
  private readonly tracerPool: ObjectPool<Tracer>;
  private readonly tracerGeomPool: ObjectPool<THREE.BufferGeometry>;

  // Decals (ring buffer with shared material)
  private readonly decalMeshes: THREE.Mesh[] = [];
  private decalIndex = 0;
  private readonly decalGeometry = new THREE.CircleGeometry(0.03, 8);
  private readonly decalMaterial = new THREE.MeshBasicMaterial({
    color: 0x222222,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Ammo state (optimistic client-side)
  private ammo: number;
  private magazineSize: number;

  // Reload state
  private _isReloading = false;
  private reloadTimer = 0;
  private reloadTime: number; // seconds

  // Spread tracking
  private consecutiveShots = 0;
  private lastShotTime = 0;
  private readonly SPREAD_RESET_TIME = 300; // ms before spread resets

  // Current weapon
  private weaponId: WeaponId;

  // Callbacks to send messages to server
  private sendShoot: ((msg: ShootMessage) => void) | null = null;
  private sendReload: (() => void) | null = null;
  private onReloadStart: (() => void) | null = null;
  private seq = 0;

  constructor(scene: THREE.Scene, weaponId: WeaponId = 'deagle') {
    this.scene = scene;
    this.weaponId = weaponId;

    const config = WEAPONS[this.weaponId];
    this.ammo = config.magazine;
    this.magazineSize = config.magazine;
    this.reloadTime = config.reloadTime / 1000; // convert ms to seconds

    // Raycaster range
    this.raycaster.far = config.range;

    // Muzzle flash light (initially off)
    this.muzzleLight = new THREE.PointLight(0xffaa00, 0, 8);
    this.scene.add(this.muzzleLight);

    // Tracer geometry pool — reuse BufferGeometry objects
    this.tracerGeomPool = new ObjectPool<THREE.BufferGeometry>(
      () => new THREE.BufferGeometry(),
      (geom) => { /* reset happens on setFromPoints */ },
      MAX_TRACERS,
    );

    // Tracer pool — pre-allocate Line objects with shared material
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 1 });
    this.tracerPool = new ObjectPool<Tracer>(
      () => {
        const geom = this.tracerGeomPool.acquire();
        const mat = tracerMat.clone();
        const line = new THREE.Line(geom, mat);
        line.userData.isEffect = true;
        line.frustumCulled = false;
        return { line, age: 0, maxAge: TRACER_FADE_DURATION };
      },
      (t) => {
        t.age = 0;
        (t.line.material as THREE.LineBasicMaterial).opacity = 1;
        t.line.visible = false;
      },
      MAX_TRACERS,
    );
    tracerMat.dispose(); // only used as template for clones
  }

  setSendCallback(cb: (msg: ShootMessage) => void): void {
    this.sendShoot = cb;
  }

  setReloadCallback(cb: () => void): void {
    this.sendReload = cb;
  }

  setOnReloadStart(cb: () => void): void {
    this.onReloadStart = cb;
  }

  /** Start a reload if not already reloading and magazine is not full. */
  startReload(): boolean {
    if (this._isReloading) return false;
    if (this.ammo >= this.magazineSize) return false;

    this._isReloading = true;
    this.reloadTimer = this.reloadTime;

    // Notify server
    this.sendReload?.();
    // Audio callback (for auto-reload triggered internally)
    this.onReloadStart?.();

    return true;
  }

  /** Cancel an in-progress reload (e.g. on weapon switch). */
  cancelReload(): void {
    this._isReloading = false;
    this.reloadTimer = 0;
  }

  /** Switch to a different weapon — resets ammo, reload, and spread. */
  switchWeapon(newWeaponId: WeaponId): void {
    if (newWeaponId === this.weaponId) return;
    this.weaponId = newWeaponId;
    const config = WEAPONS[newWeaponId];
    this.ammo = config.magazine;
    this.magazineSize = config.magazine;
    this.reloadTime = config.reloadTime / 1000;
    this.raycaster.far = config.range;
    this.cancelReload();
    this.consecutiveShots = 0;
  }

  /** Complete the reload — refill magazine. */
  private completeReload(): void {
    this._isReloading = false;
    this.reloadTimer = 0;
    this.ammo = this.magazineSize;
  }

  /** Sync ammo from server state (authoritative override). */
  syncAmmo(serverAmmo: number, serverIsReloading: boolean): void {
    this.ammo = serverAmmo;
    // If server says we're not reloading but client thinks we are, trust server
    if (!serverIsReloading && this._isReloading) {
      this._isReloading = false;
      this.reloadTimer = 0;
    }
  }

  /**
   * Called when WeaponModel.tryFire() returns true.
   * Performs raycast, creates effects, sends network message.
   * Returns true if shot was actually fired (has ammo).
   */
  fire(
    playerPosition: THREE.Vector3,
    yaw: number,
    pitch: number,
    isMoving: boolean,
  ): boolean {
    if (this._isReloading) return false;
    if (this.ammo <= 0) return false;

    this.ammo--;

    const config = WEAPONS[this.weaponId];
    const now = performance.now();

    // Track consecutive shots for sustained spread
    if (now - this.lastShotTime > this.SPREAD_RESET_TIME) {
      this.consecutiveShots = 0;
    }
    this.consecutiveShots++;
    this.lastShotTime = now;

    // Calculate spread
    let spread = config.spread.base;
    if (isMoving) {
      spread = config.spread.moving;
    }
    spread += config.spread.sustained * this.consecutiveShots;

    // Build ray origin (eye position)
    const origin = new THREE.Vector3(
      playerPosition.x,
      playerPosition.y + EYE_HEIGHT,
      playerPosition.z,
    );

    // Build ray direction from yaw/pitch + spread offset
    const direction = new THREE.Vector3(0, 0, -1);
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    direction.applyEuler(euler);

    // Apply spread as random angular offset
    if (spread > 0) {
      const spreadAngle = (Math.random() - 0.5) * 2 * spread;
      const spreadAngle2 = (Math.random() - 0.5) * 2 * spread;
      const spreadEuler = new THREE.Euler(spreadAngle2, spreadAngle, 0);
      direction.applyEuler(spreadEuler);
    }
    direction.normalize();

    // Raycast against world geometry (scene objects)
    this.raycaster.set(origin, direction);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    // Find first valid hit (skip our own effects)
    let hitPoint: THREE.Vector3 | null = null;
    let hitNormal: THREE.Vector3 | null = null;

    for (const hit of intersects) {
      if (hit.object.userData.isEffect) continue;
      hitPoint = hit.point;
      hitNormal = hit.face?.normal ?? null;
      // Transform normal from object-local to world space
      if (hitNormal && hit.object.matrixWorld) {
        hitNormal = hitNormal.clone().transformDirection(hit.object.matrixWorld);
      }
      break;
    }

    // If no hit, use max range point
    const endPoint = hitPoint ?? origin.clone().addScaledVector(direction, config.range);

    // Muzzle flash
    this.muzzleLight.position.copy(origin).addScaledVector(direction, 0.5);
    this.muzzleLight.intensity = 3;
    this.muzzleFlashTimer = MUZZLE_FLASH_DURATION;

    // Tracer line
    this.createTracer(origin, endPoint);

    // Decal on wall (only if we hit something with a face normal)
    if (hitPoint && hitNormal) {
      this.createDecal(hitPoint, hitNormal);
    }

    // Send shoot message to server
    this.seq++;
    if (this.sendShoot) {
      this.sendShoot({
        seq: this.seq,
        timestamp: now,
        origin: { x: origin.x, y: origin.y, z: origin.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
      });
    }

    return true;
  }

  private createTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const tracer = this.tracerPool.acquire();
    tracer.line.geometry.setFromPoints([from, to]);
    tracer.line.visible = true;
    tracer.age = 0;
    (tracer.line.material as THREE.LineBasicMaterial).opacity = 1;

    if (!tracer.line.parent) {
      this.scene.add(tracer.line);
    }

    this.activeTracers.push(tracer);
  }

  private createDecal(point: THREE.Vector3, normal: THREE.Vector3): void {
    // Ring buffer: reuse existing decal mesh if at capacity
    if (this.decalMeshes.length >= MAX_DECALS) {
      const mesh = this.decalMeshes[this.decalIndex];
      mesh.position.copy(point).addScaledVector(normal, DECAL_OFFSET);
      mesh.lookAt(point.clone().add(normal));
      mesh.visible = true;
    } else {
      // Shared material — decals are identical, no need for per-instance clone
      const mesh = new THREE.Mesh(this.decalGeometry, this.decalMaterial);
      mesh.userData.isEffect = true;
      mesh.position.copy(point).addScaledVector(normal, DECAL_OFFSET);
      mesh.lookAt(point.clone().add(normal));
      this.scene.add(mesh);
      this.decalMeshes.push(mesh);
    }
    this.decalIndex = (this.decalIndex + 1) % MAX_DECALS;
  }

  /** Update per frame — fade tracers, muzzle flash, reload timer. */
  update(dt: number): void {
    // Muzzle flash fade
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }

    // Reload timer
    if (this._isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.completeReload();
      }
    }

    // Auto-reload when magazine is empty and not already reloading
    if (this.ammo <= 0 && !this._isReloading) {
      this.startReload();
    }

    // Tracer fade + return to pool
    let writeIdx = 0;
    for (let i = 0; i < this.activeTracers.length; i++) {
      const t = this.activeTracers[i];
      t.age += dt;
      if (t.age >= t.maxAge) {
        t.line.visible = false;
        this.tracerPool.release(t);
      } else {
        (t.line.material as THREE.LineBasicMaterial).opacity = 1 - t.age / t.maxAge;
        this.activeTracers[writeIdx++] = t;
      }
    }
    this.activeTracers.length = writeIdx;
  }

  getAmmo(): number {
    return this.ammo;
  }

  getMagazineSize(): number {
    return this.magazineSize;
  }

  getIsReloading(): boolean {
    return this._isReloading;
  }

  /** Returns reload progress 0..1 (0 = just started, 1 = complete). */
  getReloadProgress(): number {
    if (!this._isReloading) return 0;
    return 1 - this.reloadTimer / this.reloadTime;
  }

  getWeaponId(): WeaponId {
    return this.weaponId;
  }

  getWeaponName(): string {
    return WEAPONS[this.weaponId].name;
  }

  dispose(): void {
    this.scene.remove(this.muzzleLight);
    this.muzzleLight.dispose();

    // Return active tracers to pool, then dispose all
    const disposeTracer = (t: Tracer) => {
      this.scene.remove(t.line);
      t.line.geometry.dispose();
      (t.line.material as THREE.Material).dispose();
    };
    for (const t of this.activeTracers) {
      disposeTracer(t);
    }
    this.activeTracers.length = 0;
    this.tracerPool.dispose(disposeTracer);
    this.tracerGeomPool.dispose((g) => g.dispose());

    for (const m of this.decalMeshes) {
      this.scene.remove(m);
    }
    this.decalMeshes.length = 0;

    this.decalGeometry.dispose();
    this.decalMaterial.dispose();
  }
}
