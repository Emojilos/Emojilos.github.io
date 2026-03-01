import * as THREE from 'three';

export type QualityLevel = 'low' | 'medium' | 'high';

interface QualityConfig {
  shadowMapSize: number;
  shadowsEnabled: boolean;
  pixelRatio: number;
  fogNear: number;
  fogFar: number;
  maxDecals: number;
  maxTracers: number;
  antialias: boolean;
}

const QUALITY_CONFIGS: Record<QualityLevel, QualityConfig> = {
  low: {
    shadowMapSize: 512,
    shadowsEnabled: false,
    pixelRatio: 1,
    fogNear: 20,
    fogFar: 40,
    maxDecals: 16,
    maxTracers: 8,
    antialias: false,
  },
  medium: {
    shadowMapSize: 1024,
    shadowsEnabled: true,
    pixelRatio: Math.min(window.devicePixelRatio, 1.5),
    fogNear: 30,
    fogFar: 60,
    maxDecals: 32,
    maxTracers: 16,
    antialias: true,
  },
  high: {
    shadowMapSize: 2048,
    shadowsEnabled: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    fogNear: 30,
    fogFar: 60,
    maxDecals: 64,
    maxTracers: 32,
    antialias: true,
  },
};

const STORAGE_KEY = 'browserstrike_quality';

export class QualitySettings {
  private level: QualityLevel;

  constructor() {
    this.level = (localStorage.getItem(STORAGE_KEY) as QualityLevel) || 'high';
    if (!QUALITY_CONFIGS[this.level]) this.level = 'high';
  }

  getLevel(): QualityLevel {
    return this.level;
  }

  getConfig(): QualityConfig {
    return QUALITY_CONFIGS[this.level];
  }

  setLevel(level: QualityLevel): void {
    this.level = level;
    localStorage.setItem(STORAGE_KEY, level);
  }

  applyToRenderer(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    const config = this.getConfig();
    renderer.shadowMap.enabled = config.shadowsEnabled;
    renderer.setPixelRatio(config.pixelRatio);

    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = config.fogNear;
      scene.fog.far = config.fogFar;
    }

    // Update shadow maps on directional lights
    scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight && obj.shadow) {
        obj.shadow.mapSize.width = config.shadowMapSize;
        obj.shadow.mapSize.height = config.shadowMapSize;
        if (obj.shadow.map) {
          obj.shadow.map.dispose();
          obj.shadow.map = null as unknown as THREE.WebGLRenderTarget;
        }
      }
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  getMaxDecals(): number {
    return this.getConfig().maxDecals;
  }

  getMaxTracers(): number {
    return this.getConfig().maxTracers;
  }
}
