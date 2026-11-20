// The Marina Garage tuning shop for Palmetto Bay Heat: Rico's stolen
// cars are fast, but a tuned car is faster. At the garage (press U while
// driving), Rico buys upgrades for the car he is sitting in — engine,
// armor, nitro and paint — each one a permanent change to that car's
// stats, paid for in cash. Upgrades live on the car object itself, so a
// tuned Sunset Roadster stays tuned until it is wrecked or abandoned,
// and a fresh steal starts plain again.
//
// Every function is pure logic — a state, a car, a dt — so the headless
// tests can buy a full build, fire the nitro and repaint a car in
// milliseconds, with no canvas and no input device.
import { nearSite } from './world.js';

// --- Upgrade catalogue ------------------------------------------------------
// Engine and armor come in three levels each; each level costs more than
// the last and stacks on the one before. Nitro is a single fit that adds
// three boost charges. Paint is a one-off colour job, five colours.
export const TUNING_UPGRADES = [
  { id: 'engine1', name: 'Engine Stage 1', kind: 'engine', level: 1, price: 800, text: '+12% top speed' },
  { id: 'engine2', name: 'Engine Stage 2', kind: 'engine', level: 2, price: 1500, text: '+24% top speed' },
  { id: 'engine3', name: 'Engine Stage 3', kind: 'engine', level: 3, price: 2500, text: '+36% top speed' },
  { id: 'armor1', name: 'Armor Plating 1', kind: 'armor', level: 1, price: 600, text: '+50 max health' },
  { id: 'armor2', name: 'Armor Plating 2', kind: 'armor', level: 2, price: 1200, text: '+100 max health' },
  { id: 'armor3', name: 'Armor Plating 3', kind: 'armor', level: 3, price: 2000, text: '+150 max health' },
  { id: 'nitro', name: 'Nitro Kit', kind: 'nitro', level: 1, price: 1800, text: '3 boost charges (horn to fire)' },
];

export const TUNING_PAINTS = [
  { id: 'paint-midnight', name: 'Midnight Black', color: '#111827', price: 300 },
  { id: 'paint-crimson', name: 'Crimson Red', color: '#dc2626', price: 300 },
  { id: 'paint-gold', name: 'Bay Gold', color: '#f59e0b', price: 300 },
  { id: 'paint-neon', name: 'Neon Purple', color: '#c65df0', price: 300 },
  { id: 'paint-mint', name: 'Mint Green', color: '#34d399', price: 300 },
];

// The order the U key buys in: engine first, then armor, then nitro,
// then paint — the build path a racer actually wants, one press at a
// time, cheapest useful part first.
export const TUNING_ORDER = [
  'engine1', 'armor1', 'nitro', 'engine2', 'armor2',
  'engine3', 'armor3', 'paint-gold',
];

export const ENGINE_SPEED_PER_LEVEL = 0.12;
export const ARMOR_HEALTH_PER_LEVEL = 50;
export const NITRO_CHARGES = 3;
export const NITRO_BOOST_SECONDS = 2;
export const NITRO_SPEED_MULTIPLIER = 1.45;
export const NITRO_RECHARGE_SECONDS = 20;

export function createTuningState() {
  return {
    upgradesBought: 0,
    paintsBought: 0,
    spent: 0,
    nitroFired: 0,
    message: '',
    messageTimer: 0,
  };
}

function tell(state, text, seconds) {
  if (state && state.tuning) {
    state.tuning.message = text;
    state.tuning.messageTimer = seconds || 3;
  }
  if (state && state.missions) {
    state.missions.message = text;
    state.missions.messageTimer = seconds || 3;
  }
}

// A car's tuning record: created lazily on the first upgrade so plain
// traffic and parked cars never carry one.
export function tuningOf(car) {
  if (!car.tuning) {
    car.tuning = {
      engine: 0, armor: 0, nitro: 0, paint: null,
      nitroCharges: 0, nitroTimer: 0, nitroCooldown: 0, nitroRecharge: 0,
    };
  }
  return car.tuning;
}

export function upgradeById(id) {
  return TUNING_UPGRADES.find((u) => u.id === id)
    || TUNING_PAINTS.find((p) => p.id === id)
    || null;
}

export function paintById(id) {
  return TUNING_PAINTS.find((p) => p.id === id) || null;
}

// The next upgrade the U key would buy for this car, or null when the
// car is fully built. Skips levels Rico already owns and paint he
// already wears.
export function nextUpgradeFor(car) {
  const t = tuningOf(car);
  for (const id of TUNING_ORDER) {
    const up = upgradeById(id);
    if (!up) continue;
    if (up.kind === 'engine' && t.engine >= up.level) continue;
    if (up.kind === 'armor' && t.armor >= up.level) continue;
    if (up.kind === 'nitro' && t.nitro >= 1) continue;
    if (up.color && t.paint === up.color) continue;
    return up;
  }
  return null;
}

// Why Rico cannot buy this upgrade right now, or null when he can.
// Levels must be bought in order — no Stage 3 before Stage 1.
export function canBuyUpgrade(state, car, id) {
  const up = upgradeById(id);
  if (!up) return 'No such upgrade.';
  if (!car) return 'You need to be in a car to tune it.';
  const t = tuningOf(car);
  if (up.kind === 'engine' && t.engine >= up.level) return 'That engine stage is already fitted.';
  if (up.kind === 'engine' && t.engine !== up.level - 1) return 'Fit the earlier engine stage first.';
  if (up.kind === 'armor' && t.armor >= up.level) return 'That armor is already fitted.';
  if (up.kind === 'armor' && t.armor !== up.level - 1) return 'Fit the earlier armor first.';
  if (up.kind === 'nitro' && t.nitro >= 1) return 'The nitro kit is already fitted.';
  if (up.color && t.paint === up.color) return 'The car already wears that paint.';
  if (state.player.money < up.price) return `That costs $${up.price} — you cannot afford it yet.`;
  return null;
}

function applyUpgradeToCar(car, up) {
  const t = tuningOf(car);
  if (up.kind === 'engine') {
    if (car.baseTopSpeed === undefined) car.baseTopSpeed = car.topSpeed;
    t.engine = up.level;
    car.topSpeed = Math.round(car.baseTopSpeed * (1 + ENGINE_SPEED_PER_LEVEL * t.engine));
  } else if (up.kind === 'armor') {
    if (car.baseMaxHealth === undefined) car.baseMaxHealth = car.maxHealth || 100;
    t.armor = up.level;
    car.maxHealth = car.baseMaxHealth + ARMOR_HEALTH_PER_LEVEL * t.armor;
    car.health = Math.min(car.maxHealth, car.health + ARMOR_HEALTH_PER_LEVEL);
  } else if (up.kind === 'nitro') {
    t.nitro = 1;
    t.nitroCharges = NITRO_CHARGES;
  } else if (up.color) {
    t.paint = up.color;
    car.color = up.color;
  }
}

export function buyUpgrade(state, car, id) {
  const whyNot = canBuyUpgrade(state, car, id);
  if (whyNot) {
    tell(state, whyNot, 3);
    return null;
  }
  const up = upgradeById(id);
  state.player.money -= up.price;
  applyUpgradeToCar(car, up);
  state.tuning.upgradesBought += 1;
  if (up.color) state.tuning.paintsBought += 1;
  state.tuning.spent += up.price;
  tell(state, `${up.name} fitted — ${up.text}. -$${up.price}`, 4);
  return up;
}

// The U key: buy the next upgrade in the build order for the car Rico
// is sitting in, at the garage. Returns the upgrade bought, or null.
export function buyNextUpgrade(state) {
  const player = state.player;
  if (!player.inCar) {
    tell(state, 'Tuning is for cars — steal one, drive it to Marina Garage, then press U.', 4);
    return null;
  }
  if (!nearSite('garage', player.inCar.x, player.inCar.y)) {
    tell(state, 'Tuning happens at Marina Garage — drive there and press U.', 4);
    return null;
  }
  const next = nextUpgradeFor(player.inCar);
  if (!next) {
    tell(state, 'This car is fully built — engine, armor, nitro and paint, all done.', 4);
    return null;
  }
  return buyUpgrade(state, player.inCar, next.id);
}

// --- Nitro ------------------------------------------------------------------
// Firing the nitro: the horn (C) while driving a nitro-fitted car with a
// charge left. The car's top speed jumps for two seconds and it gets an
// instant kick — enough to break away from a roadblock or win a drag to
// the next checkpoint. Charges come back one at a time, slowly.
export function tryNitro(state) {
  const player = state.player;
  if (!player.inCar) return false;
  const t = tuningOf(player.inCar);
  if (!t.nitro) return false;
  if (t.nitroTimer > 0 || t.nitroCooldown > 0) return false;
  if (t.nitroCharges <= 0) {
    tell(state, 'Nitro empty — charges come back one at a time.', 3);
    return false;
  }
  t.nitroCharges -= 1;
  t.nitroTimer = NITRO_BOOST_SECONDS;
  t.nitroCooldown = NITRO_BOOST_SECONDS + 0.5;
  if (player.inCar.baseTopSpeed === undefined) player.inCar.baseTopSpeed = player.inCar.topSpeed;
  player.inCar.topSpeed = Math.round(
    player.inCar.baseTopSpeed
      * (1 + ENGINE_SPEED_PER_LEVEL * t.engine)
      * NITRO_SPEED_MULTIPLIER,
  );
  player.inCar.speed = Math.min(player.inCar.topSpeed, player.inCar.speed + 200);
  state.tuning.nitroFired += 1;
  tell(state, `NITRO! ${t.nitroCharges} charge${t.nitroCharges === 1 ? '' : 's'} left.`, 2);
  return true;
}

export function stepTuning(state, dt, input) {
  const tuning = state.tuning;
  if (tuning.messageTimer > 0) tuning.messageTimer -= dt;
  const player = state.player;
  if (!player.inCar) return;
  const t = tuningOf(player.inCar);
  // Horn while driving fires the nitro.
  if (input && typeof input.horn === 'function' && input.horn()) {
    tryNitro(state);
  }
  // Boost window: when it ends, the top speed falls back to the tuned
  // value, not the stock one.
  if (t.nitroTimer > 0) {
    t.nitroTimer -= dt;
    if (t.nitroTimer <= 0) {
      const base = player.inCar.baseTopSpeed ?? player.inCar.topSpeed;
      player.inCar.topSpeed = Math.round(base * (1 + ENGINE_SPEED_PER_LEVEL * t.engine));
    }
  }
  if (t.nitroCooldown > 0) t.nitroCooldown -= dt;
  // One charge back every twenty seconds, up to the fitted maximum.
  if (t.nitro && t.nitroCharges < NITRO_CHARGES) {
    t.nitroRecharge += dt;
    if (t.nitroRecharge >= NITRO_RECHARGE_SECONDS) {
      t.nitroRecharge = 0;
      t.nitroCharges += 1;
    }
  }
}

// How built this car is, 0..1 — the garage progress bar.
export function tuningProgress(car) {
  if (!car || !car.tuning) return 0;
  const t = car.tuning;
  const parts = (t.engine + t.armor) / 6 + (t.nitro ? 1 : 0) / 1 + (t.paint ? 1 : 0) / 1;
  return Math.min(1, parts / 3);
}

export function tuningSummaryLines(state) {
  const tuning = state.tuning;
  const car = state.player && state.player.inCar;
  const lines = [
    `Tuning: ${tuning.upgradesBought} upgrades fitted, $${tuning.spent} spent, ${tuning.nitroFired} nitro bursts fired.`,
  ];
  if (car && car.tuning) {
    const t = car.tuning;
    lines.push(`Current car: engine ${t.engine}/3, armor ${t.armor}/3, nitro ${t.nitro ? `${t.nitroCharges}/${NITRO_CHARGES} charges` : 'not fitted'}, paint ${t.paint || 'stock'}.`);
    const next = nextUpgradeFor(car);
    lines.push(next ? `Next upgrade: ${next.name} — $${next.price} (${next.text}).` : 'Current car is fully built.');
  } else {
    lines.push('No car tuned yet — steal one and drive it to Marina Garage.');
  }
  return lines;
}

export function serializeTuning(tuning) {
  return {
    upgradesBought: tuning.upgradesBought,
    paintsBought: tuning.paintsBought,
    spent: tuning.spent,
    nitroFired: tuning.nitroFired,
  };
}

export function deserializeTuning(tuning, data) {
  if (!data || typeof data !== 'object') return;
  if (typeof data.upgradesBought === 'number') tuning.upgradesBought = data.upgradesBought;
  if (typeof data.paintsBought === 'number') tuning.paintsBought = data.paintsBought;
  if (typeof data.spent === 'number') tuning.spent = data.spent;
  if (typeof data.nitroFired === 'number') tuning.nitroFired = data.nitroFired;
}
