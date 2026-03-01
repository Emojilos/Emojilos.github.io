import { SceneManager } from './engine/SceneManager';
import { loadMap, loadMapAsync } from './engine/MapLoader';
import { FPSController } from './engine/FPSController';
import { WeaponModel } from './engine/WeaponModel';
import { ShootingSystem } from './engine/ShootingSystem';
import { RemotePlayerManager } from './engine/RemotePlayerManager';
import { ClientPrediction } from './engine/ClientPrediction';
import { SpectatorSystem } from './engine/SpectatorSystem';
import { NetworkManager } from './network/NetworkManager';
import { MenuScreen } from './ui/MenuScreen';
import { LobbyScreen } from './ui/LobbyScreen';
import { GameHUD } from './ui/GameHUD';
import { WeaponSelectScreen } from './ui/WeaponSelectScreen';
import { DamageEffects } from './ui/DamageEffects';
import { KillFeed } from './ui/KillFeed';
import { Scoreboard } from './ui/Scoreboard';
import type { ScoreboardState, ScoreboardPlayer } from './ui/Scoreboard';
import { DebugOverlay } from './ui/DebugOverlay';
import { AudioManager } from './engine/AudioManager';
import { SoundSettings } from './ui/SoundSettings';
import { CrosshairSettings } from './ui/CrosshairSettings';
import { QualitySettings } from './engine/QualitySettings';
import { PLAYER_HP, ROUND_TIME_LIMIT, DEFAULT_WEAPON, DEFAULT_MAP, WEAPON_IDS } from '@browserstrike/shared';
import type { InputMessage, ShootMessage, Team, GameMode, MapId, RoundsToWin, WeaponId, KillEvent, RoundEndEvent, MatchEndEvent } from '@browserstrike/shared';

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
  private prediction: ClientPrediction | null = null;
  private spectator: SpectatorSystem | null = null;
  private gameHUD: GameHUD | null = null;
  private weaponSelectScreen: WeaponSelectScreen | null = null;
  private damageEffects: DamageEffects | null = null;
  private killFeed: KillFeed | null = null;
  private scoreboard: Scoreboard | null = null;
  private debugOverlay: DebugOverlay | null = null;
  private audioManager: AudioManager;
  private soundSettings: SoundSettings;
  private crosshairSettings: CrosshairSettings;
  private qualitySettings: QualitySettings;

  // FPS tracking
  private fpsFrameCount = 0;
  private fpsAccumulator = 0;
  private currentFps = 0;

  // Ping estimation
  private pingSeqSendTimes: Map<number, number> = new Map();
  private estimatedPing = 0;

  // Network — always available
  readonly network: NetworkManager;

  // UI screens
  private menuScreen: MenuScreen | null = null;
  private lobbyScreen: LobbyScreen | null = null;
  private lobbyStateInterval = 0;
  private lobbyOnStateChange: (() => void) | null = null;

  // DOM references
  private readonly canvas: HTMLCanvasElement;
  private readonly uiRoot: HTMLElement;
  private readonly screens: Map<AppState, HTMLElement> = new Map();

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.uiRoot = document.getElementById('ui-root') as HTMLElement;
    this.network = new NetworkManager();
    this.audioManager = new AudioManager();
    this.soundSettings = new SoundSettings(this.audioManager);
    this.crosshairSettings = new CrosshairSettings();
    this.crosshairSettings.setOnUpdate(() => this.crosshairSettings.applyToHUD());
    this.qualitySettings = new QualitySettings();

    // Resume AudioContext on first user interaction
    const resumeAudio = () => {
      this.audioManager.tryResume();
    };
    document.addEventListener('click', resumeAudio, { once: false });
    document.addEventListener('keydown', resumeAudio, { once: false });

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
      onOpenSettings: () => {
        this.soundSettings.show();
      },
      onOpenCrosshairSettings: () => {
        this.crosshairSettings.show();
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
        try {
          this.network.send('startGame', {});
        } catch (err) {
          console.error('startGame failed:', err);
        }
      },
      onLeave: async () => {
        try {
          await this.network.leave();
        } catch (err) {
          console.error('Leave failed:', err);
        }
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

    const lobbyData = {
      roomCode: (state.roomCode as string) || '',
      adminId: (state.adminId as string) || '',
      localSessionId: this.network.sessionId,
      players,
      settings: settings ? {
        mode: (settings.mode as GameMode) || '2v2',
        mapId: (settings.mapId as MapId) || 'warehouse',
        roundsToWin: (settings.roundsToWin as RoundsToWin) || 5,
      } : { mode: '2v2' as GameMode, mapId: 'warehouse' as MapId, roundsToWin: 5 as RoundsToWin },
    };

    this.lobbyScreen.update(lobbyData);

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
      if (this.lobbyOnStateChange) {
        this.network.currentRoom?.onStateChange.remove(this.lobbyOnStateChange);
        this.lobbyOnStateChange = null;
      }
    }
  }

  private enterState(state: AppState): void {
    this.showScreen(state);

    if (state === AppState.PLAYING) {
      this.canvas.style.display = 'block';
      this.startGameLoop().catch((err) => {
        console.error('Failed to start game loop:', err);
      });
    } else {
      this.canvas.style.display = 'none';
    }

    if (state === AppState.MENU) {
      this.menuScreen?.reset();
    }

    if (state === AppState.LOBBY) {
      // Immediate sync + real-time updates via onStateChange
      this.syncLobbyState();
      const room = this.network.currentRoom;
      if (room) {
        this.lobbyOnStateChange = () => this.syncLobbyState();
        room.onStateChange(this.lobbyOnStateChange);
        // Handle unexpected disconnect while in lobby
        room.onLeave((code) => {
          if (this.state === AppState.LOBBY && code >= 1006) {
            console.warn(`Lobby: disconnected (code ${code}), returning to menu`);
            this.network.clearRoom();
            this.setState(AppState.MENU);
            this.menuScreen?.showError('Disconnected from server');
          }
        });
      }
      // Fallback polling in case onStateChange doesn't fire
      this.lobbyStateInterval = window.setInterval(() => this.syncLobbyState(), 500);
    }

    if (state === AppState.MATCH_END) {
      this.showMatchEndScreen();
    }
  }

  private showMatchEndScreen(): void {
    const screen = this.screens.get(AppState.MATCH_END);
    if (!screen) return;

    const room = this.network.currentRoom;
    const state = room?.state as {
      scoreTeamA?: number;
      scoreTeamB?: number;
      players?: Map<string, { nickname?: string; team?: string; kills?: number; deaths?: number }>;
      adminId?: string;
    } | undefined;

    const scoreA = state?.scoreTeamA ?? 0;
    const scoreB = state?.scoreTeamB ?? 0;
    const winnerTeam = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : null;
    const winnerText = winnerTeam ? `Team ${winnerTeam} Wins!` : 'Draw!';
    const winnerClass = winnerTeam === 'A' ? 'team-a-win' : winnerTeam === 'B' ? 'team-b-win' : '';

    const playersA: Array<{ nickname: string; kills: number; deaths: number }> = [];
    const playersB: Array<{ nickname: string; kills: number; deaths: number }> = [];
    state?.players?.forEach((p) => {
      const entry = {
        nickname: p.nickname ?? 'Unknown',
        kills: p.kills ?? 0,
        deaths: p.deaths ?? 0,
      };
      if (p.team === 'A') playersA.push(entry);
      else if (p.team === 'B') playersB.push(entry);
    });
    playersA.sort((a, b) => b.kills - a.kills);
    playersB.sort((a, b) => b.kills - a.kills);

    const isAdmin = this.network.sessionId === (state?.adminId ?? '');

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    screen.innerHTML = `
      <div class="match-end-panel">
        <h1 class="match-end-title">MATCH OVER</h1>
        <div class="match-end-winner ${winnerClass}">${winnerText}</div>
        <div class="match-end-score">
          <span class="team-a-score">${scoreA}</span>
          <span class="score-separator">:</span>
          <span class="team-b-score">${scoreB}</span>
        </div>
        <div class="match-end-stats">
          <div class="stats-column">
            <h3 class="stats-header team-a-header">Team A</h3>
            ${playersA.map(p => `<div class="stats-row"><span>${esc(p.nickname)}</span><span>${p.kills} / ${p.deaths}</span></div>`).join('')}
          </div>
          <div class="stats-column">
            <h3 class="stats-header team-b-header">Team B</h3>
            ${playersB.map(p => `<div class="stats-row"><span>${esc(p.nickname)}</span><span>${p.kills} / ${p.deaths}</span></div>`).join('')}
          </div>
        </div>
        <div class="match-end-buttons">
          ${isAdmin ? '<button id="btn-rematch" class="btn-primary">Rematch</button>' : '<span class="waiting-text">Waiting for host...</span>'}
          <button id="btn-quit" class="btn-secondary">Quit</button>
        </div>
      </div>
    `;

    screen.querySelector('#btn-rematch')?.addEventListener('click', () => {
      this.network.send('returnToLobby', {});
    });
    screen.querySelector('#btn-quit')?.addEventListener('click', async () => {
      await this.network.leave();
      this.setState(AppState.MENU);
    });
  }

  // ── Game loop ──────────────────────────────────────────

  private async startGameLoop(): Promise<void> {
    this.sceneManager = new SceneManager(this.canvas);

    // Apply quality settings to renderer
    this.qualitySettings.applyToRenderer(this.sceneManager.renderer, this.sceneManager.scene);

    // Determine map from server state (defaults to warehouse)
    const mapId = this.getMapId();
    let mapResult;
    try {
      mapResult = await loadMapAsync(mapId);
    } catch (err) {
      console.warn('GLTF load failed, falling back to procedural map:', err);
      mapResult = loadMap(mapId);
    }
    this.sceneManager.scene.add(mapResult.root);
    const collisionWorld = mapResult.collisionWorld;

    this.fpsController = new FPSController(this.sceneManager.camera, this.canvas);
    this.fpsController.setCollisionWorld(collisionWorld);

    this.weaponModel = new WeaponModel(window.innerWidth / window.innerHeight);

    // Client-side prediction with server reconciliation
    this.prediction = new ClientPrediction(collisionWorld);

    // Spectator system — follows alive teammate when local player is dead
    this.spectator = new SpectatorSystem(this.sceneManager.camera);

    // Shooting system — raycasting, spread, visual effects, ammo tracking, reload
    this.shootingSystem = new ShootingSystem(this.sceneManager.scene);
    this.shootingSystem.setSendCallback((msg: ShootMessage) => {
      this.network.send('shoot', msg);
    });
    this.shootingSystem.setReloadCallback(() => {
      this.network.send('reload', {});
    });
    this.shootingSystem.setOnReloadStart(() => {
      this.audioManager.playReload();
    });

    // Game HUD — crosshair, HP, ammo, score, timer
    const playingScreen = this.screens.get(AppState.PLAYING);
    if (playingScreen) {
      this.gameHUD = new GameHUD(playingScreen);
      // Apply saved crosshair settings to HUD
      this.crosshairSettings.applyToHUD();

      // Weapon select overlay — shown during weapon_select phase
      this.weaponSelectScreen = new WeaponSelectScreen(playingScreen);
      this.weaponSelectScreen.setCallbacks({
        onSelect: (weapon) => {
          this.network.send('selectWeapon', { weapon });
        },
      });

      // Damage effects — vignette + hitmarker
      this.damageEffects = new DamageEffects(playingScreen);

      // Kill feed — top-right kill notifications
      this.killFeed = new KillFeed(playingScreen);

      // Scoreboard — shown while Tab is held
      this.scoreboard = new Scoreboard(playingScreen);

      // Debug overlay — toggled by backtick
      this.debugOverlay = new DebugOverlay(playingScreen);
    }

    // Remote players — spawn/despawn capsules from Colyseus state
    this.remotePlayers = new RemotePlayerManager(
      this.sceneManager.scene,
      this.network.sessionId,
    );
    this.remotePlayers.setSpatialFootstepCallback((x, y, z) => {
      this.audioManager.playSpatialFootstep(x, y, z);
    });
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
    if (this.debugOverlay) {
      this.debugOverlay.dispose();
      this.debugOverlay = null;
    }
    if (this.scoreboard) {
      this.scoreboard.dispose();
      this.scoreboard = null;
    }
    if (this.killFeed) {
      this.killFeed.dispose();
      this.killFeed = null;
    }
    if (this.damageEffects) {
      this.damageEffects.dispose();
      this.damageEffects = null;
    }
    if (this.weaponSelectScreen) {
      this.weaponSelectScreen.dispose();
      this.weaponSelectScreen = null;
    }
    if (this.gameHUD) {
      this.gameHUD.dispose();
      this.gameHUD = null;
    }
    if (this.remotePlayers) {
      this.remotePlayers.dispose();
      this.remotePlayers = null;
    }
    if (this.spectator) {
      this.spectator.deactivate();
      this.spectator = null;
    }
    if (this.prediction) {
      this.prediction.clear();
      this.prediction = null;
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
        const p = player as { team?: string; x?: number; y?: number; z?: number; yaw?: number; pitch?: number; currentWeapon?: WeaponId };
        this.remotePlayers?.addPlayer(sessionId, p.team ?? 'unassigned');
        // Push initial snapshot for interpolation
        if (p.x !== undefined) {
          this.remotePlayers?.pushSnapshot(
            sessionId,
            p.x,
            p.y ?? 0,
            p.z ?? 0,
            p.yaw ?? 0,
            p.pitch ?? 0,
            p.team ?? 'unassigned',
            p.currentWeapon,
          );
        }
      },
      onPlayerRemove: (sessionId) => {
        this.remotePlayers?.removePlayer(sessionId);
      },
      onStateChange: () => {
        this.syncRemotePlayers();
        this.checkGameStatus();
      },
      onLeave: (code) => {
        // Unexpected disconnect (code >= 1000 means not consented/normal)
        if (code >= 1006) {
          console.warn(`Disconnected from server (code: ${code})`);
          this.setState(AppState.MENU);
          this.menuScreen?.showError('Disconnected from server');
        }
      },
    });

    // Round events from server
    this.network.onMessage('countdown', (data: { seconds: number }) => {
      console.log(`Countdown: ${data.seconds}s`);
      this.audioManager.playCountdownBeep();
      // Clear prediction buffer on respawn — server resets positions
      this.prediction?.clear();
      // Clear interpolation buffers — remote players teleport to spawn points
      this.remotePlayers?.clearBuffers();
      // Deactivate spectator on respawn
      this.spectator?.deactivate();
    });

    this.network.onMessage('roundStart', (data: { round: number }) => {
      console.log(`Round ${data.round} started!`);
      this.audioManager.playRoundStart();
    });

    this.network.onMessage('roundEnd', (data: RoundEndEvent) => {
      console.log(`Round ended! Winner: Team ${data.winnerTeam} | Score: ${data.scoreA} - ${data.scoreB}`);
    });

    this.network.onMessage('matchEnd', (data: MatchEndEvent) => {
      console.log(`Match ended! Winner: Team ${data.winnerTeam} | Final: ${data.finalScoreA} - ${data.finalScoreB}`);
    });

    // Hit confirmation — show hitmarker when we hit an enemy
    this.network.onMessage('hit', (data: { damage: number; isHeadshot: boolean }) => {
      this.damageEffects?.showHitmarker(data.isHeadshot);
      this.audioManager.playHitmarker(data.isHeadshot);
    });

    // Kill event — add to kill feed
    this.network.onMessage('kill', (data: KillEvent) => {
      this.killFeed?.addKill(data);
    });

    // Player disconnected — show notification in kill feed
    this.network.onMessage('playerDisconnected', (data: { nickname: string }) => {
      this.killFeed?.addNotification(`${data.nickname} disconnected`);
    });

    // Damage received — show red vignette with direction indicator
    this.network.onMessage('damaged', (data: { damage: number; isHeadshot: boolean; direction: { x: number; y: number; z: number } }) => {
      const yaw = this.fpsController?.yaw ?? 0;
      this.damageEffects?.showDamage(data.damage, data.direction.x, data.direction.z, yaw);
      this.audioManager.playDamage();
    });

    // Remote player shot — play spatial gunshot sound
    this.network.onMessage('remoteShoot', (data: { sessionId: string; weaponId: WeaponId; x: number; y: number; z: number }) => {
      this.audioManager.playSpatialGunshot(data.weaponId as WeaponId, data.x, data.y + 1.5, data.z);
    });
  }

  /** Check game status from Colyseus state and handle transitions. */
  private checkGameStatus(): void {
    if (!this.network.connected) return;
    const room = this.network.currentRoom;
    if (!room) return;

    const state = room.state as { status?: string; roundTimer?: number };
    const gameStatus = state.status;

    // Show/hide weapon select overlay
    if (this.weaponSelectScreen) {
      if (gameStatus === 'weapon_select') {
        if (!this.weaponSelectScreen.isVisible()) {
          this.weaponSelectScreen.show();
        }
        this.weaponSelectScreen.updateTimer(state.roundTimer ?? 0);
      } else if (this.weaponSelectScreen.isVisible()) {
        this.weaponSelectScreen.hide();
      }
    }

    // Transition to match_end screen
    if (gameStatus === 'match_end' && this.state === AppState.PLAYING) {
      this.setState(AppState.MATCH_END);
    }

    // Return to lobby (admin pressed rematch)
    if (gameStatus === 'lobby' && this.state === AppState.MATCH_END) {
      this.setState(AppState.LOBBY);
    }
  }

  /** Read all players from Colyseus state and update remote capsule transforms. */
  private syncRemotePlayers(): void {
    if (!this.network.connected) return;

    const room = this.network.currentRoom;
    if (!room) return;

    const state = room.state as { players?: Map<string, PlayerDataFull> };
    if (!state.players) return;

    state.players.forEach((p: PlayerDataFull, sessionId: string) => {
      if (sessionId === this.network.sessionId) {
        // Local player — reconcile prediction
        this.reconcileLocalPlayer(p);
      } else if (this.remotePlayers) {
        // Remote player — ensure spawned, then push snapshot for interpolation
        this.remotePlayers.addPlayer(sessionId, p.team ?? 'unassigned');
        this.remotePlayers.pushSnapshot(
          sessionId,
          p.x,
          p.y,
          p.z,
          p.yaw,
          p.pitch ?? 0,
          p.team ?? 'unassigned',
          (p as PlayerDataFull & { currentWeapon?: WeaponId }).currentWeapon,
        );
      }
    });
  }

  /** Reconcile local player position with server-authoritative state. */
  private reconcileLocalPlayer(serverPlayer: PlayerDataFull): void {
    if (!this.prediction || !this.fpsController) return;

    const serverSeq = serverPlayer.lastProcessedSeq ?? 0;
    if (serverSeq === 0) {
      // Server hasn't processed any input yet — teleport to spawn position
      this.fpsController.setPhysicsState({
        x: serverPlayer.x,
        y: serverPlayer.y,
        z: serverPlayer.z,
        velocityY: 0,
        isGrounded: true,
      });
      return;
    }

    // Ping estimation: RTT from input send → server ack
    const sendTime = this.pingSeqSendTimes.get(serverSeq);
    if (sendTime) {
      this.estimatedPing = Math.round(performance.now() - sendTime);
      // Clean up acked and older entries
      for (const [seq] of this.pingSeqSendTimes) {
        if (seq <= serverSeq) this.pingSeqSendTimes.delete(seq);
      }
    }

    const serverState = {
      x: serverPlayer.x,
      y: serverPlayer.y,
      z: serverPlayer.z,
      velocityY: 0,      // Server doesn't replicate velocityY
      isGrounded: true,   // Server doesn't replicate isGrounded
    };

    const localState = this.fpsController.getPhysicsState();
    const corrected = this.prediction.reconcile(serverSeq, serverState, localState);

    // If reconcile returned a different state (teleport case), apply it
    if (corrected !== localState) {
      this.fpsController.setPhysicsState(corrected);
    }
  }

  /** Send the current input state to the server and record for prediction. */
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

    // Store input for prediction reconciliation
    if (this.prediction) {
      const { keys } = fps.input;
      const forward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
      const right = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      this.prediction.pushInput(this.inputSeq, {
        forward,
        right,
        jump: keys.space,
        yaw: fps.yaw,
      }, dt);
    }

    this.network.send('input', msg);

    // Record send time for ping estimation (keep only last 60 entries)
    this.pingSeqSendTimes.set(this.inputSeq, performance.now());
    if (this.pingSeqSendTimes.size > 60) {
      const oldest = this.pingSeqSendTimes.keys().next().value!;
      this.pingSeqSendTimes.delete(oldest);
    }
  }

  // ── Data helpers ────────────────────────────────────────

  /** Get the current mapId from server state. */
  private getMapId(): MapId {
    if (!this.network.connected) return DEFAULT_MAP;
    const room = this.network.currentRoom;
    if (!room) return DEFAULT_MAP;
    const state = room.state as { settings?: { mapId?: string } };
    return (state.settings?.mapId as MapId) || DEFAULT_MAP;
  }

  private getLocalPlayerHP(): number {
    if (!this.network.connected) return PLAYER_HP;
    const room = this.network.currentRoom;
    if (!room) return PLAYER_HP;
    const state = room.state as { players?: Map<string, { hp?: number }> };
    const local = state.players?.get(this.network.sessionId);
    return local?.hp ?? PLAYER_HP;
  }

  private getLocalWeaponId(): WeaponId {
    if (!this.network.connected) return DEFAULT_WEAPON;
    const room = this.network.currentRoom;
    if (!room) return DEFAULT_WEAPON;
    const state = room.state as { players?: Map<string, { currentWeapon?: string }> };
    const local = state.players?.get(this.network.sessionId);
    return (local?.currentWeapon as WeaponId) || DEFAULT_WEAPON;
  }

  private getScoreA(): number {
    if (!this.network.connected) return 0;
    const room = this.network.currentRoom;
    if (!room) return 0;
    const state = room.state as { scoreTeamA?: number };
    return state.scoreTeamA ?? 0;
  }

  private getScoreB(): number {
    if (!this.network.connected) return 0;
    const room = this.network.currentRoom;
    if (!room) return 0;
    const state = room.state as { scoreTeamB?: number };
    return state.scoreTeamB ?? 0;
  }

  /** Sync weapon from server state — triggers switchWeapon if changed. */
  private syncWeaponFromServer(): void {
    if (!this.shootingSystem || !this.network.connected) return;
    const room = this.network.currentRoom;
    if (!room) return;
    const state = room.state as { players?: Map<string, { currentWeapon?: string }> };
    const local = state.players?.get(this.network.sessionId);
    if (local?.currentWeapon) {
      const serverWeapon = local.currentWeapon as WeaponId;
      if (serverWeapon !== this.shootingSystem.getWeaponId()) {
        this.shootingSystem.switchWeapon(serverWeapon);
        this.weaponModel?.switchWeapon(serverWeapon);
      }
    }
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

  private getScoreboardState(): ScoreboardState {
    const teamA: ScoreboardPlayer[] = [];
    const teamB: ScoreboardPlayer[] = [];
    const localSid = this.network.sessionId;

    const room = this.network.currentRoom;
    if (room) {
      const state = room.state as {
        players?: Map<string, { nickname?: string; team?: string; kills?: number; deaths?: number; isAlive?: boolean }>;
      };
      state.players?.forEach((p, sid) => {
        const entry: ScoreboardPlayer = {
          nickname: p.nickname ?? 'Unknown',
          kills: p.kills ?? 0,
          deaths: p.deaths ?? 0,
          isLocal: sid === localSid,
          isAlive: p.isAlive !== false,
        };
        if (p.team === 'A') teamA.push(entry);
        else if (p.team === 'B') teamB.push(entry);
      });
    }

    // Sort by kills descending
    const byKills = (a: ScoreboardPlayer, b: ScoreboardPlayer) => b.kills - a.kills;
    teamA.sort(byKills);
    teamB.sort(byKills);

    return { teamA, teamB, scoreA: this.getScoreA(), scoreB: this.getScoreB() };
  }

  /** Check if local player is alive from server state. */
  private isLocalPlayerAlive(): boolean {
    if (!this.network.connected) return true;
    const room = this.network.currentRoom;
    if (!room) return true;
    const state = room.state as { players?: Map<string, { isAlive?: boolean }> };
    const local = state.players?.get(this.network.sessionId);
    return local?.isAlive !== false;
  }

  /** Find an alive teammate to spectate. Returns { sessionId, nickname } or null. */
  private findAliveTeammate(): { sessionId: string; nickname: string } | null {
    if (!this.network.connected) return null;
    const room = this.network.currentRoom;
    if (!room) return null;
    const state = room.state as {
      players?: Map<string, { team?: string; isAlive?: boolean; nickname?: string }>;
    };
    if (!state.players) return null;

    const localPlayer = state.players.get(this.network.sessionId);
    const localTeam = localPlayer?.team;
    if (!localTeam || localTeam === 'unassigned') return null;

    let result: { sessionId: string; nickname: string } | null = null;
    state.players.forEach((p, sid) => {
      if (sid !== this.network.sessionId && p.team === localTeam && p.isAlive !== false) {
        result = { sessionId: sid, nickname: p.nickname ?? 'Unknown' };
      }
    });
    return result;
  }

  /** Update spectator mode: activate when dead, follow alive teammate. */
  private updateSpectator(dt: number): void {
    if (!this.spectator) return;

    const room = this.network.currentRoom;
    if (!room) return;
    const gameStatus = (room.state as { status?: string }).status;

    // Only spectate during playing phase
    if (gameStatus !== 'playing') {
      if (this.spectator.isActive()) this.spectator.deactivate();
      return;
    }

    const alive = this.isLocalPlayerAlive();

    if (alive) {
      // Player is alive — no spectating
      if (this.spectator.isActive()) this.spectator.deactivate();
      return;
    }

    // Player is dead — find alive teammate
    const teammate = this.findAliveTeammate();
    if (!teammate) {
      // No alive teammates — deactivate (round should end soon)
      if (this.spectator.isActive()) this.spectator.deactivate();
      return;
    }

    // Activate or update spectator target
    if (!this.spectator.isActive() || this.spectator.getTargetSessionId() !== teammate.sessionId) {
      this.spectator.activate(teammate.sessionId, teammate.nickname);
    }

    // Get interpolated position of the teammate
    const transform = this.remotePlayers?.getInterpolatedTransform(teammate.sessionId);
    if (transform) {
      this.spectator.updateCamera(
        transform.x,
        transform.y,
        transform.z,
        transform.yaw,
        transform.pitch,
        dt,
      );
    }
  }

  private getDebugState() {
    const pos = this.fpsController?.position ?? { x: 0, y: 0, z: 0 };
    let playerCount = 0;
    let serverTick = 0;
    const room = this.network.currentRoom;
    if (room) {
      const state = room.state as { players?: Map<string, unknown>; currentRound?: number };
      playerCount = state.players?.size ?? 0;
      serverTick = state.currentRound ?? 0;
    }
    return {
      fps: this.currentFps,
      ping: this.estimatedPing,
      posX: pos.x,
      posY: pos.y,
      posZ: pos.z,
      playerCount,
      serverTick,
    };
  }

  private getRoundTime(): number {
    if (!this.network.connected) return ROUND_TIME_LIMIT;
    const room = this.network.currentRoom;
    if (!room) return ROUND_TIME_LIMIT;
    const state = room.state as { roundTimer?: number };
    return state.roundTimer ?? ROUND_TIME_LIMIT;
  }

  /** Handle weapon switching via number keys (1/2/3) or scroll wheel. */
  private handleWeaponSwitch(fps: FPSController): void {
    const slot = fps.input.consumeWeaponSlot();
    const scroll = fps.input.consumeWeaponScroll();

    let targetWeapon: WeaponId | null = null;

    if (slot >= 1 && slot <= WEAPON_IDS.length) {
      targetWeapon = WEAPON_IDS[slot - 1];
    } else if (scroll !== 0) {
      const currentIdx = WEAPON_IDS.indexOf(this.shootingSystem!.getWeaponId());
      const nextIdx = (currentIdx + scroll + WEAPON_IDS.length) % WEAPON_IDS.length;
      targetWeapon = WEAPON_IDS[nextIdx];
    }

    if (targetWeapon && targetWeapon !== this.shootingSystem!.getWeaponId()) {
      this.switchToWeapon(targetWeapon);
    }
  }

  /** Switch weapon locally (model + shooting system) and notify server. */
  private switchToWeapon(weaponId: WeaponId): void {
    this.shootingSystem!.switchWeapon(weaponId);
    this.weaponModel!.switchWeapon(weaponId);
    this.network.send('selectWeapon', { weapon: weaponId });
    this.audioManager.playWeaponSwitch();
  }

  private animate = (now: number): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const fps = this.fpsController!;
    const weapon = this.weaponModel!;
    const shooting = this.shootingSystem!;
    const scene = this.sceneManager!;

    const isSpectating = this.spectator?.isActive() ?? false;

    if (!isSpectating) {
      // Handle weapon switching (1/2/3 keys or scroll wheel)
      if (fps.pointerLock.locked) {
        this.handleWeaponSwitch(fps);
      }

      // Handle R key for manual reload (audio played via onReloadStart callback)
      if (fps.pointerLock.locked && fps.input.consumeReload()) {
        shooting.startReload();
      }

      // Shooting: block during reload
      if (fps.pointerLock.locked && shooting.getAmmo() > 0 && !shooting.getIsReloading()) {
        const fired = weapon.tryFire(fps.input.mouseDown, now);
        if (fired) {
          const isMoving = fps.input.keys.w || fps.input.keys.a || fps.input.keys.s || fps.input.keys.d;
          if (shooting.fire(fps.position, fps.yaw, fps.pitch, isMoving)) {
            this.audioManager.playGunshot(shooting.getWeaponId());
          }
        }
      }

      fps.update(dt);

      // Footstep audio
      const isMoving = fps.input.keys.w || fps.input.keys.a || fps.input.keys.s || fps.input.keys.d;
      this.audioManager.playFootstep(isMoving, fps.getPhysicsState().isGrounded, dt);
    } else {
      // While spectating, consume inputs without acting on them
      fps.input.consumeMouseDelta();
      fps.input.consumeReload();
      fps.input.consumeWeaponSlot();
      fps.input.consumeWeaponScroll();
    }

    weapon.update(dt);
    shooting.update(dt);
    this.damageEffects?.update(dt);
    this.killFeed?.update(dt);

    if (this.debugOverlay?.isVisible()) {
      this.fpsFrameCount++;
      this.fpsAccumulator += dt;
      if (this.fpsAccumulator >= 1) {
        this.currentFps = Math.round(this.fpsFrameCount / this.fpsAccumulator);
        this.fpsFrameCount = 0;
        this.fpsAccumulator = 0;
      }
      this.debugOverlay.update(this.getDebugState());
    }

    // Scoreboard: show/hide on Tab hold, update data
    if (this.scoreboard) {
      const tabHeld = fps.input.tabHeld;
      this.scoreboard.setVisible(tabHeld);
      if (tabHeld) {
        this.scoreboard.update(this.getScoreboardState());
      }
    }

    if (!isSpectating) {
      // Apply smooth prediction correction offset
      if (this.prediction) {
        const delta = this.prediction.consumeCorrectionDelta();
        if (delta.dx !== 0 || delta.dy !== 0 || delta.dz !== 0) {
          fps.applyPositionDelta(delta.dx, delta.dy, delta.dz);
        }
      }

      // Sync weapon and ammo from authoritative server state
      this.syncWeaponFromServer();
      this.syncAmmoFromServer();

      // Send input to server after local prediction
      this.sendInput(dt);
    }

    // Update audio listener position/orientation to match camera
    if (this.fpsController) {
      const pos = this.fpsController.position;
      this.audioManager.updateListener(pos.x, pos.y, pos.z, this.fpsController.yaw);
    }

    // Interpolate remote players between server snapshots + walking animation
    this.remotePlayers?.updateInterpolation(dt);

    // Update spectator mode (camera follows alive teammate when dead)
    this.updateSpectator(dt);

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
        spectatingNickname: this.spectator?.isActive() ? this.spectator.getTargetNickname() : undefined,
      });
    }

    scene.render();
    // Only render weapon overlay when not spectating (dead player shouldn't see own weapon)
    if (!isSpectating) {
      scene.renderOverlay(weapon.scene, weapon.camera);
    }
  };
}

/** Minimal shape for PlayerSchema fields accessed on the client (remote players). */
interface PlayerData {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  team?: string;
}

/** Extended shape including fields needed for local player reconciliation. */
interface PlayerDataFull extends PlayerData {
  lastProcessedSeq?: number;
}
