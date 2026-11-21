// Combat: weapon stats, firing cone, target picking, damage falloff,
// enemy AI and the reload cycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEAPONS, ENEMY_KINDS, weaponStats, inFiringCone, pickTarget,
  damageAtRange, init, update,
} from '../game/src/combat.js';
import { init as initPlayer } from '../game/src/player.js';
import { installThreeStub, makeG } from './helpers.mjs';

installThreeStub();

test('combat: weapon stats exist for pistol and SMG', () => {
  assert.ok(WEAPONS.pistol.damage > WEAPONS.smg.damage, 'pistol hits harder');
  assert.ok(WEAPONS.smg.rate < WEAPONS.pistol.rate, 'SMG fires faster');
  assert.equal(WEAPONS.pistol.magSize, 12);
  assert.equal(WEAPONS.smg.magSize, 30);
  assert.equal(weaponStats('nope'), WEAPONS.pistol, 'unknown weapon falls back');
});

test('combat: enemy kinds scale up to the boss', () => {
  assert.ok(ENEMY_KINDS.boss.health > ENEMY_KINDS.bruiser.health);
  assert.ok(ENEMY_KINDS.bruiser.health > ENEMY_KINDS.gunman.health);
  assert.ok(ENEMY_KINDS.boss.damage > ENEMY_KINDS.gunman.damage);
});

test('combat: inFiringCone accepts straight-ahead targets in range', () => {
  assert.equal(inFiringCone({ x: 0, z: 0 }, 0, { x: 0, z: 10 }, 60, 0.22), true);
  assert.equal(inFiringCone({ x: 0, z: 0 }, 0, { x: 0, z: 70 }, 60, 0.22), false);
  assert.equal(inFiringCone({ x: 0, z: 0 }, 0, { x: 10, z: 0 }, 60, 0.22), false);
  assert.equal(inFiringCone({ x: 0, z: 0 }, 0, { x: 0, z: -10 }, 60, 0.22), false);
});

test('combat: pickTarget takes the nearest enemy in the cone', () => {
  const enemies = [
    { pos: { x: 0, z: 20 }, health: 50 },
    { pos: { x: 0, z: 8 }, health: 50 },
    { pos: { x: 30, z: 0 }, health: 50 },
    { pos: { x: 0, z: 5 }, health: 0 },
  ];
  const t = pickTarget({ x: 0, z: 0 }, 0, enemies, 60, 0.22);
  assert.equal(t, enemies[1], 'nearest live target in the cone');
  assert.equal(pickTarget({ x: 0, z: 0 }, 0, [], 60, 0.22), null);
});

test('combat: damageAtRange falls off past half range', () => {
  assert.equal(damageAtRange(25, 10, 60), 25);
  assert.equal(damageAtRange(25, 30, 60), 25);
  const far = damageAtRange(25, 55, 60);
  assert.ok(far < 25 && far >= 1);
  assert.equal(damageAtRange(25, 60, 60), 13);
});

test('combat: spawnEnemy creates a gunman with a mesh', () => {
  const G = makeG();
  initPlayer(G);
  const c = init(G);
  const e = c.spawnEnemy({ x: 10, z: 10, kind: 'gunman' });
  assert.equal(e.health, 50);
  assert.equal(e.kind, 'gunman');
  assert.ok(e.mesh);
  assert.equal(c.enemies.length, 1);
});

test('combat: shoot hits the enemy in front and spends a round', () => {
  const G = makeG();
  initPlayer(G);
  const c = init(G);
  const e = c.spawnEnemy({ x: 0, z: 10, kind: 'gunman' });
  G.player.pos.x = 0;
  G.player.pos.z = 0;
  G.player.x = 0;
  G.player.z = 0;
  G.player.heading = 0;
  const mag0 = G.player.mag.pistol;
  assert.equal(c.shoot(), true);
  assert.equal(G.player.mag.pistol, mag0 - 1);
  assert.ok(e.health < 50, `enemy health=${e.health}`);
});

test('combat: shoot respects the fire rate', () => {
  const G = makeG();
  initPlayer(G);
  const c = init(G);
  assert.equal(c.shoot(), true);
  assert.equal(c.shoot(), false, 'still cooling down');
  for (let i = 0; i < 30; i++) update(G, 1 / 60);
  assert.equal(c.shoot(), true, 'ready again after the cooldown');
});

test('combat: empty magazine starts a reload that refills it', () => {
  const G = makeG();
  initPlayer(G);
  const c = init(G);
  G.player.mag.pistol = 1;
  G.player.ammo.pistol = 48;
  assert.equal(c.shoot(), true);
  assert.equal(G.player.mag.pistol, 0);
  assert.equal(c.shoot(), false, 'dry: starts reloading instead');
  assert.equal(c.reloading, true);
  for (let i = 0; i < 90; i++) update(G, 1 / 60);
  assert.equal(c.reloading, false);
  assert.ok(G.player.mag.pistol > 0, 'magazine refilled');
  assert.ok(G.player.ammo.pistol < 48, 'reserve spent');
});

test('combat: damageEnemy kills at zero health and pays a bounty', () => {
  const G = makeG();
  initPlayer(G);
  const c = init(G);
  const e = c.spawnEnemy({ x: 5, z: 5, kind: 'gunman' });
  const money0 = G.player.money;
  assert.equal(c.damageEnemy(e, 49), false);
  assert.equal(c.damageEnemy(e, 1), true);
  assert.equal(c.enemies.length, 0);
  assert.equal(G.player.money, money0 + 75);
});

test('combat: enemies advance toward the player and shoot', () => {
  const G = makeG();
  initPlayer(G);
  const c = init(G);
  // Player stands at (-18, 108); put the gunman 40 m away — outside its
  // hold-and-strafe band (0.8 * range 35 = 28 m) so it has to advance.
  const e = c.spawnEnemy({ x: -18, z: 68, kind: 'gunman' });
  e.fireTimer = 0.01;
  e.fireInterval = 0.2;
  e.accuracy = 1;
  const d0 = Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z);
  const hp0 = G.player.health;
  for (let i = 0; i < 300; i++) update(G, 1 / 60);
  const d1 = Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z);
  assert.ok(d1 < d0, `enemy closed in: ${d0} -> ${d1.toFixed(1)}`);
  assert.ok(G.player.health < hp0, 'enemy fire hurt the player');
});

test('combat: an enemy inside its strafe band holds distance', () => {
  const G = makeG();
  initPlayer(G);
  const c = init(G);
  // 10 m away: inside the gunman's hold band (0.8 * range 35 = 28 m).
  const e = c.spawnEnemy({ x: -18, z: 98, kind: 'gunman' });
  const d0 = Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z);
  for (let i = 0; i < 120; i++) update(G, 1 / 60);
  const d1 = Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z);
  assert.ok(d1 > 6 && d1 < 14, `enemy held at ${d0} -> ${d1.toFixed(1)} m`);
});
