// Weather and the day/night cycle for Palmetto Bay Heat. The sky is a
// state machine, not a coin flip per frame: an hour advances over the day
// length in config, night falls on a fixed schedule, and the weather holds
// one condition for a minute or two before blending into the next one, so a
// storm that arrives actually lasts long enough to matter.
//
// Every condition is a set of numbers the rest of the game reads, never a
// special case buried in the driving or police code:
//   - visibility: how far Rico (and the police) can see, in world units.
//   - grip: a multiplier on steering bite — rain and storms make the roads
//     slick, fog barely touches the tyres.
//   - policeSight: how close a cruiser has to be before it counts Rico as
//     seen, so fog and rain genuinely help a getaway.
//   - policeAggression: how fast cruisers close in once they are chasing.
//   - rain / fog: 0..1 intensities for the renderer and the audio.
//   - lightning: storms throw flashes that light the whole city for a
//     heartbeat, then fade.
//
// The module is pure logic: it takes a seeded random and a dt, and never
// touches the canvas, the DOM or the network, so the headless tests can run
// a whole week of weather in a few milliseconds.
import { TIME, WORLD } from './config.js';

// How long one weather condition holds before the sky rolls the dice again.
export const WEATHER_HOLD_MIN = 45;
export const WEATHER_HOLD_MAX = 90;
// How long a change takes to blend in — the sky never snaps.
export const WEATHER_BLEND_SECONDS = 8;
// A storm throws lightning this often, on average.
export const LIGHTNING_MIN_GAP = 6;
export const LIGHTNING_MAX_GAP = 18;

// One entry per condition. Visibility is in world units (the city is
// 3200 x 2400, the camera shows 1280 x 720), grip is a steering
// multiplier, policeSight is the cruiser spotting range, aggression
// scales police top speed, rain and fog are 0..1 render intensities.
export const WEATHER_TYPES = ['clear', 'rain', 'fog', 'storm'];

export const WEATHER_DEFS = {
  clear: {
    id: 'clear', label: 'Clear skies', visibility: 950, grip: 1.0,
    policeSight: 620, policeAggression: 1.0, rain: 0, fog: 0,
    wind: 8, light: 1.0, cloud: 0.1,
    description: 'Blue skies over the bay — long sight lines, full grip.',
  },
  rain: {
    id: 'rain', label: 'Rain', visibility: 540, grip: 0.75,
    policeSight: 480, policeAggression: 0.9, rain: 0.7, fog: 0.15,
    wind: 22, light: 0.75, cloud: 0.7,
    description: 'Rain over Palmetto Bay — roads are slick, grip is down.',
  },
  fog: {
    id: 'fog', label: 'Fog', visibility: 260, grip: 0.9,
    policeSight: 300, policeAggression: 0.7, rain: 0, fog: 0.85,
    wind: 5, light: 0.6, cloud: 0.5,
    description: 'Fog rolling in off the water — you can barely see the next block.',
  },
  storm: {
    id: 'storm', label: 'Storm', visibility: 380, grip: 0.62,
    policeSight: 380, policeAggression: 1.25, rain: 1.0, fog: 0.3,
    wind: 45, light: 0.5, cloud: 1.0,
    description: 'A bay storm — driving rain, lightning, and the cops drive angry.',
  },
};

// Weighted table for the next condition: clear is the most likely next sky,
// a storm never follows fog directly (the fog has to lift first), and a
// storm usually breaks into plain rain rather than clearing at once.
export const WEATHER_TRANSITIONS = {
  clear: [['clear', 0.45], ['rain', 0.3], ['fog', 0.25], ['storm', 0.0]],
  rain: [['clear', 0.4], ['rain', 0.35], ['fog', 0.1], ['storm', 0.15]],
  fog: [['clear', 0.55], ['rain', 0.25], ['fog', 0.2], ['storm', 0.0]],
  storm: [['clear', 0.15], ['rain', 0.55], ['fog', 0.1], ['storm', 0.2]],
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function createWeatherState(startHour) {
  const hour = typeof startHour === 'number' ? startHour : TIME.startHour;
  return {
    hour, // 0..24, advances with the day length in config
    day: 1, // increments every time the clock passes midnight
    type: 'clear', // the condition currently in force
    from: 'clear', // the condition we are blending away from
    to: 'clear', // the condition we are blending towards
    blend: 1, // 0..1 progress of the current blend (1 = settled)
    holdTimer: 60, // seconds until the next roll of the dice
    raining: false, // kept for the old main-loop readers (rain or storm)
    isNight: hour >= TIME.nightStart || hour < TIME.nightEnd,
    lightningTimer: 10, // seconds until the next strike, storms only
    flash: 0, // 0..1 lightning brightness, decays fast
    strikes: 0, // lightning strikes seen so far
    changes: 0, // weather changes since the game started
    forecast: 'rain', // the next condition the sky is leaning towards
    history: ['clear'], // every settled condition, oldest first
    lastChangeAt: 0, // game hour of the last settled change
    elapsed: 0, // total seconds stepped
  };
}

export function isNightHour(hour) {
  return hour >= TIME.nightStart || hour < TIME.nightEnd;
}

export function hourLabel(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function timeOfDay(hour) {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 15) return 'midday';
  if (hour >= 15 && hour < 17.5) return 'afternoon';
  if (hour >= 17.5 && hour < TIME.nightStart) return 'dusk';
  if (hour >= TIME.nightStart || hour < 5) return 'night';
  return 'morning';
}

// Pick the next condition from the weighted table for the current sky.
export function pickNextWeather(random, current) {
  const table = WEATHER_TRANSITIONS[current] || WEATHER_TRANSITIONS.clear;
  const roll = (random || Math.random)();
  let acc = 0;
  for (const [type, weight] of table) {
    acc += weight;
    if (roll < acc) return type;
  }
  return 'clear';
}

function startTransition(weather, next, random) {
  weather.from = weather.type;
  weather.to = next;
  weather.blend = 0;
  weather.forecast = pickNextWeather(random || Math.random, next);
  weather.holdTimer = WEATHER_HOLD_MIN + (random || Math.random)() * (WEATHER_HOLD_MAX - WEATHER_HOLD_MIN);
}

// The blended definition in force right now: while a change is blending,
// every number slides from the old condition to the new one.
export function effectiveWeather(weather) {
  const from = WEATHER_DEFS[weather.from] || WEATHER_DEFS.clear;
  const to = WEATHER_DEFS[weather.to] || WEATHER_DEFS.clear;
  const t = clamp01(weather.blend);
  return {
    id: t >= 1 ? weather.to : `${weather.from}->${weather.to}`,
    label: to.label,
    visibility: lerp(from.visibility, to.visibility, t),
    grip: lerp(from.grip, to.grip, t),
    policeSight: lerp(from.policeSight, to.policeSight, t),
    policeAggression: lerp(from.policeAggression, to.policeAggression, t),
    rain: lerp(from.rain, to.rain, t),
    fog: lerp(from.fog, to.fog, t),
    wind: lerp(from.wind, to.wind, t),
    light: lerp(from.light, to.light, t),
    cloud: lerp(from.cloud, to.cloud, t),
  };
}

// How far Rico can see right now, in world units. Night shortens it
// further — a foggy night is the blindest the city ever gets.
export function visibilityRange(weather) {
  const eff = effectiveWeather(weather);
  let range = eff.visibility;
  if (weather.isNight) range *= 0.62;
  else if (timeOfDay(weather.hour) === 'dusk' || timeOfDay(weather.hour) === 'dawn') range *= 0.85;
  return Math.max(120, range);
}

// Steering grip right now: 1 is dry tarmac, lower is slicker. Night does
// not change grip — only the sky does.
export function gripFactor(weather) {
  return effectiveWeather(weather).grip;
}

// How close a police cruiser has to be to count Rico as seen. Fog and
// rain shrink it; night shrinks it again on top.
export function policeSightRange(weather) {
  const eff = effectiveWeather(weather);
  let range = eff.policeSight;
  if (weather.isNight) range *= 0.8;
  return Math.max(140, range);
}

// How hard the police chase once they are on Rico: a storm makes them
// drive faster and closer, fog makes them hang back and lose him.
export function policeAggression(weather) {
  return effectiveWeather(weather).policeAggression;
}

export function rainIntensity(weather) {
  return effectiveWeather(weather).rain;
}

export function fogDensity(weather) {
  return effectiveWeather(weather).fog;
}

export function windSpeed(weather) {
  return effectiveWeather(weather).wind;
}

export function isRaining(weather) {
  return effectiveWeather(weather).rain > 0.25;
}

export function isStorming(weather) {
  return weather.type === 'storm' && weather.blend >= 1;
}

export function isFoggy(weather) {
  return effectiveWeather(weather).fog > 0.5;
}

// Ambient light 0..1 for the renderer: day is bright, night is dark, and
// cloud cover dims everything in between. A lightning flash adds a spike
// on top, so a storm night flickers.
export function ambientLight(weather) {
  const eff = effectiveWeather(weather);
  let base = weather.isNight ? 0.28 : 0.95;
  if (!weather.isNight) {
    const tod = timeOfDay(weather.hour);
    if (tod === 'dawn' || tod === 'dusk') base = 0.6;
    else if (tod === 'morning' || tod === 'afternoon') base = 0.85;
  }
  const light = base * (0.45 + 0.55 * eff.light);
  return Math.max(0.12, Math.min(1, light + weather.flash * 0.55));
}

// The sky colour the renderer paints behind the city, as a rough hex.
// Day clear is pale blue, night is deep navy, storms go slate grey.
export function skyColor(weather) {
  if (weather.flash > 0.4) return '#cdd7ea';
  if (weather.isNight) return weather.type === 'storm' ? '#0d1526' : '#101a33';
  const eff = effectiveWeather(weather);
  if (eff.fog > 0.6) return '#9aa5ad';
  if (eff.rain > 0.8) return '#5d6b7d';
  if (eff.rain > 0.3) return '#7d94a8';
  const tod = timeOfDay(weather.hour);
  if (tod === 'dawn') return '#e8a56b';
  if (tod === 'dusk') return '#d97b4f';
  return '#8ec8e8';
}

// A top-speed multiplier for a car in this weather: slick roads do not
// lower the top speed much, but they make getting there slower — the
// driving code applies grip to steering, this caps the straight-line
// speed a touch so a storm still feels different on a long straight.
export function topSpeedFactor(weather) {
  const grip = gripFactor(weather);
  return 0.9 + grip * 0.1;
}

// Braking distance grows as grip falls: stopping from speed takes
// noticeably longer in the rain, longer still in a storm.
export function brakingDistance(weather, speed) {
  const grip = Math.max(0.4, gripFactor(weather));
  return (speed * speed) / (2 * 620 * grip);
}

// One line for the HUD: time, condition, and the one number that matters
// most right now (visibility in metres, roughly world units / 2).
export function weatherHudLine(weather) {
  const eff = effectiveWeather(weather);
  const vis = Math.round(visibilityRange(weather) / 2);
  const dayPart = weather.isNight ? 'Night' : timeOfDay(weather.hour);
  const blending = weather.blend < 1 ? ` (clearing to ${WEATHER_DEFS[weather.to].label})` : '';
  return `${hourLabel(weather.hour)} — ${dayPart}, ${eff.label}${blending} — visibility ~${vis}m`;
}

export function weatherSummaryLines(weather) {
  const eff = effectiveWeather(weather);
  return [
    `Sky: ${eff.label}${weather.blend < 1 ? ` (changing from ${WEATHER_DEFS[weather.from].label})` : ''}`,
    `Time: ${hourLabel(weather.hour)} (day ${weather.day}, ${weather.isNight ? 'night' : timeOfDay(weather.hour)})`,
    `Visibility: ${Math.round(visibilityRange(weather))} units — grip ${gripFactor(weather).toFixed(2)}`,
    `Police sight: ${Math.round(policeSightRange(weather))} units — aggression x${policeAggression(weather).toFixed(2)}`,
    `Forecast: ${WEATHER_DEFS[weather.forecast].label} next — ${weather.changes} changes so far`,
  ];
}

// Force a condition at once (debug, screenshots, mission scripts). The
// blend still runs, so the sky slides into it instead of snapping.
export function forceWeather(weather, type, random) {
  if (!WEATHER_DEFS[type]) return false;
  if (weather.type === type && weather.blend >= 1) return true;
  startTransition(weather, type, random);
  weather.blend = 0;
  return true;
}

// Jump the clock without stepping the weather dice: used by the title
// screen backdrop and by tests that need a night scene right now.
export function setHour(weather, hour) {
  const before = weather.hour;
  let total = hour;
  let extraDays = 0;
  if (total >= 24) {
    extraDays = Math.floor(total / 24);
    total %= 24;
  } else if (total < 0) {
    extraDays = Math.floor(total / 24);
    total = ((total % 24) + 24) % 24;
  }
  weather.hour = total;
  // Jumping backwards across midnight (an explicit clock set, or a jump
  // of a day or more) still counts the day; a plain forward jump inside
  // the same day does not.
  if (extraDays !== 0) weather.day += extraDays;
  else if (total < before) weather.day += 1;
  weather.isNight = isNightHour(weather.hour);
  weather.raining = isRaining(weather);
}

export function advanceHours(weather, hours) {
  setHour(weather, weather.hour + hours);
}

// Step the sky forward by dt seconds. Returns a list of event strings the
// main loop can show on the toast line (weather changes, lightning).
export function stepWeather(weather, dt, random) {
  const rng = random || Math.random;
  const events = [];
  weather.elapsed += dt;
  // The clock: a full day takes TIME.dayLengthSeconds, like main.js.
  // Count whole days from the total hours advanced, so a step of exactly
  // one day (or several) still rolls the day counter over.
  const hoursAdvanced = (dt * 24) / TIME.dayLengthSeconds;
  const totalHours = weather.hour + hoursAdvanced;
  const daysPassed = Math.floor(totalHours / 24);
  if (daysPassed > 0) {
    weather.day += daysPassed;
    events.push(`Day ${weather.day} in Palmetto Bay.`);
  }
  weather.hour = totalHours % 24;
  const wasNight = weather.isNight;
  weather.isNight = isNightHour(weather.hour);
  if (weather.isNight && !wasNight) events.push('Night falls over Palmetto Bay.');
  if (!weather.isNight && wasNight) events.push('Dawn breaks over the bay.');
  // Blend an in-progress change towards the new condition.
  if (weather.blend < 1) {
    weather.blend = Math.min(1, weather.blend + dt / WEATHER_BLEND_SECONDS);
    if (weather.blend >= 1) {
      weather.type = weather.to;
      weather.from = weather.to;
      weather.changes += 1;
      weather.history.push(weather.type);
      if (weather.history.length > 24) weather.history.shift();
      weather.lastChangeAt = weather.hour;
      weather.raining = isRaining(weather);
      events.push(`${WEATHER_DEFS[weather.type].label} over Palmetto Bay — ${WEATHER_DEFS[weather.type].description}`);
    }
  } else {
    weather.holdTimer -= dt;
    if (weather.holdTimer <= 0) {
      const next = pickNextWeather(rng, weather.type);
      if (next !== weather.type) startTransition(weather, next, rng);
      else weather.holdTimer = WEATHER_HOLD_MIN + rng() * (WEATHER_HOLD_MAX - WEATHER_HOLD_MIN);
    }
  }
  weather.raining = isRaining(weather);
  // Lightning only lives in a storm: a strike flashes the sky, then the
  // flash decays over about a second.
  if (weather.flash > 0) weather.flash = Math.max(0, weather.flash - dt * 1.4);
  if (weather.type === 'storm' || weather.to === 'storm') {
    weather.lightningTimer -= dt;
    if (weather.lightningTimer <= 0) {
      weather.lightningTimer = LIGHTNING_MIN_GAP + rng() * (LIGHTNING_MAX_GAP - LIGHTNING_MIN_GAP);
      weather.flash = 1;
      weather.strikes += 1;
      events.push('Lightning cracks across the bay.');
    }
  }
  return events;
}

// How many seconds until the next weather roll, for the HUD forecast.
export function secondsToNextChange(weather) {
  if (weather.blend < 1) return 0;
  return Math.max(0, weather.holdTimer);
}

// The chance (0..1) that the next change is rain or storm — the HUD uses
// it to warn Rico to get off the beach road before the sky opens.
export function rainChanceNext(weather) {
  const table = WEATHER_TRANSITIONS[weather.type] || WEATHER_TRANSITIONS.clear;
  let chance = 0;
  for (const [type, weight] of table) {
    if (type === 'rain' || type === 'storm') chance += weight;
  }
  return chance;
}

// A short forecast string: what is coming, and how sure the sky is.
export function forecastText(weather) {
  const next = WEATHER_DEFS[weather.forecast];
  const chance = Math.round(rainChanceNext(weather) * 100);
  if (weather.blend < 1) return `Changing to ${WEATHER_DEFS[weather.to].label} now.`;
  return `Forecast: ${next.label} next (${chance}% chance of rain).`;
}

// Visibility at a given point in the world: the beach road and the open
// water are a touch clearer than the downtown canyons in fog, because
// there is nothing for the fog to hang on to.
export function visibilityAt(weather, x, y) {
  const base = visibilityRange(weather);
  const open = y > 2100 || x < 200 || x > WORLD.width - 200;
  return open ? base * 1.15 : base;
}

// Does a police cruiser at (cx, cy) spot Rico at (px, py) right now?
// Distance, weather sight range, and night all count; a helicopter
// overhead (passed in as seenFromAbove) never loses him in any weather.
export function policeCanSee(weather, px, py, cx, cy, seenFromAbove) {
  if (seenFromAbove) return true;
  return Math.hypot(px - cx, py - cy) < policeSightRange(weather);
}

// Grip for a single car, so the driving code can ask the weather instead
// of reading a boolean off the old time object.
export function gripForCar(weather, car) {
  let grip = gripFactor(weather);
  if (car && car.topSpeed > 600) grip *= 0.97;
  return grip;
}

// The old main-loop shape: { hour, isNight, raining }. Weather state
// carries the same three fields, so existing readers keep working while
// the new systems read the richer numbers above.
export function weatherAsTime(weather) {
  return { hour: weather.hour, isNight: weather.isNight, raining: weather.raining };
}

// Rebuild weather state from a save: only the settled condition, the
// hour and the day survive — a blend in progress restarts settled.
export function serializeWeather(weather) {
  return {
    type: weather.type, hour: weather.hour, day: weather.day,
    changes: weather.changes, strikes: weather.strikes,
  };
}

export function deserializeWeather(data) {
  const w = createWeatherState(typeof data.hour === 'number' ? data.hour : TIME.startHour);
  if (data && WEATHER_DEFS[data.type]) {
    w.type = data.type;
    w.from = data.type;
    w.to = data.type;
    w.blend = 1;
    w.raining = isRaining(w);
  }
  if (data && typeof data.day === 'number') w.day = Math.max(1, data.day);
  if (data && typeof data.changes === 'number') w.changes = data.changes;
  if (data && typeof data.strikes === 'number') w.strikes = data.strikes;
  return w;
}
