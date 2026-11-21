import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as police from '../game/src/police.js';
import * as vehicles from '../game/src/vehicles.js';
import * as player from '../game/src/player.js';
import { makeG } from './helpers.mjs';

function bootedG() {
  const G = makeG();
  vehicles.init(G);
  player.init(G);
  police.init(G);
  return G;
}

describe('wantedFromHeat', () => {
  it('maps heat to stars at the documented thresholds', () => {
    assert.equal(police.wantedFromHeat(0), 0);
    assert.equal(police.wantedFromHeat(11), 0);
    assert.equal(police.wantedFromHeat(12), 1);
    assert.equal(police.wantedFromHeat(29), 1);
    assert.equal(police.wantedFromHeat(30), 2);
    assert.equal(police.wantedFromHeat(50), 3);
    assert.equal(police.wantedFromHeat(70), 4);
    assert.equal(police.wantedFromHeat(90), 5);
    assert.equal(police.wantedFromHeat(100), 5);
    assert.equal(police.wantedFromHeat(500), 5);
  });
});

describe('heatForWanted', () => {
  it('returns the threshold heat for each level', () => {
    assert.equal(police.heatForWanted(0), 0);
    assert.equal(police.heatForWanted(1), 12);
    assert.equal(police.heatForWanted(3), 50);
    assert.equal(police.heatForWanted(5), 90);
  });
  it('clamps out-of-range levels', () => {
    assert.equal(police.heatForWanted(99), 90);
    assert.equal(police.heatForWanted(-3), 0);
  });
});

describe('decayStep', () => {
  it('bleeds heat linearly and never below zero', () => {
    assert.equal(police.decayStep(50, 10, 3), 20);
    assert.equal(police.decayStep(5, 10, 3), 0);
    assert.equal(police.decayStep(0, 1, 3), 0);
  });
});

describe('spawnCountForWanted', () => {
  it('escalates pursuit cars with the stars', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(police.spawnCountForWanted), [0, 1, 2, 3, 4, 6]);
  });
  it('clamps bad levels', () => {
    assert.equal(police.spawnCountForWanted(99), 6);
    assert.equal(police.spawnCountForWanted(-1), 0);
  });
});

describe('chaseDrive', () => {
  it('steers toward the target', () => {
    const car = { pos: { x: 0, z: 0 }, heading: 0 };
    const d = police.chaseDrive(car, { x: 10, z: 0 });
    assert.ok(d.steer > 0);
    assert.equal(d.throttle, 1);
  });
  it('slows down when close to the target', () => {
    const car = { pos: { x: 0, z: 0 }, heading: 0 };
    const d = police.chaseDrive(car, { x: 0, z: -3 });
    assert.equal(d.throttle, 0.4);
  });
  it('drives straight when already aimed', () => {
    const car = { pos: { x: 0, z: 0 }, heading: 0 };
    const d = police.chaseDrive(car, { x: 0, z: -50 });
    assert.ok(Math.abs(d.steer) < 0.01);
    assert.equal(d.throttle, 1);
  });
});

describe('bustProgressStep', () => {
  it('builds while pinned and decays otherwise', () => {
    assert.equal(police.bustProgressStep(1, true, 0.5), 1.5);
    assert.equal(police.bustProgressStep(1, false, 0.5), 0.25);
    assert.equal(police.bustProgressStep(0.1, false, 0.5), 0);
  });
});

describe('heat API', () => {
  it('addHeat raises the wanted level and emits once per star gained', () => {
    const G = bootedG();
    assert.equal(police.addHeat(G, 10, 'test'), 0);
    assert.equal(police.addHeat(G, 10, 'test'), 1);
    assert.equal(G.police.wanted, 1);
    assert.equal(G.events.emitted.filter((e) => e.type === 'wanted').length, 1);
  });
  it('addHeat caps at 100 heat / 5 stars', () => {
    const G = bootedG();
    police.addHeat(G, 500, 'test');
    assert.equal(G.police.heat, 100);
    assert.equal(G.police.wanted, 5);
  });
  it('setWanted jumps straight to a level', () => {
    const G = bootedG();
    assert.equal(police.setWanted(G, 3), 3);
    assert.equal(G.police.heat, 50);
    assert.equal(police.setWanted(G, 0), 0);
  });
  it('clearWanted resets heat, stars and bust progress', () => {
    const G = bootedG();
    police.setWanted(G, 4);
    G.police.bustProgress = 2;
    police.clearWanted(G);
    assert.equal(G.police.wanted, 0);
    assert.equal(G.police.heat, 0);
    assert.equal(G.police.bustProgress, 0);
  });
  it('spawnPursuit spawns the right number of police cars', () => {
    const G = bootedG();
    const cars = police.spawnPursuit(G, { x: 0, z: 0 }, 3);
    assert.equal(cars.length, 3);
    assert.ok(cars.every((c) => c.model === 'police'));
    assert.equal(G.police.cars.length, 3);
  });
});

describe('police update', () => {
  it('decays heat only after the crime cooldown', () => {
    const G = bootedG();
    police.setWanted(G, 2);
    G.police.lastCrimeAt = 0;
    G.time.t = 1;
    police.update(G, 1);
    assert.equal(G.police.heat, 30); // still inside the 6 s cooldown
    G.time.t = 10;
    police.update(G, 1);
    assert.ok(G.police.heat < 30);
  });
  it('drops a star when heat decays past a threshold', () => {
    const G = bootedG();
    police.setWanted(G, 2);
    G.police.lastCrimeAt = -100;
    G.time.t = 0;
    for (let i = 0; i < 20; i++) {
      police.update(G, 1);
      G.time.t += 1;
    }
    assert.ok(G.police.wanted < 2);
  });
  it('spawns pursuit cars up to the wanted strength', () => {
    const G = bootedG();
    police.setWanted(G, 3);
    for (let i = 0; i < 10; i++) {
      police.update(G, 0.5);
      G.time.t += 0.5;
    }
    assert.ok(G.police.cars.length > 0);
    assert.ok(G.police.cars.length <= 3);
  });
  it('despawns the pursuit when the heat is gone', () => {
    const G = bootedG();
    police.setWanted(G, 2);
    police.update(G, 0.5);
    assert.ok(G.police.cars.length > 0);
    police.clearWanted(G);
    police.update(G, 0.5);
    assert.equal(G.police.cars.length, 0);
  });
  it('busts a slow player on foot — emitting only, never setting state', () => {
    const G = bootedG();
    police.setWanted(G, 1);
    const car = G.police.cars[0] ?? police.spawnPursuit(G, G.player.pos, 1)[0];
    car.pos.x = G.player.pos.x + 1;
    car.pos.z = G.player.pos.z;
    car.speed = 0;
    G.player.onFoot = true;
    for (let i = 0; i < 40; i++) {
      police.update(G, 0.1);
      G.time.t += 0.1;
      if (G.events.emitted.some((e) => e.type === 'busted')) break;
    }
    assert.ok(G.events.emitted.some((e) => e.type === 'busted'));
    assert.equal(G.state, 'playing'); // main.js owns the transition
    assert.equal(G.police.wanted, 0);
  });
  it('bust progress decays when the player drives away', () => {
    const G = bootedG();
    police.setWanted(G, 1);
    G.police.bustProgress = 1;
    police.update(G, 1);
    assert.ok(G.police.bustProgress < 1);
  });
  it('does not run when the game is not playing', () => {
    const G = bootedG();
    police.setWanted(G, 3);
    G.state = 'paused';
    police.update(G, 1);
    assert.equal(G.police.cars.length, 0);
  });
});
