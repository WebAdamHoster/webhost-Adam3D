import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0xcfeef8);
const scene = new THREE.Scene();

// Camera + controls
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);

const controls = new PointerLockControls(camera, canvas);
canvas.addEventListener('click', () => {
  controls.lock();
});
controls.addEventListener('unlock', () => {
  // no-op
});
scene.add(controls.getObject());

// lights
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(5, 10, 7);
scene.add(dir);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// world parameters
const BLOCK_SIZE = 1;
const player = {
  velocity: new THREE.Vector3(),
  onGround: false,
  height: 1.6,
  radius: 0.25
};

// Simple block store: key "x,y,z" => mesh
const blocks = new Map();

// Materials (few colors)
const blockMaterials = {
  dirt: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
  grass: new THREE.MeshLambertMaterial({ color: 0x5bb04f }),
  stone: new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }),
  sand: new THREE.MeshLambertMaterial({ color: 0xe6d09a })
};
let currentMaterial = blockMaterials.dirt;
document.getElementById('colorSwatch').style.background = '#8b5a2b';

// Cube geometry shared
const cubeGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

 // Create baseplate (flat area at y=0)
 const BASE_RADIUS = 24; // increased size
 for (let x = -BASE_RADIUS; x <= BASE_RADIUS; x++) {
   for (let z = -BASE_RADIUS; z <= BASE_RADIUS; z++) {
     addBlock(x, 0, z, blockMaterials.grass, false);
     // add a couple layers of dirt below so collisions feel real
     addBlock(x, -1, z, blockMaterials.dirt, false);
   }
 }

// helper to create keys
function keyFor(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, material = currentMaterial, addToMap = true) {
  const k = keyFor(x, y, z);
  if (blocks.has(k)) return null;
  const m = new THREE.Mesh(cubeGeo, material);
  m.position.set(x * BLOCK_SIZE + BLOCK_SIZE / 2, y * BLOCK_SIZE + BLOCK_SIZE / 2, z * BLOCK_SIZE + BLOCK_SIZE / 2);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  if (addToMap) blocks.set(k, m);
  else blocks.set(k, m); // baseplate also tracked
  return m;
}

function removeBlock(x, y, z) {
  const k = keyFor(x, y, z);
  const m = blocks.get(k);
  if (!m) return false;
  scene.remove(m);
  m.geometry.dispose();
  if (m.material && m.material.dispose) m.material.dispose();
  blocks.delete(k);
  return true;
}

// Resize handling
function onWindowResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onWindowResize);
onWindowResize();

// Input state (added vertical control: Space up, Shift down)
const keys = { w: false, a: false, s: false, d: false, Space: false, ShiftLeft: false };
addEventListener('keydown', (e) => {
  if (e.code === 'KeyW') keys.w = true;
  if (e.code === 'KeyA') keys.a = true;
  if (e.code === 'KeyS') keys.s = true;
  if (e.code === 'KeyD') keys.d = true;
  if (e.code === 'Space') keys.Space = true;
  if (e.code === 'ShiftLeft') keys.ShiftLeft = true;
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') keys.w = false;
  if (e.code === 'KeyA') keys.a = false;
  if (e.code === 'KeyS') keys.s = false;
  if (e.code === 'KeyD') keys.d = false;
  if (e.code === 'Space') keys.Space = false;
  if (e.code === 'ShiftLeft') keys.ShiftLeft = false;
});

// prevent context menu for right-click
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

 // Raycaster for interactions
 const raycaster = new THREE.Raycaster();
 raycaster.far = 6;

 // highlight helper: translucent box to show the block you're looking at
 const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthTest: false });
 const highlightGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
 const highlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
 highlightMesh.visible = false;
 scene.add(highlightMesh);

// Mouse clicks: left mine, right place
canvas.addEventListener('pointerdown', (e) => {
  if (!controls.isLocked) return;
  // compute ray from camera
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersectObjs = Array.from(blocks.values());
  const hits = raycaster.intersectObjects(intersectObjs, false);
  if (e.button === 0) { // left-click -> mine (remove)
    if (hits.length > 0) {
      const hit = hits[0];
      const pos = worldPosToBlock(hit.point.clone().sub(hit.face.normal.multiplyScalar(0.01)));
      removeBlock(pos.x, pos.y, pos.z);
    }
  } else if (e.button === 2) { // right-click -> place adjacent (always dirt)
    if (hits.length > 0) {
      const hit = hits[0];
      // place on the face we clicked (move along normal)
      const placedWorld = hit.point.clone().add(hit.face.normal.multiplyScalar(0.51));
      const pos = worldPosToBlock(placedWorld);
      // don't place into player
      if (!isPointInsidePlayer(new THREE.Vector3((pos.x + 0.5) * BLOCK_SIZE, (pos.y + 0.5) * BLOCK_SIZE, (pos.z + 0.5) * BLOCK_SIZE))) {
        addBlock(pos.x, pos.y, pos.z, blockMaterials.dirt);
      }
    } else {
      // if no hit, place in front of player at rounded coords (always dirt)
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const target = camera.position.clone().add(dir.multiplyScalar(4));
      const pos = worldPosToBlock(target);
      if (!isPointInsidePlayer(new THREE.Vector3((pos.x + 0.5) * BLOCK_SIZE, (pos.y + 0.5) * BLOCK_SIZE, (pos.z + 0.5) * BLOCK_SIZE))) {
        addBlock(pos.x, pos.y, pos.z, blockMaterials.dirt);
      }
    }
  }
});

// convert world pos to integer block coords
function worldPosToBlock(v) {
  return {
    x: Math.floor(v.x / BLOCK_SIZE),
    y: Math.floor(v.y / BLOCK_SIZE),
    z: Math.floor(v.z / BLOCK_SIZE)
  };
}

// player collision helpers
function blockAt(x, y, z) {
  return blocks.get(keyFor(x, y, z)) || null;
}

function isPointInsidePlayer(point) {
  // point is block center in world coords; check if within player's capsule
  const px = camera.position.x;
  const py = camera.position.y - player.height / 2;
  const pz = camera.position.z;
  const dx = Math.abs(point.x - px);
  const dz = Math.abs(point.z - pz);
  const horizontalDist = Math.sqrt(dx * dx + dz * dz);
  const halfHeight = player.height / 2 + BLOCK_SIZE / 2;
  const dy = Math.abs(point.y - (camera.position.y - player.height / 2));
  return horizontalDist < player.radius + BLOCK_SIZE / 2 && dy < halfHeight;
}

// Simple collision resolution: keep player above solids, stop horizontal overlap by nudging out
function resolveCollisions() {
  const feetY = camera.position.y - player.height;
  const headY = camera.position.y;
  // sample blocks around player
  const px = camera.position.x;
  const pz = camera.position.z;
  const minX = Math.floor((px - player.radius) / BLOCK_SIZE) - 1;
  const maxX = Math.floor((px + player.radius) / BLOCK_SIZE) + 1;
  const minZ = Math.floor((pz - player.radius) / BLOCK_SIZE) - 1;
  const maxZ = Math.floor((pz + player.radius) / BLOCK_SIZE) + 1;
  const minY = Math.floor((feetY - 1) / BLOCK_SIZE) - 1;
  const maxY = Math.floor((headY + 1) / BLOCK_SIZE) + 1;

  player.onGround = false;

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (!blockAt(x, y, z)) continue;
        // block bounds
        const bx = x * BLOCK_SIZE;
        const by = y * BLOCK_SIZE;
        const bz = z * BLOCK_SIZE;
        // AABB vs capsule simplified by pushing camera out if inside block expanded by radius
        const cx = camera.position.x;
        const cz = camera.position.z;
        // horizontal clamped
        const closestX = Math.max(bx, Math.min(cx, bx + BLOCK_SIZE));
        const closestZ = Math.max(bz, Math.min(cz, bz + BLOCK_SIZE));
        const distX = cx - (closestX);
        const distZ = cz - (closestZ);
        const hDistSq = distX * distX + distZ * distZ;
        const minDist = player.radius;
        if (hDistSq < minDist * minDist) {
          // push horizontally
          const h = Math.sqrt(Math.max(0.0001, hDistSq));
          const overlap = minDist - h;
          const nx = distX / (h || 0.0001);
          const nz = distZ / (h || 0.0001);
          camera.position.x += nx * overlap;
          camera.position.z += nz * overlap;
        }
        // vertical collision: if player's feet below top of block and above bottom, push up and set onGround
        const top = by + BLOCK_SIZE;
        const bottom = by;
        if (camera.position.x > bx - player.radius && camera.position.x < bx + BLOCK_SIZE + player.radius &&
            camera.position.z > bz - player.radius && camera.position.z < bz + BLOCK_SIZE + player.radius) {
          if (feetY < top && feetY > bottom - player.height) {
            // standing on block
            camera.position.y = top + player.height;
            player.velocity.y = 0;
            player.onGround = true;
          }
        }
      }
    }
  }
}

// movement parameters
const MOVE_SPEED = 5;
const JUMP_SPEED = 6;
const GRAVITY = 20;

// clock
const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(0.05, clock.getDelta());
  // movement input
  const dir = new THREE.Vector3();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

  // update highlight each frame: cast center ray and position the translucent box on the hit block
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersectObjs = Array.from(blocks.values());
  const hoverHits = raycaster.intersectObjects(intersectObjs, false);
  if (hoverHits.length > 0) {
    const hh = hoverHits[0];
    const bx = Math.floor(hh.point.x / BLOCK_SIZE);
    const by = Math.floor(hh.point.y / BLOCK_SIZE);
    const bz = Math.floor(hh.point.z / BLOCK_SIZE);
    highlightMesh.position.set(bx * BLOCK_SIZE + BLOCK_SIZE / 2, by * BLOCK_SIZE + BLOCK_SIZE / 2, bz * BLOCK_SIZE + BLOCK_SIZE / 2);
    highlightMesh.visible = true;
  } else {
    highlightMesh.visible = false;
  }

  if (keys.w) dir.add(forward);
  if (keys.s) dir.sub(forward);
  if (keys.a) dir.add(right);
  if (keys.d) dir.sub(right);
  dir.normalize();

  // apply horizontal movement (forward/right)
  camera.position.addScaledVector(dir, MOVE_SPEED * dt);

  // vertical noclip movement: Space = up, Shift = down
  if (keys.Space) camera.position.y += MOVE_SPEED * dt;
  if (keys.ShiftLeft) camera.position.y -= MOVE_SPEED * dt;

  // clamp world Y so you don't fall infinitely off-screen accidentally
  camera.position.y = Math.max(-200, Math.min(200, camera.position.y));

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// Optional: simple crosshair
const cross = document.createElement('div');
Object.assign(cross.style, {
  position: 'fixed',
  left: '50%',
  top: '50%',
  width: '2px',
  height: '2px',
  marginLeft: '-1px',
  marginTop: '-1px',
  background: 'rgba(0,0,0,0.7)',
  pointerEvents: 'none'
});
document.body.appendChild(cross);

// allow switching block types via number keys 1-4
addEventListener('keydown', (e) => {
  if (e.code === 'Digit1') { currentMaterial = blockMaterials.dirt; document.getElementById('colorSwatch').style.background = '#8b5a2b'; }
  if (e.code === 'Digit2') { currentMaterial = blockMaterials.grass; document.getElementById('colorSwatch').style.background = '#5bb04f'; }
  if (e.code === 'Digit3') { currentMaterial = blockMaterials.stone; document.getElementById('colorSwatch').style.background = '#9aa0a6'; }
  if (e.code === 'Digit4') { currentMaterial = blockMaterials.sand; document.getElementById('colorSwatch').style.background = '#e6d09a'; }
});