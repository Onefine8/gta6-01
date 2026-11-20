// NPC traffic AI for Palmetto Bay Heat: the cars on the road are not
// slot cars. Each one gets a personality — a commuter who minds the
// speed limit, a speeder who tailgates, a truck that lumbers along, a
// taxi that stops at every curb, and a cautious driver who brakes for
// shadows — and the system around them adds rush hour, traffic jams,
// road rage and horns.
//
// The base driving (cruise, turn, brake for the car ahead) still lives
// in vehicles.js; this module layers behaviour on top of it. A traffic
// car keeps its personality in fields the step function reads: cruise,
// aggression, rage and patience. Nothing here touches the canvas — the
// renderer only reads positions, colours and the rage flag for a honk
// bubble.
import { WORLD } from './config.js';
import { roadXs, roadYs } from './world.js';

// One entry per personality: how fast they cruise relative to the road,
// how closely they follow, how often they change their mind at an
// intersection, and how quickly they get angry.
export const TRAFFIC_PERSONALITIES = [
  { id: 'commuter', name: 'Commuter', cruise: 1.0, follow: 80, turnChance: 0.012, rageRate: 0.2, weight: 0.4 },
  { id: 'speeder', name: 'Speeder', cruise: 1.35, follow: 45, turnChance: 0.02, rageRate: 0.8, weight: 0.2 },
  { id: 'truck', name: 'Trucker', cruise: 0.75, follow: 110, turnChance: 0.006, rageRate: 0.1, weight: 0.15 },
  { id: 'taxi', name: 'Taxi Driver', cruise: 1.1, follow: 60, turnChance: 0.03, rageRate: 0.4, weight: 0.15 },
  { id: 'cautious', name: 'Cautious Driver', cruise: 0.85, follow: 120, turnChance: 0.008, rageRate: 0.05, weight: 0.1 },
];

// Rush hour: the city wakes up at 8 and goes home at 17. Density is a
// multiplier on how many traffic cars the spawner should keep on the
// road — 1.0 is a normal hour, 1.8 is the morning crawl.
export function rushHourFactor(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7.5 && h < 9.5) return 1.8;
  if (h >= 16.5 && h < 18.5) return 1.6;
  if (h >= 12 && h < 14) return 1.3;
  if (h >= 22 || h < 5) return 0.5;
  return 1.0;
}

export function isRushHour(hour) {
  return rushHourFactor(hour) >= 1.6;
}

// How many traffic cars the road should hold at this hour, given the
// base count the game spawns with.
export function trafficDensityForHour(baseCount, hour) {
  return Math.max(4, Math.round(baseCount * rushHourFactor(hour)));
}

// Pick a personality by weight, with the seeded random.
export function pickPersonality(random) {
  const rng = random || Math.random;
  let roll = rng();
  for (const p of TRAFFIC_PERSONALITIES) {
    roll -= p.weight;
    if (roll <= 0) return p.id;
  }
  return 'commuter';
}

export function personalityById(id) {
  return TRAFFIC_PERSONALITIES.find((p) => p.id === id) || TRAFFIC_PERSONALITIES[0];
}

// Give a traffic car its personality: cruise speed, following distance,
// turn chance and a cool head. Safe to call twice — it only fills in
// what is missing.
export function assignTrafficPersonality(car, random) {
  if (car.personality) return car.personality;
  const id = pickPersonality(random);
  const def = personalityById(id);
  car.personality = id;
  car.cruise = Math.round((car.cruise || 150) * def.cruise);
  car.follow = def.follow;
  car.turnChance = def.turnChance;
  car.rage = 0;
  car.patience = 60 + (random ? random() * 60 : 30);
  car.honkTimer = 0;
  return id;
}

export function trafficPersonality(car) {
  return car.personality ? personalityById(car.personality) : null;
}

// How angry this driver is, 0..100. Rage grows when they are cut off or
// stuck, and cools when the road opens up.
export function roadRageLevel(car) {
  return Math.max(0, Math.min(100, car.rage || 0));
}

export function isRoadRaging(car) {
  return roadRageLevel(car) >= 60;
}

// Cut a driver off (or lean on the horn next to them) and their rage
// climbs by their personality's rate. A raging driver speeds up and
// tailgates; a calm one just brakes.
export function provokeDriver(car, amount) {
  const def = trafficPersonality(car);
  const rate = def ? def.rageRate : 0.3;
  car.rage = Math.max(0, Math.min(100, (car.rage || 0) + amount * rate));
  return car.rage;
}

export function calmDriver(car, amount) {
  car.rage = Math.max(0, (car.rage || 0) - amount);
  return car.rage;
}

// A horn blast at a driver: they honk back if they are already annoyed,
// and their patience takes a hit either way.
export function honkAt(car, random) {
  car.honkTimer = 1.5;
  if (roadRageLevel(car) >= 40) {
    provokeDriver(car, 10);
    return true;
  }
  car.patience = Math.max(0, (car.patience || 60) - 10);
  return false;
}

// The traffic AI system state: jam reports, honks heard, and how many
// drivers are raging right now.
export function createTrafficAIState() {
  return {
    jams: [], // [{ x, y, cars, since }] — clusters of slow cars
    honks: 0, // horns heard since the game started
    raging: 0, // drivers over the rage line right now
    nearMisses: 0, // times Rico flashed past a car at speed
    elapsed: 0,
  };
}

// Find a traffic jam: a cluster of cars all crawling below 40 within a
// 200-unit circle. Returns the clusters, biggest first.
export function findTrafficJams(traffic) {
  const clusters = [];
  const used = new Set();
  for (let i = 0; i < traffic.length; i += 1) {
    if (used.has(i)) continue;
    const car = traffic[i];
    if (Math.abs(car.speed) >= 40) continue;
    const members = [i];
    for (let j = i + 1; j < traffic.length; j += 1) {
      if (used.has(j)) continue;
      const other = traffic[j];
      if (Math.abs(other.speed) >= 40) continue;
      if (Math.hypot(other.x - car.x, other.y - car.y) < 200) members.push(j);
    }
    if (members.length >= 3) {
      for (const m of members) used.add(m);
      let x = 0;
      let y = 0;
      for (const m of members) { x += traffic[m].x; y += traffic[m].y; }
      clusters.push({ x: x / members.length, y: y / members.length, cars: members.length, since: 0 });
    }
  }
  clusters.sort((a, b) => b.cars - a.cars);
  return clusters;
}

// The jam nearest a point, or null when the roads are clear.
export function trafficJamAt(traffic, x, y, maxDist) {
  const jams = findTrafficJams(traffic);
  let found = null;
  let foundD = maxDist === undefined ? Infinity : maxDist;
  for (const jam of jams) {
    const d = Math.hypot(jam.x - x, jam.y - y);
    if (d < foundD) { foundD = d; found = jam; }
  }
  return found;
}

// The nearest traffic car to a point, within a range — for near-miss
// bonuses, horns and road-rage provocations.
export function nearestTrafficCar(traffic, x, y, maxDist) {
  let found = null;
  let foundD = maxDist === undefined ? Infinity : maxDist;
  for (const car of traffic) {
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < foundD) { foundD = d; found = car; }
  }
  return found;
}

// How many traffic cars are in a rectangle — the density check the
// spawner and the jam detector both use.
export function countTrafficInArea(traffic, x0, y0, x1, y1) {
  let n = 0;
  for (const car of traffic) {
    if (car.x >= x0 && car.x <= x1 && car.y >= y0 && car.y <= y1) n += 1;
  }
  return n;
}

// One AI tick for one traffic car: personality cruise, rage decay,
// patience drain in a jam, and a honk when the car ahead will not move.
export function stepTrafficAI(car, dt, random, others, ai) {
  if (!car.personality) assignTrafficPersonality(car, random);
  const def = personalityById(car.personality);
  // Rage cools when the road is open, grows when stuck behind someone.
  let blocked = false;
  if (others) {
    for (const other of others) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = car.vertical ? dy * car.dir : dx * car.dir;
      const lateral = car.vertical ? Math.abs(dx) : Math.abs(dy);
      if (ahead > 0 && ahead < def.follow && lateral < 30) { blocked = true; break; }
    }
  }
  if (blocked) {
    car.patience = Math.max(0, (car.patience || 60) - dt * 4);
    if (car.patience <= 0) {
      provokeDriver(car, 12 * dt);
      car.patience = 20;
    }
  } else {
    car.patience = Math.min(120, (car.patience || 60) + dt * 2);
    calmDriver(car, 6 * dt);
  }
  // A raging driver pushes past their cruise speed and closes the gap.
  if (isRoadRaging(car)) {
    car.speed = Math.min(car.topSpeed + 40, car.speed + 120 * dt);
  }
  if (car.honkTimer > 0) car.honkTimer -= dt;
  // Honk at the car ahead when stuck and annoyed — the sound the player
  // hears as a short beep in the traffic.
  if (blocked && roadRageLevel(car) >= 50 && car.honkTimer <= 0) {
    car.honkTimer = 2.5;
    if (ai) ai.honks += 1;
  }
  return blocked;
}

// Step the whole traffic system: assign personalities to new cars, run
// one AI tick per car, and refresh the jam report.
export function stepTrafficSystem(ai, traffic, dt, random, state) {
  ai.elapsed += dt;
  let raging = 0;
  for (const car of traffic) {
    if (!car.personality) assignTrafficPersonality(car, random);
    stepTrafficAI(car, dt, random, traffic, ai);
    if (isRoadRaging(car)) raging += 1;
  }
  ai.raging = raging;
  ai.jams = findTrafficJams(traffic);
  for (const jam of ai.jams) jam.since = ai.elapsed;
  return ai;
}

// A near miss past a traffic car: the driver gets a fright and a little
// rage, and the system counts it for the record books.
export function trafficNearMiss(ai, traffic, x, y) {
  const car = nearestTrafficCar(traffic, x, y, 72);
  if (!car) return null;
  provokeDriver(car, 25);
  ai.nearMisses += 1;
  return car;
}

// Taxi cars on the road right now — they stop at curbs and wait, so a
// fare can find them.
export function taxiCars(traffic) {
  return traffic.filter((c) => c.personality === 'taxi');
}

// The fastest car on the road right now, by speed — usually a speeder
// with somewhere to be.
export function fastestTrafficCar(traffic) {
  let best = null;
  for (const car of traffic) {
    if (!best || Math.abs(car.speed) > Math.abs(best.speed)) best = car;
  }
  return best;
}

// Average speed of the traffic right now — the flow of the city.
export function averageTrafficSpeed(traffic) {
  if (traffic.length === 0) return 0;
  let sum = 0;
  for (const car of traffic) sum += Math.abs(car.speed);
  return sum / traffic.length;
}

// One line per personality for the traffic screen: how many drivers of
// each kind are on the road, and how angry they are.
export function trafficSummaryLines(traffic, ai) {
  const lines = [];
  for (const def of TRAFFIC_PERSONALITIES) {
    const cars = traffic.filter((c) => c.personality === def.id);
    if (cars.length === 0) continue;
    const rage = Math.round(cars.reduce((s, c) => s + roadRageLevel(c), 0) / cars.length);
    lines.push(`${def.name}: ${cars.length} on the road, average rage ${rage}`);
  }
  lines.push(`Traffic jams right now: ${ai ? ai.jams.length : 0} — drivers raging: ${ai ? ai.raging : 0} — horns heard: ${ai ? ai.honks : 0}`);
  return lines;
}

// Is this stretch of road clear enough to race down? A jam ahead means
// the race line is blocked.
export function roadClearForRace(traffic, x0, y0, x1, y1) {
  return countTrafficInArea(traffic, x0, y0, x1, y1) < 3 && findTrafficJams(traffic).length === 0;
}
