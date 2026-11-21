// combat.js — weapons, shooting, enemy AI and player/enemy health.
//
// Owns G.combat. The player shoots where Rook faces (heading) with the
// mouse or F; enemies are simple state machines that shoot back when close.
// Hit testing is a pure ray-vs-circle check exported for tests. Enemy
// spawns are requested by missions.js through G.combat.spawnEnemy —
// combat never imports missions. Player damage from enemy fire is applied
// here (the combat-side path) so this module stays decoupled from player.js.

export const WEAPONS = {
  pistol: { name: 'P9 Pistol', damage: 34, range: 60, rate: 0.35, mag: 12, spread: 0.02, auto: false },
  smg: { name: 'VK-9 SMG', damage: 14, range: 45, rate: 0.09, mag: 30, spread: 0.07, auto: true },
};

export const ENEMY_HEALTH = 100;
export const ENEMY_SHOOT_RANGE = 38;
export const ENEMY_SHOOT_INTERVAL = 1.25;
export const ENEMY_DAMAGE = 8;

// Weapon numbers come from G.cfg.COMBAT when present; the WEAPONS table
// above is the standalone fallback used by tests.
export function tuning(G) {
  const c = (G && G.cfg && G.cfg.COMBAT) || {};
  return {
    weapons: {
      pistol: {
        ...WEAPONS.pistol,
        damage: c.PISTOL_DAMAGE ?? WEAPONS.pistol.damage,
        rate: c.PISTOL_RATE ?? WEAPONS.pistol.rate,
        range: c.PISTOL_RANGE ?? WEAPONS.pistol.range,
        mag: c.PISTOL_MAG ?? WEAPONS.pistol.mag,
      },
      smg: {
        ...WEAPONS.smg,
        damage: c.SMG_DAMAGE ?? WEAPONS.smg.damage,
        rate: c.SMG_RATE ?? WEAPONS.smg.rate,
        range: c.SMG_RANGE ?? WEAPONS.smg.range,
        mag: c.SMG_MAG ?? WEAPONS.smg.mag,
      },
    },
    enemyHealth: c.ENEMY_HEALTH ?? ENEMY_HEALTH,
    enemyDamage: c.ENEMY_DAMAGE ?? ENEMY_DAMAGE,
    enemyRange: c.ENEMY_RANGE ?? ENEMY_SHOOT_RANGE,
  };
}

// --- pure shooting math --------------------------------------------------

// Ray (origin + dir) against circular targets { pos, radius }. Returns the
// nearest hit { target, dist } inside `range`, or null.
export function shootRay(origin, dir, targets, range) {
  let best = null;
  let bestD = range;
  const dx = dir.x;
  const dz = dir.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  for (const t of targets) {
    const rx = t.pos.x - origin.x;
    const rz = t.pos.z - origin.z;
    const along = rx * ux + rz * uz;
    if (along < 0 || along > bestD) continue;
    const px = origin.x + ux * along;
    const pz = origin.z + uz * along;
    const perp = Math.hypot(t.pos.x - px, t.pos.z - pz);
    const radius = t.radius ?? 0.9;
    if (perp <= radius && along < bestD) {
      best = { target: t, dist: along };
      bestD = along;
    }
  }
  return best;
}

export function applySpread(dir, spread, rng) {
  const r = () => (rng && typeof rng.next === 'function' ? rng.next() : Math.random());
  const a = Math.atan2(dir.x, -dir.z) + (r() - 0.5) * 2 * spread;
  return { x: Math.sin(a), z: -Math.cos(a) };
}

// Enemy hit chance falls off with distance: 0.55 up close, 0.15 at range.
export function enemyHitChance(dist) {
  if (dist < 10) return 0.55;
  if (dist > ENEMY_SHOOT_RANGE) return 0;
  return 0.55 - ((dist - 10) / (ENEMY_SHOOT_RANGE - 10)) * 0.4;
}

// --- player damage (combat-side path) ------------------------------------
// Canonical health lives on G (G.health); G.player.health mirrors it.
// Only emits 'wasted' — main.js owns the state transition + end screen.

export function applyDamageToPlayer(G, amount, source) {
  const p = G.player;
  const hp = typeof G.health === 'number' ? G.health : (p && p.health) ?? 100;
  if (!p || hp <= 0 || G.state === 'wasted' || G.state === 'busted') return false;
  const next = Math.max(0, hp - amount);
  G.health = next;
  p.health = next;
  p.lastDamageAt = G.time ? G.time.t : 0;
  p.lastDamageSource = source ?? 'enemy';
  if (next <= 0) {
    if (G.events && typeof G.events.emit === 'function') {
      G.events.emit('wasted', { source: p.lastDamageSource });
    }
  }
  return true;
}

// --- enemies -------------------------------------------------------------

export function spawnEnemy(G, x, z, opts = {}) {
  const e = {
    pos: { x, y: 0, z },
    heading: 0,
    health: opts.health ?? tuning(G).enemyHealth,
    radius: 0.9,
    shootTimer: 0.6 + Math.random() * 0.8,
    state: 'combat',
    alive: true,
    mesh: null,
    kind: opts.kind ?? 'kroll',
  };
  e.mesh = buildEnemyMesh(G, e);
  G.combat.enemies.push(e);
  return e;
}

export function damageEnemy(G, e, amount) {
  if (!e || !e.alive) return false;
  e.health -= amount;
  if (e.health <= 0) {
    e.alive = false;
    if (e.mesh && G.scene) G.scene.remove(e.mesh);
    if (G.events && typeof G.events.emit === 'function') {
      G.events.emit('enemy-down', { kind: e.kind });
    }
    if (G.police && typeof G.police.addHeat === 'function') {
      G.police.addHeat(6, 'shooting');
    }
  }
  return true;
}

function buildEnemyMesh(G, e) {
  if (typeof THREE === 'undefined') return null;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.85, 0.35),
    new THREE.MeshStandardMaterial({ color: e.kind === 'kroll' ? 0x2b2b2b : 0x4a3a1a }),
  );
  body.position.y = 1.0;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.36, 0.36),
    new THREE.MeshStandardMaterial({ color: 0xc98a5a }),
  );
  head.position.y = 1.65;
  group.add(body, head);
  group.position.set(e.pos.x, 0, e.pos.z);
  if (G.scene) G.scene.add(group);
  return group;
}

// --- player shooting -----------------------------------------------------

function shootPressed(G) {
  const input = G.input;
  if (!input) return false;
  if (input.mouseDown === true) return true;
  const keys = input.keys;
  if (keys && typeof keys === 'object') {
    if (keys.Mouse0 === true || keys.KeyF === true) return true;
  }
  if (keys instanceof Set) return keys.has('KeyF') || keys.has('Mouse0');
  return false;
}

function tryShoot(G) {
  const c = G.combat;
  const p = G.player;
  const w = (c.tuning?.weapons ?? WEAPONS)[c.weapon];
  if (!p || (typeof G.health === 'number' ? G.health : p.health) <= 0) return;
  if (c.ammo <= 0) {
    if (G.audio && typeof G.audio.play === 'function') G.audio.play('dryfire');
    return;
  }
  c.ammo -= 1;
  c.cooldown = w.rate;
  const origin = { x: p.pos.x, y: 1.4, z: p.pos.z };
  const base = { x: Math.sin(p.heading), z: -Math.cos(p.heading) };
  const dir = applySpread(base, w.spread, G.rng);
  const hit = shootRay(origin, dir, c.enemies.filter((e) => e.alive), w.range);
  c.lastShotAt = G.time ? G.time.t : 0;
  c.lastShotPos = { x: p.pos.x, z: p.pos.z };
  if (G.audio && typeof G.audio.play === 'function') G.audio.play('shot');
  if (hit) {
    damageEnemy(G, hit.target, w.damage);
    if (G.hud && typeof G.hud.showMessage === 'function' && !hit.target.alive) {
      G.hud.showMessage('Target down.');
    }
  }
  if (G.events && typeof G.events.emit === 'function') {
    G.events.emit('shot', { weapon: c.weapon, hit: !!hit });
  }
}

function reload(G) {
  const c = G.combat;
  const w = (c.tuning?.weapons ?? WEAPONS)[c.weapon];
  if (c.ammo >= w.mag) return;
  c.ammo = w.mag;
  c.cooldown = Math.max(c.cooldown, 0.6);
  if (G.audio && typeof G.audio.play === 'function') G.audio.play('reload');
}

function switchWeapon(G, name) {
  const c = G.combat;
  const table = c.tuning?.weapons ?? WEAPONS;
  if (!table[name] || c.weapon === name) return;
  c.weapon = name;
  c.ammo = table[name].mag;
  c.cooldown = 0.25;
  if (G.hud && typeof G.hud.showMessage === 'function') {
    G.hud.showMessage(table[name].name + ' equipped.');
  }
}

// --- lifecycle -----------------------------------------------------------

export function init(G) {
  const t = tuning(G);
  // Replace the (frozen) module namespace on G with the live combat
  // object: weapon state plus update() and the spawnEnemy() /
  // switchWeapon() missions.js and the menu call.
  G.combat = {
    weapon: 'pistol',
    ammo: t.weapons.pistol.mag,
    enemies: [],
    cooldown: 0,
    lastShotAt: -99,
    lastShotPos: null,
    tuning: t,
    update,
    spawnEnemy: (x, z, opts) => spawnEnemy(G, x, z, opts),
    switchWeapon: (name) => switchWeapon(G, name),
  };
  return G.combat;
}

export function update(G, dt) {
  const c = G.combat;
  if (!c || G.state !== 'playing') return;
  const p = G.player;
  c.cooldown = Math.max(0, c.cooldown - dt);

  // Weapon keys (edge-triggered): 1 pistol, 2 SMG, Q next weapon, R reload.
  const jp = (G.input && G.input.justPressed) || {};
  if (jp.Digit1) switchWeapon(G, 'pistol');
  if (jp.Digit2) switchWeapon(G, 'smg');
  if (jp.KeyQ) switchWeapon(G, c.weapon === 'pistol' ? 'smg' : 'pistol');
  if (jp.KeyR) reload(G);

  if (shootPressed(G) && c.cooldown <= 0) tryShoot(G);

  // Enemy AI: face Rook, shoot when in range.
  const range = c.tuning?.enemyRange ?? ENEMY_SHOOT_RANGE;
  const dmg = c.tuning?.enemyDamage ?? ENEMY_DAMAGE;
  for (const e of c.enemies) {
    if (!e.alive) continue;
    const dx = p.pos.x - e.pos.x;
    const dz = p.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    e.heading = Math.atan2(dx, -dz);
    e.shootTimer -= dt;
    if (dist < range && e.shootTimer <= 0) {
      e.shootTimer = ENEMY_SHOOT_INTERVAL * (0.9 + Math.random() * 0.3);
      const r = G.rng && typeof G.rng.next === 'function' ? G.rng.next() : Math.random();
      if (r < enemyHitChance(dist)) {
        applyDamageToPlayer(G, dmg, 'kroll');
        if (G.audio && typeof G.audio.play === 'function') G.audio.play('hit');
      } else if (G.audio && typeof G.audio.play === 'function') {
        G.audio.play('shot-far');
      }
    }
    if (e.mesh) {
      e.mesh.position.set(e.pos.x, 0, e.pos.z);
      e.mesh.rotation.y = e.heading;
    }
  }

  // Drop dead enemies from the list (their meshes are already removed).
  if (c.enemies.some((e) => !e.alive)) {
    c.enemies = c.enemies.filter((e) => e.alive);
  }
}
