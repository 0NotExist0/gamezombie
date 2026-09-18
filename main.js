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

const posAttr = terrainGeo.attributes.position;
function getTerrainHeight(x, z) {
  const dist = Math.sqrt(x * x + z * z);
  if (dist < 14) return 0; // Flat spawn zone
  return Math.sin(x * 0.04) * Math.cos(z * 0.04) * 4.0 + 
         Math.sin(x * 0.10 + z * 0.08) * 1.8 + 
         (dist > 90 ? Math.pow((dist - 90) * 0.1, 1.5) : 0);
}

for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const z = posAttr.getZ(i);
  posAttr.setY(i, getTerrainHeight(x, z));
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

// --- Environment: Trees & Rocks ---
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
  console.log('Character and bones loaded successfully:', Object.keys(player.bones));
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
if (isTouchDevice && touchControlsElem) {
  touchControlsElem.style.display = 'block';
}

const overlay = document.getElementById('instructions-overlay');
const startBtn = document.getElementById('start-btn');

function requestLock() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if (!isTouchDevice && document.body.requestPointerLock) {
    document.body.requestPointerLock();
  }
  overlay.style.opacity = '0';
  setTimeout(() => overlay.style.display = 'none', 300);
}
startBtn.addEventListener('click', requestLock);
overlay.addEventListener('click', requestLock);

document.addEventListener('pointerlockchange', () => {
  if (!isTouchDevice && document.pointerLockElement !== document.body) {
    overlay.style.display = 'flex';
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

  // Gravity
  player.velocity.y += gravity * dt;

  // Integrate position
  player.position.x += player.velocity.x * dt;
  player.position.z += player.velocity.z * dt;
  player.position.y += player.velocity.y * dt;

  // Ground collision
  const groundY = getTerrainHeight(player.position.x, player.position.z);
  if (player.position.y <= groundY) {
    player.position.y = groundY;
    player.velocity.y = 0;
    player.isGrounded = true;
  }

  // Update Three.js object group
  player.group.position.copy(player.position);
  player.group.rotation.y = player.facingAngle;

  // -------------------------------------------------------------
  // --- REAL SKELETAL ANIMATIONS (WALK, RUN, JUMP, IDLE) ---
  // -------------------------------------------------------------
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

  if (thighR && getR('thighR')) {
    if (!player.isGrounded) {
      // --- JUMP / AIRBORNE POSE ---
      const jumpLerp = Math.min(1.0, 14.0 * dt);
      // Legs tuck up with knees bent and feet pointed
      thighR.rotation.x += (getR('thighR').x - 0.35 - thighR.rotation.x) * jumpLerp;
      thighL.rotation.x += (getR('thighL').x - 0.25 - thighL.rotation.x) * jumpLerp;
      if (shinR) shinR.rotation.x += (getR('shinR').x + 0.60 - shinR.rotation.x) * jumpLerp;
      if (shinL) shinL.rotation.x += (getR('shinL').x + 0.50 - shinL.rotation.x) * jumpLerp;
      if (footR) footR.rotation.x += (getR('footR').x - 0.30 - footR.rotation.x) * jumpLerp;
      if (footL) footL.rotation.x += (getR('footL').x - 0.30 - footL.rotation.x) * jumpLerp;

      // Arms flare outward for aerial balance
      if (armR) {
        armR.rotation.y += (getR('upper_armR').y - 0.35 - armR.rotation.y) * jumpLerp;
        armR.rotation.x += (getR('upper_armR').x + 0.30 - armR.rotation.x) * jumpLerp;
      }
      if (armL) {
        armL.rotation.y += (getR('upper_armL').y - 0.35 - armL.rotation.y) * jumpLerp;
        armL.rotation.x += (getR('upper_armL').x - 0.30 - armL.rotation.x) * jumpLerp;
      }
      if (chest && getR('chest')) chest.rotation.x += (getR('chest').x - 0.10 - chest.rotation.x) * jumpLerp;

    } else if (isMoving) {
      // --- WALK / SPRINT RUN CYCLE ---
      const cycleSpeed = isSprinting ? 2.8 : 2.0;
      player.walkCycle += dt * currentSpeed * cycleSpeed;
      const cycle = player.walkCycle;

      const strideAmp = isSprinting ? 0.72 : 0.50;
      const legSwing = Math.sin(cycle);

      // Thighs: pitch forward (-x moves forward +z) and back (+x moves back -z)
      thighR.rotation.x = getR('thighR').x - legSwing * strideAmp;
      thighL.rotation.x = getR('thighL').x + legSwing * strideAmp;

      // Shins (knees): bend backward (+x) when lifting leg backwards
      const kneeBendR = Math.max(0, legSwing) * (isSprinting ? 0.95 : 0.70);
      const kneeBendL = Math.max(0, -legSwing) * (isSprinting ? 0.95 : 0.70);
      if (shinR) shinR.rotation.x = getR('shinR').x + kneeBendR;
      if (shinL) shinL.rotation.x = getR('shinL').x + kneeBendL;

      // Feet (ankles): articulate naturally with stride
      if (footR) footR.rotation.x = getR('footR').x + legSwing * 0.25;
      if (footL) footL.rotation.x = getR('footL').x - legSwing * 0.25;

      // Arms: swing on Y axis in natural opposition to legs
      const armAmp = isSprinting ? 0.65 : 0.42;
      if (armR) armR.rotation.y = getR('upper_armR').y - legSwing * armAmp;
      if (armL) armL.rotation.y = getR('upper_armL').y - legSwing * armAmp;

      // Forearms: slight bend during stride
      if (foreR) foreR.rotation.x = getR('forearmR').x - Math.max(0, -legSwing) * 0.30;
      if (foreL) foreL.rotation.x = getR('forearmL').x - Math.max(0, legSwing) * 0.30;

      // Hips & Torso: vertical bounce and dynamic sway
      if (hips && getP('hips')) {
        hips.position.y = getP('hips').y + Math.abs(Math.sin(cycle * 2)) * (isSprinting ? 0.08 : 0.04);
        hips.rotation.z = (getR('hips')?.z || 0) + Math.sin(cycle) * 0.05;
      }
      if (chest && getR('chest')) {
        chest.rotation.y = (getR('chest').y || 0) - Math.sin(cycle) * 0.07;
        chest.rotation.x = (getR('chest').x || 0) - (isSprinting ? 0.14 : 0.04);
      }

    } else {
      // --- IDLE POSE & GENTLE BREATHING ---
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