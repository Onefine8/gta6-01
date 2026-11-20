// The Business Empire: Rico can buy up Palmetto Bay one property at a time.
// Each business pays its income into its own till once per tick; the till
// caps after a few ticks, so Rico has to drive round and collect (B) instead
// of letting the money pile up forever. Buying and collecting both happen on
// foot or in a car, right outside the front door.
import { EMPIRE } from './config.js';

export const BUSINESS_DEFS = EMPIRE.businesses;

export function createBusinessState() {
  return {
    owned: {}, // business id -> true
    till: {}, // business id -> dollars waiting to be collected
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

function tell(state, text, seconds) {
  if (state.missions) {
    state.missions.message = text;
    state.missions.messageTimer = seconds || 3;
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

function payTick(business, state) {
  let paid = 0;
  let capped = null;
  for (const def of BUSINESS_DEFS) {
    if (!business.owned[def.id]) continue;
    const cap = def.income * EMPIRE.maxTicks;
    const before = business.till[def.id] || 0;
    const after = Math.min(cap, before + def.income);
    business.till[def.id] = after;
    paid += after - before;
    if (after >= cap && before < cap) capped = def;
  }
  if (paid > 0) {
    tell(state, `Your businesses earned $${paid} — press B at one of them to collect.`, 4);
  }
  if (capped) {
    tell(state, `The ${capped.name} till is full ($${capped.income * EMPIRE.maxTicks}) — collect it before it stops paying.`, 5);
  }
}

// One line per business for the title screen: name, price or income, till.
export function businessSummaryLines(business) {
  return BUSINESS_DEFS.map((b) => {
    if (business.owned[b.id]) {
      return `${b.name} (owned): earns $${b.income} per minute, till $${business.till[b.id] || 0}`;
    }
    return `${b.name}: buy for $${b.price}, earns $${b.income} per minute`;
  });
}
