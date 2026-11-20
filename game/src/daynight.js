// The day/night cycle and dynamic weather events for Palmetto Bay Heat.
// weather.js owns the sky — the condition, the clock, the blend. This
// module owns what the sky *does* to the city: the named phases of the
// day, the streetlights, the moon, and the events that roll across the
// bay without warning — a heat wave that hazes the horizon, a fog bank
// that swallows the beach road at dawn, a storm surge that turns a
// storm into a whiteout, a clear spell that opens the sky for an hour.
//
// An event is a schedule, not a dice roll per frame: the next one is
// booked minutes ahead, it runs for a fixed duration, and while it runs
// it hands the rest of the game a bundle of modifiers — visibility,
// grip, stamina drain — through eventEffect(). Nothing here touches the
// canvas; the renderer reads the phase and the active event and paints
// accordingly.
import { TIME } from './config.js';

// The named phases of a Palmetto Bay day: hour ranges, how bright the
// world is, and what the city is doing. Night is long here — the bay
// lives after dark.
export const DAY_PHASES = [
  { id: 'night', name: 'Night', from: 0, to: 5, light: 0.28, description: 'The city sleeps — only the neon and the lighthouse are awake.' },
  { id: 'dawn', name: 'Dawn', from: 5, to: 7, light: 0.6, description: 'First light over the water, fog on the beach road.' },
  { id: 'morning', name: 'Morning', from: 7, to: 11, light: 0.85, description: 'The city wakes up — traffic builds, shops open.' },
  { id: 'midday', name: 'Midday', from: 11, to: 15, light: 1.0, description: 'High sun over the bay — long sight lines, hot tarmac.' },
  { id: 'afternoon', name: 'Afternoon', from: 15, to: 17.5, light: 0.85, description: 'The light goes gold and the beach fills up.' },
  { id: 'dusk', name: 'Dusk', from: 17.5, to: 19.5, light: 0.6, description: 'The sun drops into the bay — the neon comes on.' },
  { id: 'night', name: 'Night', from: 19.5, to: 24, light: 0.28, description: 'The city sleeps — only the neon and the lighthouse are awake.' },
];

export function phaseForHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  for (const phase of DAY_PHASES) {
    if (h >= phase.from && h < phase.to) return phase;
  }
  return DAY_PHASES[0];
}

export function phaseIdForHour(hour) {
  return phaseForHour(hour).id;
}

// The eight moons of the Palmetto Bay calendar, one per night, cycling
// forever. A full moon means a brighter night and braver pedestrians.
export const MOON_PHASES = [
  'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
  'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
];

export function moonPhase(day) {
  return MOON_PHASES[((day - 1) % MOON_PHASES.length + MOON_PHASES.length) % MOON_PHASES.length];
}

export function isFullMoon(day) {
  return moonPhase(day) === 'Full Moon';
}

// Streetlights come on at dusk and go off at dawn — the renderer and
// the police both read this.
export function streetlightsOn(hour) {
  const phase = phaseIdForHour(hour);
  return phase === 'night' || phase === 'dusk' || phase === 'dawn';
}

// Shops and bars keep city hours: the Neon Bar earns a nightlife bonus
// after dark, the garage closes late. Returns a multiplier for a
// business id at this hour.
export function nightlifeMultiplier(hour, businessId) {
  const phase = phaseIdForHour(hour);
  if (businessId === 'bar' && (phase === 'night' || phase === 'dusk')) return 1.5;
  if (businessId === 'workshop' && phase === 'night') return 0.5;
  return 1;
}

// Dynamic events: what can roll across the bay, how long it lasts, and
// what it does to the city while it runs.
export const DAY_EVENTS = [
  {
    id: 'heatwave', name: 'Heat Wave', minDuration: 90, maxDuration: 180,
    description: 'The tarmac shimmers — the horizon hazes and the air feels heavy.',
    visibilityMul: 0.8, gripMul: 1.05, staminaMul: 1.5, policeMul: 0.9,
  },
  {
    id: 'fogbank', name: 'Fog Bank', minDuration: 60, maxDuration: 120,
    description: 'Fog rolls in off the water and swallows the beach road.',
    visibilityMul: 0.45, gripMul: 0.95, staminaMul: 1.0, policeMul: 0.7,
  },
  {
    id: 'stormsurge', name: 'Storm Surge', minDuration: 60, maxDuration: 150,
    description: 'The storm doubles down — rain like a wall, lightning like a strobe.',
    visibilityMul: 0.6, gripMul: 0.7, staminaMul: 1.2, policeMul: 1.25,
  },
  {
    id: 'clearspell', name: 'Clear Spell', minDuration: 120, maxDuration: 240,
    description: 'The sky opens up — the whole bay in sharp focus.',
    visibilityMul: 1.25, gripMul: 1.0, staminaMul: 0.9, policeMul: 1.0,
  },
  {
    id: 'nightchill', name: 'Night Chill', minDuration: 90, maxDuration: 180,
    description: 'A cold wind off the water — the streets empty out.',
    visibilityMul: 0.9, gripMul: 0.9, staminaMul: 1.1, policeMul: 0.8,
  },
];

export const EVENT_GAP_MIN = 120;
export const EVENT_GAP_MAX = 300;

export function eventById(id) {
  return DAY_EVENTS.find((e) => e.id === id) || null;
}

export function createDayNightState() {
  return {
    day: 1,
    hour: TIME.startHour,
    phase: phaseIdForHour(TIME.startHour),
    // The event schedule: what is running now, and when the next one
    // is booked. null means the sky is quiet.
    activeEvent: null, // { id, name, endsAt, startedAt }
    nextEventAt: 150, // seconds of game time until the next event
    elapsed: 0, // total seconds stepped
    eventsSeen: [], // ids of events that have run, oldest first
    phaseChanges: 0, // how many times the phase has flipped
  };
}

export function currentPhase(dayNight) {
  return phaseForHour(dayNight.hour);
}

// The modifiers in force right now: 1.0 across the board when the sky
// is quiet, the event's table while one runs.
export function eventEffect(dayNight) {
  const base = { visibilityMul: 1, gripMul: 1, staminaMul: 1, policeMul: 1 };
  if (!dayNight.activeEvent) return base;
  const def = eventById(dayNight.activeEvent.id);
  if (!def) return base;
  return {
    visibilityMul: def.visibilityMul,
    gripMul: def.gripMul,
    staminaMul: def.staminaMul,
    policeMul: def.policeMul,
  };
}

export function isEventActive(dayNight) {
  return !!dayNight.activeEvent;
}

export function activeEventName(dayNight) {
  return dayNight.activeEvent ? dayNight.activeEvent.name : null;
}

// Book the next event: pick one that fits the hour and the weather, and
// set its duration. Fog banks belong to dawn, storm surges to storms,
// heat waves to midday — a clear spell can arrive any time.
export function pickEventFor(weather, hour, random) {
  const rng = random || Math.random;
  const phase = phaseIdForHour(hour);
  const pool = DAY_EVENTS.filter((e) => {
    if (e.id === 'fogbank' && phase !== 'dawn' && phase !== 'morning') return false;
    if (e.id === 'stormsurge' && !(weather && (weather.type === 'storm' || weather.to === 'storm'))) return false;
    if (e.id === 'heatwave' && phase !== 'midday' && phase !== 'afternoon') return false;
    if (e.id === 'nightchill' && phase !== 'night') return false;
    return true;
  });
  const list = pool.length > 0 ? pool : DAY_EVENTS;
  return list[Math.floor(rng() * list.length)];
}

export function scheduleEvent(dayNight, weather, random) {
  const rng = random || Math.random;
  const def = pickEventFor(weather, dayNight.hour, rng);
  const duration = def.minDuration + rng() * (def.maxDuration - def.minDuration);
  dayNight.activeEvent = {
    id: def.id, name: def.name,
    startedAt: dayNight.elapsed, endsAt: dayNight.elapsed + duration,
  };
  dayNight.eventsSeen.push(def.id);
  return dayNight.activeEvent;
}

export function clearEvent(dayNight, random) {
  dayNight.activeEvent = null;
  const rng = random || Math.random;
  dayNight.nextEventAt = dayNight.elapsed + EVENT_GAP_MIN + rng() * (EVENT_GAP_MAX - EVENT_GAP_MIN);
}

// Force an event at once (debug, screenshots, mission scripts).
export function forceEvent(dayNight, id, durationSeconds) {
  const def = eventById(id);
  if (!def) return false;
  const duration = durationSeconds || def.minDuration;
  dayNight.activeEvent = {
    id: def.id, name: def.name,
    startedAt: dayNight.elapsed, endsAt: dayNight.elapsed + duration,
  };
  dayNight.eventsSeen.push(def.id);
  return true;
}

// Step the cycle: follow the weather clock, flip phases, run the event
// schedule. Returns event strings for the toast line.
export function stepDayNight(dayNight, weather, dt, random) {
  const rng = random || Math.random;
  const events = [];
  dayNight.elapsed += dt;
  if (weather) {
    dayNight.hour = weather.hour;
    dayNight.day = weather.day;
  }
  const phase = phaseIdForHour(dayNight.hour);
  if (phase !== dayNight.phase) {
    dayNight.phase = phase;
    dayNight.phaseChanges += 1;
    const def = DAY_PHASES.find((p) => p.id === phase);
    if (def) events.push(`${def.name} — ${def.description}`);
  }
  if (dayNight.activeEvent) {
    if (dayNight.elapsed >= dayNight.activeEvent.endsAt) {
      const done = dayNight.activeEvent;
      events.push(`The ${done.name} lifts — the sky settles.`);
      clearEvent(dayNight, rng);
    }
  } else if (dayNight.elapsed >= dayNight.nextEventAt) {
    const started = scheduleEvent(dayNight, weather, rng);
    const def = eventById(started.id);
    events.push(`${started.name} — ${def.description}`);
  }
  return events;
}

// How many seconds until the next event, or until the current one ends.
export function secondsToNextEvent(dayNight) {
  if (dayNight.activeEvent) return Math.max(0, dayNight.activeEvent.endsAt - dayNight.elapsed);
  return Math.max(0, dayNight.nextEventAt - dayNight.elapsed);
}

// How many events of each kind have run so far.
export function eventCounts(dayNight) {
  const counts = {};
  for (const id of dayNight.eventsSeen) counts[id] = (counts[id] || 0) + 1;
  return counts;
}

// One line for the HUD: time, phase, moon, and the active event.
export function dayNightHudLine(dayNight) {
  const phase = currentPhase(dayNight);
  const moon = moonPhase(dayNight.day);
  const event = dayNight.activeEvent ? ` — ${dayNight.activeEvent.name}` : '';
  return `Day ${dayNight.day} — ${phase.name} (${moon})${event}`;
}

export function dayNightSummaryLines(dayNight) {
  const phase = currentPhase(dayNight);
  const counts = eventCounts(dayNight);
  const lines = [
    `Day ${dayNight.day} — ${phase.name}: ${phase.description}`,
    `Moon: ${moonPhase(dayNight.day)} — streetlights ${streetlightsOn(dayNight.hour) ? 'on' : 'off'}`,
    `Events so far: ${dayNight.eventsSeen.length} (${Object.entries(counts).map(([k, v]) => `${k} x${v}`).join(', ') || 'none yet'})`,
    dayNight.activeEvent
      ? `Now: ${dayNight.activeEvent.name} — ${Math.ceil(secondsToNextEvent(dayNight))}s left`
      : `Next event in about ${Math.ceil(secondsToNextEvent(dayNight))}s`,
  ];
  return lines;
}

export function serializeDayNight(dayNight) {
  return {
    day: dayNight.day,
    hour: dayNight.hour,
    phase: dayNight.phase,
    activeEvent: dayNight.activeEvent ? { ...dayNight.activeEvent } : null,
    nextEventAt: dayNight.nextEventAt,
    elapsed: dayNight.elapsed,
    eventsSeen: [...dayNight.eventsSeen],
    phaseChanges: dayNight.phaseChanges,
  };
}

export function deserializeDayNight(data) {
  const d = createDayNightState();
  if (!data || typeof data !== 'object') return d;
  if (typeof data.day === 'number') d.day = Math.max(1, data.day);
  if (typeof data.hour === 'number') d.hour = data.hour;
  if (typeof data.phase === 'string') d.phase = data.phase;
  if (data.activeEvent) d.activeEvent = { ...data.activeEvent };
  if (typeof data.nextEventAt === 'number') d.nextEventAt = data.nextEventAt;
  if (typeof data.elapsed === 'number') d.elapsed = data.elapsed;
  if (Array.isArray(data.eventsSeen)) d.eventsSeen = [...data.eventsSeen];
  if (typeof data.phaseChanges === 'number') d.phaseChanges = data.phaseChanges;
  return d;
}
