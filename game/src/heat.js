// The heat system: Palmetto Bay remembers. The wanted stars are the
// precinct's attention right now; the heat map is its memory. Every
// district keeps its own heat — 0 is a quiet street, 100 is a district
// where every cruiser knows Rico's face. Commit crimes in a district
// and its heat climbs; stay out of trouble and it cools, slowly. A hot
// district means faster police response, longer memories, and cruisers
// that spawn closer. A cold district is where Rico goes to disappear.
//
// The system also adds the two ways out that the stars alone never had:
// cool-down spots — a payphone, a car wash, the beach at night — where
// the heat falls twice as fast, and the bribe: cash to a bent cop to
// knock a star off, priced by how hot Rico already is. Both cost
// something — time, or money — and neither works at five stars.
//
// Heat is pure logic: a district table, a clock, and the shared state.
// The police module reads the heat multiplier when it spawns cruisers;
// the HUD reads the hottest district and the nearest cool-down spot.
import { DISTRICTS, WANTED } from './config.js';
import { districtAt } from './world.js';

// Cool-down spots: places where Rico can lay low. Standing in one
// doubles the rate the wanted level and the district heat fall.
export const COOLDOWN_SPOTS = [
  { id: 'payphone-marina', name: 'Marina Payphone', x: 500, y: 300, radius: 90, rate: 2 },
  { id: 'carwash-downtown', name: 'Downtown Car Wash', x: 2200, y: 1400, radius: 110, rate: 2 },
  { id: 'beach-night', name: 'Beachfront Hideout', x: 1600, y: 2260, radius: 130, rate: 2.5 },
  { id: 'park-bench', name: 'Palmetto Park Bench', x: 1500, y: 900, radius: 90, rate: 1.5 },
  { id: 'harbor-alley', name: 'Harbor Alley', x: 600, y: 1900, radius: 90, rate: 2 },
];

// How fast district heat rises per crime, and how fast it cools per
// minute of quiet.
export const HEAT_PER_STAR = 12;
export const HEAT_PER_CRIME = 8;
export const HEAT_DECAY_PER_MINUTE = 6;
export const HEAT_MAX = 100;

// A bribe knocks one star off. The price climbs with the stars — a
// one-star fix is cheap, a four-star fix costs more than a race win —
// and nobody takes a bribe at five stars.
export const BRIBE_BASE = 150;
export const BRIBE_PER_STAR = 150;

export function createHeatState() {
  const districts = {};
  for (const d of DISTRICTS) districts[d.name] = 0;
  return {
    districts, // district name -> heat 0..100
    bribes: 0, // bribes paid so far
    bribedTotal: 0, // dollars paid in bribes
    crimes: 0, // heat-raising crimes counted
    cooldownSeconds: 0, // seconds spent in a cool-down spot
    peakHeat: 0, // highest district heat ever reached
    elapsed: 0,
  };
}

// Which district is Rico standing in right now?
export function currentDistrictName(x, y) {
  return districtAt(x, y) || 'Palmetto Bay';
}

export function heatAt(heat, x, y) {
  const name = currentDistrictName(x, y);
  return heat.districts[name] || 0;
}

export function heatForDistrict(heat, name) {
  return heat.districts[name] || 0;
}

// Add heat to the district Rico is standing in. Returns the new heat.
export function addHeat(heat, x, y, amount) {
  const name = currentDistrictName(x, y);
  const next = Math.max(0, Math.min(HEAT_MAX, (heat.districts[name] || 0) + amount));
  heat.districts[name] = next;
  heat.peakHeat = Math.max(heat.peakHeat, next);
  if (amount > 0) heat.crimes += 1;
  return next;
}

// Add heat for a wanted star gained: the precinct remembers where the
// crime happened, not just that it happened.
export function addHeatForStars(heat, state, stars) {
  const pos = state.player.inCar
    ? { x: state.player.inCar.x, y: state.player.inCar.y }
    : { x: state.player.x, y: state.player.y };
  return addHeat(heat, pos.x, pos.y, stars * HEAT_PER_STAR);
}

// The hottest district in the city right now, and how hot it is.
export function hottestDistrict(heat) {
  let name = null;
  let value = -1;
  for (const d of DISTRICTS) {
    const v = heat.districts[d.name] || 0;
    if (v > value) { value = v; name = d.name; }
  }
  return { name, heat: value };
}

// The coldest district — the best place to disappear to.
export function coolestDistrict(heat) {
  let name = null;
  let value = Infinity;
  for (const d of DISTRICTS) {
    const v = heat.districts[d.name] || 0;
    if (v < value) { value = v; name = d.name; }
  }
  return { name, heat: value };
}

// How a district's heat changes police behaviour there: a hot district
// spawns cruisers faster and keeps them coming; a cold district is
// slow to react. Returns a multiplier on spawn rate and sight range.
export function heatMultiplier(heat, x, y) {
  const h = heatAt(heat, x, y);
  return {
    spawn: 1 + h / 100,
    sight: 1 + (h / 100) * 0.25,
    decay: 1 - (h / 100) * 0.5,
  };
}

// The nearest cool-down spot to a point, or null when Rico is not near
// one. Cool-down spots are where the heat falls fastest.
export function nearestCooldownSpot(x, y, maxDist) {
  let found = null;
  let foundD = maxDist === undefined ? Infinity : maxDist;
  for (const spot of COOLDOWN_SPOTS) {
    const d = Math.hypot(spot.x - x, spot.y - y);
    if (d < spot.radius) {
      const within = d;
      if (within < foundD) { foundD = within; found = spot; }
    }
  }
  return found;
}

// Is Rico standing in a cool-down spot right now? Returns the spot, or null.
export function currentCooldownSpot(state) {
  const pos = state.player.inCar
    ? { x: state.player.inCar.x, y: state.player.inCar.y }
    : { x: state.player.x, y: state.player.y };
  return nearestCooldownSpot(pos.x, pos.y);
}

// How fast the wanted level decays right now: the base decay, doubled
// in a cool-down spot, slowed in a hot district.
export function wantedDecayRate(heat, state) {
  const pos = state.player.inCar
    ? { x: state.player.inCar.x, y: state.player.inCar.y }
    : { x: state.player.x, y: state.player.y };
  const spot = nearestCooldownSpot(pos.x, pos.y);
  const mult = heatMultiplier(heat, pos.x, pos.y);
  let rate = mult.decay;
  if (spot) rate *= spot.rate;
  return rate;
}

// What a bribe costs right now: base plus per star, on the current
// wanted level. Returns null when a bribe is not possible.
export function bribeCost(state) {
  if (!state.wanted || state.wanted <= 0) return null;
  if (state.wanted >= WANTED.max) return null;
  return BRIBE_BASE + (state.wanted - 1) * BRIBE_PER_STAR;
}

export function canBribe(state) {
  const cost = bribeCost(state);
  if (cost === null) return 'There is nothing to bribe away — you are clean, or too hot for any cop to touch.';
  if (state.player.money < cost) return `A bribe costs $${cost} — you only have $${state.player.money}.`;
  return null;
}

// Pay the bribe: one star comes off, the money goes, and the district
// cools a little — the cop looks the other way for a while.
export function payBribe(state, heat) {
  const whyNot = canBribe(state);
  if (whyNot) return { ok: false, reason: whyNot };
  const cost = bribeCost(state);
  state.player.money -= cost;
  state.wanted = Math.max(0, state.wanted - 1);
  state.wantedTimer = WANTED.decaySeconds;
  if (heat) {
    heat.bribes += 1;
    heat.bribedTotal += cost;
    const pos = state.player.inCar
      ? { x: state.player.inCar.x, y: state.player.inCar.y }
      : { x: state.player.x, y: state.player.y };
    addHeat(heat, pos.x, pos.y, -15);
  }
  if (state.missions) {
    state.missions.message = `Bribe paid — $${cost}. One star off, for now.`;
    state.missions.messageTimer = 4;
  }
  return { ok: true, cost, stars: state.wanted };
}

// Step the heat map: districts cool slowly while Rico stays out of
// trouble, and cool-down spots count double time.
export function stepHeat(heat, state, dt) {
  heat.elapsed += dt;
  const pos = state.player.inCar
    ? { x: state.player.inCar.x, y: state.player.inCar.y }
    : { x: state.player.x, y: state.player.y };
  const spot = nearestCooldownSpot(pos.x, pos.y);
  if (spot) heat.cooldownSeconds += dt;
  // Districts cool only while the wanted level is low — a hot pursuit
  // keeps the whole city nervous.
  if (state.wanted <= 1) {
    const decay = (HEAT_DECAY_PER_MINUTE / 60) * dt * (spot ? spot.rate : 1);
    for (const d of DISTRICTS) {
      const v = heat.districts[d.name] || 0;
      if (v > 0) heat.districts[d.name] = Math.max(0, v - decay);
    }
  }
  return heat;
}

// A plain-language read on a district's heat, for the HUD.
export function heatWord(value) {
  if (value <= 0) return 'cold';
  if (value < 25) return 'warm';
  if (value < 50) return 'hot';
  if (value < 75) return 'burning';
  return 'on fire';
}

// One line per district for the heat screen, hottest first.
export function heatSummaryLines(heat) {
  const rows = DISTRICTS.map((d) => ({ name: d.name, heat: heat.districts[d.name] || 0 }));
  rows.sort((a, b) => b.heat - a.heat);
  const lines = rows.map((r) => `${r.name}: ${Math.round(r.heat)} — ${heatWord(r.heat)}`);
  lines.push(`Bribes paid: ${heat.bribes} ($${heat.bribedTotal}) — crimes counted: ${heat.crimes} — peak heat: ${Math.round(heat.peakHeat)}`);
  return lines;
}

// One line for the HUD: the hottest district and the nearest way to cool off.
export function heatHudLine(heat, state) {
  const hot = hottestDistrict(heat);
  if (hot.heat <= 0) return '';
  const spot = currentCooldownSpot(state);
  const cooling = spot ? ` — cooling off at the ${spot.name}` : '';
  return `Heat: ${hot.name} ${Math.round(hot.heat)} (${heatWord(hot.heat)})${cooling}`;
}

// The district Rico should run to when the heat is on: the coldest one
// with a cool-down spot nearby, or just the coldest one.
export function bestEscapeDistrict(heat) {
  const cold = coolestDistrict(heat);
  for (const spot of COOLDOWN_SPOTS) {
    const name = currentDistrictName(spot.x, spot.y);
    if (name === cold.name) return { district: cold.name, heat: cold.heat, spot };
  }
  return { district: cold.name, heat: cold.heat, spot: null };
}

export function serializeHeat(heat) {
  return {
    districts: { ...heat.districts },
    bribes: heat.bribes,
    bribedTotal: heat.bribedTotal,
    crimes: heat.crimes,
    cooldownSeconds: heat.cooldownSeconds,
    peakHeat: heat.peakHeat,
    elapsed: heat.elapsed,
  };
}

export function deserializeHeat(data) {
  const h = createHeatState();
  if (!data || typeof data !== 'object') return h;
  if (data.districts) Object.assign(h.districts, data.districts);
  if (typeof data.bribes === 'number') h.bribes = data.bribes;
  if (typeof data.bribedTotal === 'number') h.bribedTotal = data.bribedTotal;
  if (typeof data.crimes === 'number') h.crimes = data.crimes;
  if (typeof data.cooldownSeconds === 'number') h.cooldownSeconds = data.cooldownSeconds;
  if (typeof data.peakHeat === 'number') h.peakHeat = data.peakHeat;
  if (typeof data.elapsed === 'number') h.elapsed = data.elapsed;
  return h;
}
