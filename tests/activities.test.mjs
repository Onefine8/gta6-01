// Activities: taxi fares, race circuits, hidden packages — the economy
// math plus the live flows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  taxiFare, taxiTip, raceReward, packagePayout, raceCircuits,
  packageSpots, init, update,
} from '../game/src/activities.js';
import { init as initPlayer } from '../game/src/player.js';
import { init as initVehicles } from '../game/src/vehicles.js';
import { init as initPeds } from '../game/src/peds.js';
import * as world from '../game/src/world.js';
import { installThreeStub, makeG } from './helpers.mjs';

installThreeStub();

test('activities: taxiFare is base + per-metre, rounded to $5', () => {
  assert.equal(taxiFare(0, 120, 0.35), 120);
  assert.ok(taxiFare(500, 120, 0.35) > 120);
  assert.equal(taxiFare(100, 120, 0.35) % 5, 0);
  assert.ok(taxiFare(0, 25, 0.35) >= 25, 'never below the minimum');
});

test('activities: taxiTip rewards fast deliveries', () => {
  assert.equal(taxiTip(200, 30, 60), 50);
  assert.equal(taxiTip(200, 80, 60), 20);
  assert.equal(taxiTip(200, 200, 60), 0);
});

test('activities: raceReward pays 1st best, then 2nd, then 3rd', () => {
  assert.equal(raceReward(1, 800), 800);
  assert.equal(raceReward(2, 800), 320);
  assert.equal(raceReward(3, 800), 120);
  assert.equal(raceReward(4, 800), 0);
});

test('activities: packagePayout bonuses every 5th package', () => {
  assert.equal(packagePayout(1), 250);
  assert.equal(packagePayout(4), 250);
  assert.equal(packagePayout(5), 500);
  assert.equal(packagePayout(10), 500);
});

test('activities: three circuits with distinct loops and targets', () => {
  const circuits = raceCircuits();
  assert.equal(circuits.length, 3);
  const ids = circuits.map((c) => c.id);
  assert.deepEqual(ids, ['harbor', 'downtown', 'coast']);
  for (const c of circuits) {
    assert.ok(c.checkpoints.length >= 4, c.id);
    assert.ok(c.laps >= 2, c.id);
    assert.ok(c.targetSeconds > 0, c.id);
    assert.ok(c.reward > 0, c.id);
  }
});

test('activities: packageSpots is deterministic per rng', () => {
  const rngA = () => 0.25;
  const rngB = () => 0.25;
  assert.deepEqual(packageSpots(rngA, 20), packageSpots(rngB, 20));
  assert.equal(packageSpots(rngA, 20).length, 20);
});

test('activities: init prefers the world package spots', () => {
  const G = makeG();
  G.world = {
    packageSpots: Array.from({ length: 30 }, (_, i) => ({ x: i * 10, z: i * 5 })),
  };
  const a = init(G);
  assert.equal(a.packages.length, 20);
  assert.equal(a.packages[0].x, 0);
  assert.equal(a.packages[19].x, 190);
  assert.ok(a.packages.every((p) => !p.found));
});

test('activities: walking over a package collects it', () => {
  const G = makeG();
  initPlayer(G);
  const a = init(G);
  const pkg = a.packages[0];
  G.player.pos.x = pkg.x;
  G.player.pos.z = pkg.z;
  G.player.x = pkg.x;
  G.player.z = pkg.z;
  const money0 = G.player.money;
  update(G, 1 / 60);
  assert.equal(pkg.found, true);
  assert.equal(a.packagesFound, 1);
  assert.equal(G.player.money, money0 + 250);
});

test('activities: taxi fare starts, picks up, and pays on delivery', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  initPeds(G);
  const a = init(G);
  const car = G.vehicles.spawn({ x: 0, z: 0, heading: 0, kind: 'sedan' });
  G.player.enterVehicle(car);
  // Put a ped next to the car so a fare can start.
  const ped = G.peds.list[0];
  ped.pos.x = 2;
  ped.pos.z = 2;
  assert.equal(a.startTaxi(), true);
  assert.equal(a.taxi.active, true);
  assert.equal(a.taxi.stage, 'pickup');
  // The passenger walks to the car.
  for (let i = 0; i < 300 && a.taxi.stage === 'pickup'; i++) update(G, 1 / 60);
  assert.equal(a.taxi.stage, 'dropoff');
  // Drive to the destination.
  const money0 = G.player.money;
  car.pos.x = a.taxi.destination.x;
  car.pos.z = a.taxi.destination.z;
  update(G, 1 / 60);
  assert.equal(a.taxi.active, false);
  assert.equal(a.taxiDone, 1);
  assert.ok(G.player.money > money0, 'fare paid');
});

test('activities: race finishes and pays the winner', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const a = init(G);
  const car = G.vehicles.spawn({ x: 144, z: 72, heading: 0, kind: 'sedan' });
  G.player.enterVehicle(car);
  assert.equal(a.startRace('harbor'), true);
  const race = a.race;
  assert.equal(race.laps, 3);
  // Teleport through every checkpoint of every lap.
  const money0 = G.player.money;
  for (let lap = 0; lap < 3; lap++) {
    for (const cp of race.checkpoints) {
      car.pos.x = cp.x;
      car.pos.z = cp.z;
      update(G, 1 / 60);
      if (!a.race) break;
    }
    if (!a.race) break;
  }
  assert.equal(a.race, null, 'race finished');
  assert.equal(a.racesWon, 1, 'player won (rival is slower)');
  assert.ok(G.player.money >= money0 + 800);
});

test('activities: race cannot start on foot or twice', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const a = init(G);
  assert.equal(a.startRace('harbor'), false, 'on foot');
  const car = G.vehicles.spawn({ x: 0, z: 0, heading: 0, kind: 'sedan' });
  G.player.enterVehicle(car);
  assert.equal(a.startRace('harbor'), true);
  assert.equal(a.startRace('downtown'), false, 'already racing');
});

test('activities: every package spot is reachable (outside buildings, off roads)', () => {
  const G = makeG();
  world.init(G);
  initPlayer(G);
  const a = init(G);
  assert.equal(a.packages.length, 20);
  const distToSegment = (x, z, r) => {
    const abx = r.bx - r.ax;
    const abz = r.bz - r.az;
    const len2 = abx * abx + abz * abz;
    let t = len2 === 0 ? 0 : ((x - r.ax) * abx + (z - r.az) * abz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(x - (r.ax + abx * t), z - (r.az + abz * t));
  };
  for (const pkg of a.packages) {
    for (const b of G.world.buildings) {
      const inside = pkg.x >= b.minX - 1 && pkg.x <= b.maxX + 1
        && pkg.z >= b.minZ - 1 && pkg.z <= b.maxZ + 1;
      assert.ok(!inside, `package (${pkg.x}, ${pkg.z}) inside ${b.name}`);
    }
    for (const r of G.world.roads) {
      assert.ok(distToSegment(pkg.x, pkg.z, r) >= 7, `package (${pkg.x}, ${pkg.z}) on a road`);
    }
  }
});

test('activities: few world spots still top up to 20 packages', () => {
  const G = makeG();
  G.world = {
    packageSpots: [{ x: 0, z: 0 }, { x: 10, z: 5 }, { x: 20, z: 10 }],
    buildings: [],
    roads: [],
  };
  const a = init(G);
  assert.equal(a.packages.length, 20);
  assert.equal(a.packages[0].x, 0);
  assert.equal(a.packages[2].x, 20);
});
