// Palmetto Bay Heat — the first story arc (missions 1-7) and the taxi job.
// Rico works his way up from a borrowed coupe to the kingpin's ledger:
// every mission is a small job board entry with an intro, a chain of
// objectives, a payout and a way to blow it. The engine below is a
// dispatch table: each objective kind has one handler that reads the
// shared state, advances its own progress, and hands the job to the next
// objective when its condition is met. Nothing here draws anything —
// the renderer only reads the objective text and the live meters.
//
// Objective kinds in this arc:
//   goto   — stand (or drive) inside the ring
//   steal  — be driving the named car
//   escape — get the wanted level back to zero
//   crack  — channel inside the gold ring while the alarm climbs
//   grab   — stand on the loot and take it
//   sneak  — channel the container lock while the yard guards patrol
//   fight  — put the kingpin's bodyguards down
import { CONTAINER, HEIST, KINGPIN } from './config.js';
import { addWanted } from './police.js';
import { damagePlayer } from './player.js';

// Distance helper — the whole arc measures Rico against rings this way.
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function ricoPos(state) {
  const ride = state.player.inCar;
  return ride ? { x: ride.x, y: ride.y } : { x: state.player.x, y: state.player.y };
}

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
  {
    id: 6,
    title: 'Container Heist',
    giver: 'Dante',
    intro: 'Dante: "One more job before the big one, Rico — the harbor container yard. Slip past the guards, crack the lock on the marked container, jack the hauler and bring it to Marina Garage. Quiet is cheaper than loud."',
    reward: 4500,
    failText: 'The container job went sideways — Dante is done waiting.',
    timeLimit: 300,
    sneakSeconds: 12,
    steps: [
      { kind: 'goto', text: 'Slip into the harbor container yard', x: 500, y: 2050, radius: 130 },
      { kind: 'sneak', text: 'Crack the container lock — stay in the yard, dodge the guards', x: 500, y: 2050, radius: 130 },
      { kind: 'steal', model: 'Container Hauler', text: 'Steal the Container Hauler', x: 500, y: 2050, radius: 150 },
      { kind: 'goto', text: 'Deliver the hauler to Marina Garage', x: 360, y: 360, radius: 110, needCar: true },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
  {
    id: 7,
    title: 'Kingpin Takedown',
    giver: 'Dante',
    intro: 'Dante: "This is it, Rico — the kingpin himself, holed up in the Coral Heights penthouse with his bodyguards and his ledger. Put his crew down, crack his safe, take the ledger and vanish. Do this and Palmetto Bay is ours."',
    reward: 8000,
    failText: 'The kingpin is still standing — and now he knows your name.',
    timeLimit: 360,
    crackSeconds: 12,
    fightCount: 4,
    steps: [
      { kind: 'goto', text: "Storm the kingpin's compound in Coral Heights", x: 2800, y: 400, radius: 120 },
      { kind: 'fight', text: "Take down the kingpin's bodyguards", x: 2800, y: 400, radius: 160 },
      { kind: 'crack', text: "Crack the kingpin's safe — stay in the gold ring", x: 2800, y: 260, radius: 100 },
      { kind: 'grab', text: "Take the kingpin's ledger", x: 2600, y: 400, radius: 100 },
      { kind: 'escape', text: 'Lose the 5-star heat — vanish', x: 0, y: 0, radius: 0 },
    ],
  },
];

// Taxi side job: the same eight stops the city has always used — a fare is
// a pickup somewhere that is not on top of Rico, then a different drop-off.
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
    index: 0, // which mission of MISSION_DEFS is next (0-based); >= length = story done
    step: 0,
    active: false,
    introTimer: 0,
    introText: '',
    timer: 0,
    failed: false,
    failText: '',
    done: false,
    taxi: { active: false, phase: '', px: 0, py: 0, dx: 0, dy: 0, name: '', timer: 0, fare: 0 },
    // Vault/safe live meters: crack progress 0..1, alarm 0..100, how many
    // alarm stars have already been called in, and the alarm reading at
    // the moment the loot was grabbed (decides the quiet bonus).
    heist: { crack: 0, alarm: 0, alarmStars: 0, grabAlarm: null },
    // Container lock live meters: crack progress 0..1 and how spotted
    // Rico is by the yard guards (0..100).
    sneak: { progress: 0, spot: 0 },
    guards: [],
    bodyguardsSpawned: false,
    fightDown: 0,
    packagesFound: 0,
    message: '',
    messageTimer: 0,
  };
}

export function startMission(missions, index) {
  const def = MISSION_DEFS[index];
  if (!def) return null;
  missions.index = index;
  missions.step = 0;
  missions.active = true;
  missions.failed = false;
  missions.done = false;
  missions.introText = def.intro;
  missions.introTimer = 6;
  missions.timer = def.timeLimit || 0;
  missions.heist = { crack: 0, alarm: 0, alarmStars: 0, grabAlarm: null };
  missions.sneak = { progress: 0, spot: 0 };
  missions.guards = [];
  missions.bodyguardsSpawned = false;
  missions.fightDown = 0;
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
  if (!step) return '';
  // Live counters ride on the objective line so the HUD is the progress bar.
  if (step.kind === 'sneak') return `${step.text} — ${Math.round(missions.sneak.progress * 100)}%`;
  if (step.kind === 'fight') {
    const def = MISSION_DEFS[missions.index];
    return `${step.text} (${missions.fightDown}/${def.fightCount || KINGPIN.fightCount})`;
  }
  return step.text;
}

export function showMessage(missions, text, seconds) {
  missions.message = text;
  missions.messageTimer = seconds || 3;
}

// --- Container Heist yard guards -------------------------------------------
// Two PBPD cruisers loop the roads around the container yard while Rico is
// sneaking or stealing. They belong to the mission, not to the police
// spawner, so they exist exactly while the job needs them and vanish when
// it moves on. Each guard walks a four-corner beat; reaching a corner
// picks the next one.
const GUARD_BEAT = [
  { x: 380, y: 1620 },
  { x: 820, y: 1620 },
  { x: 820, y: 2020 },
  { x: 380, y: 2020 },
];

function fieldGuards(missions) {
  missions.guards = GUARD_BEAT.slice(0, 2).map((corner, i) => ({
    x: corner.x, y: corner.y, angle: 0, speed: 0, corner: i + 1,
    color: '#1d4ed8', model: 'PBPD Cruiser', topSpeed: CONTAINER.guardSpeed,
    health: 100, parked: false, driver: 'guard', stolen: false, lightPhase: i * 2,
  }));
}

function marchGuards(missions, dt) {
  for (const guard of missions.guards) {
    const corner = GUARD_BEAT[guard.corner % GUARD_BEAT.length];
    const d = dist(guard.x, guard.y, corner.x, corner.y);
    if (d < 24) {
      guard.corner += 1;
      continue;
    }
    guard.angle = Math.atan2(corner.y - guard.y, corner.x - guard.x);
    guard.x += Math.cos(guard.angle) * CONTAINER.guardSpeed * dt;
    guard.y += Math.sin(guard.angle) * CONTAINER.guardSpeed * dt;
    guard.lightPhase += dt * 9;
  }
}

// --- Kingpin Takedown bodyguards -------------------------------------------
// Four enforcers hold the compound. They are pedestrians with a flag, so
// the normal punch and bullet code already hurts them — they just chase
// Rico and hit back instead of fleeing.
const BODYGUARD_POSTS = [
  { x: 2710, y: 330 },
  { x: 2890, y: 330 },
  { x: 2710, y: 470 },
  { x: 2890, y: 470 },
];

function fieldBodyguards(missions, state) {
  // A retry must not stack a second crew on the leftovers of the first.
  state.peds = state.peds.filter((p) => !p.bodyguard);
  for (const post of BODYGUARD_POSTS) {
    state.peds.push({
      x: post.x, y: post.y, angle: Math.PI / 2, speed: 0,
      color: '#7f1d1d', walkPhase: 0, fleeing: false, fleeTimer: 0,
      changeTimer: 99, health: KINGPIN.bodyguardHealth,
      bodyguard: true, down: false,
    });
  }
  missions.bodyguardsSpawned = true;
}

function workBodyguards(missions, state, dt) {
  const player = state.player;
  let down = 0;
  for (const ped of state.peds) {
    if (!ped.bodyguard) continue;
    if (ped.health <= 0) {
      if (!ped.down) {
        ped.down = true;
        ped.color = '#4b5563';
        showMessage(missions, 'Bodyguard down!', 2);
      }
      down += 1;
      continue;
    }
    const d = dist(ped.x, ped.y, player.x, player.y);
    if (d < KINGPIN.bodyguardRange && !player.inCar) {
      ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
      ped.x += Math.cos(ped.angle) * KINGPIN.bodyguardSpeed * dt;
      ped.y += Math.sin(ped.angle) * KINGPIN.bodyguardSpeed * dt;
      if (d < 34 && player.invulnerable <= 0) {
        damagePlayer(player, KINGPIN.bodyguardDamage);
        showMessage(missions, 'A bodyguard is beating on you — punch back (Q)!', 2);
      }
    }
  }
  missions.fightDown = down;
}

// --- Shared step machinery --------------------------------------------------
// Advance to the next objective; when the chain runs out, the mission pays.
function advance(missions, state, def, note) {
  missions.step += 1;
  if (missions.step >= def.steps.length) {
    completeMission(missions, state, def);
  } else if (note) {
    showMessage(missions, note, 3);
  }
}

function failJob(missions, def) {
  missions.active = false;
  missions.failed = true;
  missions.failText = def.failText;
}

// The alarm on a vault or a safe: it climbs the whole time Rico is inside
// the job, and at two thresholds it calls the law in for real. The
// kingpin's alarm only runs while the safe is being cracked — once the
// ledger is taken the escape is hard enough without the alarm topping the
// heat back up.
function runAlarm(missions, state, dt, def) {
  const heist = missions.heist;
  const inside = (def.id === 5 && missions.step >= 1) || (def.id === 7 && missions.step === 2);
  if (!inside) return;
  heist.alarm = Math.min(100, heist.alarm + HEIST.alarmPerSecond * dt);
  if (heist.alarm >= HEIST.alarmFirstStar && heist.alarmStars < 1) {
    heist.alarmStars = 1;
    addWanted(state, 1);
    showMessage(missions, 'The alarm is screaming — the cops are coming!', 4);
  } else if (heist.alarm >= HEIST.alarmSecondStar && heist.alarmStars < 2) {
    heist.alarmStars = 2;
    addWanted(state, 1);
    showMessage(missions, 'Alarm maxed — the whole precinct is on its way!', 4);
  }
}

// One handler per objective kind. Each gets the mission state, the shared
// state, the step def and the frame, and returns nothing — it advances the
// step itself when its condition is met.
const STEP_HANDLERS = {
  goto(missions, state, def, step) {
    const pos = ricoPos(state);
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius && (!step.needCar || state.player.inCar)) {
      advance(missions, state, def, 'Objective done — next stop marked.');
    }
  },

  steal(missions, state, def, step, events) {
    const wantModel = step.model || 'Sunset Coupe';
    const ride = state.player.inCar;
    if (ride && ride.model === wantModel) {
      advance(missions, state, def, `Got the ${wantModel}. Now get it where it needs to go.`);
    } else if (events && events.stolenCar && ride && ride.model !== wantModel) {
      showMessage(missions, `Wrong car — the job needs a ${wantModel}.`, 3);
    }
  },

  escape(missions, state, def) {
    if (state.wanted === 0) {
      advance(missions, state, def, 'Clean. Now meet Dante at the park.');
    }
  },

  crack(missions, state, def, step, _events, dt) {
    const pos = ricoPos(state);
    const heist = missions.heist;
    const crackSeconds = def.crackSeconds || HEIST.crackSeconds;
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius) {
      // Channel inside the ring: the tumblers fall one tick at a time.
      heist.crack = Math.min(1, heist.crack + dt / crackSeconds);
      if (heist.crack >= 1) {
        advance(missions, state, def, def.id === 7 ? 'Safe open! Take the ledger and run.' : 'Vault open! Grab the cash and run.');
      }
    } else if (heist.crack > 0) {
      // Step out and the progress slips away.
      heist.crack = Math.max(0, heist.crack - dt / HEIST.crackDecaySeconds);
    }
  },

  sneak(missions, state, def, step, _events, dt) {
    const pos = ricoPos(state);
    const sneak = missions.sneak;
    if (dist(pos.x, pos.y, step.x, step.y) >= step.radius) {
      // Outside the yard the lock pick slips and the heat cools.
      if (sneak.progress > 0) sneak.progress = Math.max(0, sneak.progress - dt / CONTAINER.sneakDecaySeconds);
      sneak.spot = Math.max(0, sneak.spot - CONTAINER.spotCooldownPerSecond * dt);
      return;
    }
    sneak.progress = Math.min(1, sneak.progress + dt / (def.sneakSeconds || CONTAINER.sneakSeconds));
    let nearestGuard = Infinity;
    for (const guard of missions.guards) {
      nearestGuard = Math.min(nearestGuard, dist(guard.x, guard.y, pos.x, pos.y));
    }
    if (nearestGuard < CONTAINER.guardSpotRange) {
      sneak.spot = Math.min(100, sneak.spot + CONTAINER.spotPerSecond * dt);
      if (sneak.spot >= 100) {
        // Spotted: a star, and the meter drops back to half so Rico can recover.
        sneak.spot = 40;
        addWanted(state, 1);
        showMessage(missions, 'Spotted by a harbor guard — the law is coming!', 4);
      }
    } else {
      sneak.spot = Math.max(0, sneak.spot - CONTAINER.spotCooldownPerSecond * dt);
    }
    if (sneak.progress >= 1) {
      advance(missions, state, def, 'Lock cracked — jack the hauler and go!');
    }
  },

  fight(missions, state, def, _step, _events, dt) {
    if (!missions.bodyguardsSpawned) fieldBodyguards(missions, state);
    workBodyguards(missions, state, dt);
    if (missions.fightDown >= (def.fightCount || KINGPIN.fightCount)) {
      advance(missions, state, def, 'Crew down — crack the safe!');
    }
  },

  grab(missions, state, def, step) {
    const pos = ricoPos(state);
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius) {
      missions.heist.grabAlarm = missions.heist.alarm;
      if (def.id === 7) {
        // The ledger is the kingpin's crown jewels: taking it puts Rico at
        // five stars on the spot.
        addWanted(state, 5);
        advance(missions, state, def, 'Ledger taken — the whole precinct is coming for you!');
      } else {
        advance(missions, state, def, 'Cash grabbed — now lose the heat!');
      }
    }
  },
};

export function stepMissions(missions, state, dt, events) {
  if (missions.messageTimer > 0) missions.messageTimer -= dt;
  if (missions.introTimer > 0) missions.introTimer -= dt;
  const def0 = MISSION_DEFS[missions.index];
  // Mission extras live only while their job needs them: guards patrol
  // the yard during the Container Heist sneak and steal, bodyguards hold
  // the compound during the Kingpin Takedown fight, and both go home
  // otherwise.
  const yardJob = missions.active && def0 && def0.id === 6 && missions.step <= 2;
  if (!yardJob) missions.guards = [];
  const compoundJob = missions.active && def0 && def0.id === 7 && missions.step === 1;
  if (!compoundJob) {
    if (state.peds.some((p) => p.bodyguard)) state.peds = state.peds.filter((p) => !p.bodyguard);
    missions.bodyguardsSpawned = false;
  }
  if (!missions.active || missions.failed) return;
  const def = MISSION_DEFS[missions.index];
  if (missions.timer > 0) {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      failJob(missions, def);
      return;
    }
  }
  const step = currentStep(missions);
  if (!step) return;
  // Yard patrol runs under the sneak and steal steps.
  if (def.id === 6 && missions.step <= 2) {
    if (missions.guards.length === 0) fieldGuards(missions);
    marchGuards(missions, dt);
  }
  runAlarm(missions, state, dt, def);
  const handler = STEP_HANDLERS[step.kind];
  if (handler) handler(missions, state, def, step, events, dt);
  // The getaway car must survive mission 1.
  if (def.id === 1 && state.player.inCar && state.player.inCar.health <= 0) {
    failJob(missions, def);
  }
}

export function completeMission(missions, state, def) {
  missions.active = false;
  missions.done = true;
  missions.index += 1;
  let reward = def.reward;
  // Mission 5 pays a quiet bonus when the cash was grabbed before the
  // alarm got loud — fast and quiet is worth more than fast and loud.
  if (def.id === 5 && missions.heist.grabAlarm !== null && missions.heist.grabAlarm < HEIST.quietBonusAlarm) {
    reward += HEIST.quietBonus;
    showMessage(missions, `${def.title} complete! +$${reward} (includes $${HEIST.quietBonus} quiet-job bonus)`, 5);
  } else if (def.id === 7 && missions.heist.grabAlarm !== null && missions.heist.grabAlarm < HEIST.quietBonusAlarm) {
    // The finale pays a bigger quiet bonus — the ledger taken before the
    // alarm got loud means the kingpin never saw it coming.
    reward += HEIST.kingpinQuietBonus;
    showMessage(missions, `${def.title} complete! +$${reward} (includes $${HEIST.kingpinQuietBonus} quiet-job bonus) — Rico owns Palmetto Bay.`, 6);
  } else if (def.id === 7) {
    showMessage(missions, `${def.title} complete! +$${reward} — Rico owns Palmetto Bay.`, 6);
  } else if (def.id === 1 && state.player.inCar && state.player.inCar.health >= 80) {
    reward += 100;
    showMessage(missions, `${def.title} complete! +$${reward} (includes $100 clean-delivery bonus)`, 5);
  } else {
    showMessage(missions, `${def.title} complete! +$${reward}`, 5);
  }
  state.player.money += reward;
}

// --- Taxi side job ----------------------------------------------------------
// A fare is a pickup and a drop-off: Rico has 30 seconds to reach the
// passenger, then 90 seconds to deliver them. The fare pays a base amount
// plus distance, so a cross-city run is worth more than a hop round the block.
export function startTaxi(missions, state, random) {
  const taxi = missions.taxi;
  const pos = ricoPos(state);
  // Pick a pickup stop that is not right on top of Rico, then a different drop-off.
  const farStops = TAXI_STOPS.filter((s) => dist(s.x, s.y, pos.x, pos.y) > 300);
  const pickup = farStops[Math.floor(random() * farStops.length)] || TAXI_STOPS[0];
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
  const pos = ricoPos(state);
  if (taxi.phase === 'pickup') {
    if (dist(pos.x, pos.y, taxi.px, taxi.py) < 90) {
      taxi.phase = 'dropoff';
      taxi.timer = 90;
      const ride = dist(taxi.dx, taxi.dy, taxi.px, taxi.py);
      taxi.fare = Math.round(60 + ride * 0.055);
      showMessage(missions, `Passenger aboard — take them to ${taxi.name} ($${taxi.fare}).`, 4);
    }
  } else if (dist(pos.x, pos.y, taxi.dx, taxi.dy) < 110) {
    taxi.active = false;
    state.player.money += taxi.fare;
    state.stats.taxis = (state.stats.taxis || 0) + 1;
    showMessage(missions, `Fare complete! +$${taxi.fare}`, 4);
  }
}
