// Story missions and side activities for Palmetto Bay Heat. Each mission is a small
// state machine: an intro line, a chain of objectives (go here, do that), a reward,
// and a fail condition. Side activities — the street race and the hidden packages —
// live here too, so the main loop only asks: what is the current objective?
import { HEIST } from './config.js';
import { addWanted } from './police.js';
export const MISSION_DEFS = [
  {
    id: 1,
    title: 'Wheels Up',
    giver: 'Marina',
    intro: 'Marina: "Rico, you are back. I need wheels — borrow that Sunset Coupe by the Coral Hotel and bring it to my garage. Try not to scratch it."',
    reward: 400,
    failText: 'The coupe was wrecked. Marina is not paying for scrap.',
    steps: [
      { kind: 'steal', text: 'Steal the Sunset Coupe near Coral Hotel', x: 2960, y: 260, radius: 90 },
      { kind: 'goto', text: 'Drive the coupe to Marina Garage', x: 360, y: 360, radius: 110, needCar: true },
    ],
  },
  {
    id: 2,
    title: 'Bayfront Dash',
    giver: 'Marina',
    intro: 'Marina: "A buyer is waiting at Lighthouse Point with cash. Three drops, one route, and the clock is running. The cops are jumpy tonight — keep it clean."',
    reward: 900,
    failText: 'Too slow — the buyer walked away.',
    timeLimit: 150,
    steps: [
      { kind: 'goto', text: 'Drop 1 of 3: Harbor Market', x: 360, y: 2060, radius: 110 },
      { kind: 'goto', text: 'Drop 2 of 3: Coral Hotel', x: 2960, y: 260, radius: 110 },
      { kind: 'goto', text: 'Drop 3 of 3: Lighthouse Point', x: 2960, y: 2060, radius: 110 },
    ],
  },
  {
    id: 3,
    title: 'Heat Wave',
    giver: 'Dante',
    intro: 'Dante: "The whole department is on us after that dash. Lose them, all of them — then meet me at the park. No cops on your tail, or no deal."',
    reward: 1200,
    failText: 'Busted. Dante will not wait around for a jailbird.',
    steps: [
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
      { kind: 'goto', text: 'Meet Dante at Palmetto Park', x: 1400, y: 1000, radius: 110 },
    ],
  },
  {
    id: 4,
    title: 'Harbor Heist',
    giver: 'Dante',
    intro: 'Dante: "Last job, Rico — the big one. Take the Harbor Van from the market, run it to Lighthouse Point, then vanish. The whole precinct will be looking for that van."',
    reward: 2000,
    failText: 'The van never made it. Dante is done with you.',
    timeLimit: 180,
    steps: [
      { kind: 'steal', model: 'Harbor Van', text: 'Steal the Harbor Van near Harbor Market', x: 360, y: 2060, radius: 120 },
      { kind: 'goto', text: 'Deliver the van to Lighthouse Point', x: 2960, y: 2060, radius: 110, needCar: true },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
  {
    id: 5,
    title: 'Downtown Heist',
    giver: 'Dante',
    intro: 'Dante: "The real score, Rico — the Downtown bank vault. Get inside, hold the drill on the vault till it pops, grab the bags, then vanish before the precinct boxes you in. This one pays like nothing else."',
    reward: 3500,
    failText: 'The vault job blew up. Dante is done with you.',
    timeLimit: 240,
    steps: [
      { kind: 'goto', text: 'Reach the Downtown bank on 5th Avenue', x: HEIST.vaultX, y: HEIST.vaultY, radius: 110 },
      { kind: 'crack', text: 'Crack the vault — stay inside while the drill works', x: HEIST.vaultX, y: HEIST.vaultY, radius: HEIST.vaultRadius, seconds: HEIST.crackSeconds, alarmStars: HEIST.alarmStars },
      { kind: 'goto', text: 'Grab the cash bags at the vault door', x: 2520, y: 1120, radius: 80 },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
];

export const RACE = {
  name: 'Palmetto GP',
  start: { x: 600, y: 200 },
  checkpoints: [
    { x: 2600, y: 200 },
    { x: 2600, y: 1800 },
    { x: 600, y: 1800 },
    { x: 600, y: 200 },
  ],
  prize: 600,
};

// Taxi side job: pick up a fare anywhere in the city and drop them off.
// Repeatable, pays by distance, and runs alongside the story missions.
export const TAXI_STOPS = [
  { x: 400, y: 400, name: 'Marina Garage' },
  { x: 2800, y: 400, name: 'Coral Hotel' },
  { x: 400, y: 2000, name: 'Harbor Market' },
  { x: 2800, y: 2000, name: 'Lighthouse Point' },
  { x: 1400, y: 1000, name: 'Palmetto Park' },
  { x: 2000, y: 1200, name: 'Downtown' },
  { x: 1200, y: 2000, name: 'Bay General Hospital' },
  { x: 2000, y: 400, name: '5th Avenue' },
];

export function createMissionState() {
  return {
    index: 0, // which mission of MISSION_DEFS is active (0-based); >= length = story done
    step: 0,
    active: false,
    introTimer: 0,
    introText: '',
    timer: 0,
    failed: false,
    failText: '',
    done: false,
    race: { active: false, checkpoint: 0, timer: 0, best: null },
    taxi: { active: false, phase: '', px: 0, py: 0, dx: 0, dy: 0, name: '', timer: 0, fare: 0 },
    packagesFound: 0,
    message: '',
    messageTimer: 0,
    // Vault-cracking progress for mission 5: the drill only works while Rico
    // stays inside the vault ring, and the alarm goes off exactly once.
    crackTimer: 0,
    crackArmed: false,
  };
}

export function startMission(missions, index) {
  const def = MISSION_DEFS[index];
  missions.index = index;
  missions.step = 0;
  missions.active = true;
  missions.failed = false;
  missions.done = false;
  missions.introText = def.intro;
  missions.introTimer = 6;
  missions.timer = def.timeLimit || 0;
  missions.crackTimer = 0;
  missions.crackArmed = false;
  missions.message = `${def.title} — ${def.giver}`;
  missions.messageTimer = 4;
  return def;
}

export function currentStep(missions) {
  const def = MISSION_DEFS[missions.index];
  if (!def || !missions.active) return null;
  return def.steps[missions.step] || null;
}

export function objectiveText(missions) {
  if (!missions.active) {
    if (missions.index >= MISSION_DEFS.length) return 'Story complete — free roam. Press M for the next job board.';
    return 'Press M to start the next mission.';
  }
  const step = currentStep(missions);
  return step ? step.text : '';
}

// Vault-drill progress, 0 to 1, while the current step is a crack step;
// null the rest of the time, so the HUD only draws the bar when it matters.
export function crackProgress(missions) {
  if (!missions.active) return null;
  const step = currentStep(missions);
  if (!step || step.kind !== 'crack') return null;
  return Math.max(0, Math.min(1, missions.crackTimer / (step.seconds || 12)));
}

export function showMessage(missions, text, seconds) {
  missions.message = text;
  missions.messageTimer = seconds || 3;
}

export function stepMissions(missions, state, dt, events) {
  if (missions.messageTimer > 0) missions.messageTimer -= dt;
  if (missions.introTimer > 0) missions.introTimer -= dt;
  if (!missions.active || missions.failed) return;
  const def = MISSION_DEFS[missions.index];
  if (missions.timer > 0) {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      missions.active = false;
      missions.failed = true;
      missions.failText = def.failText;
      return;
    }
  }
  const step = currentStep(missions);
  if (!step) return;
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  if (step.kind === 'steal') {
    // The step advances only when Rico is actually driving the right car —
    // any old stolen car does not count.
    const wantModel = step.model || 'Sunset Coupe';
    if (state.player.inCar && state.player.inCar.model === wantModel) {
      missions.step += 1;
      showMessage(missions, `Got the ${wantModel}. Now get it where it needs to go.`, 3);
    } else if (events.stolenCar && state.player.inCar && state.player.inCar.model !== wantModel) {
      showMessage(missions, `Wrong car — the job needs a ${wantModel}.`, 3);
    }
  } else if (step.kind === 'goto') {
    const d = Math.hypot(px - step.x, py - step.y);
    if (d < step.radius && (!step.needCar || state.player.inCar)) {
      missions.step += 1;
      if (missions.step >= def.steps.length) completeMission(missions, state, def);
      else showMessage(missions, 'Objective done — next stop marked.', 3);
    }
  } else if (step.kind === 'crack') {
    // Vault cracking: the drill only bites while Rico stays in the ring.
    // Stepping out lets the drill cool — progress decays, it does not reset.
    // The alarm trips the first moment the drill starts, and it brings heat.
    if (!missions.crackArmed) {
      missions.crackArmed = true;
      missions.crackTimer = 0;
      addWanted(state, step.alarmStars || 2);
      showMessage(missions, 'ALARM! The vault drill is loud — police are coming. Hold the ring!', 4);
    }
    const d = Math.hypot(px - step.x, py - step.y);
    if (d < step.radius) {
      missions.crackTimer += dt;
      if (missions.crackTimer >= (step.seconds || 12)) {
        missions.step += 1;
        missions.crackTimer = 0;
        showMessage(missions, 'Vault popped! Grab the cash bags and run.', 3);
      }
    } else {
      missions.crackTimer = Math.max(0, missions.crackTimer - dt * 0.5);
      if (missions.crackTimer <= 0) showMessage(missions, 'Get back in the vault ring — the drill is stalling!', 2);
    }
  } else if (step.kind === 'escape') {
    if (state.wanted === 0) {
      missions.step += 1;
      // An escape as the final step completes the mission (mission 4 ends here).
      if (missions.step >= def.steps.length) completeMission(missions, state, def);
      else showMessage(missions, 'Clean. Now meet Dante at the park.', 3);
    }
  }
  // The getaway car must survive mission 1.
  if (def.id === 1 && state.player.inCar && state.player.inCar.health <= 0) {
    missions.active = false;
    missions.failed = true;
    missions.failText = def.failText;
  }
}

export function completeMission(missions, state, def) {
  missions.active = false;
  missions.done = true;
  missions.index += 1;
  let reward = def.reward;
  // Mission 5 pays a clean-getaway bonus when the clock still has a minute on it.
  if (def.id === 5 && missions.timer > HEIST.cleanBonusSeconds) {
    reward += HEIST.cleanBonus;
    showMessage(missions, `${def.title} complete! +$${reward} (includes $${HEIST.cleanBonus} clean-getaway bonus)`, 5);
  } else if (def.id === 1 && state.player.inCar && state.player.inCar.health >= 80) {
    reward += 100;
    showMessage(missions, `${def.title} complete! +$${reward} (includes $100 clean-delivery bonus)`, 5);
  } else {
    showMessage(missions, `${def.title} complete! +$${reward}`, 5);
  }
  state.player.money += reward;
}

export function startRace(missions) {
  missions.race.active = true;
  missions.race.checkpoint = 0;
  missions.race.timer = 0;
  showMessage(missions, 'Palmetto GP started! Hit all 4 checkpoints — fastest lap wins $600.', 4);
}

export function startTaxi(missions, state, random) {
  const taxi = missions.taxi;
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  // Pick a pickup stop that is not right on top of Rico, then a different drop-off.
  const stops = TAXI_STOPS.filter((s) => Math.hypot(s.x - px, s.y - py) > 300);
  const pickup = stops[Math.floor(random() * stops.length)] || TAXI_STOPS[0];
  let drop = TAXI_STOPS[Math.floor(random() * TAXI_STOPS.length)];
  while (drop === pickup) drop = TAXI_STOPS[Math.floor(random() * TAXI_STOPS.length)];
  taxi.active = true;
  taxi.phase = 'pickup';
  taxi.px = pickup.x;
  taxi.py = pickup.y;
  taxi.dx = drop.x;
  taxi.dy = drop.y;
  taxi.name = drop.name;
  taxi.timer = 30;
  taxi.fare = 0;
  showMessage(missions, `Taxi fare: pick up the passenger at ${pickup.name}.`, 4);
  return taxi;
}

export function taxiObjective(missions) {
  const taxi = missions.taxi;
  if (!taxi.active) return null;
  if (taxi.phase === 'pickup') return { x: taxi.px, y: taxi.py, text: 'Pick up the taxi passenger' };
  return { x: taxi.dx, y: taxi.dy, text: `Drop the passenger at ${taxi.name}` };
}

export function stepTaxi(missions, state, dt) {
  const taxi = missions.taxi;
  if (!taxi.active) return;
  taxi.timer -= dt;
  if (taxi.timer <= 0) {
    taxi.active = false;
    showMessage(missions, 'The passenger gave up waiting — fare lost.', 3);
    return;
  }
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  if (taxi.phase === 'pickup') {
    if (Math.hypot(px - taxi.px, py - taxi.py) < 90) {
      taxi.phase = 'dropoff';
      taxi.timer = 90;
      const dist = Math.hypot(taxi.dx - taxi.px, taxi.dy - taxi.py);
      taxi.fare = Math.round(60 + dist * 0.055);
      showMessage(missions, `Passenger aboard — take them to ${taxi.name} ($${taxi.fare}).`, 4);
    }
  } else if (Math.hypot(px - taxi.dx, py - taxi.dy) < 110) {
    taxi.active = false;
    state.player.money += taxi.fare;
    state.stats.taxis = (state.stats.taxis || 0) + 1;
    showMessage(missions, `Fare complete! +$${taxi.fare}`, 4);
  }
}

export function stepRace(missions, state, dt) {
  const race = missions.race;
  if (!race.active) return;
  race.timer += dt;
  const cp = RACE.checkpoints[race.checkpoint];
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  if (Math.hypot(px - cp.x, py - cp.y) < 120) {
    race.checkpoint += 1;
    if (race.checkpoint >= RACE.checkpoints.length) {
      race.active = false;
      const t = race.timer;
      if (race.best === null || t < race.best) race.best = t;
      state.player.money += RACE.prize;
      showMessage(missions, `Race finished in ${t.toFixed(1)}s! +$${RACE.prize}`, 5);
    } else {
      showMessage(missions, `Checkpoint ${race.checkpoint} of 4 — keep going!`, 2);
    }
  }
}
