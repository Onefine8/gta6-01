// traffic.js — civilian traffic: cars that follow the road grid, keep their
// lane, slow for the car ahead, stop for the player, and respawn near the
// action when they drift too far away. Owns G.traffic.cars; each car is a
// vehicle object owned by G.vehicles, driven here through its `ai` field.
// The world builds roads as full grid lines (one per line, with a `dir`),
// so a car owns a lane: {axis, fixed, dir} — the line it is on, the
// centreline coordinate, and its direction of travel. At intersections it
// sometimes turns onto the crossing line.

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

// ---------------------------------------------------------------- pure math (tested)

/** Closest point on segment AB to point P (all {x, z}). Pure. */
export function closestOnSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  if (len2 === 0) return { x: a.x, z: a.z, t: 0 };
  let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
  t = clamp(t, 0, 1);
  return { x: a.x + abx * t, z: a.z + abz * t, t };
}

/**
 * Steer needed to head from `pos`/`heading` toward `target`.
 * Returns -1..1 (negative = left). Pure.
 */
export function steerToward(pos, heading, target) {
  const want = Math.atan2(target.x - pos.x, target.z - pos.z);
  let d = want - heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return clamp(d * 2.2, -1, 1);
}

/** Heading for driving along `axis` in direction `dir` (+1/-1). Pure. */
export function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

/**
 * Right-hand lane offset for a heading: 3 m to the right of the centreline.
 * Pure.
 */
export function laneOffset(heading, laneWidth = 3) {
  return { x: Math.cos(heading) * laneWidth, z: -Math.sin(heading) * laneWidth };
}

/**
 * The next grid-line coordinate ahead of `t` when travelling in `dir`,
 * from the sorted `lines` array; null past the edge. Pure.
 */
export function nextIntersection(t, dir, lines) {
  if (dir > 0) {
    for (const c of lines) if (c > t + 0.01) return c;
  } else {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i] < t - 0.01) return lines[i];
    }
  }
  return null;
}

// ---------------------------------------------------------------- roads

/**
 * The road network: G.world.roads when the world module provides it,
 * otherwise a fallback 8x8 grid built from config (same pitch as the spec).
 * Segments are {ax, az, bx, bz} in both directions (one entry per direction).
 */
export function getRoads(G) {
  const w = G.world?.roads;
  if (Array.isArray(w) && w.length > 0 && w[0].ax !== undefined) return w;
  if (G._fallbackRoads) return G._fallbackRoads;
  const blocks = cfg(G, 'GRID_BLOCKS', 8);
  const pitch = cfg(G, 'ROAD_PITCH', 72);
  const half = (blocks * pitch) / 2;
  const roads = [];
  for (let i = 0; i <= blocks; i++) {
    const c = -half + i * pitch;
    // Vertical road (both directions) and horizontal road (both directions).
    roads.push({ ax: c, az: -half, bx: c, bz: half });
    roads.push({ ax: c, az: half, bx: c, bz: -half });
    roads.push({ ax: -half, az: c, bx: half, bz: c });
    roads.push({ ax: half, az: c, bx: -half, bz: c });
  }
  G._fallbackRoads = roads;
  return roads;
}

/**
 * Road centrelines as lanes: [{axis: 'x'|'z', fixed}] plus the sorted grid
 * coordinates. World roads carry a `dir` ('x' = horizontal line at z=az,
 * 'z' = vertical line at x=ax); fallback segments are reduced the same way.
 */
export function roadLines(G) {
  if (G._roadLines) return G._roadLines;
  const roads = getRoads(G);
  const seen = new Map();
  for (const r of roads) {
    const axis = r.dir === 'x' || r.az === r.bz ? 'x' : 'z';
    const fixed = axis === 'x' ? r.az : r.ax;
    const key = `${axis}:${fixed}`;
    if (!seen.has(key)) seen.set(key, { axis, fixed });
  }
  const lines = [...seen.values()];
  const coords = [...new Set(lines.map((l) => l.fixed))].sort((a, b) => a - b);
  const out = { lines, coords };
  G._roadLines = out;
  return out;
}

/** A random point on a random road, with a small lane offset. */
export function randomRoadPos(G, rng) {
  const { lines } = roadLines(G);
  const line = lines[Math.floor(rng() * lines.length)];
  const half = cfg(G, 'CITY_HALF', 288);
  const t = (rng() * 2 - 1) * half;
  const dir = rng() < 0.5 ? 1 : -1;
  const heading = headingFor(line.axis, dir);
  const off = laneOffset(heading);
  const lim = half - 4; // keep the lane inside the city clamp
  if (line.axis === 'x') return { x: clamp(t, -lim, lim), z: clamp(line.fixed + off.z, -lim, lim) };
  return { x: clamp(line.fixed + off.x, -lim, lim), z: clamp(t, -lim, lim) };
}

// ---------------------------------------------------------------- module

export function init(G) {
  const rng = rngFn(G);
  G.traffic = {
    cars: [],
    _rng: rng,
    _respawnTimer: 0,

    /** Spawn one traffic car on the roads. */
    spawnOne(nearPos) {
      const { lines, coords } = roadLines(G);
      const half = cfg(G, 'CITY_HALF', 288);
      let line = lines[Math.floor(rng() * lines.length)];
      let t = (rng() * 2 - 1) * (half - 10);
      if (nearPos) {
        // Pick the line closest to the requested point.
        let best = Infinity;
        for (const l of lines) {
          const d = l.axis === 'x'
            ? Math.abs(l.fixed - nearPos.z) : Math.abs(l.fixed - nearPos.x);
          if (d < best) { best = d; line = l; }
        }
        t = line.axis === 'x' ? nearPos.x : nearPos.z;
      }
      const dir = rng() < 0.5 ? 1 : -1;
      const heading = headingFor(line.axis, dir);
      const off = laneOffset(heading);
      const lim = half - 4; // keep the lane inside the city clamp
      const x = clamp(line.axis === 'x' ? t : line.fixed + off.x, -lim, lim);
      const z = clamp(line.axis === 'x' ? line.fixed + off.z : t, -lim, lim);
      const kinds = ['sedan', 'coupe', 'sedan', 'van', 'sedan'];
      const v = G.vehicles.spawn({
        x, z, heading,
        kind: kinds[Math.floor(rng() * kinds.length)],
        driver: 'traffic',
        maxSpeed: cfg(G, 'TRAFFIC_MAX_SPEED', 14),
      });
      const car = {
        vehicle: v,
        axis: line.axis,
        fixed: line.fixed,
        dir,
        cruise: 8 + rng() * 6,
        stuck: 0,
        _coords: coords,
      };
      v.ai = { throttle: 0, steer: 0 };
      G.traffic.cars.push(car);
      return car;
    },

    /** Remove a traffic car (vehicle + record). */
    remove(car) {
      const i = G.traffic.cars.indexOf(car);
      if (i >= 0) G.traffic.cars.splice(i, 1);
      G.vehicles.remove(car.vehicle);
    },
  };

  const count = cfg(G, 'TRAFFIC_COUNT', 14);
  for (let i = 0; i < count; i++) G.traffic.spawnOne();
  return G.traffic;
}

export function update(G, dt) {
  const tr = G.traffic;
  if (!tr || G.state !== 'playing') return;
  dt = Math.min(dt, 0.05);
  const half = cfg(G, 'CITY_HALF', 288);
  const p = G.player;
  const playerVeh = p?.inVehicle ? p.vehicle : null;
  const playerPos = playerVeh ? playerVeh.pos : p?.pos;

  for (const car of [...tr.cars]) {
    const v = car.vehicle;
    if (!v) continue;

    // Where the car is along its lane, and where it wants to be 20 m ahead.
    const moving = car.axis === 'x' ? v.pos.x : v.pos.z;
    const heading = headingFor(car.axis, car.dir);
    const off = laneOffset(heading);
    const ahead = moving + car.dir * 20;
    const target = car.axis === 'x'
      ? { x: ahead, z: car.fixed + off.z }
      : { x: car.fixed + off.x, z: ahead };

    let wantSpeed = car.cruise;

    // Slow for the car directly ahead (same lane-ish).
    for (const other of tr.cars) {
      if (other === car) continue;
      const o = other.vehicle;
      if (!o) continue;
      const dx = o.pos.x - v.pos.x;
      const dz = o.pos.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 14) continue;
      const aheadDot = (dx * Math.sin(v.heading) + dz * Math.cos(v.heading)) / (d || 1);
      if (aheadDot > 0.6 && d < 12) {
        wantSpeed = Math.min(wantSpeed, Math.max(0, o.speed - 1));
      }
    }

    // Stop for the player: on foot in front, or a slow player car ahead.
    if (playerPos) {
      const dx = playerPos.x - v.pos.x;
      const dz = playerPos.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 12) {
        const aheadDot = (dx * Math.sin(v.heading) + dz * Math.cos(v.heading)) / (d || 1);
        const playerSpeed = playerVeh ? Math.abs(playerVeh.speed) : Math.abs(p?.speed ?? 0);
        if (aheadDot > 0.5) {
          if (!playerVeh) wantSpeed = 0; // a pedestrian: full stop
          else if (playerSpeed < 3) wantSpeed = 0;
          else wantSpeed = Math.min(wantSpeed, playerSpeed);
        }
      }
    }

    // Police cars pushing through: pull over (slow to a crawl).
    if (G.police?.wanted > 0 && playerPos) {
      const dp = Math.hypot(playerPos.x - v.pos.x, playerPos.z - v.pos.z);
      if (dp < 25) wantSpeed = Math.min(wantSpeed, 3);
    }

    // Intersection: crossing a grid line is a chance to turn.
    const next = nextIntersection(moving, car.dir, car._coords);
    if (next !== null) {
      const crossed = car.dir > 0 ? moving >= next : moving <= next;
      if (crossed && tr._rng() < 0.3) {
        // Turn onto the crossing line (perpendicular axis).
        const newAxis = car.axis === 'x' ? 'z' : 'x';
        const newDir = tr._rng() < 0.5 ? 1 : -1;
        car.axis = newAxis;
        car.fixed = next;
        car.dir = newDir;
      }
    }

    // World edge: turn around instead of driving off the map.
    if (Math.abs(moving) > half - 4) {
      car.dir *= -1;
    }

    // Stuck detection: barely moving while wanting to go.
    if (Math.abs(v.speed) < 0.4 && wantSpeed > 2) {
      car.stuck += dt;
      if (car.stuck > 4) {
        // Hop the car onto a fresh road near the player.
        const pos = randomRoadPos(G, tr._rng);
        v.pos.x = pos.x;
        v.pos.z = pos.z;
        v.speed = 0;
        car.stuck = 0;
        const { lines } = roadLines(G);
        const line = lines[Math.floor(tr._rng() * lines.length)];
        car.axis = line.axis;
        car.fixed = line.fixed;
        car.dir = tr._rng() < 0.5 ? 1 : -1;
      }
    } else {
      car.stuck = 0;
    }

    const steer = steerToward(v.pos, v.heading, target);
    const speedErr = wantSpeed - v.speed;
    let throttle = clamp(speedErr * 0.25, -0.6, 0.8);
    if (wantSpeed === 0 && v.speed < 1) throttle = -0.4;
    v.ai = { throttle, steer };
  }

  // Respawn cars that wandered too far from the player, near the player.
  tr._respawnTimer -= dt;
  if (tr._respawnTimer <= 0 && playerPos) {
    tr._respawnTimer = 2;
    for (const car of [...tr.cars]) {
      const v = car.vehicle;
      if (!v) continue;
      const d = Math.hypot(v.pos.x - playerPos.x, v.pos.z - playerPos.z);
      if (d > cfg(G, 'TRAFFIC_DESPAWN_DIST', 260)) {
        tr.remove(car);
        tr.spawnOne(playerPos);
      }
    }
    // Top the count back up.
    const want = cfg(G, 'TRAFFIC_COUNT', 14);
    while (tr.cars.length < want) tr.spawnOne(playerPos);
  }
}
