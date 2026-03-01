/**
 * Main Menu screen: nickname input, create/join room.
 * Dark theme (#1a1a2e background, #ff6b00 accents).
 */

const NICKNAME_REGEX = /^[A-Za-z0-9_]+$/;
const NICKNAME_MIN = 3;
const NICKNAME_MAX = 16;
const ROOM_CODE_LENGTH = 6;

export interface MenuCallbacks {
  onCreateRoom: (nickname: string) => Promise<void>;
  onJoinRoom: (roomCode: string, nickname: string) => Promise<void>;
  onOpenSettings?: () => void;
  onOpenCrosshairSettings?: () => void;
}

export class MenuScreen {
  private container: HTMLElement;
  private nicknameInput!: HTMLInputElement;
  private codeInput!: HTMLInputElement;
  private createBtn!: HTMLButtonElement;
  private joinBtn!: HTMLButtonElement;
  private errorEl!: HTMLElement;
  private callbacks: MenuCallbacks | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';
    this.container.className = 'screen';

    const panel = document.createElement('div');
    panel.className = 'menu-panel';

    // Title
    const title = document.createElement('h1');
    title.className = 'menu-title';
    title.textContent = 'BrowserStrike';
    panel.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'menu-subtitle';
    subtitle.textContent = '2v2 Tactical Shooter';
    panel.appendChild(subtitle);

    // Nickname
    const nickLabel = document.createElement('label');
    nickLabel.className = 'menu-label';
    nickLabel.textContent = 'Nickname';
    panel.appendChild(nickLabel);

    this.nicknameInput = document.createElement('input');
    this.nicknameInput.type = 'text';
    this.nicknameInput.className = 'menu-input';
    this.nicknameInput.placeholder = 'Player';
    this.nicknameInput.maxLength = NICKNAME_MAX;
    this.nicknameInput.autocomplete = 'off';
    this.nicknameInput.spellcheck = false;
    // Restore from localStorage
    const saved = localStorage.getItem('bs_nickname');
    if (saved) this.nicknameInput.value = saved;
    panel.appendChild(this.nicknameInput);

    // Create room button
    this.createBtn = document.createElement('button');
    this.createBtn.className = 'menu-btn menu-btn-primary';
    this.createBtn.textContent = 'Create Room';
    panel.appendChild(this.createBtn);

    // Divider
    const divider = document.createElement('div');
    divider.className = 'menu-divider';
    divider.innerHTML = '<span>or</span>';
    panel.appendChild(divider);

    // Join section
    const joinRow = document.createElement('div');
    joinRow.className = 'menu-join-row';

    this.codeInput = document.createElement('input');
    this.codeInput.type = 'text';
    this.codeInput.className = 'menu-input menu-code-input';
    this.codeInput.placeholder = 'Room Code';
    this.codeInput.maxLength = ROOM_CODE_LENGTH;
    this.codeInput.autocomplete = 'off';
    this.codeInput.spellcheck = false;
    this.codeInput.style.textTransform = 'uppercase';
    joinRow.appendChild(this.codeInput);

    this.joinBtn = document.createElement('button');
    this.joinBtn.className = 'menu-btn menu-btn-secondary';
    this.joinBtn.textContent = 'Join';
    joinRow.appendChild(this.joinBtn);

    panel.appendChild(joinRow);

    // Error message area
    this.errorEl = document.createElement('div');
    this.errorEl.className = 'menu-error';
    panel.appendChild(this.errorEl);

    this.container.appendChild(panel);

    // Settings buttons row (top-right)
    const settingsBtnRow = document.createElement('div');
    settingsBtnRow.className = 'menu-settings-row';

    const crosshairBtn = document.createElement('button');
    crosshairBtn.className = 'menu-settings-btn';
    crosshairBtn.innerHTML = '+'; // crosshair symbol
    crosshairBtn.title = 'Crosshair Settings';
    crosshairBtn.addEventListener('click', () => {
      if (this.callbacks?.onOpenCrosshairSettings) this.callbacks.onOpenCrosshairSettings();
    });
    settingsBtnRow.appendChild(crosshairBtn);

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'menu-settings-btn';
    settingsBtn.innerHTML = '&#9881;'; // gear symbol
    settingsBtn.title = 'Sound Settings';
    settingsBtn.addEventListener('click', () => {
      if (this.callbacks?.onOpenSettings) this.callbacks.onOpenSettings();
    });
    settingsBtnRow.appendChild(settingsBtn);

    this.container.appendChild(settingsBtnRow);

    // Event listeners
    this.createBtn.addEventListener('click', () => this.handleCreate());
    this.joinBtn.addEventListener('click', () => this.handleJoin());
    this.nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleCreate();
    });
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleJoin();
    });
    // Auto-capitalize room code input
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase();
    });
  }

  setCallbacks(callbacks: MenuCallbacks): void {
    this.callbacks = callbacks;
  }

  private validateNickname(): string | null {
    const nick = this.nicknameInput.value.trim();
    if (nick.length < NICKNAME_MIN) {
      return `Nickname must be at least ${NICKNAME_MIN} characters`;
    }
    if (nick.length > NICKNAME_MAX) {
      return `Nickname must be at most ${NICKNAME_MAX} characters`;
    }
    if (!NICKNAME_REGEX.test(nick)) {
      return 'Nickname: only letters, digits, and underscores';
    }
    return null;
  }

  showError(msg: string): void {
    this.errorEl.textContent = msg;
    this.errorEl.style.display = 'block';
  }

  private clearError(): void {
    this.errorEl.textContent = '';
    this.errorEl.style.display = 'none';
  }

  private setLoading(loading: boolean): void {
    this.createBtn.disabled = loading;
    this.joinBtn.disabled = loading;
    this.nicknameInput.disabled = loading;
    this.codeInput.disabled = loading;
    if (loading) {
      this.createBtn.textContent = 'Connecting...';
      this.joinBtn.textContent = '...';
    } else {
      this.createBtn.textContent = 'Create Room';
      this.joinBtn.textContent = 'Join';
    }
  }

  private async handleCreate(): Promise<void> {
    this.clearError();
    const nickErr = this.validateNickname();
    if (nickErr) {
      this.showError(nickErr);
      return;
    }
    const nick = this.nicknameInput.value.trim();
    localStorage.setItem('bs_nickname', nick);

    if (!this.callbacks) return;
    this.setLoading(true);
    try {
      await this.callbacks.onCreateRoom(nick);
    } catch (err) {
      this.showError(err instanceof Error ? err.message : 'Failed to create room');
      this.setLoading(false);
    }
  }

  private async handleJoin(): Promise<void> {
    this.clearError();
    const nickErr = this.validateNickname();
    if (nickErr) {
      this.showError(nickErr);
      return;
    }
    const code = this.codeInput.value.toUpperCase().trim();
    if (code.length !== ROOM_CODE_LENGTH) {
      this.showError(`Room code must be ${ROOM_CODE_LENGTH} characters`);
      return;
    }
    const nick = this.nicknameInput.value.trim();
    localStorage.setItem('bs_nickname', nick);

    if (!this.callbacks) return;
    this.setLoading(true);
    try {
      await this.callbacks.onJoinRoom(code, nick);
    } catch (err) {
      this.showError(err instanceof Error ? err.message : 'Failed to join room');
      this.setLoading(false);
    }
  }

  /** Reset UI state when returning to menu */
  reset(): void {
    this.clearError();
    this.setLoading(false);
    this.codeInput.value = '';
  }
}
