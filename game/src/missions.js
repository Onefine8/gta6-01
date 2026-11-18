// Story missions and side activities for Palmetto Bay Heat. Each mission is a small
// state machine: an intro line, a chain of objectives (go here, do that), a reward,
// and a fail condition. Side activities — the street race and the hidden packages —
// live here too, so the main loop only asks: what is the current objective?
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
  if (step.kind === 'steal') {
    if (events.stolenCar) {
      missions.step += 1;
      showMessage(missions, 'Got the coupe. Now get it to Marina Garage.', 3);
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
      showMessage(missions, 'Clean. Now meet Dante at the park.', 3);
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
  state.player.money += def.reward;
  showMessage(missions, `${def.title} complete! +$${def.reward}`, 5);
}

export function startRace(missions) {
  missions.race.active = true;
  missions.race.checkpoint = 0;
  missions.race.timer = 0;
  showMessage(missions, 'Palmetto GP started! Hit all 4 checkpoints — fastest lap wins $600.', 4);
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
