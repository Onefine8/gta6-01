// The Business Empire: Rico can buy up Palmetto Bay one property at a time.
// Each business pays its income into its own till once per tick; the till
// caps after a few ticks, so Rico has to drive round and collect (B) instead
// of letting the money pile up forever. Buying and collecting both happen on
// foot or in a car, right outside the front door.
//
// Round 7 adds renovations: an owned business can be upgraded up to three
// times, and each level adds half again to its income — a level-3 Neon Bar
// pays more than double a fresh one. Upgrades cost a multiple of the
// purchase price and are bought at the same front door.
import { EMPIRE } from './config.js';

export const BUSINESS_DEFS = EMPIRE.businesses;

// Renovation tuning: each level costs this fraction of the purchase price
// and adds this fraction of the base income on top.
export const UPGRADE_COST_FRACTION = 0.5;
export const UPGRADE_INCOME_FRACTION = 0.5;
export const UPGRADE_MAX_LEVEL = 3;

export function createBusinessState() {
  return {
    owned: {}, // business id -> true
    till: {}, // business id -> dollars waiting to be collected
    upgrades: {}, // business id -> renovation level 0..3
    incomeTimer: 0,
  };
}

export function businessById(id) {
  return BUSINESS_DEFS.find((b) => b.id === id) || null;
}

// The business whose front door is closest to (x, y), or null when Rico is
// not near any of them.
export function nearestBusiness(x, y, maxDist) {
  const limit = maxDist === undefined ? EMPIRE.collectRange : maxDist;
  let found = null;
  let foundD = limit;
  for (const b of BUSINESS_DEFS) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < foundD) { foundD = d; found = b; }
  }
  return found;
}

export function ownedCount(business) {
  return BUSINESS_DEFS.filter((b) => business.owned[b.id]).length;
}

export function totalTill(business) {
  let total = 0;
  for (const b of BUSINESS_DEFS) total += business.till[b.id] || 0;
  return total;
}

// The nearest owned business that actually has money waiting, for the
// minimap arrow and the "go collect" nudge.
export function nearestBusinessWithTill(business, x, y) {
  let found = null;
  let foundD = Infinity;
  for (const b of BUSINESS_DEFS) {
    if (!business.owned[b.id] || !(business.till[b.id] > 0)) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < foundD) { foundD = d; found = b; }
  }
  return found;
}

// Renovation level of one business, 0 for a fresh purchase.
export function upgradeLevel(business, id) {
  return business.upgrades[id] || 0;
}

// Income per tick for one business, after renovations. A level-0 business
// pays its base income; each level adds half the base again.
export function businessIncome(business, def) {
  const level = upgradeLevel(business, def.id);
  return Math.round(def.income * (1 + level * UPGRADE_INCOME_FRACTION));
}

// What the next renovation costs: half the purchase price per level,
// so the third level costs the same as the first — the money goes
// further early, when Rico needs it most.
export function upgradeCost(def, level) {
  return Math.round(def.price * UPGRADE_COST_FRACTION);
}

// The till cap for one business: a few ticks of its (upgraded) income.
export function businessTillCap(business, def) {
  return businessIncome(business, def) * EMPIRE.maxTicks;
}

// The whole empire's income per minute, across every owned business.
export function totalIncomePerMinute(business) {
  let total = 0;
  for (const def of BUSINESS_DEFS) {
    if (business.owned[def.id]) total += businessIncome(business, def);
  }
  return total;
}

// Why Rico cannot buy this business right now, or null when he can.
export function canBuyBusiness(state, id) {
  const def = businessById(id);
  if (!def) return 'There is no business here.';
  if (state.business.owned[id]) return `You already own the ${def.name}.`;
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  if (Math.hypot(def.x - px, def.y - py) > EMPIRE.collectRange) {
    return `Get closer to the ${def.name} to buy it.`;
  }
  if (state.player.money < def.price) {
    return `${def.name} costs $${def.price} — you only have $${state.player.money}.`;
  }
  return null;
}

export function buyBusiness(state, id) {
  const def = businessById(id);
  const whyNot = canBuyBusiness(state, id);
  if (whyNot || !def) return false;
  state.player.money -= def.price;
  state.business.owned[id] = true;
  state.business.till[id] = 0;
  state.business.upgrades[id] = 0;
  return true;
}

// Why Rico cannot renovate this business right now, or null when he can.
export function canUpgradeBusiness(state, id) {
  const def = businessById(id);
  if (!def) return 'There is no business here.';
  if (!state.business.owned[id]) return `Buy the ${def.name} first, then renovate it.`;
  const level = upgradeLevel(state.business, id);
  if (level >= UPGRADE_MAX_LEVEL) return `The ${def.name} is fully renovated.`;
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  if (Math.hypot(def.x - px, def.y - py) > EMPIRE.collectRange) {
    return `Get closer to the ${def.name} to renovate it.`;
  }
  const cost = upgradeCost(def, level);
  if (state.player.money < cost) {
    return `Renovating the ${def.name} costs $${cost} — you only have $${state.player.money}.`;
  }
  return null;
}

export function upgradeBusiness(state, id) {
  const def = businessById(id);
  const whyNot = canUpgradeBusiness(state, id);
  if (whyNot || !def) return false;
  const level = upgradeLevel(state.business, id);
  state.player.money -= upgradeCost(def, level);
  state.business.upgrades[id] = level + 1;
  return true;
}

// Empty one business's till into Rico's pocket; returns what was collected.
export function collectBusiness(state, id) {
  const def = businessById(id);
  if (!def || !state.business.owned[id]) return 0;
  const amount = state.business.till[id] || 0;
  if (amount <= 0) return 0;
  state.business.till[id] = 0;
  state.player.money += amount;
  if (state.stats) state.stats.earned = (state.stats.earned || 0) + amount;
  return amount;
}

// Collect every till at once (only used when Rico stands at a business that
// has money waiting — the takings are his, wherever they were earned).
export function collectAllBusinesses(state) {
  let total = 0;
  for (const b of BUSINESS_DEFS) {
    if (state.business.owned[b.id]) total += collectBusiness(state, b.id);
  }
  return total;
}

// A short message on the mission toast line, if the state carries one.
function tell(state, text, seconds) {
  if (state.missions) {
    state.missions.message = text;
    state.missions.messageTimer = seconds || 3;
  }
}

// One income tick: every owned business pays into its own till, capped at
// a few ticks so Rico has to come and collect.
function payTick(business, state) {
  let paid = 0;
  let capped = null;
  for (const def of BUSINESS_DEFS) {
    if (!business.owned[def.id]) continue;
    const income = businessIncome(business, def);
    const cap = income * EMPIRE.maxTicks;
    const before = business.till[def.id] || 0;
    const after = Math.min(cap, before + income);
    business.till[def.id] = after;
    paid += after - before;
    if (after >= cap && before < cap) capped = def;
  }
  if (paid > 0) {
    tell(state, `Your businesses earned $${paid} — press B at one of them to collect.`, 4);
  }
  if (capped) {
    tell(state, `The ${capped.name} till is full ($${businessTillCap(business, capped)}) — collect it before it stops paying.`, 5);
  }
}

export function stepBusinesses(business, state, dt) {
  if (ownedCount(business) === 0) return;
  business.incomeTimer += dt;
  // A long frame (or a long stretch away) can cover several ticks: pay them
  // all, one at a time, so the till never silently skips a minute.
  while (business.incomeTimer >= EMPIRE.tickSeconds) {
    business.incomeTimer -= EMPIRE.tickSeconds;
    payTick(business, state);
  }
}

// One line per business for the title screen: name, price or income, till.
export function businessSummaryLines(business) {
  return BUSINESS_DEFS.map((b) => {
    if (business.owned[b.id]) {
      const level = upgradeLevel(business, b.id);
      const reno = level > 0 ? `, renovated x${level}` : '';
      return `${b.name} (owned${reno}): earns $${businessIncome(business, b)} per minute, till $${business.till[b.id] || 0}`;
    }
    return `${b.name}: buy for $${b.price}, earns $${b.income} per minute`;
  });
}

// What the whole empire is worth on paper: purchase prices plus what the
// renovations cost, so Rico can see what he has built.
export function empireValue(business) {
  let value = 0;
  for (const def of BUSINESS_DEFS) {
    if (!business.owned[def.id]) continue;
    value += def.price;
    value += upgradeLevel(business, def.id) * upgradeCost(def, 0);
  }
  return value;
}

export function serializeBusiness(business) {
  return {
    owned: { ...business.owned },
    till: { ...business.till },
    upgrades: { ...business.upgrades },
  };
}

export function deserializeBusiness(data) {
  const b = createBusinessState();
  if (!data || typeof data !== 'object') return b;
  if (data.owned) Object.assign(b.owned, data.owned);
  if (data.till) Object.assign(b.till, data.till);
  if (data.upgrades) Object.assign(b.upgrades, data.upgrades);
  return b;
}
