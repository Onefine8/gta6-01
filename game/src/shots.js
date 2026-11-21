// Meridian Heat — screenshot staging presets (?shot=chase|walk|mission|night).
// Each preset drops the player into a composed, already-playing scene so a
// headless screenshot shows the game at its best: chase, on-foot city,
// mission in progress, neon night. Audio stays silent in shot mode.
// Only imports config.js / random.js; everything else goes through G and is
// guarded, so staging never throws when a gameplay module is absent.
import { CONFIG } from './config.js';
import { createRng } from './random.js';

const cfg = CONFIG;

const PRESETS = {
  chase: {
    dayTime: 15.0, wanted: 2,
    player: { x: 36, z: 0, heading: Math.PI / 2 },
    note: 'Police pursuit on a downtown avenue',
  },
  walk: {
    dayTime: 11.0, wanted: 0,
    // Sidewalk edge of the x=0 downtown avenue, facing down the road so
    // the follow camera (11 m behind) frames a street vista, not a wall.
    player: { x: 7, z: 40, heading: Math.PI },
    note: 'On foot in Downtown Port Meridian',
  },
  mission: {
    dayTime: 13.5, wanted: 0, mission: 0,
    player: { x: -18, z: 84, heading: Math.PI },
    note: 'Mission 1 — First Wheels: steal a car, reach Mara’s garage',
  },
  night: {
    dayTime: 21.5, wanted: 1,
    // Same downtown avenue, facing -z: building neon strips sit on the
    // maxZ faces, so they read from this direction; Meridian Tower closes
    // the vista at the end of the road.
    player: { x: 7, z: -40, heading: Math.PI },
    note: 'Neon night in Downtown Port Meridian',
  },
};

function $(id) {
  return document.getElementById(id);
}

function showHud() {
  const hud = $('hud');
  if (hud) hud.classList.remove('hidden');
  const menu = $('menu');
  if (menu) menu.classList.add('hidden');
  const pause = $('pause-menu');
  if (pause) pause.classList.add('hidden');
  const end = $('end-screen');
  if (end) end.classList.add('hidden');
}

function placePlayer(G, spot) {
  const p = G.player;
  if (!p) return;
  p.x = spot.x;
  p.z = spot.z;
  p.heading = spot.heading;
  if (typeof p.speed !== 'undefined') p.speed = 0;
  if (typeof p.health !== 'undefined') p.health = cfg.PLAYER.maxHealth;
  if (typeof p.inVehicle !== 'undefined') p.inVehicle = false;
  if (p.pos) { p.pos.x = spot.x; p.pos.z = spot.z; }
}

function setWanted(G, level) {
  // Prefer the police module's own setter when it exists.
  if (G.police && typeof G.police.setWanted === 'function') {
    G.police.setWanted(level);
    return;
  }
  if (G.police) G.police.wanted = level;
  else G.police = { wanted: level, chasing: level > 0 };
}

function stageChaseVehicles(G, rng) {
  // Put the player in a car and police cars behind, when those modules exist.
  if (G.vehicles && typeof G.vehicles.spawnCar === 'function' && G.player) {
    const car = G.vehicles.spawnCar({
      x: G.player.x, z: G.player.z, heading: G.player.heading, model: 'sedan', color: 0xc03028,
    });
    if (car && typeof G.vehicles.enter === 'function') G.vehicles.enter(car);
    else if (car && G.player) { G.player.inVehicle = true; G.player.vehicle = car; }
    if (car) car.speed = 26;
  } else if (G.vehicles && Array.isArray(G.vehicles.list) && G.player) {
    // Fallback: a plain car record the render loop can draw later.
    const car = {
      x: G.player.x, z: G.player.z, heading: G.player.heading,
      speed: 26, color: 0xc03028, model: 'sedan', isPlayer: true,
    };
    G.vehicles.list.push(car);
    G.player.inVehicle = true;
    G.player.vehicle = car;
  }
  if (G.police && typeof G.police.spawnPursuit === 'function') {
    G.police.spawnPursuit(2);
  } else if (G.police && typeof G.police.spawn === 'function') {
    G.police.spawn({ x: G.player.x - 18, z: G.player.z - 6, heading: G.player.heading });
    G.police.spawn({ x: G.player.x - 26, z: G.player.z + 8, heading: G.player.heading });
  }
  void rng;
}

function stageMission(G, preset) {
  if (G.missions && typeof G.missions.start === 'function') {
    G.missions.start(preset.mission || 0);
  } else if (G.missions) {
    G.missions.currentIndex = preset.mission || 0;
    G.missions.active = true;
  }
  // Waypoint marker: garage just ahead of the player.
  if (G.hud && typeof G.hud.setObjective === 'function') {
    G.hud.setObjective('Steal a car and drive it to Mara’s garage');
  }
  const obj = $('objective');
  if (obj) obj.textContent = 'Steal a car and drive it to Mara’s garage';
}

function stageWalkCrowd(G) {
  // A few pedestrians nearby make the street feel alive.
  if (G.peds && typeof G.peds.spawn === 'function') {
    for (let i = 0; i < 6; i++) {
      G.peds.spawn({
        x: G.player.x + (i - 3) * 6,
        z: G.player.z + 14 - i * 3,
      });
    }
  }
}

export function init(G) {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot || !PRESETS[shot]) return null;

  const preset = PRESETS[shot];
  const seedParam = params.get('seed');
  const seed = seedParam !== null ? Number(seedParam) : cfg.SHOTS[shot].seed;
  const rng = createRng(Number.isFinite(seed) ? seed : 7);

  G.shotMode = true;
  G.shot = shot;

  // Silence audio completely in screenshot mode.
  if (G.audio && typeof G.audio.setMuted === 'function') G.audio.setMuted(true);

  // Time of day for the shot (world.update advances the clock from here).
  G.time.dayTime = preset.dayTime;

  // Player placement + wanted level.
  placePlayer(G, preset.player);
  setWanted(G, preset.wanted);

  // Per-preset staging.
  if (shot === 'chase') stageChaseVehicles(G, rng);
  if (shot === 'walk') stageWalkCrowd(G);
  if (shot === 'mission') stageMission(G, preset);
  if (shot === 'night' && G.police && typeof G.police.spawn === 'function') {
    // Police car ahead on the same avenue, in frame, lights on.
    G.police.spawn({ x: 0, z: G.player.z - 25, heading: G.player.heading });
  }

  // Skip the start screen: go straight into the playing scene.
  G.state = 'playing';
  if (G.render && typeof G.render.setCameraMode === 'function') {
    G.render.setCameraMode('follow');
  }
  showHud();

  // Banner text so the shot reads as a live mission moment.
  const msg = $('message');
  if (msg) {
    msg.textContent = preset.note;
    msg.classList.remove('hidden');
  }
  if (G.hud && typeof G.hud.showMessage === 'function') {
    G.hud.showMessage(preset.note);
  }

  G.shotStaged = { name: shot, seed: rng.seed, note: preset.note };
  return G.shotStaged;
}

export function update(G, dt) {
  void dt;
  // Shots are static staging: nothing per-frame. The world clock and the
  // normal game loop keep running so traffic, water and the sun stay alive.
  if (!G.shotMode) return;
  // Chase: hold the throttle so the getaway car keeps rolling at pursuit
  // speed (and the speedometer reads motion) instead of coasting to a
  // stop while the screenshot is framed. Staging-only: no gameplay module
  // is touched, and the key is only held while this preset is staged.
  if (G.shot === 'chase' && G.input && G.input.held) {
    G.input.held.add('KeyW');
  }
}

export default { init, update, PRESETS };
