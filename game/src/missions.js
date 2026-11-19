// Story missions and side activities for Palmetto Bay Heat. Each mission is a small
// state machine: an intro line, a chain of objectives (go here, do that), a reward,
// and a fail condition. Side activities — the street races and the hidden packages —
// live in races.js and here, so the main loop only asks: what is the current objective?
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
    intro: 'Dante: "The big one, Rico — the Downtown bank. Get inside, crack the vault, grab the cash and vanish before the whole precinct shows up. Quick and quiet pays double."',
    reward: 3500,
    failText: 'The vault never opened — Dante is done waiting.',
    timeLimit: 240,
    steps: [
      { kind: 'goto', text: 'Get to the Downtown bank', x: 2800, y: 1200, radius: 110 },
      { kind: 'crack', text: 'Crack the vault — stay inside the gold ring', x: 2800, y: 1000, radius: 100 },
      { kind: 'grab', text: 'Grab the cash from the vault room', x: 2600, y: 1200, radius: 100 },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
];

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
    taxi: { active: false, phase: '', px: 0, py: 0, dx: 0, dy: 0, name: '', timer: 0, fare: 0 },
    // Downtown Heist live state: vault-crack progress (0..1), the alarm meter
    // (0..100), how many wanted stars the alarm has already raised, and the
    // alarm level at the moment the cash was grabbed (for the quiet bonus).
    heist: { crack: 0, alarm: 0, alarmStars: 0, grabAlarm: null },
    packagesFound: 0,
    message: '',
    messageTimer: 0,
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
  missions.heist = { crack: 0, alarm: 0, alarmStars: 0, grabAlarm: null };
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
  // Downtown Heist alarm: once Rico is inside the bank the alarm climbs
  // steadily, and at two thresholds it calls the law in for real.
  if (def.id === 5 && missions.step >= 1) {
    const heist = missions.heist;
    heist.alarm = Math.min(100, heist.alarm + HEIST.alarmPerSecond * dt);
    if (heist.alarm >= HEIST.alarmFirstStar && heist.alarmStars < 1) {
      heist.alarmStars = 1;
      addWanted(state, 1);
      showMessage(missions, 'The bank alarm is screaming — the cops are coming!', 4);
    } else if (heist.alarm >= HEIST.alarmSecondStar && heist.alarmStars < 2) {
      heist.alarmStars = 2;
      addWanted(state, 1);
      showMessage(missions, 'Alarm maxed — the whole precinct is on its way!', 4);
    }
  }
  if (step.kind === 'crack') {
    // Cracking the vault is a channel: stand in the ring and the tumblers
    // fall, step out and the progress slips away.
    const d = Math.hypot(px - step.x, py - step.y);
    const heist = missions.heist;
    if (d < step.radius) {
      heist.crack = Math.min(1, heist.crack + dt / HEIST.crackSeconds);
      if (heist.crack >= 1) {
        missions.step += 1;
        showMessage(missions, 'Vault open! Grab the cash and run.', 3);
      }
    } else if (heist.crack > 0) {
      heist.crack = Math.max(0, heist.crack - dt / HEIST.crackDecaySeconds);
    }
  } else if (step.kind === 'grab') {
    const d = Math.hypot(px - step.x, py - step.y);
    if (d < step.radius) {
      missions.heist.grabAlarm = missions.heist.alarm;
      missions.step += 1;
      showMessage(missions, 'Cash grabbed — now lose the heat!', 3);
    }
  } else if (step.kind === 'steal') {
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
  // Mission 5 pays a quiet bonus when the cash was grabbed before the alarm
  // got loud — fast and quiet is worth more than fast and loud.
  if (def.id === 5 && missions.heist.grabAlarm !== null && missions.heist.grabAlarm < HEIST.quietBonusAlarm) {
    reward += HEIST.quietBonus;
    showMessage(missions, `${def.title} complete! +$${reward} (includes $${HEIST.quietBonus} quiet-job bonus)`, 5);
  } else if (def.id === 1 && state.player.inCar && state.player.inCar.health >= 80) {
    reward += 100;
    showMessage(missions, `${def.title} complete! +$${reward} (includes $100 clean-delivery bonus)`, 5);
  } else {
    showMessage(missions, `${def.title} complete! +$${reward}`, 5);
  }
  state.player.money += reward;
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
