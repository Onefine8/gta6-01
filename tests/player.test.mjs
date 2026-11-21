import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as player from '../game/src/player.js';
import * as vehicles from '../game/src/vehicles.js';
import { makeG, wireMainEffects } from './helpers.mjs';

function bootedG() {
  const G = makeG();
  wireMainEffects(G);
  vehicles.init(G);
  player.init(G);
  return G;
}

describe('walkVelocity', () => {
  it('moves north on W', () => {
    const v = player.walkVelocity({ forward: true }, 6);
    assert.equal(v.z, -6);
    assert.equal(v.x, 0);
    assert.equal(v.moving, true);
  });
  it('moves south on S and east on D', () => {
    assert.equal(player.walkVelocity({ back: true }, 6).z, 6);
    assert.equal(player.walkVelocity({ right: true }, 6).x, 6);
    assert.equal(player.walkVelocity({ left: true }, 6).x, -6);
  });
  it('normalises diagonals so they are not faster', () => {
    const v = player.walkVelocity({ forward: true, right: true }, 6);
    assert.ok(Math.abs(Math.hypot(v.x, v.z) - 6) < 1e-9);
  });
  it('reports not moving with no input', () => {
    const v = player.walkVelocity({}, 6);
    assert.deepEqual(v, { x: 0, z: 0, moving: false });
  });
});

describe('gravityStep', () => {
  it('lands on the ground and zeroes velocity', () => {
    const s = player.gravityStep(0.1, -5, 0.1);
    assert.equal(s.y, 0);
    assert.equal(s.vy, 0);
    assert.equal(s.grounded, true);
  });
  it('falls and accelerates', () => {
    const s = player.gravityStep(10, 0, 0.1);
    assert.ok(s.y < 10 && s.y > 9.5);
    assert.ok(s.vy < 0);
    assert.equal(s.grounded, false);
  });
  it('uses a custom gravity', () => {
    const a = player.gravityStep(10, 0, 0.1, 10);
    const b = player.gravityStep(10, 0, 0.1, 40);
    assert.ok(b.y < a.y);
  });
});

describe('clampToBounds', () => {
  it('clamps inside an object bounds', () => {
    const pos = { x: 999, z: -999 };
    player.clampToBounds(pos, { minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
    assert.deepEqual(pos, { x: 10, z: -10 });
  });
  it('treats a scalar as a half-extent with a harbour z extension', () => {
    const pos = { x: 500, z: 500 };
    player.clampToBounds(pos, 294);
    assert.equal(pos.x, 294);
    assert.equal(pos.z, 424);
  });
  it('leaves an inside point alone', () => {
    const pos = { x: 5, z: 5 };
    player.clampToBounds(pos, 294);
    assert.deepEqual(pos, { x: 5, z: 5 });
  });
});

describe('boundsOf', () => {
  it('maps a scalar world bounds to an object', () => {
    const b = player.boundsOf(makeG());
    assert.deepEqual(b, { minX: -294, maxX: 294, minZ: -294, maxZ: 424 });
  });
  it('passes an object bounds through', () => {
    const G = makeG({ world: { bounds: { minX: -5, maxX: 5, minZ: -6, maxZ: 6 } } });
    assert.deepEqual(player.boundsOf(G), { minX: -5, maxX: 5, minZ: -6, maxZ: 6 });
  });
});

describe('tuning', () => {
  it('reads G.cfg.PLAYER when present', () => {
    const t = player.tuning(makeG());
    assert.equal(t.walk, 6);
    assert.equal(t.run, 10.5);
    assert.equal(t.gravity, 24);
  });
  it('falls back to constants without cfg', () => {
    const t = player.tuning({});
    assert.equal(t.walk, player.WALK_SPEED);
    assert.equal(t.run, player.RUN_SPEED);
  });
});

describe('keyDown', () => {
  it('reads a plain object of keys (Builder A input.js shape)', () => {
    const G = makeG();
    G.input.keys = { KeyW: true, KeyA: false };
    assert.equal(player.keyDown(G, 'KeyW'), true);
    assert.equal(player.keyDown(G, 'KeyA'), false);
    assert.equal(player.keyDown(G, 'KeyW', 'ArrowUp'), true);
  });
  it('reads a Set of keys', () => {
    const G = makeG();
    G.input.keys = new Set(['ShiftLeft']);
    assert.equal(player.keyDown(G, 'ShiftLeft'), true);
    assert.equal(player.keyDown(G, 'KeyW'), false);
  });
  it('reads an array of keys', () => {
    const G = makeG();
    G.input.keys = ['Space'];
    assert.equal(player.keyDown(G, 'Space'), true);
  });
  it('returns false with no input', () => {
    assert.equal(player.keyDown({}), false);
  });
});

describe('money and health on G', () => {
  it('addMoney works on G.money and never goes below zero', () => {
    const G = bootedG();
    assert.equal(player.addMoney(G, 250), 750);
    assert.equal(player.addMoney(G, -900), 0);
    assert.equal(G.money, 0);
  });
  it('damagePlayer lowers G.health and mirrors it on the player', () => {
    const G = bootedG();
    assert.equal(player.damagePlayer(G, 30, 'test'), true);
    assert.equal(G.health, 70);
    assert.equal(G.player.health, 70);
  });
  it('damagePlayer emits wasted at zero health without setting state itself', () => {
    const G = bootedG();
    player.damagePlayer(G, 200, 'test');
    assert.equal(G.health, 0);
    assert.equal(G.state, 'wasted'); // set by the wired main.js effect, not the module
    assert.equal(G.events.emitted.at(-1).type, 'wasted');
  });
  it('damagePlayer refuses damage when already wasted', () => {
    const G = bootedG();
    G.state = 'wasted';
    assert.equal(player.damagePlayer(G, 10), false);
  });
  it('healPlayer caps at max health', () => {
    const G = bootedG();
    player.damagePlayer(G, 20);
    assert.equal(player.healPlayer(G, 500), 100);
  });
});

describe('enter and exit vehicles', () => {
  it('enters the nearest car with E and steals it (heat + event)', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    const before = G.events.emitted.length;
    assert.equal(player.tryEnterExitVehicle(G), 'enter');
    assert.equal(G.player.onFoot, false);
    assert.equal(G.player.vehicle, car);
    assert.equal(G.vehicles.playerVehicle, car);
    assert.equal(car.owned, true);
    assert.equal(G.stats.carsStolen, 1);
    assert.ok(G.events.emitted.slice(before).some((e) => e.type === 'car-stolen'));
  });
  it('does nothing when no car is near', () => {
    const G = bootedG();
    G.player.pos.x = 250;
    G.player.pos.z = 250;
    assert.equal(player.tryEnterExitVehicle(G), null);
    assert.equal(G.player.onFoot, true);
  });
  it('exits to the side of the car and clears the driver', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    player.tryEnterExitVehicle(G);
    assert.equal(player.tryEnterExitVehicle(G), 'exit');
    assert.equal(G.player.onFoot, true);
    assert.equal(G.player.vehicle, null);
    assert.equal(car.driver, null);
    assert.equal(G.vehicles.playerVehicle, null);
  });
  it('entering an owned car adds no heat', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    car.owned = true;
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    player.tryEnterExitVehicle(G);
    assert.equal(G.events.emitted.filter((e) => e.type === 'car-stolen').length, 0);
  });
  it('nearestVehicle picks the closest car inside the radius', () => {
    const G = bootedG();
    const [a, b] = G.vehicles.list;
    G.player.pos.x = a.pos.x + 1;
    G.player.pos.z = a.pos.z;
    assert.equal(player.nearestVehicle(G, 3.6), a);
    assert.notEqual(player.nearestVehicle(G, 3.6), b);
    assert.equal(player.nearestVehicle(G, 0.5), null);
  });
});

describe('player update', () => {
  it('walks north on W and faces the movement direction', () => {
    const G = bootedG();
    const x0 = G.player.pos.x;
    const z0 = G.player.pos.z;
    G.input.keys = { KeyW: true };
    player.update(G, 1);
    assert.ok(G.player.pos.z < z0);
    assert.equal(G.player.pos.x, x0);
    assert.ok(Math.abs(G.player.heading - 0) < 1e-9); // facing -z (north)
    assert.equal(G.player.moving, true);
    assert.ok(G.player.speed > 0);
  });
  it('runs faster with Shift', () => {
    const G = bootedG();
    G.input.keys = { KeyW: true, ShiftLeft: true };
    const z0 = G.player.pos.z;
    player.update(G, 1);
    assert.ok(z0 - G.player.pos.z > 9);
  });
  it('does not move when the game is not playing', () => {
    const G = bootedG();
    G.state = 'paused';
    const z0 = G.player.pos.z;
    G.input.keys = { KeyW: true };
    player.update(G, 1);
    assert.equal(G.player.pos.z, z0);
  });
  it('jumps on Space and lands again', () => {
    const G = bootedG();
    G.input.keys = { Space: true };
    player.update(G, 0.016);
    assert.equal(G.player.grounded, false);
    assert.ok(G.player.pos.y > 0);
    G.input.keys = {};
    for (let i = 0; i < 120; i++) player.update(G, 0.016);
    assert.equal(G.player.grounded, true);
    assert.equal(G.player.pos.y, 0);
  });
  it('enters a car on justPressed E', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    G.input.justPressed = { KeyE: true };
    player.update(G, 0.016);
    assert.equal(G.player.onFoot, false);
  });
  it('rides along with the driven car', () => {
    const G = bootedG();
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    player.tryEnterExitVehicle(G);
    car.pos.x += 10;
    car.pos.z += 5;
    player.update(G, 0.016);
    assert.equal(G.player.pos.x, car.pos.x);
    assert.equal(G.player.pos.z, car.pos.z);
  });
  it('regenerates health after a quiet spell', () => {
    const G = bootedG();
    player.damagePlayer(G, 20);
    G.player.lastDamageAt = -100;
    G.time.t = 10;
    player.update(G, 1);
    assert.ok(G.health > 80);
  });
  it('spawns at the world spawn landmark', () => {
    const G = bootedG();
    assert.equal(G.player.pos.x, -42);
    assert.equal(G.player.pos.z, -32);
  });
});
