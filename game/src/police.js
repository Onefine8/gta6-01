// police.js — wanted level, PMPD pursuit, busts and heat decay.
//
// Owns G.police. Heat (0–100) is the single number behind the stars:
// crimes add heat, quiet time bleeds it away. Police cars are real
// vehicles (model 'police') whose `drive` field this module writes every
// tick; vehicles.js does the physics. Pure wanted math is exported so the
// test suite can check the thresholds without a browser.

export const HEAT_MAX = 100;
export const HEAT_DECAY_QUIET = 3.0; // per second, no recent crime
export const HEAT_DECAY_HOT = 1.2; // per second, still being chased
export const CRIME_COOLDOWN = 6; // seconds after a crime before decay
export const BUST_TIME = 3; // seconds pinned by a cop on foot to be busted
export const BUST_RADIUS = 4.5;
export const POLICE_SPAWN_RADIUS = 70;
export const POLICE_DESPAWN_RADIUS = 260;

// Heat thresholds for each wanted level (stars shown = index).
export const WANTED_THRESHOLDS = [0, 12, 30, 50, 70, 90];

export function wantedFromHeat(heat) {
  let w = 0;
  for (let i = 1; i < WANTED_THRESHOLDS.length; i++) {
    if (heat >= WANTED_THRESHOLDS[i]) w = i;
  }
  return w;
}

export function heatForWanted(level) {
  const l = Math.max(0, Math.min(5, level));
  return WANTED_THRESHOLDS[l];
}

export function decayStep(heat, dt, rate) {
  return Math.max(0, heat - rate * dt);
}

export function spawnCountForWanted(wanted) {
  return [0, 1, 2, 3, 4, 6][Math.max(0, Math.min(5, wanted))] ?? 0;
}

// Steering + throttle to chase a target position.
export function chaseDrive(car, target) {
  const dx = target.x - car.pos.x;
  const dz = target.z - car.pos.z;
  const want = Math.atan2(dx, -dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  const dist = Math.hypot(dx, dz);
  const throttle = dist > 6 ? 1 : 0.4;
  return { throttle, steer, handbrake: false };
}

// Bust progress: +dt while a cop is close and Rook is slow on foot,
// decaying otherwise. Returns the new progress.
export function bustProgressStep(progress, pinned, dt) {
  if (pinned) return progress + dt;
  return Math.max(0, progress - dt * 1.5);
}

// --- heat API (other modules call these) ---------------------------------

export function addHeat(G, amount, reason) {
  const pol = G.police;
  if (!pol) return 0;
  const before = pol.wanted;
  pol.heat = Math.min(HEAT_MAX, pol.heat + amount);
  pol.lastCrimeAt = G.time ? G.time.t : 0;
  pol.wanted = wantedFromHeat(pol.heat);
  if (pol.wanted > before) {
    if (G.events && typeof G.events.emit === 'function') {
      G.events.emit('wanted', { level: pol.wanted, reason });
    }
    if (G.hud && typeof G.hud.flashWanted === 'function') G.hud.flashWanted();
  }
  return pol.wanted;
}

export function setWanted(G, level) {
  const pol = G.police;
  if (!pol) return 0;
  pol.heat = heatForWanted(level);
  pol.lastCrimeAt = G.time ? G.time.t : 0;
  pol.wanted = level;
  return level;
}

export function clearWanted(G) {
  const pol = G.police;
  if (!pol) return;
  pol.heat = 0;
  pol.wanted = 0;
  pol.bustProgress = 0;
}

// --- spawning ------------------------------------------------------------

function spawnPoliceCar(G, near) {
  const spawn = (G.vehicles && typeof G.vehicles.spawn === 'function')
    ? G.vehicles.spawn
    : (typeof G.vehiclesSpawn === 'function' ? G.vehiclesSpawn : null);
  if (typeof spawn !== 'function') return null;
  const rng = G.rng;
  const r = () => (rng && typeof rng.next === 'function' ? rng.next() : Math.random());
  const angle = r() * Math.PI * 2;
  const dist = POLICE_SPAWN_RADIUS * (0.7 + r() * 0.6);
  const x = near.x + Math.cos(angle) * dist;
  const z = near.z + Math.sin(angle) * dist;
  const car = spawn({ x, z, heading: r() * Math.PI * 2, model: 'police', driver: 'police', owned: true });
  if (!car) return null;
  car.ai = { mode: 'chase' };
  G.police.cars.push(car);
  if (G.audio && typeof G.audio.play === 'function') G.audio.play('siren');
  return car;
}

function despawnPoliceCar(G, car) {
  const list = G.police.cars;
  const i = list.indexOf(car);
  if (i >= 0) list.splice(i, 1);
  if (G.vehicles && typeof G.vehicles.despawn === 'function') G.vehicles.despawn(car);
}

// Spawn a pursuit of `stars` cars around a position (shots.js staging).
export function spawnPursuit(G, pos, stars) {
  const n = spawnCountForWanted(stars);
  const out = [];
  for (let i = 0; i < n; i++) {
    const car = spawnPoliceCar(G, pos);
    if (car) out.push(car);
  }
  return out;
}

// --- lifecycle -----------------------------------------------------------

export function init(G) {
  // Replace the (frozen) module namespace on G with the live police
  // object: wanted state plus update() and the helpers other modules and
  // shots.js call (addHeat / setWanted / clearWanted / spawnPursuit).
  G.police = {
    wanted: 0,
    heat: 0,
    cars: [],
    bustProgress: 0,
    lastCrimeAt: -99,
    spawnTimer: 0,
    sirenTimer: 0,
    update,
    addHeat: (amount, reason) => addHeat(G, amount, reason),
    setWanted: (level) => setWanted(G, level),
    clearWanted: () => clearWanted(G),
    spawnPursuit: (pos, stars) => spawnPursuit(G, pos, stars),
  };
  return G.police;
}

export function update(G, dt) {
  const pol = G.police;
  if (!pol || G.state !== 'playing') return;
  const now = G.time ? G.time.t : 0;
  const p = G.player ? G.player.pos : { x: 0, z: 0 };
  const pv = G.vehicles ? G.vehicles.playerVehicle : null;

  // Heat decay: only once the crime cooldown has passed.
  if (now - pol.lastCrimeAt > CRIME_COOLDOWN && pol.heat > 0) {
    const rate = pol.wanted >= 3 ? HEAT_DECAY_HOT : HEAT_DECAY_QUIET;
    pol.heat = decayStep(pol.heat, dt, rate);
    const w = wantedFromHeat(pol.heat);
    if (w !== pol.wanted) {
      pol.wanted = w;
      if (G.events && typeof G.events.emit === 'function') {
        G.events.emit('wanted', { level: w, reason: 'decay' });
      }
    }
  }

  // Keep the pursuit at strength for the current wanted level.
  pol.spawnTimer -= dt;
  const want = spawnCountForWanted(pol.wanted);
  if (pol.spawnTimer <= 0) {
    pol.spawnTimer = 1.2;
    if (pol.cars.length < want) spawnPoliceCar(G, p);
  }

  // Siren reminder while wanted.
  if (pol.wanted > 0) {
    pol.sirenTimer -= dt;
    if (pol.sirenTimer <= 0) {
      pol.sirenTimer = 6;
      if (G.audio && typeof G.audio.play === 'function') G.audio.play('siren');
    }
  }

  let pinned = false;
  for (let i = pol.cars.length - 1; i >= 0; i--) {
    const car = pol.cars[i];
    if (!car || car.wrecked) {
      pol.cars.splice(i, 1);
      continue;
    }
    const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
    if (pol.wanted === 0 || d > POLICE_DESPAWN_RADIUS) {
      despawnPoliceCar(G, car);
      continue;
    }
    car.drive = chaseDrive(car, p);

    // Ramming the player's car slows it and hurts it.
    if (pv && d < 3.2 && Math.abs(car.speed) > 6) {
      if (G.vehicles && typeof G.vehicles.damageVehicle === 'function') {
        G.vehicles.damageVehicle(pv, 4 * dt * 10, 'ram');
      }
      car.speed *= 0.7;
    }
    // On foot and slow with a cop on top of Rook: busted.
    const bustRadius = (G.cfg && G.cfg.WANTED && G.cfg.WANTED.BUST_RADIUS) || BUST_RADIUS;
    const playerSlow = !pv || Math.abs(pv.speed) < 1.5;
    if (!pv && d < bustRadius && playerSlow) pinned = true;
  }

  const bustTime = (G.cfg && G.cfg.WANTED && G.cfg.WANTED.BUST_TIME) || BUST_TIME;
  pol.bustProgress = bustProgressStep(pol.bustProgress, pinned, dt);
  if (pol.bustProgress >= bustTime) {
    pol.bustProgress = 0;
    clearWanted(G);
    // State transitions belong to main.js: it listens for 'busted' and
    // shows the end screen (and takes the bail). Never set G.state here.
    if (G.events && typeof G.events.emit === 'function') G.events.emit('busted', {});
    if (G.audio && typeof G.audio.play === 'function') G.audio.play('busted');
    if (G.hud && typeof G.hud.showMessage === 'function') {
      G.hud.showMessage('BUSTED — the PMPD took you in.');
    }
  }
}
