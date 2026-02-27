import { SceneManager } from './engine/SceneManager';
import { buildWarehouseMap } from './engine/MapBuilder';
import { FPSController } from './engine/FPSController';
import { WeaponModel } from './engine/WeaponModel';

const canvas = document.getElementById('game') as HTMLCanvasElement;

const sceneManager = new SceneManager(canvas);
const collisionWorld = buildWarehouseMap(sceneManager.scene);

const fpsController = new FPSController(sceneManager.camera, canvas);
fpsController.setCollisionWorld(collisionWorld);

const weaponModel = new WeaponModel(window.innerWidth / window.innerHeight);

// Keep weapon overlay camera aspect in sync
window.addEventListener('resize', () => {
  weaponModel.setAspect(window.innerWidth / window.innerHeight);
});

let lastTime = performance.now();

function animate(now: number) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms to avoid huge jumps
  lastTime = now;

  // Only process weapon fire when pointer is locked (in-game)
  if (fpsController.pointerLock.locked) {
    weaponModel.tryFire(fpsController.input.mouseDown, now);
  }

  fpsController.update(dt);
  weaponModel.update(dt);

  sceneManager.render();
  sceneManager.renderOverlay(weaponModel.scene, weaponModel.camera);
}

requestAnimationFrame(animate);

console.log('BrowserStrike client loaded — click canvas to enable FPS controls');
