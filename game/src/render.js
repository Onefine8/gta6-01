// Meridian Heat — rendering: three.js scene, camera, sun/moon, day/night.
// Owns the renderer, lights, fog, sky colour and the follow/orbit camera.
// Only imports config.js + global THREE; reads game state through G.
import { CONFIG } from './config.js';

const cfg = CONFIG;

let renderer = null;
let camera = null;
let sun = null;
let hemi = null;
let moon = null;
let cameraMode = 'orbit'; // 'orbit' (menu) | 'follow' (playing)
let orbitAngle = 0.6;
let camYawOffset = 0; // mouse-drag orbit offset while following
let camPitch = 0.32;
let headlight = null;
let shakeStrength = 0;

function addShake(amount) {
  shakeStrength = Math.min(1.2, shakeStrength + amount);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  return new THREE.Color(c1).lerp(new THREE.Color(c2), t);
}

// 0 = full day, 1 = full night, based on dayTime hours.
function nightFactor(dayTime) {
  if (dayTime >= 7 && dayTime < 17) return 0;
  if (dayTime >= 19 || dayTime < 5) return 1;
  if (dayTime >= 5 && dayTime < 7) return 1 - (dayTime - 5) / 2;
  return (dayTime - 17) / 2; // 17..19 dusk ramp
}

function playerPos(G) {
  const p = G.player;
  if (!p) return null;
  if (typeof p.x === 'number' && typeof p.z === 'number') return p;
  if (p.pos && typeof p.pos.x === 'number') return p.pos;
  return null;
}

function playerHeading(G) {
  const p = G.player;
  if (!p) return 0;
  if (typeof p.heading === 'number') return p.heading;
  return 0;
}

export function init(G) {
  const canvasHost = document.getElementById('game-canvas') || document.body;
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = 'game-canvas';
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.zIndex = '0';
  document.body.prepend(renderer.domElement);

  camera = new THREE.PerspectiveCamera(
    cfg.CAMERA.fov,
    window.innerWidth / window.innerHeight,
    0.5,
    2400,
  );
  camera.position.set(180, 160, 220);
  camera.lookAt(0, 0, 0);

  G.scene = new THREE.Scene();
  G.scene.background = new THREE.Color(cfg.COLORS.skyDay);
  G.scene.fog = new THREE.Fog(cfg.COLORS.fogDay, cfg.FOG_NEAR, cfg.FOG_FAR_DAY);
  G.camera = camera;
  G.renderer = renderer;

  // Sun: directional light with shadows off (perf) — angle driven by time.
  sun = new THREE.DirectionalLight(cfg.COLORS.sunDay, 1.35);
  sun.position.set(200, 300, 100);
  G.scene.add(sun);
  G.scene.add(sun.target);

  // Hemisphere fill so night streets stay readable.
  hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a4038, 0.75);
  G.scene.add(hemi);

  // Moon: small pale disc that appears at night.
  moon = new THREE.Mesh(
    new THREE.CircleGeometry(18, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false }),
  );
  moon.position.set(-420, 380, -520);
  moon.lookAt(camera.position);
  moon.visible = false;
  G.scene.add(moon);

  // Stars: points on the sky dome, visible at night.
  const starGeo = new THREE.BufferGeometry();
  const starCount = 420;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.45;
    const r = 880;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi) + 40;
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }),
  );
  stars.name = 'stars';
  G.scene.add(stars);

  // Headlight: a spotlight that follows the player's car at night.
  headlight = new THREE.SpotLight(0xfff2c8, 0, 55, 0.5, 0.45, 1.2);
  headlight.visible = false;
  G.scene.add(headlight);
  G.scene.add(headlight.target);

  // Camera shake on crashes and nearby gunfire.
  if (G.events) {
    G.events.on('crash', (p) => addShake(p && p.strength ? p.strength * 0.5 : 0.4));
    G.events.on('shot-fired', () => addShake(0.06));
    G.events.on('explosion', () => addShake(1.0));
  }

  window.addEventListener('resize', onResize);

  G.render = {
    setCameraMode(mode) {
      cameraMode = mode;
    },
    getCameraMode() {
      return cameraMode;
    },
    addYawOffset(d) {
      camYawOffset += d;
    },
    addPitch(d) {
      camPitch = Math.max(0.08, Math.min(1.1, camPitch + d));
    },
    nightFactor,
    isNight() {
      return nightFactor(G.time.dayTime) > 0.5;
    },
    addShake,
  };
  return G.render;
}

function onResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateSky(G) {
  const nf = nightFactor(G.time.dayTime);
  const dusk = G.time.dayTime >= 16.5 && G.time.dayTime < 19.5;
  let skyColor = lerpColor(cfg.COLORS.skyDay, cfg.COLORS.skyNight, nf);
  if (dusk) skyColor = lerpColor(skyColor, new THREE.Color(cfg.COLORS.skyDusk), 0.45 * (1 - nf));
  G.scene.background.copy(skyColor);
  G.scene.fog.color.copy(lerpColor(cfg.COLORS.fogDay, cfg.COLORS.fogNight, nf));
  G.scene.fog.far = lerp(cfg.FOG_FAR_DAY, cfg.FOG_FAR_NIGHT, nf);

  const sky = G.scene.getObjectByName('sky');
  if (sky) sky.material.color.copy(skyColor);

  // Sun angle: rises east (06:00), sets west (18:00); below horizon at night.
  const t = G.time.dayTime;
  const sunAngle = ((t - 6) / 12) * Math.PI;
  const sunHeight = Math.sin(sunAngle);
  sun.position.set(Math.cos(sunAngle) * 320, Math.max(20, sunHeight * 320), 140);
  sun.intensity = lerp(1.35, 0.12, nf);
  sun.color.setHex(nf > 0.5 ? cfg.COLORS.sunNight : cfg.COLORS.sunDay);
  hemi.intensity = lerp(0.75, 0.28, nf);

  moon.visible = nf > 0.4;
  if (moon.visible) moon.lookAt(camera.position);
  const stars = G.scene.getObjectByName('stars');
  if (stars) stars.material.opacity = nf;

  // Lamp heads glow at night.
  const lampGlow = nf > 0.4;
  if (G.world && G.world.group) {
    G.world.group.traverse((obj) => {
      if (obj.name === 'lampHead') obj.visible = true;
      if (obj.name === 'neon') obj.visible = nf > 0.25 || dusk;
    });
    void lampGlow;
  }
}

function updateCamera(G, dt) {
  const pos = playerPos(G);
  if (G.state === 'menu' || !pos || cameraMode === 'orbit') {
    // Slow cinematic orbit over the city for the start screen.
    orbitAngle += dt * 0.03;
    const d = cfg.CAMERA.orbitDistance;
    const h = cfg.CAMERA.orbitHeight;
    camera.position.set(
      Math.cos(orbitAngle) * d,
      h + Math.sin(orbitAngle * 0.7) * 24,
      Math.sin(orbitAngle) * d,
    );
    camera.lookAt(0, 10, 0);
    return;
  }

  // Follow camera: behind the player heading, mouse-drag orbits around.
  const heading = playerHeading(G) + camYawOffset;
  const dist = cfg.CAMERA.followDistance;
  const height = cfg.CAMERA.followHeight;
  const tx = pos.x - Math.sin(heading) * dist;
  const tz = pos.z - Math.cos(heading) * dist;
  const k = 1 - Math.pow(0.0001, dt); // smooth damp
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (height - camera.position.y) * k;
  camera.position.z += (tz - camera.position.z) * k;
  const lookX = pos.x + Math.sin(playerHeading(G)) * cfg.CAMERA.lookAhead;
  const lookZ = pos.z + Math.cos(playerHeading(G)) * cfg.CAMERA.lookAhead;
  camera.lookAt(lookX, 1.6 + camPitch * 2, lookZ);
}

function updateHeadlight(G) {
  if (!headlight) return;
  const pos = playerPos(G);
  const night = nightFactor(G.time.dayTime) > 0.4;
  const driving = !!(G.player && G.player.inVehicle);
  headlight.visible = night && driving && !!pos && G.state === 'playing';
  if (!headlight.visible) return;
  const heading = playerHeading(G);
  headlight.position.set(pos.x, 1.6, pos.z);
  headlight.target.position.set(
    pos.x + Math.sin(heading) * 24,
    0.5,
    pos.z + Math.cos(heading) * 24,
  );
  headlight.intensity = 2.2;
}

export function update(G, dt) {
  if (!renderer || !camera) return;
  // Mouse drag orbits the follow camera (input.js feeds deltas here).
  if (G.input && G.input.consumeLook) {
    const look = G.input.consumeLook();
    if (look) {
      camYawOffset -= look.dx * 0.004;
      camPitch = Math.max(0.08, Math.min(1.1, camPitch + look.dy * 0.002));
    }
  }
  if (G.state === 'playing') cameraMode = 'follow';
  else if (G.state === 'menu') cameraMode = 'orbit';
  updateSky(G);
  updateCamera(G, dt);
  updateHeadlight(G);
  // Camera shake: quick random jitter that decays over ~0.4 s.
  if (shakeStrength > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shakeStrength;
    camera.position.y += (Math.random() - 0.5) * shakeStrength * 0.6;
    camera.position.z += (Math.random() - 0.5) * shakeStrength;
    shakeStrength *= Math.pow(0.02, dt);
  } else {
    shakeStrength = 0;
  }
  renderer.render(G.scene, camera);
}

export default { init, update };
