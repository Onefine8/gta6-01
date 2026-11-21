// missions.js — the 8 story missions of Meridian Heat.
//
// Owns G.missions. The shape matches what main.js and save.js expect:
//   done: Set of completed mission NUMBERS (1–8, config.js MISSIONS ids)
//   current: number, 0 when no mission is active
//   active: the running mission's runtime object (or null)
// Rewards come from G.cfg.ECONOMY.MISSION_REWARDS when present. Money is
// NEVER added here: completeMission emits 'mission-complete' and main.js
// adds the reward to G.money (adding it here too would pay twice).
//
// Each mission is a small state machine (setup / update / objective).
// Briefing text comes from G.story when story.js has been initialised,
// with short fallbacks here. Waypoints are city positions: named landmarks
// from G.world.landmarks when the world provides them, otherwise the
// fallbacks in LANDMARKS (computed from the real grid: road centres at
// -288..288 step 72, city half 294, harbour to z 424). A waypoint beacon
// mesh is drawn only when the THREE global exists.
//
// Missions never import other gameplay modules: they read and write shared
// state through G (player, police, combat, hud) and call the police module
// through its G.police helpers.

export const MISSION_ORDER = [
  'first-wheels',
  'courier-run',
  'getaway',
  'rival-rumble',
  'midnight-race',
  'the-pickup',
  'harbor-heist',
  'king-of-meridian',
];

export const NUM_BY_ID = {
  'first-wheels': 1,
  'courier-run': 2,
  getaway: 3,
  'rival-rumble': 4,
  'midnight-race': 5,
  'the-pickup': 6,
  'harbor-heist': 7,
  'king-of-meridian': 8,
};

export const REWARDS = {
  'first-wheels': 800,
  'courier-run': 1200,
  getaway: 1500,
  'rival-rumble': 2000,
  'midnight-race': 2500,
  'the-pickup': 3000,
  'harbor-heist': 5000,
  'king-of-meridian': 10000,
};

// Mission id (number or slug) -> slug.
export function missionSlug(id) {
  if (typeof id === 'number') return MISSION_ORDER[id - 1] ?? null;
  return MISSION_ORDER.includes(id) ? id : null;
}

// Mission id (number or slug) -> number 1..8.
export function missionNum(id) {
  if (typeof id === 'number') return id >= 1 && id <= 8 ? id : null;
  return NUM_BY_ID[id] ?? null;
}

export function missionReward(G, id) {
  const num = missionNum(id);
  const cfg = G && G.cfg && G.cfg.ECONOMY && G.cfg.ECONOMY.MISSION_REWARDS;
  if (num && Array.isArray(cfg) && typeof cfg[num - 1] === 'number') return cfg[num - 1];
  return REWARDS[missionSlug(id)] ?? 0;
}

// Fallback landmark positions (world units) when G.world.landmarks is
// absent. Real landmarks (world.js): spawn/plaza (-42,-42), garage
// (-134,120), pier (-60,334), tower (38,-120), beach (286,40),
// harborGate (0,286), raceStart (-42,-258), warehouse (200,270).
export const LANDMARKS = {
  garage: { x: -134, z: 120, label: 'Mara\u2019s Garage' },
  downtown: { x: -42, z: -42, label: 'Downtown' },
  harbor: { x: 0, z: 286, label: 'Harbor' },
  docks: { x: -60, z: 334, label: 'The Docks' },
  beachfront: { x: 286, z: 40, label: 'Beachfront' },
  hills: { x: -42, z: -258, label: 'The Hills' },
  warehouse: { x: 200, z: 270, label: 'Warehouse' },
  tower: { x: 38, z: -120, label: 'Meridian Tower' },
};

// My landmark names -> the world's real landmark names.
const LANDMARK_MAP = {
  garage: 'garage',
  downtown: 'plaza',
  harbor: 'harborGate',
  docks: 'pier',
  beachfront: 'beach',
  hills: 'raceStart',
  warehouse: 'warehouse',
  tower: 'tower',
};

export function landmark(G, name) {
  const world = G.world ?? {};
  const real = LANDMARK_MAP[name];
  if (real && world.landmarks && world.landmarks[real]) {
    const p = world.landmarks[real];
    return { x: p.x, z: p.z, label: (LANDMARKS[name] ?? {}).label ?? name };
  }
  return LANDMARKS[name] ?? { x: 0, z: 0, label: name };
}

export function randomRoadPos(G) {
  if (G.world && typeof G.world.randomRoadPos === 'function') {
    return G.world.randomRoadPos(G.rng);
  }
  const r = () => (G.rng && typeof G.rng.next === 'function' ? G.rng.next() : Math.random());
  return { x: (r() - 0.5) * 400, z: (r() - 0.5) * 400 };
}

// --- waypoint helpers ----------------------------------------------------

export function waypointReached(pos, wp, radius) {
  if (!wp) return false;
  return Math.hypot(pos.x - wp.x, pos.z - wp.z) <= (radius ?? wp.radius ?? 14);
}

export function setWaypoint(m, x, z, label, radius) {
  m.data.waypoint = { x, z, label, radius: radius ?? 14 };
}

export function clearWaypoint(m) {
  m.data.waypoint = null;
}

// Race helper: advance the checkpoint index; returns { lap, cp, done }.
export function advanceCheckpoint(m, totalCp, totalLaps) {
  m.data.cp += 1;
  if (m.data.cp >= totalCp) {
    m.data.cp = 0;
    m.data.lap += 1;
  }
  return { lap: m.data.lap, cp: m.data.cp, done: m.data.lap > totalLaps };
}

// --- mission definitions -------------------------------------------------

function raceCheckpoints(center, rx, rz, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push({ x: center.x + Math.cos(a) * rx, z: center.z + Math.sin(a) * rz });
  }
  return pts;
}

const MISSION_DEFS = {
  'first-wheels': {
    setup(G, m) {
      m.stage = 0;
      const g = landmark(G, 'garage');
      m.data.garage = g;
      setWaypoint(m, g.x, g.z, g.label, 16);
    },
    update(G, m) {
      const p = G.player;
      if (m.stage === 0) {
        if (!p.onFoot && p.vehicle) {
          m.stage = 1;
          notify(G, 'Nice wheels. Now bring it to Mara\u2019s garage.');
        }
        return 'active';
      }
      if (waypointReached(p.pos, m.data.waypoint)) return 'complete';
      return 'active';
    },
    objective(G, m) {
      return m.stage === 0
        ? 'Steal a car (walk up to one and press E)'
        : 'Drive to Mara\u2019s Garage';
    },
  },

  'courier-run': {
    setup(G, m) {
      m.stage = 0;
      m.timer = 240;
      m.data.delivered = 0;
      m.data.total = 3;
      nextPackage(G, m);
    },
    update(G, m, dt) {
      m.timer -= dt;
      if (m.timer <= 0) return 'failed';
      if (waypointReached(G.player.pos, m.data.waypoint, 12)) {
        m.data.delivered += 1;
        notify(G, `Package ${m.data.delivered} of 3 delivered.`);
        if (m.data.delivered >= m.data.total) return 'complete';
        nextPackage(G, m);
      }
      return 'active';
    },
    objective(G, m) {
      return `Deliver package ${m.data.delivered + 1} of 3 — ${Math.ceil(m.timer)}s left`;
    },
  },

  getaway: {
    setup(G, m) {
      m.stage = 0;
      m.timer = 60;
      if (G.police && typeof G.police.setWanted === 'function') G.police.setWanted(2);
      notify(G, 'Two stars. Stay out of sight for 60 seconds.');
    },
    update(G, m, dt) {
      m.timer -= dt;
      const wanted = G.police ? G.police.wanted : 0;
      if (wanted === 0) return 'complete';
      if (m.timer <= 0) return 'complete';
      return 'active';
    },
    objective(G, m) {
      return `Lose the cops — ${Math.ceil(m.timer)}s left (wanted ${G.police ? G.police.wanted : 0}★)`;
    },
  },

  'rival-rumble': {
    setup(G, m) {
      m.stage = 0;
      const d = landmark(G, 'docks');
      setWaypoint(m, d.x, d.z, d.label, 20);
      m.data.total = 6;
      m.data.spawned = false;
      notify(G, 'Head to the docks. Kroll\u2019s crew is waiting.');
    },
    update(G, m) {
      const p = G.player.pos;
      if (!m.data.spawned) {
        if (waypointReached(p, m.data.waypoint, 26)) {
          m.data.spawned = true;
          clearWaypoint(m);
          const d = landmark(G, 'docks');
          for (let i = 0; i < m.data.total; i++) {
            const a = (i / m.data.total) * Math.PI * 2;
            G.combat.spawnEnemy(d.x + Math.cos(a) * 14, d.z + Math.sin(a) * 14, { kind: 'kroll' });
          }
          notify(G, 'Six Kroll gunmen. Take them all down!');
        }
        return 'active';
      }
      const left = G.combat.enemies.filter((e) => e.alive).length;
      m.data.left = left;
      if (left === 0) return 'complete';
      return 'active';
    },
    objective(G, m) {
      if (!m.data.spawned) return 'Go to the docks';
      return `Take down the Kroll crew — ${m.data.left ?? 6} left`;
    },
  },

  'midnight-race': {
    setup(G, m) {
      m.stage = 0;
      const c = landmark(G, 'beachfront');
      m.data.cps = raceCheckpoints(c, 90, 70, 6);
      m.data.cp = 0;
      m.data.lap = 1;
      m.data.laps = 3;
      m.data.rivalCp = 0; // rival advances one checkpoint per 22 s
      m.data.rivalTimer = 0;
      placeAtCheckpoint(G, m, 0);
    },
    update(G, m, dt) {
      const p = G.player.pos;
      const cp = m.data.cps[m.data.cp];
      if (waypointReached(p, cp, 16)) {
        const r = advanceCheckpoint(m, m.data.cps.length, m.data.laps);
        if (r.done) return 'complete';
        placeAtCheckpoint(G, m, m.data.cp);
        notify(G, r.cp === 0 ? `Lap ${Math.min(r.lap, m.data.laps)} of ${m.data.laps}` : `Checkpoint ${m.data.cp + 1}`);
      }
      // Rival pace: 18 checkpoints in ~396 s. Beat him.
      m.data.rivalTimer += dt;
      if (m.data.rivalTimer >= 22) {
        m.data.rivalTimer = 0;
        m.data.rivalCp += 1;
        if (m.data.rivalCp >= m.data.cps.length * m.data.laps) return 'failed';
      }
      return 'active';
    },
    objective(G, m) {
      return `Race — lap ${m.data.lap}/${m.data.laps}, checkpoint ${m.data.cp + 1}/6 (rival: ${m.data.rivalCp}/18)`;
    },
  },

  'the-pickup': {
    setup(G, m) {
      m.stage = 0;
      const d = landmark(G, 'downtown');
      setWaypoint(m, d.x, d.z, 'Pick up Mara', 14);
      notify(G, 'Pick Mara up downtown, then drive her to the Harbor.');
    },
    update(G, m) {
      const p = G.player.pos;
      if (m.stage === 0) {
        if (waypointReached(p, m.data.waypoint, 14)) {
          m.stage = 1;
          const h = landmark(G, 'harbor');
          setWaypoint(m, h.x, h.z, h.label, 16);
          notify(G, 'Mara\u2019s in. Go — Harbor, fast!');
        }
        return 'active';
      }
      if (m.stage === 1) {
        // Ambush halfway: Kroll gunmen + 3 stars once Rook is rolling.
        if (!m.data.ambushed && G.player.vehicle) {
          m.data.ambushed = true;
          for (let i = 0; i < 3; i++) {
            G.combat.spawnEnemy(p.x + (i - 1) * 12, p.z + 18, { kind: 'kroll' });
          }
          if (G.police && typeof G.police.setWanted === 'function') G.police.setWanted(3);
          notify(G, 'Ambush! Kroll\u2019s boys — keep driving!');
        }
        if (waypointReached(p, m.data.waypoint, 16)) {
          m.stage = 2;
          return 'complete';
        }
      }
      return 'active';
    },
    objective(G, m) {
      return m.stage === 0 ? 'Pick up Mara downtown' : 'Drive Mara to the Harbor — don\u2019t stop!';
    },
  },

  'harbor-heist': {
    setup(G, m) {
      m.stage = 0;
      const h = landmark(G, 'harbor');
      m.data.truck = null;
      // The delivery truck, parked at the depot.
      const spawn = (G.vehicles && typeof G.vehicles.spawn === 'function')
        ? G.vehicles.spawn
        : (typeof G.vehiclesSpawn === 'function' ? G.vehiclesSpawn : null);
      if (typeof spawn === 'function') {
        m.data.truck = spawn({ x: h.x + 10, z: h.z + 6, heading: 0, model: 'truck', driver: null, owned: false });
      }
      setWaypoint(m, h.x, h.z, 'Steal the delivery truck', 16);
      notify(G, 'The truck is at the Harbor depot. Take it.');
    },
    update(G, m) {
      const p = G.player;
      if (m.stage === 0) {
        const inTruck = !p.onFoot && p.vehicle && p.vehicle.model === 'truck';
        if (inTruck || waypointReached(p.pos, m.data.waypoint, 10)) {
          if (inTruck) {
            m.stage = 1;
            if (G.police && typeof G.police.setWanted === 'function') G.police.setWanted(4);
            const w = landmark(G, 'warehouse');
            setWaypoint(m, w.x, w.z, w.label, 18);
            notify(G, 'Truck secured! Four stars — get it to the warehouse!');
          } else {
            notify(G, 'Get in the truck (E).');
          }
        }
        return 'active';
      }
      if (waypointReached(p.pos, m.data.waypoint, 18)) return 'complete';
      return 'active';
    },
    objective(G, m) {
      return m.stage === 0 ? 'Steal the delivery truck at the Harbor' : 'Deliver the truck to the warehouse — 4★ wanted!';
    },
  },

  'king-of-meridian': {
    setup(G, m) {
      m.stage = 0; // 0 race, 1 chase, 2 tower
      const c = landmark(G, 'downtown');
      m.data.cps = raceCheckpoints(c, 110, 80, 4);
      m.data.cp = 0;
      m.data.lap = 1;
      m.data.laps = 2;
      m.data.chaseTimer = 45;
      m.data.total = 8;
      placeAtCheckpoint(G, m, 0);
      notify(G, 'Final job: beat Kroll\u2019s crew in the race first.');
    },
    update(G, m, dt) {
      const p = G.player.pos;
      if (m.stage === 0) {
        const cp = m.data.cps[m.data.cp];
        if (waypointReached(p, cp, 16)) {
          const r = advanceCheckpoint(m, m.data.cps.length, m.data.laps);
          if (r.done) {
            m.stage = 1;
            if (G.police && typeof G.police.setWanted === 'function') G.police.setWanted(4);
            notify(G, 'Race won! Now lose the cops — 45 seconds!');
          } else {
            placeAtCheckpoint(G, m, m.data.cp);
          }
        }
        return 'active';
      }
      if (m.stage === 1) {
        m.data.chaseTimer -= dt;
        const wanted = G.police ? G.police.wanted : 0;
        if (wanted === 0 || m.data.chaseTimer <= 0) {
          m.stage = 2;
          const t = landmark(G, 'tower');
          setWaypoint(m, t.x, t.z, t.label, 18);
          for (let i = 0; i < m.data.total; i++) {
            const a = (i / m.data.total) * Math.PI * 2;
            G.combat.spawnEnemy(t.x + Math.cos(a) * 16, t.z + Math.sin(a) * 16, { kind: 'kroll' });
          }
          notify(G, 'Cops lost. Now the tower — clear it, top to bottom!');
        }
        return 'active';
      }
      // Stage 2: clear the tower.
      const left = G.combat.enemies.filter((e) => e.alive).length;
      m.data.left = left;
      if (left === 0 && waypointReached(p, m.data.waypoint, 18)) return 'complete';
      if (left === 0) notify(G, 'Tower clear. Get to the marker!');
      return 'active';
    },
    objective(G, m) {
      if (m.stage === 0) return `Final race — lap ${m.data.lap}/${m.data.laps}, checkpoint ${m.data.cp + 1}/4`;
      if (m.stage === 1) return `Lose the cops — ${Math.ceil(m.data.chaseTimer)}s left (4★)`;
      return `Clear Meridian Tower — ${m.data.left ?? 8} gunmen left`;
    },
  },
};

function nextPackage(G, m) {
  const p = randomRoadPos(G);
  setWaypoint(m, p.x, p.z, `Package ${m.data.delivered + 1}`, 12);
}

function placeAtCheckpoint(G, m, index) {
  const cp = m.data.cps[index];
  setWaypoint(m, cp.x, cp.z, `Checkpoint ${index + 1}`, 16);
}

function notify(G, text) {
  if (G.hud && typeof G.hud.showMessage === 'function') G.hud.showMessage(text);
}

// --- public API ----------------------------------------------------------

export function missionTitle(G, id) {
  const slug = missionSlug(id);
  if (G.story && G.story.briefings && slug && G.story.briefings[slug]) {
    return G.story.briefings[slug].title;
  }
  if (G.cfg && Array.isArray(G.cfg.MISSIONS)) {
    const num = missionNum(id);
    const entry = G.cfg.MISSIONS[num - 1];
    if (entry) return entry.name;
  }
  return slug ?? String(id);
}

export function availableMissions(G) {
  const done = G.missions.done instanceof Set ? G.missions.done : new Set();
  return MISSION_ORDER
    .map((slug, i) => i + 1)
    .filter((num) => num <= done.size + 1 && !done.has(num));
}

export function startMission(G, id) {
  const num = missionNum(id);
  const slug = missionSlug(id);
  if (!num || !slug) return null;
  const def = MISSION_DEFS[slug];
  if (!def) return null;
  const ms = G.missions;
  if (ms.done instanceof Set && ms.done.has(num)) return null; // already done
  if (ms.done instanceof Set && num > ms.done.size + 1) return null; // locked
  if (ms.active) return null; // one job at a time
  const m = {
    num,
    id: slug,
    def,
    stage: 0,
    timer: null,
    data: {},
    startedAt: G.time ? G.time.t : 0,
  };
  ms.active = m;
  ms.current = num;
  def.setup(G, m);
  if (G.audio && typeof G.audio.play === 'function') G.audio.play('mission-start');
  if (G.events && typeof G.events.emit === 'function') {
    G.events.emit('mission-start', { id: num });
  }
  return m;
}

export function completeMission(G) {
  const ms = G.missions;
  const m = ms.active;
  if (!m) return 0;
  const reward = missionReward(G, m.num);
  if (ms.done instanceof Set) ms.done.add(m.num);
  else ms.done = new Set([m.num]);
  ms.totalEarned = (ms.totalEarned ?? 0) + reward;
  if (G.police && typeof G.police.clearWanted === 'function') G.police.clearWanted();
  if (G.events && typeof G.events.emit === 'function') {
    // main.js adds the reward to G.money on this event — never add it here.
    G.events.emit('mission-complete', { id: m.num, reward });
  }
  if (G.audio && typeof G.audio.play === 'function') G.audio.play('mission-complete');
  if (G.hud && typeof G.hud.showMessage === 'function') {
    G.hud.showMessage(`Mission complete! +$${reward.toLocaleString('en-US')}`);
  }
  if (m.num === 8) {
    if (G.events && typeof G.events.emit === 'function') G.events.emit('game-complete', {});
  }
  ms.active = null;
  ms.current = 0;
  clearMarker(G);
  return reward;
}

export function failMission(G, reason) {
  const ms = G.missions;
  const m = ms.active;
  if (!m) return;
  ms.active = null;
  ms.current = 0;
  clearMarker(G);
  if (G.events && typeof G.events.emit === 'function') {
    G.events.emit('mission-failed', { id: m.num, reason });
  }
  if (G.hud && typeof G.hud.showMessage === 'function') {
    G.hud.showMessage(`Mission failed (${reason}) — try again from the menu.`);
  }
}

export function currentObjective(G) {
  const ms = G.missions;
  if (!ms) return 'Explore Port Meridian';
  const m = ms.active;
  if (!m) {
    const next = availableMissions(G)[0];
    if (next) return `Next job: ${missionTitle(G, next)} — open the menu (Esc) to start`;
    if (ms.done instanceof Set && ms.done.size >= MISSION_ORDER.length) {
      return 'King of Meridian. The city is yours.';
    }
    return 'Explore Port Meridian';
  }
  return m.def.objective(G, m);
}

// Set the active mission's waypoint (shots.js staging uses this).
export function setActiveWaypoint(G, x, z, label) {
  const m = G.missions && G.missions.active;
  if (!m) return false;
  setWaypoint(m, x, z, label ?? 'Waypoint', 16);
  return true;
}

// --- marker mesh (THREE only when the global exists) ---------------------

function clearMarker(G) {
  const mk = G.missions.markerMesh;
  if (mk && G.scene) G.scene.remove(mk);
  G.missions.markerMesh = null;
}

function syncMarker(G) {
  if (typeof THREE === 'undefined' || !G.scene) return;
  const m = G.missions.active;
  const wp = m ? m.data.waypoint : null;
  if (!wp) {
    clearMarker(G);
    return;
  }
  if (!G.missions.markerMesh) {
    const geo = new THREE.CylinderGeometry(0.6, 0.6, 30, 10, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd34d, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    G.scene.add(mesh);
    G.missions.markerMesh = mesh;
  }
  const mesh = G.missions.markerMesh;
  mesh.position.set(wp.x, 15, wp.z);
  mesh.rotation.y += 0.02;
}

// --- lifecycle -----------------------------------------------------------

export function init(G) {
  // Replace the (frozen) module namespace on G with the live missions
  // object. Shape matches main.js / save.js: done is a Set of mission
  // numbers, current is a number (0 = none), active is the runtime object.
  // (loadGame() overwrites done/current afterwards when a save exists.)
  G.missions = {
    done: new Set(),
    current: 0,
    active: null,
    totalEarned: 0,
    markerMesh: null,
    update,
    start: (id) => startMission(G, id),
    setWaypoint: (x, z, label) => setActiveWaypoint(G, x, z, label),
  };
  return G.missions;
}

export function update(G, dt) {
  const ms = G.missions;
  if (!ms) return;
  // Resume a mission the save says is in progress (loadGame set current
  // but active is null until a mission object exists).
  if (ms.current && !ms.active && G.state === 'playing') {
    const num = ms.current;
    ms.current = 0; // startMission refuses while current is set; clear first
    if (!(ms.done instanceof Set && ms.done.has(num))) {
      startMission(G, num);
    } else {
      ms.current = 0;
    }
  }
  const m = ms.active;
  if (!m) {
    syncMarker(G);
    return;
  }
  // Busted or wasted mid-mission: the job is blown. (In the real game
  // main.js ends the run on those events and this update stops being
  // called; the check still matters for standalone/test runs.)
  if (G.state === 'busted') {
    failMission(G, 'busted');
    return;
  }
  if (G.state === 'wasted') {
    failMission(G, 'wasted');
    return;
  }
  if (G.state !== 'playing') return;
  const result = m.def.update(G, m, dt);
  if (result === 'complete') completeMission(G);
  else if (result === 'failed') failMission(G, 'failed');
  syncMarker(G);
}
