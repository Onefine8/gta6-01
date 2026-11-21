// player.js — Rook on foot: WASD movement, run, jump, enter/exit cars (E).
// Extends the G.player object main.js already created (flat x/z, inVehicle
// boolean + vehicle object, money, health) — it never replaces it, so the
// engine, the save system and the screenshot stager keep working on the
// same object. Positions live in p.pos {x, y, z} and are mirrored to p.x/p.z
// every frame for the camera, the save and the stager. The THREE mesh only
// mirrors the state; the movement math stays importable in plain Node.

import * as configModule from './config.js';
import * as randomModule from './random.js';

const CFG = configModule.CONFIG ?? configModule.default ?? {};
const mulberry32 = randomModule.mulberry32 ?? randomModule.default ?? null;

// ---------------------------------------------------------------- helpers

/** Read a tuning value from G.cfg, falling back to `fallback`. */
function cfg(G, key, fallback) {
  const c = G.cfg ?? CFG;
  const v = c == null ? undefined : c[key];
  return v === undefined || v === null ? fallback : v;
}

/** Nested config section, e.g. section(G, 'PLAYER', {}). */
function section(G, name, fallback) {
  const c = G.cfg ?? CFG;
  const s = c == null ? undefined : c[name];
  return s === undefined || s === null ? fallback : s;
}

/** A callable RNG from G.rng (the createRng bundle) or a fresh mulberry32. */
function rngFn(G) {
  const r = G.rng;
  if (typeof r === 'function') return r;
  if (r && typeof r.next === 'function') return r.next;
  if (mulberry32) return mulberry32(G.seed ?? 7);
  return Math.random;
}

function three() {
  return typeof globalThis !== 'undefined' ? globalThis.THREE : undefined;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Map my sound names onto the audio module's real play() names. */
const SOUND_MAP = {
  hurt: 'crash', wasted: 'missionFail', door: 'doorSlam', steal: 'uiClick',
  bump: 'crash', checkpoint: 'pickup', delivery: 'pickup', ambush: 'wantedUp',
  cash: 'pickup', package: 'pickup', 'race-start': 'horn',
  'race-win': 'missionComplete', 'race-lose': 'missionFail',
  'mission-start': 'uiClick', 'mission-pass': 'missionComplete',
  'mission-fail': 'missionFail', siren: 'wantedUp', busted: 'missionFail',
  kill: 'pickup', 'shot-smg': 'shot', 'shot-enemy': 'shot', reload: 'reload',
  crash: 'crash', shot: 'shot', engine: null, footstep: 'footstep',
};

function sfx(G, name) {
  try {
    const mapped = Object.prototype.hasOwnProperty.call(SOUND_MAP, name)
      ? SOUND_MAP[name] : name;
    if (mapped) G.audio?.play?.(mapped);
  } catch (e) { /* audio is best-effort */ }
}

function emit(G, name, data) {
  try {
    G.events?.emit?.(name, data);
  } catch (e) { /* events are best-effort */ }
}

/**
 * Is a key held? The input module exposes isDown(code) + a held Set; older
 * shapes (.keys object / .down fn) are accepted as a fallback.
 */
function keyDown(G, code) {
  const input = G.input;
  if (!input) return false;
  if (typeof input.isDown === 'function') {
    try {
      if (input.isDown(code)) return true;
    } catch (e) { /* fall through */ }
  }
  if (input.held && typeof input.held.has === 'function' && input.held.has(code)) return true;
  if (typeof input.down === 'function') {
    try {
      if (input.down(code)) return true;
    } catch (e) { /* fall through */ }
  }
  const keys = input.keys;
  return !!(keys && (keys[code] || keys[code.toLowerCase()]));
}

/**
 * Edge-triggered key: true only on the frame the key goes down. main.js
 * clears input.pressed before gameplay updates, so wasPressed() cannot be
 * trusted here — edges are tracked from the held set instead.
 */
function keyPressed(G, code, prevHeld) {
  return keyDown(G, code) && !(prevHeld && prevHeld.has(code));
}

/** Snapshot the currently held keys into a Set. */
function snapshotHeld(G) {
  const input = G.input;
  const out = new Set();
  if (!input) return out;
  if (input.held && typeof input.held.forEach === 'function') {
    input.held.forEach((k) => out.add(k));
    return out;
  }
  if (input.keys) {
    for (const k of Object.keys(input.keys)) if (input.keys[k]) out.add(k);
  }
  return out;
}

/** Movement axis {x: strafe, y: forward} from input.moveAxis() or keys. */
function moveAxis(G) {
  const input = G.input;
  if (input && typeof input.moveAxis === 'function') {
    try {
      const a = input.moveAxis();
      if (a && typeof a.x === 'number' && typeof a.y === 'number') return a;
    } catch (e) { /* fall through */ }
  }
  return {
    x: (keyDown(G, 'KeyD') || keyDown(G, 'ArrowRight') ? 1 : 0)
      - (keyDown(G, 'KeyA') || keyDown(G, 'ArrowLeft') ? 1 : 0),
    y: (keyDown(G, 'KeyW') || keyDown(G, 'ArrowUp') ? 1 : 0)
      - (keyDown(G, 'KeyS') || keyDown(G, 'ArrowDown') ? 1 : 0),
  };
}

// ---------------------------------------------------------------- pure math (tested)

/**
 * One on-foot step. Pure: no THREE, no DOM.
 * state: {pos, heading, speed, velY, onGround}
 * move: {forward, strafe, run, jump} in -1..1 / booleans
 * opts: {walkSpeed, runSpeed, jumpSpeed, gravity, accel}
 * Returns the mutated state (same object, for convenience).
 */
export function stepOnFoot(state, move, dt, opts = {}) {
  const walk = opts.walkSpeed ?? 4;
  const run = opts.runSpeed ?? 8;
  const jump = opts.jumpSpeed ?? 8.5;
  const gravity = opts.gravity ?? 22;
  const accel = opts.accel ?? 40;
  const top = move.run ? run : walk;

  // Desired velocity in world space, relative to the facing heading.
  const f = { x: Math.sin(state.heading), z: Math.cos(state.heading) };
  const r = { x: Math.cos(state.heading), z: -Math.sin(state.heading) };
  const tx = (f.x * move.forward + r.x * move.strafe) * top;
  const tz = (f.z * move.forward + r.z * move.strafe) * top;

  const k = Math.min(1, accel * dt);
  state.vx = (state.vx ?? 0) + (tx - (state.vx ?? 0)) * k;
  state.vz = (state.vz ?? 0) + (tz - (state.vz ?? 0)) * k;
  state.pos.x += state.vx * dt;
  state.pos.z += state.vz * dt;
  state.speed = Math.hypot(state.vx, state.vz);

  // Facing follows movement when actually moving.
  if (state.speed > 0.5) {
    const target = Math.atan2(state.vx, state.vz);
    let d = target - state.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    state.heading += clamp(d, -10 * dt, 10 * dt);
  }

  // Jump / gravity, ground is y = 0.
  if (move.jump && state.onGround) {
    state.velY = jump;
    state.onGround = false;
  }
  if (!state.onGround) {
    state.velY -= gravity * dt;
    state.pos.y += state.velY * dt;
    if (state.pos.y <= 0) {
      state.pos.y = 0;
      state.velY = 0;
      state.onGround = true;
    }
  }
  return state;
}

/** Distance on the XZ plane between two {x, z} points. */
export function flatDist(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

/** The nearest vehicle to `pos` within `maxDist`, or null. */
export function nearestVehicle(vehicles, pos, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const v of vehicles || []) {
    if (!v || !v.pos) continue;
    const d = flatDist(v.pos, pos);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

// ---------------------------------------------------------------- mesh

function buildPlayerMesh(G) {
  const T = three();
  if (!T) return null;
  const group = new T.Group();
  const jacket = cfg(G, 'PLAYER_JACKET_COLOR', 0x27324a);
  const skin = cfg(G, 'PLAYER_SKIN_COLOR', 0xc9976b);
  const pants = cfg(G, 'PLAYER_PANTS_COLOR', 0x1c1c22);
  const body = new T.Mesh(
    new T.BoxGeometry(0.55, 0.75, 0.32),
    new T.MeshLambertMaterial({ color: jacket }),
  );
  body.position.y = 1.05;
  const head = new T.Mesh(
    new T.BoxGeometry(0.34, 0.34, 0.34),
    new T.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  const legL = new T.Mesh(
    new T.BoxGeometry(0.2, 0.65, 0.22),
    new T.MeshLambertMaterial({ color: pants }),
  );
  legL.position.set(-0.14, 0.33, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armL = new T.Mesh(
    new T.BoxGeometry(0.16, 0.6, 0.18),
    new T.MeshLambertMaterial({ color: jacket }),
  );
  armL.position.set(-0.37, 1.05, 0);
  const armR = armL.clone();
  armR.position.x = 0.37;
  group.add(body, head, legL, legR, armL, armR);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  group.traverse((o) => { o.castShadow = true; });
  return group;
}

// ---------------------------------------------------------------- module

export function init(G) {
  // Extend main.js's player object; never replace it (save/load, the
  // camera and the screenshot stager all hold the same reference).
  const p = G.player ?? {};
  G.player = p;
  const pcfg = section(G, 'PLAYER', {});
  const startX = typeof p.x === 'number' ? p.x : 6;
  const startZ = typeof p.z === 'number' ? p.z : 6;
  if (typeof p.heading !== 'number') p.heading = Math.PI * 0.75;
  if (typeof p.health !== 'number') p.health = pcfg.maxHealth ?? 100;
  if (typeof p.money !== 'number') p.money = cfg(G, 'START_MONEY', 0);
  if (typeof p.onFoot !== 'boolean') p.onFoot = true;
  if (typeof p.inVehicle !== 'boolean') p.inVehicle = false;
  if (!('vehicle' in p)) p.vehicle = null;

  p.pos = { x: startX, y: 0, z: startZ };
  p.x = startX;
  p.z = startZ;
  p.vx = 0;
  p.vz = 0;
  p.velY = 0;
  p.speed = 0;
  p.onGround = true;
  p.maxHealth = pcfg.maxHealth ?? 100;
  p.weapon = 'pistol';
  p.ammo = { pistol: 48, smg: 120 };
  p.mag = { pistol: 12, smg: 30 };
  p.magSize = { pistol: 12, smg: 30 };
  p.walkSpeed = pcfg.walkSpeed ?? 5.2;
  p.runSpeed = pcfg.runSpeed ?? 9.0;
  p.jumpSpeed = pcfg.jumpSpeed ?? 7.5;
  p.gravity = 22;
  p.lastDamageAt = -999;
  p.regenDelay = cfg(G, 'PLAYER_REGEN_DELAY', 5);
  p._prevHeld = new Set();
  p._walkPhase = 0;
  p._rng = rngFn(G);
  p.mesh = null;

  /** Damage the player; returns true when this damage wastes them. */
  p.damage = function damage(amount, source) {
    if (p.inVehicle && p.vehicle) amount *= 0.5; // the car takes the edge off
    p.health = Math.max(0, p.health - amount);
    p.lastDamageAt = G.time ? G.time.t : 0;
    emit(G, 'player-damaged', { amount, source: source || 'unknown', health: p.health });
    sfx(G, 'hurt');
    if (p.health <= 0) p.wasted();
    return p.health <= 0;
  };

  /** Put the player down: main.js listens for 'wasted' and shows the end screen. */
  p.wasted = function wasted() {
    if (G.state === 'wasted') return;
    if (p.vehicle) p.exitVehicle();
    emit(G, 'wasted', { money: p.money });
    G.state = 'wasted';
    sfx(G, 'wasted');
    if (G.missions?.onPlayerDown) G.missions.onPlayerDown('wasted');
  };

  /** Heal, clamped to maxHealth. */
  p.heal = function heal(amount) {
    p.health = Math.min(p.maxHealth, p.health + amount);
  };

  /** Enter a vehicle (called by vehicles.js too, via G). */
  p.enterVehicle = function enterVehicle(vehicle) {
    if (!vehicle) return false;
    p.vehicle = vehicle;
    p.inVehicle = true;
    p.onFoot = false;
    vehicle.driver = 'player';
    if (p.mesh) p.mesh.visible = false;
    emit(G, 'player-entered-vehicle', { vehicleId: vehicle.id });
    sfx(G, 'door');
    return true;
  };

  /** Step out of the current vehicle, to its side. */
  p.exitVehicle = function exitVehicle() {
    const v = p.vehicle;
    if (!v) return false;
    const side = { x: Math.cos(v.heading), z: -Math.sin(v.heading) };
    p.pos.x = v.pos.x + side.x * 2.2;
    p.pos.y = 0;
    p.pos.z = v.pos.z + side.z * 2.2;
    p.x = p.pos.x;
    p.z = p.pos.z;
    p.heading = v.heading;
    p.vehicle = null;
    p.inVehicle = false;
    p.onFoot = true;
    v.driver = 'none';
    if (p.mesh) p.mesh.visible = true;
    emit(G, 'player-exited-vehicle', { vehicleId: v.id });
    sfx(G, 'door');
    return true;
  };

  const mesh = buildPlayerMesh(G);
  if (mesh) {
    mesh.position.set(p.pos.x, 0, p.pos.z);
    p.mesh = mesh;
    G.scene?.add?.(mesh);
  }
  return p;
}

export function update(G, dt) {
  const p = G.player;
  if (!p || G.state !== 'playing') {
    if (p) p._prevHeld = snapshotHeld(G);
    return;
  }
  dt = Math.min(dt, 0.05);

  // Adopt external position writes (save load, menu restart, screenshot
  // staging all write p.x / p.z between frames).
  if (typeof p.x === 'number' && typeof p.z === 'number'
    && (p.x !== p.pos.x || p.z !== p.pos.z) && !(p.inVehicle && p.vehicle)) {
    p.pos.x = p.x;
    p.pos.z = p.z;
  }

  // Health regen after a quiet spell.
  const t = G.time ? G.time.t : 0;
  if (p.health > 0 && p.health < p.maxHealth && t - p.lastDamageAt > p.regenDelay) {
    p.heal(6 * dt);
  }

  const driving = !!(p.inVehicle && p.vehicle);
  p.onFoot = !driving;
  if (driving) {
    // Riding: the player sits where the car is; the car module drives.
    p.pos.x = p.vehicle.pos.x;
    p.pos.y = 0;
    p.pos.z = p.vehicle.pos.z;
    p.x = p.pos.x;
    p.z = p.pos.z;
    p.heading = p.vehicle.heading;
    if (p.mesh) {
      p.mesh.visible = false;
      p.mesh.position.set(p.pos.x, 0, p.pos.z);
    }
    // E exits the car (edge-triggered, tracked here — the only E handler).
    if (keyPressed(G, 'KeyE', p._prevHeld)) p.exitVehicle();
    p._prevHeld = snapshotHeld(G);
    return;
  }

  const axis = moveAxis(G);
  const move = {
    forward: axis.y,
    strafe: axis.x,
    run: (G.input && typeof G.input.isRunning === 'function')
      ? G.input.isRunning()
      : keyDown(G, 'ShiftLeft') || keyDown(G, 'ShiftRight'),
    jump: keyDown(G, 'Space'),
  };
  stepOnFoot(p, move, dt, {
    walkSpeed: p.walkSpeed,
    runSpeed: p.runSpeed,
    jumpSpeed: p.jumpSpeed,
    gravity: p.gravity,
  });

  // Buildings push the player out (world.collide mutates pos in place).
  if (G.world?.collide) {
    try {
      G.world.collide(p.pos, 0.6);
    } catch (e) { /* collision is best-effort */ }
  }
  // Stay inside the city bounds.
  const half = cfg(G, 'CITY_HALF', 288);
  p.pos.x = clamp(p.pos.x, -half, half);
  p.pos.z = clamp(p.pos.z, -half, half);

  // Enter a car with E (edge-triggered).
  if (keyPressed(G, 'KeyE', p._prevHeld)) {
    const near = nearestVehicle(G.vehicles?.list, p.pos, cfg(G, 'ENTER_CAR_DIST', 4));
    if (near) {
      if (near.driver && near.driver !== 'none' && near.driver !== 'player') {
        // Stealing an occupied car: yank the driver out, attract attention.
        if (G.vehicles?.steal) G.vehicles.steal(near);
        else p.enterVehicle(near);
      } else {
        p.enterVehicle(near);
      }
      emit(G, 'car-entered', { vehicleId: near.id, stolen: !!near.stolen });
    }
  }

  // Weapon switch (1 pistol, 2 SMG).
  if (keyPressed(G, 'Digit1', p._prevHeld)) {
    p.weapon = 'pistol';
    emit(G, 'weapon-changed', { weapon: 'pistol' });
  }
  if (keyPressed(G, 'Digit2', p._prevHeld) && (p.ammo.smg > 0 || p.mag.smg > 0)) {
    p.weapon = 'smg';
    emit(G, 'weapon-changed', { weapon: 'smg' });
  }

  // Mirror the position back to the flat fields the engine reads.
  p.x = p.pos.x;
  p.z = p.pos.z;

  // Walk-cycle animation on the mesh.
  if (p.mesh) {
    p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
    p.mesh.rotation.y = p.heading;
    if (p.speed > 0.5) {
      p._walkPhase += dt * p.speed * 1.6;
      const s = Math.sin(p._walkPhase) * 0.55;
      const u = p.mesh.userData;
      if (u.legL) u.legL.rotation.x = s;
      if (u.legR) u.legR.rotation.x = -s;
      if (u.armL) u.armL.rotation.x = -s * 0.8;
      if (u.armR) u.armR.rotation.x = s * 0.8;
    } else {
      const u = p.mesh.userData;
      if (u.legL) u.legL.rotation.x = 0;
      if (u.legR) u.legR.rotation.x = 0;
      if (u.armL) u.armL.rotation.x = 0;
      if (u.armR) u.armR.rotation.x = 0;
    }
  }

  p._prevHeld = snapshotHeld(G);
}
