// The Property Empire: the second half of Rico's portfolio. Businesses
// pay by the minute from a till; properties pay rent the same way, but
// they are homes first — a beachfront condo, a Downtown loft, a Harbor
// warehouse flat — and each one has a tenant who pays on time as long as
// Rico keeps the place in shape. Renovate a property and the rent goes
// up; let the rent pile up past the cap and the tenant stops paying until
// Rico comes round to collect.
//
// Properties live next to businesses, not instead of them: the two tills
// are separate, the two front doors are different places, and the HUD
// shows both. Buying happens on foot or in a car, right outside the
// front door, exactly like a business.
import { WORLD } from './config.js';

// Rent ticks once a minute into each property's till; the till caps after
// a few ticks, so Rico has to drive round and collect instead of letting
// the money pile up forever.
export const PROPERTY_TICK_SECONDS = 60;
export const PROPERTY_MAX_TICKS = 4;
export const PROPERTY_COLLECT_RANGE = 150;
export const PROPERTY_SELL_FRACTION = 0.7;
export const PROPERTY_UPGRADE_MAX = 2;
export const PROPERTY_UPGRADE_FRACTION = 0.4;
export const PROPERTY_UPGRADE_COST_FRACTION = 0.4;

// One entry per property: price, base rent per minute, front-door
// position, district and tier. Tier 1 is a starter flat, tier 3 is the
// kind of place with a sea view and a tenant who pays in cash, on time.
export const PROPERTY_DEFS = [
  { id: 'old-town-flat', name: 'Old Town Flat', price: 2000, rent: 60, x: 600, y: 1200, district: 'Old Town', tier: 1 },
  { id: 'marina-apartment', name: 'Marina Apartment', price: 4500, rent: 140, x: 900, y: 500, district: 'Marina District', tier: 2 },
  { id: 'park-cottage', name: 'Palmetto Park Cottage', price: 6000, rent: 180, x: 1600, y: 1000, district: 'Palmetto Park', tier: 2 },
  { id: 'downtown-loft', name: 'Downtown Loft', price: 8000, rent: 260, x: 2400, y: 1400, district: 'Downtown', tier: 3 },
  { id: 'coral-penthouse', name: 'Coral Heights Penthouse', price: 15000, rent: 480, x: 2800, y: 600, district: 'Coral Heights', tier: 3 },
  { id: 'beach-condo', name: 'Beachfront Condo', price: 12000, rent: 380, x: 1800, y: 2260, district: 'Beachfront', tier: 3 },
  { id: 'harbor-flat', name: 'Harbor Market Flat', price: 3500, rent: 110, x: 700, y: 1900, district: 'Harbor Market', tier: 1 },
  { id: 'lighthouse-house', name: 'Lighthouse Point House', price: 10000, rent: 320, x: 2900, y: 1900, district: 'Lighthouse Point', tier: 2 },
];

export function createPropertyState() {
  return {
    owned: {}, // property id -> true
    rent: {}, // property id -> dollars waiting to be collected
    upgrades: {}, // property id -> renovation level 0..2
    rentTimer: 0,
    sold: 0, // properties sold so far, for the record books
    collected: 0, // total rent ever collected
  };
}

export function propertyById(id) {
  return PROPERTY_DEFS.find((p) => p.id === id) || null;
}

// The property whose front door is closest to (x, y), or null when Rico
// is not near any of them.
export function nearestProperty(x, y, maxDist) {
  const limit = maxDist === undefined ? PROPERTY_COLLECT_RANGE : maxDist;
  let found = null;
  let foundD = limit;
  for (const p of PROPERTY_DEFS) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < foundD) { foundD = d; found = p; }
  }
  return found;
}

export function ownedPropertyCount(properties) {
  return PROPERTY_DEFS.filter((p) => properties.owned[p.id]).length;
}

export function totalRentWaiting(properties) {
  let total = 0;
  for (const p of PROPERTY_DEFS) total += properties.rent[p.id] || 0;
  return total;
}

// The nearest owned property that actually has rent waiting, for the
// minimap arrow and the "go collect" nudge.
export function nearestPropertyWithRent(properties, x, y) {
  let found = null;
  let foundD = Infinity;
  for (const p of PROPERTY_DEFS) {
    if (!properties.owned[p.id] || !(properties.rent[p.id] > 0)) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < foundD) { foundD = d; found = p; }
  }
  return found;
}

export function propertyLevel(properties, id) {
  return properties.upgrades[id] || 0;
}

// Rent per minute for one property, after renovations. Each level adds
// 40% of the base rent on top.
export function propertyRent(properties, def) {
  const level = propertyLevel(properties, def.id);
  return Math.round(def.rent * (1 + level * PROPERTY_UPGRADE_FRACTION));
}

// The rent cap for one property: a few ticks of its (renovated) rent.
export function propertyRentCap(properties, def) {
  return propertyRent(properties, def) * PROPERTY_MAX_TICKS;
}

// What the next renovation costs: 40% of the purchase price per level.
export function propertyUpgradeCost(def, level) {
  return Math.round(def.price * PROPERTY_UPGRADE_COST_FRACTION);
}

// What a property sells back for: 70% of the purchase price plus half
// the renovation money back.
export function propertySellPrice(properties, def) {
  const reno = propertyLevel(properties, def.id) * propertyUpgradeCost(def, 0);
  return Math.round(def.price * PROPERTY_SELL_FRACTION + reno * 0.5);
}

// The whole portfolio's rent per minute, across every owned property.
export function totalRentPerMinute(properties) {
  let total = 0;
  for (const def of PROPERTY_DEFS) {
    if (properties.owned[def.id]) total += propertyRent(properties, def);
  }
  return total;
}

// What the whole portfolio is worth on paper: purchase prices plus what
// the renovations cost.
export function propertyPortfolioValue(properties) {
  let value = 0;
  for (const def of PROPERTY_DEFS) {
    if (!properties.owned[def.id]) continue;
    value += def.price;
    value += propertyLevel(properties, def.id) * propertyUpgradeCost(def, 0);
  }
  return value;
}

// The cheapest property Rico does not own yet — the next rung on the ladder.
export function nextPropertyToBuy(properties) {
  const unowned = PROPERTY_DEFS.filter((p) => !properties.owned[p.id]);
  if (unowned.length === 0) return null;
  unowned.sort((a, b) => a.price - b.price);
  return unowned[0];
}

// Properties grouped by district, for the portfolio screen.
export function propertiesByDistrict(properties) {
  const out = {};
  for (const def of PROPERTY_DEFS) {
    if (!out[def.district]) out[def.district] = [];
    out[def.district].push({
      ...def,
      owned: !!properties.owned[def.id],
      rentWaiting: properties.rent[def.id] || 0,
      level: propertyLevel(properties, def.id),
    });
  }
  return out;
}

function ricoPos(state) {
  const ride = state.player.inCar;
  return ride ? { x: ride.x, y: ride.y } : { x: state.player.x, y: state.player.y };
}

function tell(state, text, seconds) {
  if (state.missions) {
    state.missions.message = text;
    state.missions.messageTimer = seconds || 3;
  }
}

// Why Rico cannot buy this property right now, or null when he can.
export function canBuyProperty(state, id) {
  const def = propertyById(id);
  if (!def) return 'There is no property here.';
  if (state.properties.owned[id]) return `You already own the ${def.name}.`;
  const pos = ricoPos(state);
  if (Math.hypot(def.x - pos.x, def.y - pos.y) > PROPERTY_COLLECT_RANGE) {
    return `Get closer to the ${def.name} to buy it.`;
  }
  if (state.player.money < def.price) {
    return `${def.name} costs $${def.price} — you only have $${state.player.money}.`;
  }
  return null;
}

export function buyProperty(state, id) {
  const def = propertyById(id);
  const whyNot = canBuyProperty(state, id);
  if (whyNot || !def) return false;
  state.player.money -= def.price;
  state.properties.owned[id] = true;
  state.properties.rent[id] = 0;
  state.properties.upgrades[id] = 0;
  tell(state, `You bought the ${def.name} for $${def.price} — rent $${propertyRent(state.properties, def)}/min.`, 5);
  return true;
}

// Why Rico cannot renovate this property right now, or null when he can.
export function canUpgradeProperty(state, id) {
  const def = propertyById(id);
  if (!def) return 'There is no property here.';
  if (!state.properties.owned[id]) return `Buy the ${def.name} first, then renovate it.`;
  const level = propertyLevel(state.properties, id);
  if (level >= PROPERTY_UPGRADE_MAX) return `The ${def.name} is fully renovated.`;
  const pos = ricoPos(state);
  if (Math.hypot(def.x - pos.x, def.y - pos.y) > PROPERTY_COLLECT_RANGE) {
    return `Get closer to the ${def.name} to renovate it.`;
  }
  const cost = propertyUpgradeCost(def, level);
  if (state.player.money < cost) {
    return `Renovating the ${def.name} costs $${cost} — you only have $${state.player.money}.`;
  }
  return null;
}

export function upgradeProperty(state, id) {
  const def = propertyById(id);
  const whyNot = canUpgradeProperty(state, id);
  if (whyNot || !def) return false;
  const level = propertyLevel(state.properties, id);
  state.player.money -= propertyUpgradeCost(def, level);
  state.properties.upgrades[id] = level + 1;
  tell(state, `Renovated the ${def.name} to level ${level + 1} — rent is now $${propertyRent(state.properties, def)}/min.`, 4);
  return true;
}

// Why Rico cannot sell this property right now, or null when he can.
export function canSellProperty(state, id) {
  const def = propertyById(id);
  if (!def) return 'There is no property here.';
  if (!state.properties.owned[id]) return `You do not own the ${def.name}.`;
  const pos = ricoPos(state);
  if (Math.hypot(def.x - pos.x, def.y - pos.y) > PROPERTY_COLLECT_RANGE) {
    return `Get closer to the ${def.name} to sell it.`;
  }
  return null;
}

// Sell a property back: the rent waiting in its till comes with it, plus
// 70% of the purchase price and half the renovation money.
export function sellProperty(state, id) {
  const def = propertyById(id);
  const whyNot = canSellProperty(state, id);
  if (whyNot || !def) return 0;
  const waiting = state.properties.rent[id] || 0;
  const price = propertySellPrice(state.properties, def);
  const total = waiting + price;
  delete state.properties.owned[id];
  delete state.properties.rent[id];
  delete state.properties.upgrades[id];
  state.properties.sold += 1;
  state.player.money += total;
  if (state.stats) state.stats.earned = (state.stats.earned || 0) + total;
  tell(state, `Sold the ${def.name} for $${price} plus $${waiting} rent — +$${total}.`, 5);
  return total;
}

// Empty one property's till into Rico's pocket; returns what was collected.
export function collectRent(state, id) {
  const def = propertyById(id);
  if (!def || !state.properties.owned[id]) return 0;
  const amount = state.properties.rent[id] || 0;
  if (amount <= 0) return 0;
  state.properties.rent[id] = 0;
  state.player.money += amount;
  state.properties.collected += amount;
  if (state.stats) state.stats.earned = (state.stats.earned || 0) + amount;
  return amount;
}

// Collect every rent till at once.
export function collectAllRent(state) {
  let total = 0;
  for (const p of PROPERTY_DEFS) {
    if (state.properties.owned[p.id]) total += collectRent(state, p.id);
  }
  return total;
}

// One rent tick: every owned property pays into its own till, capped at
// a few ticks so Rico has to come and collect.
function payRentTick(properties, state) {
  let paid = 0;
  let capped = null;
  for (const def of PROPERTY_DEFS) {
    if (!properties.owned[def.id]) continue;
    const rent = propertyRent(properties, def);
    const cap = rent * PROPERTY_MAX_TICKS;
    const before = properties.rent[def.id] || 0;
    const after = Math.min(cap, before + rent);
    properties.rent[def.id] = after;
    paid += after - before;
    if (after >= cap && before < cap) capped = def;
  }
  if (paid > 0) {
    tell(state, `Your properties earned $${paid} in rent — collect it at the front door.`, 4);
  }
  if (capped) {
    tell(state, `The ${capped.name} rent till is full ($${propertyRentCap(properties, capped)}) — collect it before the tenant stops paying.`, 5);
  }
}

export function stepProperties(properties, state, dt) {
  if (ownedPropertyCount(properties) === 0) return;
  properties.rentTimer += dt;
  while (properties.rentTimer >= PROPERTY_TICK_SECONDS) {
    properties.rentTimer -= PROPERTY_TICK_SECONDS;
    payRentTick(properties, state);
  }
}

// One line per property for the title screen: name, price or rent, till.
export function propertySummaryLines(properties) {
  return PROPERTY_DEFS.map((p) => {
    if (properties.owned[p.id]) {
      const level = propertyLevel(properties, p.id);
      const reno = level > 0 ? `, renovated x${level}` : '';
      return `${p.name} (${p.district}, owned${reno}): rent $${propertyRent(properties, p)}/min, till $${properties.rent[p.id] || 0}`;
    }
    return `${p.name} (${p.district}): buy for $${p.price}, rent $${p.rent}/min`;
  });
}

// One line for the HUD: how many properties Rico owns and what is waiting.
export function propertyHudLine(properties) {
  const owned = ownedPropertyCount(properties);
  if (owned === 0) return '';
  return `Properties ${owned}/${PROPERTY_DEFS.length} — rent $${totalRentWaiting(properties)} waiting ($${totalRentPerMinute(properties)}/min)`;
}

export function serializeProperties(properties) {
  return {
    owned: { ...properties.owned },
    rent: { ...properties.rent },
    upgrades: { ...properties.upgrades },
    sold: properties.sold,
    collected: properties.collected,
  };
}

export function deserializeProperties(data) {
  const p = createPropertyState();
  if (!data || typeof data !== 'object') return p;
  if (data.owned) Object.assign(p.owned, data.owned);
  if (data.rent) Object.assign(p.rent, data.rent);
  if (data.upgrades) Object.assign(p.upgrades, data.upgrades);
  if (typeof data.sold === 'number') p.sold = data.sold;
  if (typeof data.collected === 'number') p.collected = data.collected;
  return p;
}
