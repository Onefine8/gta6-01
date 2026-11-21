// tests/helpers.mjs — shared stub G for the Meridian Heat test suite.
//
// Builds a headless G that mirrors what main.js assembles: a small raw
// road grid (Builder A's {axis, x1, z1, x2, z2} form), scalar bounds,
// landmarks, an RNG with the same API as random.js (next/pick/range/
// chance/int), an event bus that records emissions, and stub input/audio.
// No browser globals are needed except when a test opts into the THREE /
// document stubs below.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed = 7) {
  const next = mulberry32(seed);
  return {
    next,
    float: () => next(),
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

export const TEST_CFG = {
  PLAYER: { WALK_SPEED: 6, RUN_SPEED: 10.5, JUMP_VEL: 8.5, GRAVITY: 24, RADIUS: 0.6, HEALTH: 100 },
  WANTED: { MAX: 5, DECAY_DELAY: 14, DECAY_RATE: 0.08, BUST_RADIUS: 2.2, BUST_TIME: 2.5 },
  COMBAT: {
    PISTOL_DAMAGE: 34, PISTOL_RATE: 0.28, PISTOL_RANGE: 60, PISTOL_MAG: 12,
    SMG_DAMAGE: 18, SMG_RATE: 0.09, SMG_RANGE: 50, SMG_MAG: 30,
    ENEMY_HEALTH: 60, ENEMY_DAMAGE: 8, ENEMY_RANGE: 38,
  },
  ECONOMY: {
    START_MONEY: 500,
    MISSION_REWARDS: [800, 1200, 1500, 2000, 2500, 3000, 5000, 10000],
    TAXI_FARE_BASE: 60, TAXI_FARE_PER_M: 0.9, PACKAGE_REWARD: 250, RACE_REWARD: 1500,
  },
  WORLD: { TRAFFIC_COUNT: 26, PED_COUNT: 40, PACKAGE_COUNT: 20 },
  MISSIONS: [
    { id: 1, name: 'First Wheels' }, { id: 2, name: 'Courier Run' },
    { id: 3, name: 'Getaway' }, { id: 4, name: 'Rival Rumble' },
    { id: 5, name: 'Midnight Race' }, { id: 6, name: 'The Pickup' },
    { id: 7, name: 'Harbor Heist' }, { id: 8, name: 'King of Meridian' },
  ],
  RADIO: [{ name: 'MERIDIAN FM' }, { name: 'NEON NIGHTS' }],
};

// A small 3x3 road grid in the real raw format, centred on 0.
export function makeRoads() {
  const roads = [];
  for (const c of [-144, 0, 144]) {
    roads.push({ x1: -288, z1: c, x2: 288, z2: c, axis: 'x' });
    roads.push({ x1: c, z1: -288, x2: c, z2: 288, axis: 'z' });
  }
  return roads;
}

export function makeWorld() {
  const roads = makeRoads();
  const buildings = [
    { minX: 20, maxX: 60, minZ: 20, maxZ: 60, h: 10, cx: 40, cz: 40 },
    { minX: -80, maxX: -40, minZ: -80, maxZ: -40, h: 12, cx: -60, cz: -60 },
  ];
  const world = {
    roads,
    buildings,
    bounds: 294,
    landmarks: {
      spawn: { x: -42, z: -32 },
      plaza: { x: -42, z: -42 },
      garage: { x: -134, z: 120 },
      pier: { x: -60, z: 334 },
      tower: { x: 38, z: -120 },
      beach: { x: 286, z: 40 },
      harborGate: { x: 0, z: 286 },
      raceStart: { x: -42, z: -258 },
      warehouse: { x: 200, z: 270 },
    },
    collide(pos, r) {
      let hit = false;
      const b = 294;
      if (pos.x < -b + r) { pos.x = -b + r; hit = true; }
      if (pos.x > b - r) { pos.x = b - r; hit = true; }
      if (pos.z < -b + r) { pos.z = -b + r; hit = true; }
      if (pos.z > b + 130 - r) { pos.z = b + 130 - r; hit = true; }
      for (const bd of buildings) {
        if (pos.x + r <= bd.minX || pos.x - r >= bd.maxX) continue;
        if (pos.z + r <= bd.minZ || pos.z - r >= bd.maxZ) continue;
        const dxMin = (pos.x + r) - bd.minX;
        const dxMax = bd.maxX - (pos.x - r);
        const dzMin = (pos.z + r) - bd.minZ;
        const dzMax = bd.maxZ - (pos.z - r);
        const m = Math.min(dxMin, dxMax, dzMin, dzMax);
        if (m === dxMin) pos.x = bd.minX - r;
        else if (m === dxMax) pos.x = bd.maxX + r;
        else if (m === dzMin) pos.z = bd.minZ - r;
        else pos.z = bd.maxZ + r;
        hit = true;
      }
      return hit;
    },
    nearestRoadPoint(x, z) {
      let best = null;
      let bestD = Infinity;
      for (const road of roads) {
        let px;
        let pz;
        let heading;
        if (road.axis === 'x') {
          px = Math.max(road.x1, Math.min(road.x2, x));
          pz = road.z1;
          heading = 0;
        } else {
          px = road.x1;
          pz = Math.max(road.z1, Math.min(road.z2, z));
          heading = Math.PI / 2;
        }
        const d = (px - x) * (px - x) + (pz - z) * (pz - z);
        if (d < bestD) {
          bestD = d;
          best = { x: px, z: pz, heading };
        }
      }
      return best;
    },
    randomRoadPos(rng) {
      const road = rng.pick(roads);
      const t = rng.range(0.05, 0.95);
      if (road.axis === 'x') {
        return { x: road.x1 + (road.x2 - road.x1) * t, z: road.z1, heading: 0 };
      }
      return { x: road.x1, z: road.z1 + (road.z2 - road.z1) * t, heading: Math.PI / 2 };
    },
    districtAt(x, z) {
      if (z > 200) return 'Harbor';
      if (x > 200) return 'Beachfront';
      return 'Downtown';
    },
  };
  return world;
}

export function makeEvents() {
  const listeners = new Map();
  const emitted = [];
  return {
    emitted,
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    emit(type, data) {
      emitted.push({ type, data });
      for (const fn of listeners.get(type) || []) fn(data);
    },
  };
}

export function makeG(overrides = {}) {
  const events = makeEvents();
  const G = {
    cfg: TEST_CFG,
    seed: 7,
    rng: makeRng(7),
    scene: {
      added: [],
      add(obj) { this.added.push(obj); },
      remove(obj) {
        const i = this.added.indexOf(obj);
        if (i >= 0) this.added.splice(i, 1);
      },
    },
    camera: {},
    renderer: null,
    input: { keys: {}, justPressed: {}, mouseDown: false },
    audio: {
      played: [],
      station: 0,
      muted: false,
      play(name) { this.played.push(name); },
    },
    save: {},
    world: makeWorld(),
    player: null,
    vehicles: null,
    traffic: null,
    peds: null,
    police: null,
    missions: null,
    combat: null,
    hud: null,
    activities: null,
    story: null,
    state: 'playing',
    time: { t: 0, dayTime: 10.5 },
    money: 500,
    health: 100,
    stats: { playSeconds: 0, carsStolen: 0, distanceDriven: 0 },
    events,
  };
  return { ...G, ...overrides };
}

// Mirror main.js: money is added on mission-complete, state changes on
// busted/wasted. Tests that need those side effects call this.
export function wireMainEffects(G) {
  G.events.on('mission-complete', (data) => {
    if (data && data.reward) G.money += data.reward;
  });
  G.events.on('busted', () => { G.state = 'busted'; });
  G.events.on('wasted', () => { G.state = 'wasted'; });
}

// --- THREE stub (only for tests that want mesh creation) ------------------

export function installThreeStub() {
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class Obj3D {
    constructor() {
      this.position = new Vec3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.visible = true;
      this.children = [];
    }
    add(...objs) { this.children.push(...objs); return this; }
    remove(obj) {
      const i = this.children.indexOf(obj);
      if (i >= 0) this.children.splice(i, 1);
      return this;
    }
  }
  class Mesh extends Obj3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }
  globalThis.THREE = {
    Group: class extends Obj3D {},
    Mesh,
    BoxGeometry: class { constructor() {} },
    CylinderGeometry: class { constructor() {} },
    MeshStandardMaterial: class {
      constructor() { this.color = { getHex: () => 0, setHex() {} }; this.userData = {}; }
    },
    MeshBasicMaterial: class { constructor() {} },
    DoubleSide: 2,
  };
  return globalThis.THREE;
}

export function uninstallThreeStub() {
  delete globalThis.THREE;
}

// --- document stub (only for hud tests) -----------------------------------

export function makeElement(id) {
  return {
    id,
    textContent: '',
    style: {},
    classList: {
      _set: new Set(),
      toggle: function (name, force) {
        if (force === undefined) {
          if (this._set.has(name)) this._set.delete(name);
          else this._set.add(name);
        } else if (force) this._set.add(name);
        else this._set.delete(name);
      },
      add: function (name) { this._set.add(name); },
      remove: function (name) { this._set.delete(name); },
      contains: function (name) { return this._set.has(name); },
    },
  };
}

export function makeCtxRecorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'calls') return calls;
      return (...args) => { calls.push([prop, ...args]); };
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  });
  return ctx;
}

export function installDocumentStub() {
  const elements = {};
  const ids = ['hud', 'health-bar', 'health-num', 'money', 'stars', 'speed',
    'objective', 'message', 'radio', 'minimap', 'menu', 'pause-menu',
    'end-screen', 'mission-tracker', 'wanted-flash', 'weapon', 'district', 'clock'];
  for (const id of ids) elements[id] = makeElement(id);
  const ctx = makeCtxRecorder();
  elements.minimap.getContext = () => ctx;
  globalThis.document = {
    elements,
    ctx,
    getElementById: (id) => elements[id] ?? null,
    createElement: () => makeElement('canvas'),
  };
  return globalThis.document;
}

export function uninstallDocumentStub() {
  delete globalThis.document;
}
