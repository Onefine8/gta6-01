// combat.js — guns: pistol and SMG for Rook, Kroll gunmen who shoot back.
// Shooting is a hitscan check against enemies in a cone in front of the
// player; enemies advance, strafe and fire with inaccuracy. Owns G.combat.
// Gunfire scares peds and raises the heat when the police are near.

import * as configModule from './config.js';
import * as randomModule from './random.js';

const CFG = configModule.CONFIG ?? configModule.default ?? {};
const mulberry32 = randomModule.mulberry32 ?? randomModule.default ?? null;

// ---------------------------------------------------------------- helpers

function cfg(G, key, fallback) {
  const c = G.cfg ?? CFG;
  const v = c == null ? undefined : c[key];
  return v === undefined || v === null ? fallback : v;
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

function emit(G, name, data) {
  try {
    G.events?.emit?.(name, data);
  } catch (e) { /* best-effort */ }
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

// ---------------------------------------------------------------- pure data + math (tested)

/** Weapon stats. Pure data. */
export const WEAPONS = {
  pistol: { damage: 25, rate: 0.35, range: 60, magSize: 12, spread: 0.02, name: 'Pistol' },
  smg: { damage: 14, rate: 0.09, range: 45, magSize: 30, spread: 0.06, name: 'SMG' },
};

/** Enemy kinds. Pure data. */
export const ENEMY_KINDS = {
  gunman: { health: 50, speed: 3.2, damage: 8, fireInterval: 1.6, accuracy: 0.35, range: 35 },
  bruiser: { health: 120, speed: 2.4, damage: 12, fireInterval: 2.2, accuracy: 0.3, range: 30 },
  boss: { health: 300, speed: 3.6, damage: 15, fireInterval: 1.1, accuracy: 0.45, range: 40 },
};

/** Weapon stats by name, or the pistol as a safe default. Pure. */
export function weaponStats(name) {
  return WEAPONS[name] ?? WEAPONS.pistol;
}

/**
 * Hitscan test: is `target` inside the shooter's cone (aim direction
 * `heading`, half-angle `spread`) and within `range`? Pure.
 */
export function inFiringCone(shooterPos, heading, targetPos, range, halfAngle) {
  const dx = targetPos.x - shooterPos.x;
  const dz = targetPos.z - shooterPos.z;
  const d = Math.hypot(dx, dz);
  if (d > range || d < 0.001) return d < 0.001;
  const dot = (dx * Math.sin(heading) + dz * Math.cos(heading)) / d;
  return dot > Math.cos(halfAngle);
}

/** Pick the best target: nearest enemy inside the cone. Pure. */
export function pickTarget(shooterPos, heading, enemies, range, halfAngle) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!e || e.health <= 0) continue;
    if (!inFiringCone(shooterPos, heading, e.pos, range, halfAngle)) continue;
    const d = Math.hypot(e.pos.x - shooterPos.x, e.pos.z - shooterPos.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Damage after range falloff: full inside half range, half at max. Pure. */
export function damageAtRange(base, dist, range) {
  if (dist <= range / 2) return base;
  const f = 1 - (dist - range / 2) / range;
  return Math.max(1, Math.round(base * f));
}

// ---------------------------------------------------------------- meshes

function buildEnemyMesh(G, kind) {
  const T = three();
  if (!T) return null;
  const group = new T.Group();
  const jacket = kind === 'boss' ? 0x8a1a1a : 0x3a3a3a;
  const skin = 0xc9976b;
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
  const gun = new T.Mesh(
    new T.BoxGeometry(0.08, 0.08, 0.5),
    new T.MeshLambertMaterial({ color: 0x111111 }),
  );
  gun.position.set(0.3, 1.15, 0.3);
  group.add(body, head, gun);
  // Health bar: a thin red box above the head, scaled by health.
  const bar = new T.Mesh(
    new T.BoxGeometry(0.6, 0.08, 0.02),
    new T.MeshBasicMaterial({ color: 0xff3333 }),
  );
  bar.position.y = 1.95;
  group.add(bar);
  group.userData.bar = bar;
  group.traverse((o) => { o.castShadow = true; });
  return group;
}

function buildTracer(G, from, to) {
  const T = three();
  if (!T) return null;
  const geo = new T.BufferGeometry();
  const verts = new Float32Array([from.x, from.y, from.z, to.x, to.y, to.z]);
  geo.setAttribute('position', new T.BufferAttribute(verts, 3));
  const line = new T.Line(geo, new T.LineBasicMaterial({ color: 0xffee88 }));
  G.scene?.add?.(line);
  return line;
}

// ---------------------------------------------------------------- module

export function init(G) {
  const rng = rngFn(G);
  G.combat = {
    enemies: [],
    tracers: [],
    cooldown: 0,
    reloadTimer: 0,
    reloading: false,
    _rng: rng,
    _mouseDown: false,

    /** Spawn an armed enemy at (x, z). Returns the enemy. */
    spawnEnemy(opts = {}) {
      const kind = opts.kind || 'gunman';
      const spec = ENEMY_KINDS[kind] ?? ENEMY_KINDS.gunman;
      const e = {
        id: G.combat.enemies.length + 1,
        kind,
        pos: { x: opts.x ?? 0, y: 0, z: opts.z ?? 0 },
        heading: opts.heading ?? 0,
        health: spec.health,
        maxHealth: spec.health,
        speed: spec.speed,
        damage: spec.damage,
        fireInterval: spec.fireInterval,
        accuracy: spec.accuracy,
        range: spec.range,
        fireTimer: 0.5 + rng() * 1.5,
        strafeDir: rng() < 0.5 ? 1 : -1,
        strafeTimer: 0,
        mesh: null,
      };
      const mesh = buildEnemyMesh(G, kind);
      if (mesh) {
        mesh.position.set(e.pos.x, 0, e.pos.z);
        e.mesh = mesh;
        G.scene?.add?.(mesh);
      }
      G.combat.enemies.push(e);
      return e;
    },

    /** Remove an enemy (mesh + list). */
    removeEnemy(e) {
      const i = G.combat.enemies.indexOf(e);
      if (i >= 0) G.combat.enemies.splice(i, 1);
      if (e.mesh) G.scene?.remove?.(e.mesh);
    },

    /** Damage an enemy; kills it at 0 health (drops cash, may raise heat). */
    damageEnemy(e, amount, sourcePos) {
      if (!e || e.health <= 0) return false;
      e.health -= amount;
      if (e.health <= 0) {
        e.health = 0;
        const bounty = e.kind === 'boss' ? 500 : e.kind === 'bruiser' ? 150 : 75;
        if (G.player) G.player.money += bounty;
        emit(G, 'enemy-killed', { kind: e.kind, bounty });
        sfx(G, 'kill');
        // A killing in view of a cop is a crime.
        if (G.police?.wanted !== undefined) {
          const nearCop = (G.police.cops ?? []).some((c) => {
            const v = c.vehicle;
            return v && Math.hypot(v.pos.x - e.pos.x, v.pos.z - e.pos.z) < 40;
          });
          if (nearCop) G.police.addWanted(30, 'murder');
        }
        G.combat.removeEnemy(e);
        return true;
      }
      return false;
    },

    /** Fire the player's current weapon once (if able). */
    shoot() {
      const p = G.player;
      const c = G.combat;
      if (!p || !p.onFoot || c.cooldown > 0 || c.reloading) return false;
      const w = weaponStats(p.weapon);
      if ((p.mag[p.weapon] ?? 0) <= 0) {
        c.startReload();
        return false;
      }
      p.mag[p.weapon] -= 1;
      c.cooldown = w.rate;
      const origin = { x: p.pos.x, y: p.pos.y + 1.4, z: p.pos.z };
      const aim = p.heading + (rng() - 0.5) * w.spread * 4;
      const target = pickTarget(p.pos, aim, c.enemies, w.range, 0.22);
      const end = target
        ? { x: target.pos.x, y: 1.2, z: target.pos.z }
        : {
            x: p.pos.x + Math.sin(aim) * w.range,
            y: 1.4,
            z: p.pos.z + Math.cos(aim) * w.range,
          };
      const tracer = buildTracer(G, origin, end);
      if (tracer) c.tracers.push({ line: tracer, life: 0.08 });
      sfx(G, p.weapon === 'smg' ? 'shot-smg' : 'shot');
      emit(G, 'gunshot', { x: p.pos.x, z: p.pos.z, weapon: p.weapon });
      emit(G, 'shot-fired', {}); // render.js shakes the camera on this
      G.peds?.scare?.(p.pos, 30);
      if (target) {
        const d = Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
        c.damageEnemy(target, damageAtRange(w.damage, d, w.range), p.pos);
      }
      if ((p.mag[p.weapon] ?? 0) === 0) c.startReload();
      return true;
    },

    /** Start reloading the current weapon from reserve ammo. */
    startReload() {
      const p = G.player;
      const c = G.combat;
      if (!p || c.reloading) return;
      const w = weaponStats(p.weapon);
      const reserve = p.ammo[p.weapon] ?? 0;
      if (reserve <= 0) return; // dry: no ammo left at all
      c.reloading = true;
      c.reloadTimer = 1.1;
      sfx(G, 'reload');
    },

    /** Finish a reload: move ammo from reserve into the magazine. */
    finishReload() {
      const p = G.player;
      const c = G.combat;
      if (!p) return;
      const w = weaponStats(p.weapon);
      const need = w.magSize - (p.mag[p.weapon] ?? 0);
      const take = Math.min(need, p.ammo[p.weapon] ?? 0);
      p.mag[p.weapon] = (p.mag[p.weapon] ?? 0) + take;
      p.ammo[p.weapon] = (p.ammo[p.weapon] ?? 0) - take;
      c.reloading = false;
      emit(G, 'reloaded', { weapon: p.weapon, mag: p.mag[p.weapon] });
    },
  };

  // Mouse: track the button through G.input when it exposes it.
  try {
    G.events?.on?.('mousedown', () => { G.combat._mouseDown = true; });
    G.events?.on?.('mouseup', () => { G.combat._mouseDown = false; });
  } catch (e) { /* best-effort */ }

  return G.combat;
}

export function update(G, dt) {
  const c = G.combat;
  if (!c || G.state !== 'playing') return;
  dt = Math.min(dt, 0.05);
  const p = G.player;
  c.cooldown = Math.max(0, c.cooldown - dt);
  if (c.reloading) {
    c.reloadTimer -= dt;
    if (c.reloadTimer <= 0) c.finishReload();
  }

  // Tracers fade fast.
  for (const t of [...c.tracers]) {
    t.life -= dt;
    if (t.life <= 0) {
      G.scene?.remove?.(t.line);
      c.tracers.splice(c.tracers.indexOf(t), 1);
    }
  }

  // Player fire: mouse held, or F as a keyboard fallback.
  const mouseDown = G.input && typeof G.input.isMouseDown === 'function'
    ? G.input.isMouseDown() : false;
  const keyF = G.input && typeof G.input.isDown === 'function'
    ? G.input.isDown('KeyF') : false;
  const firing = c._mouseDown || mouseDown || keyF;
  if (firing && p?.onFoot) c.shoot();

  if (!p) return;
  const playerPos = p.inVehicle && p.vehicle ? p.vehicle.pos : p.pos;

  // Enemy AI: close in, strafe, shoot.
  for (const e of [...c.enemies]) {
    const dx = playerPos.x - e.pos.x;
    const dz = playerPos.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    e.heading = Math.atan2(dx, dz);

    // Strafe sideways while in range, advance while far.
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) {
      e.strafeDir *= -1;
      e.strafeTimer = 0.8 + c._rng() * 1.2;
    }
    let mx = 0;
    let mz = 0;
    if (d > e.range * 0.8) {
      mx = (dx / (d || 1)) * e.speed;
      mz = (dz / (d || 1)) * e.speed;
    } else if (d < 8) {
      mx = (-dx / (d || 1)) * e.speed * 0.5;
      mz = (-dz / (d || 1)) * e.speed * 0.5;
    }
    // Strafe perpendicular.
    mx += Math.cos(e.heading) * e.strafeDir * e.speed * 0.4;
    mz += -Math.sin(e.heading) * e.strafeDir * e.speed * 0.4;
    e.pos.x += mx * dt;
    e.pos.z += mz * dt;

    // Buildings push enemies out too.
    if (G.world?.collide) {
      try {
        G.world.collide(e.pos, 0.6);
      } catch (err) { /* best-effort */ }
    }

    // Fire at the player.
    e.fireTimer -= dt;
    if (e.fireTimer <= 0 && d < e.range) {
      e.fireTimer = e.fireInterval * (0.8 + c._rng() * 0.4);
      const hit = c._rng() < e.accuracy * (1 - clamp(d / e.range, 0, 0.6));
      const from = { x: e.pos.x, y: 1.3, z: e.pos.z };
      const to = hit
        ? { x: playerPos.x, y: 1.2, z: playerPos.z }
        : {
            x: playerPos.x + (c._rng() - 0.5) * 6,
            y: 1.2,
            z: playerPos.z + (c._rng() - 0.5) * 6,
          };
      const tracer = buildTracer(G, from, to);
      if (tracer) c.tracers.push({ line: tracer, life: 0.08 });
      sfx(G, 'shot-enemy');
      emit(G, 'gunshot', { x: e.pos.x, z: e.pos.z, weapon: 'enemy' });
      if (hit) p.damage(e.damage, `Kroll ${e.kind}`);
    }

    // Mesh sync + health bar.
    if (e.mesh) {
      e.mesh.position.set(e.pos.x, 0, e.pos.z);
      e.mesh.rotation.y = e.heading;
      const bar = e.mesh.userData?.bar;
      if (bar) {
        const f = Math.max(0.001, e.health / e.maxHealth);
        bar.scale.x = f;
        bar.visible = e.health < e.maxHealth;
      }
    }
  }
}
