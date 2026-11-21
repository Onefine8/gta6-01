// activities.js — side work: taxi fares, street circuits, hidden packages.
//
// Owns G.activities. All three activities pay into G.player.money and are
// recorded in G.save so progress survives a reload. Package spots are
// placed with a tiny local seeded generator (so the same seed always hides
// them in the same places) and then snapped to the nearest road when the
// world offers one. No DOM, no THREE: markers are exposed as plain data
// for hud.js / render.js to draw.

export const PACKAGE_COUNT = 20;
export const PACKAGE_RADIUS = 3.5;
export const PACKAGE_REWARD = 100;
export const PACKAGE_BONUS_AT = { 10: 500, 20: 1000 };
export const TAXI_BASE_FARE = 20;
export const TAXI_PER_METER = 0.15;
export const RACE_REWARD = 1500;

// Economy numbers come from G.cfg.ECONOMY when present (config.js is the
// single source of truth); the constants above are test fallbacks.
export function economy(G) {
  const c = (G && G.cfg && G.cfg.ECONOMY) || {};
  return {
    taxiBase: c.TAXI_FARE_BASE ?? TAXI_BASE_FARE,
    taxiPerM: c.TAXI_FARE_PER_M ?? TAXI_PER_METER,
    packageReward: c.PACKAGE_REWARD ?? PACKAGE_REWARD,
    raceReward: c.RACE_REWARD ?? RACE_REWARD,
  };
}

export const CIRCUITS = {
  beachfront: { name: 'Beachfront Loop', center: { x: 200, z: 180 }, rx: 90, rz: 70, laps: 3 },
  downtown: { name: 'Downtown Sprint', center: { x: 0, z: 0 }, rx: 110, rz: 80, laps: 3 },
  harbor: { name: 'Harbor Run', center: { x: 200, z: -180 }, rx: 80, rz: 60, laps: 2 },
};

// --- pure helpers --------------------------------------------------------

// Small seeded generator (mulberry32) so package spots are stable per seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic package spots for a seed, before road snapping.
export function packageSpots(seed, count) {
  const rand = mulberry32(seed);
  const spots = [];
  for (let i = 0; i < count; i++) {
    spots.push({ x: (rand() - 0.5) * 780, z: (rand() - 0.5) * 780, found: false });
  }
  return spots;
}

export function taxiFare(distanceM, econ) {
  const e = econ ?? { taxiBase: TAXI_BASE_FARE, taxiPerM: TAXI_PER_METER };
  return Math.round(e.taxiBase + distanceM * e.taxiPerM);
}

export function raceCheckpoints(circuit) {
  const c = circuit.center;
  return [
    { x: c.x + circuit.rx, z: c.z },
    { x: c.x, z: c.z + circuit.rz },
    { x: c.x - circuit.rx, z: c.z },
    { x: c.x, z: c.z - circuit.rz },
  ];
}

export function formatRaceTime(seconds) {
  if (seconds == null) return '--:--.--';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

// --- taxi ----------------------------------------------------------------

export function startTaxi(G) {
  const a = G.activities;
  if (a.taxi.active) return false;
  const pv = G.vehicles ? G.vehicles.playerVehicle : null;
  if (!pv) {
    if (G.hud && typeof G.hud.showMessage === 'function') {
      G.hud.showMessage('You need a car to drive a taxi.');
    }
    return false;
  }
  // Nearest pedestrian becomes the passenger.
  const peds = (G.peds && G.peds.list) || [];
  const p = G.player.pos;
  let best = null;
  let bestD = 60;
  for (const ped of peds) {
    const d = Math.hypot(ped.pos.x - p.x, ped.pos.z - p.z);
    if (d < bestD) {
      best = ped;
      bestD = d;
    }
  }
  if (!best) {
    if (G.hud && typeof G.hud.showMessage === 'function') {
      G.hud.showMessage('No passengers nearby.');
    }
    return false;
  }
  a.taxi = {
    active: true,
    stage: 'pickup',
    passenger: best,
    pickup: { x: best.pos.x, z: best.pos.z },
    dropoff: null,
    fare: 0,
  };
  if (G.hud && typeof G.hud.showMessage === 'function') {
    G.hud.showMessage('Taxi job: pick up the passenger (yellow marker).');
  }
  return true;
}

function updateTaxi(G, dt) {
  const a = G.activities;
  const t = a.taxi;
  if (!t.active) return;
  void dt;
  const p = G.player.pos;
  const pv = G.vehicles ? G.vehicles.playerVehicle : null;
  if (!pv) {
    // Left the car: the passenger walks away, job cancelled.
    a.taxi = { active: false, stage: null, passenger: null, pickup: null, dropoff: null, fare: 0 };
    if (G.hud && typeof G.hud.showMessage === 'function') {
      G.hud.showMessage('Taxi job cancelled — you left the car.');
    }
    return;
  }
  if (t.stage === 'pickup') {
    const d = Math.hypot(p.x - t.pickup.x, p.z - t.pickup.z);
    if (d < 6) {
      // Passenger boards: remove the ped from the street.
      if (t.passenger && t.passenger.mesh && G.scene) G.scene.remove(t.passenger.mesh);
      if (G.peds) {
        const i = G.peds.list.indexOf(t.passenger);
        if (i >= 0) G.peds.list.splice(i, 1);
      }
      const drop = randomRoadPos(G);
      const dist = Math.hypot(drop.x - p.x, drop.z - p.z);
      t.dropoff = drop;
      t.fare = taxiFare(dist, economy(G));
      t.stage = 'dropoff';
      if (G.hud && typeof G.hud.showMessage === 'function') {
        G.hud.showMessage(`Passenger aboard. Destination marked — fare $${t.fare}.`);
      }
    }
  } else if (t.stage === 'dropoff') {
    const d = Math.hypot(p.x - t.dropoff.x, p.z - t.dropoff.z);
    if (d < 10) {
      const fare = t.fare;
      const tip = Math.random() < 0.3 ? 10 : 0;
      // Money is canonical on G (main.js / save.js own it).
      G.money = (typeof G.money === 'number' ? G.money : 0) + fare + tip;
      a.earnings.taxi += fare + tip;
      a.taxiDone = (a.taxiDone ?? 0) + 1;
      a.taxi = { active: false, stage: null, passenger: null, pickup: null, dropoff: null, fare: 0 };
      if (G.hud && typeof G.hud.showMessage === 'function') {
        G.hud.showMessage(`Fare paid: $${fare}${tip ? ` + $${tip} tip` : ''}. Thanks, driver!`);
      }
      if (G.audio && typeof G.audio.play === 'function') G.audio.play('cash');
    }
  }
}

// --- races ---------------------------------------------------------------

export function startRace(G, circuitId) {
  const a = G.activities;
  const circuit = CIRCUITS[circuitId];
  if (!circuit) return false;
  if (a.race.active) return false;
  const pv = G.vehicles ? G.vehicles.playerVehicle : null;
  if (!pv) {
    if (G.hud && typeof G.hud.showMessage === 'function') {
      G.hud.showMessage('You need a car to race.');
    }
    return false;
  }
  a.race = {
    active: true,
    id: circuitId,
    cps: raceCheckpoints(circuit),
    cp: 0,
    lap: 1,
    laps: circuit.laps,
    timer: 0,
  };
  if (G.hud && typeof G.hud.showMessage === 'function') {
    G.hud.showMessage(`${circuit.name}: ${circuit.laps} laps — hit every checkpoint!`);
  }
  return true;
}

function updateRace(G, dt) {
  const a = G.activities;
  const r = a.race;
  if (!r.active) return;
  r.timer += dt;
  const p = G.player.pos;
  const cp = r.cps[r.cp];
  if (Math.hypot(p.x - cp.x, p.z - cp.z) < 16) {
    r.cp += 1;
    if (r.cp >= r.cps.length) {
      r.cp = 0;
      r.lap += 1;
      if (r.lap > r.laps) {
        // Finished.
        const t = r.timer;
        const best = a.races[r.id].best;
        const isBest = best == null || t < best;
        if (isBest) a.races[r.id].best = t;
        const prize = economy(G).raceReward + (isBest ? 200 : 0);
        G.money = (typeof G.money === 'number' ? G.money : 0) + prize;
        a.earnings.races += prize;
        a.racesWon = (a.racesWon ?? 0) + 1;
        if (G.hud && typeof G.hud.showMessage === 'function') {
          G.hud.showMessage(
            `Race finished in ${formatRaceTime(t)}${isBest ? ' — new best!' : ''} +$${prize}`,
          );
        }
        if (G.audio && typeof G.audio.play === 'function') G.audio.play('mission-complete');
        a.race = { active: false, id: null, cps: [], cp: 0, lap: 1, laps: 3, timer: 0 };
        return;
      }
    }
  }
}

// --- hidden packages -----------------------------------------------------

function updatePackages(G) {
  const a = G.activities;
  const p = G.player.pos;
  const reward = economy(G).packageReward;
  for (let i = 0; i < a.packages.spots.length; i++) {
    const spot = a.packages.spots[i];
    if (spot.found) continue;
    if (Math.hypot(p.x - spot.x, p.z - spot.z) < PACKAGE_RADIUS) {
      spot.found = true;
      a.packages.found += 1;
      if (a.packagesFound instanceof Set) a.packagesFound.add(i);
      G.money = (typeof G.money === 'number' ? G.money : 0) + reward;
      a.earnings.packages += reward;
      const bonus = PACKAGE_BONUS_AT[a.packages.found];
      if (bonus) {
        G.money = (typeof G.money === 'number' ? G.money : 0) + bonus;
        a.earnings.packages += bonus;
      }
      if (G.hud && typeof G.hud.showMessage === 'function') {
        G.hud.showMessage(
          `Hidden package found! (${a.packages.found}/${PACKAGE_COUNT}) +$${reward}${bonus ? ` + $${bonus} bonus` : ''}`,
        );
      }
      if (G.audio && typeof G.audio.play === 'function') G.audio.play('pickup');
    }
  }
}

function randomRoadPos(G) {
  if (G.world && typeof G.world.randomRoadPos === 'function') {
    return G.world.randomRoadPos(G.rng);
  }
  return { x: (Math.random() - 0.5) * 400, z: (Math.random() - 0.5) * 400 };
}

// --- lifecycle -----------------------------------------------------------

export function init(G) {
  const spots = packageSpots(G.seed ?? 7, PACKAGE_COUNT);
  // Snap spots to the nearest road when the world can tell us where it is.
  if (G.world && typeof G.world.nearestRoadPoint === 'function') {
    for (const s of spots) {
      const near = G.world.nearestRoadPoint(s.x, s.z);
      if (near) {
        s.x = near.x;
        s.z = near.z;
      }
    }
  }

  // Replace the (frozen) module namespace on G with the live activities
  // object. Shape matches main.js / save.js: packagesFound is a Set of
  // spot indices, taxiDone / racesWon are counters. (loadGame() fills
  // packagesFound from the save afterwards; the first update() syncs the
  // spots from it.)
  G.activities = {
    taxi: { active: false, stage: null, passenger: null, pickup: null, dropoff: null, fare: 0 },
    race: { active: false, id: null, cps: [], cp: 0, lap: 1, laps: 3, timer: 0 },
    races: {
      beachfront: { best: null },
      downtown: { best: null },
      harbor: { best: null },
    },
    packages: { spots, found: 0 },
    packagesFound: new Set(),
    taxiDone: 0,
    racesWon: 0,
    earnings: { taxi: 0, races: 0, packages: 0 },
    _synced: false,
    update,
    startTaxi: () => startTaxi(G),
    startRace: (id) => startRace(G, id),
  };
  return G.activities;
}

export function update(G, dt) {
  const a = G.activities;
  if (!a || G.state !== 'playing') return;
  // One-time sync: a loaded save fills packagesFound after init; mark
  // those spots found so they are not collected twice.
  if (!a._synced) {
    a._synced = true;
    if (a.packagesFound instanceof Set) {
      for (const i of a.packagesFound) {
        if (a.packages.spots[i]) a.packages.spots[i].found = true;
      }
      a.packages.found = [...a.packagesFound].filter((i) => a.packages.spots[i]).length;
    }
  }
  // T toggles a taxi job (edge-triggered through justPressed).
  const jp = (G.input && G.input.justPressed) || {};
  if (jp.KeyT && !a.taxi.active) startTaxi(G);
  updateTaxi(G, dt);
  updateRace(G, dt);
  updatePackages(G);
}
