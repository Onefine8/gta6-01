// missions.js — the 8 story missions of Meridian Heat. Each mission is a
// small state machine (stage 0..n) driven by the world: waypoints, timers,
// deliveries, kills, races. Owns G.missions. Progress (completed ids, money)
// is persisted through G.save when available.

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

function three() {
  return typeof globalThis !== 'undefined' ? globalThis.THREE : undefined;
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

// ---------------------------------------------------------------- pure data (tested)

/** District anchors on the city map (x, z). Pure data. Aligned with the
 * world module's landmarks and spawn points so every waypoint is reachable
 * by road (garage doors sit just off a road; waypoints use the road side). */
export const PLACES = {
  marasGarage: { x: -18, z: 108, name: "Mara's Garage" },
  garageRoad: { x: 0, z: 108, name: "Mara's Garage" },
  harborDepot: { x: 300, z: -60, name: 'Harbor Depot' },
  pier9: { x: 340, z: 30, name: 'Pier 9' },
  downtown: { x: 0, z: 0, name: 'Downtown' },
  meridianTower: { x: 0, z: -136, name: 'Meridian Tower' },
  hillsWarehouse: { x: -216, z: -192, name: 'Hills Warehouse' },
  beachfront: { x: 60, z: 300, name: 'Beachfront' },
  harborLoop: { x: 144, z: 72, name: 'Harbor Loop' },
};

export const MISSION_DEFS = [
  { id: 1, name: 'First Wheels', reward: 500, brief: 'Steal a car and bring it to Mara\'s garage.' },
  { id: 2, name: 'Courier Run', reward: 800, timeLimit: 240, brief: 'Deliver 3 packages before the clock runs out.' },
  { id: 3, name: 'Getaway', reward: 1200, timeLimit: 60, brief: 'Lose a 2-star wanted level for 60 seconds.' },
  { id: 4, name: 'Rival Rumble', reward: 1500, brief: 'Clear the Kroll gunmen off Pier 9.' },
  { id: 5, name: 'Midnight Race', reward: 2000, timeLimit: 180, brief: 'Win the 3-lap street race at the Harbor loop.' },
  { id: 6, name: 'The Pickup', reward: 2500, brief: 'Pick up Mara, then run the ambush to the port.' },
  { id: 7, name: 'Harbor Heist', reward: 4000, brief: 'Steal the courier truck and deliver it to the Hills warehouse.' },
  { id: 8, name: 'King of Meridian', reward: 10000, brief: 'Beat Dante, lose the cops, finish it on the tower roof.' },
];

/** Mission definition by id, or null. Pure. */
export function defFor(id) {
  return MISSION_DEFS.find((d) => d.id === id) ?? null;
}

/** Cash reward for a mission id. Pure. */
export function rewardFor(id) {
  return defFor(id)?.reward ?? 0;
}

/** Fresh runtime state for a mission id. Pure. */
export function createMission(id) {
  const def = defFor(id);
  if (!def) return null;
  return {
    id,
    name: def.name,
    status: 'active', // 'active' | 'passed' | 'failed'
    stage: 0,
    timer: def.timeLimit ?? 0,
    timerMax: def.timeLimit ?? 0,
    waypoint: null,
    objectives: [],
    data: {},
    failReason: null,
    startedAt: 0,
  };
}

/** Is `pos` within `radius` of `target` (XZ plane)? Pure. */
export function atWaypoint(pos, target, radius) {
  if (!pos || !target) return false;
  return dist2D(pos, target) <= radius;
}

/**
 * Advance a checkpoint race: returns the new {lap, checkpoint} after the
 * player reaches `reachedIndex` (or unchanged when it is not the next one).
 * Pure.
 */
export function advanceCheckpoint(race, reachedIndex) {
  const total = race.checkpoints.length;
  if (reachedIndex !== race.checkpoint) return race;
  let { lap, checkpoint } = race;
  checkpoint += 1;
  if (checkpoint >= total) {
    checkpoint = 0;
    lap += 1;
  }
  return { ...race, lap, checkpoint };
}

/** Has the race reached its final lap/checkpoint? Pure. */
export function raceFinished(race, laps) {
  return race.lap >= laps;
}

// ---------------------------------------------------------------- waypoint marker

function buildMarker(G) {
  const T = three();
  if (!T) return null;
  const geo = new T.CylinderGeometry(2.2, 2.2, 30, 12, 1, true);
  const mat = new T.MeshBasicMaterial({
    color: 0xffd23f, transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.position.y = 15;
  mesh.visible = false;
  G.scene?.add?.(mesh);
  return mesh;
}

// ---------------------------------------------------------------- module

export function init(G) {
  const rng = rngFn(G);
  G.missions = {
    defs: MISSION_DEFS,
    current: null,
    currentIndex: 0,
    completed: [],
    unlocked: 1,
    attempts: {},
    _rng: rng,
    _marker: null,
    _raceRival: null,
    _maraTimer: 0,

    /** Fresh-game reset (menu "New Game"). */
    reset() {
      G.missions._cleanup();
      G.missions.current = null;
      G.missions.currentIndex = 0;
      G.missions.completed = [];
      G.missions.unlocked = 1;
      G.missions.attempts = {};
    },

    /** Alias used by the screenshot stager: index 0 -> mission 1. */
    start(index) {
      return G.missions.startMission((index ?? 0) + 1);
    },

    /** The next mission the player can start (lowest incomplete id). */
    nextAvailable() {
      for (const d of MISSION_DEFS) {
        if (!G.missions.completed.includes(d.id)) return d.id;
      }
      return null;
    },

    /** Can mission `id` be started right now? */
    canStart(id) {
      if (G.missions.current) return false;
      if (G.missions.completed.includes(id)) return false;
      return id <= G.missions.unlocked;
    },

    /** Start mission `id`. Returns the mission or null. */
    startMission(id) {
      if (!G.missions.canStart(id)) return null;
      const m = createMission(id);
      if (!m) return null;
      m.startedAt = G.time ? G.time.t : 0;
      G.missions.current = m;
      G.missions.currentIndex = id - 1;
      G.missions.attempts[id] = (G.missions.attempts[id] ?? 0) + 1;
      G.missions._setup(id, m);
      try {
        G.story?.playLines?.(id, 'start');
      } catch (e) { /* best-effort */ }
      try {
        G.hud?.banner?.(`${m.name} — ${defFor(id).brief}`, 5);
      } catch (e) { /* best-effort */ }
      emit(G, 'mission-started', { id, name: m.name });
      sfx(G, 'mission-start');
      return m;
    },

    /** Mark the current mission passed: reward, unlock, persist. */
    passMission() {
      const m = G.missions.current;
      if (!m) return;
      m.status = 'passed';
      const reward = rewardFor(m.id);
      if (G.player) G.player.money += reward;
      if (!G.missions.completed.includes(m.id)) G.missions.completed.push(m.id);
      G.missions.unlocked = Math.max(G.missions.unlocked, m.id + 1);
      try {
        G.story?.playLines?.(m.id, 'done');
      } catch (e) { /* best-effort */ }
      try {
        G.hud?.banner?.(`Mission passed! +$${reward}`, 5);
      } catch (e) { /* best-effort */ }
      emit(G, 'mission-complete', { id: m.id, reward });
      // The jingle plays in main.js on 'mission-complete'; do not play it
      // here too, or it sounds twice.
      G.missions._cleanup();
      G.missions.current = null;
      G.missions.currentIndex = m.id; // next mission index for the save
      if (m.id === 8) {
        emit(G, 'game-complete', { money: G.player?.money ?? 0 });
        try {
          G.hud?.showEnd?.(true);
        } catch (e) { /* best-effort */ }
      }
      persist(G);
    },

    /** Mark the current mission failed with a reason. Retry stays open. */
    failMission(reason) {
      const m = G.missions.current;
      if (!m) return;
      m.status = 'failed';
      m.failReason = reason;
      try {
        G.hud?.banner?.(`Mission failed: ${reason}`, 5);
      } catch (e) { /* best-effort */ }
      emit(G, 'mission-failed', { id: m.id, reason });
      // The jingle plays in main.js on 'mission-failed'; do not play it
      // here too, or it sounds twice.
      G.missions._cleanup();
      G.missions.current = null;
      persist(G);
    },

    /** Called when the player is wasted or busted mid-mission. */
    onPlayerDown(kind) {
      if (!G.missions.current) return;
      G.missions.failMission(kind === 'busted' ? 'Busted by the police' : 'Wasted');
    },

    /** Per-mission setup: waypoints, spawns, wanted levels. */
    _setup(id, m) {
      const P = PLACES;
      if (id === 1) {
        // A sedan waiting on the road by the Harbor for Rook to lift.
        const car = G.vehicles.spawn({
          x: 288, z: 144,
          heading: Math.PI, kind: 'sedan', driver: 'none',
        });
        m.data.carId = car.id;
        m.waypoint = { x: car.pos.x, z: car.pos.z };
        m.objectives = ['Steal a car', "Drive it to Mara's garage"];
      } else if (id === 2) {
        m.data.drops = [
          { x: 144, z: -144 },
          { x: -144, z: 144 },
          { x: -72, z: -216 },
        ];
        m.data.dropIndex = 0;
        m.waypoint = { ...m.data.drops[0] };
        m.objectives = ['Deliver the packages (0/3)', 'Beat the clock'];
      } else if (id === 3) {
        G.police?.addWanted?.(30, 'mission');
        m.timer = 60;
        m.timerMax = 60;
        m.waypoint = null;
        m.objectives = ['Survive the police for 60 seconds', 'Do not get busted'];
      } else if (id === 4) {
        m.waypoint = { ...P.pier9 };
        m.objectives = ['Reach Pier 9', 'Clear the Kroll gunmen'];
        m.data.spawned = false;
      } else if (id === 5) {
        const loop = [
          { x: 144, z: 72 }, { x: 144, z: -72 }, { x: 72, z: -72 }, { x: 72, z: 72 },
        ];
        m.data.race = { checkpoints: loop, lap: 0, checkpoint: 0, laps: 3 };
        m.waypoint = { ...loop[0] };
        m.objectives = ['Win the midnight race (3 laps)', 'Hit every checkpoint'];
        // Dante's driver: a rival car on the same loop, a touch slower.
        const rival = G.vehicles.spawn({
          x: 144, z: 90, heading: Math.PI, kind: 'coupe',
          driver: 'rival', maxSpeed: 34, accel: 14,
        });
        m.data.rivalId = rival.id;
        G.missions._raceRival = { vehicle: rival, checkpoint: 0, lap: 0, speed: 26 };
      } else if (id === 6) {
        m.waypoint = { ...P.garageRoad };
        m.objectives = ['Pick up Mara at the garage'];
        m.data.pickedUp = false;
        m.data.ambushed = false;
      } else if (id === 7) {
        const truck = G.vehicles.spawn({
          x: 288, z: -72,
          heading: Math.PI / 2, kind: 'truck', driver: 'none',
        });
        m.data.truckId = truck.id;
        m.waypoint = { x: truck.pos.x, z: truck.pos.z };
        m.objectives = ['Steal the courier truck', 'Deliver it to the Hills warehouse'];
      } else if (id === 8) {
        const loop = [
          { x: 72, z: 0 }, { x: 0, z: 72 }, { x: -72, z: 0 }, { x: 0, z: -72 },
        ];
        m.data.race = { checkpoints: loop, lap: 0, checkpoint: 0, laps: 1 };
        m.waypoint = { ...loop[0] };
        m.objectives = ['Beat Dante in the race', 'Then lose the cops'];
        const dante = G.vehicles.spawn({
          x: 72, z: 18, heading: Math.PI, kind: 'coupe',
          driver: 'rival', maxSpeed: 36, accel: 15,
        });
        m.data.rivalId = dante.id;
        G.missions._raceRival = { vehicle: dante, checkpoint: 0, lap: 0, speed: 28 };
      }
      G.missions._syncMarker();
    },

    /** Tear down mission spawns (rival cars become parked cars). */
    _cleanup() {
      if (G.missions._raceRival?.vehicle) {
        const rv = G.missions._raceRival.vehicle;
        rv.driver = 'none';
        rv.ai = null;
        rv.speed = 0;
        G.missions._raceRival = null;
      }
      if (G.missions._marker) G.missions._marker.visible = false;
      if (G.missions.current) G.missions.current.waypoint = null;
    },

    /** Move the 3D waypoint beam to the mission waypoint. */
    _syncMarker() {
      const m = G.missions.current;
      if (!G.missions._marker) G.missions._marker = buildMarker(G);
      const marker = G.missions._marker;
      if (!marker) return;
      if (m?.waypoint) {
        marker.visible = true;
        marker.position.x = m.waypoint.x;
        marker.position.z = m.waypoint.z;
      } else {
        marker.visible = false;
      }
    },
  };

  return G.missions;
}

// ---------------------------------------------------------------- update

function playerPos(G) {
  const p = G.player;
  if (!p) return null;
  return p.inVehicle && p.vehicle ? p.vehicle.pos : p.pos;
}

function raceStep(G, m, dt) {
  const race = m.data.race;
  const pos = playerPos(G);
  if (!race || !pos) return;
  const cp = race.checkpoints[race.checkpoint];
  if (cp && atWaypoint(pos, cp, 10)) {
    const next = advanceCheckpoint(race, race.checkpoint);
    m.data.race = next;
    const total = race.checkpoints.length;
    m.waypoint = { ...race.checkpoints[next.checkpoint] };
    emit(G, 'checkpoint', { lap: next.lap + 1, checkpoint: next.checkpoint + 1, total });
    sfx(G, 'checkpoint');
    G.missions._syncMarker();
  }
  // Rival car follows the same checkpoints.
  const rival = G.missions._raceRival;
  if (rival?.vehicle) {
    const rv = rival.vehicle;
    const rcp = race.checkpoints[rival.checkpoint];
    if (rcp) {
      const dx = rcp.x - rv.pos.x;
      const dz = rcp.z - rv.pos.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let dh = want - rv.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      rv.ai = {
        throttle: d > 4 ? 0.85 : 0.4,
        steer: clamp(dh * 2.4, -1, 1),
      };
      rv.speed = Math.min(rv.speed, rival.speed);
      if (d < 10) {
        rival.checkpoint += 1;
        if (rival.checkpoint >= race.checkpoints.length) {
          rival.checkpoint = 0;
          rival.lap += 1;
        }
      }
    }
  }
}

export function update(G, dt) {
  const ms = G.missions;
  if (!ms || G.state !== 'playing') return;
  dt = Math.min(dt, 0.05);
  // A loaded save may have completed missions the unlock counter never saw.
  if (ms.completed) ms.unlocked = Math.max(ms.unlocked, ms.completed.length + 1);
  const m = ms.current;
  if (!m) return;
  const pos = playerPos(G);
  const P = PLACES;

  // Timed missions tick down. Expiry fails the mission only for the
  // deadline missions (2, 5); for mission 3 (survive) and mission 8
  // stage 1 (escape) expiry is the PASS condition, handled in their case.
  if (m.timerMax > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = 0;
      if (m.id === 2 || m.id === 5) {
        ms.failMission('Time ran out');
        return;
      }
    }
  }

  switch (m.id) {
    case 1: {
      if (m.stage === 0) {
        if (G.player?.inVehicle) {
          m.stage = 1;
          m.waypoint = { ...P.garageRoad };
          m.objectives = ["Drive it to Mara's garage"];
          ms._syncMarker();
        }
      } else if (pos && atWaypoint(pos, P.garageRoad, 10) && G.player?.inVehicle) {
        ms.passMission();
      }
      break;
    }
    case 2: {
      if (pos && m.data.drops) {
        const drop = m.data.drops[m.data.dropIndex];
        if (drop && atWaypoint(pos, drop, 9)) {
          m.data.dropIndex += 1;
          sfx(G, 'delivery');
          emit(G, 'package-delivered', { count: m.data.dropIndex });
          if (m.data.dropIndex >= m.data.drops.length) {
            ms.passMission();
          } else {
            m.waypoint = { ...m.data.drops[m.data.dropIndex] };
            m.objectives = [`Deliver the packages (${m.data.dropIndex}/3)`, 'Beat the clock'];
            ms._syncMarker();
          }
        }
      }
      break;
    }
    case 3: {
      // Survive: the timer is the mission. Getting busted/wasted fails via onPlayerDown.
      if (m.timer <= 0) {
        G.police?.clearWanted?.();
        ms.passMission();
      }
      break;
    }
    case 4: {
      if (m.stage === 0) {
        if (pos && atWaypoint(pos, P.pier9, 25)) {
          m.stage = 1;
          m.objectives = ['Clear the Kroll gunmen'];
          // Spawn the crew on the pier.
          for (let i = 0; i < 6; i++) {
            G.combat?.spawnEnemy?.({
              x: P.pier9.x + (Math.sin(i * 2.4) * 8),
              z: P.pier9.z + (Math.cos(i * 2.4) * 5),
              kind: i === 0 ? 'bruiser' : 'gunman',
            });
          }
          emit(G, 'ambush', { count: 6 });
          sfx(G, 'ambush');
          m.data.spawned = true;
        }
      } else if (m.data.spawned && (G.combat?.enemies?.length ?? 0) === 0) {
        ms.passMission();
      }
      break;
    }
    case 5: {
      raceStep(G, m, dt);
      const race = m.data.race;
      if (race && raceFinished(race, 3)) {
        const rival = G.missions._raceRival;
        const rivalDone = rival && rival.lap >= 3;
        if (!rivalDone) ms.passMission();
        else ms.failMission('Dante\'s driver finished first');
      }
      break;
    }
    case 6: {
      if (m.stage === 0) {
        if (pos && atWaypoint(pos, P.garageRoad, 10)) {
          G.missions._maraTimer += dt;
          if (G.missions._maraTimer > 1.5) {
            m.stage = 1;
            m.data.pickedUp = true;
            m.waypoint = { ...P.harborDepot };
            m.objectives = ['Take Mara to the port', 'Escape the ambush'];
            try {
              G.story?.playLines?.(6, 'pickup');
            } catch (e) { /* best-effort */ }
            ms._syncMarker();
          }
        } else {
          G.missions._maraTimer = 0;
        }
      } else if (m.stage === 1) {
        // Ambush halfway: wanted 3 + two cop cars.
        if (!m.data.ambushed && pos && dist2D(pos, P.harborDepot) < 90) {
          m.data.ambushed = true;
          G.police?.addWanted?.(55, 'mission');
          G.police?.spawnCop?.();
          G.police?.spawnCop?.();
          emit(G, 'ambush', { count: 2 });
          sfx(G, 'ambush');
        }
        if (pos && atWaypoint(pos, P.harborDepot, 10)) {
          G.police?.clearWanted?.();
          ms.passMission();
        }
      }
      break;
    }
    case 7: {
      if (m.stage === 0) {
        const truck = (G.vehicles?.list ?? []).find((v) => v.id === m.data.truckId);
        if (truck && G.player?.vehicle === truck) {
          m.stage = 1;
          m.waypoint = { ...P.hillsWarehouse };
          m.objectives = ['Deliver the truck to the Hills warehouse', '4 stars on your tail'];
          G.police?.addWanted?.(75, 'mission');
          ms._syncMarker();
        }
      } else if (pos && atWaypoint(pos, P.hillsWarehouse, 11)) {
        if (G.player?.vehicle?.kind === 'truck') {
          G.police?.clearWanted?.();
          ms.passMission();
        }
      }
      break;
    }
    case 8: {
      if (m.stage === 0) {
        raceStep(G, m, dt);
        const race = m.data.race;
        if (race && raceFinished(race, 1)) {
          const rival = G.missions._raceRival;
          if (rival && rival.lap >= 1) {
            ms.failMission('Dante won the race');
          } else {
            m.stage = 1;
            m.timer = 30;
            m.timerMax = 30;
            m.waypoint = null;
            m.objectives = ['Lose the cops — 30 seconds'];
            G.police?.addWanted?.(55, 'mission');
            try {
              G.story?.playLines?.(8, 'raceDone');
            } catch (e) { /* best-effort */ }
            ms._syncMarker();
          }
        }
      } else if (m.stage === 1) {
        if (m.timer <= 0.01) {
          G.police?.clearWanted?.();
          m.stage = 2;
          m.waypoint = { ...P.meridianTower };
          m.objectives = ['Face Dante on the tower roof'];
          // Dante + two gunmen at the tower base (outside the tower AABB).
          G.combat?.spawnEnemy?.({ x: P.meridianTower.x + 24, z: P.meridianTower.z, kind: 'boss' });
          G.combat?.spawnEnemy?.({ x: P.meridianTower.x - 24, z: P.meridianTower.z + 16, kind: 'gunman' });
          G.combat?.spawnEnemy?.({ x: P.meridianTower.x - 24, z: P.meridianTower.z - 16, kind: 'gunman' });
          ms._syncMarker();
        }
      } else if (m.stage === 2) {
        if (pos && atWaypoint(pos, P.meridianTower, 22)
          && (G.combat?.enemies?.length ?? 0) === 0) {
          ms.passMission();
        }
      }
      break;
    }
    default:
      break;
  }
}
