// Shared test helpers: a minimal THREE stub, a minimal DOM stub, and a
// fake G object shaped like the one main.js builds (config, rng bundle,
// player object, events, input, audio, save). No browser is needed.

import { CONFIG } from '../game/src/config.js';
import { createRng } from '../game/src/random.js';

// ---------------------------------------------------------------- THREE stub

class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
  }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

class Color {
  constructor(v = 0xffffff) { this.value = v; }
  setHex(v) { this.value = v; return this; }
  copy(c) { this.value = c.value ?? c; return this; }
  lerp() { return this; }
}

class Obj3D {
  constructor() {
    this.position = new Vec3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1 };
    this.userData = {};
    this.children = [];
    this.visible = true;
    this.castShadow = false;
    this.name = '';
    this.material = null;
    this.geometry = null;
  }
  add(...objs) { for (const o of objs) this.children.push(o); return this; }
  remove(o) {
    const i = this.children.indexOf(o);
    if (i >= 0) this.children.splice(i, 1);
    return this;
  }
  traverse(fn) {
    fn(this);
    for (const c of this.children) if (typeof c.traverse === 'function') c.traverse(fn);
  }
  getObjectByName(name) {
    if (this.name === name) return this;
    for (const c of this.children) {
      const found = typeof c.getObjectByName === 'function' ? c.getObjectByName(name) : null;
      if (found) return found;
    }
    return null;
  }
  lookAt() { return this; }
}

class Mesh extends Obj3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
  clone() {
    const m = new Mesh(this.geometry, this.material);
    m.position.set(this.position.x, this.position.y, this.position.z);
    m.rotation = { ...this.rotation };
    m.name = this.name;
    return m;
  }
}

class Group extends Obj3D {}
class Line extends Obj3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}
class Points extends Obj3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}

class Geometry {
  constructor(...args) { this.args = args; }
  rotateZ() { return this; }
  rotateX() { return this; }
  setAttribute() { return this; }
}

class Material {
  constructor(opts = {}) {
    this.opts = opts;
    this.color = new Color(opts.color ?? 0xffffff);
    this.transparent = !!opts.transparent;
    this.opacity = opts.opacity ?? 1;
  }
}

export function makeThreeStub() {
  return {
    Group,
    Mesh,
    Line,
    Points,
    BoxGeometry: Geometry,
    CylinderGeometry: Geometry,
    ConeGeometry: Geometry,
    SphereGeometry: Geometry,
    PlaneGeometry: Geometry,
    CircleGeometry: Geometry,
    BufferGeometry: Geometry,
    BufferAttribute: class { constructor(arr, n) { this.array = arr; this.itemSize = n; } },
    MeshLambertMaterial: Material,
    MeshBasicMaterial: Material,
    LineBasicMaterial: Material,
    PointsMaterial: Material,
    Color,
    BackSide: 1,
    DoubleSide: 2,
    Fog: class { constructor(c, n, f) { this.color = new Color(c); this.near = n; this.far = f; } },
  };
}

export function installThreeStub() {
  globalThis.THREE = makeThreeStub();
  return globalThis.THREE;
}

// ---------------------------------------------------------------- DOM stub

export function makeCtx2d() {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, fill() {}, arc() {}, save() {}, translate() {}, rotate() {},
    restore() {}, closePath() {},
  };
}

export function makeElement(id) {
  const classes = new Set();
  return {
    id,
    style: {},
    textContent: '',
    innerHTML: '',
    width: 180,
    height: 180,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, f) => { if (f) classes.add(c); else classes.delete(c); },
      contains: (c) => classes.has(c),
      _set: classes,
    },
    getContext: () => makeCtx2d(),
    addEventListener() {},
    removeEventListener() {},
  };
}

export function installDomStub() {
  const elements = new Map();
  const store = new Map();
  globalThis.window = globalThis.window ?? {};
  globalThis.window.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.window.addEventListener = globalThis.window.addEventListener ?? (() => {});
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) { return makeElement(tag); },
    body: { prepend() {}, appendChild() {} },
    addEventListener() {},
    hidden: false,
  };
  return { elements, store };
}

// ---------------------------------------------------------------- events + G

export function createEmitter() {
  const listeners = new Map();
  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    off(event, fn) {
      const list = listeners.get(event);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(event, payload) {
      const list = listeners.get(event);
      if (!list) return;
      for (const fn of list.slice()) fn(payload);
    },
    _listeners: listeners,
  };
}

export function makeInputStub() {
  const held = new Set();
  return {
    held,
    pressed: new Set(),
    isDown(code) { return held.has(code); },
    wasPressed(code) { return this.pressed.has(code); },
    moveAxis() {
      const f = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0)
        - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      const s = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0)
        - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      return { x: s, y: f };
    },
    isRunning() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    consumeLook() { return null; },
    isMouseDown() { return false; },
    hadGesture() { return true; },
  };
}

/** A fake G shaped like main.js's: player object, rng bundle, stubs. */
export function makeG(overrides = {}) {
  const events = createEmitter();
  const G = {
    cfg: CONFIG,
    rng: createRng(7),
    seed: 7,
    scene: { add() {}, remove() {} },
    camera: null,
    renderer: null,
    input: makeInputStub(),
    audio: {
      play() {}, setEngine() {}, setSiren() {},
      currentStation: () => 'MERIDIAN FM', isRadioOn: () => false,
    },
    save: { save() { return true; }, load: () => null, hasSave: () => false },
    world: null,
    player: {
      x: -18, z: 108, heading: Math.PI, speed: 0, health: 100,
      money: 250, wanted: 0, onFoot: true, inVehicle: false, vehicle: null,
    },
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
    events,
    shotMode: false,
    shot: null,
    ...overrides,
  };
  return G;
}
