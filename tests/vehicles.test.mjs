import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as vehicles from '../game/src/vehicles.js';
import * as player from '../game/src/player.js';
import { makeG } from './helpers.mjs';

function bootedG() {
  const G = makeG();
  vehicles.init(G);
  player.init(G);
  return G;
}

function freshCar(model = 'sedan') {
  return {
    id: 99, model, pos: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0,
    health: 100, owned: true, driver: null, drive: { throttle: 0, steer: 0, handbrake: false },
  };
}

describe('MODELS', () => {
  it('defines six models with sane tuning', () => {
    for (const [name, m] of Object.entries(vehicles.MODELS)) {
      assert.ok(m.topSpeed > 10, name);
      assert.ok(m.accel > 0, name);
      assert.ok(m.steer > 0, name);
      assert.ok(m.color !== undefined, name);
    }
  });
  it('sports is the fastest, truck the slowest', () => {
    assert.ok(vehicles.MODELS.sports.topSpeed > vehicles.MODELS.sedan.topSpeed);
    assert.ok(vehicles.MODELS.truck.topSpeed < vehicles.MODELS.sedan.topSpeed);
  });
});

describe('stepVehicle', () => {
  it('accelerates forward on throttle', () => {
    const v = freshCar();
    vehicles.stepVehicle(v, { throttle: 1, steer: 0 }, 1);
    assert.ok(v.speed > 5);
    assert.ok(v.pos.z < 0); // forward is -z at heading 0
  });
  it('caps speed at the model top speed', () => {
    const v = freshCar();
    for (let i = 0; i < 30; i++) vehicles.stepVehicle(v, { throttle: 1, steer: 0 }, 0.5);
    assert.ok(v.speed <= vehicles.MODELS.sedan.topSpeed + 1e-9);
  });
  it('brakes to a stop and then reverses', () => {
    const v = freshCar();
    v.speed = 10;
    vehicles.stepVehicle(v, { throttle: -1, steer: 0 }, 1);
    assert.ok(v.speed < 10);
    for (let i = 0; i < 10; i++) vehicles.stepVehicle(v, { throttle: -1, steer: 0 }, 0.5);
    assert.ok(v.speed < 0);
  });
  it('caps reverse speed', () => {
    const v = freshCar();
    for (let i = 0; i < 30; i++) vehicles.stepVehicle(v, { throttle: -1, steer: 0 }, 0.5);
    assert.ok(v.speed >= -vehicles.MODELS.sedan.topSpeed * 0.35 - 1e-9);
  });
  it('steers while moving and barely steers while stopped', () => {
    const moving = freshCar();
    moving.speed = 15;
    vehicles.stepVehicle(moving, { throttle: 0, steer: 1 }, 0.5);
    assert.ok(Math.abs(moving.heading) > 0.1);
    const stopped = freshCar();
    vehicles.stepVehicle(stopped, { throttle: 0, steer: 1 }, 0.5);
    assert.ok(Math.abs(stopped.heading) < 0.01);
  });
  it('handbrake sharpens steering', () => {
    const a = freshCar(); a.speed = 15;
    const b = freshCar(); b.speed = 15;
    vehicles.stepVehicle(a, { throttle: 0, steer: 1 }, 0.5);
    vehicles.stepVehicle(b, { throttle: 0, steer: 1, handbrake: true }, 0.5);
    assert.ok(Math.abs(b.heading) > Math.abs(a.heading));
  });
  it('returns the distance travelled', () => {
    const v = freshCar();
    v.speed = 10;
    const d = vehicles.stepVehicle(v, { throttle: 0, steer: 0 }, 0.5);
    // Drag (1.6) sheds 20% of 10 m/s over 0.5 s: 8 m/s * 0.5 s = 4 m.
    assert.ok(Math.abs(d - 4) < 1e-9);
  });
  it('clamps out-of-range drive inputs', () => {
    const v = freshCar();
    vehicles.stepVehicle(v, { throttle: 99, steer: -99 }, 0.1);
    assert.ok(Number.isFinite(v.speed) && Number.isFinite(v.heading));
  });
});

describe('kmh and vehicleForward', () => {
  it('converts speed to km/h', () => {
    assert.equal(vehicles.kmh({ speed: 10 }), 36);
    assert.equal(vehicles.kmh({ speed: -5 }), 18);
  });
  it('forward follows the heading', () => {
    const f = vehicles.vehicleForward({ heading: 0 });
    assert.deepEqual({ x: Math.round(f.x), z: Math.round(f.z) }, { x: 0, z: -1 });
  });
});

describe('spawnVehicle and damageVehicle', () => {
  it('spawns a car with defaults and registers it', () => {
    const G = bootedG();
    const before = G.vehicles.list.length;
    const v = vehicles.spawnVehicle(G, 10, 20, 1.5, 'taxi', { owned: true });
    assert.equal(G.vehicles.list.length, before + 1);
    assert.equal(v.model, 'taxi');
    assert.equal(v.pos.x, 10);
    assert.equal(v.heading, 1.5);
    assert.equal(v.health, vehicles.VEHICLE_HEALTH);
  });
  it('falls back to sedan for an unknown model', () => {
    const G = bootedG();
    const v = vehicles.spawnVehicle(G, 0, 0, 0, 'hovercraft');
    assert.equal(v.model, 'hovercraft');
    vehicles.stepVehicle(v, { throttle: 1, steer: 0 }, 0.5);
    assert.ok(v.speed > 0);
  });
  it('damage accumulates, smoking starts under 40, wreck at zero', () => {
    const G = bootedG();
    const v = G.vehicles.list[0];
    assert.equal(vehicles.damageVehicle(G, v, 30, 'test'), true);
    assert.equal(v.health, 70);
    assert.equal(v.smoking, false);
    vehicles.damageVehicle(G, v, 40, 'test');
    assert.equal(v.smoking, true);
    vehicles.damageVehicle(G, v, 100, 'test');
    assert.equal(v.wrecked, true);
    assert.equal(v.speed, 0);
    assert.ok(G.events.emitted.some((e) => e.type === 'car-wrecked'));
  });
  it('does not damage an already wrecked car', () => {
    const G = bootedG();
    const v = G.vehicles.list[0];
    vehicles.damageVehicle(G, v, 500, 'test');
    assert.equal(vehicles.damageVehicle(G, v, 10, 'test'), false);
  });
  it('isWrecked mirrors the flag', () => {
    const v = freshCar();
    assert.equal(vehicles.isWrecked(v), false);
    v.wrecked = true;
    assert.equal(vehicles.isWrecked(v), true);
  });
  it('despawn removes the car and clears the player vehicle', () => {
    const G = bootedG();
    const v = G.vehicles.list[0];
    G.vehicles.playerVehicle = v;
    vehicles.despawnVehicle(G, v);
    assert.ok(!G.vehicles.list.includes(v));
    assert.equal(G.vehicles.playerVehicle, null);
  });
});

describe('spawnParkedCars', () => {
  it('places the requested number of cars', () => {
    const G = makeG();
    G.vehicles = { list: [], playerVehicle: null };
    const n = vehicles.spawnParkedCars(G, 5);
    assert.equal(n, 5);
    assert.equal(G.vehicles.list.length, 5);
    assert.ok(G.vehicles.list.every((v) => v.owned === false));
  });
});

describe('world helpers', () => {
  it('boundsOf maps a scalar half-extent', () => {
    assert.deepEqual(vehicles.boundsOf(makeG()), { minX: -294, maxX: 294, minZ: -294, maxZ: 424 });
  });
  it('collideWorld pushes a point out of a building AABB', () => {
    const G = makeG();
    const pos = { x: 40, z: 40 }; // inside the stub building 20..60
    assert.equal(vehicles.collideWorld(G, pos, 1), true);
    assert.ok(pos.x <= 19 || pos.x >= 61 || pos.z <= 19 || pos.z >= 61);
  });
  it('collideWorld clamps to the city walls', () => {
    const G = makeG();
    const pos = { x: 9999, z: -9999 };
    vehicles.collideWorld(G, pos, 1);
    assert.equal(pos.x, 293);
    assert.equal(pos.z, -293);
  });
  it('collideWorld returns false in open road', () => {
    const G = makeG();
    assert.equal(vehicles.collideWorld(G, { x: 0, z: 0 }, 1), false);
  });
  it('nearestRoadPointWorld snaps to the nearest road', () => {
    const G = makeG();
    const p = vehicles.nearestRoadPointWorld(G, 5, 7);
    // The z-road at x=0 is nearer (25) than the x-road at z=0 (49).
    assert.equal(p.x, 0);
    assert.equal(p.z, 7);
  });
  it('randomRoadPosWorld returns a point on a road', () => {
    const G = makeG();
    for (let i = 0; i < 20; i++) {
      const p = vehicles.randomRoadPosWorld(G);
      const onRoad = Math.abs(p.x % 144) < 3 || [0, 144, -144].some((c) => Math.abs(p.z - c) < 3.5)
        || [0, 144, -144].some((c) => Math.abs(p.x - c) < 3.5);
      assert.ok(onRoad, `off-road point ${p.x},${p.z}`);
    }
  });
  it('ensureWorldHelpers does not overwrite existing world functions', () => {
    const G = makeG();
    const orig = G.world.collide;
    vehicles.ensureWorldHelpers(G);
    assert.equal(G.world.collide, orig);
  });
  it('ensureWorldHelpers attaches missing world functions', () => {
    const G = makeG({ world: { roads: makeRoadsForTest(), buildings: [], bounds: 294 } });
    vehicles.ensureWorldHelpers(G);
    assert.equal(typeof G.world.collide, 'function');
    assert.equal(typeof G.world.nearestRoadPoint, 'function');
    assert.equal(typeof G.world.randomRoadPos, 'function');
    assert.deepEqual(G.world.nearestRoadPoint(5, 7), { x: 0, z: 7, heading: Math.PI / 2 });
  });
});

function makeRoadsForTest() {
  return [
    { x1: -288, z1: 0, x2: 288, z2: 0, axis: 'x' },
    { x1: 0, z1: -288, x2: 0, z2: 288, axis: 'z' },
  ];
}

describe('vehicles init wiring', () => {
  it('exposes spawn/enter/getActive/clearActive/despawn/damageVehicle', () => {
    const G = bootedG();
    for (const fn of ['spawn', 'enter', 'getActive', 'clearActive', 'despawn', 'damageVehicle', 'update']) {
      assert.equal(typeof G.vehicles[fn], 'function', fn);
    }
  });
  it('spawn uses the object form shots.js calls', () => {
    const G = bootedG();
    const car = G.vehicles.spawn({ x: 1, z: 2, heading: 0.5, color: 0xc03028, parked: false });
    assert.equal(car.pos.x, 1);
    assert.equal(car.pos.z, 2);
    assert.ok(G.vehicles.list.includes(car));
  });
  it('getActive/clearActive track the player vehicle', () => {
    const G = bootedG();
    assert.equal(G.vehicles.getActive(), null);
    const car = G.vehicles.list[0];
    G.vehicles.playerVehicle = car;
    car.driver = 'player';
    assert.equal(G.vehicles.getActive(), car);
    G.vehicles.clearActive();
    assert.equal(G.vehicles.getActive(), null);
    assert.equal(car.driver, null);
  });
  it('update drives the player car from input and records distance', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.vehicles.playerVehicle = car;
    G.player.pos.x = car.pos.x;
    G.player.pos.z = car.pos.z;
    G.player.onFoot = false;
    G.player.vehicle = car;
    G.input.keys = { KeyW: true };
    const x0 = car.pos.x;
    const z0 = car.pos.z;
    vehicles.update(G, 1);
    assert.ok(Math.hypot(car.pos.x - x0, car.pos.z - z0) > 1);
    assert.ok(G.stats.distanceDriven > 0);
  });
  it('a hard building hit slows the car and damages it', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    // Aim the car at the stub building at 40,40 from the west, fast.
    // Starting just outside the wall means most of the step is swallowed.
    car.pos.x = 15;
    car.pos.z = 40;
    car.heading = Math.PI / 2; // forward +x
    car.speed = 25;
    car.drive = { throttle: 1, steer: 0, handbrake: false };
    vehicles.update(G, 0.5);
    assert.ok(car.speed < 25);
    assert.ok(car.health < 100);
  });
});
