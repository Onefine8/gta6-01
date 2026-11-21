// traffic.js — ambient AI cars that follow the road grid.
//
// Owns G.traffic. Each AI car is a real vehicle (spawned through
// vehicles.js) with an `ai` field naming the road segment it follows; this
// module only writes each car's `drive` field every tick and lets
// vehicles.js do the physics. Roads come from G.world.roads as segments
// { ax, az, bx, bz }. Pure road helpers are exported for tests.

export const TRAFFIC_TARGET = 10; // cars alive around the player
export const TRAFFIC_SPEED = 9; // m/s cruise
export const SPAWN_RADIUS = 150;
export const DESPAWN_RADIUS = 230;

// --- pure road math ------------------------------------------------------
// Builder A's roads are full-length grid lines {axis, x1, z1, x2, z2}
// (9 east-west + 9 north-south). Traffic drives on SEGMENTS: each road
// split at every crossing, so a segment's ends are real intersections
// and pickNextSegment can hop from one to the next. Test stubs may hand
// in {ax, az, bx, bz} segments directly; those pass through unchanged.

export function normalizeRoads(roads) {
  if (!roads || roads.length === 0) return [];
  if (roads[0].ax !== undefined) return roads.map((s) => ({ ...s }));
  const xs = [...new Set(roads.filter((r) => r.axis === 'z').map((r) => r.x1))].sort((a, b) => a - b);
  const zs = [...new Set(roads.filter((r) => r.axis === 'x').map((r) => r.z1))].sort((a, b) => a - b);
  const segs = [];
  for (const road of roads) {
    if (road.axis === 'x') {
      const cuts = [road.x1, ...xs.filter((x) => x > road.x1 && x < road.x2), road.x2];
      for (let i = 0; i < cuts.length - 1; i++) {
        segs.push({ ax: cuts[i], az: road.z1, bx: cuts[i + 1], bz: road.z1 });
      }
    } else {
      const cuts = [road.z1, ...zs.filter((z) => z > road.z1 && z < road.z2), road.z2];
      for (let i = 0; i < cuts.length - 1; i++) {
        segs.push({ ax: road.x1, az: cuts[i], bx: road.x1, bz: cuts[i + 1] });
      }
    }
  }
  return segs;
}

export function segmentPoint(seg, t) {
  return { x: seg.ax + (seg.bx - seg.ax) * t, z: seg.az + (seg.bz - seg.az) * t };
}

export function segmentLength(seg) {
  return Math.hypot(seg.bx - seg.ax, seg.bz - seg.az);
}

export function segmentHeading(seg) {
  return Math.atan2(seg.bx - seg.ax, -(seg.bz - seg.az));
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Nearest segment to a point, with the parameter t of the closest point.
export function nearestSegment(roads, x, z) {
  let best = -1;
  let bestD = Infinity;
  let bestT = 0;
  for (let i = 0; i < roads.length; i++) {
    const s = roads[i];
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
    const px = s.ax + dx * t;
    const pz = s.az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bestD) {
      best = i;
      bestD = d;
      bestT = t;
    }
  }
  return { index: best, dist: bestD, t: bestT };
}

// Pick a segment that continues from the end of `current` (its far end
// meets the next segment's near end). Falls back to any segment.
export function pickNextSegment(roads, current, rng) {
  if (!roads || roads.length === 0) return -1;
  const cur = roads[current];
  if (!cur) return -1;
  const ex = cur.bx;
  const ez = cur.bz;
  const options = [];
  for (let i = 0; i < roads.length; i++) {
    if (i === current) continue;
    const s = roads[i];
    if (Math.hypot(s.ax - ex, s.az - ez) < 1.5) options.push(i);
  }
  if (options.length === 0) return current; // dead end: turn around below
  const r = rng && typeof rng.next === 'function' ? rng.next() : Math.random();
  return options[Math.floor(r * options.length)];
}

// Mirror of pickNextSegment for the near end: a segment whose far end
// meets the near end of `current` (used when driving backwards).
export function pickPrevSegment(roads, current, rng) {
  if (!roads || roads.length === 0) return -1;
  const cur = roads[current];
  if (!cur) return -1;
  const sx = cur.ax;
  const sz = cur.az;
  const options = [];
  for (let i = 0; i < roads.length; i++) {
    if (i === current) continue;
    const s = roads[i];
    if (Math.hypot(s.bx - sx, s.bz - sz) < 1.5) options.push(i);
  }
  if (options.length === 0) return current;
  const r = rng && typeof rng.next === 'function' ? rng.next() : Math.random();
  return options[Math.floor(r * options.length)];
}

// Steering + throttle to follow a segment at a target speed. `dir` is +1
// along the segment, -1 against it (after a dead-end turnaround).
export function followDrive(v, seg, targetSpeed, dir = 1) {
  const want = segmentHeading(seg) + (dir < 0 ? Math.PI : 0);
  const diff = wrapAngle(want - v.heading);
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  let throttle = 0;
  if (v.speed < targetSpeed) throttle = 0.7;
  else if (v.speed > targetSpeed + 2) throttle = -0.4;
  return { throttle, steer, handbrake: false };
}

// --- spawning ------------------------------------------------------------

function randomRoadPosNear(G, segments, cx, cz, radius) {
  const rng = G.rng;
  const r = () => (rng && typeof rng.next === 'function' ? rng.next() : Math.random());
  if (segments.length === 0) return { x: cx + (r() - 0.5) * radius, z: cz + (r() - 0.5) * radius };
  for (let tries = 0; tries < 20; tries++) {
    const seg = segments[Math.floor(r() * segments.length)];
    const t = r();
    const p = segmentPoint(seg, t);
    if (Math.hypot(p.x - cx, p.z - cz) < radius) return p;
  }
  const seg = segments[Math.floor(r() * segments.length)];
  return segmentPoint(seg, r());
}

function spawnTrafficCar(G, px, pz) {
  const segments = G.traffic.segments.length > 0
    ? G.traffic.segments
    : normalizeRoads((G.world && G.world.roads) || []);
  const rng = G.rng;
  const r = () => (rng && typeof rng.next === 'function' ? rng.next() : Math.random());
  const models = ['sedan', 'sedan', 'taxi', 'van'];
  const model = models[Math.floor(r() * models.length)];
  const p = randomRoadPosNear(G, segments, px, pz, SPAWN_RADIUS);
  const near = nearestSegment(segments, p.x, p.z);
  const seg = segments[near.index];
  const heading = seg ? segmentHeading(seg) : r() * Math.PI * 2;
  // Spawn through the vehicles module's object-form factory (wired by
  // vehicles.init); fall back to the G.vehiclesSpawn alias.
  const spawn = (G.vehicles && typeof G.vehicles.spawn === 'function')
    ? G.vehicles.spawn
    : (typeof G.vehiclesSpawn === 'function' ? G.vehiclesSpawn : null);
  if (typeof spawn !== 'function') return null; // no vehicle factory yet — retry next tick
  const car = spawn({ x: p.x, z: p.z, heading, model, driver: 'ai', owned: true });
  if (!car) return null;
  car.ai = {
    seg: near.index >= 0 ? near.index : 0,
    t: near.t,
    dir: 1,
    speed: TRAFFIC_SPEED * (0.8 + r() * 0.45),
    stuck: 0,
  };
  G.traffic.cars.push(car);
  return car;
}

// --- lifecycle -----------------------------------------------------------

export function init(G) {
  const target = (G.cfg && G.cfg.WORLD && G.cfg.WORLD.TRAFFIC_COUNT) || TRAFFIC_TARGET;
  // Replace the (frozen) module namespace on G with the live traffic
  // object: the car list plus update() and the spawnNear() shots.js uses.
  G.traffic = {
    cars: [],
    spawnTimer: 0,
    segments: normalizeRoads((G.world && G.world.roads) || []),
    target,
    update,
    spawnNear: (x, z, radius) => spawnTrafficCar(G, x, z),
  };
  return G.traffic;
}

export function update(G, dt) {
  const tr = G.traffic;
  if (!tr || G.state !== 'playing') return;
  if (tr.segments.length === 0) {
    tr.segments = normalizeRoads((G.world && G.world.roads) || []);
  }
  const roads = tr.segments;
  const p = G.player ? G.player.pos : { x: 0, z: 0 };
  const pv = G.vehicles ? G.vehicles.playerVehicle : null;

  // Keep the streets populated near the player.
  tr.spawnTimer -= dt;
  if (tr.spawnTimer <= 0) {
    tr.spawnTimer = 0.8;
    if (tr.cars.length < (tr.target ?? TRAFFIC_TARGET)) spawnTrafficCar(G, p.x, p.z);
  }

  for (let i = tr.cars.length - 1; i >= 0; i--) {
    const car = tr.cars[i];
    if (!car || car.wrecked) {
      tr.cars.splice(i, 1);
      continue;
    }
    const dPlayer = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
    if (dPlayer > DESPAWN_RADIUS) {
      if (G.vehicles && typeof G.vehicles.despawn === 'function') G.vehicles.despawn(car);
      tr.cars.splice(i, 1);
      continue;
    }

    const seg = roads[car.ai ? car.ai.seg : -1];
    if (!seg) {
      car.drive = { throttle: 0, steer: 0, handbrake: true };
      continue;
    }

    // Advance along the segment; hop to the next one at its end, or turn
    // around (dir = -1) at a dead end and drive back along it.
    const len = Math.max(1, segmentLength(seg));
    car.ai.dir = car.ai.dir ?? 1;
    car.ai.t += car.ai.dir * (Math.abs(car.speed) * dt) / len;
    if (car.ai.t >= 1) {
      const next = pickNextSegment(roads, car.ai.seg, G.rng);
      if (next === car.ai.seg) {
        car.ai.dir = -1;
        car.ai.t = 1;
      } else {
        car.ai.seg = next;
        car.ai.t = 0;
      }
    } else if (car.ai.t <= 0) {
      const prev = pickPrevSegment(roads, car.ai.seg, G.rng);
      if (prev === car.ai.seg) {
        car.ai.dir = 1;
        car.ai.t = 0;
      } else {
        car.ai.seg = prev;
        car.ai.t = 1;
      }
    }

    let drive = followDrive(car, roads[car.ai.seg], car.ai.speed, car.ai.dir);

    // Don't rear-end the player's car: brake when close ahead.
    if (pv) {
      const dx = pv.pos.x - car.pos.x;
      const dz = pv.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      const fx = Math.sin(car.heading);
      const fz = -Math.cos(car.heading);
      const ahead = (dx * fx + dz * fz) / (d || 1);
      if (d < 13 && ahead > 0.6 && Math.abs(pv.speed) < Math.abs(car.speed)) {
        drive = { throttle: -0.8, steer: drive.steer, handbrake: false };
      }
    }

    // Stuck detection: barely moving for a while means wedged on a corner.
    if (Math.abs(car.speed) < 0.4 && drive.throttle > 0) car.ai.stuck += dt;
    else car.ai.stuck = 0;
    if (car.ai.stuck > 4) {
      car.ai.seg = pickNextSegment(roads, car.ai.seg, G.rng);
      car.ai.t = 0;
      car.ai.dir = 1;
      car.ai.stuck = 0;
    }

    car.drive = drive;
  }
}
