// Vehicles: arcade physics, car-vs-car separation, crash damage, and the
// spawn/steal API the other modules use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepVehicle, separateCars, collisionDamage, init, update } from '../game/src/vehicles.js';
import { init as initPlayer } from '../game/src/player.js';
import { installThreeStub, makeG } from './helpers.mjs';

installThreeStub();

function car() {
  return { pos: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0, steer: 0 };
}

test('vehicles: throttle accelerates forward up to maxSpeed', () => {
  const v = car();
  for (let i = 0; i < 600; i++) stepVehicle(v, { throttle: 1, steer: 0 }, 1 / 60, { maxSpeed: 42 });
  assert.ok(v.speed > 35 && v.speed <= 42, `speed=${v.speed}`);
  assert.ok(v.pos.z > 100, 'moved forward');
});

test('vehicles: reverse is capped at maxReverse', () => {
  const v = car();
  for (let i = 0; i < 600; i++) stepVehicle(v, { throttle: -1, steer: 0 }, 1 / 60, { maxReverse: 10 });
  assert.ok(v.speed < 0 && v.speed >= -10, `speed=${v.speed}`);
});

test('vehicles: braking from speed stops the car', () => {
  const v = car();
  for (let i = 0; i < 300; i++) stepVehicle(v, { throttle: 1, steer: 0 }, 1 / 60);
  assert.ok(v.speed > 20);
  for (let i = 0; i < 300; i++) stepVehicle(v, { throttle: -1, steer: 0 }, 1 / 60);
  assert.ok(v.speed <= 0.5, `speed=${v.speed}`);
});

test('vehicles: coasting decays speed toward zero', () => {
  const v = car();
  v.speed = 20;
  for (let i = 0; i < 600; i++) stepVehicle(v, { throttle: 0, steer: 0 }, 1 / 60);
  assert.ok(Math.abs(v.speed) < 0.5);
});

test('vehicles: steering turns the heading only while moving', () => {
  const still = car();
  stepVehicle(still, { throttle: 0, steer: 1 }, 1, {});
  assert.equal(still.heading, 0, 'parked car does not turn');
  const moving = car();
  moving.speed = 10;
  const h0 = moving.heading;
  stepVehicle(moving, { throttle: 0.5, steer: 1 }, 1, {});
  assert.ok(moving.heading > h0, 'moving car turns');
});

test('vehicles: steering reverses when reversing', () => {
  const v = car();
  v.speed = -5;
  stepVehicle(v, { throttle: -0.5, steer: 1 }, 0.5, {});
  assert.ok(v.heading < 0, `heading=${v.heading}`);
});

test('vehicles: handbrake scrubs speed and sharpens the turn', () => {
  const a = car(); a.speed = 20;
  const b = car(); b.speed = 20;
  stepVehicle(a, { throttle: 0, steer: 0.5, handbrake: false }, 1, {});
  stepVehicle(b, { throttle: 0, steer: 0.5, handbrake: true }, 1, {});
  assert.ok(b.speed < a.speed);
  assert.ok(Math.abs(b.heading) > Math.abs(a.heading));
});

test('vehicles: separateCars pushes overlapping cars apart', () => {
  const a = { pos: { x: 0, z: 0 }, speed: 5 };
  const b = { pos: { x: 2, z: 0 }, speed: 5 };
  assert.equal(separateCars(a, b, 3.4), true);
  assert.ok(Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) >= 3.39);
  assert.ok(a.speed < 5 && b.speed < 5, 'impact scrubs speed');
});

test('vehicles: separateCars ignores distant cars', () => {
  const a = { pos: { x: 0, z: 0 }, speed: 5 };
  const b = { pos: { x: 20, z: 0 }, speed: 5 };
  assert.equal(separateCars(a, b, 3.4), false);
  assert.equal(a.pos.x, 0);
});

test('vehicles: collisionDamage is zero for gentle bumps', () => {
  assert.equal(collisionDamage(2), 0);
  assert.equal(collisionDamage(3.9), 0);
  assert.ok(collisionDamage(10) > 0);
  assert.ok(collisionDamage(100) <= 40, 'damage is capped');
});

test('vehicles: init spawns parked cars and exposes spawn/spawnCar/enter', () => {
  const G = makeG();
  initPlayer(G);
  const vs = init(G);
  assert.ok(vs.list.length >= 10, `parked=${vs.list.length}`);
  const v = vs.spawn({ x: 5, z: 5, heading: 1, kind: 'coupe' });
  assert.equal(v.kind, 'coupe');
  assert.equal(v.driver, 'none');
  assert.equal(v.health, 100);
  assert.ok(v.mesh, 'mesh built');
  const c2 = vs.spawnCar({ x: 1, z: 1, model: 'sedan', color: 0xff0000 });
  assert.equal(c2.kind, 'sedan');
  assert.equal(vs.enter(c2), true);
  assert.equal(G.player.inVehicle, true);
});

test('vehicles: update drives the player car with W', () => {
  const G = makeG();
  initPlayer(G);
  const vs = init(G);
  const car = vs.spawn({ x: 0, z: 0, heading: 0, kind: 'sedan' });
  G.player.enterVehicle(car);
  G.input.held.add('KeyW');
  for (let i = 0; i < 120; i++) update(G, 1 / 60);
  assert.ok(car.speed > 10, `speed=${car.speed}`);
  assert.ok(car.pos.z > 5, `z=${car.pos.z}`);
  assert.equal(vs.current, car, 'current exposes the player car');
});

test('vehicles: update integrates AI cars through their ai field', () => {
  const G = makeG();
  initPlayer(G);
  const vs = init(G);
  const car = vs.spawn({ x: 0, z: 0, heading: 0, kind: 'sedan', driver: 'traffic' });
  car.ai = { throttle: 0.8, steer: 0 };
  for (let i = 0; i < 120; i++) update(G, 1 / 60);
  assert.ok(car.speed > 5, `speed=${car.speed}`);
  assert.ok(car.pos.z > 2);
});

test('vehicles: steal marks the car stolen and seats the player', () => {
  const G = makeG();
  initPlayer(G);
  const vs = init(G);
  const car = vs.spawn({ x: 0, z: 0, heading: 0, kind: 'sedan', driver: 'traffic' });
  assert.equal(vs.steal(car), true);
  assert.equal(car.stolen, true);
  assert.equal(G.player.vehicle, car);
});

test('vehicles: remove drops the car and frees the player', () => {
  const G = makeG();
  initPlayer(G);
  const vs = init(G);
  const car = vs.spawn({ x: 0, z: 0, heading: 0, kind: 'sedan' });
  G.player.enterVehicle(car);
  vs.remove(car);
  assert.ok(!vs.list.includes(car));
  assert.equal(G.player.inVehicle, false);
  assert.equal(G.player.vehicle, null);
});

test('vehicles: update clamps a driven car inside the city', () => {
  const G = makeG();
  initPlayer(G);
  const vs = init(G);
  const car = vs.spawn({ x: 400, z: 400, heading: 0, kind: 'sedan', driver: 'traffic' });
  car.ai = { throttle: 0, steer: 0 };
  update(G, 1 / 60);
  assert.ok(Math.abs(car.pos.x) <= 292, `x=${car.pos.x}`);
  assert.ok(Math.abs(car.pos.z) <= 292, `z=${car.pos.z}`);
});
