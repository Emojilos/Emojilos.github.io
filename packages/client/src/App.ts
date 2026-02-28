import { SceneManager } from './engine/SceneManager';
import { buildWarehouseMap } from './engine/MapBuilder';
import { FPSController } from './engine/FPSController';
import { WeaponModel } from './engine/WeaponModel';
import { NetworkManager } from './network/NetworkManager';

export enum AppState {
  MENU = 'menu',
  LOBBY = 'lobby',
  PLAYING = 'playing',
  MATCH_END = 'match_end',
}

/** Screen div IDs matching AppState values */
const SCREEN_IDS: Record<AppState, string> = {
  [AppState.MENU]: 'menu-screen',
  [AppState.LOBBY]: 'lobby-screen',
  [AppState.PLAYING]: 'playing-screen',
  [AppState.MATCH_END]: 'match-end-screen',
};

export class App {
  private state: AppState = AppState.MENU;
  private animationFrameId = 0;
  private lastTime = 0;

  // Engine systems — lazily created when entering PLAYING
  private sceneManager: SceneManager | null = null;
  private fpsController: FPSController | null = null;
  private weaponModel: WeaponModel | null = null;

  // Network — always available
  readonly network: NetworkManager;

  // DOM references
  private readonly canvas: HTMLCanvasElement;
  private readonly uiRoot: HTMLElement;
  private readonly screens: Map<AppState, HTMLElement> = new Map();

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.uiRoot = document.getElementById('ui-root') as HTMLElement;
    this.network = new NetworkManager();

    this.createScreens();
    this.showScreen(AppState.MENU);

    // Hide canvas until playing
    this.canvas.style.display = 'none';

    console.log('BrowserStrike loaded — app in MENU state');
  }

  private createScreens(): void {
    for (const appState of Object.values(AppState)) {
      const id = SCREEN_IDS[appState];
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        this.uiRoot.appendChild(el);
      }
      el.style.display = 'none';
      this.screens.set(appState, el);
    }
  }

  /** Transition to a new app state. */
  setState(newState: AppState | `${AppState}`): void {
    const target = newState as AppState;
    if (target === this.state) return;

    const prev = this.state;
    this.leaveState(prev);
    this.state = target;
    this.enterState(target);

    console.log(`App state: ${prev} → ${target}`);
  }

  getState(): AppState {
    return this.state;
  }

  private showScreen(state: AppState): void {
    for (const [s, el] of this.screens) {
      el.style.display = s === state ? '' : 'none';
    }
  }

  private leaveState(state: AppState): void {
    if (state === AppState.PLAYING) {
      this.stopGameLoop();
    }
  }

  private enterState(state: AppState): void {
    this.showScreen(state);

    if (state === AppState.PLAYING) {
      this.canvas.style.display = 'block';
      this.startGameLoop();
    } else {
      this.canvas.style.display = 'none';
    }
  }

  // ── Game loop ──────────────────────────────────────────

  private startGameLoop(): void {
    this.sceneManager = new SceneManager(this.canvas);
    const collisionWorld = buildWarehouseMap(this.sceneManager.scene);

    this.fpsController = new FPSController(this.sceneManager.camera, this.canvas);
    this.fpsController.setCollisionWorld(collisionWorld);

    this.weaponModel = new WeaponModel(window.innerWidth / window.innerHeight);

    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  private stopGameLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    if (this.fpsController) {
      this.fpsController.dispose();
      this.fpsController = null;
    }
    if (this.sceneManager) {
      this.sceneManager.dispose();
      this.sceneManager = null;
    }
    this.weaponModel = null;
  }

  private animate = (now: number): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const fps = this.fpsController!;
    const weapon = this.weaponModel!;
    const scene = this.sceneManager!;

    if (fps.pointerLock.locked) {
      weapon.tryFire(fps.input.mouseDown, now);
    }

    fps.update(dt);
    weapon.update(dt);

    scene.render();
    scene.renderOverlay(weapon.scene, weapon.camera);
  };
}
