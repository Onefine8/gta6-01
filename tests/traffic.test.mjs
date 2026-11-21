import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as traffic from '../game/src/traffic.js';
import * as vehicles from '../game/src/vehicles.js';
import * as player from '../game/src/player.js';
import { makeG, makeRng } from './helpers.mjs';

const RAW_ROADS = [
  { x1: -288, z1: -144, x2: 288, z2: -144, axis: 'x' },
  { x1: -288, z1: 0, x2: 288, z2: 0, axis: 'x' },
  { x1: -288, z1: 144, x2: 288, z2: 144, axis: 'x' },
  { x1: -144, z1: -288, x2: -144, z2: 288, axis: 'z' },
  { x1: 0, z1: -288, x2: 0, z2: 288, axis: 'z' },
  { x1: 144, z1: -288, x2: 144, z2: 288, axis: 'z' },
];

describe('normalizeRoads', () => {
  it('splits full grid lines into intersection segments', () => {
    const segs = traffic.normalizeRoads(RAW_ROADS);
    // 3 x-roads x 4 segments + 3 z-roads x 4 segments = 24
    assert.equal(segs.length, 24);
    for (const s of segs) {
      assert.ok(s.bx - s.ax === 144 || s.bz - s.az === 144, JSON.stringify(s));
    }
  });
  it('passes {ax,az,bx,bz} segments through unchanged', () => {
    const inSegs = [{ ax: 0, az: 0, bx: 10, bz: 0 }];
    const out = traffic.normalizeRoads(inSegs);
    assert.deepEqual(out, inSegs);
    assert.notEqual(out, inSegs);
  });
  it('returns [] for no roads', () => {
    assert.deepEqual(traffic.normalizeRoads([]), []);
    assert.deepEqual(traffic.normalizeRoads(null), []);
  });
  it('segments chain end to end (no gaps)', () => {
    const segs = traffic.normalizeRoads(RAW_ROADS);
    const xRoad = segs.filter((s) => s.az === 0 && s.bz === 0).sort((a, b) => a.ax - b.ax);
    assert.equal(xRoad.length, 4);
    for (let i = 1; i < xRoad.length; i++) {
      assert.equal(xRoad[i].ax, xRoad[i - 1].bx);
    }
  });
});

describe('segment helpers', () => {
  it('segmentPoint interpolates', () => {
    const p = traffic.segmentPoint({ ax: 0, az: 0, bx: 10, bz: 0 }, 0.5);
    assert.deepEqual(p, { x: 5, z: 0 });
  });
  it('segmentLength measures', () => {
    assert.equal(traffic.segmentLength({ ax: 0, az: 0, bx: 3, bz: 4 }), 5);
  });
  it('segmentHeading points along the road', () => {
    assert.ok(Math.abs(traffic.segmentHeading({ ax: 0, az: 0, bx: 10, bz: 0 }) - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(traffic.segmentHeading({ ax: 0, az: 0, bx: 0, bz: -10 }) - 0) < 1e-9);
  });
  it('wrapAngle folds into [-PI, PI]', () => {
    assert.ok(Math.abs(traffic.wrapAngle(Math.PI * 3) - -Math.PI) < 1e-9
      || Math.abs(traffic.wrapAngle(Math.PI * 3) - Math.PI) < 1e-9);
    assert.equal(traffic.wrapAngle(0), 0);
    assert.ok(traffic.wrapAngle(-Math.PI * 2.5) > -Math.PI - 1e-9);
  });
  it('nearestSegment finds the closest road and its t', () => {
    const segs = traffic.normalizeRoads(RAW_ROADS);
    const n = traffic.nearestSegment(segs, 5, 2);
    assert.ok(n.index >= 0);
    assert.ok(n.dist < 3);
    assert.ok(n.t >= 0 && n.t <= 1);
  });
  it('pickNextSegment continues from the end of a segment', () => {
    const segs = traffic.normalizeRoads(RAW_ROADS);
    // First x-road segment at z=-144 runs -288..-144; its end meets the
    // z-road at x=-144.
    const first = segs.findIndex((s) => s.az === -144 && s.ax === -288);
    assert.ok(first >= 0);
    const next = traffic.pickNextSegment(segs, first, makeRng(3));
    assert.notEqual(next, -1);
    const cur = segs[first];
    const nxt = segs[next];
    assert.ok(Math.hypot(nxt.ax - cur.bx, nxt.az - cur.bz) < 1.5);
  });
  it('pickNextSegment returns -1 with no roads', () => {
    assert.equal(traffic.pickNextSegment([], 0, makeRng(1)), -1);
  });
});

describe('followDrive', () => {
  it('steers toward the segment heading', () => {
    const car = { heading: 0, speed: 5, pos: { x: 0, z: 0 } };
    const seg = { ax: 0, az: 0, bx: 10, bz: 0 }; // heading PI/2
    const d = traffic.followDrive(car, seg, 9);
    assert.ok(d.steer > 0);
    assert.ok(d.throttle > 0);
  });
  it('brakes when over the target speed', () => {
    const car = { heading: Math.PI / 2, speed: 20, pos: { x: 0, z: 0 } };
    const seg = { ax: 0, az: 0, bx: 10, bz: 0 };
    const d = traffic.followDrive(car, seg, 9);
    assert.ok(d.throttle < 0);
  });
  it('holds a straight course with no steering', () => {
    const car = { heading: Math.PI / 2, speed: 9, pos: { x: 0, z: 0 } };
    const seg = { ax: 0, az: 0, bx: 10, bz: 0 };
    const d = traffic.followDrive(car, seg, 9);
    assert.ok(Math.abs(d.steer) < 0.01);
  });
});

describe('traffic update', () => {
  function bootedG() {
    const G = makeG();
    vehicles.init(G);
    player.init(G);
    traffic.init(G);
    return G;
  }

  it('spawns cars up to the target near the player', () => {
    const G = bootedG();
    for (let i = 0; i < 40; i++) {
      traffic.update(G, 0.5);
      vehicles.update(G, 0.5);
      G.time.t += 0.5;
    }
    assert.ok(G.traffic.cars.length > 0);
    assert.ok(G.traffic.cars.length <= G.traffic.target);
    for (const car of G.traffic.cars) {
      assert.ok(Math.hypot(car.pos.x - G.player.pos.x, car.pos.z - G.player.pos.z) < 260);
    }
  });
  it('traffic cars advance along their segments', () => {
    const G = bootedG();
    traffic.update(G, 0.5);
    const car = G.traffic.cars[0];
    assert.ok(car);
    const x0 = car.pos.x;
    const z0 = car.pos.z;
    for (let i = 0; i < 20; i++) {
      traffic.update(G, 0.1);
      vehicles.update(G, 0.1);
      G.time.t += 0.1;
    }
    assert.ok(Math.hypot(car.pos.x - x0, car.pos.z - z0) > 2);
  });
  it('despawns cars far from the player', () => {
    const G = bootedG();
    traffic.update(G, 0.5);
    assert.ok(G.traffic.cars.length > 0);
    const car = G.traffic.cars[0];
    car.pos.x = G.player.pos.x + 500;
    car.pos.z = G.player.pos.z + 500;
    traffic.update(G, 0.5);
    assert.ok(!G.traffic.cars.includes(car));
    assert.ok(!G.vehicles.list.includes(car));
  });
  it('brakes behind a slow player car', () => {
    const G = bootedG();
    const pv = G.vehicles.list[0];
    G.vehicles.playerVehicle = pv;
    pv.speed = 0;
    // Put a traffic car right behind the player car, same heading.
    const car = G.vehicles.spawn({
      x: pv.pos.x, z: pv.pos.z + 8, heading: 0, model: 'sedan', driver: 'ai', owned: true,
    });
    car.ai = { seg: 0, t: 0.5, speed: 9, stuck: 0 };
    car.speed = 9;
    G.traffic.cars.push(car);
    // Force its segment to run north (-z) toward the player car.
    G.traffic.segments = [{ ax: pv.pos.x, az: pv.pos.z + 40, bx: pv.pos.x, bz: pv.pos.z - 40 }];
    car.ai.seg = 0;
    traffic.update(G, 0.1);
    assert.ok(car.drive.throttle < 0, `expected braking, got ${car.drive.throttle}`);
  });
  it('spawnNear adds a car near a point (shots.js API)', () => {
    const G = bootedG();
    const before = G.traffic.cars.length;
    const car = G.traffic.spawnNear(0, 0, 40);
    assert.ok(car);
    assert.equal(G.traffic.cars.length, before + 1);
    assert.ok(Math.hypot(car.pos.x, car.pos.z) < 200);
  });
  it('does not run when the game is not playing', () => {
    const G = bootedG();
    G.state = 'menu';
    traffic.update(G, 1);
    assert.equal(G.traffic.cars.length, 0);
  });
});
