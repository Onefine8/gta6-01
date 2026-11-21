import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../game/src/combat.js';
import * as vehicles from '../game/src/vehicles.js';
import * as player from '../game/src/player.js';
import { makeG, wireMainEffects } from './helpers.mjs';

function bootedG() {
  const G = makeG();
  wireMainEffects(G);
  vehicles.init(G);
  player.init(G);
  combat.init(G);
  G.hud = { showMessage: () => {} };
  return G;
}

describe('shootRay', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const dir = { x: 0, z: -1 };
  it('hits a target straight ahead', () => {
    const t = { pos: { x: 0, z: -10 }, radius: 1 };
    const hit = combat.shootRay(origin, dir, [t], 60);
    assert.equal(hit.target, t);
    assert.equal(hit.dist, 10);
  });
  it('misses a target off to the side', () => {
    const t = { pos: { x: 5, z: -10 }, radius: 1 };
    assert.equal(combat.shootRay(origin, dir, [t], 60), null);
  });
  it('misses a target behind the shooter', () => {
    const t = { pos: { x: 0, z: 10 }, radius: 1 };
    assert.equal(combat.shootRay(origin, dir, [t], 60), null);
  });
  it('misses beyond the range', () => {
    const t = { pos: { x: 0, z: -70 }, radius: 1 };
    assert.equal(combat.shootRay(origin, dir, [t], 60), null);
  });
  it('returns the nearest of several targets', () => {
    const near = { pos: { x: 0, z: -8 }, radius: 1 };
    const far = { pos: { x: 0, z: -20 }, radius: 1 };
    const hit = combat.shootRay(origin, dir, [far, near], 60);
    assert.equal(hit.target, near);
  });
  it('respects the target radius', () => {
    const edge = { pos: { x: 0.9, z: -10 }, radius: 1 };
    assert.ok(combat.shootRay(origin, dir, [edge], 60));
    const out = { pos: { x: 1.1, z: -10 }, radius: 1 };
    assert.equal(combat.shootRay(origin, dir, [out], 60), null);
  });
  it('returns null with no targets', () => {
    assert.equal(combat.shootRay(origin, dir, [], 60), null);
  });
});

describe('applySpread', () => {
  it('keeps the direction roughly with zero spread', () => {
    const d = combat.applySpread({ x: 0, z: -1 }, 0, null);
    assert.ok(Math.abs(d.x) < 1e-9 && Math.abs(d.z + 1) < 1e-9);
  });
  it('returns a unit vector with spread', () => {
    for (let i = 0; i < 20; i++) {
      const d = combat.applySpread({ x: 0, z: -1 }, 0.07, null);
      assert.ok(Math.abs(Math.hypot(d.x, d.z) - 1) < 1e-9);
    }
  });
});

describe('enemyHitChance', () => {
  it('is high up close and zero past range', () => {
    assert.equal(combat.enemyHitChance(5), 0.55);
    assert.equal(combat.enemyHitChance(100), 0);
    const mid = combat.enemyHitChance(24);
    assert.ok(mid > 0.15 && mid < 0.55);
  });
});

describe('tuning', () => {
  it('reads G.cfg.COMBAT when present', () => {
    const t = combat.tuning(makeG());
    assert.equal(t.weapons.pistol.damage, 34);
    assert.equal(t.weapons.smg.damage, 18);
    assert.equal(t.enemyHealth, 60);
    assert.equal(t.enemyRange, 38);
  });
  it('falls back without cfg', () => {
    const t = combat.tuning({});
    assert.equal(t.weapons.pistol.damage, combat.WEAPONS.pistol.damage);
    assert.equal(t.enemyHealth, combat.ENEMY_HEALTH);
  });
});

describe('enemies', () => {
  it('spawns with cfg health and dies from damage', () => {
    const G = bootedG();
    const e = combat.spawnEnemy(G, 10, 10, { kind: 'kroll' });
    assert.equal(e.health, 60);
    assert.equal(e.alive, true);
    assert.equal(G.combat.enemies.length, 1);
    assert.equal(combat.damageEnemy(G, e, 30), true);
    assert.equal(e.health, 30);
    combat.damageEnemy(G, e, 30);
    assert.equal(e.alive, false);
    assert.ok(G.events.emitted.some((x) => x.type === 'enemy-down'));
  });
  it('damageEnemy refuses a dead enemy', () => {
    const G = bootedG();
    const e = combat.spawnEnemy(G, 0, 0);
    combat.damageEnemy(G, e, 999);
    assert.equal(combat.damageEnemy(G, e, 10), false);
  });
  it('dead enemies are dropped from the list on update', () => {
    const G = bootedG();
    const e = combat.spawnEnemy(G, 0, 0);
    combat.damageEnemy(G, e, 999);
    combat.update(G, 0.1);
    assert.equal(G.combat.enemies.length, 0);
  });
});

describe('applyDamageToPlayer', () => {
  it('lowers G.health and emits wasted at zero without setting state', () => {
    const G = bootedG();
    assert.equal(combat.applyDamageToPlayer(G, 25, 'kroll'), true);
    assert.equal(G.health, 75);
    combat.applyDamageToPlayer(G, 100, 'kroll');
    assert.equal(G.health, 0);
    assert.equal(G.state, 'wasted'); // wired main.js effect
    assert.ok(G.events.emitted.some((e) => e.type === 'wasted'));
  });
  it('refuses damage when already wasted', () => {
    const G = bootedG();
    G.state = 'wasted';
    assert.equal(combat.applyDamageToPlayer(G, 10), false);
  });
});

describe('player shooting', () => {
  it('fires on mouseDown, spends ammo and hits an enemy ahead', () => {
    const G = bootedG();
    G.player.heading = 0; // faces -z
    const e = combat.spawnEnemy(G, G.player.pos.x, G.player.pos.z - 10);
    const ammoBefore = G.combat.ammo;
    G.input.mouseDown = true;
    combat.update(G, 0.016);
    assert.equal(G.combat.ammo, ammoBefore - 1);
    assert.ok(e.health < 60);
    assert.ok(G.audio.played.includes('shot'));
  });
  it('does not fire without input', () => {
    const G = bootedG();
    const ammoBefore = G.combat.ammo;
    combat.update(G, 0.5);
    assert.equal(G.combat.ammo, ammoBefore);
  });
  it('respects the fire rate', () => {
    const G = bootedG();
    G.input.mouseDown = true;
    combat.update(G, 0.016);
    const ammoAfterFirst = G.combat.ammo;
    combat.update(G, 0.016);
    assert.equal(G.combat.ammo, ammoAfterFirst); // still cooling down
    combat.update(G, 0.5);
    assert.equal(G.combat.ammo, ammoAfterFirst - 1);
  });
  it('dry-fires with an empty magazine', () => {
    const G = bootedG();
    G.combat.ammo = 0;
    G.input.mouseDown = true;
    combat.update(G, 0.016);
    assert.equal(G.combat.ammo, 0);
    assert.ok(G.audio.played.includes('dryfire'));
  });
  it('reloads with R', () => {
    const G = bootedG();
    G.combat.ammo = 3;
    G.input.justPressed = { KeyR: true };
    combat.update(G, 0.016);
    assert.equal(G.combat.ammo, 12);
    assert.ok(G.audio.played.includes('reload'));
  });
  it('switches weapons with 2 and Q', () => {
    const G = bootedG();
    G.input.justPressed = { Digit2: true };
    combat.update(G, 0.016);
    assert.equal(G.combat.weapon, 'smg');
    assert.equal(G.combat.ammo, 30);
    G.input.justPressed = { KeyQ: true };
    combat.update(G, 0.016);
    assert.equal(G.combat.weapon, 'pistol');
  });
  it('enemy AI shoots the player when in range', () => {
    const G = bootedG();
    combat.spawnEnemy(G, G.player.pos.x, G.player.pos.z - 5);
    const hp = G.health;
    for (let i = 0; i < 200; i++) {
      combat.update(G, 0.05);
      G.time.t += 0.05;
      if (G.health < hp) break;
    }
    assert.ok(G.health < hp, 'expected the enemy to land a hit');
  });
  it('enemy AI never hits beyond its range', () => {
    const G = bootedG();
    combat.spawnEnemy(G, G.player.pos.x, G.player.pos.z - 100);
    for (let i = 0; i < 100; i++) combat.update(G, 0.05);
    assert.equal(G.health, 100);
  });
});
