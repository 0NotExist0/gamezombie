import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --- Canvas & Renderer ---
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// --- Scene & Fog ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7dc3e8);
scene.fog = new THREE.FogExp2(0x7dc3e8, 0.010);

// --- Camera ---
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 800);

// --- Lighting ---
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3b6e22, 0.9);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfffaed, 1.4);
dirLight.position.set(45, 80, 40);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 250;
const d = 60;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// --- Web Audio SFX ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(freq, duration, type = 'sine') {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// --- Procedural Low-Poly Terrain ---
const terrainSize = 300;
const terrainSegments = 80;
const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
terrainGeo.rotateX(-Math.PI / 2);

function smoothstep(min, max, value) {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

// Continuous procedural height function with smooth spawn blend (no cliffs or steps)
function getProceduralHeight(x, z) {
  const dist = Math.sqrt(x * x + z * z);
  // Smoothly blend from 0 at spawn (dist <= 8) to 1 at dist >= 24
  const spawnBlend = smoothstep(8, 24, dist);

  // Natural undulating hills
  const hills = Math.sin(x * 0.035) * Math.cos(z * 0.035) * 3.8 +
                Math.sin(x * 0.09 + z * 0.07) * 1.6;

  // Boundary perimeter mountains to keep player on map
  const edgeWalls = dist > 90 ? Math.pow((dist - 90) * 0.12, 1.6) : 0;

  return (hills * spawnBlend) + edgeWalls;
}

const posAttr = terrainGeo.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const z = posAttr.getZ(i);
  posAttr.setY(i, getProceduralHeight(x, z));
}
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({
  color: 0x4fb03d,
  roughness: 0.85,
  metalness: 0.05,
  flatShading: true
});
const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);

// --- EXACT MESH SURFACE COLLIDER (100% matches rendered 3D polygons) ---
const segs = terrainSegments;
const halfSize = terrainSize / 2;
const cellSize = terrainSize / segs;
const stride = segs + 1;

function getTerrainHeight(x, z) {
  if (x < -halfSize || x > halfSize || z < -halfSize || z > halfSize) {
    return 0;
  }

  const gx = (x + halfSize) / cellSize;
  const gz = (z + halfSize) / cellSize;

  const col = Math.floor(gx);
  const row = Math.floor(gz);

  if (col < 0 || col >= segs || row < 0 || row >= segs) {
    return 0;
  }

  const fx = gx - col;
  const fz = gz - row;

  // 4 corner vertex indices of the quad cell
  const idxTL = row * stride + col;
  const idxTR = idxTL + 1;
  const idxBL = (row + 1) * stride + col;
  const idxBR = idxBL + 1;

  const hTL = posAttr.getY(idxTL);
  const hTR = posAttr.getY(idxTR);
  const hBL = posAttr.getY(idxBL);
  const hBR = posAttr.getY(idxBR);

  // Exact planar equation of the specific triangle face in PlaneGeometry
  if (fx + fz < 1.0) {
    return hTL + (hTR - hTL) * fx + (hBL - hTL) * fz;
  } else {
    return hBR + (hBL - hBR) * (1 - fx) + (hTR - hBR) * (1 - fz);
  }
}

// --- Environment: Trees & Rocks with Obstacle Collision ---
const obstacles = [];

function createTree(x, z) {
  const y = getTerrainHeight(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 2.2, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4726, flatShading: true });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  group.add(trunk);

  const foliageMat = new THREE.MeshStandardMaterial({ 
    color: Math.random() > 0.4 ? 0x2e8b57 : 0x3cb371, 
    flatShading: true 
  });
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.4, 5), foliageMat);
  f1.position.y = 2.6;
  f1.castShadow = true;
  group.add(f1);

  const f2 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.0, 5), foliageMat);
  f2.position.y = 3.7;
  f2.castShadow = true;
  group.add(f2);

  scene.add(group);
  obstacles.push({ x, z, radius: 0.65 });
}

function createRock(x, z) {
  const y = getTerrainHeight(x, z);
  const rockGeo = new THREE.DodecahedronGeometry(0.8 + Math.random() * 0.8, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a8288, roughness: 0.9, flatShading: true });
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.position.set(x, y + 0.3, z);
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  rock.castShadow = true;
  scene.add(rock);
  obstacles.push({ x, z, radius: 0.95 });
}

for (let i = 0; i < 70; i++) {
  const ang = Math.random() * Math.PI * 2;
  const dist = 16 + Math.random() * 95;
  createTree(Math.cos(ang) * dist, Math.sin(ang) * dist);
}
for (let i = 0; i < 45; i++) {
  const ang = Math.random() * Math.PI * 2;
  const dist = 14 + Math.random() * 100;
  createRock(Math.cos(ang) * dist, Math.sin(ang) * dist);
}

// --- Collectible Gems ---
const gems = [];
let gemsCollected = 0;
const totalGems = 10;
const gemGeo = new THREE.OctahedronGeometry(0.5, 0);
const gemMat = new THREE.MeshStandardMaterial({
  color: 0x00f5d4,
  emissive: 0x00b4d8,
  emissiveIntensity: 0.6,
  roughness: 0.1,
  metalness: 0.8,
  flatShading: true
});

for (let i = 0; i < totalGems; i++) {
  const ang = (i / totalGems) * Math.PI * 2 + Math.random() * 0.3;
  const dist = 18 + Math.random() * 50;
  const gx = Math.cos(ang) * dist;
  const gz = Math.sin(ang) * dist;
  const gy = getTerrainHeight(gx, gz) + 1.2;

  const gem = new THREE.Mesh(gemGeo, gemMat.clone());
  gem.position.set(gx, gy, gz);
  gem.castShadow = true;
  gem.userData = { baseY: gy, collected: false, offset: Math.random() * Math.PI };
  scene.add(gem);
  gems.push(gem);
}

// --- Player State & Bone Hierarchy ---
const player = {
  group: new THREE.Group(),
  model: null,
  bones: {},
  restRotations: {},
  restPositions: {},
  headParts: [],
  position: new THREE.Vector3(0, 0, 0),
  velocity: new THREE.Vector3(),
  isGrounded: true,
  moveSpeed: 7.0,
  sprintMultiplier: 1.6,
  jumpStrength: 9.8,
  facingAngle: 0,
  walkCycle: 0
};
scene.add(player.group);

// Load Character GLB
const loader = new GLTFLoader();
loader.load('/character.glb', (gltf) => {
  player.model = gltf.scene;

  player.model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        child.material.flatShading = true;
        child.material.needsUpdate = true;
      }
      if (['Head', 'Hair', 'Hair_Tuft1', 'Hair_Tuft2', 'Eye_R', 'Eye_L'].includes(child.name)) {
        player.headParts.push(child);
      }
    }

    // Capture all Bone nodes and their rest transforms (both original and sanitized names)
    if (child.name) {
      const name = child.name;
      const stripped = name.replace(/\./g, '');
      player.bones[name] = child;
      player.bones[stripped] = child;
      player.restRotations[name] = child.rotation.clone();
      player.restRotations[stripped] = child.rotation.clone();
      player.restPositions[name] = child.position.clone();
      player.restPositions[stripped] = child.position.clone();
    }
  });

  player.group.add(player.model);
  console.log('🎮 Low-Poly Adventure — Not Exist Game Productions');
  console.log('👤 Developed by: 0Not_Exist0');
  console.log('🦴 Character and IK bones loaded successfully:', Object.keys(player.bones));
});

// --- Camera & View State ---
let isFirstPerson = false;
let invertX = true;       // Inverted horizontal rotation as requested
let invertY = false;      // Toggle invert Y (Normal: mouse up looks UP)
let cameraYaw = 0;       // Horizontal look angle in radians
let cameraPitch = 0.15;  // Vertical look angle in radians
const camDistance = 4.8;
const camHeightOffset = 1.35;

const camToggleBtn = document.getElementById('cam-toggle-btn');
const camModeText = document.getElementById('camera-mode-text');
const invertXToggleBtn = document.getElementById('invert-x-btn');
const invertXModeText = document.getElementById('invert-x-text');
const invertToggleBtn = document.getElementById('invert-toggle-btn');
const invertModeText = document.getElementById('invert-mode-text');
const crosshair = document.getElementById('crosshair');

function toggleCameraMode() {
  isFirstPerson = !isFirstPerson;
  camModeText.innerText = isFirstPerson ? '1ª PERSONA' : '3ª PERSONA';
  camToggleBtn.style.background = isFirstPerson ? '#ffd166' : '#06d6a0';
  camToggleBtn.style.color = isFirstPerson ? '#3d2e00' : '#0b3c31';
  crosshair.style.display = isFirstPerson ? 'block' : 'none';

  // In 1st person, hide head & hair so they don't clip the camera view
  player.headParts.forEach(p => p.visible = !isFirstPerson);
  playBeep(isFirstPerson ? 660 : 440, 0.08);
}

function toggleInvertX() {
  invertX = !invertX;
  if (invertXModeText) invertXModeText.innerText = invertX ? 'INVERTITO' : 'NORMALE';
  if (invertXToggleBtn) {
    invertXToggleBtn.style.background = invertX ? '#e76f51' : 'rgba(255,255,255,0.18)';
  }
  playBeep(invertX ? 520 : 380, 0.08);
}

function toggleInvertY() {
  invertY = !invertY;
  if (invertModeText) invertModeText.innerText = invertY ? 'INVERTITO' : 'NORMALE';
  if (invertToggleBtn) {
    invertToggleBtn.style.background = invertY ? '#e76f51' : 'rgba(255,255,255,0.18)';
  }
  playBeep(invertY ? 520 : 380, 0.08);
}

camToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCameraMode();
});

if (invertXToggleBtn) {
  invertXToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleInvertX();
  });
}

if (invertToggleBtn) {
  invertToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleInvertY();
  });
}

// --- Controls (Keyboard & Mouse) ---
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyV') {
    toggleCameraMode();
  }
  if (e.code === 'KeyX') {
    toggleInvertX();
  }
  if (e.code === 'KeyI') {
    toggleInvertY();
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// Pointer Lock & Touch Detection
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
const touchControlsElem = document.getElementById('touch-controls');

let gameStarted = false;

const overlay = document.getElementById('instructions-overlay');
const startBtn = document.getElementById('start-btn');

function startGame(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if (!isTouchDevice && document.body.requestPointerLock) {
    document.body.requestPointerLock();
  }
  gameStarted = true;
  if (isTouchDevice && touchControlsElem) {
    touchControlsElem.style.display = 'block';
  }
  overlay.style.opacity = '0';
  overlay.style.pointerEvents = 'none';
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 250);
  playBeep(520, 0.1, 'sine');
}

startBtn.addEventListener('click', startGame);
startBtn.addEventListener('touchend', startGame);
startBtn.addEventListener('pointerdown', startGame);

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) startGame(e);
});
overlay.addEventListener('touchend', (e) => {
  if (e.target === overlay) startGame(e);
});

document.addEventListener('pointerlockchange', () => {
  if (!isTouchDevice && document.pointerLockElement !== document.body) {
    gameStarted = false;
    overlay.style.display = 'flex';
    overlay.style.pointerEvents = 'auto';
    setTimeout(() => overlay.style.opacity = '1', 10);
  }
});

// Mouse Look - Standard FPS/TPS conventions
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === document.body) {
    const sensitivity = 0.0024;
    // Horizontal rotation (Yaw) - Inverted by default as requested
    const yawDelta = (invertX ? -e.movementX : e.movementX) * sensitivity;
    cameraYaw += yawDelta;

    // Moving mouse UP looks UP (pitch increases):
    // e.movementY is negative on mouse UP.
    // So with invertY=false: -e.movementY is positive -> pitch increases -> camera looks UP!
    const pitchDelta = (invertY ? e.movementY : -e.movementY) * sensitivity;
    cameraPitch += pitchDelta;

    if (isFirstPerson) {
      cameraPitch = Math.max(-1.45, Math.min(1.45, cameraPitch));
    } else {
      cameraPitch = Math.max(-0.65, Math.min(0.70, cameraPitch));
    }
  }
});

// --- SMARTPHONE / TOUCH CONTROLS LOGIC ---
let touchInputFwd = 0;
let touchInputRight = 0;
let touchSprinting = false;

// 1. Virtual Joystick (Move)
const joystickZone = document.getElementById('touch-joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');
let joystickTouchId = null;
let joystickCenter = { x: 0, y: 0 };
const maxJoystickRadius = 45;

if (joystickZone && joystickKnob) {
  joystickZone.addEventListener('touchstart', (e) => {
    if (!gameStarted) return;
    e.preventDefault();
    if (joystickTouchId !== null) return;
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    const rect = joystickZone.getBoundingClientRect();
    joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    updateJoystick(touch.clientX, touch.clientY);
  }, { passive: false });

  function updateJoystick(clientX, clientY) {
    let dx = clientX - joystickCenter.x;
    let dy = clientY - joystickCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxJoystickRadius) {
      dx = (dx / dist) * maxJoystickRadius;
      dy = (dy / dist) * maxJoystickRadius;
    }
    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

    const normX = dx / maxJoystickRadius;
    const normY = dy / maxJoystickRadius;

    // Screen Up (-dy) moves Forward (+1), Screen Down (+dy) moves Backward (-1)
    touchInputFwd = -normY;
    // Inverted right/left mapping to match A/D inversion
    touchInputRight = -normX;
  }

  window.addEventListener('touchmove', (e) => {
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId) {
        updateJoystick(touch.clientX, touch.clientY);
        break;
      }
    }
  }, { passive: true });

  const resetJoystick = (e) => {
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId) {
        joystickTouchId = null;
        joystickKnob.style.transform = 'translate(0px, 0px)';
        touchInputFwd = 0;
        touchInputRight = 0;
        break;
      }
    }
  };

  window.addEventListener('touchend', resetJoystick, { passive: true });
  window.addEventListener('touchcancel', resetJoystick, { passive: true });
}

// 2. Touch Camera Look Zone (Right screen drag)
const touchLookZone = document.getElementById('touch-look-zone');
let lookTouchId = null;
let lastLookX = 0;
let lastLookY = 0;

if (touchLookZone) {
  touchLookZone.addEventListener('touchstart', (e) => {
    if (!gameStarted) return;
    e.preventDefault();
    if (lookTouchId !== null) return;
    const touch = e.changedTouches[0];
    lookTouchId = touch.identifier;
    lastLookX = touch.clientX;
    lastLookY = touch.clientY;
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (lookTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lookTouchId) {
        const deltaX = touch.clientX - lastLookX;
        const deltaY = touch.clientY - lastLookY;
        lastLookX = touch.clientX;
        lastLookY = touch.clientY;

        const touchSensitivity = 0.0045;
        const yawDelta = (invertX ? -deltaX : deltaX) * touchSensitivity;
        cameraYaw += yawDelta;

        const pitchDelta = (invertY ? deltaY : -deltaY) * touchSensitivity;
        cameraPitch += pitchDelta;

        if (isFirstPerson) {
          cameraPitch = Math.max(-1.45, Math.min(1.45, cameraPitch));
        } else {
          cameraPitch = Math.max(-0.65, Math.min(0.70, cameraPitch));
        }
        break;
      }
    }
  }, { passive: true });

  const resetLook = (e) => {
    if (lookTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) {
        lookTouchId = null;
        break;
      }
    }
  };

  window.addEventListener('touchend', resetLook, { passive: true });
  window.addEventListener('touchcancel', resetLook, { passive: true });
}

// 3. Touch Buttons (Jump & Sprint)
const touchBtnJump = document.getElementById('touch-btn-jump');
if (touchBtnJump) {
  touchBtnJump.addEventListener('touchstart', (e) => {
    if (!gameStarted) return;
    e.preventDefault();
    e.stopPropagation();
    if (player.isGrounded) {
      player.velocity.y = player.jumpStrength;
      player.isGrounded = false;
      playBeep(420, 0.12, 'triangle');
    }
  }, { passive: false });
}

const touchBtnSprint = document.getElementById('touch-btn-sprint');
if (touchBtnSprint) {
  touchBtnSprint.addEventListener('touchstart', (e) => {
    if (!gameStarted) return;
    e.preventDefault();
    e.stopPropagation();
    touchSprinting = !touchSprinting;
    touchBtnSprint.classList.toggle('active', touchSprinting);
    playBeep(touchSprinting ? 580 : 360, 0.08);
  }, { passive: false });
}

// --- Game Logic & Physics Loop ---
const clock = new THREE.Clock();
const gravity = -24.0;

function updatePlayer(dt) {
  // 1. Calculate camera-relative forward and right vectors on XZ plane
  // When cameraYaw = 0: looking along +Z.
  const fwdX = Math.sin(cameraYaw);
  const fwdZ = Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = -Math.sin(cameraYaw);

  // 2. Read directional inputs (Keyboard + Touch Joystick)
  let inputFwd = touchInputFwd;
  let inputRight = touchInputRight;

  if (keys['KeyW'] || keys['ArrowUp']) inputFwd += 1;
  if (keys['KeyS'] || keys['ArrowDown']) inputFwd -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) inputRight += 1;
  if (keys['KeyD'] || keys['ArrowRight']) inputRight -= 1;

  const isMoving = Math.abs(inputFwd) > 0.05 || Math.abs(inputRight) > 0.05;
  const isSprinting = !!keys['ShiftLeft'] || !!keys['ShiftRight'] || touchSprinting;
  const currentSpeed = player.moveSpeed * (isSprinting ? player.sprintMultiplier : 1.0);

  if (isMoving) {
    // Combine into normalized move vector
    let moveDirX = fwdX * inputFwd + rightX * inputRight;
    let moveDirZ = fwdZ * inputFwd + rightZ * inputRight;
    const len = Math.sqrt(moveDirX * moveDirX + moveDirZ * moveDirZ);
    if (len > 0.0001) {
      moveDirX /= len;
      moveDirZ /= len;
    }

    player.velocity.x = moveDirX * currentSpeed;
    player.velocity.z = moveDirZ * currentSpeed;

    // In 3rd person: character faces movement direction
    // In 1st person: character faces camera direction
    const targetAngle = isFirstPerson ? cameraYaw : Math.atan2(moveDirX, moveDirZ);
    
    // Shortest angular interpolation
    let diff = targetAngle - player.facingAngle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    player.facingAngle += diff * 14 * dt;
  } else {
    // Decelerate smoothly
    player.velocity.x *= Math.pow(0.001, dt);
    player.velocity.z *= Math.pow(0.001, dt);
    if (isFirstPerson) {
      player.facingAngle = cameraYaw;
    }
  }

  // Jump
  if (keys['Space'] && player.isGrounded) {
    player.velocity.y = player.jumpStrength;
    player.isGrounded = false;
    playBeep(420, 0.12, 'triangle');
  }

  // Gravity (when airborne)
  if (!player.isGrounded) {
    player.velocity.y += gravity * dt;
  }

  // Integrate horizontal position
  let nextX = player.position.x + player.velocity.x * dt;
  let nextZ = player.position.z + player.velocity.z * dt;

  // Stay within terrain map boundaries
  const maxBound = halfSize - 3;
  nextX = Math.max(-maxBound, Math.min(maxBound, nextX));
  nextZ = Math.max(-maxBound, Math.min(maxBound, nextZ));

  // Obstacle collision (trees and rocks)
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const dx = nextX - obs.x;
    const dz = nextZ - obs.z;
    const distSq = dx * dx + dz * dz;
    const minDist = obs.radius + 0.35;
    if (distSq < minDist * minDist && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const push = (minDist - dist) / dist;
      nextX += dx * push;
      nextZ += dz * push;
    }
  }

  player.position.x = nextX;
  player.position.z = nextZ;

  // Exact terrain surface height at current XZ
  const groundY = getTerrainHeight(player.position.x, player.position.z);

  if (player.isGrounded) {
    // While grounded, stick firmly to exact ground triangle (no walking in air or sinking into slopes)
    player.position.y = groundY;
    player.velocity.y = 0;
  } else {
    // While airborne (jumping or falling)
    player.position.y += player.velocity.y * dt;
    if (player.position.y <= groundY) {
      player.position.y = groundY;
      player.velocity.y = 0;
      player.isGrounded = true;
    }
  }

  // Update Three.js object group
  player.group.position.copy(player.position);
  player.group.rotation.y = player.facingAngle;

  // -------------------------------------------------------------------------
  // --- REAL SKELETAL 2-BONE INVERSE KINEMATICS (IK) & GAIT ENGINE ---
  // -------------------------------------------------------------------------
  const bones = player.bones;
  const rest = player.restRotations;
  const restPos = player.restPositions;

  // Safe helpers to retrieve bones and rest transforms with/without sanitization
  const getB = (name) => bones[name] || bones[name.replace(/\./g, '')];
  const getR = (name) => rest[name] || rest[name.replace(/\./g, '')];
  const getP = (name) => restPos[name] || restPos[name.replace(/\./g, '')];

  const thighR = getB('thighR');
  const thighL = getB('thighL');
  const shinR = getB('shinR');
  const shinL = getB('shinL');
  const footR = getB('footR');
  const footL = getB('footL');
  const armR = getB('upper_armR');
  const armL = getB('upper_armL');
  const foreR = getB('forearmR');
  const foreL = getB('forearmL');
  const chest = getB('chest');
  const hips = getB('hips');
  const head = getB('head');

  // Exact anatomical bone lengths measured from character rig
  const LEG_L1 = 0.33734; // Thigh segment (hip to knee)
  const LEG_L2 = 0.35128; // Shin segment (knee to ankle)
  const REST_ANKLE_Y = 0.22; // Ground sole neutral ankle level
  const REST_ANKLE_Z = 0.04; // Resting forward offset
  const REST_HIP_Y = 0.90;   // Rest pelvis height

  // Precomputed reference triangle constants
  const D_REST = Math.sqrt(Math.pow(REST_ANKLE_Y - REST_HIP_Y, 2) + Math.pow(REST_ANKLE_Z, 2));
  const GAMMA_REST = Math.atan2(REST_ANKLE_Z, REST_HIP_Y - REST_ANKLE_Y);
  const COS_ALPHA1_REST = (LEG_L1 * LEG_L1 + D_REST * D_REST - LEG_L2 * LEG_L2) / (2 * LEG_L1 * D_REST);
  const ALPHA1_REST = Math.acos(Math.max(-1, Math.min(1, COS_ALPHA1_REST)));
  const THETA1_REST = GAMMA_REST + ALPHA1_REST;
  const COS_ALPHA2_REST = (LEG_L1 * LEG_L1 + LEG_L2 * LEG_L2 - D_REST * D_REST) / (2 * LEG_L1 * LEG_L2);
  const THETA_KNEE_REST = Math.PI - Math.acos(Math.max(-1, Math.min(1, COS_ALPHA2_REST)));

  // Analytical 2-Bone Inverse Kinematics Solver (Law of Cosines)
  function solveLegIK(hipY, hipZ, targetY, targetZ, restThighX, restShinX) {
    const dy = targetY - hipY; // dy is negative
    const dz = targetZ - hipZ;
    const dist = Math.sqrt(dy * dy + dz * dz);
    // Clamp to valid reachable range
    const d = Math.max(Math.abs(LEG_L1 - LEG_L2) + 0.005, Math.min((LEG_L1 + LEG_L2) * 0.996, dist));

    const gamma = Math.atan2(dz, -dy);
    const cosAlpha1 = Math.max(-1, Math.min(1, (LEG_L1 * LEG_L1 + d * d - LEG_L2 * LEG_L2) / (2 * LEG_L1 * d)));
    const alpha1 = Math.acos(cosAlpha1);
    const theta1 = gamma + alpha1;

    const cosAlpha2 = Math.max(-1, Math.min(1, (LEG_L1 * LEG_L1 + LEG_L2 * LEG_L2 - d * d) / (2 * LEG_L1 * LEG_L2)));
    const thetaKnee = Math.PI - Math.acos(cosAlpha2);

    return {
      thighX: restThighX - (theta1 - THETA1_REST),
      shinX: restShinX + (thetaKnee - THETA_KNEE_REST)
    };
  }

  if (thighR && getR('thighR')) {
    if (!player.isGrounded) {
      // --- JUMP / AIRBORNE ATHLETIC POSE ---
      const jumpLerp = Math.min(1.0, 14.0 * dt);
      thighR.rotation.x += (getR('thighR').x - 0.38 - thighR.rotation.x) * jumpLerp;
      thighL.rotation.x += (getR('thighL').x - 0.28 - thighL.rotation.x) * jumpLerp;
      if (shinR) shinR.rotation.x += (getR('shinR').x + 0.65 - shinR.rotation.x) * jumpLerp;
      if (shinL) shinL.rotation.x += (getR('shinL').x + 0.52 - shinL.rotation.x) * jumpLerp;
      if (footR) footR.rotation.x += (getR('footR').x - 0.32 - footR.rotation.x) * jumpLerp;
      if (footL) footL.rotation.x += (getR('footL').x - 0.32 - footL.rotation.x) * jumpLerp;

      // Arms flare outward for aerial balance
      if (armR) {
        armR.rotation.y += (getR('upper_armR').y - 0.35 - armR.rotation.y) * jumpLerp;
        armR.rotation.x += (getR('upper_armR').x + 0.30 - armR.rotation.x) * jumpLerp;
      }
      if (armL) {
        armL.rotation.y += (getR('upper_armL').y - 0.35 - armL.rotation.y) * jumpLerp;
        armL.rotation.x += (getR('upper_armL').x - 0.30 - armL.rotation.x) * jumpLerp;
      }
      if (chest && getR('chest')) chest.rotation.x += (getR('chest').x - 0.12 - chest.rotation.x) * jumpLerp;

    } else if (isMoving) {
      // --- NATURAL INVERSE KINEMATICS (IK) GAIT CYCLE ---
      const cycleSpeed = isSprinting ? 2.8 : 2.1;
      player.walkCycle += dt * currentSpeed * cycleSpeed;
      const cycle = player.walkCycle;

      // 1. Pelvis Dynamics: Vertical bounce, lateral sway, yaw twist
      const hipBob = (isSprinting ? 0.042 : 0.024) * Math.cos(cycle * 2) - (isSprinting ? 0.038 : 0.020);
      const currentHipY = (getP('hips')?.y || REST_HIP_Y) + hipBob;
      if (hips) {
        hips.position.y = currentHipY;
        hips.position.x = (getP('hips')?.x || 0) + Math.sin(cycle) * (isSprinting ? 0.022 : 0.014);
        hips.rotation.z = (getR('hips')?.z || 0) + Math.sin(cycle) * (isSprinting ? 0.055 : 0.035);
        hips.rotation.y = (getR('hips')?.y || 0) + Math.sin(cycle) * (isSprinting ? 0.08 : 0.05);
      }

      // 2. Stride and Step Parameters
      const strideZ = isSprinting ? 0.24 : 0.165;
      const stepLift = isSprinting ? 0.135 : 0.085;
      const stanceRatio = 0.58; // 58% stance, 42% swing (realistic biped gait)

      // Facing orientation vectors for terrain height probing
      const sinF = Math.sin(player.facingAngle);
      const cosF = Math.cos(player.facingAngle);

      // Helper function to solve leg targets and IK for a given leg
      function computeLegKinematics(phase, isRight, thighName, shinName, footName) {
        const tau = ((phase % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2) / (Math.PI * 2);
        let targetZ, targetY, anklePitch;

        const legLocalX = isRight ? 0.14 : -0.14;

        if (tau < stanceRatio) {
          // --- STANCE PHASE (Foot planted, moving backward relative to body) ---
          const u = tau / stanceRatio;
          targetZ = strideZ * (1.0 - 2.0 * u);

          // Ankle articulation: Heel-strike -> Flat plant -> Toe push-off roll
          if (u < 0.15) {
            anklePitch = -0.26 * (1.0 - u / 0.15); // Heel strike (dorsiflexion)
          } else if (u < 0.70) {
            anklePitch = 0.0; // Flat foot on ground
          } else {
            const push = (u - 0.70) / 0.30;
            anklePitch = 0.36 * push; // Heel lifts, pushing with ball of foot
          }

          // Sample terrain slope at the foot's world position
          const wX = player.position.x + sinF * targetZ + cosF * legLocalX;
          const wZ = player.position.z + cosF * targetZ - sinF * legLocalX;
          const slopeDelta = Math.max(-0.35, Math.min(0.35, getTerrainHeight(wX, wZ) - groundY));
          targetY = REST_ANKLE_Y + slopeDelta;

        } else {
          // --- SWING PHASE (Foot lifts, arcs forward, prepares for touchdown) ---
          const s = (tau - stanceRatio) / (1.0 - stanceRatio);
          // Smooth forward travel
          targetZ = -strideZ + 2.0 * strideZ * (0.5 - 0.5 * Math.cos(Math.PI * s));

          // Parabolic clearance lift
          const swingArc = stepLift * Math.sin(Math.PI * s);

          // Ankle clearance articulation
          if (s < 0.22) {
            anklePitch = 0.36 * (1.0 - s / 0.22); // Liftoff point
          } else if (s < 0.75) {
            anklePitch = -0.06; // Ground clearance
          } else {
            const prep = (s - 0.75) / 0.25;
            anklePitch = -0.06 - 0.20 * prep; // Prepare for heel strike
          }

          const wX = player.position.x + sinF * targetZ + cosF * legLocalX;
          const wZ = player.position.z + cosF * targetZ - sinF * legLocalX;
          const slopeDelta = Math.max(-0.35, Math.min(0.35, getTerrainHeight(wX, wZ) - groundY));
          targetY = REST_ANKLE_Y + slopeDelta * (1.0 - Math.sin(Math.PI * s)) + swingArc;
        }

        // Solve 2-Bone IK
        const ik = solveLegIK(currentHipY, 0.0, targetY, targetZ, getR(thighName).x, getR(shinName).x);
        return { ik, anklePitch };
      }

      // Compute IK for Right Leg (phase = cycle) and Left Leg (phase = cycle + PI)
      const resR = computeLegKinematics(cycle, true, 'thighR', 'shinR', 'footR');
      const resL = computeLegKinematics(cycle + Math.PI, false, 'thighL', 'shinL', 'footL');

      thighR.rotation.x = resR.ik.thighX;
      shinR.rotation.x = resR.ik.shinX;
      if (footR) footR.rotation.x = getR('footR').x + resR.anklePitch;

      thighL.rotation.x = resL.ik.thighX;
      shinL.rotation.x = resL.ik.shinX;
      if (footL) footL.rotation.x = getR('footL').x + resL.anklePitch;

      // 3. Upper Body Natural Balance
      // Arms swing in natural opposition to legs
      const armSwing = Math.sin(cycle);
      const armAmpY = isSprinting ? 0.68 : 0.44;
      const armAmpX = isSprinting ? 0.32 : 0.18;

      if (armR) {
        armR.rotation.y = getR('upper_armR').y - armSwing * armAmpY;
        armR.rotation.x = getR('upper_armR').x + armSwing * armAmpX;
      }
      if (armL) {
        armL.rotation.y = getR('upper_armL').y - armSwing * armAmpY;
        armL.rotation.x = getR('upper_armL').x - armSwing * armAmpX;
      }

      // Forearms (elbows) dynamic flexion on forward swing
      if (foreR) foreR.rotation.x = getR('forearmR').x - Math.max(0, -armSwing) * (isSprinting ? 0.48 : 0.30);
      if (foreL) foreL.rotation.x = getR('forearmL').x - Math.max(0, armSwing) * (isSprinting ? 0.48 : 0.30);

      // Spine & Chest counter-rotation and forward tilt
      if (chest && getR('chest')) {
        chest.rotation.y = (getR('chest').y || 0) - Math.sin(cycle) * (isSprinting ? 0.075 : 0.045);
        chest.rotation.x = (getR('chest').x || 0) - (isSprinting ? 0.16 : 0.055);
        chest.rotation.z = (getR('chest').z || 0) - Math.sin(cycle) * 0.02;
      }

    } else {
      // --- IDLE POSE & GENTLE ORGANIC BREATHING ---
      const lerpFactor = Math.min(1.0, 10.0 * dt);
      const boneList = ['thighR', 'thighL', 'shinR', 'shinL', 'footR', 'footL', 'upper_armR', 'upper_armL', 'forearmR', 'forearmL'];

      boneList.forEach(name => {
        const b = getB(name);
        const r = getR(name);
        if (b && r) {
          b.rotation.x += (r.x - b.rotation.x) * lerpFactor;
          b.rotation.y += (r.y - b.rotation.y) * lerpFactor;
          b.rotation.z += (r.z - b.rotation.z) * lerpFactor;
        }
      });

      const t = clock.getElapsedTime();
      if (chest && getR('chest')) {
        chest.rotation.x = getR('chest').x + Math.sin(t * 2.4) * 0.025;
        chest.rotation.y += ((getR('chest').y || 0) - chest.rotation.y) * lerpFactor;
        chest.rotation.z += ((getR('chest').z || 0) - chest.rotation.z) * lerpFactor;
      }
      if (hips && getP('hips')) {
        hips.position.y += (getP('hips').y + Math.sin(t * 2.4) * 0.012 - hips.position.y) * lerpFactor;
        hips.position.x += ((getP('hips').x || 0) - hips.position.x) * lerpFactor;
        hips.rotation.y += ((getR('hips')?.y || 0) - hips.rotation.y) * lerpFactor;
        hips.rotation.z += ((getR('hips')?.z || 0) - hips.rotation.z) * lerpFactor;
      }
      if (head && getR('head')) {
        head.rotation.x = (getR('head').x || 0) + Math.sin(t * 1.8) * 0.015;
      }
    }
  }
}

function updateCamera() {
  const headTarget = new THREE.Vector3(
    player.position.x,
    player.position.y + camHeightOffset,
    player.position.z
  );

  if (isFirstPerson) {
    // 1st Person: Camera directly at eye level looking in lookDir
    camera.position.set(headTarget.x, headTarget.y + 0.28, headTarget.z);

    const lookDir = new THREE.Vector3(
      Math.sin(cameraYaw) * Math.cos(cameraPitch),
      Math.sin(cameraPitch),
      Math.cos(cameraYaw) * Math.cos(cameraPitch)
    );
    camera.lookAt(camera.position.clone().add(lookDir));
  } else {
    // 3rd Person:
    // Natural non-inverted orientation:
    // When looking UP (cameraPitch > 0): camera lowers and tilts up toward sky.
    // When looking DOWN (cameraPitch < 0): camera raises and tilts down toward player/ground.
    const cosPitch = Math.cos(cameraPitch);
    const sinPitch = Math.sin(cameraPitch);

    const offsetX = Math.sin(cameraYaw) * cosPitch * camDistance;
    const offsetY = -sinPitch * camDistance + 0.6;
    const offsetZ = Math.cos(cameraYaw) * cosPitch * camDistance;

    const desiredCamPos = new THREE.Vector3(
      headTarget.x - offsetX,
      headTarget.y + offsetY,
      headTarget.z - offsetZ
    );

    // Prevent camera from clipping through terrain
    const groundUnderCam = getTerrainHeight(desiredCamPos.x, desiredCamPos.z) + 0.45;
    if (desiredCamPos.y < groundUnderCam) {
      desiredCamPos.y = groundUnderCam;
    }

    camera.position.copy(desiredCamPos);

    // Adjust look target with pitch for natural framing
    const lookTarget = new THREE.Vector3(
      headTarget.x,
      headTarget.y + sinPitch * 1.1,
      headTarget.z
    );
    camera.lookAt(lookTarget);
  }
}

function updateGems(dt) {
  const gemCountElem = document.getElementById('gems-count');
  const time = clock.getElapsedTime();

  gems.forEach((gem) => {
    if (gem.userData.collected) return;

    gem.rotation.y += 2.0 * dt;
    gem.position.y = gem.userData.baseY + Math.sin(time * 3 + gem.userData.offset) * 0.22;

    const dist = player.position.distanceTo(gem.position);
    if (dist < 1.7) {
      gem.userData.collected = true;
      scene.remove(gem);
      gemsCollected++;
      gemCountElem.innerText = gemsCollected;
      playBeep(880, 0.18, 'sine');
    }
  });
}

// --- Main Render Loop ---
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  updatePlayer(dt);
  updateCamera();
  updateGems(dt);

  renderer.render(scene, camera);
}
animate();

// --- Responsive Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});