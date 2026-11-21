// Police: wanted math (pure) and the pursuit/bust/decay loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WANTED_THRESHOLDS, wantedForHeat, heatForCrime, copsForWanted,
  heatDecayRate, starsString, bustFine, init, update,
} from '../game/src/police.js';
import { init as initPlayer } from '../game/src/player.js';
import { init as initVehicles, update as vehiclesUpdate } from '../game/src/vehicles.js';
import { installThreeStub, makeG } from './helpers.mjs';

installThreeStub();

test('police: wantedForHeat follows the thresholds', () => {
  assert.equal(wantedForHeat(0), 0);
  assert.equal(wantedForHeat(11), 0);
  assert.equal(wantedForHeat(12), 1);
  assert.equal(wantedForHeat(29), 1);
  assert.equal(wantedForHeat(30), 2);
  assert.equal(wantedForHeat(52), 3);
  assert.equal(wantedForHeat(74), 4);
  assert.equal(wantedForHeat(92), 5);
  assert.equal(wantedForHeat(100), 5);
});

test('police: heatForCrime ranks crimes by severity', () => {
  assert.ok(heatForCrime('murder') > heatForCrime('theft'));
  assert.ok(heatForCrime('theft') > heatForCrime('speeding'));
  assert.equal(heatForCrime('unknown-crime'), 8);
});

test('police: copsForWanted grows with the stars', () => {
  assert.equal(copsForWanted(0), 0);
  assert.equal(copsForWanted(1), 1);
  assert.equal(copsForWanted(2), 2);
  assert.equal(copsForWanted(5), 6);
  assert.equal(copsForWanted(99), 6);
});

test('police: heat decays faster when lying low at low wanted', () => {
  assert.ok(heatDecayRate(1, 0) > heatDecayRate(4, 0));
  assert.ok(heatDecayRate(2, 10) > heatDecayRate(2, 0), 'long unseen = faster decay');
});

test('police: starsString renders filled and empty stars', () => {
  assert.equal(starsString(0), '☆☆☆☆☆');
  assert.equal(starsString(3), '★★★☆☆');
  assert.equal(starsString(5), '★★★★★');
});

test('police: bustFine grows with the wanted level', () => {
  assert.equal(bustFine(0), 0);
  assert.equal(bustFine(1), 50);
  assert.equal(bustFine(5), 1500);
  assert.ok(bustFine(4) > bustFine(3));
});

test('police: addWanted raises heat and syncs the player flag', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const pol = init(G);
  assert.equal(pol.addWanted(undefined, 'theft'), 1);
  assert.equal(pol.wanted, 1);
  assert.equal(G.player.wanted, 1);
  assert.equal(pol.addWanted(100, 'murder'), 5);
});

test('police: setWanted sets the level directly (menu/shots)', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const pol = init(G);
  assert.equal(pol.setWanted(3), 3);
  assert.equal(pol.heat, WANTED_THRESHOLDS[3]);
  assert.equal(pol.setWanted(0), 0);
  assert.equal(pol.heat, 0);
  assert.equal(pol.setWanted(99), 5, 'clamped to 5');
});

test('police: clearWanted removes cops and zeroes the heat', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const pol = init(G);
  pol.setWanted(2);
  pol.spawnCop();
  assert.ok(pol.cops.length >= 1);
  pol.clearWanted();
  assert.equal(pol.wanted, 0);
  assert.equal(pol.cops.length, 0);
});

test('police: update spawns cops to match the wanted level', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const pol = init(G);
  pol.setWanted(2);
  for (let i = 0; i < 300; i++) {
    update(G, 1 / 60);
    vehiclesUpdate(G, 1 / 60);
  }
  assert.equal(pol.cops.length, 2);
  assert.equal(pol.chasing, true);
});

test('police: cops chase — they close the distance over time', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const pol = init(G);
  pol.setWanted(1);
  // On the z=108 road, 54 m west of the player, heading straight at them —
  // a straight-line chase must not cross a city block here.
  const cop = pol.spawnCop({ x: 36, z: 108 });
  assert.ok(cop);
  const d0 = Math.hypot(cop.vehicle.pos.x - G.player.pos.x, cop.vehicle.pos.z - G.player.pos.z);
  for (let i = 0; i < 600; i++) {
    update(G, 1 / 60);
    vehiclesUpdate(G, 1 / 60);
  }
  const d1 = Math.hypot(cop.vehicle.pos.x - G.player.pos.x, cop.vehicle.pos.z - G.player.pos.z);
  assert.ok(d1 < d0, `cop closed in: ${d0.toFixed(1)} -> ${d1.toFixed(1)}`);
});

test('police: bust fires when a cop stands next to a slow player', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const pol = init(G);
  pol.setWanted(1);
  G.player.money = 1000;
  const cop = pol.spawnCop({ x: G.player.pos.x + 1, z: G.player.pos.z });
  cop.vehicle.speed = 0;
  // Hold the cop in place: it is a police car with ai, so pin it by
  // re-placing it next to the player every tick (it cannot catch up alone).
  for (let i = 0; i < 300 && G.state !== 'busted'; i++) {
    cop.vehicle.pos.x = G.player.pos.x + 1;
    cop.vehicle.pos.z = G.player.pos.z;
    cop.vehicle.speed = 0;
    update(G, 1 / 60);
  }
  assert.equal(G.state, 'busted');
  assert.ok(G.player.money < 1000, 'a fine was charged');
});

test('police: heat decays when the player lies low and unseen', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const pol = init(G);
  pol.setWanted(1);
  G.time.t = 100; // long after the crime
  pol.lastCrimeAt = 0;
  pol.unseenTimer = 20;
  const heat0 = pol.heat;
  for (let i = 0; i < 600; i++) {
    G.time.t += 1 / 60;
    update(G, 1 / 60);
  }
  assert.ok(pol.heat < heat0, `heat decayed: ${heat0} -> ${pol.heat}`);
});

test('police: a cop slows down near the player instead of orbiting', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  const pol = init(G);
  pol.setWanted(1);
  const cop = pol.spawnCop({ x: 36, z: 108 });
  for (let i = 0; i < 600; i++) {
    update(G, 1 / 60);
    vehiclesUpdate(G, 1 / 60);
    if (G.state !== 'playing') break; // busted: the cop got there
  }
  const d1 = Math.hypot(cop.vehicle.pos.x - G.player.pos.x, cop.vehicle.pos.z - G.player.pos.z);
  assert.ok(d1 < 5, `cop closed in to ${d1.toFixed(1)} m`);
  assert.ok(Math.abs(cop.vehicle.speed) < 10, `cop crept in at ${cop.vehicle.speed.toFixed(1)} m/s`);
});
