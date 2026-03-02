import { applyMovementStepped, type PhysicsState, type MovementInput } from '@browserstrike/shared';
import type { CollisionWorld } from './CollisionWorld';

/** Stored input for replay during reconciliation. */
interface PendingInput {
  seq: number;
  input: MovementInput;
  deltaTime: number;
}

/** Teleport threshold in world units. */
const TELEPORT_THRESHOLD = 2;

/** Lerp factor for smooth correction (per frame). */
const CORRECTION_LERP = 0.2;

/** Maximum pending inputs before oldest are dropped. */
const MAX_BUFFER_SIZE = 256;

/**
 * Client-side prediction with server reconciliation.
 *
 * Each frame the client:
 *   1. Stores the input in a pending buffer
 *   2. Applies movement locally (prediction)
 *
 * When a server state update arrives:
 *   1. Discard all inputs with seq <= lastProcessedSeq
 *   2. Snap physics to server-authoritative position
 *   3. Replay all remaining (unconfirmed) inputs
 *   4. Apply correction: teleport if error > threshold, else lerp
 */
export class ClientPrediction {
  private pendingInputs: PendingInput[] = [];
  private correctionOffset = { x: 0, y: 0, z: 0 };

  constructor(private collisionWorld: CollisionWorld | null) {}

  setCollisionWorld(world: CollisionWorld | null): void {
    this.collisionWorld = world;
  }

  /** Record an input after local prediction has been applied. */
  pushInput(seq: number, input: MovementInput, deltaTime: number): void {
    this.pendingInputs.push({ seq, input, deltaTime });

    // Prevent unbounded growth if server stops acking
    if (this.pendingInputs.length > MAX_BUFFER_SIZE) {
      this.pendingInputs.splice(0, this.pendingInputs.length - MAX_BUFFER_SIZE);
    }
  }

  /**
   * Reconcile local state with server-authoritative state.
   * Called when a new server state snapshot arrives.
   *
   * @param serverSeq - The last input seq the server has processed
   * @param serverState - Server-authoritative physics state
   * @param localState - Current client-predicted physics state
   * @returns Corrected physics state to apply to the controller
   */
  reconcile(
    serverSeq: number,
    serverState: PhysicsState,
    localState: PhysicsState,
  ): PhysicsState {
    // 1. Discard confirmed inputs
    const firstUnconfirmed = this.pendingInputs.findIndex(p => p.seq > serverSeq);
    if (firstUnconfirmed === -1) {
      // All inputs confirmed — snap to server
      this.pendingInputs = [];
    } else {
      this.pendingInputs = this.pendingInputs.slice(firstUnconfirmed);
    }

    // 2. Replay unconfirmed inputs from server state
    let replayState: PhysicsState = {
      x: serverState.x,
      y: serverState.y,
      z: serverState.z,
      velocityY: serverState.velocityY,
      isGrounded: serverState.isGrounded,
    };

    for (const pending of this.pendingInputs) {
      replayState = applyMovementStepped(
        replayState,
        pending.input,
        pending.deltaTime,
        this.collisionWorld ? (s) => this.collisionWorld!.resolve(s) : undefined,
      );
    }

    // 3. Compare replayed position with current local prediction
    const dx = replayState.x - localState.x;
    const dy = replayState.y - localState.y;
    const dz = replayState.z - localState.z;
    const errorSq = dx * dx + dy * dy + dz * dz;

    if (errorSq > TELEPORT_THRESHOLD * TELEPORT_THRESHOLD) {
      // Large error — teleport to replayed position
      this.correctionOffset.x = 0;
      this.correctionOffset.y = 0;
      this.correctionOffset.z = 0;
      return replayState;
    }

    if (errorSq > 0.0001) {
      // Small error — accumulate correction offset for smooth lerp
      this.correctionOffset.x += dx;
      this.correctionOffset.y += dy;
      this.correctionOffset.z += dz;
    }

    // Keep local position (corrected smoothly via offset each frame),
    // but ALWAYS use replayed vertical physics to prevent jump desync.
    return {
      x: localState.x,
      y: localState.y,
      z: localState.z,
      velocityY: replayState.velocityY,
      isGrounded: replayState.isGrounded,
    };
  }

  /**
   * Apply accumulated correction offset smoothly.
   * Call this every frame AFTER local movement.
   *
   * @returns Position delta to add to the controller this frame
   */
  consumeCorrectionDelta(): { dx: number; dy: number; dz: number } {
    const dx = this.correctionOffset.x * CORRECTION_LERP;
    const dy = this.correctionOffset.y * CORRECTION_LERP;
    const dz = this.correctionOffset.z * CORRECTION_LERP;

    this.correctionOffset.x -= dx;
    this.correctionOffset.y -= dy;
    this.correctionOffset.z -= dz;

    // Zero out tiny residuals
    if (Math.abs(this.correctionOffset.x) < 0.001) this.correctionOffset.x = 0;
    if (Math.abs(this.correctionOffset.y) < 0.001) this.correctionOffset.y = 0;
    if (Math.abs(this.correctionOffset.z) < 0.001) this.correctionOffset.z = 0;

    return { dx, dy, dz };
  }

  /** Clear all pending inputs (e.g., on respawn or round start). */
  clear(): void {
    this.pendingInputs = [];
    this.correctionOffset.x = 0;
    this.correctionOffset.y = 0;
    this.correctionOffset.z = 0;
  }

  /** Number of unconfirmed inputs in the buffer. */
  get pendingCount(): number {
    return this.pendingInputs.length;
  }
}
