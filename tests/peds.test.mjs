import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as peds from '../game/src/peds.js';
import * as vehicles from '../game/src/vehicles.js';
import * as player from '../game/src/player.js';
import { makeG, makeRng } from './helpers.mjs';

const RAW_ROADS = [
  { x1: -288, z1: 0, x2: 288, z2: 0, axis: 'x' },
  { x1: 0, z1: -288, x2: 0, z2: 288, axis: 'z' },
];

describe('sidewalkPoint', () => {
  it('places points beside x-roads', () => {
    for (let i = 0; i < 30; i++) {
      const p = peds.sidewalkPoint(RAW_ROADS, makeRng(i + 1));
      const nearXRoad = Math.abs(p.z - 0) >= 7 && Math.abs(p.z - 0) <= 11;
      const nearZRoad = Math.abs(p.x - 0) >= 7 && Math.abs(p.x - 0) <= 11;
      assert.ok(nearXRoad || nearZRoad, `bad sidewalk point ${p.x},${p.z}`);
    }
  });
  it('places points beside {ax,az,bx,bz} segments', () => {
    const segs = [{ ax: 0, az: 0, bx: 100, bz: 0 }];
    for (let i = 0; i < 10; i++) {
      const p = peds.sidewalkPoint(segs, makeRng(i + 1));
      assert.ok(Math.abs(p.z) >= 7 && Math.abs(p.z) <= 11);
    }
  });
  it('falls back to a spread when there are no roads', () => {
    const p = peds.sidewalkPoint([], makeRng(5));
    assert.ok(Math.abs(p.x) <= 150 && Math.abs(p.z) <= 150);
  });
});

describe('fleeDirection', () => {
  it('points away from the threat', () => {
    const ped = { pos: { x: 0, z: 0 } };
    const dir = peds.fleeDirection(ped, { x: 10, z: 0 }, makeRng(1));
    assert.ok(dir.x < -0.5, `expected flight west, got ${dir.x}`);
    assert.ok(Math.abs(Math.hypot(dir.x, dir.z) - 1) < 1e-9);
  });
});

describe('isScared', () => {
  function scaredG() {
    const G = makeG();
    vehicles.init(G);
    player.init(G);
    peds.init(G);
    return G;
  }
  it('is not scared in a quiet street', () => {
    const G = scaredG();
    const ped = G.peds.list[0] ?? peds.spawnPed(G, 0, 0);
    assert.equal(peds.isScared(G, ped), null);
  });
  it('flees a recent gunshot', () => {
    const G = scaredG();
    G.combat = { lastShotAt: 0, lastShotPos: { x: 0, z: 0 } };
    G.time.t = 1;
    const ped = peds.spawnPed(G, 2, 2);
    assert.ok(peds.isScared(G, ped));
  });
  it('ignores an old gunshot', () => {
    const G = scaredG();
    G.combat = { lastShotAt: 0, lastShotPos: { x: 0, z: 0 } };
    G.time.t = 10;
    const ped = peds.spawnPed(G, 2, 2);
    assert.equal(peds.isScared(G, ped), null);
  });
  it('flees a speeding player car', () => {
    const G = scaredG();
    const car = G.vehicles.list[0];
    G.vehicles.playerVehicle = car;
    car.speed = 20;
    const ped = peds.spawnPed(G, car.pos.x + 3, car.pos.z);
    assert.ok(peds.isScared(G, ped));
  });
  it('ignores a slow player car', () => {
    const G = scaredG();
    const car = G.vehicles.list[0];
    G.vehicles.playerVehicle = car;
    car.speed = 5;
    const ped = peds.spawnPed(G, car.pos.x + 3, car.pos.z);
    assert.equal(peds.isScared(G, ped), null);
  });
});

describe('peds update', () => {
  function bootedG() {
    const G = makeG();
    vehicles.init(G);
    player.init(G);
    peds.init(G);
    return G;
  }
  it('spawns an initial crowd', () => {
    const G = bootedG();
    assert.ok(G.peds.list.length > 0);
    assert.ok(G.peds.list.length <= 12);
  });
  it('peds wander toward their targets', () => {
    const G = bootedG();
    const ped = G.peds.list[0];
    const x0 = ped.pos.x;
    const z0 = ped.pos.z;
    for (let i = 0; i < 50; i++) {
      peds.update(G, 0.1);
      G.time.t += 0.1;
    }
    assert.ok(Math.hypot(ped.pos.x - x0, ped.pos.z - z0) > 0.5);
  });
  it('a scared ped runs away from the threat', () => {
    const G = bootedG();
    G.combat = { lastShotAt: 0, lastShotPos: { x: 0, z: 0 } };
    G.time.t = 0.5;
    const ped = peds.spawnPed(G, 3, 0);
    const d0 = Math.hypot(ped.pos.x, ped.pos.z);
    for (let i = 0; i < 10; i++) peds.update(G, 0.1);
    assert.equal(ped.state, 'flee');
    assert.ok(Math.hypot(ped.pos.x, ped.pos.z) > d0);
  });
  it('despawns peds far from the player', () => {
    const G = bootedG();
    const ped = G.peds.list[0];
    ped.pos.x = G.player.pos.x + 500;
    ped.pos.z = G.player.pos.z + 500;
    peds.update(G, 0.1);
    assert.ok(!G.peds.list.includes(ped));
  });
  it('tops the crowd back up near the player', () => {
    const G = bootedG();
    G.peds.list.length = 0;
    for (let i = 0; i < 200; i++) {
      peds.update(G, 0.1);
      G.time.t += 0.1;
    }
    assert.ok(G.peds.list.length > 0);
  });
  it('spawnNear adds a ped near a point (shots.js API)', () => {
    const G = bootedG();
    const before = G.peds.list.length;
    const ped = G.peds.spawnNear(0, 0, 25);
    assert.ok(ped);
    assert.equal(G.peds.list.length, before + 1);
    assert.ok(Math.hypot(ped.pos.x, ped.pos.z) < 60);
  });
  it('does not run when the game is not playing', () => {
    const G = bootedG();
    G.state = 'menu';
    const n = G.peds.list.length;
    peds.update(G, 1);
    assert.equal(G.peds.list.length, n);
  });
});
