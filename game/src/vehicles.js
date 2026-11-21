// vehicles.js — cars: box-and-wheel models, arcade physics, stealing.
// Owns G.vehicles.list. A vehicle is a plain data object
// {id, kind, color, pos, heading, speed, steer, driver, health, mesh, ...};
// the mesh only mirrors it. Driving input comes from G.input.moveAxis()
// when the player is the driver; traffic and police steer by writing the
// same `ai` field ({throttle, steer}) and letting stepVehicle integrate it.
// The player's car is exposed as G.vehicles.current for the engine hum.

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

function three() {
  return typeof globalThis !== 'undefined' ? globalThis.THREE : undefined;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
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

function emit(G, name, data) {
  try {
    G.events?.emit?.(name, data);
  } catch (e) { /* best-effort */ }
}

function keyDown(G, code) {
  const input = G.input;
  if (!input) return false;
  if (typeof input.isDown === 'function') {
    try {
      if (input.isDown(code)) return true;
    } catch (e) { /* fall through */ }
  }
  if (input.held && typeof input.held.has === 'function' && input.held.has(code)) return true;
  const keys = input.keys;
  return !!(keys && keys[code]);
}

/** Movement axis {x: strafe, y: forward} from input.moveAxis() or keys. */
function moveAxis(G) {
  const input = G.input;
  if (input && typeof input.moveAxis === 'function') {
    try {
      const a = input.moveAxis();
      if (a && typeof a.x === 'number' && typeof a.y === 'number') return a;
    } catch (e) { /* fall through */ }
  }
  return {
    x: (keyDown(G, 'KeyD') || keyDown(G, 'ArrowRight') ? 1 : 0)
      - (keyDown(G, 'KeyA') || keyDown(G, 'ArrowLeft') ? 1 : 0),
    y: (keyDown(G, 'KeyW') || keyDown(G, 'ArrowUp') ? 1 : 0)
      - (keyDown(G, 'KeyS') || keyDown(G, 'ArrowDown') ? 1 : 0),
  };
}

// ---------------------------------------------------------------- pure math (tested)

/**
 * One arcade-physics step for a car. Pure: no THREE, no DOM.
 * v: {pos {x,z}, heading, speed, steer}
 * ctl: {throttle -1..1, steer -1..1, handbrake bool}
 * opts: {maxSpeed, maxReverse, accel, brake, drag, steerRate, grip}
 * Returns v (mutated).
 */
export function stepVehicle(v, ctl, dt, opts = {}) {
  const maxSpeed = opts.maxSpeed ?? 42;
  const maxReverse = opts.maxReverse ?? 10;
  const accel = opts.accel ?? 14;
  const brake = opts.brake ?? 26;
  const drag = opts.drag ?? 0.6;
  const steerRate = opts.steerRate ?? 1.9;
  const grip = opts.grip ?? 6.5;

  const throttle = clamp(ctl.throttle ?? 0, -1, 1);
  const steer = clamp(ctl.steer ?? 0, -1, 1);

  if (throttle > 0) {
    // Accelerating forward; if rolling backwards, the pedal brakes first.
    v.speed += (v.speed < -0.5 ? brake : accel) * throttle * dt;
  } else if (throttle < 0) {
    v.speed += (v.speed > 0.5 ? brake : accel) * throttle * dt;
  } else {
    // Coast: drag + rolling resistance.
    v.speed -= v.speed * drag * dt;
    if (Math.abs(v.speed) < 0.15) v.speed = 0;
  }
  v.speed = clamp(v.speed, -maxReverse, maxSpeed);

  // Steering only bites while moving; faster = less twitchy, handbrake = slide.
  const speedFactor = clamp(Math.abs(v.speed) / 12, 0, 1);
  const dir = v.speed >= 0 ? 1 : -1;
  const rate = steerRate * (0.35 + 0.65 * (1 - speedFactor * 0.6)) * (ctl.handbrake ? 1.7 : 1);
  v.heading += steer * rate * speedFactor * dir * dt;
  if (ctl.handbrake) v.speed -= v.speed * 1.4 * dt;

  // Keep the steering visually aligned with the input (arcade grip).
  v.steer += (steer - v.steer) * Math.min(1, grip * dt);

  v.pos.x += Math.sin(v.heading) * v.speed * dt;
  v.pos.z += Math.cos(v.heading) * v.speed * dt;
  return v;
}

/** Circle-vs-circle push-apart for two cars. Mutates both positions. */
export function separateCars(a, b, minDist) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz);
  if (d <= 0.0001 || d >= minDist) return false;
  const push = (minDist - d) / 2;
  const nx = dx / d;
  const nz = dz / d;
  a.pos.x -= nx * push;
  a.pos.z -= nz * push;
  b.pos.x += nx * push;
  b.pos.z += nz * push;
  // A bump scrubs speed off both cars.
  a.speed *= 0.82;
  b.speed *= 0.82;
  return true;
}

/** Damage falloff for a collision at `impactSpeed` (m/s). */
export function collisionDamage(impactSpeed) {
  if (impactSpeed < 4) return 0;
  return Math.min(40, Math.round((impactSpeed - 4) * 2.5));
}

// ---------------------------------------------------------------- models

const CAR_KINDS = {
  sedan: { body: [1.9, 0.55, 4.2], cabin: [1.7, 0.5, 2.1], cabinZ: -0.2, wheels: 0.36 },
  coupe: { body: [1.8, 0.5, 3.8], cabin: [1.55, 0.45, 1.7], cabinZ: -0.3, wheels: 0.35 },
  truck: { body: [2.2, 0.8, 5.6], cabin: [2.0, 0.7, 1.4], cabinZ: 1.6, wheels: 0.44 },
  taxi: { body: [1.9, 0.55, 4.2], cabin: [1.7, 0.5, 2.1], cabinZ: -0.2, wheels: 0.36 },
  police: { body: [1.95, 0.58, 4.4], cabin: [1.7, 0.5, 2.1], cabinZ: -0.2, wheels: 0.37 },
  van: { body: [2.0, 1.0, 4.8], cabin: [1.9, 0.6, 1.6], cabinZ: 1.2, wheels: 0.4 },
};

const CAR_COLORS = [
  0xb8312f, 0x2f6db8, 0x2fb872, 0xd8d8d8, 0x222226, 0xd8a02f,
  0x7a4fb8, 0x3fb8b0, 0xc96a2f, 0x5a6b7a, 0xe8e0c8, 0x8a2f4f,
];

/** Build a car mesh (body box + cabin box + 4 cylinder wheels). */
export function buildCarMesh(kind, color) {
  const T = three();
  if (!T) return null;
  const spec = CAR_KINDS[kind] || CAR_KINDS.sedan;
  const group = new T.Group();
  const paint = new T.MeshLambertMaterial({ color });
  const glass = new T.MeshLambertMaterial({ color: 0x1a2733 });
  const tyre = new T.MeshLambertMaterial({ color: 0x111111 });

  const body = new T.Mesh(new T.BoxGeometry(spec.body[0], spec.body[1], spec.body[2]), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  const cabin = new T.Mesh(new T.BoxGeometry(spec.cabin[0], spec.cabin[1], spec.cabin[2]), glass);
  cabin.position.set(0, 0.55 + spec.body[1] / 2 + spec.cabin[1] / 2 - 0.05, spec.cabinZ);
  cabin.castShadow = true;
  group.add(body, cabin);

  const wheelGeo = new T.CylinderGeometry(spec.wheels, spec.wheels, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wx = spec.body[0] / 2 - 0.05;
  const wz = spec.body[2] / 2 - 0.75;
  const wheels = [];
  for (const [x, z] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
    const w = new T.Mesh(wheelGeo, tyre);
    w.position.set(x, spec.wheels, z);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }

  if (kind === 'police') {
    const bar = new T.Mesh(
      new T.BoxGeometry(0.9, 0.12, 0.3),
      new T.MeshLambertMaterial({ color: 0x223344 }),
    );
    bar.position.set(0, 1.45, -0.2);
    const red = new T.Mesh(
      new T.BoxGeometry(0.4, 0.1, 0.3),
      new T.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222 }),
    );
    red.position.set(-0.22, 1.53, -0.2);
    const blue = new T.Mesh(
      new T.BoxGeometry(0.4, 0.1, 0.3),
      new T.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff }),
    );
    blue.position.set(0.22, 1.53, -0.2);
    group.add(bar, red, blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  if (kind === 'taxi') {
    const sign = new T.Mesh(
      new T.BoxGeometry(0.6, 0.16, 0.3),
      new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xaa8800 }),
    );
    sign.position.set(0, 1.42, -0.2);
    group.add(sign);
  }
  group.userData.wheels = wheels;
  group.userData.spec = spec;
  return group;
}

// ---------------------------------------------------------------- module

let nextVehicleId = 1;

export function init(G) {
  const rng = rngFn(G);
  const vcfg = section(G, 'VEHICLE', {});
  G.vehicles = {
    list: [],
    current: null, // the player's car, for the engine hum (audio.update)
    _rng: rng,

    /** Spawn a car at (x, z) with a heading. Returns the vehicle object. */
    spawn(opts = {}) {
      const kind = opts.kind || 'sedan';
      const color = opts.color !== undefined ? opts.color
        : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      const v = {
        id: nextVehicleId++,
        kind,
        color,
        pos: { x: opts.x ?? 0, y: 0, z: opts.z ?? 0 },
        heading: opts.heading ?? 0,
        speed: 0,
        steer: 0,
        throttle: 0,
        steerTarget: 0,
        driver: opts.driver ?? 'none',
        health: 100,
        maxSpeed: opts.maxSpeed ?? vcfg.maxSpeed ?? 42,
        accel: opts.accel ?? vcfg.accel ?? 14,
        brake: opts.brake ?? vcfg.brake ?? 26,
        stolen: !!opts.stolen,
        mesh: null,
        ai: null, // traffic/police write {throttle, steer} here each tick
        _prevSpeed: 0,
        _smoke: 0,
      };
      const mesh = buildCarMesh(kind, kind === 'taxi' ? 0xffd23f : color);
      if (mesh) {
        mesh.position.set(v.pos.x, 0, v.pos.z);
        v.mesh = mesh;
        G.scene?.add?.(mesh);
      }
      G.vehicles.list.push(v);
      return v;
    },

    /** Alias used by the screenshot stager: {x, z, heading, model, color}. */
    spawnCar(opts = {}) {
      return G.vehicles.spawn({
        x: opts.x ?? 0, z: opts.z ?? 0, heading: opts.heading ?? 0,
        kind: opts.model || opts.kind || 'sedan', color: opts.color,
        driver: opts.driver ?? 'none',
      });
    },

    /** Alias used by the screenshot stager: put the player in a car. */
    enter(car) {
      return G.player?.enterVehicle?.(car) ?? false;
    },

    /** Remove a vehicle from the world (mesh + list). */
    remove(vehicle) {
      const i = G.vehicles.list.indexOf(vehicle);
      if (i >= 0) G.vehicles.list.splice(i, 1);
      if (vehicle.mesh) G.scene?.remove?.(vehicle.mesh);
      if (G.player?.vehicle === vehicle) {
        G.player.vehicle = null;
        G.player.inVehicle = false;
        G.player.onFoot = true;
        if (G.player.mesh) G.player.mesh.visible = true;
      }
      if (G.vehicles.current === vehicle) G.vehicles.current = null;
    },

    /** Yank the driver out of an occupied car and hand it to the player. */
    steal(vehicle) {
      if (!vehicle) return false;
      if (vehicle.driver === 'police') return false; // never steal a cop car occupied
      const wasOccupied = vehicle.driver && vehicle.driver !== 'none';
      vehicle.driver = 'player';
      vehicle.stolen = true;
      if (wasOccupied) {
        emit(G, 'car-stolen', { vehicleId: vehicle.id });
        G.police?.addWanted?.(undefined, 'theft');
        sfx(G, 'steal');
      }
      G.player?.enterVehicle?.(vehicle);
      return true;
    },

    /** The pure physics step, exposed on G so traffic/police can drive too. */
    step: stepVehicle,
  };

  // Parked cars scattered through the city for the player to find.
  const parked = cfg(G, 'PARKED_CARS', 10);
  for (let i = 0; i < parked; i++) {
    let p = null;
    try {
      // world.randomRoadPos expects the createRng bundle (pick/next).
      if (G.rng && typeof G.rng.pick === 'function') p = G.world?.randomRoadPos?.(G.rng);
    } catch (e) { /* fall through to the random point */ }
    if (!p) p = { x: (rng() - 0.5) * 400, z: (rng() - 0.5) * 400 };
    const kinds = ['sedan', 'coupe', 'sedan', 'van', 'coupe'];
    G.vehicles.spawn({
      x: p.x + (rng() - 0.5) * 6,
      z: p.z + (rng() - 0.5) * 6,
      heading: rng() * Math.PI * 2,
      kind: kinds[Math.floor(rng() * kinds.length)],
      driver: 'none',
    });
  }
  return G.vehicles;
}

export function update(G, dt) {
  const vs = G.vehicles;
  if (!vs || G.state !== 'playing') return;
  dt = Math.min(dt, 0.05);

  const p = G.player;
  const playerVeh = p?.inVehicle ? p.vehicle : null;
  vs.current = playerVeh ?? null;

  for (const v of vs.list) {
    let ctl = { throttle: 0, steer: 0, handbrake: false };
    if (v === playerVeh) {
      const axis = moveAxis(G);
      ctl = {
        throttle: axis.y,
        steer: axis.x,
        handbrake: keyDown(G, 'Space'),
      };
      v.throttle = ctl.throttle;
      v.steerTarget = ctl.steer;
    } else if (v.ai) {
      ctl = { throttle: v.ai.throttle ?? 0, steer: v.ai.steer ?? 0, handbrake: false };
    } else if (v.driver === 'none') {
      continue; // parked: nothing to integrate
    }

    v._prevSpeed = v.speed;
    stepVehicle(v, ctl, dt, { maxSpeed: v.maxSpeed, accel: v.accel, brake: v.brake });

    // Buildings stop cars: collide pushes the position out; a big push is a crash.
    if (G.world?.collide) {
      const bx = v.pos.x;
      const bz = v.pos.z;
      try {
        G.world.collide(v.pos, 1.4);
      } catch (e) { /* best-effort */ }
      const pushed = Math.hypot(v.pos.x - bx, v.pos.z - bz);
      if (pushed > 0.02) {
        const impact = Math.abs(v._prevSpeed);
        const dmg = collisionDamage(impact);
        if (dmg > 0) {
          v.health -= dmg;
          if (v === playerVeh) {
            emit(G, 'car-crash', { damage: dmg, speed: impact });
            emit(G, 'crash', { strength: Math.min(1, dmg / 40) });
            sfx(G, 'crash');
            G.player?.damage?.(dmg * 0.25, 'crash');
          }
        }
        v.speed *= 0.25;
      }
    }

    // Stay inside the city.
    const half = cfg(G, 'CITY_HALF', 288);
    v.pos.x = clamp(v.pos.x, -half, half);
    v.pos.z = clamp(v.pos.z, -half, half);

    // Smoke when wrecked; a wrecked car barely moves.
    if (v.health <= 0) {
      v.speed *= 0.9;
      v._smoke += dt;
      if (v === playerVeh) emit(G, 'car-wrecked', { vehicleId: v.id });
    }
  }

  // Car-vs-car bumps (cheap O(n^2), n is small).
  const list = vs.list;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.driver === 'none' && b.driver === 'none') continue;
      if (Math.abs(a.pos.x - b.pos.x) > 4 || Math.abs(a.pos.z - b.pos.z) > 4) continue;
      const hit = separateCars(a, b, 3.4);
      if (hit && (a === playerVeh || b === playerVeh)) {
        sfx(G, 'bump');
      }
    }
  }

  // Sync meshes.
  for (const v of list) {
    if (!v.mesh) continue;
    v.mesh.position.set(v.pos.x, 0, v.pos.z);
    v.mesh.rotation.y = v.heading;
    // Spin the wheels with speed.
    const wheels = v.mesh.userData?.wheels;
    if (wheels) {
      const spin = (v.speed * dt) / 0.36;
      for (const w of wheels) w.rotation.x += spin;
      wheels[0].rotation.y = v.steer * 0.4;
      wheels[1].rotation.y = v.steer * 0.4;
    }
    // Police lightbar strobes.
    if (v.kind === 'police' && v.mesh.userData) {
      const on = Math.floor((G.time?.t ?? 0) * 6) % 2 === 0;
      if (v.mesh.userData.lightRed) v.mesh.userData.lightRed.visible = on;
      if (v.mesh.userData.lightBlue) v.mesh.userData.lightBlue.visible = !on;
    }
  }
}
