// peds.js — pedestrians: they stroll the sidewalks, wait at corners, and
// run when they hear gunfire or see a car coming at them. Owns G.peds.list.
// A ped is {pos, heading, speed, state, target, mesh, ...}; the mesh only
// mirrors it. Taxi fares pick their passenger from this crowd.

import * as configModule from './config.js';
import * as randomModule from './random.js';

const CFG = configModule.CONFIG ?? configModule.default ?? {};
const mulberry32 = randomModule.mulberry32 ?? randomModule.default ?? null;

// ---------------------------------------------------------------- helpers
// (Road helpers are local here on purpose: gameplay modules never import
// each other — they share data only through G.)

/** A callable RNG from G.rng (the createRng bundle) or a fresh mulberry32. */
function rngFn(G) {
  const r = G.rng;
  if (typeof r === 'function') return r;
  if (r && typeof r.next === 'function') return r.next;
  if (mulberry32) return mulberry32(G.seed ?? 7);
  return Math.random;
}

/** Closest point on segment AB to point P (all {x, z}). */
function closestOnSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  if (len2 === 0) return { x: a.x, z: a.z, t: 0 };
  let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
  t = clamp(t, 0, 1);
  return { x: a.x + abx * t, z: a.z + abz * t, t };
}

/**
 * The road network: G.world.roads when the world module provides it,
 * otherwise the same fallback 8x8 grid traffic uses (cached on G).
 */
function getRoads(G) {
  const w = G.world?.roads;
  if (Array.isArray(w) && w.length > 0 && w[0].ax !== undefined) return w;
  if (G._fallbackRoads) return G._fallbackRoads;
  const blocks = cfg(G, 'CITY_BLOCKS', 8);
  const pitch = cfg(G, 'CITY_PITCH', 72);
  const half = (blocks * pitch) / 2;
  const roads = [];
  for (let i = 0; i <= blocks; i++) {
    const c = -half + i * pitch;
    roads.push({ ax: c, az: -half, bx: c, bz: half });
    roads.push({ ax: c, az: half, bx: c, bz: -half });
    roads.push({ ax: -half, az: c, bx: half, bz: c });
    roads.push({ ax: half, az: c, bx: -half, bz: c });
  }
  G._fallbackRoads = roads;
  return roads;
}

function cfg(G, key, fallback) {
  const c = G.cfg ?? CFG;
  const v = c == null ? undefined : c[key];
  return v === undefined || v === null ? fallback : v;
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

// ---------------------------------------------------------------- pure math (tested)

/** Flee direction: away from `threat`, normalised. Pure. */
export function fleeDirection(pos, threat) {
  const dx = pos.x - threat.x;
  const dz = pos.z - threat.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}

/**
 * One pedestrian step toward `target` at `speed`. Pure: moves pos, faces the
 * direction of travel, returns true when the target is reached (within 1 m).
 */
export function stepPed(ped, target, speed, dt) {
  const dx = target.x - ped.pos.x;
  const dz = target.z - ped.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1) return true;
  const nx = dx / d;
  const nz = dz / d;
  ped.pos.x += nx * speed * dt;
  ped.pos.z += nz * speed * dt;
  ped.heading = Math.atan2(nx, nz);
  return false;
}

/** Pick a new sidewalk waypoint near `pos`: along the nearest road, offset. */
export function nextSidewalkTarget(pos, roads, rng, roadWidth) {
  let best = null;
  let bestD = Infinity;
  for (const r of roads) {
    const c = closestOnSegment(pos, { x: r.ax, z: r.az }, { x: r.bx, z: r.bz });
    const d = Math.hypot(c.x - pos.x, c.z - pos.z);
    if (d < bestD) {
      bestD = d;
      best = { seg: r, point: c };
    }
  }
  if (!best) return { x: pos.x + 10, z: pos.z };
  const r = best.seg;
  const len = Math.hypot(r.bx - r.ax, r.bz - r.az) || 1;
  const dirx = (r.bx - r.ax) / len;
  const dirz = (r.bz - r.az) / len;
  // Sidewalk: just outside the road edge, either side.
  const side = rng() < 0.5 ? 1 : -1;
  const off = roadWidth / 2 + 1.6;
  const along = (rng() - 0.5) * 60;
  return {
    x: best.point.x + dirx * along + (-dirz) * off * side,
    z: best.point.z + dirz * along + dirx * off * side,
  };
}

// ---------------------------------------------------------------- mesh

const SHIRT_COLORS = [0xc94f4f, 0x4f7ac9, 0x4fc97a, 0xc9a44f, 0x8a4fc9, 0xd8d8d8, 0x333333, 0xc97a4f];

function buildPedMesh(G, color) {
  const T = three();
  if (!T) return null;
  const group = new T.Group();
  const shirt = new T.MeshLambertMaterial({ color });
  const skin = new T.MeshLambertMaterial({ color: 0xc9976b });
  const pants = new T.MeshLambertMaterial({ color: 0x2a2a30 });
  const body = new T.Mesh(new T.BoxGeometry(0.5, 0.65, 0.28), shirt);
  body.position.y = 0.95;
  const head = new T.Mesh(new T.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.45;
  const legL = new T.Mesh(new T.BoxGeometry(0.18, 0.6, 0.2), pants);
  legL.position.set(-0.13, 0.3, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  group.add(body, head, legL, legR);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.traverse((o) => { o.castShadow = true; });
  return group;
}

// ---------------------------------------------------------------- module

export function init(G) {
  const rng = rngFn(G);
  const roads = getRoads(G);
  const roadWidth = cfg(G, 'ROAD_WIDTH', 12);

  G.peds = {
    list: [],
    _rng: rng,
    _scareTimer: 0,

    /** Spawn one pedestrian on a sidewalk near `nearPos` (or anywhere). */
    spawn(nearPos) {
      const base = nearPos ?? { x: (rng() - 0.5) * 300, z: (rng() - 0.5) * 300 };
      const pos = nextSidewalkTarget(base, roads, rng, roadWidth);
      const color = SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)];
      const ped = {
        id: G.peds.list.length + 1,
        pos: { x: pos.x, y: 0, z: pos.z },
        heading: rng() * Math.PI * 2,
        speed: 0,
        state: 'walk', // 'walk' | 'idle' | 'flee' | 'taxi'
        target: nextSidewalkTarget(pos, roads, rng, roadWidth),
        walkSpeed: 1.1 + rng() * 0.7,
        idleTimer: rng() * 4,
        fleeTimer: 0,
        _phase: rng() * 6,
        mesh: null,
        isTaxiPassenger: false,
      };
      const mesh = buildPedMesh(G, color);
      if (mesh) {
        mesh.position.set(ped.pos.x, 0, ped.pos.z);
        ped.mesh = mesh;
        G.scene?.add?.(mesh);
      }
      G.peds.list.push(ped);
      return ped;
    },

    /** Remove a pedestrian from the world. */
    remove(ped) {
      const i = G.peds.list.indexOf(ped);
      if (i >= 0) G.peds.list.splice(i, 1);
      if (ped.mesh) G.scene?.remove?.(ped.mesh);
    },

    /** Scare every ped near `pos` (gunfire, explosion, speeding car). */
    scare(pos, radius) {
      for (const ped of G.peds.list) {
        const d = Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z);
        if (d < (radius ?? 25)) {
          ped.state = 'flee';
          ped.fleeTimer = 3 + Math.random() * 2;
        }
      }
      emit(G, 'peds-scared', { x: pos.x, z: pos.z });
    },
  };

  // Listen for gunfire: the crowd runs.
  try {
    G.events?.on?.('gunshot', (data) => {
      if (data && data.x !== undefined) G.peds.scare({ x: data.x, z: data.z }, 30);
    });
  } catch (e) { /* best-effort */ }

  const count = cfg(G, 'PED_COUNT', 24);
  for (let i = 0; i < count; i++) G.peds.spawn();
  return G.peds;
}

export function update(G, dt) {
  const ps = G.peds;
  if (!ps || G.state !== 'playing') return;
  dt = Math.min(dt, 0.05);
  const roads = getRoads(G);
  const roadWidth = cfg(G, 'ROAD_WIDTH', 12);
  const player = G.player;
  const playerVeh = player?.inVehicle ? player.vehicle : null;
  const playerPos = playerVeh ? playerVeh.pos : player?.pos;

  for (const ped of [...ps.list]) {
    if (ped.state === 'taxi') continue; // activities.js drives taxi passengers

    // A fast car bearing down on a ped scares them.
    if (playerVeh && playerPos && Math.abs(playerVeh.speed) > 10) {
      const d = Math.hypot(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
      if (d < 10) {
        // Positive when the ped is ahead of the car, in its path.
        const closing = ((ped.pos.x - playerPos.x) * Math.sin(playerVeh.heading)
          + (ped.pos.z - playerPos.z) * Math.cos(playerVeh.heading)) / (d || 1);
        if (closing > 0.5) {
          ped.state = 'flee';
          ped.fleeTimer = 2.5;
        }
      }
    }

    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const threat = playerPos ?? ped.pos;
      const dir = fleeDirection(ped.pos, threat);
      const target = { x: ped.pos.x + dir.x * 20, z: ped.pos.z + dir.z * 20 };
      stepPed(ped, target, 4.2, dt);
      ped.speed = 4.2;
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        ped.target = nextSidewalkTarget(ped.pos, roads, ps._rng, roadWidth);
      }
    } else if (ped.state === 'idle') {
      ped.idleTimer -= dt;
      ped.speed = 0;
      if (ped.idleTimer <= 0) {
        ped.state = 'walk';
        ped.target = nextSidewalkTarget(ped.pos, roads, ps._rng, roadWidth);
      }
    } else {
      const arrived = stepPed(ped, ped.target, ped.walkSpeed, dt);
      ped.speed = ped.walkSpeed;
      if (arrived) {
        if (ps._rng() < 0.3) {
          ped.state = 'idle';
          ped.idleTimer = 2 + ps._rng() * 5;
        } else {
          ped.target = nextSidewalkTarget(ped.pos, roads, ps._rng, roadWidth);
        }
      }
    }

    // Keep peds inside the city.
    const half = cfg(G, 'CITY_HALF', 290);
    ped.pos.x = clamp(ped.pos.x, -half, half);
    ped.pos.z = clamp(ped.pos.z, -half, half);

    // Mesh sync + walk cycle.
    if (ped.mesh) {
      ped.mesh.position.set(ped.pos.x, 0, ped.pos.z);
      ped.mesh.rotation.y = ped.heading;
      if (ped.speed > 0.2) {
        ped._phase += dt * ped.speed * 2.4;
        const s = Math.sin(ped._phase) * 0.5;
        const u = ped.mesh.userData;
        if (u.legL) u.legL.rotation.x = s;
        if (u.legR) u.legR.rotation.x = -s;
      }
    }
  }

  // Top the crowd back up near the player.
  const want = cfg(G, 'PED_COUNT', 24);
  if (ps.list.length < want && playerPos) {
    ps.spawn(playerPos);
  }
}
