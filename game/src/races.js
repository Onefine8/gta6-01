// Street racing for Palmetto Bay Heat. Three illegal circuits run after dark:
// pay an entry fee at the start line, beat three rival drivers over the
// checkpoints, and take the prize. Rivals are real cars on the road — they
// steer for the next checkpoint, rubber-band a little so a race is never
// decided on the first corner, and finish on their own clock. The player
// keeps racing on foot if they bail out of the car, just much more slowly.
import { WORLD } from './config.js';
import { clampToWorld } from './world.js';

export const STREET_RACE_CHECKPOINT_RADIUS = 110;

// Every track starts at its first checkpoint. Drive up to a start line in a
// car and press R — the track whose start you are standing on is the one
// you enter. Laps run the checkpoint loop again from the top.
export const STREET_RACE_TRACKS = [
  {
    id: 'bay-loop',
    name: 'Bay Loop',
    blurb: 'One lap around the whole city grid. Fast, simple, honest.',
    entryFee: 100,
    prize: 800,
    laps: 1,
    checkpoints: [
      { x: 2200, y: 600 },
      { x: 2800, y: 400 },
      { x: 2800, y: 2000 },
      { x: 400, y: 2000 },
      { x: 400, y: 400 },
    ],
  },
  {
    id: 'downtown-sprint',
    name: 'Downtown Sprint',
    blurb: 'Two tight laps through Downtown. Short straights, hard braking.',
    entryFee: 250,
    prize: 2000,
    laps: 2,
    checkpoints: [
      { x: 2000, y: 800 },
      { x: 2800, y: 800 },
      { x: 2800, y: 1600 },
      { x: 2000, y: 1600 },
    ],
  },
  {
    id: 'beachfront-circuit',
    name: 'Beachfront Circuit',
    blurb: 'Two long laps down to the beach and back. Top speed wins here.',
    entryFee: 400,
    prize: 3500,
    laps: 2,
    checkpoints: [
      { x: 400, y: 2000 },
      { x: 1600, y: 2000 },
      { x: 2800, y: 2000 },
      { x: 2800, y: 1200 },
      { x: 400, y: 1200 },
    ],
  },
];

// The three regulars on the scene. Each has a skill level that sets their
// top speed and how cleanly they take corners.
export const RIVAL_DRIVERS = [
  { name: 'Vex', color: '#c65df0', model: 'Neon GT', skill: 0.94 },
  { name: 'Luna', color: '#38bdf8', model: 'Sunset Roadster', skill: 0.88 },
  { name: 'Turbo Tommy', color: '#fb923c', model: 'Bay Runner', skill: 0.8 },
];

export function createStreetRaceState() {
  return {
    active: false,
    trackIndex: -1,
    lap: 1,
    checkpoint: 0,
    timer: 0,
    rivals: [],
    position: 4,
    finished: false,
    entryFeePaid: 0,
    best: {},
    wins: 0,
    racesRun: 0,
  };
}

// Which track start line is this spot standing on, if any? -1 means none.
export function trackAtStart(x, y) {
  for (let i = 0; i < STREET_RACE_TRACKS.length; i += 1) {
    const start = STREET_RACE_TRACKS[i].checkpoints[0];
    if (Math.hypot(x - start.x, y - start.y) < 170) return i;
  }
  return -1;
}

function angleDiff(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function spawnRivals(race, track, random) {
  const start = track.checkpoints[0];
  const next = track.checkpoints[1];
  const baseAngle = Math.atan2(next.y - start.y, next.x - start.x);
  // Rivals line up behind the start line, staggered left and right so they
  // do not spawn inside each other or inside the player's car.
  const backX = Math.cos(baseAngle);
  const backY = Math.sin(baseAngle);
  const sideX = Math.cos(baseAngle + Math.PI / 2);
  const sideY = Math.sin(baseAngle + Math.PI / 2);
  return RIVAL_DRIVERS.map((driver, i) => {
    const row = Math.floor(i / 2) + 1;
    const side = i % 2 === 0 ? -1 : 1;
    const jitter = (random() - 0.5) * 0.06;
    return {
      id: 2000 + i,
      name: driver.name,
      color: driver.color,
      model: driver.model,
      x: start.x - backX * (70 + row * 62) + sideX * side * 34,
      y: start.y - backY * (70 + row * 62) + sideY * side * 34,
      angle: baseAngle + jitter,
      speed: 0,
      topSpeed: Math.round((430 + random() * 60) * driver.skill),
      health: 100,
      parked: false,
      driver: 'rival',
      stolen: false,
      checkpoint: 0,
      lap: 1,
      finished: false,
      finishTime: 0,
      launchDelay: 0.5 + i * 0.25,
      turnSkill: 1.9 + driver.skill * 0.7,
    };
  });
}

export function startStreetRace(race, state, trackIndex, random) {
  const track = STREET_RACE_TRACKS[trackIndex];
  if (!track) return false;
  if (race.active) return false;
  if (state.missions.race.active) {
    state.missions.message = 'Finish the Palmetto GP first — one race at a time.';
    state.missions.messageTimer = 3;
    return false;
  }
  if (!state.player.inCar) {
    state.missions.message = 'You need a car to race — steal one first.';
    state.missions.messageTimer = 3;
    return false;
  }
  if (state.player.money < track.entryFee) {
    state.missions.message = `${track.name} entry is $${track.entryFee} — you are $${track.entryFee - state.player.money} short.`;
    state.missions.messageTimer = 4;
    return false;
  }
  state.player.money -= track.entryFee;
  race.active = true;
  race.trackIndex = trackIndex;
  race.lap = 1;
  race.checkpoint = 0;
  race.timer = 0;
  race.position = 4;
  race.finished = false;
  race.entryFeePaid = track.entryFee;
  race.rivals = spawnRivals(race, track, random);
  race.racesRun += 1;
  state.stats.streetRaces = (state.stats.streetRaces || 0) + 1;
  state.missions.message = `${track.name} — $${track.entryFee} in, $${track.prize} to the winner. ${track.laps} lap${track.laps > 1 ? 's' : ''}, ${track.checkpoints.length} checkpoints. GO!`;
  state.missions.messageTimer = 5;
  return true;
}

export function cancelStreetRace(race, state, reason) {
  if (!race.active) return;
  race.active = false;
  race.rivals = [];
  if (reason) {
    state.missions.message = reason;
    state.missions.messageTimer = 4;
  }
}

// A racer's progress score: laps first, then checkpoints, then closeness to
// the next checkpoint. A finished racer outranks everyone still driving,
// ordered by finish time.
function progressScore(racer, track, isPlayer, playerPos) {
  if (racer.finished) return 100000000 - racer.finishTime * 100;
  const cp = track.checkpoints[racer.checkpoint];
  const px = isPlayer ? playerPos.x : racer.x;
  const py = isPlayer ? playerPos.y : racer.y;
  const dist = Math.hypot(px - cp.x, py - cp.y);
  return racer.lap * 100000 + racer.checkpoint * 10000 - dist;
}

function currentPosition(race, state, track) {
  const playerCar = state.player.inCar;
  const px = playerCar ? playerCar.x : state.player.x;
  const py = playerCar ? playerCar.y : state.player.y;
  const playerRacer = {
    lap: race.lap,
    checkpoint: race.checkpoint,
    finished: race.finished,
    finishTime: race.timer,
  };
  const playerScore = progressScore(playerRacer, track, true, { x: px, y: py });
  let place = 1;
  for (const rival of race.rivals) {
    if (progressScore(rival, track, false) > playerScore) place += 1;
  }
  return place;
}

function stepRival(rival, track, dt, playerScore, random) {
  if (rival.finished) {
    rival.speed = Math.max(0, rival.speed - 200 * dt);
    rival.x += Math.cos(rival.angle) * rival.speed * dt;
    rival.y += Math.sin(rival.angle) * rival.speed * dt;
    return;
  }
  if (rival.launchDelay > 0) {
    rival.launchDelay -= dt;
    return;
  }
  const target = track.checkpoints[rival.checkpoint];
  const dist = Math.hypot(target.x - rival.x, target.y - rival.y);
  if (dist < STREET_RACE_CHECKPOINT_RADIUS) {
    rival.checkpoint += 1;
    if (rival.checkpoint >= track.checkpoints.length) {
      rival.checkpoint = 0;
      rival.lap += 1;
      if (rival.lap > track.laps) {
        rival.finished = true;
        rival.finishTime = rival.raceTimer || 0;
        rival.speed *= 0.5;
        return;
      }
    }
  }
  // Rubber-banding: a rival far behind the player finds a little extra
  // pace, one far ahead eases off, so races stay close to the end.
  const myScore = progressScore(rival, track, false);
  let pace = 1;
  if (playerScore - myScore > 15000) pace = 1.09;
  else if (myScore - playerScore > 15000) pace = 0.94;
  const wantAngle = Math.atan2(target.y - rival.y, target.x - rival.x);
  const diff = angleDiff(wantAngle, rival.angle);
  const turn = Math.max(-rival.turnSkill * dt, Math.min(rival.turnSkill * dt, diff));
  rival.angle += turn;
  // Hard corners cost speed: a rival turning sharply scrubs pace, just
  // like the player's car does when it drifts.
  const cornerPenalty = Math.abs(diff) > 0.9 ? 0.72 : 1;
  const desired = rival.topSpeed * pace * cornerPenalty;
  rival.speed += (desired - rival.speed) * dt * 1.1;
  rival.x += Math.cos(rival.angle) * rival.speed * dt;
  rival.y += Math.sin(rival.angle) * rival.speed * dt;
  const fixed = clampToWorld(rival.x, rival.y, 30);
  rival.x = fixed.x;
  rival.y = fixed.y;
  // A nudge of chaos: once in a while a rival clips a corner wide.
  if (random() < dt * 0.05) rival.angle += (random() - 0.5) * 0.3;
}

export function raceTimeString(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  if (minutes === 0) return `${rest.toFixed(1)}s`;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

export function streetRaceObjective(race) {
  if (!race.active) return null;
  const track = STREET_RACE_TRACKS[race.trackIndex];
  if (!track) return null;
  return {
    x: track.checkpoints[race.checkpoint].x,
    y: track.checkpoints[race.checkpoint].y,
    text: `${track.name} — lap ${race.lap}/${track.laps}, checkpoint ${race.checkpoint + 1}/${track.checkpoints.length}`,
  };
}

export function streetRaceStatusLine(race) {
  if (!race.active) return '';
  const track = STREET_RACE_TRACKS[race.trackIndex];
  if (!track) return '';
  const place = race.position;
  const suffix = place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th';
  return `${track.name} — ${place}${suffix} of 4 — lap ${race.lap}/${track.laps} — ${raceTimeString(race.timer)}`;
}

function finishPlayerRace(race, state, track) {
  race.active = false;
  race.finished = true;
  const place = currentPosition(race, state, track);
  race.position = place;
  const t = race.timer;
  const best = race.best[track.id];
  if (best === undefined || t < best) race.best[track.id] = t;
  let payout = 0;
  let line = '';
  if (place === 1) {
    payout = track.prize;
    race.wins += 1;
    state.stats.streetRaceWins = (state.stats.streetRaceWins || 0) + 1;
    line = `You won the ${track.name}! ${raceTimeString(t)} — +$${payout}`;
  } else if (place === 2) {
    payout = Math.floor(track.prize / 2);
    line = `2nd in the ${track.name} — ${raceTimeString(t)} — +$${payout}`;
  } else if (place === 3) {
    payout = race.entryFeePaid;
    line = `3rd in the ${track.name} — entry fee back, +$${payout}`;
  } else {
    line = `Last in the ${track.name} — ${raceTimeString(t)} — entry fee lost.`;
  }
  if (payout > 0) {
    state.player.money += payout;
    state.stats.earned = (state.stats.earned || 0) + payout;
  }
  race.rivals = [];
  state.missions.message = line;
  state.missions.messageTimer = 5;
}

export function stepStreetRace(race, state, dt, random) {
  if (!race.active) return;
  const track = STREET_RACE_TRACKS[race.trackIndex];
  if (!track) {
    race.active = false;
    return;
  }
  race.timer += dt;
  for (const rival of race.rivals) rival.raceTimer = race.timer;
  const playerCar = state.player.inCar;
  const px = playerCar ? playerCar.x : state.player.x;
  const py = playerCar ? playerCar.y : state.player.y;
  const playerRacer = { lap: race.lap, checkpoint: race.checkpoint, finished: false, finishTime: 0 };
  const playerScore = progressScore(playerRacer, track, true, { x: px, y: py });
  // The player's checkpoint: drive through the ring to advance, lap after lap.
  const cp = track.checkpoints[race.checkpoint];
  if (Math.hypot(px - cp.x, py - cp.y) < STREET_RACE_CHECKPOINT_RADIUS) {
    race.checkpoint += 1;
    if (race.checkpoint >= track.checkpoints.length) {
      race.checkpoint = 0;
      race.lap += 1;
      if (race.lap > track.laps) {
        finishPlayerRace(race, state, track);
        return;
      }
      state.missions.message = `Lap ${race.lap} of ${track.laps} — ${currentPosition(race, state, track)} of 4!`;
      state.missions.messageTimer = 2;
    } else {
      state.missions.message = `Checkpoint ${race.checkpoint + 1} of ${track.checkpoints.length} — keep pushing!`;
      state.missions.messageTimer = 2;
    }
  }
  for (const rival of race.rivals) stepRival(rival, track, dt, playerScore, random);
  race.position = currentPosition(race, state, track);
  // Everyone finished but the player: the race is over, score it on pace.
  if (race.rivals.length > 0 && race.rivals.every((r) => r.finished)) {
    finishPlayerRace(race, state, track);
  }
}

// Short course guide for the help screen and the start-line prompt.
export function streetRaceGuide() {
  return STREET_RACE_TRACKS.map((track, i) => {
    const start = track.checkpoints[0];
    return `${i + 1}. ${track.name} — $${track.entryFee} in, $${track.prize} to win, ${track.laps} lap${track.laps > 1 ? 's' : ''} (starts ${start.x}, ${start.y})`;
  }).join('\n');
}
