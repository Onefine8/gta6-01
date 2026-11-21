// vehicles.js — car models, arcade physics, stealing and wrecks.
//
// Owns G.vehicles: the list of cars in the city and the one Rook drives.
// Every car is stepped by the same pure physics function; whoever controls
// a car only writes its `drive` field ({ throttle, steer, handbrake }) and
// this module does the rest — the player (input), traffic AI and police
// all drive through that one field, so modules never import each other.
// Meshes are built only when the THREE global exists.

export const MODELS = {
  sedan: { name: 'Meridian Sedan', topSpeed: 26, accel: 11, brake: 22, steer: 1.9, color: 0x3a6ea5, length: 4.4, width: 1.9 },
  taxi: { name: 'Port Taxi', topSpeed: 24, accel: 10, brake: 22, steer: 1.9, color: 0xe8b400, length: 4.4, width: 1.9 },
  sports: { name: 'Vortex GT', topSpeed: 38, accel: 17, brake: 26, steer: 2.3, color: 0xc22730, length: 4.2, width: 2.0 },
  truck: { name: 'Harbor Hauler', topSpeed: 19, accel: 7, brake: 16, steer: 1.4, color: 0x5a6b52, length: 6.4, width: 2.4 },
  van: { name: 'Courier Van', topSpeed: 22, accel: 9, brake: 20, steer: 1.7, color: 0xd8d8d8, length: 5.0, width: 2.1 },
  police: { name: 'PMPD Interceptor', topSpeed: 33, accel: 15, brake: 26, steer: 2.2, color: 0x1c2f57, length: 4.5, width: 2.0 },
};

export const VEHICLE_HEALTH = 100;
export const COLLIDE_RADIUS = 1.7;
export const STEAL_HEAT = 25;

let nextId = 1;

// --- world helpers -------------------------------------------------------
// Builder A's world.js documents world.collide / nearestRoadPoint /
// randomRoadPos as the public API, but only exports them as module
// functions — they are NOT methods on the G.world object. Attach them
// here (once, only when missing) so every gameplay module can call
// G.world.collide(...) as the spec promises. Test stubs that already
// provide their own are left alone.

export function boundsOf(G) {
  const b = G && G.world ? G.world.bounds : undefined;
  if (typeof b === 'number') return { minX: -b, maxX: b, minZ: -b, maxZ: b + 130 };
  if (b && typeof b === 'object') {
    return {
      minX: b.minX ?? -294, maxX: b.maxX ?? 294,
      minZ: b.minZ ?? -294, maxZ: b.maxZ ?? 424,
    };
  }
  return { minX: -294, maxX: 294, minZ: -294, maxZ: 424 };
}

// Push a circle out of building AABBs and the city walls. Mutates pos.
export function collideWorld(G, pos, r) {
  const world = G.world;
  if (!world) return false;
  const b = boundsOf(G);
  let hit = false;
  if (pos.x < b.minX + r) { pos.x = b.minX + r; hit = true; }
  if (pos.x > b.maxX - r) { pos.x = b.maxX - r; hit = true; }
  if (pos.z < b.minZ + r) { pos.z = b.minZ + r; hit = true; }
  if (pos.z > b.maxZ - r) { pos.z = b.maxZ - r; hit = true; }
  for (const bd of world.buildings ?? []) {
    if (pos.x + r <= bd.minX || pos.x - r >= bd.maxX) continue;
    if (pos.z + r <= bd.minZ || pos.z - r >= bd.maxZ) continue;
    const dxMin = (pos.x + r) - bd.minX;
    const dxMax = bd.maxX - (pos.x - r);
    const dzMin = (pos.z + r) - bd.minZ;
    const dzMax = bd.maxZ - (pos.z - r);
    const m = Math.min(dxMin, dxMax, dzMin, dzMax);
    if (m === dxMin) pos.x = bd.minX - r;
    else if (m === dxMax) pos.x = bd.maxX + r;
    else if (m === dzMin) pos.z = bd.minZ - r;
    else pos.z = bd.maxZ + r;
    hit = true;
  }
  return hit;
}

// Roads in Builder A's raw form {axis, x1, z1, x2, z2}: snap a point onto
// the nearest road centre line. Returns {x, z, heading}.
export function nearestRoadPointWorld(G, x, z) {
  const roads = (G.world && G.world.roads) || [];
  let best = null;
  let bestD = Infinity;
  for (const road of roads) {
    let px;
    let pz;
    let heading;
    if (road.axis === 'x') {
      px = Math.max(road.x1, Math.min(road.x2, x));
      pz = road.z1;
      heading = 0;
    } else {
      px = road.x1;
      pz = Math.max(road.z1, Math.min(road.z2, z));
      heading = Math.PI / 2;
    }
    const d = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (d < bestD) {
      bestD = d;
      best = { x: px, z: pz, heading };
    }
  }
  return best ?? { x, z, heading: 0 };
}

export function randomRoadPosWorld(G) {
  const roads = (G.world && G.world.roads) || [];
  const rng = G.rng;
  const r = () => (rng && typeof rng.next === 'function' ? rng.next() : Math.random());
  const pick = rng && typeof rng.pick === 'function'
    ? (arr) => rng.pick(arr)
    : (arr) => arr[Math.floor(r() * arr.length)];
  if (roads.length === 0) return { x: (r() - 0.5) * 400, z: (r() - 0.5) * 400, heading: 0 };
  const road = pick(roads);
  const t = 0.05 + r() * 0.9;
  if (road.axis === 'x') {
    const lane = r() < 0.5 ? -2.8 : 2.8;
    return { x: road.x1 + (road.x2 - road.x1) * t, z: road.z1 + lane, heading: r() < 0.5 ? 0 : Math.PI };
  }
  const lane = r() < 0.5 ? -2.8 : 2.8;
  return { x: road.x1 + lane, z: road.z1 + (road.z2 - road.z1) * t, heading: r() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
}

export function ensureWorldHelpers(G) {
  const world = G.world;
  if (!world) return;
  if (typeof world.collide !== 'function') {
    world.collide = (pos, r) => collideWorld(G, pos, r);
  }
  if (typeof world.nearestRoadPoint !== 'function') {
    world.nearestRoadPoint = (x, z) => nearestRoadPointWorld(G, x, z);
  }
  if (typeof world.randomRoadPos !== 'function') {
    world.randomRoadPos = () => randomRoadPosWorld(G);
  }
}

// --- pure physics --------------------------------------------------------

// One arcade step. `drive` is { throttle: -1..1, steer: -1..1, handbrake }.
// Returns the distance travelled (for odometer / speed display).
export function stepVehicle(v, drive, dt) {
  const m = MODELS[v.model] ?? MODELS.sedan;
  const throttle = Math.max(-1, Math.min(1, drive.throttle ?? 0));
  const steer = Math.max(-1, Math.min(1, drive.steer ?? 0));

  if (throttle > 0) v.speed += m.accel * throttle * dt;
  else if (throttle < 0) {
    // S: brake while moving forward, reverse once stopped.
    if (v.speed > 0.5) v.speed -= m.brake * dt;
    else v.speed -= m.accel * 0.55 * dt;
    if (v.speed < -m.topSpeed * 0.35) v.speed = -m.topSpeed * 0.35;
  }
  // Rolling drag + handbrake.
  const drag = drive.handbrake ? 4 : 1.6;
  v.speed -= v.speed * drag * dt * 0.25;
  if (Math.abs(v.speed) < 0.05 && throttle === 0) v.speed = 0;
  if (v.speed > m.topSpeed) v.speed = m.topSpeed;

  // Steering bites harder the faster the car goes, and more with handbrake.
  const grip = drive.handbrake ? 1.5 : 1;
  const steerRate = m.steer * grip * Math.min(1, Math.abs(v.speed) / 9);
  v.heading += steer * steerRate * Math.sign(v.speed || 1) * dt;

  const fx = Math.sin(v.heading);
  const fz = -Math.cos(v.heading);
  const dist = v.speed * dt;
  v.pos.x += fx * dist;
  v.pos.z += fz * dist;
  return Math.abs(dist);
}

export function kmh(v) {
  return Math.abs(v.speed ?? 0) * 3.6;
}

export function vehicleForward(v) {
  return { x: Math.sin(v.heading), z: -Math.cos(v.heading) };
}

// --- damage / wreck ------------------------------------------------------

export function damageVehicle(G, v, amount, source) {
  if (!v || v.wrecked) return false;
  v.health = Math.max(0, (v.health ?? VEHICLE_HEALTH) - amount);
  if (v.health <= 40) v.smoking = true;
  if (v.health <= 0) {
    v.wrecked = true;
    v.speed = 0;
    if (G.events && typeof G.events.emit === 'function') {
      G.events.emit('car-wrecked', { id: v.id, model: v.model, source });
    }
    if (G.audio && typeof G.audio.play === 'function') G.audio.play('explosion');
  }
  return true;
}

export function isWrecked(v) {
  return !!v.wrecked;
}

// --- spawn / despawn -----------------------------------------------------

export function spawnVehicle(G, x, z, heading, model, opts = {}) {
  const m = MODELS[model] ?? MODELS.sedan;
  const v = {
    id: nextId++,
    model,
    name: m.name,
    pos: { x, y: 0, z },
    heading: heading ?? 0,
    speed: 0,
    health: VEHICLE_HEALTH,
    owned: !!opts.owned,
    driver: opts.driver ?? null,
    smoking: false,
    wrecked: false,
    color: opts.color ?? m.color,
    drive: { throttle: 0, steer: 0, handbrake: false },
    mesh: null,
    ai: null, // traffic / police state, owned by those modules
    odometer: 0,
  };
  v.mesh = buildMesh(G, v);
  G.vehicles.list.push(v);
  return v;
}

export function despawnVehicle(G, v) {
  const list = G.vehicles.list;
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1);
  if (v.mesh) {
    if (G.scene && typeof G.scene.remove === 'function') G.scene.remove(v.mesh);
    v.mesh = null;
  }
  if (G.vehicles.playerVehicle === v) G.vehicles.playerVehicle = null;
}

// Object-form spawn used by shots.js and the other gameplay modules:
//   G.vehicles.spawn({ x, z, heading, model, color, driver, owned })
// Returns the car. The positional spawnVehicle() stays the testable core.
export function spawnObject(G, opts) {
  return spawnVehicle(G, opts.x ?? 0, opts.z ?? 0, opts.heading ?? 0, opts.model ?? 'sedan', opts);
}
export function spawnParkedCars(G, count) {
  const rng = G.rng;
  const rand = (a, b) => (rng && typeof rng.next === 'function'
    ? a + rng.next() * (b - a)
    : a + Math.random() * (b - a));
  const models = ['sedan', 'sedan', 'taxi', 'van', 'sports'];
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 40) {
    const p = G.world && typeof G.world.randomRoadPos === 'function'
      ? G.world.randomRoadPos(rng)
      : { x: rand(-200, 200), z: rand(-200, 200) };
    const heading = rand(0, Math.PI * 2);
    const model = models[Math.floor(rand(0, models.length))];
    spawnVehicle(G, p.x, p.z, heading, model, { owned: false });
    placed++;
  }
  return placed;
}

// --- mesh (THREE only when the global exists) ----------------------------

function buildMesh(G, v) {
  if (typeof THREE === 'undefined') return null;
  const m = MODELS[v.model] ?? MODELS.sedan;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: v.color, metalness: 0.4, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(m.width, 0.75, m.length), bodyMat);
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(m.width * 0.82, 0.6, m.length * 0.45),
    new THREE.MeshStandardMaterial({ color: 0x1a2530, metalness: 0.2, roughness: 0.25 }),
  );
  cabin.position.set(0, 1.2, -m.length * 0.05);
  group.add(body, cabin);
  if (v.model === 'police') {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.18, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 0.8 }),
    );
    bar.position.set(0, 1.6, -m.length * 0.05);
    group.add(bar);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheelPos = [
    [-m.width / 2, -m.length / 2 + 0.8], [m.width / 2, -m.length / 2 + 0.8],
    [-m.width / 2, m.length / 2 - 0.8], [m.width / 2, m.length / 2 - 0.8],
  ];
  for (const [wx, wz] of wheelPos) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }
  group.position.set(v.pos.x, 0, v.pos.z);
  group.rotation.y = v.heading;
  if (G.scene) G.scene.add(group);
  return group;
}

// --- player driving input ------------------------------------------------

function playerDrive(G) {
  const input = G.input;
  if (!input) return { throttle: 0, steer: 0, handbrake: false };
  const down = (codes) => {
    if (typeof input.isDown === 'function') return codes.some((c) => input.isDown(c));
    const keys = input.keys;
    if (keys instanceof Set) return codes.some((c) => keys.has(c));
    if (Array.isArray(keys)) return codes.some((c) => keys.includes(c));
    if (keys && typeof keys === 'object') return codes.some((c) => keys[c] === true);
    return false;
  };
  return {
    throttle: (down(['KeyW', 'ArrowUp']) ? 1 : 0) + (down(['KeyS', 'ArrowDown']) ? -1 : 0),
    steer: (down(['KeyD', 'ArrowRight']) ? 1 : 0) + (down(['KeyA', 'ArrowLeft']) ? -1 : 0),
    handbrake: down(['Space']),
  };
}

// --- lifecycle -----------------------------------------------------------

export function init(G) {
  ensureWorldHelpers(G);
  // Replace the (frozen) module namespace on G with the live vehicles
  // object: the car list plus the methods main.js, shots.js and the other
  // gameplay modules call on it.
  G.vehicles = {
    list: [],
    playerVehicle: null,
    update,
    spawn: (opts) => spawnObject(G, opts),
    enter: (car) => {
      // The canonical enter logic lives in player.js; delegate when the
      // player module has initialised (it always runs first).
      if (G.player && typeof G.player.enterVehicle === 'function') {
        return G.player.enterVehicle(car);
      }
      const p = G.player;
      if (!p) return;
      p.onFoot = false;
      p.vehicle = car;
      car.driver = 'player';
      G.vehicles.playerVehicle = car;
    },
    despawn: (v) => despawnVehicle(G, v),
    getActive: () => G.vehicles.playerVehicle,
    clearActive: () => {
      const pv = G.vehicles.playerVehicle;
      if (pv) pv.driver = null;
      G.vehicles.playerVehicle = null;
    },
    damageVehicle: (v, amount, source) => damageVehicle(G, v, amount, source),
  };
  // Convenience alias for modules that spawn cars directly.
  G.vehiclesSpawn = (opts) => spawnObject(G, opts);
  spawnParkedCars(G, 14);
  return G.vehicles;
}

export function update(G, dt) {
  const vs = G.vehicles;
  if (!vs) return;
  const pv = vs.playerVehicle;
  if (pv && !pv.wrecked && G.state === 'playing') {
    pv.drive = playerDrive(G);
  }

  for (const v of vs.list) {
    if (v.wrecked) continue;
    const before = { x: v.pos.x, z: v.pos.z };
    const dist = stepVehicle(v, v.drive ?? { throttle: 0, steer: 0 }, dt);
    v.odometer += dist;

    // Buildings: the world pushes the car out; a hard push is a crash.
    if (G.world && typeof G.world.collide === 'function') {
      G.world.collide(v.pos, COLLIDE_RADIUS);
      const pushed = Math.hypot(v.pos.x - before.x, v.pos.z - before.z);
      const expected = Math.abs(dist);
      if (expected > 0.5 && pushed < expected * 0.4) {
        const impact = Math.abs(v.speed);
        v.speed *= 0.25;
        if (impact > 12) {
          damageVehicle(G, v, (impact - 12) * 1.5, 'crash');
          if (v === pv && G.audio && typeof G.audio.play === 'function') G.audio.play('crash');
        }
      }
    }
    if (G.world) {
      const b = boundsOf(G);
      v.pos.x = Math.max(b.minX, Math.min(b.maxX, v.pos.x));
      v.pos.z = Math.max(b.minZ, Math.min(b.maxZ, v.pos.z));
    }
    if (v === pv && G.stats) {
      G.stats.distanceDriven = (G.stats.distanceDriven ?? 0) + dist;
    }
    if (v.mesh) {
      v.mesh.position.set(v.pos.x, 0, v.pos.z);
      v.mesh.rotation.y = v.heading;
    }
  }

  // Cheap car-vs-car shove: only pairs close enough to matter.
  const list = vs.list;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.wrecked || b.wrecked) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = 2.6;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 10) {
          damageVehicle(G, a, rel * 0.4, 'collision');
          damageVehicle(G, b, rel * 0.4, 'collision');
          a.speed *= 0.6;
          b.speed *= 0.6;
        }
      }
    }
  }
}
