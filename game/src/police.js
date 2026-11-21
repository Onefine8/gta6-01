// police.js — the wanted system: heat 0..100 maps to 0..5 stars, cops spawn
// and chase, ramming the player's car; stand still near a cop and you get
// busted. Heat decays when the player lies low and unseen. Owns G.police.

import * as configModule from './config.js';
import * as randomModule from './random.js';

const CFG = configModule.CONFIG ?? configModule.default ?? {};
const mulberry32 = randomModule.mulberry32 ?? randomModule.default ?? null;

// ---------------------------------------------------------------- helpers

function cfg(G, key, fallback) {
  const c = G.cfg ?? CFG;
  const v = c == null ? undefined : c[key];
  return v === undefined || v === null ? fallback : v;
}

function section(G, name, fallback) {
  const c = G.cfg ?? CFG;
  const s = c == null ? undefined : c[name];
  return s === undefined || s === null ? fallback : s;
}

/** A callable RNG from G.rng (the createRng bundle) or a fresh mulberry32. */
function rngFn(G) {
  const r = G.rng;
  if (typeof r === 'function') return r;
  if (r && typeof r.next === 'function') return r.next;
  if (mulberry32) return mulberry32(G.seed ?? 7);
  return Math.random;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function emit(G, name, data) {
  try {
    G.events?.emit?.(name, data);
  } catch (e) { /* best-effort */ }
}

/** Map my sound names onto the audio module's real play() names. */
const SOUND_MAP = {
  hurt: 'crash', wasted: 'missionFail', door: 'doorSlam', steal: 'uiClick',
  bump: 'crash', checkpoint: 'pickup', delivery: 'pickup', ambush: 'wantedUp',
  cash: 'pickup', package: 'pickup', 'race-start': 'horn',
  'race-win': 'missionComplete', 'race-lose': 'missionFail',
  'mission-start': 'uiClick', 'mission-pass': 'missionComplete',
  'mission-fail': 'missionFail', siren: 'wantedUp', busted: 'missionFail',
  kill: 'pickup', 'shot-smg': 'shot', 'shot-enemy': 'shot', reload: 'reload',
  crash: 'crash', shot: 'shot', engine: null, footstep: 'footstep',
};

function sfx(G, name) {
  try {
    const mapped = Object.prototype.hasOwnProperty.call(SOUND_MAP, name)
      ? SOUND_MAP[name] : name;
    if (mapped) G.audio?.play?.(mapped);
  } catch (e) { /* audio is best-effort */ }
}

// ---------------------------------------------------------------- pure math (tested)

/** Heat thresholds: heat >= threshold[i] means wanted level i. */
export const WANTED_THRESHOLDS = [0, 12, 30, 52, 74, 92];

/** Wanted level (0..5) for a heat value 0..100. Pure. */
export function wantedForHeat(heat) {
  let level = 0;
  for (let i = 0; i < WANTED_THRESHOLDS.length; i++) {
    if (heat >= WANTED_THRESHOLDS[i]) level = i;
  }
  return level;
}

/** Heat gained for a crime type. Pure. */
export function heatForCrime(crime) {
  switch (crime) {
    case 'theft': return 14;
    case 'murder': return 30;
    case 'shooting': return 10;
    case 'speeding': return 3;
    case 'crash': return 4;
    case 'mission': return 20;
    default: return 8;
  }
}

/** How many cop cars should be on the street for a wanted level. Pure. */
export function copsForWanted(wanted) {
  return [0, 1, 2, 3, 4, 6][clamp(wanted, 0, 5)];
}

/** Heat decay per second while lying low (faster at low wanted). Pure. */
export function heatDecayRate(wanted, unseenSeconds) {
  const base = wanted <= 1 ? 6 : wanted <= 2 ? 3.5 : wanted <= 3 ? 2 : 1.2;
  return unseenSeconds > 8 ? base * 1.6 : base;
}

/** Star string for the HUD: '★★☆☆☆' style. Pure. */
export function starsString(wanted) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < wanted ? '★' : '☆';
  return s;
}

/** Fine charged on a bust, by wanted level. Pure. */
export function bustFine(wanted) {
  return [0, 50, 150, 400, 800, 1500][clamp(wanted, 0, 5)];
}

// ---------------------------------------------------------------- module

export function init(G) {
  const rng = rngFn(G);
  const pcfg = section(G, 'POLICE', {});
  G.police = {
    wanted: 0,
    heat: 0,
    cops: [],
    bustTimer: 0,
    bustHold: 0,
    unseenTimer: 0,
    lastCrimeAt: -999,
    chasing: false,
    _rng: rng,
    _spawnTimer: 0,

    /** Raise heat for a crime; wanted follows automatically. */
    addWanted(amount, crime) {
      const gain = typeof amount === 'number' ? amount : heatForCrime(crime || 'default');
      const before = G.police.wanted;
      G.police.heat = clamp(G.police.heat + gain, 0, 100);
      G.police.wanted = wantedForHeat(G.police.heat);
      G.police.lastCrimeAt = G.time ? G.time.t : 0;
      G.police.unseenTimer = 0;
      if (G.player) G.player.wanted = G.police.wanted;
      if (G.police.wanted > before) {
        emit(G, 'wanted-up', { wanted: G.police.wanted, crime: crime || 'unknown' });
        sfx(G, 'siren');
        try {
          G.hud?.flashWanted?.();
        } catch (e) { /* best-effort */ }
      }
      return G.police.wanted;
    },

    /** Set the wanted level directly (menu restart, screenshot staging). */
    setWanted(level) {
      const lv = clamp(Math.round(level ?? 0), 0, 5);
      G.police.heat = WANTED_THRESHOLDS[lv];
      G.police.wanted = lv;
      G.police.lastCrimeAt = G.time ? G.time.t : 0;
      if (G.player) G.player.wanted = lv;
      if (lv === 0) G.police.clearWanted();
      return lv;
    },

    /** Drop the heat straight to zero (mission end, cheat-free reset). */
    clearWanted() {
      G.police.heat = 0;
      G.police.wanted = 0;
      G.police.bustTimer = 0;
      G.police.chasing = false;
      if (G.player) G.player.wanted = 0;
      for (const cop of [...G.police.cops]) G.police.removeCop(cop);
      emit(G, 'wanted-cleared', {});
    },

    /** Is any cop actively chasing? (audio.update reads this for the siren.) */
    anyChasing() {
      return G.police.wanted > 0 && G.police.cops.length > 0;
    },

    /** Spawn one police car chasing the player. */
    spawnCop(opts = {}) {
      const player = G.player;
      if (!player) return null;
      const p = player.inVehicle && player.vehicle ? player.vehicle.pos : player.pos;
      // Spawn on a road 60-90 m away, in a random direction (or where asked).
      const ang = rng() * Math.PI * 2;
      const dist = 60 + rng() * 30;
      const x = opts.x !== undefined ? opts.x : clamp(p.x + Math.sin(ang) * dist, -285, 285);
      const z = opts.z !== undefined ? opts.z : clamp(p.z + Math.cos(ang) * dist, -285, 285);
      const v = G.vehicles.spawn({
        x, z,
        heading: opts.heading !== undefined ? opts.heading : Math.atan2(p.x - x, p.z - z),
        kind: 'police',
        driver: 'police',
        maxSpeed: cfg(G, 'POLICE_MAX_SPEED', 42),
        accel: cfg(G, 'POLICE_ACCEL', 19),
      });
      const cop = { vehicle: v, ramCooldown: 0, stuck: 0 };
      v.ai = { throttle: 0, steer: 0 };
      G.police.cops.push(cop);
      emit(G, 'cop-spawned', { vehicleId: v.id });
      return cop;
    },

    /** Alias used by the screenshot stager: spawn one cop at a spot. */
    spawn(opts = {}) {
      return G.police.spawnCop(opts);
    },

    /** Alias used by the screenshot stager: spawn n pursuing cops. */
    spawnPursuit(n) {
      const out = [];
      for (let i = 0; i < (n ?? 2); i++) {
        const c = G.police.spawnCop();
        if (c) out.push(c);
      }
      return out;
    },

    /** Remove a cop car from the world. */
    removeCop(cop) {
      const i = G.police.cops.indexOf(cop);
      if (i >= 0) G.police.cops.splice(i, 1);
      if (cop.vehicle) G.vehicles.remove(cop.vehicle);
    },

    /** Bust the player: fine, lose the heat, main.js shows the end screen. */
    bust() {
      const fine = Math.min(G.player?.money ?? 0, bustFine(G.police.wanted));
      if (G.player) {
        G.player.money -= fine;
        if (G.player.vehicle) G.player.exitVehicle();
      }
      G.police.clearWanted();
      emit(G, 'busted', { fine });
      G.state = 'busted';
      sfx(G, 'busted');
      if (G.missions?.onPlayerDown) G.missions.onPlayerDown('busted');
      return fine;
    },
  };

  // Crimes committed elsewhere in the game raise the heat through events.
  try {
    G.events?.on?.('crime', (data) => {
      if (data) G.police.addWanted(undefined, data.type || 'default');
    });
  } catch (e) { /* best-effort */ }

  return G.police;
}

export function update(G, dt) {
  const pol = G.police;
  if (!pol || G.state !== 'playing') return;
  dt = Math.min(dt, 0.05);
  const player = G.player;
  if (!player) return;
  const t = G.time ? G.time.t : 0;
  const playerVeh = player.inVehicle ? player.vehicle : null;
  const playerPos = playerVeh ? playerVeh.pos : player.pos;
  const playerSpeed = playerVeh ? Math.abs(playerVeh.speed) : Math.abs(player.speed ?? 0);
  const pcfg = section(G, 'POLICE', {});

  // ---- decay: no crime for a while and no cop can see the player ----
  let seen = false;
  for (const cop of pol.cops) {
    const v = cop.vehicle;
    if (!v) continue;
    const d = Math.hypot(v.pos.x - playerPos.x, v.pos.z - playerPos.z);
    if (d < 45) { seen = true; break; }
  }
  if (seen) pol.unseenTimer = 0;
  else pol.unseenTimer += dt;
  const sinceCrime = t - pol.lastCrimeAt;
  if (pol.heat > 0 && sinceCrime > (pcfg.decayDelay ?? 12) && pol.wanted < 3) {
    pol.heat = Math.max(0, pol.heat - heatDecayRate(pol.wanted, pol.unseenTimer) * dt);
    const w = wantedForHeat(pol.heat);
    if (w !== pol.wanted) {
      pol.wanted = w;
      emit(G, 'wanted-down', { wanted: w });
    }
  }
  // At 3+ stars the heat only decays when fully unseen for a long while.
  if (pol.heat > 0 && pol.wanted >= 3 && pol.unseenTimer > 20) {
    pol.heat = Math.max(0, pol.heat - 1.5 * dt);
    const w = wantedForHeat(pol.heat);
    if (w !== pol.wanted) {
      pol.wanted = w;
      emit(G, 'wanted-down', { wanted: w });
    }
  }

  // ---- spawn / despawn cops to match the wanted level ----
  const want = copsForWanted(pol.wanted);
  pol._spawnTimer -= dt;
  if (pol.cops.length < want && pol._spawnTimer <= 0) {
    pol.spawnCop();
    pol._spawnTimer = 1.5;
  }
  if (pol.cops.length > want) {
    // Keep the closest ones.
    pol.cops.sort((a, b) => {
      const da = Math.hypot(a.vehicle.pos.x - playerPos.x, a.vehicle.pos.z - playerPos.z);
      const db = Math.hypot(b.vehicle.pos.x - playerPos.x, b.vehicle.pos.z - playerPos.z);
      return da - db;
    });
    while (pol.cops.length > want) pol.removeCop(pol.cops[pol.cops.length - 1]);
  }

  // Chasing flag: audio.update reads it (or anyChasing()) for the siren.
  pol.chasing = pol.wanted > 0 && pol.cops.length > 0;

  // ---- chase AI: steer at the player, ram, and bust on foot ----
  pol.bustHold = 0;
  for (const cop of [...pol.cops]) {
    const v = cop.vehicle;
    if (!v) continue;
    const dx = playerPos.x - v.pos.x;
    const dz = playerPos.z - v.pos.z;
    const d = Math.hypot(dx, dz);

    // Steering: aim slightly ahead of the player.
    const lead = 0.35;
    const pHeading = playerVeh ? playerVeh.heading : (player.heading ?? 0);
    const pSpeed = playerVeh ? playerVeh.speed : (player.speed ?? 0);
    const tx = playerPos.x + Math.sin(pHeading) * pSpeed * lead;
    const tz = playerPos.z + Math.cos(pHeading) * pSpeed * lead;
    let wantHeading = Math.atan2(tx - v.pos.x, tz - v.pos.z);
    let dh = wantHeading - v.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = clamp(dh * 2.4, -1, 1);

    // Speed: chase at an approach speed that shrinks with distance (plus a
    // share of the player's speed, so a fleeing car stays catchable), and
    // brake hard when overshooting it — otherwise the cop orbits at 42 m/s
    // and never closes in.
    const approach = d < 6 ? d * 0.5 : Math.min(40, Math.max(6, d * 0.55));
    const wantSpeed = Math.min(42, approach + playerSpeed * 0.6);
    let throttle;
    if (d > 120) throttle = 1; // far away: full throttle to catch up
    else if (v.speed > wantSpeed + 1) throttle = -1; // brake
    else if (v.speed < wantSpeed - 1) throttle = 0.8;
    else throttle = 0.3;

    // Stuck: a cop that cannot move for a while respawns near the player.
    if (Math.abs(v.speed) < 0.5 && d > 10) {
      cop.stuck += dt;
      if (cop.stuck > 5) {
        pol.removeCop(cop);
        pol.spawnCop();
        continue;
      }
    } else {
      cop.stuck = 0;
    }

    v.ai = { throttle, steer };
    cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);

    // Ram: bump the player's car and hurt it.
    if (playerVeh && d < 3.6 && cop.ramCooldown <= 0) {
      cop.ramCooldown = 1.2;
      playerVeh.speed *= 0.75;
      playerVeh.health -= 6;
      sfx(G, 'bump');
      emit(G, 'cop-ram', { damage: 6 });
      if (playerVeh.health <= 0) emit(G, 'car-wrecked', { vehicleId: playerVeh.id });
    }

    // Bust: on foot, slow, and a cop right next to the player.
    const bustRadius = pcfg.bustRadius ?? 2.2;
    if (!playerVeh && d < bustRadius && playerSpeed < 1.5) {
      pol.bustHold = Math.max(pol.bustHold, 1);
      pol.bustTimer += dt;
      if (pol.bustTimer > cfg(G, 'BUST_HOLD_TIME', 1.5)) {
        pol.bustTimer = 0;
        pol.bust();
        return;
      }
    }
  }
  if (pol.bustHold === 0) pol.bustTimer = 0;
}
