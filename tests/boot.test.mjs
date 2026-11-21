import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as player from '../game/src/player.js';
import * as vehicles from '../game/src/vehicles.js';
import * as traffic from '../game/src/traffic.js';
import * as peds from '../game/src/peds.js';
import * as police from '../game/src/police.js';
import * as missions from '../game/src/missions.js';
import * as combat from '../game/src/combat.js';
import * as hud from '../game/src/hud.js';
import * as activities from '../game/src/activities.js';
import * as story from '../game/src/story.js';
import {
  makeG, wireMainEffects, installThreeStub, uninstallThreeStub,
  installDocumentStub, uninstallDocumentStub,
} from './helpers.mjs';

const MODULES = [player, vehicles, traffic, peds, police, missions, combat, hud, activities, story];

// The main loop's update order (main.js frame()).
function tick(G, dt) {
  for (const mod of MODULES) mod.update(G, dt);
  G.time.t += dt;
}

function assertFiniteWorld(G) {
  assert.ok(Number.isFinite(G.player.pos.x) && Number.isFinite(G.player.pos.z), 'player pos NaN');
  assert.ok(Number.isFinite(G.health) && Number.isFinite(G.money), 'health/money NaN');
  for (const v of G.vehicles.list) {
    assert.ok(Number.isFinite(v.pos.x) && Number.isFinite(v.pos.z), 'vehicle pos NaN');
    assert.ok(Number.isFinite(v.speed), 'vehicle speed NaN');
  }
  for (const ped of G.peds.list) {
    assert.ok(Number.isFinite(ped.pos.x) && Number.isFinite(ped.pos.z), 'ped pos NaN');
  }
}

// Move Rook — and the car he is driving, if any — to a point. (While
// driving, player.update copies the car position every tick, so moving
// the player alone would be undone at once.)
function teleportTo(G, x, z) {
  const pv = G.vehicles ? G.vehicles.playerVehicle : null;
  if (pv) {
    pv.pos.x = x;
    pv.pos.z = z;
    pv.speed = 0;
  }
  G.player.pos.x = x;
  G.player.pos.z = z;
}

describe('full boot (stub THREE + stub DOM)', () => {
  it('inits all modules in main.js order and runs 600 ticks without throwing', () => {
    installThreeStub();
    const doc = installDocumentStub();
    try {
      const G = makeG();
      wireMainEffects(G);
      for (const mod of MODULES) mod.init(G);

      assert.ok(G.player.pos);
      assert.ok(G.vehicles.list.length >= 14, 'parked cars spawned');
      assert.ok(G.peds.list.length > 0, 'peds spawned');
      assert.equal(G.state, 'playing');

      const dt = 1 / 60;
      // Walk for a while.
      G.input.keys = { KeyW: true };
      for (let i = 0; i < 60; i++) tick(G, dt);
      const walked = Math.hypot(G.player.pos.x + 42, G.player.pos.z + 32);
      assert.ok(walked > 1, 'player walked');

      // Steal the nearest car with E, then drive.
      const car = player.nearestVehicle(G, 200) ?? G.vehicles.list[0];
      G.player.pos.x = car.pos.x + 1;
      G.player.pos.z = car.pos.z;
      G.input.keys = {};
      G.input.justPressed = { KeyE: true };
      tick(G, dt);
      G.input.justPressed = {};
      assert.equal(G.player.onFoot, false);
      assert.ok(G.vehicles.playerVehicle, 'player has a car');

      G.input.keys = { KeyW: true };
      for (let i = 0; i < 180; i++) tick(G, dt);
      assert.ok(G.stats.distanceDriven > 5, 'car drove');
      assert.ok(G.traffic.cars.length > 0, 'traffic spawned');
      assertFiniteWorld(G);

      // Mission 1: already in a car, so drive to the garage.
      missions.startMission(G, 1);
      assert.equal(G.missions.current, 1);
      const g = missions.landmark(G, 'garage');
      teleportTo(G, g.x, g.z);
      for (let i = 0; i < 10; i++) tick(G, dt);
      assert.ok(G.missions.done.has(1), 'mission 1 completed');
      assert.ok(G.money > 500, 'mission reward paid');

      // Wanted: police spawn and chase.
      police.setWanted(G, 2);
      for (let i = 0; i < 120; i++) tick(G, dt);
      assert.ok(G.police.cars.length > 0, 'police pursuit spawned');
      assertFiniteWorld(G);

      // Combat: stop the car, aim it north, spawn an enemy ahead, shoot.
      G.input.keys = {};
      const pv = G.vehicles.playerVehicle;
      pv.heading = 0;
      pv.speed = 0;
      const e = combat.spawnEnemy(G, pv.pos.x, pv.pos.z - 8);
      G.input.mouseDown = true;
      for (let i = 0; i < 60; i++) tick(G, dt);
      G.input.mouseDown = false;
      assert.ok(e.health < 60, 'enemy took fire');
      assert.ok(G.combat.ammo < 12, 'ammo spent');

      // Taxi: a passenger nearby, drive to pickup and dropoff.
      peds.spawnPed(G, G.player.pos.x + 3, G.player.pos.z);
      G.input.justPressed = { KeyT: true };
      tick(G, dt);
      G.input.justPressed = {};
      assert.equal(G.activities.taxi.active, true);
      const pickup = G.activities.taxi.pickup;
      teleportTo(G, pickup.x, pickup.z);
      for (let i = 0; i < 5; i++) tick(G, dt);
      assert.equal(G.activities.taxi.stage, 'dropoff');
      const drop = G.activities.taxi.dropoff;
      teleportTo(G, drop.x, drop.z);
      for (let i = 0; i < 5; i++) tick(G, dt);
      assert.equal(G.activities.taxi.active, false);
      assert.equal(G.activities.taxiDone, 1);

      // A race: start downtown, run the checkpoints.
      assert.equal(activities.startRace(G, 'downtown'), true);
      const race = G.activities.race;
      for (let lap = 0; lap < 3; lap++) {
        for (let cp = 0; cp < 4; cp++) {
          const point = race.cps[race.cp];
          teleportTo(G, point.x, point.z);
          tick(G, 0.5);
        }
      }
      assert.equal(G.activities.race.active, false);
      assert.equal(G.activities.racesWon, 1);

      // Keep ticking to 600 total ticks.
      const totalTicks = 60 + 1 + 180 + 10 + 120 + 60 + 1 + 5 + 5 + 12;
      for (let i = totalTicks; i < 600; i++) tick(G, dt);
      assertFiniteWorld(G);
      assert.equal(doc.elements.money.textContent, `$${G.money.toLocaleString('en-US')}`);
      assert.ok(G.scene.added.length > 0, 'meshes added to the scene');
    } finally {
      uninstallDocumentStub();
      uninstallThreeStub();
    }
  });

  it('survives a bust and a retry without throwing', () => {
    installThreeStub();
    installDocumentStub();
    try {
      const G = makeG();
      wireMainEffects(G);
      for (const mod of MODULES) mod.init(G);
      const dt = 1 / 60;
      police.setWanted(G, 1);
      const car = police.spawnPursuit(G, G.player.pos, 1)[0];
      let busted = false;
      for (let i = 0; i < 600; i++) {
        // Keep the cop pinned on Rook (it caught him — no escape).
        car.pos.x = G.player.pos.x + 1;
        car.pos.z = G.player.pos.z;
        car.speed = 0;
        tick(G, dt);
        if (G.state === 'busted') { busted = true; break; }
      }
      assert.ok(busted, 'player got busted');
      // Retry (mirrors main.js retryAfterEnd).
      G.health = 100;
      G.state = 'playing';
      G.player.onFoot = true;
      G.player.vehicle = null;
      for (let i = 0; i < 120; i++) tick(G, dt);
      assertFiniteWorld(G);
    } finally {
      uninstallDocumentStub();
      uninstallThreeStub();
    }
  });

  it('survives being wasted and keeps ticking', () => {
    installThreeStub();
    installDocumentStub();
    try {
      const G = makeG();
      wireMainEffects(G);
      for (const mod of MODULES) mod.init(G);
      const dt = 1 / 60;
      combat.applyDamageToPlayer(G, 999, 'test');
      assert.equal(G.state, 'wasted');
      for (let i = 0; i < 60; i++) tick(G, dt);
      assertFiniteWorld(G);
    } finally {
      uninstallDocumentStub();
      uninstallThreeStub();
    }
  });
});

describe('logic-only boot (no THREE, no document)', () => {
  it('inits and runs 600 ticks with no browser globals at all', () => {
    assert.equal(typeof globalThis.THREE, 'undefined');
    assert.equal(typeof globalThis.document, 'undefined');
    const G = makeG();
    wireMainEffects(G);
    for (const mod of MODULES) mod.init(G);
    const dt = 1 / 60;
    G.input.keys = { KeyW: true };
    for (let i = 0; i < 600; i++) {
      tick(G, dt);
      if (i === 300) {
        G.input.keys = {};
        missions.startMission(G, 1);
      }
    }
    assertFiniteWorld(G);
    assert.ok(G.traffic.cars.length > 0);
  });

  it('menu-state ticks are harmless', () => {
    const G = makeG({ state: 'menu' });
    for (const mod of MODULES) mod.init(G);
    for (let i = 0; i < 120; i++) tick(G, 1 / 60);
    assertFiniteWorld(G);
  });

  it('shots-style staging works: giveCar + setWanted + spawnPursuit', () => {
    installThreeStub();
    installDocumentStub();
    try {
      const G = makeG();
      wireMainEffects(G);
      for (const mod of MODULES) mod.init(G);
      // Chase shot: red car, 3 stars, traffic, objective override.
      const car = G.vehicles.spawn({ x: 0, z: 0, heading: 0, color: 0xc03028, parked: false });
      G.vehicles.enter(car);
      assert.equal(G.player.onFoot, false);
      G.police.setWanted(3);
      assert.equal(G.police.wanted, 3);
      const pursuit = G.police.spawnPursuit(G.player.pos, 3);
      assert.equal(pursuit.length, 3);
      G.traffic.spawnNear(0, 0, 40);
      G.peds.spawnNear(0, 0, 25);
      missions.startMission(G, 1);
      G.missions.setWaypoint(-134, 120, 'Mara’s Garage');
      assert.equal(G.missions.active.data.waypoint.x, -134);
      G.hud.setObjective('Mission 1 — First Wheels: drive to Mara’s Garage');
      for (let i = 0; i < 120; i++) tick(G, 1 / 60);
      assertFiniteWorld(G);
    } finally {
      uninstallDocumentStub();
      uninstallThreeStub();
    }
  });
});
