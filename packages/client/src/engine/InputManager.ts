import type { KeyState } from '@browserstrike/shared';

/**
 * Tracks keyboard state (WASD + Space) and accumulated mouse delta.
 * Mouse delta is reset each frame after consumption.
 */
export class InputManager {
  readonly keys: KeyState = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
  };

  /** Whether the primary mouse button (LMB) is currently held */
  mouseDown = false;

  /** Whether the R key was pressed this frame (consumed after read) */
  reloadPressed = false;

  /** Accumulated mouse movement since last consumeMouseDelta() call */
  private _mouseDeltaX = 0;
  private _mouseDeltaY = 0;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.setKey(e.code, true);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.setKey(e.code, false);
  };

  private setKey(code: string, pressed: boolean): void {
    switch (code) {
      case 'KeyW': this.keys.w = pressed; break;
      case 'KeyA': this.keys.a = pressed; break;
      case 'KeyS': this.keys.s = pressed; break;
      case 'KeyD': this.keys.d = pressed; break;
      case 'Space': this.keys.space = pressed; break;
      case 'KeyR': if (pressed) this.reloadPressed = true; break;
    }
  }

  /** Consume and reset the reload key press flag. */
  consumeReload(): boolean {
    const v = this.reloadPressed;
    this.reloadPressed = false;
    return v;
  }

  private onMouseMove = (e: MouseEvent): void => {
    this._mouseDeltaX += e.movementX;
    this._mouseDeltaY += e.movementY;
  };

  /** Returns accumulated mouse delta and resets it. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const dx = this._mouseDeltaX;
    const dy = this._mouseDeltaY;
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
    return { dx, dy };
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseDown = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseDown = false;
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
  }
}
