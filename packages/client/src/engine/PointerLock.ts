/**
 * Manages Pointer Lock API on the given canvas element.
 * Click on canvas to lock, Esc (browser default) to unlock.
 */
export class PointerLock {
  private _locked = false;

  get locked(): boolean {
    return this._locked;
  }

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.canvas.addEventListener('click', this.requestLock);
    document.addEventListener('pointerlockchange', this.onChange);
  }

  private requestLock = (): void => {
    if (!this._locked) {
      this.canvas.requestPointerLock();
    }
  };

  private onChange = (): void => {
    this._locked = document.pointerLockElement === this.canvas;
  };

  dispose(): void {
    this.canvas.removeEventListener('click', this.requestLock);
    document.removeEventListener('pointerlockchange', this.onChange);
    if (this._locked) {
      document.exitPointerLock();
    }
  }
}
