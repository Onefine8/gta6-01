// Config + seeded RNG: the constants every module reads, and the
// determinism the screenshots and the city generation rely on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../game/src/config.js';
import { mulberry32, hashSeed, createRng } from '../game/src/random.js';

test('config: city grid is 8x8 blocks at 72 m pitch', () => {
  assert.equal(CONFIG.GRID_BLOCKS, 8);
  assert.equal(CONFIG.BLOCK_SIZE, 60);
  assert.equal(CONFIG.ROAD_WIDTH, 12);
  assert.equal(CONFIG.ROAD_PITCH, 72);
  assert.equal(CONFIG.CITY_HALF, 288);
});

test('config: five districts with centres inside the city', () => {
  assert.equal(CONFIG.DISTRICTS.length, 5);
  for (const d of CONFIG.DISTRICTS) {
    assert.ok(Math.abs(d.cx) <= 320, d.name);
    assert.ok(Math.abs(d.cz) <= 320, d.name);
    assert.ok(d.maxHeight > 0, d.name);
  }
  const names = CONFIG.DISTRICTS.map((d) => d.name);
  assert.ok(names.includes('Downtown'));
  assert.ok(names.includes('Harbor'));
});

test('config: player and vehicle tuning are sane', () => {
  assert.ok(CONFIG.PLAYER.walkSpeed > 0);
  assert.ok(CONFIG.PLAYER.runSpeed > CONFIG.PLAYER.walkSpeed);
  assert.ok(CONFIG.VEHICLE.maxSpeed > CONFIG.VEHICLE.maxReverse);
  assert.equal(CONFIG.PLAYER.maxHealth, 100);
  assert.equal(CONFIG.POLICE.maxWanted, 5);
});

test('config: mission rewards match the eight story missions', () => {
  assert.equal(CONFIG.MISSION_REWARDS.length, 8);
  assert.equal(CONFIG.MISSION_REWARDS[0], 500);
  assert.equal(CONFIG.MISSION_REWARDS[7], 10000);
  for (let i = 1; i < 8; i++) {
    assert.ok(CONFIG.MISSION_REWARDS[i] >= CONFIG.MISSION_REWARDS[i - 1]);
  }
});

test('config: controls name the keys the input module uses', () => {
  assert.equal(CONFIG.KEYS.forward, 'KeyW');
  assert.equal(CONFIG.KEYS.enterVehicle, 'KeyE');
  assert.equal(CONFIG.KEYS.jump, 'Space');
  assert.equal(CONFIG.KEYS.pause, 'Escape');
});

test('config: screenshot presets exist for all four shots', () => {
  for (const shot of ['chase', 'walk', 'mission', 'night']) {
    assert.ok(CONFIG.SHOTS[shot], shot);
    assert.ok(CONFIG.SHOTS[shot].dayTime >= 0 && CONFIG.SHOTS[shot].dayTime < 24);
  }
});

test('random: mulberry32 is deterministic for the same seed', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

test('random: mulberry32 differs across seeds', () => {
  const a = mulberry32(7)();
  const b = mulberry32(8)();
  assert.notEqual(a, b);
});

test('random: outputs stay in [0, 1)', () => {
  const rng = mulberry32(12345);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
  }
});

test('random: hashSeed is stable and numeric seeds pass through', () => {
  assert.equal(hashSeed(42), 42);
  assert.equal(hashSeed('meridian'), hashSeed('meridian'));
  assert.notEqual(hashSeed('meridian'), hashSeed('port'));
});

test('random: createRng bundle has range/int/pick/chance/shuffle', () => {
  const rng = createRng(9);
  assert.ok(rng.range(5, 10) >= 5 && rng.range(5, 10) < 10);
  const iv = rng.int(1, 3);
  assert.ok(iv >= 1 && iv <= 3);
  assert.ok(['a', 'b'].includes(rng.pick(['a', 'b'])));
  assert.equal(typeof rng.chance(0.5), 'boolean');
  const shuffled = rng.shuffle([1, 2, 3, 4, 5]);
  assert.deepEqual([...shuffled].sort(), [1, 2, 3, 4, 5]);
});

test('random: createRng with the same seed replays the same sequence', () => {
  const a = createRng(77);
  const b = createRng(77);
  for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next());
});
