// Story missions and side activities for Palmetto Bay Heat. Each mission is a small
// state machine: an intro line, a chain of objectives (go here, do that), a reward,
// and a fail condition. Side activities — the street races and the hidden packages —
// live in races.js and here, so the main loop only asks: what is the current objective?
import { CONTAINER, HEIST, KINGPIN } from './config.js';
import { addWanted } from './police.js';
import { damagePlayer } from './player.js';
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
    // Round 4: the harbour job, rebuilt as a stealth mission. Mission 4 is
    // already called "Harbor Heist", so this one is the container job inside
    // the same yard — sneak past the patrol guards, crack the lock, jack the
    // hauler and run it to Marina Garage.
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
    // Round 4: the story finale. A multi-stage takedown — storm the
    // compound, put the bodyguards down in a fist fight, crack the kingpin's
    // safe while the alarm climbs, take the ledger and vanish under a
    // five-star heat.
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
    // Container Heist live state: how far the lock is cracked (0..1) and how
    // spotted Rico is by the patrol guards (0..100). Kingpin Takedown live
    // state: whether the bodyguards are on the field yet and how many are
    // already down.
    heist: { crack: 0, alarm: 0, alarmStars: 0, grabAlarm: null },
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
  // Live counters on the two new step kinds, so the objective line is the
  // progress bar: how cracked the lock is, how many bodyguards are down.
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

// --- Container Heist guards -------------------------------------------------
// Two PBPD cruisers patrol the roads around the container yard while Rico is
// sneaking or stealing. They are mission state, not police spawns, so they
// exist exactly while the job needs them and vanish when it moves on.
const GUARD_WAYPOINTS = [
  { x: 400, y: 1600 },
  { x: 800, y: 1600 },
  { x: 800, y: 2000 },
  { x: 400, y: 2000 },
];

function spawnGuards(missions) {
  missions.guards = GUARD_WAYPOINTS.slice(0, 2).map((wp, i) => ({
    x: wp.x, y: wp.y, angle: 0, speed: 0, wp: i + 1,
    color: '#1d4ed8', model: 'PBPD Cruiser', topSpeed: CONTAINER.guardSpeed,
    health: 100, parked: false, driver: 'guard', stolen: false, lightPhase: i * 2,
  }));
}

function stepGuards(missions, dt) {
  for (const g of missions.guards) {
    const target = GUARD_WAYPOINTS[g.wp % GUARD_WAYPOINTS.length];
    const dx = target.x - g.x;
    const dy = target.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 24) {
      g.wp += 1;
      continue;
    }
    g.angle = Math.atan2(dy, dx);
    g.x += Math.cos(g.angle) * CONTAINER.guardSpeed * dt;
    g.y += Math.sin(g.angle) * CONTAINER.guardSpeed * dt;
    g.lightPhase += dt * 9;
  }
}

// --- Kingpin Takedown bodyguards --------------------------------------------
// Four enforcers who hold the compound. They are pedestrians with a flag, so
// the normal punch, draw and pedestrian code all applies to them — they just
// chase Rico and hit back instead of fleeing.
const BODYGUARD_SPOTS = [
  { x: 2710, y: 330 },
  { x: 2890, y: 330 },
  { x: 2710, y: 470 },
  { x: 2890, y: 470 },
];

function spawnBodyguards(missions, state) {
  // A retry must not stack a second crew on the leftovers of the first.
  state.peds = state.peds.filter((p) => !p.bodyguard);
  for (const spot of BODYGUARD_SPOTS) {
    state.peds.push({
      x: spot.x, y: spot.y, angle: Math.PI / 2, speed: 0,
      color: '#7f1d1d', walkPhase: 0, fleeing: false, fleeTimer: 0,
      changeTimer: 99, health: KINGPIN.bodyguardHealth,
      bodyguard: true, down: false,
    });
  }
  missions.bodyguardsSpawned = true;
}

function stepBodyguards(missions, state, dt) {
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
    const d = Math.hypot(ped.x - player.x, ped.y - player.y);
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

export function stepMissions(missions, state, dt, events) {
  if (missions.messageTimer > 0) missions.messageTimer -= dt;
  if (missions.introTimer > 0) missions.introTimer -= dt;
  // Mission extras live only while their job needs them: guards patrol the
  // yard during the Container Heist sneak and steal, bodyguards hold the
  // compound during the Kingpin Takedown fight, and both go home otherwise.
  const def0 = MISSION_DEFS[missions.index];
  if (!(missions.active && def0 && def0.id === 6 && missions.step <= 2)) missions.guards = [];
  if (!(missions.active && def0 && def0.id === 7 && missions.step === 1)) {
    if (state.peds.some((p) => p.bodyguard)) state.peds = state.peds.filter((p) => !p.bodyguard);
    missions.bodyguardsSpawned = false;
  }
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
  // Container Heist patrol: guards walk their beat while Rico sneaks or
  // steals, and a guard close to Rico inside the yard fills the spotted
  // meter — full means a star and the meter drops back to half.
  if (def.id === 6 && missions.step <= 2) {
    if (missions.guards.length === 0) spawnGuards(missions);
    stepGuards(missions, dt);
  }
  // Downtown Heist alarm (mission 5) and the kingpin's safe alarm (mission
  // 7): once Rico is inside, the alarm climbs steadily, and at two
  // thresholds it calls the law in for real. The kingpin's alarm only runs
  // while the safe is being cracked — once the ledger is taken the escape
  // is hard enough without the alarm topping the heat back up.
  if ((def.id === 5 && missions.step >= 1) || (def.id === 7 && missions.step === 2)) {
    const heist = missions.heist;
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
  if (step.kind === 'crack') {
    // Cracking a vault or a safe is a channel: stand in the ring and the
    // tumblers fall, step out and the progress slips away. Mission 7's safe
    // takes longer than the Downtown vault.
    const d = Math.hypot(px - step.x, py - step.y);
    const heist = missions.heist;
    const crackSeconds = def.crackSeconds || HEIST.crackSeconds;
    if (d < step.radius) {
      heist.crack = Math.min(1, heist.crack + dt / crackSeconds);
      if (heist.crack >= 1) {
        missions.step += 1;
        showMessage(missions, def.id === 7 ? 'Safe open! Take the ledger and run.' : 'Vault open! Grab the cash and run.', 3);
      }
    } else if (heist.crack > 0) {
      heist.crack = Math.max(0, heist.crack - dt / HEIST.crackDecaySeconds);
    }
  } else if (step.kind === 'sneak') {
    // Cracking the container lock is a channel like the vault — but here a
    // guard close by inside the yard fills the spotted meter, and a full
    // meter calls the law.
    const d = Math.hypot(px - step.x, py - step.y);
    const sneak = missions.sneak;
    if (d < step.radius) {
      sneak.progress = Math.min(1, sneak.progress + dt / (def.sneakSeconds || CONTAINER.sneakSeconds));
      let nearestGuard = Infinity;
      for (const g of missions.guards) {
        nearestGuard = Math.min(nearestGuard, Math.hypot(g.x - px, g.y - py));
      }
      if (nearestGuard < CONTAINER.guardSpotRange) {
        sneak.spot = Math.min(100, sneak.spot + CONTAINER.spotPerSecond * dt);
        if (sneak.spot >= 100) {
          sneak.spot = 40;
          addWanted(state, 1);
          showMessage(missions, 'Spotted by a harbor guard — the law is coming!', 4);
        }
      } else {
        sneak.spot = Math.max(0, sneak.spot - CONTAINER.spotCooldownPerSecond * dt);
      }
      if (sneak.progress >= 1) {
        missions.step += 1;
        showMessage(missions, 'Lock cracked — jack the hauler and go!', 3);
      }
    } else if (sneak.progress > 0) {
      sneak.progress = Math.max(0, sneak.progress - dt / CONTAINER.sneakDecaySeconds);
      sneak.spot = Math.max(0, sneak.spot - CONTAINER.spotCooldownPerSecond * dt);
    }
  } else if (step.kind === 'fight') {
    // The kingpin's crew: four bodyguards who chase Rico and hit back.
    // Punch them down (Q) — when all four are down, the safe is Rico's.
    if (!missions.bodyguardsSpawned) spawnBodyguards(missions, state);
    stepBodyguards(missions, state, dt);
    if (missions.fightDown >= (def.fightCount || KINGPIN.fightCount)) {
      missions.step += 1;
      showMessage(missions, 'Crew down — crack the safe!', 3);
    }
  } else if (step.kind === 'grab') {
    const d = Math.hypot(px - step.x, py - step.y);
    if (d < step.radius) {
      missions.heist.grabAlarm = missions.heist.alarm;
      missions.step += 1;
      if (def.id === 7) {
        // The ledger is the kingpin's crown jewels: taking it puts Rico at
        // five stars on the spot.
        addWanted(state, 5);
        showMessage(missions, 'Ledger taken — the whole precinct is coming for you!', 4);
      } else {
        showMessage(missions, 'Cash grabbed — now lose the heat!', 3);
      }
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
