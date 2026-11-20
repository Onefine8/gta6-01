// Weapons and on-foot combat for Palmetto Bay Heat. Rico starts with his
// fists; everything else is bought, found or picked up off the street, and
// every gun is a small state machine: a magazine, a reserve, a reload
// timer, a cooldown between shots, and recoil that opens the spread up
// while Rico keeps firing.
//
// The four guns cover four jobs:
//   - Pistol: cheap, accurate, weak — the everyday carry.
//   - Shotgun: short range, huge damage up close, slow — the door-kicker.
//   - SMG: fast, wild, hungry for ammo — the spray-and-pray.
//   - Rifle: long range, hard hitting, slow — the rooftop answer.
//
// Combat is pure logic: a shot is a cone from Rico's position along his
// facing, targets are the pedestrians and police cars in the state, and
// damage falls off with range. Nothing here touches the canvas, the DOM
// or the network, so the headless tests can fire a thousand rounds.
import { WORLD } from './config.js';
import { damagePlayer } from './player.js';

export const AMMO_PRICE = 40; // one box of reserve ammo, any calibre
export const AMMO_BOX_ROUNDS = 24;

// One entry per gun. Damage is per pellet/hit at point blank; range is the
// far edge of the cone in world units; fireRate is shots per second;
// spread is the cone half-angle in radians at rest; recoil adds to the
// spread per shot and bleeds off over time; price is the shop price.
export const WEAPON_DEFS = [
  {
    id: 'pistol', name: 'P9 Pistol', damage: 34, range: 420, fireRate: 3.5,
    magSize: 12, reloadSeconds: 1.4, spread: 0.05, recoil: 0.03,
    pellets: 1, auto: false, price: 300, accuracy: 0.92,
    description: 'The everyday carry — cheap, accurate, and always in the glovebox.',
  },
  {
    id: 'shotgun', name: 'Street Sweeper 12', damage: 18, range: 260, fireRate: 1.1,
    magSize: 6, reloadSeconds: 2.6, spread: 0.16, recoil: 0.12,
    pellets: 6, auto: false, price: 900, accuracy: 0.7,
    description: 'Six pellets per trigger pull — devastating up close, useless far away.',
  },
  {
    id: 'smg', name: 'Bay SMG', damage: 16, range: 380, fireRate: 9,
    magSize: 30, reloadSeconds: 1.8, spread: 0.11, recoil: 0.05,
    pellets: 1, auto: true, price: 1500, accuracy: 0.78,
    description: 'Nine rounds a second. Wild, hungry, and very persuasive.',
  },
  {
    id: 'rifle', name: 'Palmetto Rifle', damage: 70, range: 720, fireRate: 1.6,
    magSize: 10, reloadSeconds: 2.2, spread: 0.02, recoil: 0.08,
    pellets: 1, auto: false, price: 2500, accuracy: 0.97,
    description: 'Long range, hard hitting — the rooftop answer to a street problem.',
  },
];

export function weaponById(id) {
  return WEAPON_DEFS.find((w) => w.id === id) || null;
}

// Fixed spots where a gun sits on the street, waiting to be picked up.
// A pickup respawns a while after Rico takes it, so the city never runs dry.
export const WEAPON_PICKUP_SPOTS = [
  { id: 'dock-pistol', weapon: 'pistol', x: 460, y: 1980, label: 'Harbor Market dock' },
  { id: 'park-shotgun', weapon: 'shotgun', x: 1400, y: 1080, label: 'Palmetto Park bench' },
  { id: 'roof-smg', weapon: 'smg', x: 2400, y: 400, label: 'Coral Heights rooftop' },
  { id: 'beach-rifle', weapon: 'rifle', x: 1600, y: 2260, label: 'Beachfront lifeguard hut' },
  { id: 'alley-pistol', weapon: 'pistol', x: 1200, y: 1200, label: 'Old Town alley' },
];

export const PICKUP_RADIUS = 36;
export const PICKUP_RESPAWN_SECONDS = 120;

export function createWeaponsState() {
  const inventory = {};
  for (const def of WEAPON_DEFS) {
    inventory[def.id] = { owned: false, mag: 0, reserve: 0 };
  }
  return {
    inventory,
    equipped: null, // weapon id, or null for fists
    aiming: false, // right-side aim: slower feet, tighter spread
    cooldown: 0, // seconds until the next shot may fire
    reloadTimer: 0, // >0 while a reload is in progress
    recoil: 0, // 0..1 spread bloom from sustained fire
    muzzleTimer: 0, // >0 while the muzzle flash shows
    shotsFired: 0,
    shotsHit: 0,
    kills: 0,
    pickups: WEAPON_PICKUP_SPOTS.map((s) => ({
      id: s.id, weapon: s.weapon, x: s.x, y: s.y, label: s.label,
      taken: false, respawnTimer: 0,
    })),
    lastShotAt: 0,
    elapsed: 0,
  };
}

// How many guns Rico owns right now.
export function ownedWeaponCount(weapons) {
  return WEAPON_DEFS.filter((d) => weapons.inventory[d.id].owned).length;
}

export function hasWeapon(weapons, id) {
  return !!weapons.inventory[id] && weapons.inventory[id].owned;
}

export function equippedWeapon(weapons) {
  if (!weapons.equipped) return null;
  return weaponById(weapons.equipped);
}

export function totalAmmo(weapons, id) {
  const slot = weapons.inventory[id];
  if (!slot) return 0;
  return slot.mag + slot.reserve;
}

// Why Rico cannot buy this gun right now, or null when he can. The shop
// is the Ammu-Nation counter on 5th Avenue — the check is the same shape
// as the business buy check, so the main loop can reuse its toast.
export function canBuyWeapon(state, id) {
  const def = weaponById(id);
  if (!def) return 'There is no such weapon.';
  if (hasWeapon(state.weapons, id)) return `You already own the ${def.name}.`;
  if (state.player.money < def.price) {
    return `${def.name} costs $${def.price} — you only have $${state.player.money}.`;
  }
  return null;
}

export function buyWeapon(state, id) {
  const def = weaponById(id);
  if (!def || canBuyWeapon(state, id)) return false;
  state.player.money -= def.price;
  const slot = state.weapons.inventory[id];
  slot.owned = true;
  slot.mag = def.magSize;
  slot.reserve = def.magSize;
  state.weapons.equipped = id;
  return true;
}

// A short message on the mission toast line, if the state carries one.
function tell(state, text, seconds) {
  if (state && state.missions) {
    state.missions.message = text;
    state.missions.messageTimer = seconds || 3;
  }
}

export function giveWeapon(weapons, id, reserveRounds) {
  const def = weaponById(id);
  if (!def) return false;
  const slot = weapons.inventory[id];
  slot.owned = true;
  slot.mag = def.magSize;
  slot.reserve = Math.max(slot.reserve, typeof reserveRounds === 'number' ? reserveRounds : def.magSize);
  if (!weapons.equipped) weapons.equipped = id;
  return true;
}

export function equipWeapon(weapons, id) {
  if (id === null) {
    weapons.equipped = null;
    weapons.aiming = false;
    weapons.reloadTimer = 0;
    return true;
  }
  if (!hasWeapon(weapons, id)) return false;
  weapons.equipped = id;
  weapons.reloadTimer = 0;
  return true;
}

// Cycle to the next owned gun (or back to fists after the last one).
export function cycleWeapon(weapons) {
  const owned = WEAPON_DEFS.filter((d) => weapons.inventory[d.id].owned).map((d) => d.id);
  if (owned.length === 0) {
    weapons.equipped = null;
    return null;
  }
  const current = owned.indexOf(weapons.equipped);
  const next = current < 0 || current >= owned.length - 1 ? owned[0] : owned[current + 1];
  // One more press past the last gun holsters the weapon entirely.
  if (current === owned.length - 1) {
    weapons.equipped = null;
    weapons.aiming = false;
    return null;
  }
  weapons.equipped = next;
  weapons.reloadTimer = 0;
  return next;
}

export function setAiming(weapons, aiming) {
  if (!weapons.equipped) {
    weapons.aiming = false;
    return false;
  }
  weapons.aiming = !!aiming;
  return weapons.aiming;
}

// Rico walks slower while aiming — the price of a steady hand. The main
// loop multiplies the on-foot speed by this when aiming is on.
export function aimSpeedFactor(weapons) {
  return weapons.aiming && weapons.equipped ? 0.55 : 1;
}

// The spread of the next shot: base spread, plus recoil bloom, minus the
// steadying effect of aiming. A rifle aimed is a laser; an SMG sprayed
// from the hip is a garden hose.
export function currentSpread(weapons) {
  const def = equippedWeapon(weapons);
  if (!def) return 0;
  let spread = def.spread + weapons.recoil * 0.25;
  if (weapons.aiming) spread *= 0.55;
  return spread;
}

export function canShoot(weapons) {
  if (!weapons.equipped) return false;
  const slot = weapons.inventory[weapons.equipped];
  if (!slot || !slot.owned) return false;
  if (weapons.cooldown > 0) return false;
  if (weapons.reloadTimer > 0) return false;
  return slot.mag > 0;
}

export function needsReload(weapons) {
  if (!weapons.equipped) return false;
  const slot = weapons.inventory[weapons.equipped];
  return slot.owned && slot.mag === 0 && slot.reserve > 0;
}

// Start a reload: the magazine refills from the reserve when the timer
// runs out. Returns false when there is nothing to reload with.
export function startReload(weapons) {
  if (!weapons.equipped) return false;
  const def = equippedWeapon(weapons);
  const slot = weapons.inventory[weapons.equipped];
  if (!def || !slot.owned) return false;
  if (weapons.reloadTimer > 0) return false;
  if (slot.mag >= def.magSize) return false;
  if (slot.reserve <= 0) return false;
  weapons.reloadTimer = def.reloadSeconds;
  return true;
}

function finishReload(weapons) {
  const def = equippedWeapon(weapons);
  if (!def) return;
  const slot = weapons.inventory[weapons.equipped];
  const need = def.magSize - slot.mag;
  const take = Math.min(need, slot.reserve);
  slot.mag += take;
  slot.reserve -= take;
  weapons.reloadTimer = 0;
}

// Buy a box of reserve ammo for the equipped gun (or a named one).
export function buyAmmo(state, id) {
  const wid = id || state.weapons.equipped;
  const def = weaponById(wid);
  if (!def) return false;
  if (!hasWeapon(state.weapons, wid)) return false;
  if (state.player.money < AMMO_PRICE) return false;
  state.player.money -= AMMO_PRICE;
  state.weapons.inventory[wid].reserve += AMMO_BOX_ROUNDS;
  return true;
}

export function addAmmo(weapons, id, rounds) {
  const slot = weapons.inventory[id];
  if (!slot || !slot.owned) return false;
  slot.reserve += Math.max(0, rounds);
  return true;
}

// Damage at a range: full damage up close, half at the far edge of the
// cone, nothing past it. Shotgun pellets fall off much faster — the
// range on the def is already short, and the falloff is steeper.
export function damageAtRange(def, dist) {
  if (dist >= def.range) return 0;
  const t = dist / def.range;
  const falloff = def.id === 'shotgun' ? 1 - t * t : 1 - t * 0.5;
  return Math.max(1, Math.round(def.damage * falloff));
}

// A target list for a shot: pedestrians (with health) and police cars
// (with health). Each entry needs x, y and a health field; the function
// never mutates the list shape, only health and fleeing flags.
function targetsInCone(state, ox, oy, angle, range, spread) {
  const found = [];
  const peds = state.peds || [];
  for (const ped of peds) {
    if (ped.health !== undefined && ped.health <= 0) continue;
    const d = Math.hypot(ped.x - ox, ped.y - oy);
    if (d > range || d < 1) continue;
    const want = Math.atan2(ped.y - oy, ped.x - ox);
    let diff = want - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= spread + 0.12) found.push({ target: ped, dist: d, kind: 'ped' });
  }
  const cars = [];
  if (state.police) cars.push(...(state.police.cars || []));
  if (state.traffic) cars.push(...state.traffic);
  for (const car of cars) {
    if (car.health !== undefined && car.health <= 0) continue;
    const d = Math.hypot(car.x - ox, car.y - oy);
    if (d > range || d < 1) continue;
    const want = Math.atan2(car.y - oy, car.x - ox);
    let diff = want - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= spread + 0.18) found.push({ target: car, dist: d, kind: 'car' });
  }
  found.sort((a, b) => a.dist - b.dist);
  return found;
}

// Fire the equipped gun once, from (ox, oy) along angle. Returns a shot
// report: whether it fired, why not, how many pellets hit, and what died.
// The report is what the tests and the HUD read; the state is mutated
// (ammo, cooldown, recoil, target health) as a side effect.
export function shootWeapon(state, ox, oy, angle, random) {
  const weapons = state.weapons;
  const rng = random || Math.random;
  const report = { fired: false, reason: '', hits: 0, damage: 0, killed: 0, weapon: weapons.equipped };
  if (!weapons.equipped) {
    report.reason = 'no weapon equipped';
    return report;
  }
  const def = equippedWeapon(weapons);
  const slot = weapons.inventory[weapons.equipped];
  if (!def || !slot.owned) {
    report.reason = 'weapon not owned';
    return report;
  }
  if (weapons.reloadTimer > 0) {
    report.reason = 'reloading';
    return report;
  }
  if (weapons.cooldown > 0) {
    report.reason = 'cooling down';
    return report;
  }
  if (slot.mag <= 0) {
    report.reason = 'magazine empty';
    if (slot.reserve > 0) startReload(weapons);
    return report;
  }
  slot.mag -= 1;
  weapons.cooldown = 1 / def.fireRate;
  weapons.recoil = Math.min(1, weapons.recoil + def.recoil);
  weapons.muzzleTimer = 0.07;
  weapons.shotsFired += 1;
  weapons.lastShotAt = weapons.elapsed;
  report.fired = true;
  const spread = currentSpread(weapons);
  const candidates = targetsInCone(state, ox, oy, angle, def.range, spread);
  // Each pellet rolls its own hit: accuracy is the per-pellet chance when
  // a target is in the cone at all. A miss still counts as fired, and the
  // noise alone is enough to startle pedestrians and draw the law.
  let pelletsHit = 0;
  let damageDone = 0;
  let killed = 0;
  for (let p = 0; p < def.pellets; p += 1) {
    if (candidates.length === 0) break;
    const pickIdx = Math.min(candidates.length - 1, Math.floor(rng() * Math.min(2, candidates.length)));
    const entry = candidates[pickIdx];
    if (rng() > def.accuracy) continue;
    const dmg = damageAtRange(def, entry.dist);
    pelletsHit += 1;
    damageDone += dmg;
    const t = entry.target;
    t.health = Math.max(0, (t.health ?? 100) - dmg);
    if (entry.kind === 'ped') {
      t.fleeing = true;
      t.fleeTimer = 5;
      if (t.bodyguard) t.fleeing = false;
    }
    if (t.health <= 0) {
      killed += 1;
      if (entry.kind === 'ped' && t.bodyguard) {
        // A bodyguard shot down counts for the Kingpin Takedown fight step.
        if (state.missions && typeof state.missions.fightDown === 'number') {
          state.missions.fightDown += 1;
        }
      }
    }
  }
  weapons.shotsHit += pelletsHit;
  weapons.kills += killed;
  report.hits = pelletsHit;
  report.damage = damageDone;
  report.killed = killed;
  // Firing a gun in the street is loud: pedestrians nearby flee, and the
  // law notices unless Rico is well out of sight.
  for (const ped of state.peds || []) {
    if (Math.hypot(ped.x - ox, ped.y - oy) < 260 && !ped.bodyguard) {
      ped.fleeing = true;
      ped.fleeTimer = Math.max(ped.fleeTimer || 0, 3);
    }
  }
  if (pelletsHit > 0) tell(state, `Hit! ${damageDone} damage.`, 1);
  return report;
}

// Convenience wrapper: Rico shoots along his own facing, on foot only.
// In a car the gun stays holstered — drive-by shooting is a later round.
export function shootFromPlayer(state, random) {
  const player = state.player;
  if (!player || player.inCar) return { fired: false, reason: player && player.inCar ? 'in a car' : 'no player' };
  return shootWeapon(state, player.x, player.y, player.angle, random);
}

export function accuracy(weapons) {
  if (weapons.shotsFired === 0) return 0;
  return weapons.shotsHit / weapons.shotsFired;
}

// The nearest weapon pickup Rico can grab, or null when none is close.
export function nearestWeaponPickup(weapons, x, y, maxDist) {
  const limit = maxDist === undefined ? PICKUP_RADIUS : maxDist;
  let found = null;
  let foundD = limit;
  for (const p of weapons.pickups) {
    if (p.taken) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < foundD) { foundD = d; found = p; }
  }
  return found;
}

export function spawnWeaponPickup(weapons, id) {
  const spot = WEAPON_PICKUP_SPOTS.find((s) => s.id === id);
  if (!spot) return false;
  const pickup = weapons.pickups.find((p) => p.id === id);
  if (!pickup) return false;
  pickup.taken = false;
  pickup.respawnTimer = 0;
  return true;
}

// Walk over a pickup to take it: the gun joins the inventory with a full
// magazine and a box of reserve. Returns the weapon id, or null.
export function collectWeaponPickups(state) {
  const player = state.player;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  const pickup = nearestWeaponPickup(state.weapons, px, py);
  if (!pickup) return null;
  const def = weaponById(pickup.weapon);
  pickup.taken = true;
  pickup.respawnTimer = PICKUP_RESPAWN_SECONDS;
  const slot = state.weapons.inventory[pickup.weapon];
  const hadIt = slot.owned;
  slot.owned = true;
  slot.mag = def.magSize;
  slot.reserve += def.magSize;
  if (!state.weapons.equipped) state.weapons.equipped = pickup.weapon;
  if (state.stats) state.stats.earned = state.stats.earned || 0;
  tell(state, hadIt ? `Picked up ${def.name} ammo (+${def.magSize} rounds).` : `Picked up the ${def.name}!`, 4);
  return pickup.weapon;
}

// A hostile NPC shooting back at Rico: same damage model, no ammo, no
// spread roll — the caller decides the hit chance. Returns true when the
// shot landed.
export function enemyShootAt(state, shooter, targetPlayer, damage, hitChance, random) {
  const rng = random || Math.random;
  if (rng() > hitChance) return false;
  const died = damagePlayer(targetPlayer, damage);
  return { hit: true, died };
}

// Step the weapon timers: cooldown, reload, recoil bleed, muzzle flash,
// and pickup respawns. Shooting itself is event-driven (shootWeapon), so
// this step never fires a gun on its own.
export function stepWeapons(weapons, state, dt) {
  weapons.elapsed += dt;
  if (weapons.cooldown > 0) weapons.cooldown -= dt;
  if (weapons.muzzleTimer > 0) weapons.muzzleTimer -= dt;
  if (weapons.recoil > 0) weapons.recoil = Math.max(0, weapons.recoil - dt * 0.9);
  if (weapons.reloadTimer > 0) {
    weapons.reloadTimer -= dt;
    if (weapons.reloadTimer <= 0) finishReload(weapons);
  }
  for (const p of weapons.pickups) {
    if (!p.taken) continue;
    p.respawnTimer -= dt;
    if (p.respawnTimer <= 0) {
      p.taken = false;
      p.respawnTimer = 0;
    }
  }
  // Auto-reload when the magazine runs dry mid-fight and Rico has reserve.
  if (weapons.equipped && needsReload(weapons) && weapons.reloadTimer <= 0) {
    startReload(weapons);
  }
  return weapons;
}

export function weaponSummaryLines(weapons) {
  const lines = [];
  for (const def of WEAPON_DEFS) {
    const slot = weapons.inventory[def.id];
    if (!slot.owned) {
      lines.push(`${def.name}: buy for $${def.price} — ${def.description}`);
    } else {
      const mark = weapons.equipped === def.id ? ' (equipped)' : '';
      lines.push(`${def.name}${mark}: ${slot.mag}/${def.magSize} in the mag, ${slot.reserve} in reserve`);
    }
  }
  lines.push(`Accuracy: ${(accuracy(weapons) * 100).toFixed(0)}% (${weapons.shotsHit}/${weapons.shotsFired} hits, ${weapons.kills} kills)`);
  return lines;
}

// One line for the HUD: equipped gun and its ammo, or fists.
export function weaponHudLine(weapons) {
  const def = equippedWeapon(weapons);
  if (!def) return 'Fists (Q to punch)';
  const slot = weapons.inventory[def.id];
  const reloading = weapons.reloadTimer > 0 ? ' — reloading…' : '';
  const aiming = weapons.aiming ? ' — aiming' : '';
  return `${def.name}: ${slot.mag}/${slot.reserve}${reloading}${aiming}`;
}

export function serializeWeapons(weapons) {
  const inventory = {};
  for (const def of WEAPON_DEFS) {
    inventory[def.id] = { ...weapons.inventory[def.id] };
  }
  return {
    inventory, equipped: weapons.equipped,
    shotsFired: weapons.shotsFired, shotsHit: weapons.shotsHit, kills: weapons.kills,
  };
}

export function deserializeWeapons(data) {
  const w = createWeaponsState();
  if (!data || typeof data !== 'object') return w;
  for (const def of WEAPON_DEFS) {
    const saved = data.inventory && data.inventory[def.id];
    if (saved && typeof saved === 'object') {
      w.inventory[def.id] = {
        owned: !!saved.owned,
        mag: typeof saved.mag === 'number' ? saved.mag : 0,
        reserve: typeof saved.reserve === 'number' ? saved.reserve : 0,
      };
    }
  }
  if (data.equipped && hasWeapon(w, data.equipped)) w.equipped = data.equipped;
  if (typeof data.shotsFired === 'number') w.shotsFired = data.shotsFired;
  if (typeof data.shotsHit === 'number') w.shotsHit = data.shotsHit;
  if (typeof data.kills === 'number') w.kills = data.kills;
  return w;
}
