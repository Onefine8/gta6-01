// player.js — Rook on foot: walk, run, jump, enter/exit vehicles.
//
// Owns G.player: position, heading, health, money and whether Rook is on
// foot or driving. Vehicle physics live in vehicles.js; this module only
// asks it to enter/exit through G.vehicles. Input is read through G.input
// (Builder A's input.js) with a tolerant reader, so a Set, a plain object
// or an array of pressed codes all work. Meshes are built only when the
// THREE global exists, so the module imports cleanly in Node for tests.

export const WALK_SPEED = 4.2;
export const RUN_SPEED = 7.0;
export const JUMP_SPEED = 8.5;
export const GRAVITY = 22;
export const PLAYER_RADIUS = 0.55;
export const ENTER_RADIUS = 3.6;
export const HEALTH_MAX = 100;
export const HEALTH_REGEN = 2.5; // per second, only while not recently hurt
export const REGEN_DELAY = 5; // seconds after last damage before regen

// Tuning comes from G.cfg (Builder A's config.js) when present; the
// constants above are the standalone fallbacks used by tests.
export function tuning(G) {
  const c = (G && G.cfg && G.cfg.PLAYER) || {};
  return {
    walk: c.WALK_SPEED ?? WALK_SPEED,
    run: c.RUN_SPEED ?? RUN_SPEED,
    jump: c.JUMP_VEL ?? JUMP_SPEED,
    gravity: c.GRAVITY ?? GRAVITY,
    health: c.HEALTH ?? HEALTH_MAX,
  };
}

// World bounds as {minX,maxX,minZ,maxZ}. Builder A's world.bounds is a
// scalar half-extent (294); the harbour extends z to half + 130.
export function boundsOf(G) {
  const b = G && G.world ? G.world.bounds : undefined;
  if (typeof b === 'number') return { minX: -b, maxX: b, minZ: -b, maxZ: b + 130 };
  if (b && typeof b === 'object') {
    return {
      minX: b.minX ?? -294, maxX: b.maxX ?? 294,
      minZ: b.minZ ?? -294, maxZ: b.maxZ ?? 424,
    };
  }
  return { minX: -294, maxX: 294, minZ: -294, maxZ: 424 };
}

// --- input ---------------------------------------------------------------

// True when any of the given codes is pressed. G.input may expose a Set
// (`keys`), a plain object of booleans, an array, or per-action booleans.
export function keyDown(G, ...codes) {
  const input = G.input;
  if (!input) return false;
  if (typeof input.isDown === 'function') {
    return codes.some((c) => input.isDown(c));
  }
  const keys = input.keys;
  if (keys instanceof Set) return codes.some((c) => keys.has(c));
  if (Array.isArray(keys)) return codes.some((c) => keys.includes(c));
  if (keys && typeof keys === 'object') return codes.some((c) => keys[c] === true);
  return codes.some((c) => input[c] === true);
}

export function moveInput(G) {
  return {
    forward: keyDown(G, 'KeyW', 'ArrowUp'),
    back: keyDown(G, 'KeyS', 'ArrowDown'),
    left: keyDown(G, 'KeyA', 'ArrowLeft'),
    right: keyDown(G, 'KeyD', 'ArrowRight'),
    run: keyDown(G, 'ShiftLeft', 'ShiftRight'),
    jump: keyDown(G, 'Space'),
  };
}

// --- pure movement math (unit-testable, no G needed) ----------------------

// Velocity (x, z) for a walk input, in world axes. W = -z, S = +z.
export function walkVelocity(input, speed) {
  let x = 0;
  let z = 0;
  if (input.forward) z -= 1;
  if (input.back) z += 1;
  if (input.left) x -= 1;
  if (input.right) x += 1;
  const len = Math.hypot(x, z);
  if (len === 0) return { x: 0, z: 0, moving: false };
  return { x: (x / len) * speed, z: (z / len) * speed, moving: true };
}

// One gravity step for a jump/fall. Returns { y, vy, grounded }.
export function gravityStep(y, vy, dt, gravity = GRAVITY) {
  const nextVy = vy - gravity * dt;
  let nextY = y + nextVy * dt;
  if (nextY <= 0) return { y: 0, vy: 0, grounded: true };
  return { y: nextY, vy: nextVy, grounded: false };
}

export function clampToBounds(pos, bounds) {
  const b = typeof bounds === 'number'
    ? { minX: -bounds, maxX: bounds, minZ: -bounds, maxZ: bounds + 130 }
    : (bounds ?? { minX: -294, maxX: 294, minZ: -294, maxZ: 424 });
  pos.x = Math.max(b.minX, Math.min(b.maxX, pos.x));
  pos.z = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
  return pos;
}

// --- money / health ------------------------------------------------------
// Money and health are canonical on G itself (G.money, G.health — main.js
// and save.js read and write them there). G.player.health mirrors
// G.health for the HUD fallback and for tests without main.js.

export function getMoney(G) {
  return typeof G.money === 'number' ? G.money : 0;
}

export function getHealth(G) {
  if (typeof G.health === 'number') return G.health;
  if (G.player && typeof G.player.health === 'number') return G.player.health;
  return HEALTH_MAX;
}

export function setHealth(G, value) {
  const v = Math.max(0, Math.min(HEALTH_MAX, value));
  G.health = v;
  if (G.player) G.player.health = v;
  return v;
}

export function addMoney(G, amount) {
  G.money = Math.max(0, getMoney(G) + amount);
  return G.money;
}

export function damagePlayer(G, amount, source) {
  const p = G.player;
  const hp = getHealth(G);
  if (!p || hp <= 0 || G.state === 'wasted' || G.state === 'busted') return false;
  setHealth(G, hp - amount);
  p.lastDamageAt = G.time ? G.time.t : 0;
  p.lastDamageSource = source ?? 'unknown';
  if (G.hud && typeof G.hud.flashDamage === 'function') G.hud.flashDamage();
  if (getHealth(G) <= 0) {
    // State transitions belong to main.js: it listens for 'wasted' and
    // shows the end screen. Never set G.state here.
    emit(G, 'wasted', { source: p.lastDamageSource });
    if (G.audio && typeof G.audio.play === 'function') G.audio.play('wasted');
  }
  return true;
}

export function healPlayer(G, amount) {
  return setHealth(G, getHealth(G) + amount);
}

function emit(G, name, data) {
  if (G.events && typeof G.events.emit === 'function') G.events.emit(name, data);
}

// --- vehicles ------------------------------------------------------------

export function nearestVehicle(G, maxDist) {
  const list = (G.vehicles && G.vehicles.list) || [];
  const p = G.player.pos;
  let best = null;
  let bestD = maxDist;
  for (const v of list) {
    const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z);
    if (d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

// E: enter the nearest car, or step out of the one being driven.
export function tryEnterExitVehicle(G) {
  const p = G.player;
  if (!p.onFoot && p.vehicle) {
    exitVehicle(G);
    return 'exit';
  }
  if (!p.onFoot) return null;
  const v = nearestVehicle(G, ENTER_RADIUS);
  if (!v) return null;
  enterVehicle(G, v);
  return 'enter';
}

export function enterVehicle(G, v) {
  const p = G.player;
  const wasStolen = !v.owned;
  p.onFoot = false;
  p.vehicle = v;
  v.driver = 'player';
  if (G.vehicles) G.vehicles.playerVehicle = v;
  if (wasStolen) {
    v.owned = true; // Rook keeps what he takes — until the cops notice.
    if (G.stats) G.stats.carsStolen = (G.stats.carsStolen ?? 0) + 1;
    if (G.police && typeof G.police.addHeat === 'function') G.police.addHeat(25, 'theft');
    emit(G, 'car-stolen', { model: v.model });
    if (G.audio && typeof G.audio.play === 'function') G.audio.play('steal');
    if (G.hud && typeof G.hud.showMessage === 'function') {
      G.hud.showMessage('Car stolen — the cops noticed!');
    }
  }
  if (G.audio && typeof G.audio.play === 'function') G.audio.play('door');
}

export function exitVehicle(G) {
  const p = G.player;
  const v = p.vehicle;
  if (!v) return;
  // Step out to the driver's side, clear of the car body.
  const side = { x: Math.cos(v.heading + Math.PI / 2), z: -Math.sin(v.heading + Math.PI / 2) };
  p.pos.x = v.pos.x + side.x * 2.2;
  p.pos.y = 0;
  p.pos.z = v.pos.z + side.z * 2.2;
  p.heading = v.heading;
  p.onFoot = true;
  p.vehicle = null;
  v.driver = null;
  if (G.vehicles) G.vehicles.playerVehicle = null;
  if (G.world && typeof G.world.collide === 'function') G.world.collide(p.pos, PLAYER_RADIUS);
  if (G.audio && typeof G.audio.play === 'function') G.audio.play('door');
}

// --- mesh (THREE only when the global exists) ----------------------------

function buildMesh(G) {
  if (typeof THREE === 'undefined') return null;
  const group = new THREE.Group();
  const jacket = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.9, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x8a2f2f }),
  );
  jacket.position.y = 1.05;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.42, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xd9a066 }),
  );
  head.position.y = 1.75;
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.7, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x222831 }),
  );
  legs.position.y = 0.35;
  group.add(jacket, head, legs);
  if (G.scene) G.scene.add(group);
  return group;
}

// --- lifecycle -----------------------------------------------------------

export function init(G) {
  const tune = tuning(G);
  // Spawn at Meridian Plaza (the world's spawn landmark) when the world
  // provides it; a random road spot otherwise.
  const lm = G.world && G.world.landmarks;
  const start = lm && lm.spawn
    ? { x: lm.spawn.x, z: lm.spawn.z }
    : (G.world && typeof G.world.randomRoadPos === 'function')
      ? G.world.randomRoadPos(G.rng)
      : { x: 0, z: 0 };
  if (typeof G.health !== 'number') G.health = tune.health;
  // Replace the (frozen) module namespace on G with the live player
  // object: state fields plus the update() the main loop calls on it.
  G.player = {
    pos: { x: start.x, y: 0, z: start.z },
    heading: Math.PI,
    speed: 0,
    onFoot: true,
    vehicle: null,
    health: G.health,
    vy: 0,
    grounded: true,
    lastDamageAt: -99,
    lastDamageSource: null,
    mesh: null,
    moving: false,
    update,
    enterVehicle: (v) => enterVehicle(G, v),
    exitVehicle: () => exitVehicle(G),
  };
  G.player.mesh = buildMesh(G);
  return G.player;
}

export function update(G, dt) {
  const p = G.player;
  if (!p || G.state !== 'playing') return;

  // E: enter / exit the nearest car (edge-triggered via justPressed).
  if (G.input && G.input.justPressed && G.input.justPressed.KeyE) {
    tryEnterExitVehicle(G);
  }

  if (!p.onFoot && p.vehicle) {
    // Driving: the car owns the position; Rook rides along.
    p.pos.x = p.vehicle.pos.x;
    p.pos.z = p.vehicle.pos.z;
    p.pos.y = 0;
    p.heading = p.vehicle.heading;
    p.speed = Math.abs(p.vehicle.speed ?? 0);
    if (p.mesh) p.mesh.visible = false;
    return;
  }
  if (p.mesh) p.mesh.visible = true;

  const tune = tuning(G);
  const input = moveInput(G);
  const speed = input.run ? tune.run : tune.walk;
  const vel = walkVelocity(input, speed);
  p.moving = vel.moving;
  p.speed = vel.moving ? speed : 0;
  if (vel.moving) p.heading = Math.atan2(vel.x, -vel.z);

  p.pos.x += vel.x * dt;
  p.pos.z += vel.z * dt;

  // Jump / fall.
  if (input.jump && p.grounded) {
    p.vy = tune.jump;
    p.grounded = false;
  }
  if (!p.grounded || p.pos.y > 0) {
    const step = gravityStep(p.pos.y, p.vy, dt, tune.gravity);
    p.pos.y = step.y;
    p.vy = step.vy;
    p.grounded = step.grounded;
  }

  if (G.world) {
    if (typeof G.world.collide === 'function') G.world.collide(p.pos, PLAYER_RADIUS);
    clampToBounds(p.pos, boundsOf(G));
  }

  // Slow health regen after a quiet spell (canonical health lives on G).
  const now = G.time ? G.time.t : 0;
  const hp = getHealth(G);
  if (hp > 0 && hp < HEALTH_MAX && now - p.lastDamageAt > REGEN_DELAY) {
    setHealth(G, hp + HEALTH_REGEN * dt);
  }

  if (p.mesh) {
    p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
    p.mesh.rotation.y = p.heading;
    // Simple walk bob so the run reads on screen.
    p.mesh.position.y = p.pos.y + (p.moving ? Math.abs(Math.sin(now * 11)) * 0.06 : 0);
  }
}
