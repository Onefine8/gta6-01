// Street racing for Palmetto Bay Heat: five circuits around the city, four
// AI rivals who actually drive the course, an entry fee per circuit, an $800
// prize for the winner, and a best time kept separately for each circuit.
//
// A race is a state machine owned by the main loop: it starts at a checkered
// flag (press R near one), runs while Rico stays in his car, and ends when he
// crosses the last checkpoint. Rivals follow the same checkpoints with their
// own speed and skill, so the player has to beat them, not just the clock.
// Each rival plans its speed from the corner ahead — braking for a sharp
// turn, easing off when it is a checkpoint clear of the pack, and pushing
// when it is behind — with a rubber band that keeps every race close.
import { WORLD } from './config.js';
import { clampToWorld, collideBuildings } from './world.js';

export const RACE_PRIZE = 800;
export const RACE_CHECKPOINT_RADIUS = 120;
export const RACE_START_RADIUS = 160;

// The five circuits. Each one is a loop of checkpoints on the road grid;
// the start flag is where Rico parks and presses R to enter.
export const RACE_CIRCUITS = [
  {
    id: 0,
    name: 'Marina Loop',
    entryFee: 100,
    start: { x: 600, y: 200, angle: 0 },
    checkpoints: [
      { x: 2800, y: 200 },
      { x: 2800, y: 1600 },
      { x: 400, y: 1600 },
      { x: 400, y: 200 },
    ],
  },
  {
    id: 1,
    name: 'Downtown Dash',
    entryFee: 200,
    start: { x: 2000, y: 1200, angle: 0 },
    checkpoints: [
      { x: 2800, y: 1200 },
      { x: 2800, y: 400 },
      { x: 2000, y: 400 },
      { x: 2000, y: 1200 },
    ],
  },
  {
    id: 2,
    name: 'Beachfront Sprint',
    entryFee: 300,
    start: { x: 400, y: 2000, angle: 0 },
    checkpoints: [
      { x: 2800, y: 2000 },
      { x: 2800, y: 1600 },
      { x: 400, y: 1600 },
      { x: 400, y: 2000 },
    ],
  },
  {
    id: 3,
    name: 'Bay Perimeter Run',
    entryFee: 400,
    start: { x: 400, y: 400, angle: 0 },
    checkpoints: [
      { x: 2800, y: 400 },
      { x: 2800, y: 2000 },
      { x: 400, y: 2000 },
      { x: 400, y: 400 },
    ],
  },
  {
    id: 4,
    name: 'Park Slalom',
    entryFee: 500,
    start: { x: 1600, y: 1200, angle: 0 },
    checkpoints: [
      { x: 2800, y: 1200 },
      { x: 2800, y: 400 },
      { x: 1200, y: 400 },
      { x: 1200, y: 2000 },
      { x: 1600, y: 2000 },
    ],
  },
];

// The regulars at the start line. Faster rivals also drive cleaner lines;
// the slowest one is cheap to beat, the fastest one is a real fight.
export const RACE_RIVALS = [
  { name: 'Vex', color: '#c65df0', topSpeed: 460, skill: 0.92 },
  { name: 'Marisol', color: '#3f8fe8', topSpeed: 500, skill: 0.97 },
  { name: 'Turbo Tommy', color: '#e8533f', topSpeed: 535, skill: 1.0 },
  { name: 'Ghost', color: '#22d3ee', topSpeed: 560, skill: 1.0 },
];

export function createRaceState() {
  return {
    active: false,
    circuitIndex: 0,
    checkpoint: 0,
    timer: 0,
    // Best finish time per circuit, in seconds; null means never finished.
    // One slot per circuit in RACE_CIRCUITS.
    best: RACE_CIRCUITS.map(() => null),
    rivals: [],
    playerPlace: 0,
    wins: 0,
  };
}

// The circuit whose start flag is closest to (x, y), or -1 when Rico is not
// near any start line.
export function nearestCircuit(x, y, maxDist) {
  const limit = maxDist === undefined ? RACE_START_RADIUS : maxDist;
  let found = -1;
  let foundD = limit;
  for (let i = 0; i < RACE_CIRCUITS.length; i += 1) {
    const s = RACE_CIRCUITS[i].start;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < foundD) { foundD = d; found = i; }
  }
  return found;
}

export function currentRaceCheckpoint(race) {
  if (!race.active) return null;
  const circuit = RACE_CIRCUITS[race.circuitIndex];
  if (!circuit) return null;
  return circuit.checkpoints[race.checkpoint] || null;
}

export function formatRaceTime(t) {
  if (t === null || t === undefined) return '—';
  return `${t.toFixed(1)}s`;
}

function ordinal(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

// Where Rico sits right now: rivals ahead of him on the course count against
// him, rivals behind do not.
export function racePosition(race) {
  let ahead = 0;
  for (const rival of race.rivals) {
    if (rival.finished) ahead += 1;
    else if (rival.checkpoint > race.checkpoint) ahead += 1;
  }
  return ahead + 1;
}

export function racePositionText(race) {
  return `${ordinal(racePosition(race))} of ${race.rivals.length + 1}`;
}

// A short message on the mission toast line, if the state carries one.
function tell(state, text, seconds) {
  if (state.missions) {
    state.missions.message = text;
    state.missions.messageTimer = seconds || 3;
  }
}

// Why Rico cannot enter this circuit right now, or null when he can.
export function canStartRace(state, circuitIndex) {
  const race = state.race;
  const circuit = RACE_CIRCUITS[circuitIndex];
  if (!circuit) return 'There is no circuit here.';
  if (race.active) return 'You are already in a race — finish it first.';
  if (!state.player.inCar) return 'You need a car to race — steal one first (E).';
  if (state.player.money < circuit.entryFee) {
    return `${circuit.name} entry is $${circuit.entryFee} — you only have $${state.player.money}.`;
  }
  return null;
}

// Wrap an angle difference into -PI..PI so a rival never turns the long way.
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Line the rivals up behind the start flag, staggered so they do not start
// inside each other, all facing down the first straight.
function lineUpRivals(race, circuit, random) {
  const a = circuit.start.angle;
  const sideX = Math.cos(a + Math.PI / 2);
  const sideY = Math.sin(a + Math.PI / 2);
  race.rivals = RACE_RIVALS.map((def, i) => {
    const back = 52 + i * 58;
    const lateral = (i % 2 === 0 ? -1 : 1) * 30;
    const wobble = random ? (random() - 0.5) * 12 : 0;
    return {
      name: def.name,
      color: def.color,
      topSpeed: def.topSpeed,
      skill: def.skill,
      x: circuit.start.x - Math.cos(a) * back + sideX * (lateral + wobble),
      y: circuit.start.y - Math.sin(a) * back + sideY * (lateral + wobble),
      angle: a,
      speed: 0,
      backup: 0,
      checkpoint: 0,
      finished: false,
      finishTime: null,
      place: 0,
    };
  });
}

export function startRace(race, state, circuitIndex, random) {
  const circuit = RACE_CIRCUITS[circuitIndex];
  const whyNot = canStartRace(state, circuitIndex);
  if (whyNot) {
    tell(state, whyNot, 4);
    return false;
  }
  state.player.money -= circuit.entryFee;
  race.active = true;
  race.circuitIndex = circuitIndex;
  race.checkpoint = 0;
  race.timer = 0;
  race.playerPlace = 0;
  lineUpRivals(race, circuit, random);
  tell(state, `${circuit.name} — entry $${circuit.entryFee}. Beat ${RACE_RIVALS.map((r) => r.name).join(', ')} to the flag for $${RACE_PRIZE}!`, 5);
  return true;
}

// How fast this rival wants to go right now: its own top speed, trimmed
// for the corner it is steering into, for the corner after that, and for
// where it sits against Rico — the rubber band.
function rivalTargetSpeed(rival, race, circuit, turnSharpness, distToCp) {
  let target = rival.topSpeed * (0.9 + 0.1 * rival.skill);
  if (turnSharpness > 0.7) target *= 0.55;
  else if (turnSharpness > 0.3) target *= 0.8;
  const nextCp = circuit.checkpoints[rival.checkpoint + 1];
  if (nextCp && distToCp < 500) {
    const targetCp = circuit.checkpoints[rival.checkpoint];
    const outAngle = Math.atan2(nextCp.y - targetCp.y, nextCp.x - targetCp.x);
    const inAngle = Math.atan2(targetCp.y - rival.y, targetCp.x - rival.x);
    let corner = Math.abs(angleDiff(outAngle, inAngle));
    if (corner > 0.5) target = Math.min(target, 210);
  }
  // Rubber band: a rival a checkpoint ahead eases off, one behind pushes
  // harder, so races stay close instead of being decided at the start.
  if (rival.checkpoint > race.checkpoint) target *= 0.94;
  if (rival.checkpoint < race.checkpoint) target *= 1.07;
  return target;
}

function driveRival(rival, race, state, dt, random) {
  if (rival.finished) return;
  const circuit = RACE_CIRCUITS[race.circuitIndex];
  const target = circuit.checkpoints[rival.checkpoint];
  if (!target) return;
  // Unstick: after ramming a building, back straight out for a moment
  // instead of grinding against the wall at full throttle.
  if (rival.backup > 0) {
    rival.backup -= dt;
    rival.speed = -150;
    rival.x += Math.cos(rival.angle) * rival.speed * dt;
    rival.y += Math.sin(rival.angle) * rival.speed * dt;
    return;
  }
  const dx = target.x - rival.x;
  const dy = target.y - rival.y;
  const dist = Math.hypot(dx, dy);
  const wantAngle = Math.atan2(dy, dx);
  const diff = angleDiff(wantAngle, rival.angle);
  // Sharp turns bleed speed, so a rival that overshoots a corner pays for it.
  rival.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  const targetSpeed = rivalTargetSpeed(rival, race, circuit, Math.abs(diff), dist);
  // A little wobble in the line, so rivals do not drive like slot cars.
  if (random) rival.angle += (random() - 0.5) * 0.5 * dt;
  // Braking bites faster than accelerating, so corner slowdowns actually happen.
  const ease = targetSpeed < rival.speed ? dt * 4 : dt * 1.6;
  rival.speed += (targetSpeed - rival.speed) * Math.min(1, ease);
  const nx = rival.x + Math.cos(rival.angle) * rival.speed * dt;
  const ny = rival.y + Math.sin(rival.angle) * rival.speed * dt;
  const fixed = collideBuildings(state.city, nx, ny, 22);
  const clamped = clampToWorld(fixed.x, fixed.y, 24);
  if (Math.hypot(fixed.x - nx, fixed.y - ny) > 1) {
    rival.speed *= 0.5;
    rival.backup = 0.6;
  }
  rival.x = clamped.x;
  rival.y = clamped.y;
  if (dist < RACE_CHECKPOINT_RADIUS) {
    rival.checkpoint += 1;
    if (rival.checkpoint >= circuit.checkpoints.length) {
      rival.finished = true;
      rival.finishTime = race.timer;
      rival.place = 1 + race.rivals.filter((r) => r.finished).length;
      tell(state, `${rival.name} finished in ${rival.finishTime.toFixed(1)}s!`, 3);
    }
  }
}

function finishRace(race, state) {
  const circuit = RACE_CIRCUITS[race.circuitIndex];
  const t = race.timer;
  race.active = false;
  race.playerPlace = 1 + race.rivals.filter((r) => r.finished).length;
  const previousBest = race.best[race.circuitIndex];
  if (previousBest === null || t < previousBest) race.best[race.circuitIndex] = t;
  const isRecord = previousBest === null || t < previousBest;
  if (race.playerPlace === 1) {
    state.player.money += RACE_PRIZE;
    race.wins += 1;
    if (state.stats) state.stats.racesWon = (state.stats.racesWon || 0) + 1;
    tell(state, `${circuit.name} — YOU WIN in ${t.toFixed(1)}s! +$${RACE_PRIZE}${isRecord ? ' — new best time!' : ''}`, 6);
  } else {
    tell(state, `${circuit.name} — finished ${ordinal(race.playerPlace)} in ${t.toFixed(1)}s. No prize — win it next time.${isRecord ? ' Still a new best time!' : ''}`, 5);
  }
  race.rivals = [];
}

export function stepRace(race, state, dt, random) {
  if (!race.active) return;
  // Busted, wasted or out of the car: the race is over, entry fee lost.
  if (state.busted || state.wasted || !state.player.inCar) {
    race.active = false;
    race.rivals = [];
    if (!state.busted && !state.wasted) tell(state, 'Race abandoned — you left the car.', 3);
    return;
  }
  const car = state.player.inCar;
  if (car.health <= 0) {
    race.active = false;
    race.rivals = [];
    tell(state, 'Your car is wrecked — race over.', 3);
    return;
  }
  race.timer += dt;
  const circuit = RACE_CIRCUITS[race.circuitIndex];
  for (const rival of race.rivals) driveRival(rival, race, state, dt, random);
  const cp = circuit.checkpoints[race.checkpoint];
  if (!cp) return;
  if (Math.hypot(car.x - cp.x, car.y - cp.y) < RACE_CHECKPOINT_RADIUS) {
    race.checkpoint += 1;
    if (race.checkpoint >= circuit.checkpoints.length) {
      finishRace(race, state);
    } else {
      tell(state, `Checkpoint ${race.checkpoint} of ${circuit.checkpoints.length} — ${racePositionText(race)}!`, 2);
    }
  }
}

// One line per circuit for the title screen: name, entry fee, best time.
export function raceSummaryLines(race) {
  return RACE_CIRCUITS.map((c, i) => {
    const best = race.best[i];
    return `${c.name} ($${c.entryFee} in, $${RACE_PRIZE} to win): best ${formatRaceTime(best)}`;
  });
}

export function totalRacesWon(race) {
  return race.wins;
}

export function bestRaceTime(race) {
  let best = null;
  for (const t of race.best) {
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

// Keep the world inside the map when a circuit is defined near an edge.
export function circuitsFitWorld() {
  for (const circuit of RACE_CIRCUITS) {
    const points = [circuit.start, ...circuit.checkpoints];
    for (const p of points) {
      if (p.x < 40 || p.x > WORLD.width - 40 || p.y < 40 || p.y > WORLD.height - 40) return false;
    }
  }
  return true;
}
