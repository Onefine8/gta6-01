// Side activities for Palmetto Bay Heat: the jobs Rico picks up between
// story missions. Four of them, each a small state machine that lives
// alongside the missions and pays cash, so free roam always has something
// to do:
//
//   Courier — a chain of package drops against the clock, with a streak
//     bonus for doing them back to back without a miss.
//   Vigilante — fugitives loose in the city: catch them (punch or shoot
//     them down) before the timer runs out, and the PBPD pays a bounty.
//   Shooting range — pop-up targets at the Harbor range, scored on hits
//     and accuracy, with a leaderboard best to beat.
//   Street bets — put cash on a street race rival and watch the odds.
//
// Every activity is pure logic — a seeded random, a dt, and the shared
// state — so the headless tests can run a whole courier shift, a
// vigilante hunt and a betting slip in milliseconds.
import { WORLD } from './config.js';

// A short message on the mission toast line, if the state carries one.
function tell(state, text, seconds) {
  if (state.missions) {
    state.missions.message = text;
    state.missions.messageTimer = seconds || 3;
  }
}

function ricoPos(state) {
  const ride = state.player.inCar;
  return ride ? { x: ride.x, y: ride.y } : { x: state.player.x, y: state.player.y };
}

// --- Courier ----------------------------------------------------------------
// A courier shift is a chain of drops: each drop pays a base fee plus
// distance, the clock resets per drop, and finishing one drop inside the
// time starts the next with a growing streak bonus. Missing the clock
// ends the shift and banks only what was already earned.
export const COURIER_STOPS = [
  { x: 400, y: 400, name: 'Marina Garage' },
  { x: 2800, y: 400, name: 'Coral Hotel' },
  { x: 400, y: 2000, name: 'Harbor Market' },
  { x: 2800, y: 2000, name: 'Lighthouse Point' },
  { x: 1400, y: 1000, name: 'Palmetto Park' },
  { x: 2000, y: 1200, name: 'Downtown' },
  { x: 1200, y: 2000, name: 'Bay General Hospital' },
  { x: 2000, y: 400, name: '5th Avenue' },
  { x: 600, y: 2260, name: 'Beachfront Pier' },
  { x: 2800, y: 1600, name: 'Lighthouse Point East' },
];

export const COURIER_BASE_PAY = 80;
export const COURIER_PER_UNIT = 0.04;
export const COURIER_DROP_SECONDS = 75;
export const COURIER_STREAK_BONUS = 25;
export const COURIER_MAX_STREAK = 8;

export function createCourierState() {
  return {
    active: false, dx: 0, dy: 0, name: '', timer: 0, pay: 0,
    drops: 0, streak: 0, bestStreak: 0, earned: 0, shifts: 0,
  };
}

// A drop pays the base fee plus distance from where Rico stood when the
// drop was assigned — a cross-city run is worth more than a hop.
function courierPay(fx, fy, stop) {
  return Math.round(COURIER_BASE_PAY + Math.hypot(stop.x - fx, stop.y - fy) * COURIER_PER_UNIT);
}

function pickStop(rng, notX, notY) {
  // A different stop than the last one, with a bounded retry so a tiny
  // stop list can never spin forever.
  let next = COURIER_STOPS[Math.floor(rng() * COURIER_STOPS.length)];
  let guard = 0;
  while (next.x === notX && next.y === notY && guard < 20) {
    next = COURIER_STOPS[Math.floor(rng() * COURIER_STOPS.length)];
    guard += 1;
  }
  return next;
}

export function startCourier(courier, state, random) {
  if (courier.active) return false;
  const rng = random || Math.random;
  const pos = ricoPos(state);
  const far = COURIER_STOPS.filter((s) => Math.hypot(s.x - pos.x, s.y - pos.y) > 300);
  const pick = far[Math.floor(rng() * far.length)] || COURIER_STOPS[0];
  courier.active = true;
  courier.dx = pick.x;
  courier.dy = pick.y;
  courier.name = pick.name;
  courier.timer = COURIER_DROP_SECONDS;
  courier.pay = courierPay(pos.x, pos.y, pick);
  courier.drops = 0;
  courier.streak = 0;
  courier.shifts += 1;
  tell(state, `Courier shift started — deliver to ${pick.name} ($${courier.pay}).`, 4);
  return true;
}

export function courierObjective(courier) {
  if (!courier.active) return null;
  return { x: courier.dx, y: courier.dy, text: `Courier drop: ${courier.name} ($${courier.pay})` };
}

export function stepCourier(courier, state, dt, random) {
  if (!courier.active) return;
  courier.timer -= dt;
  if (courier.timer <= 0) {
    courier.active = false;
    courier.streak = 0;
    tell(state, `Courier shift over — the ${courier.name} drop went cold. ${courier.drops} drops done, $${courier.earned} earned.`, 4);
    return;
  }
  const pos = ricoPos(state);
  if (Math.hypot(pos.x - courier.dx, pos.y - courier.dy) >= 110) return;
  // Drop made: base pay plus a streak bonus that grows per consecutive
  // drop, capped so a long shift does not pay silly money.
  const streakBonus = Math.min(courier.streak, COURIER_MAX_STREAK) * COURIER_STREAK_BONUS;
  const total = courier.pay + streakBonus;
  state.player.money += total;
  if (state.stats) state.stats.earned = (state.stats.earned || 0) + total;
  courier.earned += total;
  courier.drops += 1;
  courier.streak += 1;
  courier.bestStreak = Math.max(courier.bestStreak, courier.streak);
  tell(state, `Package delivered! +$${total}${streakBonus > 0 ? ` (includes $${streakBonus} streak bonus)` : ''}`, 4);
  // Next drop: a different stop, with a fresh clock.
  const rng = random || Math.random;
  const next = pickStop(rng, courier.dx, courier.dy);
  courier.dx = next.x;
  courier.dy = next.y;
  courier.name = next.name;
  courier.timer = COURIER_DROP_SECONDS;
  courier.pay = courierPay(pos.x, pos.y, next);
}

export function quitCourier(courier, state) {
  if (!courier.active) return false;
  courier.active = false;
  courier.streak = 0;
  tell(state, `Courier shift ended — ${courier.drops} drops, $${courier.earned} earned.`, 3);
  return true;
}

// --- Vigilante --------------------------------------------------------------
// The PBPD pays bounties for fugitives loose in the city. A hunt starts
// with one fugitive on the map; catching them (walk up and punch them, or
// shoot them down) pays the bounty and spawns the next one, hotter than
// the last. Let the timer run out and the fugitive slips away.
export const VIGILANTE_FUGITIVES = [
  { name: 'Eddie "Slippery" Voss', bounty: 300, speed: 150, health: 100 },
  { name: 'Carla Mendez', bounty: 400, speed: 170, health: 100 },
  { name: 'Big Lou', bounty: 550, speed: 130, health: 160 },
  { name: '"Ghost" Ramirez', bounty: 700, speed: 190, health: 100 },
  { name: 'The Harbor Rat', bounty: 900, speed: 180, health: 140 },
];

export const VIGILANTE_HUNT_SECONDS = 90;
export const VIGILANTE_CAPTURE_RADIUS = 40;

export function createVigilanteState() {
  return {
    active: false, name: '', bounty: 0, fx: 0, fy: 0, timer: 0,
    caught: 0, earned: 0, escaped: 0, hunts: 0, fugitiveIndex: 0,
  };
}

function spawnFugitive(vigilante, state, random) {
  const rng = random || Math.random;
  const def = VIGILANTE_FUGITIVES[vigilante.fugitiveIndex % VIGILANTE_FUGITIVES.length];
  const pos = ricoPos(state);
  // The fugitive starts a few blocks away, never on top of Rico.
  const angle = rng() * Math.PI * 2;
  const dist = 500 + rng() * 500;
  vigilante.name = def.name;
  vigilante.bounty = def.bounty;
  vigilante.fx = Math.max(80, Math.min(WORLD.width - 80, pos.x + Math.cos(angle) * dist));
  vigilante.fy = Math.max(80, Math.min(WORLD.height - 80, pos.y + Math.sin(angle) * dist));
  vigilante.timer = VIGILANTE_HUNT_SECONDS;
  // The fugitive is a pedestrian with a flag, so punches and bullets
  // already know how to hurt them — see weapons.js and player.js.
  state.peds.push({
    x: vigilante.fx, y: vigilante.fy, angle: rng() * Math.PI * 2,
    speed: def.speed, color: '#991b1b', walkPhase: 0,
    fleeing: false, fleeTimer: 0, changeTimer: 99, health: def.health,
    fugitive: true, down: false,
  });
}

export function startVigilante(vigilante, state, random) {
  if (vigilante.active) return false;
  vigilante.active = true;
  vigilante.hunts += 1;
  spawnFugitive(vigilante, state, random);
  tell(state, `Vigilante hunt: catch ${vigilante.name} — $${vigilante.bounty} bounty.`, 4);
  return true;
}

export function currentFugitivePed(vigilante, state) {
  if (!state || !state.peds) return null;
  return state.peds.find((p) => p.fugitive && p.health > 0) || null;
}

export function vigilanteObjective(vigilante) {
  if (!vigilante.active) return null;
  const fugitive = currentFugitivePed(vigilante);
  return {
    x: fugitive ? fugitive.x : vigilante.fx,
    y: fugitive ? fugitive.y : vigilante.fy,
    text: `Catch ${vigilante.name} ($${vigilante.bounty})`,
  };
}

// A fugitive on the ground is a catch: punch them down, or shoot them
// down, and the bounty pays. Returns the bounty, or 0.
export function checkVigilanteCatch(vigilante, state) {
  if (!vigilante.active) return 0;
  const fugitive = (state.peds || []).find((p) => p.fugitive);
  if (!fugitive) return 0;
  const pos = ricoPos(state);
  const down = fugitive.health <= 0;
  const grabbed = !down && Math.hypot(fugitive.x - pos.x, fugitive.y - pos.y) < VIGILANTE_CAPTURE_RADIUS && !state.player.inCar;
  if (!down && !grabbed) return 0;
  const bounty = vigilante.bounty;
  state.player.money += bounty;
  if (state.stats) state.stats.earned = (state.stats.earned || 0) + bounty;
  vigilante.earned += bounty;
  vigilante.caught += 1;
  vigilante.fugitiveIndex += 1;
  // The caught fugitive leaves the street; the next one is already running.
  state.peds = state.peds.filter((p) => !p.fugitive);
  tell(state, `${vigilante.name} caught! +$${bounty} bounty.`, 4);
  spawnFugitive(vigilante, state, state.random);
  return bounty;
}

export function stepVigilante(vigilante, state, dt, random) {
  if (!vigilante.active) return;
  vigilante.timer -= dt;
  // The fugitive runs from Rico: the pedestrian code already flees from
  // the player, so here we just keep the marker on them and count down.
  const fugitive = (state.peds || []).find((p) => p.fugitive && p.health > 0);
  if (fugitive) {
    vigilante.fx = fugitive.x;
    vigilante.fy = fugitive.y;
    const d = Math.hypot(fugitive.x - state.player.x, fugitive.y - state.player.y);
    if (d < 300 && !fugitive.fleeing) {
      fugitive.fleeing = true;
      fugitive.fleeTimer = 2;
    }
  }
  checkVigilanteCatch(vigilante, state);
  if (!vigilante.active) return;
  if (vigilante.timer <= 0) {
    vigilante.active = false;
    vigilante.escaped += 1;
    state.peds = (state.peds || []).filter((p) => !p.fugitive);
    tell(state, `${vigilante.name} slipped away — the bounty is gone.`, 4);
  }
}

export function quitVigilante(vigilante, state) {
  if (!vigilante.active) return false;
  vigilante.active = false;
  state.peds = (state.peds || []).filter((p) => !p.fugitive);
  tell(state, 'Vigilante hunt called off.', 3);
  return true;
}

// --- Shooting range ---------------------------------------------------------
// The Harbor shooting range: pay the entry, and targets pop up for a
// minute. Each hit scores by distance — far targets pay more — and the
// best score is kept. A perfect round (every target hit) pays a bonus.
export const RANGE_ENTRY_FEE = 50;
export const RANGE_ROUND_SECONDS = 60;
export const RANGE_TARGET_COUNT = 8;
export const RANGE_PERFECT_BONUS = 200;

export const RANGE_TARGETS = [
  { x: 500, y: 2100, dist: 1, points: 100 },
  { x: 700, y: 2100, dist: 1, points: 100 },
  { x: 900, y: 2100, dist: 2, points: 150 },
  { x: 1100, y: 2100, dist: 2, points: 150 },
  { x: 1300, y: 2100, dist: 3, points: 250 },
  { x: 1500, y: 2100, dist: 3, points: 250 },
  { x: 1700, y: 2100, dist: 4, points: 400 },
  { x: 1900, y: 2100, dist: 4, points: 400 },
];

export function createRangeState() {
  return {
    active: false, timer: 0, score: 0, hits: 0, shots: 0,
    best: 0, rounds: 0, perfects: 0,
    targets: RANGE_TARGETS.map((t) => ({ ...t, up: false, hit: false })),
  };
}

export function canStartRange(state) {
  if (state.minigames.range.active) return 'You are already on the range — finish the round first.';
  if (state.player.money < RANGE_ENTRY_FEE) {
    return `Range entry is $${RANGE_ENTRY_FEE} — you only have $${state.player.money}.`;
  }
  return null;
}

export function startRange(range, state, random) {
  const whyNot = canStartRange(state);
  if (whyNot) {
    tell(state, whyNot, 4);
    return false;
  }
  const rng = random || Math.random;
  state.player.money -= RANGE_ENTRY_FEE;
  range.active = true;
  range.timer = RANGE_ROUND_SECONDS;
  range.score = 0;
  range.hits = 0;
  range.shots = 0;
  range.rounds += 1;
  // Pop a random half of the targets up to start with.
  for (const t of range.targets) {
    t.up = rng() < 0.5;
    t.hit = false;
  }
  tell(state, `Range round started — $${RANGE_ENTRY_FEE} entry, ${RANGE_ROUND_SECONDS}s, hit the pop-up targets!`, 4);
  return true;
}

// Rico shoots a target: the caller passes the target index and the shot
// report (from weapons.js) so the range can score hits and count shots.
export function rangeShoot(range, state, targetIndex, hit) {
  if (!range.active) return 0;
  range.shots += 1;
  const target = range.targets[targetIndex];
  if (!target || !target.up || target.hit) return 0;
  if (!hit) return 0;
  target.hit = true;
  target.up = false;
  range.hits += 1;
  range.score += target.points;
  // A fresh target pops up elsewhere, so the round never runs dry.
  const down = range.targets.filter((t) => !t.up && !t.hit);
  if (down.length > 0) {
    const next = down[Math.floor(Math.random() * down.length)];
    next.up = true;
  }
  return target.points;
}

export function rangeAccuracy(range) {
  if (range.shots === 0) return 0;
  return range.hits / range.shots;
}

function shuffleRangeTargets(range, rng) {
  for (const t of range.targets) {
    if (t.hit) continue;
    if (t.up && rng() < 0.3) t.up = false;
    else if (!t.up && rng() < 0.25) t.up = true;
  }
  if (!range.targets.some((t) => t.up)) {
    range.targets[Math.floor(rng() * range.targets.length)].up = true;
  }
}

export function stepRange(range, state, dt, random) {
  if (!range.active) return;
  range.timer -= dt;
  const rng = random || Math.random;
  // Targets shuffle every couple of seconds: some drop, others pop up.
  range.shuffleTimer = (range.shuffleTimer || 0) - dt;
  if (range.shuffleTimer <= 0) {
    range.shuffleTimer = 2;
    shuffleRangeTargets(range, rng);
  }
  if (range.timer <= 0) {
    range.active = false;
    const allHit = range.hits === range.targets.length;
    const flawless = range.hits >= 8 && range.shots === range.hits;
    let payout = range.score;
    if (allHit || flawless) {
      payout += RANGE_PERFECT_BONUS;
      range.perfects += 1;
    }
    state.player.money += payout;
    if (state.stats) state.stats.earned = (state.stats.earned || 0) + payout;
    range.best = Math.max(range.best, range.score);
    tell(state, `Range round over — ${range.hits} hits, score ${range.score}, +$${payout}${payout > range.score ? ' (includes perfect bonus!)' : ''}. Best: ${range.best}.`, 5);
  }
}

// --- Street bets ------------------------------------------------------------
// The bookie on the corner takes bets on the street race regulars. Each
// rival has odds — the favourite pays little, the long shot pays a lot —
// and the race is simulated from their top speeds and skill, with a
// seeded random so a fixed seed replays the same winner.
export const BET_RIVALS = [
  { name: 'Vex', odds: 5.0, topSpeed: 460, skill: 0.92 },
  { name: 'Marisol', odds: 3.5, topSpeed: 500, skill: 0.97 },
  { name: 'Turbo Tommy', odds: 2.2, topSpeed: 535, skill: 1.0 },
  { name: 'Ghost', odds: 1.8, topSpeed: 560, skill: 1.0 },
];

export const BET_MIN = 50;
export const BET_MAX = 1000;

export function createBetState() {
  return {
    placed: null, // { rival, amount, odds } while a bet is live
    won: 0, lost: 0, profit: 0, bets: 0,
    lastResult: null,
  };
}

export function canPlaceBet(state, rivalName, amount) {
  if (state.minigames.bets.placed) return 'You already have a bet running — wait for the race.';
  const rival = BET_RIVALS.find((r) => r.name === rivalName);
  if (!rival) return `There is no racer called ${rivalName} — try ${BET_RIVALS.map((r) => r.name).join(', ')}.`;
  if (amount < BET_MIN) return `Minimum bet is $${BET_MIN}.`;
  if (amount > BET_MAX) return `Maximum bet is $${BET_MAX}.`;
  if (state.player.money < amount) return `You only have $${state.player.money} — that bet is too rich.`;
  return null;
}

export function placeBet(bets, state, rivalName, amount) {
  const whyNot = canPlaceBet(state, rivalName, amount);
  if (whyNot) {
    tell(state, whyNot, 4);
    return false;
  }
  const rival = BET_RIVALS.find((r) => r.name === rivalName);
  state.player.money -= amount;
  bets.placed = { rival: rival.name, amount, odds: rival.odds };
  bets.bets += 1;
  tell(state, `Bet placed: $${amount} on ${rival.name} at ${rival.odds.toFixed(1)}x. The race is on!`, 4);
  return true;
}

// Simulate the race the bet rides on: each rival's pace is top speed
// times skill, plus a random wobble, so the favourite usually wins but
// the long shot sometimes steals it.
export function simulateBetRace(random) {
  const rng = random || Math.random;
  let winner = null;
  let bestPace = -1;
  for (const rival of BET_RIVALS) {
    const pace = rival.topSpeed * rival.skill * (0.9 + rng() * 0.2);
    if (pace > bestPace) {
      bestPace = pace;
      winner = rival.name;
    }
  }
  return winner;
}

export function resolveBet(bets, state, random) {
  if (!bets.placed) return null;
  const winner = simulateBetRace(random);
  const placed = bets.placed;
  bets.placed = null;
  const won = winner === placed.rival;
  if (won) {
    const payout = Math.round(placed.amount * placed.odds);
    state.player.money += payout;
    if (state.stats) state.stats.earned = (state.stats.earned || 0) + payout - placed.amount;
    bets.won += 1;
    bets.profit += payout - placed.amount;
    bets.lastResult = `${placed.rival} won! +$${payout - placed.amount} profit.`;
    tell(state, `${placed.rival} won the race! Your $${placed.amount} pays $${payout}.`, 5);
    return { winner, won: true, payout, profit: payout - placed.amount };
  }
  bets.lost += 1;
  bets.profit -= placed.amount;
  bets.lastResult = `${winner} won — your $${placed.amount} on ${placed.rival} is gone.`;
  tell(state, `${winner} won the race — your $${placed.amount} on ${placed.rival} is gone.`, 5);
  return { winner, won: false, payout: 0, profit: -placed.amount };
}

// --- The bundle -------------------------------------------------------------

export function createMinigameState() {
  return {
    courier: createCourierState(),
    vigilante: createVigilanteState(),
    range: createRangeState(),
    bets: createBetState(),
  };
}

// Step every side activity. The courier and the vigilante both want the
// objective arrow, so the caller asks each one in turn; this step only
// advances timers and pays out.
export function stepMinigames(minigames, state, dt, random) {
  stepCourier(minigames.courier, state, dt, random);
  stepVigilante(minigames.vigilante, state, dt, random);
  stepRange(minigames.range, state, dt, random);
  // Bets resolve instantly when the player asks (resolveBet) — there is
  // nothing to step here, the race is simulated on demand.
}

// The active side objective, for the minimap arrow: courier first, then
// the vigilante hunt, then the range (which has no arrow — it is a place,
// not a chase).
export function minigameObjective(minigames) {
  return courierObjective(minigames.courier)
    || vigilanteObjective(minigames.vigilante)
    || null;
}

export function minigameSummaryLines(minigames) {
  const c = minigames.courier;
  const v = minigames.vigilante;
  const r = minigames.range;
  const b = minigames.bets;
  return [
    `Courier: ${c.drops} drops, best streak ${c.bestStreak}, $${c.earned} earned${c.active ? ` — drop at ${c.name} ($${c.pay})` : ''}`,
    `Vigilante: ${v.caught} caught, ${v.escaped} escaped, $${v.earned} in bounties${v.active ? ` — hunting ${v.name}` : ''}`,
    `Shooting range: best score ${r.best}, ${r.rounds} rounds, ${r.perfects} perfect${r.active ? ` — ${Math.ceil(r.timer)}s left, score ${r.score}` : ''}`,
    `Street bets: ${b.won} won, ${b.lost} lost, profit $${b.profit}${b.placed ? ` — $${b.placed.amount} on ${b.placed.rival}` : ''}`,
  ];
}

// One line for the HUD: whichever side job is live right now.
export function minigameHudLine(minigames) {
  const c = minigames.courier;
  if (c.active) return `Courier: ${c.name} — $${c.pay} (${Math.ceil(c.timer)}s, streak x${c.streak})`;
  const v = minigames.vigilante;
  if (v.active) return `Vigilante: catch ${v.name} — $${v.bounty} (${Math.ceil(v.timer)}s)`;
  const r = minigames.range;
  if (r.active) return `Range: score ${r.score}, ${r.hits} hits (${Math.ceil(r.timer)}s left)`;
  const b = minigames.bets;
  if (b.placed) return `Bet: $${b.placed.amount} on ${b.placed.rival} at ${b.placed.odds.toFixed(1)}x`;
  return '';
}

export function serializeMinigames(minigames) {
  return {
    courier: { drops: minigames.courier.drops, bestStreak: minigames.courier.bestStreak, earned: minigames.courier.earned, shifts: minigames.courier.shifts },
    vigilante: { caught: minigames.vigilante.caught, earned: minigames.vigilante.earned, escaped: minigames.vigilante.escaped, hunts: minigames.vigilante.hunts },
    range: { best: minigames.range.best, rounds: minigames.range.rounds, perfects: minigames.range.perfects },
    bets: { won: minigames.bets.won, lost: minigames.bets.lost, profit: minigames.bets.profit, bets: minigames.bets.bets },
  };
}

export function deserializeMinigames(data) {
  const m = createMinigameState();
  if (!data || typeof data !== 'object') return m;
  if (data.courier) Object.assign(m.courier, data.courier);
  if (data.vigilante) Object.assign(m.vigilante, data.vigilante);
  if (data.range) Object.assign(m.range, data.range);
  if (data.bets) Object.assign(m.bets, data.bets);
  return m;
}
