import { SceneManager } from './engine/SceneManager';
import { buildWarehouseMap } from './engine/MapBuilder';
import { FPSController } from './engine/FPSController';

const canvas = document.getElementById('game') as HTMLCanvasElement;

const sceneManager = new SceneManager(canvas);
const collisionWorld = buildWarehouseMap(sceneManager.scene);

const fpsController = new FPSController(sceneManager.camera, canvas);
fpsController.setCollisionWorld(collisionWorld);

let lastTime = performance.now();

function animate(now: number) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms to avoid huge jumps
  lastTime = now;

  fpsController.update(dt);
  sceneManager.render();
}

requestAnimationFrame(animate);

console.log('BrowserStrike client loaded — click canvas to enable FPS controls');
