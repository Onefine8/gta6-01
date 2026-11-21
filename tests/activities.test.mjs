import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as activities from '../game/src/activities.js';
import * as vehicles from '../game/src/vehicles.js';
import * as player from '../game/src/player.js';
import * as peds from '../game/src/peds.js';
import { makeG } from './helpers.mjs';

function bootedG() {
  const G = makeG();
  vehicles.init(G);
  player.init(G);
  peds.init(G);
  activities.init(G);
  G.hud = { showMessage: () => {} };
  return G;
}

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = activities.mulberry32(7);
    const b = activities.mulberry32(7);
    for (let i = 0; i < 20; i++) assert.equal(a(), b());
  });
  it('differs between seeds', () => {
    const a = activities.mulberry32(7);
    const b = activities.mulberry32(8);
    assert.notEqual(a(), b());
  });
  it('stays in [0, 1)', () => {
    const r = activities.mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1);
    }
  });
});

describe('packageSpots', () => {
  it('returns the requested count, deterministic per seed', () => {
    const a = activities.packageSpots(7, 20);
    const b = activities.packageSpots(7, 20);
    assert.equal(a.length, 20);
    assert.deepEqual(a, b);
    assert.ok(a.every((s) => s.found === false));
  });
  it('differs between seeds', () => {
    const a = activities.packageSpots(7, 20);
    const b = activities.packageSpots(8, 20);
    assert.notDeepEqual(a, b);
  });
});

describe('taxiFare', () => {
  it('charges base plus per-metre', () => {
    assert.equal(activities.taxiFare(0), 20);
    assert.equal(activities.taxiFare(100), 35);
    assert.equal(activities.taxiFare(100, { taxiBase: 60, taxiPerM: 0.9 }), 150);
  });
});

describe('raceCheckpoints and formatRaceTime', () => {
  it('builds four checkpoints around the circuit centre', () => {
    const cps = activities.raceCheckpoints(activities.CIRCUITS.downtown);
    assert.equal(cps.length, 4);
    assert.deepEqual(cps[0], { x: 110, z: 0 });
  });
  it('formats race times', () => {
    assert.equal(activities.formatRaceTime(75.25), '1:15.25');
    assert.equal(activities.formatRaceTime(9.5), '0:09.50');
    assert.equal(activities.formatRaceTime(null), '--:--.--');
  });
});

describe('economy', () => {
  it('reads G.cfg.ECONOMY when present', () => {
    const e = activities.economy(makeG());
    assert.equal(e.taxiBase, 60);
    assert.equal(e.taxiPerM, 0.9);
    assert.equal(e.packageReward, 250);
    assert.equal(e.raceReward, 1500);
  });
  it('falls back without cfg', () => {
    const e = activities.economy({});
    assert.equal(e.taxiBase, activities.TAXI_BASE_FARE);
  });
});

describe('taxi', () => {
  it('refuses without a car', () => {
    const G = bootedG();
    assert.equal(activities.startTaxi(G), false);
    assert.equal(G.activities.taxi.active, false);
  });
  it('refuses with no passengers nearby', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    player.tryEnterExitVehicle(G);
    G.peds.list.length = 0;
    assert.equal(activities.startTaxi(G), false);
  });
  it('picks the nearest pedestrian as passenger', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    player.tryEnterExitVehicle(G);
    peds.spawnPed(G, car.pos.x + 5, car.pos.z + 2);
    assert.equal(activities.startTaxi(G), true);
    assert.equal(G.activities.taxi.active, true);
    assert.equal(G.activities.taxi.stage, 'pickup');
    assert.ok(G.activities.taxi.passenger);
  });
  it('completes pickup and dropoff and pays the fare', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    player.tryEnterExitVehicle(G);
    peds.spawnPed(G, car.pos.x + 5, car.pos.z + 2);
    activities.startTaxi(G);
    const moneyBefore = G.money;
    // Drive to the passenger.
    const pickup = G.activities.taxi.pickup;
    G.player.pos.x = pickup.x;
    G.player.pos.z = pickup.z;
    activities.update(G, 0.1);
    assert.equal(G.activities.taxi.stage, 'dropoff');
    assert.ok(G.activities.taxi.fare > 0);
    // Drive to the destination.
    const drop = G.activities.taxi.dropoff;
    G.player.pos.x = drop.x;
    G.player.pos.z = drop.z;
    activities.update(G, 0.1);
    assert.equal(G.activities.taxi.active, false);
    assert.ok(G.money > moneyBefore);
    assert.equal(G.activities.taxiDone, 1);
  });
  it('cancels when the driver leaves the car', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    player.tryEnterExitVehicle(G);
    peds.spawnPed(G, car.pos.x + 5, car.pos.z + 2);
    activities.startTaxi(G);
    player.tryEnterExitVehicle(G); // step out
    activities.update(G, 0.1);
    assert.equal(G.activities.taxi.active, false);
  });
  it('starts on justPressed T', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    player.tryEnterExitVehicle(G);
    peds.spawnPed(G, car.pos.x + 5, car.pos.z + 2);
    G.input.justPressed = { KeyT: true };
    activities.update(G, 0.1);
    assert.equal(G.activities.taxi.active, true);
  });
});

describe('races', () => {
  function racingG() {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    player.tryEnterExitVehicle(G);
    return G;
  }
  it('refuses without a car', () => {
    const G = bootedG();
    assert.equal(activities.startRace(G, 'downtown'), false);
  });
  it('refuses an unknown circuit', () => {
    const G = racingG();
    assert.equal(activities.startRace(G, 'nowhere'), false);
  });
  it('starts a race and tracks checkpoints', () => {
    const G = racingG();
    assert.equal(activities.startRace(G, 'downtown'), true);
    assert.equal(G.activities.race.active, true);
    assert.equal(G.activities.race.laps, 3);
    assert.equal(G.activities.race.cps.length, 4);
  });
  it('finishes after all laps and pays the prize', () => {
    const G = racingG();
    activities.startRace(G, 'harbor'); // 2 laps
    const moneyBefore = G.money;
    const race = G.activities.race;
    for (let lap = 0; lap < 2; lap++) {
      for (let cp = 0; cp < 4; cp++) {
        const point = race.cps[race.cp];
        G.player.pos.x = point.x;
        G.player.pos.z = point.z;
        activities.update(G, 0.5);
      }
    }
    assert.equal(G.activities.race.active, false);
    assert.ok(G.money >= moneyBefore + 1500);
    assert.equal(G.activities.racesWon, 1);
    assert.ok(G.activities.races.harbor.best != null);
  });
  it('records a better best time on a faster rerun', () => {
    const G = racingG();
    G.activities.races.harbor.best = 100;
    activities.startRace(G, 'harbor');
    const race = G.activities.race;
    for (let lap = 0; lap < 2; lap++) {
      for (let cp = 0; cp < 4; cp++) {
        const point = race.cps[race.cp];
        G.player.pos.x = point.x;
        G.player.pos.z = point.z;
        activities.update(G, 0.1);
      }
    }
    assert.ok(G.activities.races.harbor.best < 100);
  });
});

describe('hidden packages', () => {
  it('collects a package on contact and pays the reward', () => {
    const G = bootedG();
    const spot = G.activities.packages.spots[0];
    const moneyBefore = G.money;
    G.player.pos.x = spot.x;
    G.player.pos.z = spot.z;
    activities.update(G, 0.1);
    assert.equal(spot.found, true);
    assert.equal(G.activities.packages.found, 1);
    assert.ok(G.activities.packagesFound.has(0));
    assert.equal(G.money, moneyBefore + 250);
  });
  it('does not pay twice for the same package', () => {
    const G = bootedG();
    const spot = G.activities.packages.spots[0];
    G.player.pos.x = spot.x;
    G.player.pos.z = spot.z;
    activities.update(G, 0.1);
    const moneyAfterFirst = G.money;
    activities.update(G, 0.1);
    assert.equal(G.money, moneyAfterFirst);
  });
  it('pays the 10-package bonus', () => {
    const G = bootedG();
    for (let i = 0; i < 9; i++) {
      G.activities.packages.spots[i].found = true;
      G.activities.packagesFound.add(i);
    }
    G.activities.packages.found = 9;
    const spot = G.activities.packages.spots[9];
    const moneyBefore = G.money;
    G.player.pos.x = spot.x;
    G.player.pos.z = spot.z;
    activities.update(G, 0.1);
    // Snapped spots can coincide, so a second package may come along:
    // assert at-least, not exact.
    assert.ok(G.activities.packages.found >= 10);
    assert.ok(G.money >= moneyBefore + 250 + 500);
  });
  it('syncs found packages from a loaded save on first update', () => {
    const G = bootedG();
    G.activities.packagesFound.add(3);
    G.activities.packagesFound.add(4);
    activities.update(G, 0.1);
    assert.equal(G.activities.packages.spots[3].found, true);
    assert.equal(G.activities.packages.spots[4].found, true);
    assert.equal(G.activities.packages.found, 2);
  });
  it('does not run when the game is not playing', () => {
    const G = bootedG();
    G.state = 'menu';
    const spot = G.activities.packages.spots[0];
    G.player.pos.x = spot.x;
    G.player.pos.z = spot.z;
    activities.update(G, 0.1);
    assert.equal(spot.found, false);
  });
});
