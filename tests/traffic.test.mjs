// Traffic: road following on the world module's full grid lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closestOnSegment, steerToward, headingFor, laneOffset, nextIntersection,
  getRoads, roadLines, randomRoadPos, init, update,
} from '../game/src/traffic.js';
import { init as initVehicles, update as vehiclesUpdate } from '../game/src/vehicles.js';
import { init as initPlayer } from '../game/src/player.js';
import { installThreeStub, makeG } from './helpers.mjs';

installThreeStub();

test('traffic: closestOnSegment finds the projection', () => {
  const c = closestOnSegment({ x: 5, z: 5 }, { x: 0, z: 0 }, { x: 10, z: 0 });
  assert.equal(c.x, 5);
  assert.equal(c.z, 0);
  assert.equal(c.t, 0.5);
});

test('traffic: closestOnSegment clamps to the ends', () => {
  const c = closestOnSegment({ x: 20, z: 0 }, { x: 0, z: 0 }, { x: 10, z: 0 });
  assert.equal(c.x, 10);
  assert.equal(c.t, 1);
});

test('traffic: steerToward turns toward the target', () => {
  // Facing +z (heading 0), target to the right (+x): steer positive.
  const s = steerToward({ x: 0, z: 0 }, 0, { x: 10, z: 10 });
  assert.ok(s > 0.5, `steer=${s}`);
  // Target straight ahead: no steer.
  assert.ok(Math.abs(steerToward({ x: 0, z: 0 }, 0, { x: 0, z: 10 })) < 0.01);
  // Target behind: full lock.
  assert.ok(Math.abs(steerToward({ x: 0, z: 0 }, 0, { x: 0, z: -10 })) > 0.9);
});

test('traffic: headingFor maps axis+direction to radians', () => {
  assert.equal(headingFor('z', 1), 0);
  assert.equal(headingFor('z', -1), Math.PI);
  assert.equal(headingFor('x', 1), Math.PI / 2);
  assert.equal(headingFor('x', -1), -Math.PI / 2);
});

test('traffic: laneOffset is 3 m to the right of the heading', () => {
  const o = laneOffset(0);
  assert.ok(Math.abs(o.x - 3) < 0.001);
  assert.ok(Math.abs(o.z) < 0.001);
  const o2 = laneOffset(Math.PI / 2);
  assert.ok(Math.abs(o2.x) < 0.001);
  assert.ok(Math.abs(o2.z + 3) < 0.001);
});

test('traffic: nextIntersection returns the next grid line ahead', () => {
  const lines = [-288, -216, -144, -72, 0, 72, 144, 216, 288];
  assert.equal(nextIntersection(0, 1, lines), 72);
  assert.equal(nextIntersection(0, -1, lines), -72);
  assert.equal(nextIntersection(288, 1, lines), null);
  assert.equal(nextIntersection(-288, -1, lines), null);
  assert.equal(nextIntersection(71, 1, lines), 72);
});

test('traffic: getRoads falls back to a grid when the world has none', () => {
  const G = makeG();
  const roads = getRoads(G);
  assert.ok(roads.length >= 36, `roads=${roads.length}`);
  assert.ok(roads.every((r) => r.ax !== undefined && r.bz !== undefined));
});

test('traffic: roadLines reduces world-style roads to centrelines', () => {
  const G = makeG();
  G.world = {
    roads: [
      { ax: -288, az: 0, bx: 288, bz: 0, dir: 'x' },
      { ax: 0, az: -288, bx: 0, bz: 288, dir: 'z' },
    ],
  };
  const { lines, coords } = roadLines(G);
  assert.equal(lines.length, 2);
  assert.deepEqual(coords, [0]);
});

test('traffic: roadLines on the fallback grid gives 9 lines per axis', () => {
  const G = makeG();
  const { lines, coords } = roadLines(G);
  assert.equal(lines.length, 18);
  assert.equal(coords.length, 9);
  assert.equal(coords[0], -288);
  assert.equal(coords[8], 288);
});

test('traffic: randomRoadPos lands on a road centreline (+lane)', () => {
  const G = makeG();
  const rng = () => 0.5;
  const p = randomRoadPos(G, rng);
  const onLine = [-288, -216, -144, -72, 0, 72, 144, 216, 288]
    .some((c) => Math.abs(p.x - c) <= 3.01 || Math.abs(p.z - c) <= 3.01);
  assert.ok(onLine, JSON.stringify(p));
});

test('traffic: init spawns the configured car count', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const tr = init(G);
  assert.equal(tr.cars.length, 14);
  for (const c of tr.cars) {
    assert.ok(c.vehicle, 'car has a vehicle');
    assert.ok(['x', 'z'].includes(c.axis));
    assert.ok(c.dir === 1 || c.dir === -1);
  }
});

test('traffic: update moves cars along their lane', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const tr = init(G);
  const car = tr.cars[0];
  // Stand next to the car so the respawn logic leaves it alone.
  G.player.pos.x = car.vehicle.pos.x;
  G.player.pos.z = car.vehicle.pos.z;
  G.player.x = G.player.pos.x;
  G.player.z = G.player.pos.z;
  const before = { x: car.vehicle.pos.x, z: car.vehicle.pos.z };
  for (let i = 0; i < 120; i++) {
    update(G, 1 / 60);
    vehiclesUpdate(G, 1 / 60);
  }
  assert.ok(tr.cars.includes(car), 'car was not respawned away');
  const moved = Math.hypot(
    car.vehicle.pos.x - before.x, car.vehicle.pos.z - before.z,
  );
  assert.ok(moved > 2, `moved=${moved.toFixed(1)} m in 2 s`);
  assert.ok(car.vehicle.ai, 'ai field is written every tick');
  assert.equal(typeof car.vehicle.ai.throttle, 'number');
  assert.equal(typeof car.vehicle.ai.steer, 'number');
});

test('traffic: cars stop for a pedestrian standing in front', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const tr = init(G);
  const car = tr.cars[0];
  // Put the player on foot right in front of the car, on its lane.
  const v = car.vehicle;
  G.player.pos.x = v.pos.x + Math.sin(v.heading) * 6;
  G.player.pos.z = v.pos.z + Math.cos(v.heading) * 6;
  G.player.x = G.player.pos.x;
  G.player.z = G.player.pos.z;
  v.speed = 8;
  update(G, 1 / 60);
  assert.ok(v.ai.throttle <= 0, `throttle=${v.ai.throttle} (should brake)`);
});

test('traffic: spawned cars stay inside the city clamp', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const tr = init(G);
  for (const car of tr.cars) {
    assert.ok(Math.abs(car.vehicle.pos.x) <= 288, `x=${car.vehicle.pos.x}`);
    assert.ok(Math.abs(car.vehicle.pos.z) <= 288, `z=${car.vehicle.pos.z}`);
  }
});

test('traffic: a car far from the player respawns near the player', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const tr = init(G);
  const car = tr.cars[0];
  // Stand 300 m away from the car so the respawn logic must move it.
  G.player.pos.x = car.vehicle.pos.x + 300;
  G.player.pos.z = car.vehicle.pos.z;
  G.player.x = G.player.pos.x;
  G.player.z = G.player.pos.z;
  update(G, 1 / 60);
  vehiclesUpdate(G, 1 / 60);
  assert.equal(tr.cars.length, 14);
  for (const c of tr.cars) {
    const d = Math.hypot(
      c.vehicle.pos.x - G.player.pos.x, c.vehicle.pos.z - G.player.pos.z,
    );
    assert.ok(d < 260, `car ${d.toFixed(0)} m from the player`);
  }
});
