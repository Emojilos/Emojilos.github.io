import * as THREE from 'three';

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  constructor(canvas: HTMLCanvasElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1a1a2e);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1a1a2e, 30, 60);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 1.65, 5);

    // Lighting
    this.setupLighting();

    // Resize handler
    window.addEventListener('resize', this.onResize);
  }

  private setupLighting(): void {
    // Ambient light for base illumination
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    // Main directional light (sun-like)
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.0);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 60;
    dirLight.shadow.camera.left = -25;
    dirLight.shadow.camera.right = 25;
    dirLight.shadow.camera.top = 25;
    dirLight.shadow.camera.bottom = -25;
    this.scene.add(dirLight);

    // Fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0x8888aa, 0.3);
    fillLight.position.set(-10, 10, -10);
    this.scene.add(fillLight);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Render a second scene on top (weapon overlay). Clears only depth buffer. */
  renderOverlay(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(scene, camera);
    this.renderer.autoClear = true;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
