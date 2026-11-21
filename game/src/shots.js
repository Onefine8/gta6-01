// Meridian Heat — screenshot presets (?shot=chase|walk|mission|night&seed=N).
// Stages a deterministic scene for the finisher's headless screenshots:
// positions the player, spawns traffic/police, sets the time of day and
// the camera, then starts the game with audio muted. Every step guards
// against gameplay modules that are still stubs, so staging never throws.

import { CFG } from './config.js';

export const shots = {
  active: false,
  preset: null,
  seed: CFG.DEFAULT_SEED,
};

function roadPos(G, x, z) {
  if (G.world && G.world.nearestRoadPoint) return G.world.nearestRoadPoint(x, z);
  return { x, z, heading: 0 };
}

function placePlayer(G, x, z, heading) {
  const p = G.player;
  if (!p || !p.pos) return;
  const rp = roadPos(G, x, z);
  p.pos.x = rp.x;
  p.pos.z = rp.z;
  p.pos.y = 0;
  p.heading = heading !== undefined ? heading : rp.heading;
  p.onFoot = true;
  p.vehicle = null;
  if (typeof p.speed !== 'undefined') p.speed = 0;
}

function giveCar(G, x, z, heading, color) {
  const p = G.player;
  const v = G.vehicles;
  if (!p || !v || typeof v.spawn !== 'function') return null;
  const rp = roadPos(G, x, z);
  const car = v.spawn({
    x: rp.x, z: rp.z, heading: heading !== undefined ? heading : rp.heading,
    color: color || 0xc03028, parked: false,
  });
  if (car && typeof v.enter === 'function') v.enter(car);
  else if (car) { p.vehicle = car; p.onFoot = false; }
  return car;
}

function spawnTraffic(G, n, nearX, nearZ) {
  const t = G.traffic;
  if (!t || typeof t.spawnNear !== 'function') return;
  for (let i = 0; i < n; i++) t.spawnNear(nearX, nearZ, 40 + i * 12);
}

function setWanted(G, stars) {
  const pol = G.police;
  if (!pol) return;
  pol.wanted = stars;
  if (typeof pol.setWanted === 'function') pol.setWanted(stars);
  if (typeof pol.spawnPursuit === 'function' && stars > 0) {
    const p = G.player;
    pol.spawnPursuit(p ? p.pos : { x: 0, z: 0 }, stars);
  }
}

function setObjective(G, text) {
  const n = document.getElementById('objective');
  if (n) n.textContent = text;
  if (G.hud && typeof G.hud.setObjective === 'function') G.hud.setObjective(text);
}

function setMessage(G, text) {
  const n = document.getElementById('message');
  if (n) {
    n.textContent = text;
    n.classList.remove('hidden');
  }
  if (G.hud && typeof G.hud.showMessage === 'function') G.hud.showMessage(text, 30);
}

const PRESETS = {
  // Police chase at dusk: Rook in a red coupe, 3 stars, two cop cars close.
  chase(G) {
    G.time.dayTime = 17.8;
    const p = G.player;
    const cx = p && p.pos ? p.pos.x : 0;
    const cz = p && p.pos ? p.pos.z : 0;
    giveCar(G, cx, cz, 0, 0xc03028);
    setWanted(G, 3);
    spawnTraffic(G, 6, cx, cz);
    setObjective(G, 'Lose the cops — 3 stars');
    setMessage(G, 'MERIDIAN PD IN PURSUIT');
    if (G.render) { G.render.camDist = 13; G.render.camPitch = 0.3; }
  },

  // On foot in Downtown at midday, pedestrians and traffic around.
  walk(G) {
    G.time.dayTime = 11.2;
    const lm = G.world && G.world.landmarks;
    const x = lm ? lm.plaza.x : 0;
    const z = lm ? lm.plaza.z : 0;
    placePlayer(G, x, z + 6, Math.PI * 0.75);
    spawnTraffic(G, 8, x, z);
    if (G.peds && typeof G.peds.spawnNear === 'function') {
      for (let i = 0; i < 6; i++) G.peds.spawnNear(x, z, 25);
    }
    setObjective(G, 'Explore Port Meridian');
    setMessage(G, 'DOWNTOWN — MERIDIAN PLAZA');
    if (G.render) { G.render.camDist = 9; G.render.camPitch = 0.35; }
  },

  // Mission 1 in progress: stolen car, waypoint to Mara's garage.
  mission(G) {
    G.time.dayTime = 9.4;
    const lm = G.world && G.world.landmarks;
    giveCar(G, lm ? lm.spawn.x : 0, lm ? lm.spawn.z : 0, Math.PI / 2, 0x2e6bb0);
    if (G.missions && typeof G.missions.start === 'function') {
      G.missions.start(1);
    } else if (G.missions) {
      G.missions.current = 1;
    }
    if (lm && G.missions && typeof G.missions.setWaypoint === 'function') {
      G.missions.setWaypoint(lm.garage.x, lm.garage.z, 'Mara\u2019s Garage');
    }
    spawnTraffic(G, 5, lm ? lm.spawn.x : 0, lm ? lm.spawn.z : 0);
    setObjective(G, 'Mission 1 — First Wheels: drive to Mara\u2019s Garage');
    setMessage(G, 'MISSION 1 — FIRST WHEELS');
    if (G.render) { G.render.camDist = 12; G.render.camPitch = 0.32; }
  },

  // Night in the neon district: 2 stars, wet-looking streets, signs lit.
  night(G) {
    G.time.dayTime = 21.6;
    const lm = G.world && G.world.landmarks;
    const x = lm ? lm.tower.x : 0;
    const z = lm ? lm.tower.z + 60 : 0;
    giveCar(G, x, z, Math.PI, 0xc0c8d0);
    setWanted(G, 2);
    spawnTraffic(G, 8, x, z);
    if (G.peds && typeof G.peds.spawnNear === 'function') {
      for (let i = 0; i < 4; i++) G.peds.spawnNear(x, z, 30);
    }
    setObjective(G, 'Lose the cops — 2 stars');
    setMessage(G, 'MERIDIAN TOWER — 21:36');
    if (G.render) { G.render.camDist = 12; G.render.camPitch = 0.3; }
  },
};

export function init(G) {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('shot');
  if (!preset || !PRESETS[preset]) return shots;
  const seedParam = params.get('seed');
  shots.seed = seedParam !== null ? Number(seedParam) || CFG.DEFAULT_SEED : G.seed;
  shots.preset = preset;
  shots.active = true;
  G.shotMode = true;

  // Deterministic staging: re-seed the world RNG for this shot.
  // (The city itself was built at boot from G.seed; staging only moves actors.)
  try {
    PRESETS[preset](G);
  } catch (e) {
    console.warn('[shots] staging failed for preset', preset, e);
  }

  // Silence: screenshots run headless with no gesture, so keep audio off.
  if (G.audio) G.audio.muted = true;
  return shots;
}

export function update(G, dt) {
  void G;
  void dt;
  // Staging is one-shot; the running game needs no per-frame work.
  // (Kept for the init/update module contract.)
}

export default shots;
