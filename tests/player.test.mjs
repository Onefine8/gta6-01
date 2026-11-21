// Player: on-foot movement math, vehicle proximity, and the extended
// player object (main.js's object, extended — never replaced).
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepOnFoot, flatDist, nearestVehicle, init, update } from '../game/src/player.js';
import { installThreeStub, makeG } from './helpers.mjs';

installThreeStub();

function footState() {
  return {
    pos: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0,
    vx: 0, vz: 0, velY: 0, onGround: true,
  };
}

test('player: walking forward moves along the heading', () => {
  const s = footState();
  stepOnFoot(s, { forward: 1, strafe: 0, run: false, jump: false }, 1, { walkSpeed: 4 });
  assert.ok(s.pos.z > 3, `z=${s.pos.z}`);
  assert.ok(Math.abs(s.pos.x) < 0.01);
  assert.ok(s.speed > 0);
});

test('player: running is faster than walking', () => {
  const walk = footState();
  const run = footState();
  stepOnFoot(walk, { forward: 1, strafe: 0, run: false, jump: false }, 1, { walkSpeed: 4, runSpeed: 8 });
  stepOnFoot(run, { forward: 1, strafe: 0, run: true, jump: false }, 1, { walkSpeed: 4, runSpeed: 8 });
  assert.ok(run.pos.z > walk.pos.z * 1.5);
});

test('player: strafing moves sideways, not forward', () => {
  const s = footState();
  stepOnFoot(s, { forward: 0, strafe: 1, run: false, jump: false }, 1, { walkSpeed: 4 });
  assert.ok(s.pos.x > 3, `x=${s.pos.x}`);
  assert.ok(Math.abs(s.pos.z) < 0.5);
});

test('player: standing still decays velocity to zero', () => {
  const s = footState();
  stepOnFoot(s, { forward: 1, strafe: 0, run: false, jump: false }, 0.5, { walkSpeed: 4 });
  assert.ok(s.speed > 1);
  for (let i = 0; i < 60; i++) {
    stepOnFoot(s, { forward: 0, strafe: 0, run: false, jump: false }, 1 / 60, { walkSpeed: 4 });
  }
  assert.ok(s.speed < 0.2, `speed=${s.speed}`);
});

test('player: jumping leaves the ground and lands back at y=0', () => {
  const s = footState();
  stepOnFoot(s, { forward: 0, strafe: 0, run: false, jump: true }, 1 / 60, { jumpSpeed: 8 });
  assert.equal(s.onGround, false);
  assert.ok(s.pos.y > 0);
  for (let i = 0; i < 120; i++) {
    stepOnFoot(s, { forward: 0, strafe: 0, run: false, jump: false }, 1 / 60, { jumpSpeed: 8 });
  }
  assert.equal(s.onGround, true);
  assert.equal(s.pos.y, 0);
});

test('player: no double jump while airborne', () => {
  const s = footState();
  stepOnFoot(s, { forward: 0, strafe: 0, run: false, jump: true }, 1 / 60, { jumpSpeed: 8 });
  const vy = s.velY;
  stepOnFoot(s, { forward: 0, strafe: 0, run: false, jump: true }, 1 / 60, { jumpSpeed: 8 });
  assert.ok(s.velY < vy, 'second jump must not refresh velocity');
});

test('player: heading turns toward the movement direction', () => {
  const s = footState();
  s.heading = 0;
  stepOnFoot(s, { forward: 0, strafe: 1, run: false, jump: false }, 1, { walkSpeed: 4 });
  assert.ok(Math.abs(s.heading - Math.PI / 2) < 0.3, `heading=${s.heading}`);
});

test('player: flatDist is plain 2D distance', () => {
  assert.equal(flatDist({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
  assert.equal(flatDist({ x: 1, z: 1 }, { x: 1, z: 1 }), 0);
});

test('player: nearestVehicle picks the closest car in range', () => {
  const cars = [
    { id: 1, pos: { x: 10, z: 0 } },
    { id: 2, pos: { x: 3, z: 0 } },
    { id: 3, pos: { x: 2, z: 2 } },
  ];
  assert.equal(nearestVehicle(cars, { x: 0, z: 0 }, 5).id, 3);
  assert.equal(nearestVehicle(cars, { x: 0, z: 0 }, 2), null);
  assert.equal(nearestVehicle([], { x: 0, z: 0 }, 5), null);
});

test('player: init extends main.js player instead of replacing it', () => {
  const G = makeG();
  const before = G.player;
  before.money = 777;
  const p = init(G);
  assert.equal(G.player, before, 'same object reference');
  assert.equal(p.money, 777, 'existing money kept');
  assert.equal(p.pos.x, -18);
  assert.equal(p.pos.z, 108);
  assert.equal(p.weapon, 'pistol');
  assert.equal(p.health, 100);
  assert.ok(typeof p.damage === 'function');
  assert.ok(typeof p.enterVehicle === 'function');
  assert.ok(p.mesh, 'mesh built with stub THREE');
});

test('player: enter/exit vehicle flips the flags main.js reads', () => {
  const G = makeG();
  init(G);
  const car = { id: 1, pos: { x: -18, z: 108 }, heading: 0, driver: 'none' };
  assert.equal(G.player.enterVehicle(car), true);
  assert.equal(G.player.inVehicle, true);
  assert.equal(G.player.vehicle, car);
  assert.equal(G.player.onFoot, false);
  assert.equal(car.driver, 'player');
  assert.equal(G.player.exitVehicle(), true);
  assert.equal(G.player.inVehicle, false);
  assert.equal(G.player.vehicle, null);
  assert.equal(G.player.onFoot, true);
  assert.equal(car.driver, 'none');
});

test('player: damage reduces health and wastes at zero', () => {
  const G = makeG();
  init(G);
  let wasted = false;
  G.events.on('wasted', () => { wasted = true; });
  assert.equal(G.player.damage(30, 'test'), false);
  assert.equal(G.player.health, 70);
  assert.equal(G.player.damage(80, 'test'), true);
  assert.equal(G.player.health, 0);
  assert.equal(G.state, 'wasted');
  assert.equal(wasted, true);
});

test('player: damage in a car is halved', () => {
  const G = makeG();
  init(G);
  const car = { id: 1, pos: { x: 0, z: 0 }, heading: 0, driver: 'none' };
  G.player.enterVehicle(car);
  G.player.damage(20, 'test');
  assert.equal(G.player.health, 90);
});

test('player: update walks forward with W held', () => {
  const G = makeG();
  init(G);
  G.input.held.add('KeyW');
  const z0 = G.player.pos.z;
  for (let i = 0; i < 60; i++) update(G, 1 / 60);
  assert.ok(G.player.pos.z !== z0 || G.player.speed > 0);
  assert.ok(G.player.pos.y === 0);
  assert.equal(G.player.x, G.player.pos.x, 'flat x mirrors pos');
});

test('player: update adopts external x/z writes (save load / restart)', () => {
  const G = makeG();
  init(G);
  G.player.x = 100;
  G.player.z = -50;
  update(G, 1 / 60);
  assert.equal(G.player.pos.x, 100);
  assert.equal(G.player.pos.z, -50);
});
