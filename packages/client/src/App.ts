import { SceneManager } from './engine/SceneManager';
import { buildWarehouseMap } from './engine/MapBuilder';
import { FPSController } from './engine/FPSController';
import { WeaponModel } from './engine/WeaponModel';
import { ShootingSystem } from './engine/ShootingSystem';
import { RemotePlayerManager } from './engine/RemotePlayerManager';
import { NetworkManager } from './network/NetworkManager';
import { MenuScreen } from './ui/MenuScreen';
import { LobbyScreen } from './ui/LobbyScreen';
import { GameHUD } from './ui/GameHUD';
import { PLAYER_HP, ROUND_TIME_LIMIT } from '@browserstrike/shared';
import type { InputMessage, ShootMessage, Team, GameMode, MapId, RoundsToWin, WeaponId } from '@browserstrike/shared';

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
  private inputSeq = 0;

  // Engine systems — lazily created when entering PLAYING
  private sceneManager: SceneManager | null = null;
  private fpsController: FPSController | null = null;
  private weaponModel: WeaponModel | null = null;
  private shootingSystem: ShootingSystem | null = null;
  private remotePlayers: RemotePlayerManager | null = null;
  private gameHUD: GameHUD | null = null;

  // Network — always available
  readonly network: NetworkManager;

  // UI screens
  private menuScreen: MenuScreen | null = null;
  private lobbyScreen: LobbyScreen | null = null;
  private lobbyStateInterval = 0;

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

    // Initialize UI screens
    this.initMenuScreen();
    this.initLobbyScreen();

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

  private initMenuScreen(): void {
    const menuEl = this.screens.get(AppState.MENU);
    if (!menuEl) return;

    this.menuScreen = new MenuScreen(menuEl);
    this.menuScreen.setCallbacks({
      onCreateRoom: async (nickname: string) => {
        const code = await this.network.createRoom(nickname);
        console.log(`Room created with code: ${code}`);
        this.setState(AppState.LOBBY);
      },
      onJoinRoom: async (roomCode: string, nickname: string) => {
        await this.network.joinByCode(roomCode, nickname);
        console.log(`Joined room: ${roomCode}`);
        this.setState(AppState.LOBBY);
      },
    });
  }

  private initLobbyScreen(): void {
    const lobbyEl = this.screens.get(AppState.LOBBY);
    if (!lobbyEl) return;

    this.lobbyScreen = new LobbyScreen(lobbyEl);
    this.lobbyScreen.setCallbacks({
      onJoinTeam: (team: Team) => {
        this.network.send('joinTeam', { team });
      },
      onUpdateSettings: (settings: { mode?: GameMode; mapId?: MapId; roundsToWin?: RoundsToWin }) => {
        this.network.send('updateSettings', settings);
      },
      onStartGame: () => {
        this.network.send('startGame', {});
      },
      onLeave: async () => {
        await this.network.leave();
        this.setState(AppState.MENU);
      },
    });
  }

  /** Sync lobby UI from Colyseus state. */
  private syncLobbyState(): void {
    if (!this.lobbyScreen || !this.network.connected) return;
    const room = this.network.currentRoom;
    if (!room) return;

    const state = room.state as Record<string, unknown>;
    const playersMap = state.players as Map<string, Record<string, unknown>> | undefined;

    const players: Array<{ sessionId: string; nickname: string; team: Team }> = [];
    if (playersMap) {
      playersMap.forEach((p, sid) => {
        players.push({
          sessionId: sid,
          nickname: (p.nickname as string) || 'Unknown',
          team: (p.team as Team) || 'unassigned',
        });
      });
    }

    const settings = state.settings as Record<string, unknown> | undefined;

    this.lobbyScreen.update({
      roomCode: (state.roomCode as string) || '',
      adminId: (state.adminId as string) || '',
      localSessionId: this.network.sessionId,
      players,
      settings: settings ? {
        mode: (settings.mode as GameMode) || '2v2',
        mapId: (settings.mapId as MapId) || 'warehouse',
        roundsToWin: (settings.roundsToWin as RoundsToWin) || 5,
      } : { mode: '2v2', mapId: 'warehouse', roundsToWin: 5 },
    });

    // Check if game status changed to weapon_select → transition to PLAYING
    const gameStatus = state.status as string;
    if (gameStatus === 'weapon_select' || gameStatus === 'playing') {
      this.setState(AppState.PLAYING);
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
    if (state === AppState.LOBBY) {
      if (this.lobbyStateInterval) {
        clearInterval(this.lobbyStateInterval);
        this.lobbyStateInterval = 0;
      }
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

    if (state === AppState.MENU) {
      this.menuScreen?.reset();
    }

    if (state === AppState.LOBBY) {
      // Initial sync + poll for state changes
      this.syncLobbyState();
      this.lobbyStateInterval = window.setInterval(() => this.syncLobbyState(), 200);
    }
  }

  // ── Game loop ──────────────────────────────────────────

  private startGameLoop(): void {
    this.sceneManager = new SceneManager(this.canvas);
    const collisionWorld = buildWarehouseMap(this.sceneManager.scene);

    this.fpsController = new FPSController(this.sceneManager.camera, this.canvas);
    this.fpsController.setCollisionWorld(collisionWorld);

    this.weaponModel = new WeaponModel(window.innerWidth / window.innerHeight);

    // Shooting system — raycasting, spread, visual effects, ammo tracking, reload
    this.shootingSystem = new ShootingSystem(this.sceneManager.scene);
    this.shootingSystem.setSendCallback((msg: ShootMessage) => {
      this.network.send('shoot', msg);
    });
    this.shootingSystem.setReloadCallback(() => {
      this.network.send('reload', {});
    });

    // Game HUD — crosshair, HP, ammo, score, timer
    const playingScreen = this.screens.get(AppState.PLAYING);
    if (playingScreen) {
      this.gameHUD = new GameHUD(playingScreen);
    }

    // Remote players — spawn/despawn capsules from Colyseus state
    this.remotePlayers = new RemotePlayerManager(
      this.sceneManager.scene,
      this.network.sessionId,
    );
    this.setupNetworkListeners();

    this.inputSeq = 0;
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  private stopGameLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    if (this.gameHUD) {
      this.gameHUD.dispose();
      this.gameHUD = null;
    }
    if (this.remotePlayers) {
      this.remotePlayers.dispose();
      this.remotePlayers = null;
    }
    if (this.shootingSystem) {
      this.shootingSystem.dispose();
      this.shootingSystem = null;
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

  /** Wire up Colyseus state listeners for remote player add/remove/update. */
  private setupNetworkListeners(): void {
    if (!this.network.connected) return;

    this.network.listen({
      onPlayerAdd: (sessionId, player) => {
        const p = player as { team?: string; x?: number; y?: number; z?: number; yaw?: number };
        this.remotePlayers?.addPlayer(sessionId, p.team ?? 'unassigned');
        // Set initial position
        if (p.x !== undefined) {
          this.remotePlayers?.updatePlayer(
            sessionId,
            p.x,
            p.y ?? 0,
            p.z ?? 0,
            p.yaw ?? 0,
            p.team ?? 'unassigned',
          );
        }
      },
      onPlayerRemove: (sessionId) => {
        this.remotePlayers?.removePlayer(sessionId);
      },
      onStateChange: () => {
        this.syncRemotePlayers();
      },
    });
  }

  /** Read all players from Colyseus state and update remote capsule transforms. */
  private syncRemotePlayers(): void {
    if (!this.remotePlayers || !this.network.connected) return;

    const room = this.network.currentRoom;
    if (!room) return;

    const state = room.state as { players?: Map<string, PlayerData> };
    if (!state.players) return;

    state.players.forEach((p: PlayerData, sessionId: string) => {
      // Ensure the remote player mesh exists
      if (sessionId !== this.network.sessionId) {
        this.remotePlayers!.addPlayer(sessionId, p.team ?? 'unassigned');
        this.remotePlayers!.updatePlayer(
          sessionId,
          p.x,
          p.y,
          p.z,
          p.yaw,
          p.team ?? 'unassigned',
        );
      }
    });
  }

  /** Send the current input state to the server. */
  private sendInput(dt: number): void {
    if (!this.network.connected) return;

    const fps = this.fpsController!;
    if (!fps.pointerLock.locked) return;

    this.inputSeq++;

    const msg: InputMessage = {
      seq: this.inputSeq,
      keys: { ...fps.input.keys },
      yaw: fps.yaw,
      pitch: fps.pitch,
      deltaTime: dt,
    };

    this.network.send('input', msg);
  }

  // ── HUD data helpers ────────────────────────────────────

  private getLocalPlayerHP(): number {
    if (!this.network.connected) return PLAYER_HP;
    const room = this.network.currentRoom;
    if (!room) return PLAYER_HP;
    const state = room.state as { players?: Map<string, { hp?: number }> };
    const local = state.players?.get(this.network.sessionId);
    return local?.hp ?? PLAYER_HP;
  }

  private getLocalWeaponId(): WeaponId {
    // Currently only Deagle; will be dynamic after TASK-028
    return 'deagle';
  }

  private getScoreA(): number {
    if (!this.network.connected) return 0;
    const room = this.network.currentRoom;
    if (!room) return 0;
    const state = room.state as { scoreA?: number };
    return state.scoreA ?? 0;
  }

  private getScoreB(): number {
    if (!this.network.connected) return 0;
    const room = this.network.currentRoom;
    if (!room) return 0;
    const state = room.state as { scoreB?: number };
    return state.scoreB ?? 0;
  }

  /** Sync ammo and reload state from server (authoritative). */
  private syncAmmoFromServer(): void {
    if (!this.shootingSystem || !this.network.connected) return;
    const room = this.network.currentRoom;
    if (!room) return;
    const state = room.state as { players?: Map<string, { ammo?: number; isReloading?: boolean }> };
    const local = state.players?.get(this.network.sessionId);
    if (local && local.ammo !== undefined) {
      this.shootingSystem.syncAmmo(local.ammo, local.isReloading ?? false);
    }
  }

  private getRoundTime(): number {
    if (!this.network.connected) return ROUND_TIME_LIMIT;
    const room = this.network.currentRoom;
    if (!room) return ROUND_TIME_LIMIT;
    const state = room.state as { roundTimer?: number };
    return state.roundTimer ?? ROUND_TIME_LIMIT;
  }

  private animate = (now: number): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const fps = this.fpsController!;
    const weapon = this.weaponModel!;
    const shooting = this.shootingSystem!;
    const scene = this.sceneManager!;

    // Handle R key for manual reload
    if (fps.pointerLock.locked && fps.input.consumeReload()) {
      shooting.startReload();
    }

    // Shooting: block during reload
    if (fps.pointerLock.locked && shooting.getAmmo() > 0 && !shooting.getIsReloading()) {
      const fired = weapon.tryFire(fps.input.mouseDown, now);
      if (fired) {
        const isMoving = fps.input.keys.w || fps.input.keys.a || fps.input.keys.s || fps.input.keys.d;
        shooting.fire(fps.position, fps.yaw, fps.pitch, isMoving);
      }
    }

    fps.update(dt);
    weapon.update(dt);
    shooting.update(dt);

    // Sync ammo from authoritative server state
    this.syncAmmoFromServer();

    // Send input to server after local prediction
    this.sendInput(dt);

    // Update HUD
    if (this.gameHUD) {
      this.gameHUD.update({
        hp: this.getLocalPlayerHP(),
        ammo: shooting.getAmmo(),
        magazineSize: shooting.getMagazineSize(),
        weaponId: this.getLocalWeaponId(),
        isReloading: shooting.getIsReloading(),
        reloadProgress: shooting.getReloadProgress(),
        scoreA: this.getScoreA(),
        scoreB: this.getScoreB(),
        roundTime: this.getRoundTime(),
      });
    }

    scene.render();
    scene.renderOverlay(weapon.scene, weapon.camera);
  };
}

/** Minimal shape for PlayerSchema fields accessed on the client. */
interface PlayerData {
  x: number;
  y: number;
  z: number;
  yaw: number;
  team?: string;
}
