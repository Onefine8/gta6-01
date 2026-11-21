// Meridian Heat — renderer + camera + day/night cycle.
// Owns the THREE renderer, the follow/orbit camera, sun + hemisphere light,
// fog and sky colour. Everything else renders into G.scene.

import { CFG } from './config.js';

const THREE = globalThis.THREE;

// Sky colours keyed by time of day (hours).
const SKY_KEYS = [
  { h: 0, sky: 0x070b1a, fog: 0x070b1a, sun: 0x223055, sunI: 0.05, hemi: 0.12 },
  { h: 5, sky: 0x0a1024, fog: 0x0a1024, sun: 0x2a3555, sunI: 0.08, hemi: 0.15 },
  { h: 6.5, sky: 0xff9a5c, fog: 0xe08a5a, sun: 0xffb36b, sunI: 0.7, hemi: 0.35 },
  { h: 8, sky: 0x87b5e0, fog: 0x9db8cc, sun: 0xfff2d0, sunI: 1.15, hemi: 0.75 },
  { h: 12, sky: 0x7fb2e5, fog: 0xa8c4d8, sun: 0xffffff, sunI: 1.35, hemi: 0.85 },
  { h: 17, sky: 0x8fb4dd, fog: 0xa8bccd, sun: 0xffe8b0, sunI: 1.1, hemi: 0.7 },
  { h: 18.5, sky: 0xff7a4d, fog: 0xd86a4a, sun: 0xff8a3d, sunI: 0.8, hemi: 0.4 },
  { h: 20, sky: 0x141a33, fog: 0x141a33, sun: 0x2a3555, sunI: 0.12, hemi: 0.18 },
  { h: 24, sky: 0x070b1a, fog: 0x070b1a, sun: 0x223055, sunI: 0.05, hemi: 0.12 },
];

function lerpColor(a, b, t, out) {
  out.setHex(a);
  const cb = new THREE.Color(b);
  out.lerp(cb, t);
  return out;
}

function skyAt(dayTime) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].h <= dayTime) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const t = Math.max(0, Math.min(1, (dayTime - a.h) / (b.h - a.h)));
  const sky = lerpColor(a.sky, b.sky, t, new THREE.Color());
  const fog = lerpColor(a.fog, b.fog, t, new THREE.Color());
  const sun = lerpColor(a.sun, b.sun, t, new THREE.Color());
  return {
    sky, fog, sun,
    sunI: a.sunI + (b.sunI - a.sunI) * t,
    hemi: a.hemi + (b.hemi - a.hemi) * t,
  };
}

export const render = {
  renderer: null,
  sun: null,
  hemi: null,
  camYaw: 0, // orbit offset around the follow target
  camPitch: 0.32,
  camDist: 11,
  camMode: 0, // 0 near, 1 far, 2 top-down
  shake: 0,
  shakeMag: 0,
  _tmp: null,
};

export function init(G) {
  G.render = render;
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  render.renderer = renderer;
  G.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5e0);
  scene.fog = new THREE.Fog(0x9db8cc, 60, CFG.WORLD.FOG_DAY);
  G.scene = scene;

  const camera = new THREE.PerspectiveCamera(
    62, window.innerWidth / window.innerHeight, 0.1, 2200,
  );
  camera.position.set(0, 30, 60);
  G.camera = camera;

  // Sun: directional light that swings with the time of day.
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.15);
  sun.position.set(120, 200, 60);
  scene.add(sun);
  scene.add(sun.target);
  render.sun = sun;
  G.sun = sun;

  // Hemisphere: sky/ground bounce so shadows never go pitch black.
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3230, 0.75);
  scene.add(hemi);
  render.hemi = hemi;

  // Night street glow: a handful of warm point lights over the plaza
  // and the harbor gate — cheap, and they sell the neon look.
  render.nightLights = [];
  const lampSpots = [
    [0, 0], [120, -120], [-120, 120], [0, 240], [-200, -200],
  ];
  for (const [x, z] of lampSpots) {
    const pl = new THREE.PointLight(0xffb347, 0, 90, 1.6);
    pl.position.set(x, 14, z);
    scene.add(pl);
    render.nightLights.push(pl);
  }

  // Headlights: one spotlight that rides the player's car at night.
  render.headlight = new THREE.SpotLight(0xfff2c0, 0, 70, 0.5, 0.45, 1.2);
  scene.add(render.headlight);
  scene.add(render.headlight.target);

  render._tmp = new THREE.Vector3();

  window.addEventListener('resize', () => resize(G));
  return render;
}

export function resize(G) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
  render.renderer.setSize(w, h);
}

/** Add a camera shake impulse (explosions, crashes, near misses). */
export function addShake(mag) {
  render.shake = 0.5;
  render.shakeMag = Math.max(render.shakeMag, mag);
}

/** Where the camera should look: player on foot, or their car. */
function followTarget(G) {
  const p = G.player;
  if (!p) return { x: 0, y: 2, z: 0, heading: 0, speed: 0 };
  if (p.vehicle && G.vehicles && G.vehicles.getActive) {
    const v = G.vehicles.getActive();
    if (v) return { x: v.pos.x, y: 1.5, z: v.pos.z, heading: v.heading, speed: v.speed };
  }
  return {
    x: p.pos.x, y: 1.8, z: p.pos.z,
    heading: p.heading || 0, speed: p.speed || 0,
  };
}

export function update(G, dt) {
  // --- Time of day -----------------------------------------------------------
  const dayRate = 24 / CFG.WORLD.DAY_LENGTH; // hours per real second
  G.time.dayTime = (G.time.dayTime + dt * dayRate) % 24;

  // --- Lighting ---------------------------------------------------------------
  const s = skyAt(G.time.dayTime);
  G.scene.background.copy(s.sky);
  G.scene.fog.color.copy(s.fog);
  const night = G.time.dayTime < CFG.WORLD.SUNRISE || G.time.dayTime > CFG.WORLD.SUNSET;
  G.scene.fog.far = night ? CFG.WORLD.FOG_NIGHT : CFG.WORLD.FOG_DAY;
  render.sun.color.copy(s.sun);
  render.sun.intensity = s.sunI;
  render.hemi.intensity = s.hemi;
  const sunAngle = ((G.time.dayTime - 6) / 12) * Math.PI;
  render.sun.position.set(
    Math.cos(sunAngle) * 300,
    Math.max(30, Math.sin(sunAngle) * 260),
    120,
  );
  // Night street lights fade in after sunset.
  const nightAmt = night
    ? Math.min(1, Math.abs(G.time.dayTime - CFG.WORLD.SUNSET) / 1.5 + (G.time.dayTime < 6 ? 1 : 0))
    : 0;
  for (const pl of render.nightLights) pl.intensity = nightAmt * 60;
  if (G.world && G.world.stars) {
    G.world.stars.material.opacity = night ? Math.min(0.9, nightAmt + 0.3) : 0;
  }

  // --- Camera ------------------------------------------------------------------
  const t = followTarget(G);
  const input = G.input;

  // Mouse drag orbits; Q/E-free orbit via pointer movement while locked.
  if (input && input.consumeMouse) {
    const md = input.consumeMouse();
    render.camYaw -= md.dx * 0.0032;
    render.camPitch = Math.max(0.08, Math.min(1.1, render.camPitch + md.dy * 0.0022));
  }
  // Camera mode cycles with V.
  if (input && input.wasPressed && input.wasPressed(CFG.KEYS.CAMERA)) {
    render.camMode = (render.camMode + 1) % 3;
  }

  const dist = render.camMode === 0 ? 10 : render.camMode === 1 ? 16 : 26;
  const pitch = render.camMode === 2 ? 1.05 : render.camPitch;
  const yaw = t.heading + Math.PI + render.camYaw;
  const speed = Math.abs(t.speed || 0);
  const dynDist = dist + speed * 0.06;

  const cx = t.x + Math.sin(yaw) * Math.cos(pitch) * dynDist;
  const cz = t.z + Math.cos(yaw) * Math.cos(pitch) * dynDist;
  const cy = t.y + Math.sin(pitch) * dynDist + 1.2;

  // Smooth follow — the camera chases its ideal spot, never snaps.
  const k = 1 - Math.exp(-dt * 7);
  const cam = G.camera;
  cam.position.x += (cx - cam.position.x) * k;
  cam.position.y += (cy - cam.position.y) * k;
  cam.position.z += (cz - cam.position.z) * k;

  // Shake decays over half a second.
  if (render.shake > 0) {
    render.shake = Math.max(0, render.shake - dt * 2);
    const m = render.shakeMag * render.shake;
    cam.position.x += (Math.random() - 0.5) * m;
    cam.position.y += (Math.random() - 0.5) * m;
    cam.position.z += (Math.random() - 0.5) * m;
    if (render.shake === 0) render.shakeMag = 0;
  }

  // Look slightly ahead of the target in its direction of travel.
  const lookX = t.x - Math.sin(t.heading) * speed * 0.12;
  const lookZ = t.z - Math.cos(t.heading) * speed * 0.12;
  cam.lookAt(lookX, t.y + 0.6, lookZ);

  // Speed feel: the field of view widens a touch at high speed.
  const targetFov = 62 + Math.min(10, speed * 0.18);
  if (Math.abs(cam.fov - targetFov) > 0.05) {
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 4);
    cam.updateProjectionMatrix();
  }

  // Headlight follows the active vehicle after dark.
  if (render.headlight) {
    const v = G.player && G.player.vehicle && G.vehicles && G.vehicles.getActive
      ? G.vehicles.getActive() : null;
    if (v && night) {
      render.headlight.intensity = 260;
      render.headlight.position.set(v.pos.x, 1.2, v.pos.z);
      render.headlight.target.position.set(
        v.pos.x - Math.sin(v.heading) * 20,
        0,
        v.pos.z - Math.cos(v.heading) * 20,
      );
    } else {
      render.headlight.intensity = 0;
    }
  }

  // Menu state: slow cinematic orbit over the plaza instead of following.
  if (G.state === 'menu') {
    const a = G.time.t * 0.05;
    cam.position.set(Math.sin(a) * 180, 70, Math.cos(a) * 180);
    cam.lookAt(0, 10, 0);
  }
}

export function draw(G) {
  render.renderer.render(G.scene, G.camera);
}

export default render;
