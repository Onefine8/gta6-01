// activities.js — side work that pays: taxi fares, three street-race
// circuits, and 20 hidden packages. Owns G.activities. Everything is
// recorded on G.activities and persisted through G.save when available.

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

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function persist(G) {
  try {
    G.save?.save?.(G);
  } catch (e) { /* best-effort */ }
}

// ---------------------------------------------------------------- pure math (tested)

/** Taxi fare: base + per-metre, rounded to the nearest $5. Pure. */
export function taxiFare(distanceM, base, perM) {
  const raw = (base ?? 25) + distanceM * (perM ?? 0.35);
  return Math.max(25, Math.round(raw / 5) * 5);
}

/** Tip for a fast delivery: full tip under the target, half under 1.5x. Pure. */
export function taxiTip(fare, seconds, targetSeconds) {
  if (seconds <= targetSeconds) return Math.round(fare * 0.25);
  if (seconds <= targetSeconds * 1.5) return Math.round(fare * 0.1);
  return 0;
}

/** Race reward by finishing position (1st/2nd/3rd). Pure. */
export function raceReward(position, base) {
  if (position === 1) return base ?? 800;
  if (position === 2) return Math.round((base ?? 800) * 0.4);
  if (position === 3) return Math.round((base ?? 800) * 0.15);
  return 0;
}

/** Package payout: flat, with a bonus every 5th package. Pure. */
export function packagePayout(foundCount) {
  return foundCount % 5 === 0 ? 500 : 250;
}

/** The three race circuits: checkpoint loops with target times. Pure data.
 * Checkpoints sit on road centrelines (grid pitch 72) so they are reachable. */
export function raceCircuits() {
  return [
    {
      id: 'harbor',
      name: 'Harbor Loop',
      checkpoints: [
        { x: 144, z: 72 }, { x: 144, z: -72 }, { x: 72, z: -72 }, { x: 72, z: 72 },
      ],
      laps: 3,
      targetSeconds: 150,
      reward: 800,
    },
    {
      id: 'downtown',
      name: 'Downtown Sprint',
      checkpoints: [
        { x: 72, z: 0 }, { x: 0, z: 72 }, { x: -72, z: 0 }, { x: 0, z: -72 },
      ],
      laps: 2,
      targetSeconds: 110,
      reward: 1000,
    },
    {
      id: 'coast',
      name: 'Coast Run',
      checkpoints: [
        { x: -216, z: 216 }, { x: -72, z: 216 }, { x: -72, z: 288 }, { x: -216, z: 288 },
      ],
      laps: 2,
      targetSeconds: 130,
      reward: 1200,
    },
  ];
}

/** Deterministic hidden-package spots, seeded. Pure (given an rng). */
export function packageSpots(rng, count) {
  const spots = [];
  const half = 260;
  for (let i = 0; i < count; i++) {
    spots.push({
      id: i + 1,
      x: Math.round((rng() * 2 - 1) * half),
      z: Math.round((rng() * 2 - 1) * half),
      found: false,
    });
  }
  return spots;
}

// ---------------------------------------------------------------- module

/** Distance from (x, z) to segment AB. Pure. */
function distToSegment(x, z, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 === 0 ? 0 : ((x - ax) * abx + (z - az) * abz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (ax + abx * t), z - (az + abz * t));
}

/** Is (x, z) inside a building, with a margin so the player can stand there? */
function insideBuilding(G, x, z, margin = 2) {
  for (const b of G.world?.buildings ?? []) {
    if (x >= b.minX - margin && x <= b.maxX + margin
      && z >= b.minZ - margin && z <= b.maxZ + margin) return true;
  }
  return false;
}

/** Is (x, z) on (or right beside) a road? */
function onRoad(G, x, z) {
  for (const r of G.world?.roads ?? []) {
    if (distToSegment(x, z, r.ax, r.az, r.bx, r.bz) < 8) return true;
  }
  return false;
}

export function init(G) {
  const rng = rngFn(G);
  // Hidden packages: prefer the world's own spots (verified outside
  // buildings and roads); top up with verified random spots when the
  // world yielded fewer than 20 — the old unverified fallback could
  // hide a package inside a building, where the player can never reach it.
  const worldSpots = (G.world?.packageSpots ?? []).slice(0, 20);
  const spots = worldSpots.map((s, i) => ({ id: i + 1, x: s.x, z: s.z, found: false }));
  let guard = 0;
  while (spots.length < 20 && guard++ < 600) {
    const x = Math.round((rng() * 2 - 1) * 260);
    const z = Math.round((rng() * 2 - 1) * 260);
    if (insideBuilding(G, x, z) || onRoad(G, x, z)) continue;
    spots.push({ id: spots.length + 1, x, z, found: false });
  }
  G.activities = {
    taxi: { active: false, stage: 'idle', passenger: null, destination: null, timer: 0, fare: 0 },
    taxiDone: 0,
    taxiEarned: 0,
    races: raceCircuits().map((r) => ({ ...r, won: false, best: null })),
    race: null, // active race state
    racesWon: 0,
    packages: spots,
    packagesFound: 0,
    _rng: rng,
    _taxiCooldown: 0,
    _raceRival: null,

    /** Start a taxi fare with the nearest waiting pedestrian. */
    startTaxi() {
      const a = G.activities;
      if (a.taxi.active || a._taxiCooldown > 0) return false;
      const p = G.player;
      if (!p?.inVehicle || !p.vehicle) return false;
      // Find a ped near the car who wants a ride.
      const car = p.vehicle.pos;
      let best = null;
      let bestD = 30;
      for (const ped of G.peds?.list ?? []) {
        if (ped.state !== 'walk' && ped.state !== 'idle') continue;
        const d = dist2D(ped.pos, car);
        if (d < bestD) {
          bestD = d;
          best = ped;
        }
      }
      if (!best) return false;
      best.state = 'taxi';
      best.isTaxiPassenger = true;
      const dest = {
        x: clamp(Math.round((a._rng() * 2 - 1) * 240), -260, 260),
        z: clamp(Math.round((a._rng() * 2 - 1) * 240), -260, 260),
      };
      a.taxi = {
        active: true, stage: 'pickup', passenger: best, destination: dest,
        timer: 0, fare: 0, targetSeconds: 0,
      };
      try {
        G.hud?.banner?.('Taxi fare: pick up the passenger!', 4);
      } catch (e) { /* best-effort */ }
      emit(G, 'taxi-started', { destination: dest });
      return true;
    },

    /** Cancel the current fare (passenger walks away). */
    cancelTaxi() {
      const a = G.activities;
      if (a.taxi.passenger) {
        a.taxi.passenger.state = 'walk';
        a.taxi.passenger.isTaxiPassenger = false;
      }
      a.taxi = { active: false, stage: 'idle', passenger: null, destination: null, timer: 0, fare: 0 };
      a._taxiCooldown = 5;
    },

    /** Start a circuit race by id. The player must be in a car. */
    startRace(id) {
      const a = G.activities;
      if (a.race) return false;
      const def = a.races.find((r) => r.id === id);
      if (!def) return false;
      if (!G.player?.inVehicle) return false;
      const rival = G.vehicles.spawn({
        x: def.checkpoints[0].x + 6, z: def.checkpoints[0].z + 6,
        heading: Math.PI, kind: 'coupe', driver: 'rival',
        maxSpeed: 31, accel: 14,
      });
      a._raceRival = { vehicle: rival, checkpoint: 0, lap: 0, speed: 23 };
      a.race = {
        id: def.id, name: def.name, checkpoints: def.checkpoints,
        laps: def.laps, lap: 0, checkpoint: 0,
        timer: 0, targetSeconds: def.targetSeconds, reward: def.reward,
      };
      try {
        G.hud?.banner?.(`${def.name} — ${def.laps} laps, beat ${def.targetSeconds}s!`, 5);
      } catch (e) { /* best-effort */ }
      emit(G, 'race-started', { id: def.id });
      sfx(G, 'race-start');
      return true;
    },

    /** Finish the active race: pay by position vs the rival. */
    finishRace() {
      const a = G.activities;
      if (!a.race) return;
      const race = a.race;
      const rival = a._raceRival;
      const rivalDone = rival && rival.lap >= race.laps;
      const position = rivalDone ? 2 : 1;
      const reward = raceReward(position, race.reward);
      if (G.player) G.player.money += reward;
      if (position === 1) {
        const def = a.races.find((r) => r.id === race.id);
        if (def) def.won = true;
        a.racesWon += 1;
      }
      const def = a.races.find((r) => r.id === race.id);
      if (def) {
        const t = race.timer;
        if (def.best === null || t < def.best) def.best = Math.round(t * 10) / 10;
      }
      try {
        G.hud?.banner?.(
          position === 1 ? `Race won! +$${reward}` : `2nd place. +$${reward}`,
          5,
        );
      } catch (e) { /* best-effort */ }
      emit(G, 'race-finished', { id: race.id, position, reward });
      sfx(G, position === 1 ? 'race-win' : 'race-lose');
      if (rival?.vehicle) {
        rival.vehicle.driver = 'none';
        rival.vehicle.ai = null;
        rival.vehicle.speed = 0;
        a._raceRival = null;
      }
      a.race = null;
      persist(G);
    },
  };

  // Taxi fares are offered from the pause menu / M key via event.
  try {
    G.events?.on?.('taxi-request', () => G.activities.startTaxi());
    G.events?.on?.('race-request', (data) => {
      if (data?.id) G.activities.startRace(data.id);
    });
  } catch (e) { /* best-effort */ }

  return G.activities;
}

export function update(G, dt) {
  const a = G.activities;
  if (!a || G.state !== 'playing') return;
  dt = Math.min(dt, 0.05);
  const p = G.player;
  const playerPos = p?.inVehicle && p.vehicle ? p.vehicle.pos : p?.pos;
  a._taxiCooldown = Math.max(0, a._taxiCooldown - dt);

  // ---- taxi ----
  if (a.taxi.active && playerPos) {
    const t = a.taxi;
    t.timer += dt;
    if (t.stage === 'pickup') {
      const ped = t.passenger;
      if (!ped || ped.state !== 'taxi') {
        a.cancelTaxi();
      } else {
        // The passenger walks to the car door.
        const car = p.vehicle.pos;
        const d = dist2D(ped.pos, car);
        if (d > 3) {
          const nx = (car.x - ped.pos.x) / (d || 1);
          const nz = (car.z - ped.pos.z) / (d || 1);
          ped.pos.x += nx * 3.5 * dt;
          ped.pos.z += nz * 3.5 * dt;
          ped.heading = Math.atan2(nx, nz);
          if (ped.mesh) {
            ped.mesh.position.set(ped.pos.x, 0, ped.pos.z);
            ped.mesh.rotation.y = ped.heading;
          }
        } else {
          // In the car: hide the ped, drive to the destination.
          t.stage = 'dropoff';
          t.pickup = { x: car.x, z: car.z };
          t.targetSeconds = Math.max(45, dist2D(car, t.destination) / 12);
          if (ped.mesh) ped.mesh.visible = false;
          try {
            G.hud?.banner?.('Passenger aboard — take them to the marker!', 4);
          } catch (e) { /* best-effort */ }
        }
      }
    } else if (t.stage === 'dropoff') {
      if (dist2D(playerPos, t.destination) < 9) {
        const trip = dist2D(t.pickup ?? playerPos, t.destination);
        const fare = taxiFare(trip, cfg(G, 'TAXI_FARE', 120), 0.35);
        const tip = taxiTip(fare, t.timer, t.targetSeconds);
        const total = fare + tip;
        if (p) p.money += total;
        a.taxiDone += 1;
        a.taxiEarned += total;
        if (t.passenger) {
          t.passenger.state = 'walk';
          t.passenger.isTaxiPassenger = false;
          t.passenger.pos.x = t.destination.x + 2;
          t.passenger.pos.z = t.destination.z + 2;
          if (t.passenger.mesh) {
            t.passenger.mesh.visible = true;
            t.passenger.mesh.position.set(t.passenger.pos.x, 0, t.passenger.pos.z);
          }
        }
        try {
          G.hud?.banner?.(`Fare complete! +$${total}${tip > 0 ? ` (tip $${tip})` : ''}`, 5);
        } catch (e) { /* best-effort */ }
        emit(G, 'taxi-done', { fare: total, count: a.taxiDone });
        sfx(G, 'cash');
        a.taxi = { active: false, stage: 'idle', passenger: null, destination: null, timer: 0, fare: 0 };
        a._taxiCooldown = 3;
        persist(G);
      }
    }
    // Leaving the car mid-fare cancels it.
    if (a.taxi.active && !p?.inVehicle) a.cancelTaxi();
  }

  // ---- race ----
  if (a.race && playerPos) {
    const r = a.race;
    r.timer += dt;
    const cp = r.checkpoints[r.checkpoint];
    if (cp && dist2D(playerPos, cp) < 10) {
      r.checkpoint += 1;
      if (r.checkpoint >= r.checkpoints.length) {
        r.checkpoint = 0;
        r.lap += 1;
      }
      sfx(G, 'checkpoint');
      emit(G, 'checkpoint', { lap: r.lap + 1, checkpoint: r.checkpoint + 1 });
      if (r.lap >= r.laps) {
        a.finishRace();
      }
    }
    // Rival follows the checkpoints.
    const rival = a._raceRival;
    if (rival?.vehicle) {
      const rv = rival.vehicle;
      const rcp = r.checkpoints[rival.checkpoint];
      if (rcp) {
        const dx = rcp.x - rv.pos.x;
        const dz = rcp.z - rv.pos.z;
        const d = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        let dh = want - rv.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        rv.ai = { throttle: d > 4 ? 0.85 : 0.4, steer: clamp(dh * 2.4, -1, 1) };
        rv.speed = Math.min(rv.speed, rival.speed);
        if (d < 10) {
          rival.checkpoint += 1;
          if (rival.checkpoint >= r.checkpoints.length) {
            rival.checkpoint = 0;
            rival.lap += 1;
          }
        }
      }
    }
    // Timeout: slower than 2x the target ends the race.
    if (r.timer > r.targetSeconds * 2) {
      try {
        G.hud?.banner?.('Race abandoned — too slow.', 4);
      } catch (e) { /* best-effort */ }
      if (a._raceRival?.vehicle) {
        a._raceRival.vehicle.driver = 'none';
        a._raceRival.vehicle.ai = null;
      }
      a._raceRival = null;
      a.race = null;
    }
  }

  // ---- hidden packages ----
  if (playerPos) {
    for (const pkg of a.packages) {
      if (pkg.found) continue;
      if (dist2D(playerPos, pkg) < 2.5) {
        pkg.found = true;
        a.packagesFound += 1;
        const payout = packagePayout(a.packagesFound);
        if (p) p.money += payout;
        try {
          G.hud?.banner?.(`Hidden package found! +$${payout} (${a.packagesFound}/20)`, 4);
        } catch (e) { /* best-effort */ }
        emit(G, 'package-found', { id: pkg.id, count: a.packagesFound, payout });
        sfx(G, 'package');
        persist(G);
      }
    }
  }
}
