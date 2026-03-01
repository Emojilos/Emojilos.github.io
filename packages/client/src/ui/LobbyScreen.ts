/**
 * Lobby screen: room code display, team selection, settings, start button.
 * Dark theme (#1a1a2e background, #ff6b00 accents).
 */

import type { GameMode, MapId, RoundsToWin, Team } from '@browserstrike/shared';
import { MAPS, MAP_IDS } from '@browserstrike/shared';

export interface LobbyCallbacks {
  onJoinTeam: (team: Team) => void;
  onUpdateSettings: (settings: { mode?: GameMode; mapId?: MapId; roundsToWin?: RoundsToWin }) => void;
  onStartGame: () => void;
  onLeave: () => void;
}

interface PlayerInfo {
  sessionId: string;
  nickname: string;
  team: Team;
}

interface LobbyState {
  roomCode: string;
  adminId: string;
  localSessionId: string;
  players: PlayerInfo[];
  settings: {
    mode: GameMode;
    mapId: MapId;
    roundsToWin: RoundsToWin;
  };
}

export class LobbyScreen {
  private container: HTMLElement;
  private callbacks: LobbyCallbacks | null = null;
  private state: LobbyState = {
    roomCode: '',
    adminId: '',
    localSessionId: '',
    players: [],
    settings: { mode: '2v2', mapId: 'warehouse', roundsToWin: 5 },
  };

  // DOM references
  private codeDisplay!: HTMLElement;
  private copyBtn!: HTMLButtonElement;
  private teamAList!: HTMLElement;
  private teamBList!: HTMLElement;
  private unassignedList!: HTMLElement;
  private joinABtn!: HTMLButtonElement;
  private joinBBtn!: HTMLButtonElement;
  private settingsPanel!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private leaveBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  setCallbacks(callbacks: LobbyCallbacks): void {
    this.callbacks = callbacks;
  }

  private build(): void {
    this.container.innerHTML = '';
    this.container.className = 'screen';

    const panel = document.createElement('div');
    panel.className = 'lobby-panel';

    // Header: Room code
    const header = document.createElement('div');
    header.className = 'lobby-header';

    const codeLabel = document.createElement('span');
    codeLabel.className = 'lobby-code-label';
    codeLabel.textContent = 'Room Code';
    header.appendChild(codeLabel);

    const codeRow = document.createElement('div');
    codeRow.className = 'lobby-code-row';

    this.codeDisplay = document.createElement('span');
    this.codeDisplay.className = 'lobby-code';
    this.codeDisplay.textContent = '------';
    codeRow.appendChild(this.codeDisplay);

    this.copyBtn = document.createElement('button');
    this.copyBtn.className = 'lobby-copy-btn';
    this.copyBtn.textContent = 'Copy';
    this.copyBtn.addEventListener('click', () => this.handleCopy());
    codeRow.appendChild(this.copyBtn);

    header.appendChild(codeRow);
    panel.appendChild(header);

    // Teams section
    const teamsSection = document.createElement('div');
    teamsSection.className = 'lobby-teams';

    // Team A column
    const teamACol = document.createElement('div');
    teamACol.className = 'lobby-team-col';
    const teamAHeader = document.createElement('div');
    teamAHeader.className = 'lobby-team-header lobby-team-a-header';
    teamAHeader.textContent = 'Team A';
    teamACol.appendChild(teamAHeader);
    this.teamAList = document.createElement('div');
    this.teamAList.className = 'lobby-team-list';
    teamACol.appendChild(this.teamAList);
    this.joinABtn = document.createElement('button');
    this.joinABtn.className = 'menu-btn lobby-team-btn lobby-team-a-btn';
    this.joinABtn.textContent = 'Join Team A';
    this.joinABtn.addEventListener('click', () => {
      this.callbacks?.onJoinTeam('A');
    });
    teamACol.appendChild(this.joinABtn);
    teamsSection.appendChild(teamACol);

    // VS divider
    const vs = document.createElement('div');
    vs.className = 'lobby-vs';
    vs.textContent = 'VS';
    teamsSection.appendChild(vs);

    // Team B column
    const teamBCol = document.createElement('div');
    teamBCol.className = 'lobby-team-col';
    const teamBHeader = document.createElement('div');
    teamBHeader.className = 'lobby-team-header lobby-team-b-header';
    teamBHeader.textContent = 'Team B';
    teamBCol.appendChild(teamBHeader);
    this.teamBList = document.createElement('div');
    this.teamBList.className = 'lobby-team-list';
    teamBCol.appendChild(this.teamBList);
    this.joinBBtn = document.createElement('button');
    this.joinBBtn.className = 'menu-btn lobby-team-btn lobby-team-b-btn';
    this.joinBBtn.textContent = 'Join Team B';
    this.joinBBtn.addEventListener('click', () => {
      this.callbacks?.onJoinTeam('B');
    });
    teamBCol.appendChild(this.joinBBtn);
    teamsSection.appendChild(teamBCol);

    panel.appendChild(teamsSection);

    // Unassigned players
    this.unassignedList = document.createElement('div');
    this.unassignedList.className = 'lobby-unassigned';
    panel.appendChild(this.unassignedList);

    // Settings panel (admin only)
    this.settingsPanel = document.createElement('div');
    this.settingsPanel.className = 'lobby-settings';
    this.buildSettings();
    panel.appendChild(this.settingsPanel);

    // Status message
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'lobby-status';
    panel.appendChild(this.statusEl);

    // Bottom buttons
    const bottomRow = document.createElement('div');
    bottomRow.className = 'lobby-bottom-row';

    this.leaveBtn = document.createElement('button');
    this.leaveBtn.className = 'menu-btn menu-btn-secondary';
    this.leaveBtn.textContent = 'Leave';
    this.leaveBtn.addEventListener('click', () => this.callbacks?.onLeave());
    bottomRow.appendChild(this.leaveBtn);

    this.startBtn = document.createElement('button');
    this.startBtn.className = 'menu-btn menu-btn-primary lobby-start-btn';
    this.startBtn.textContent = 'Start Game';
    this.startBtn.addEventListener('click', () => this.callbacks?.onStartGame());
    bottomRow.appendChild(this.startBtn);

    panel.appendChild(bottomRow);
    this.container.appendChild(panel);
  }

  private buildSettings(): void {
    this.settingsPanel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'lobby-settings-title';
    title.textContent = 'Match Settings';
    this.settingsPanel.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'lobby-settings-grid';

    // Mode select
    grid.appendChild(this.createSettingRow('Mode', () => {
      const select = document.createElement('select');
      select.className = 'lobby-select';
      for (const mode of ['1v1', '2v2'] as GameMode[]) {
        const opt = document.createElement('option');
        opt.value = mode;
        opt.textContent = mode;
        if (mode === this.state.settings.mode) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        this.callbacks?.onUpdateSettings({ mode: select.value as GameMode });
      });
      return select;
    }));

    // Map select
    grid.appendChild(this.createSettingRow('Map', () => {
      const select = document.createElement('select');
      select.className = 'lobby-select';
      for (const mapId of MAP_IDS) {
        const opt = document.createElement('option');
        opt.value = mapId;
        opt.textContent = MAPS[mapId].name;
        if (mapId === this.state.settings.mapId) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        this.callbacks?.onUpdateSettings({ mapId: select.value as MapId });
      });
      return select;
    }));

    // Rounds to win
    grid.appendChild(this.createSettingRow('Rounds', () => {
      const select = document.createElement('select');
      select.className = 'lobby-select';
      for (const r of [5, 7, 10, 13] as RoundsToWin[]) {
        const opt = document.createElement('option');
        opt.value = String(r);
        opt.textContent = `First to ${r}`;
        if (r === this.state.settings.roundsToWin) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        this.callbacks?.onUpdateSettings({ roundsToWin: Number(select.value) as RoundsToWin });
      });
      return select;
    }));

    this.settingsPanel.appendChild(grid);
  }

  private createSettingRow(label: string, createControl: () => HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'lobby-setting-row';

    const lbl = document.createElement('span');
    lbl.className = 'lobby-setting-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    row.appendChild(createControl());
    return row;
  }

  private handleCopy(): void {
    const code = this.state.roomCode;
    if (!code) return;

    const showCopied = () => {
      this.copyBtn.textContent = 'Copied!';
      setTimeout(() => { this.copyBtn.textContent = 'Copy'; }, 1500);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(showCopied).catch(() => this.execCommandCopy(code, showCopied));
    } else {
      this.execCommandCopy(code, showCopied);
    }
  }

  private execCommandCopy(text: string, onSuccess: () => void): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      onSuccess();
    } finally {
      document.body.removeChild(ta);
    }
  }

  /** Update the lobby UI from Colyseus state. */
  update(newState: Partial<LobbyState>): void {
    if (newState.roomCode !== undefined) this.state.roomCode = newState.roomCode;
    if (newState.adminId !== undefined) this.state.adminId = newState.adminId;
    if (newState.localSessionId !== undefined) this.state.localSessionId = newState.localSessionId;
    if (newState.players !== undefined) this.state.players = newState.players;
    if (newState.settings !== undefined) {
      Object.assign(this.state.settings, newState.settings);
    }
    this.render();
  }

  private render(): void {
    const isAdmin = this.state.localSessionId === this.state.adminId;

    // Room code
    this.codeDisplay.textContent = this.state.roomCode || '------';

    // Team lists
    const teamA = this.state.players.filter(p => p.team === 'A');
    const teamB = this.state.players.filter(p => p.team === 'B');
    const unassigned = this.state.players.filter(p => p.team === 'unassigned');

    this.renderTeamList(this.teamAList, teamA);
    this.renderTeamList(this.teamBList, teamB);

    // Unassigned
    if (unassigned.length > 0) {
      this.unassignedList.style.display = '';
      this.unassignedList.innerHTML = '<span class="lobby-unassigned-label">Unassigned: </span>' +
        unassigned.map(p => `<span class="lobby-player-name">${this.escapeHtml(p.nickname)}</span>`).join(', ');
    } else {
      this.unassignedList.style.display = 'none';
    }

    // Highlight current team buttons
    const localPlayer = this.state.players.find(p => p.sessionId === this.state.localSessionId);
    const localTeam = localPlayer?.team ?? 'unassigned';
    this.joinABtn.classList.toggle('lobby-team-btn-active', localTeam === 'A');
    this.joinBBtn.classList.toggle('lobby-team-btn-active', localTeam === 'B');

    // Settings: admin can edit, others see read-only
    const selects = this.settingsPanel.querySelectorAll('select');
    selects.forEach(sel => {
      (sel as HTMLSelectElement).disabled = !isAdmin;
    });

    // Update select values from state (skip focused selects to avoid disrupting user input)
    const selectEls = Array.from(selects) as HTMLSelectElement[];
    const focused = document.activeElement;
    if (selectEls[0] && selectEls[0] !== focused) selectEls[0].value = this.state.settings.mode;
    if (selectEls[1] && selectEls[1] !== focused) selectEls[1].value = this.state.settings.mapId;
    if (selectEls[2] && selectEls[2] !== focused) selectEls[2].value = String(this.state.settings.roundsToWin);

    // Start button: only admin, only when teams are staffed
    const mode = this.state.settings.mode;
    const requiredPerTeam = mode === '1v1' ? 1 : 2;
    const teamsReady = teamA.length >= requiredPerTeam && teamB.length >= requiredPerTeam;

    this.startBtn.style.display = isAdmin ? '' : 'none';
    this.startBtn.disabled = !teamsReady;

    // Status message
    if (!teamsReady) {
      const needed = requiredPerTeam;
      this.statusEl.textContent = `Waiting for players... (${needed} per team for ${mode})`;
      this.statusEl.style.display = '';
    } else if (!isAdmin) {
      this.statusEl.textContent = 'Waiting for host to start the game...';
      this.statusEl.style.display = '';
    } else {
      this.statusEl.style.display = 'none';
    }
  }

  private renderTeamList(container: HTMLElement, players: PlayerInfo[]): void {
    container.innerHTML = '';
    if (players.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lobby-team-empty';
      empty.textContent = 'Empty';
      container.appendChild(empty);
      return;
    }
    for (const p of players) {
      const el = document.createElement('div');
      el.className = 'lobby-team-player';
      const isLocal = p.sessionId === this.state.localSessionId;
      const isAdmin = p.sessionId === this.state.adminId;
      el.innerHTML =
        `<span class="lobby-player-name${isLocal ? ' lobby-player-local' : ''}">${this.escapeHtml(p.nickname)}</span>` +
        (isAdmin ? '<span class="lobby-admin-badge">HOST</span>' : '');
      container.appendChild(el);
    }
  }

  private escapeHtml(s: string): string {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  reset(): void {
    this.state = {
      roomCode: '',
      adminId: '',
      localSessionId: '',
      players: [],
      settings: { mode: '2v2', mapId: 'warehouse', roundsToWin: 5 },
    };
    this.render();
  }
}
