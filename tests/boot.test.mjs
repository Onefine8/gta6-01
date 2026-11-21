// Boot test: the real world module plus every gameplay module, wired the
// way main.js wires them, running 600 ticks (10 seconds) with scripted
// input — walk, steal a car, drive, run a mission, take heat. Nothing may
// throw, and the world must visibly change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installThreeStub, installDomStub, makeG } from './helpers.mjs';

installThreeStub();
installDomStub();

import * as world from '../game/src/world.js';
import * as player from '../game/src/player.js';
import * as vehicles from '../game/src/vehicles.js';
import * as traffic from '../game/src/traffic.js';
import * as peds from '../game/src/peds.js';
import * as police from '../game/src/police.js';
import * as missions from '../game/src/missions.js';
import * as combat from '../game/src/combat.js';
import * as activities from '../game/src/activities.js';
import * as hud from '../game/src/hud.js';
import * as story from '../game/src/story.js';

const MODULES = [player, vehicles, traffic, peds, police, missions, combat, activities, hud, story];

test('boot: 600 ticks with scripted play, no throws', async () => {
  const G = makeG();
  G.state = 'playing';

  // Engine first (world builds the real city), then gameplay in loop order.
  world.init(G);
  assert.ok(G.world, 'world built');
  assert.ok(G.world.roads.length > 0, 'roads exist');
  assert.ok(G.world.buildings.length > 100, 'city has buildings');
  assert.equal(typeof G.world.collide, 'function');
  assert.equal(typeof G.world.nearestRoadPoint, 'function');
  assert.equal(typeof G.world.randomRoadPos, 'function');
  for (const m of MODULES) m.init(G);
  assert.ok(G.player.mesh, 'player mesh');
  assert.ok(G.vehicles.list.length > 0, 'cars exist');
  assert.equal(G.traffic.cars.length, 14);
  assert.equal(G.peds.list.length, 24);
  assert.equal(G.activities.packages.length, 20, 'packages from world spots');
  assert.equal(G.missions.defs.length, 8);

  const held = G.input.held;
  const tick = (dt = 1 / 60) => {
    // world.update owns the clock (G.time.t); do not advance it here too.
    for (const m of MODULES) m.update(G, dt);
    world.update(G, dt);
    // Input edge presses are cleared by main.js each frame; mimic that.
    G.input.pressed.clear();
  };

  // Phase 1 (ticks 0-119): walk forward with W.
  held.add('KeyW');
  const z0 = G.player.pos.z;
  for (let i = 0; i < 120; i++) tick();
  assert.notEqual(G.player.pos.z, z0, 'player walked');
  assert.ok(G.player.speed > 0, 'player has speed');
  held.delete('KeyW');

  // Phase 2 (ticks 120-179): step next to a parked car and press E.
  const parked = G.vehicles.list.find((v) => v.driver === 'none');
  assert.ok(parked, 'a parked car exists');
  // Put it on the z=108 road, facing east, so the drive phase has a clear run.
  parked.pos.x = -100;
  parked.pos.z = 108;
  parked.heading = Math.PI / 2;
  G.player.pos.x = parked.pos.x + 2;
  G.player.pos.z = parked.pos.z;
  G.player.x = G.player.pos.x;
  G.player.z = G.player.pos.z;
  held.add('KeyE');
  tick();
  held.delete('KeyE');
  assert.equal(G.player.inVehicle, true, 'player entered the car');
  assert.equal(G.player.vehicle, parked);

  // Phase 3 (ticks 180-299): drive it.
  held.add('KeyW');
  const carX0 = parked.pos.x;
  const carZ0 = parked.pos.z;
  for (let i = 0; i < 120; i++) tick();
  assert.ok(Math.abs(parked.speed) > 5, `car speed=${parked.speed}`);
  assert.ok(
    Math.hypot(parked.pos.x - carX0, parked.pos.z - carZ0) > 5,
    `car moved ${Math.hypot(parked.pos.x - carX0, parked.pos.z - carZ0).toFixed(1)} m`,
  );
  held.delete('KeyW');

  // Phase 4: get out, start mission 1, drive the mission car to the garage.
  held.add('KeyE');
  tick();
  held.delete('KeyE');
  assert.equal(G.player.inVehicle, false, 'player exited the car');
  const m1 = G.missions.startMission(1);
  assert.ok(m1, 'mission 1 started');
  assert.ok(m1.waypoint, 'mission 1 has a waypoint');
  const missionCar = G.vehicles.list.find((v) => v.id === m1.data.carId);
  G.player.pos.x = missionCar.pos.x + 2;
  G.player.pos.z = missionCar.pos.z;
  G.player.x = G.player.pos.x;
  G.player.z = G.player.pos.z;
  tick(); // a frame with E released, so the edge detector re-arms
  held.add('KeyE');
  tick();
  held.delete('KeyE');
  assert.equal(G.player.vehicle, missionCar, 'player stole the mission car');
  tick();
  assert.equal(G.missions.current.stage, 1, 'mission 1 advanced to the drive stage');
  missionCar.pos.x = 0;
  missionCar.pos.z = 108;
  const moneyBefore = G.player.money;
  tick();
  assert.equal(G.missions.current, null, 'mission 1 passed');
  assert.ok(G.missions.completed.includes(1));
  assert.equal(G.player.money, moneyBefore + 500);

  // Phase 5: wanted level 2 — cops spawn and chase for the rest of the run.
  G.police.setWanted(2);
  assert.equal(G.police.wanted, 2);
  for (let i = 0; i < 180; i++) tick();
  assert.ok(G.police.cops.length >= 1, 'cops spawned');
  assert.equal(G.police.chasing, true);

  // Phase 6: combat — get out, spawn an enemy, shoot it.
  held.add('KeyE');
  tick();
  held.delete('KeyE');
  assert.equal(G.player.inVehicle, false, 'player out of the car to fight');
  const enemy = G.combat.spawnEnemy({ x: G.player.pos.x + 5, z: G.player.pos.z + 5 });
  assert.equal(G.combat.enemies.length, 1);
  G.player.heading = Math.atan2(
    enemy.pos.x - G.player.pos.x, enemy.pos.z - G.player.pos.z,
  );
  G.combat.shoot();
  assert.ok(enemy.health < enemy.maxHealth, 'shot landed');

  // Phase 7: a hidden package under the player's feet.
  const pkg = G.activities.packages.find((p) => !p.found);
  G.player.pos.x = pkg.x;
  G.player.pos.z = pkg.z;
  G.player.x = pkg.x;
  G.player.z = pkg.z;
  const foundBefore = G.activities.packagesFound;
  tick();
  assert.equal(G.activities.packagesFound, foundBefore + 1);

  // Phase 8: run the clock out to 600 ticks total.
  let ticks = 0;
  // (Count the ticks already run: 120+1+120+1+1+1+1+180+1 = ~426; top up.)
  while (ticks < 200) { tick(); ticks++; }
  assert.ok(G.time.t > 9, `clock advanced: ${G.time.t.toFixed(1)}s`);
  assert.equal(G.state, 'playing', 'game still running');
  assert.ok(G.player.health > 0, 'player alive');

  // HUD stayed in sync the whole time (no throw, values written).
  const moneyEl = document.getElementById('money');
  assert.ok(moneyEl.textContent.startsWith('$'), `money HUD: ${moneyEl.textContent}`);
  const starsEl = document.getElementById('stars');
  assert.equal(starsEl.textContent, '★★☆☆☆');
});

test('boot: world.collide pushes the player out of buildings', () => {
  const G = makeG();
  world.init(G);
  const b = G.world.buildings[0];
  const pos = { x: (b.minX + b.maxX) / 2, y: 0, z: (b.minZ + b.maxZ) / 2 };
  G.world.collide(pos, 0.6);
  const inside = pos.x > b.minX - 0.6 && pos.x < b.maxX + 0.6
    && pos.z > b.minZ - 0.6 && pos.z < b.maxZ + 0.6;
  assert.equal(inside, false, 'pushed out of the building AABB');
});

test('boot: world.nearestRoadPoint snaps to a road', () => {
  const G = makeG();
  world.init(G);
  const p = G.world.nearestRoadPoint(10, 10);
  assert.ok(p);
  assert.ok(p.dist < 40, `dist=${p.dist}`);
});
