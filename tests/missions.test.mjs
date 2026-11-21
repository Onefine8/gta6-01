// Missions: definitions, pure state-machine helpers, and the live flow
// (start -> stage -> pass/fail) with a fake G.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLACES, MISSION_DEFS, defFor, rewardFor, createMission, atWaypoint,
  advanceCheckpoint, raceFinished, init, update,
} from '../game/src/missions.js';
import { init as initPlayer } from '../game/src/player.js';
import { init as initVehicles } from '../game/src/vehicles.js';
import { init as initPolice } from '../game/src/police.js';
import { init as initCombat } from '../game/src/combat.js';
import { init as initStory } from '../game/src/story.js';
import { init as initHud } from '../game/src/hud.js';
import { installThreeStub, installDomStub, makeG } from './helpers.mjs';

installThreeStub();
installDomStub();

function bootedG() {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  initPolice(G);
  initCombat(G);
  initStory(G);
  initHud(G);
  init(G);
  return G;
}

test('missions: eight defs, in story order, rewards match config', () => {
  assert.equal(MISSION_DEFS.length, 8);
  assert.deepEqual(MISSION_DEFS.map((d) => d.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(MISSION_DEFS.map((d) => d.reward), [500, 800, 1200, 1500, 2000, 2500, 4000, 10000]);
  assert.equal(MISSION_DEFS[7].name, 'King of Meridian');
});

test('missions: defFor and rewardFor', () => {
  assert.equal(defFor(1).name, 'First Wheels');
  assert.equal(rewardFor(8), 10000);
  assert.equal(defFor(99), null);
  assert.equal(rewardFor(99), 0);
});

test('missions: places are inside the city and on/near roads', () => {
  for (const [name, p] of Object.entries(PLACES)) {
    assert.ok(Math.abs(p.x) <= 360 && Math.abs(p.z) <= 360, name);
  }
  // Garage road point sits on the x=0 road line.
  assert.equal(PLACES.garageRoad.x, 0);
  // Pier 9 sits on the harbour piers (east of the water line).
  assert.ok(PLACES.pier9.x > 320);
});

test('missions: createMission builds fresh active state', () => {
  const m = createMission(2);
  assert.equal(m.id, 2);
  assert.equal(m.status, 'active');
  assert.equal(m.stage, 0);
  assert.equal(m.timer, 240);
  assert.equal(createMission(99), null);
});

test('missions: atWaypoint is a radius check', () => {
  assert.equal(atWaypoint({ x: 0, z: 0 }, { x: 3, z: 4 }, 5), true);
  assert.equal(atWaypoint({ x: 0, z: 0 }, { x: 3, z: 4 }, 4.9), false);
  assert.equal(atWaypoint(null, { x: 0, z: 0 }, 5), false);
});

test('missions: advanceCheckpoint walks laps in order', () => {
  const race = { checkpoints: [{}, {}, {}, {}], lap: 0, checkpoint: 0 };
  let r = advanceCheckpoint(race, 0);
  assert.deepEqual([r.lap, r.checkpoint], [0, 1]);
  r = advanceCheckpoint(r, 1);
  r = advanceCheckpoint(r, 2);
  r = advanceCheckpoint(r, 3);
  assert.deepEqual([r.lap, r.checkpoint], [1, 0]);
  // Out-of-order checkpoint does nothing.
  assert.deepEqual(advanceCheckpoint(r, 2), r);
});

test('missions: raceFinished only at the final lap', () => {
  assert.equal(raceFinished({ lap: 2, checkpoint: 0 }, 3), false);
  assert.equal(raceFinished({ lap: 3, checkpoint: 0 }, 3), true);
});

test('missions: startMission sets up mission 1 with a car + waypoint', () => {
  const G = bootedG();
  const m = G.missions.startMission(1);
  assert.ok(m);
  assert.equal(m.id, 1);
  assert.ok(m.waypoint);
  const car = G.vehicles.list.find((v) => v.id === m.data.carId);
  assert.ok(car, 'mission car spawned');
  assert.equal(G.missions.currentIndex, 0);
});

test('missions: mission 1 passes when the car reaches the garage', () => {
  const G = bootedG();
  G.missions.startMission(1);
  const car = G.vehicles.list.find((v) => v.id === G.missions.current.data.carId);
  G.player.enterVehicle(car);
  update(G, 1 / 60); // stage 0 -> 1 (in a car)
  assert.equal(G.missions.current.stage, 1);
  car.pos.x = 0;
  car.pos.z = 108; // the garage road point
  const money0 = G.player.money;
  update(G, 1 / 60);
  assert.equal(G.missions.current, null);
  assert.ok(G.missions.completed.includes(1));
  assert.equal(G.player.money, money0 + 500);
  assert.equal(G.missions.unlocked, 2);
});

test('missions: cannot start a locked or already-running mission', () => {
  const G = bootedG();
  assert.equal(G.missions.startMission(3), null, 'mission 3 locked');
  assert.ok(G.missions.startMission(1));
  assert.equal(G.missions.startMission(2), null, 'one mission at a time');
  assert.equal(G.missions.startMission(1), null, 'already running');
});

test('missions: mission 2 fails when the timer runs out', () => {
  const G = bootedG();
  G.missions.unlocked = 2; // mission 1 cleared in an earlier run
  G.missions.startMission(2);
  for (let i = 0; i < 60 * 241; i++) {
    update(G, 1 / 60);
    if (!G.missions.current) break;
  }
  assert.equal(G.missions.current, null);
  assert.ok(!G.missions.completed.includes(2), 'not completed');
  // Retry stays open.
  assert.ok(G.missions.startMission(2));
});

test('missions: mission 2 delivery advances the drop counter', () => {
  const G = bootedG();
  G.missions.unlocked = 2;
  G.missions.startMission(2);
  const m = G.missions.current;
  G.player.pos.x = 144;
  G.player.pos.z = -144;
  G.player.x = 144;
  G.player.z = -144;
  update(G, 1 / 60);
  assert.equal(m.data.dropIndex, 1);
  assert.deepEqual([m.waypoint.x, m.waypoint.z], [-144, 144]);
});

test('missions: mission 3 passes after surviving 60 seconds', () => {
  const G = bootedG();
  G.missions.unlocked = 3;
  G.missions.startMission(3);
  assert.equal(G.police.wanted, 2, 'mission 3 starts at 2 stars');
  for (let i = 0; i < 60 * 61; i++) {
    G.time.t += 1 / 60;
    update(G, 1 / 60);
    if (!G.missions.current) break;
  }
  assert.ok(G.missions.completed.includes(3));
  assert.equal(G.police.wanted, 0, 'heat cleared on pass');
});

test('missions: mission 4 spawns the crew at Pier 9 and passes on clear', () => {
  const G = bootedG();
  G.missions.unlocked = 4;
  G.missions.startMission(4);
  G.player.pos.x = 340;
  G.player.pos.z = 30;
  G.player.x = 340;
  G.player.z = 30;
  update(G, 1 / 60);
  assert.equal(G.missions.current.stage, 1);
  assert.equal(G.combat.enemies.length, 6);
  // Kill them all (damageEnemy drops them).
  for (const e of [...G.combat.enemies]) G.combat.damageEnemy(e, 999);
  update(G, 1 / 60);
  assert.ok(G.missions.completed.includes(4));
});

test('missions: reset clears progress for a fresh game', () => {
  const G = bootedG();
  G.missions.startMission(1);
  G.missions.passMission();
  assert.ok(G.missions.completed.includes(1));
  G.missions.reset();
  assert.deepEqual(G.missions.completed, []);
  assert.equal(G.missions.current, null);
  assert.equal(G.missions.unlocked, 1);
});

test('missions: onPlayerDown fails the active mission', () => {
  const G = bootedG();
  G.missions.startMission(1);
  G.missions.onPlayerDown('busted');
  assert.equal(G.missions.current, null);
  assert.ok(!G.missions.completed.includes(1));
});

test('missions: start(index) alias maps 0 -> mission 1 (shots.js)', () => {
  const G = bootedG();
  const m = G.missions.start(0);
  assert.ok(m);
  assert.equal(m.id, 1);
});

test('missions: pass/fail emit the event names main.js listens for', () => {
  const G = bootedG();
  const seen = [];
  G.events.on('mission-complete', (d) => seen.push(['complete', d.id]));
  G.events.on('mission-failed', (d) => seen.push(['failed', d.id]));
  G.events.on('mission-passed', () => seen.push(['passed']));
  G.missions.startMission(1);
  G.missions.passMission();
  assert.deepEqual(seen, [['complete', 1]]);
  G.missions.startMission(2);
  G.missions.failMission('timeout');
  assert.deepEqual(seen, [['complete', 1], ['failed', 2]]);
});
