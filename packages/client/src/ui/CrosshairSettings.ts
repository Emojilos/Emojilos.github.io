/**
 * Crosshair Settings UI: color presets + HEX input, size/thickness/gap sliders,
 * center dot and outline toggles, live preview.
 * Settings persist to localStorage.
 */

const STORAGE_KEY = 'browserstrike_crosshair';

const COLOR_PRESETS: { label: string; value: string }[] = [
  { label: 'Green', value: '#00ff44' },
  { label: 'Red', value: '#ff3c3c' },
  { label: 'White', value: '#ffffff' },
  { label: 'Yellow', value: '#ffdd00' },
];

export interface CrosshairConfig {
  color: string;      // HEX color
  size: number;        // arm length in px (4–40)
  thickness: number;   // arm thickness in px (1–6)
  gap: number;         // gap from center in px (0–20)
  dot: boolean;        // center dot
  outline: boolean;    // dark outline around arms
}

const DEFAULT_CONFIG: CrosshairConfig = {
  color: '#00ff44',
  size: 10,
  thickness: 2,
  gap: 0,
  dot: true,
  outline: true,
};

export class CrosshairSettings {
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private config: CrosshairConfig;
  private previewEl!: HTMLElement;
  private hexInput!: HTMLInputElement;
  private onUpdate: (() => void) | null = null;

  constructor() {
    this.config = this.load();

    this.overlay = document.createElement('div');
    this.overlay.className = 'crosshair-settings-overlay';
    this.overlay.style.display = 'none';

    this.panel = document.createElement('div');
    this.panel.className = 'crosshair-settings-panel';
    this.overlay.appendChild(this.panel);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    this.build();
    document.body.appendChild(this.overlay);
  }

  private build(): void {
    this.panel.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'cs-header';
    const title = document.createElement('h2');
    title.className = 'cs-title';
    title.textContent = 'Crosshair Settings';
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cs-close-btn';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);
    this.panel.appendChild(header);

    // Preview
    this.previewEl = document.createElement('div');
    this.previewEl.className = 'cs-preview';
    this.panel.appendChild(this.previewEl);

    // Color presets
    const colorSection = document.createElement('div');
    colorSection.className = 'cs-section';
    const colorLabel = document.createElement('label');
    colorLabel.className = 'cs-label';
    colorLabel.textContent = 'Color';
    colorSection.appendChild(colorLabel);

    const presetsRow = document.createElement('div');
    presetsRow.className = 'cs-presets';
    for (const preset of COLOR_PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'cs-preset-btn';
      btn.style.backgroundColor = preset.value;
      btn.title = preset.label;
      btn.addEventListener('click', () => {
        this.config.color = preset.value;
        this.hexInput.value = preset.value;
        this.save();
        this.updatePreview();
      });
      presetsRow.appendChild(btn);
    }
    colorSection.appendChild(presetsRow);

    // HEX input
    const hexRow = document.createElement('div');
    hexRow.className = 'cs-hex-row';
    const hexLabel = document.createElement('span');
    hexLabel.className = 'cs-hex-label';
    hexLabel.textContent = 'HEX';
    hexRow.appendChild(hexLabel);
    this.hexInput = document.createElement('input');
    this.hexInput.type = 'text';
    this.hexInput.className = 'cs-hex-input';
    this.hexInput.value = this.config.color;
    this.hexInput.maxLength = 7;
    this.hexInput.addEventListener('input', () => {
      const v = this.hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        this.config.color = v;
        this.save();
        this.updatePreview();
      }
    });
    hexRow.appendChild(this.hexInput);
    colorSection.appendChild(hexRow);
    this.panel.appendChild(colorSection);

    // Sliders
    this.addSlider('Size', 'size', 4, 40, 1);
    this.addSlider('Thickness', 'thickness', 1, 6, 1);
    this.addSlider('Gap', 'gap', 0, 20, 1);

    // Toggles
    const toggleSection = document.createElement('div');
    toggleSection.className = 'cs-section cs-toggles';
    this.addToggle(toggleSection, 'Center Dot', 'dot');
    this.addToggle(toggleSection, 'Outline', 'outline');
    this.panel.appendChild(toggleSection);

    this.updatePreview();
  }

  private addSlider(label: string, key: 'size' | 'thickness' | 'gap', min: number, max: number, step: number): void {
    const section = document.createElement('div');
    section.className = 'cs-section';

    const row = document.createElement('div');
    row.className = 'cs-slider-row';

    const lbl = document.createElement('label');
    lbl.className = 'cs-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const valLabel = document.createElement('span');
    valLabel.className = 'cs-value';
    valLabel.textContent = String(this.config[key]);
    row.appendChild(valLabel);

    section.appendChild(row);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'cs-slider';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(this.config[key]);
    slider.addEventListener('input', () => {
      this.config[key] = parseInt(slider.value, 10);
      valLabel.textContent = slider.value;
      this.save();
      this.updatePreview();
    });
    section.appendChild(slider);
    this.panel.appendChild(section);
  }

  private addToggle(parent: HTMLElement, label: string, key: 'dot' | 'outline'): void {
    const row = document.createElement('label');
    row.className = 'cs-toggle-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'cs-checkbox';
    checkbox.checked = this.config[key];
    checkbox.addEventListener('change', () => {
      this.config[key] = checkbox.checked;
      this.save();
      this.updatePreview();
    });
    row.appendChild(checkbox);

    const text = document.createElement('span');
    text.textContent = label;
    row.appendChild(text);

    parent.appendChild(row);
  }

  private updatePreview(): void {
    const { color, size, thickness, gap, dot, outline } = this.config;
    const half = thickness / 2;
    const shadow = outline ? `box-shadow: 0 0 1px 1px rgba(0,0,0,0.8);` : '';

    this.previewEl.innerHTML = `
      <div style="position:relative; width:${size * 2 + gap * 2 + thickness}px; height:${size * 2 + gap * 2 + thickness}px;">
        <!-- Left arm -->
        <div style="position:absolute; background:${color}; width:${size}px; height:${thickness}px;
          top:50%; left:0; transform:translateY(-50%); margin-left:0; ${shadow}"></div>
        <!-- Right arm -->
        <div style="position:absolute; background:${color}; width:${size}px; height:${thickness}px;
          top:50%; right:0; transform:translateY(-50%); ${shadow}"></div>
        <!-- Top arm -->
        <div style="position:absolute; background:${color}; width:${thickness}px; height:${size}px;
          left:50%; top:0; transform:translateX(-50%); ${shadow}"></div>
        <!-- Bottom arm -->
        <div style="position:absolute; background:${color}; width:${thickness}px; height:${size}px;
          left:50%; bottom:0; transform:translateX(-50%); ${shadow}"></div>
        ${dot ? `<div style="position:absolute; background:${color}; width:${Math.max(thickness, 2)}px; height:${Math.max(thickness, 2)}px;
          top:50%; left:50%; transform:translate(-50%,-50%); border-radius:50%; ${shadow}"></div>` : ''}
      </div>
    `;

    this.onUpdate?.();
  }

  /** Apply current config to the in-game HUD crosshair elements */
  applyToHUD(): void {
    const { color, size, thickness, gap, dot, outline } = this.config;
    const shadow = outline ? '0 0 2px rgba(0,0,0,0.8)' : 'none';

    const crosshair = document.querySelector('.hud-crosshair') as HTMLElement | null;
    if (!crosshair) return;

    const hEl = crosshair.querySelector('.hud-cross-h') as HTMLElement | null;
    const vEl = crosshair.querySelector('.hud-cross-v') as HTMLElement | null;
    const dotEl = crosshair.querySelector('.hud-cross-dot') as HTMLElement | null;

    if (hEl) {
      hEl.style.width = `${size}px`;
      hEl.style.height = `${thickness}px`;
      hEl.style.top = `${-thickness / 2}px`;
      hEl.style.background = color;
      hEl.style.boxShadow = shadow;
      // Gap: we use two separate horizontal arms. Currently it's one element.
      // We need to split into left+right. Let's use clip-path to create the gap.
      if (gap > 0) {
        // Hide center portion
        hEl.style.left = `${-(size + gap)}px`;
        hEl.style.width = `${size * 2 + gap * 2}px`;
        hEl.style.clipPath = `polygon(0 0, calc(50% - ${gap}px) 0, calc(50% - ${gap}px) 100%, 0 100%, 0 0, calc(50% + ${gap}px) 0, 100% 0, 100% 100%, calc(50% + ${gap}px) 100%)`;
      } else {
        hEl.style.left = `${-size}px`;
        hEl.style.width = `${size * 2}px`;
        hEl.style.clipPath = '';
      }
    }

    if (vEl) {
      vEl.style.height = `${size}px`;
      vEl.style.width = `${thickness}px`;
      vEl.style.left = `${-thickness / 2}px`;
      vEl.style.background = color;
      vEl.style.boxShadow = shadow;
      if (gap > 0) {
        vEl.style.top = `${-(size + gap)}px`;
        vEl.style.height = `${size * 2 + gap * 2}px`;
        vEl.style.clipPath = `polygon(0 0, 100% 0, 100% calc(50% - ${gap}px), 0 calc(50% - ${gap}px), 0 calc(50% + ${gap}px), 100% calc(50% + ${gap}px), 100% 100%, 0 100%)`;
      } else {
        vEl.style.top = `${-size}px`;
        vEl.style.height = `${size * 2}px`;
        vEl.style.clipPath = '';
      }
    }

    if (dotEl) {
      if (dot) {
        dotEl.style.display = '';
        dotEl.style.width = `${Math.max(thickness, 2)}px`;
        dotEl.style.height = `${Math.max(thickness, 2)}px`;
        dotEl.style.top = `${-Math.max(thickness, 2) / 2}px`;
        dotEl.style.left = `${-Math.max(thickness, 2) / 2}px`;
        dotEl.style.background = color;
      } else {
        dotEl.style.display = 'none';
      }
    }
  }

  getConfig(): CrosshairConfig {
    return { ...this.config };
  }

  /** Register a callback for when settings change (to re-apply to HUD) */
  setOnUpdate(cb: () => void): void {
    this.onUpdate = cb;
  }

  show(): void {
    this.config = this.load();
    this.build();
    this.overlay.style.display = 'flex';
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }

  isVisible(): boolean {
    return this.overlay.style.display !== 'none';
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch { /* ignore */ }
  }

  private load(): CrosshairConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_CONFIG };
  }

  dispose(): void {
    this.overlay.remove();
  }
}
