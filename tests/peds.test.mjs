// Pedestrians: sidewalk walking, fleeing, and the scare API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fleeDirection, stepPed, nextSidewalkTarget, init, update } from '../game/src/peds.js';
import { init as initPlayer } from '../game/src/player.js';
import { init as initVehicles } from '../game/src/vehicles.js';
import { installThreeStub, makeG } from './helpers.mjs';

installThreeStub();

test('peds: fleeDirection points away from the threat', () => {
  const d = fleeDirection({ x: 0, z: 0 }, { x: 3, z: 4 });
  assert.ok(Math.abs(Math.hypot(d.x, d.z) - 1) < 0.001, 'normalised');
  assert.ok(d.x < 0 && d.z < 0, 'away from the threat');
});

test('peds: stepPed walks toward the target and reports arrival', () => {
  const ped = { pos: { x: 0, y: 0, z: 0 }, heading: 0 };
  assert.equal(stepPed(ped, { x: 10, z: 0 }, 5, 1), false);
  assert.ok(ped.pos.x > 4, `x=${ped.pos.x}`);
  assert.ok(Math.abs(ped.heading - Math.PI / 2) < 0.01, 'faces the walk direction');
  assert.equal(stepPed(ped, { x: ped.pos.x, z: ped.pos.z }, 5, 1), true);
});

test('peds: nextSidewalkTarget stays beside a road', () => {
  const roads = [
    { ax: -288, az: 0, bx: 288, bz: 0 },
    { ax: 0, az: -288, bx: 0, bz: 288 },
  ];
  const rng = () => 0.5;
  const t = nextSidewalkTarget({ x: 10, z: 10 }, roads, rng, 12);
  // Either beside the horizontal road (z near ±7.6) or the vertical one.
  const nearRoad = Math.abs(Math.abs(t.z) - 7.6) < 1 || Math.abs(Math.abs(t.x) - 7.6) < 1;
  assert.ok(nearRoad, JSON.stringify(t));
});

test('peds: init spawns the configured crowd on sidewalks', () => {
  const G = makeG();
  initPlayer(G);
  const ps = init(G);
  assert.equal(ps.list.length, 24);
  for (const ped of ps.list) {
    assert.ok(ped.mesh, 'mesh built');
    assert.ok(['walk', 'idle'].includes(ped.state));
  }
});

test('peds: scare flips nearby peds to flee', () => {
  const G = makeG();
  initPlayer(G);
  const ps = init(G);
  const near = ps.list[0];
  ps.scare({ x: near.pos.x, z: near.pos.z }, 25);
  assert.equal(near.state, 'flee');
  assert.ok(near.fleeTimer > 0);
});

test('peds: update walks peds and returns them to walk after fleeing', () => {
  const G = makeG();
  initPlayer(G);
  const ps = init(G);
  const ped = ps.list[0];
  ped.state = 'flee';
  ped.fleeTimer = 0.1;
  const x0 = ped.pos.x;
  for (let i = 0; i < 120; i++) update(G, 1 / 60);
  assert.notEqual(ped.pos.x, x0, 'fleeing ped moves');
  assert.equal(ped.state, 'walk', 'calms down after the timer');
});

test('peds: a speeding player car scares nearby peds', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const ps = init(G);
  const car = G.vehicles.spawn({ x: 0, z: 0, heading: 0, kind: 'sedan' });
  car.speed = 15;
  G.player.enterVehicle(car);
  const ped = ps.list[0];
  ped.pos.x = 2;
  ped.pos.z = 8; // right in front of the car
  ped.state = 'walk';
  update(G, 1 / 60);
  assert.equal(ped.state, 'flee');
});

test('peds: crowd tops itself back up near the player', () => {
  const G = makeG();
  initPlayer(G);
  const ps = init(G);
  while (ps.list.length > 5) ps.remove(ps.list[0]);
  assert.equal(ps.list.length, 5);
  for (let i = 0; i < 60; i++) update(G, 1 / 60);
  assert.ok(ps.list.length > 5, 'respawned peds');
});

test('peds: a ped behind a speeding car does not flee', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const ps = init(G);
  const car = G.vehicles.spawn({ x: 0, z: 0, heading: 0, kind: 'sedan' });
  car.speed = 15;
  G.player.enterVehicle(car);
  const ped = ps.list[0];
  ped.pos.x = 2;
  ped.pos.z = -8; // behind the car: the car drives away from them
  ped.state = 'walk';
  update(G, 1 / 60);
  assert.equal(ped.state, 'walk');
});

test('peds: nextSidewalkTarget follows the vertical road too', () => {
  const roads = [{ ax: 0, az: -288, bx: 0, bz: 288 }];
  const rng = () => 0.5;
  const t = nextSidewalkTarget({ x: 10, z: 10 }, roads, rng, 12);
  assert.ok(Math.abs(t.x - 7.6) < 0.001, JSON.stringify(t));
  assert.ok(Math.abs(t.z - 10) < 0.001, JSON.stringify(t));
});
