// Story missions 8, 9 and 10 — the second arc, picked up after the
// Kingpin Takedown closes the first story. Same contract as missions.js:
// a list of defs with an intro, a chain of objective steps, a reward and
// a fail condition, walked one step at a time by a dispatch table. The
// main loop treats the two arcs as chapters of one book: only one chapter
// runs at a time, and the objective arrow points at whichever is live.
//
// New step kinds in this chapter, on top of the first arc's goto, steal,
// escape, crack, grab and fight:
//   shoot   — put down N marked targets (peds flagged as targets)
//   deliver — a goto with cargo: it only counts in the right vehicle,
//             and wrecking the vehicle on the way fails the job
//   survive — stay alive for N seconds while the heat is on; the clock
//             only runs while Rico is wanted
//   chase   — stay on a moving mark's tail; fall behind and progress slips
import { HEIST, KINGPIN } from './config.js';
import { addWanted } from './police.js';
import { damagePlayer } from './player.js';

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function ricoPos(state) {
  const ride = state.player.inCar;
  return ride ? { x: ride.x, y: ride.y } : { x: state.player.x, y: state.player.y };
}

export const MISSION2_DEFS = [
  {
    id: 8,
    title: 'Storm Runner',
    giver: 'Marina',
    intro: 'Marina: "The storm is the cover, Rico — nobody watches the harbor when the rain is sideways. Take the Harbor Van from the market, run it to Lighthouse Point, and vanish before the sky clears. Wet roads, fast hands."',
    reward: 2500,
    failText: 'The van never made it through the storm. Marina is done waiting.',
    timeLimit: 210,
    steps: [
      { kind: 'goto', text: 'Get to Harbor Market in the storm', x: 360, y: 2060, radius: 120 },
      { kind: 'steal', model: 'Harbor Van', text: 'Steal the Harbor Van', x: 360, y: 2060, radius: 130 },
      { kind: 'deliver', text: 'Deliver the van to Lighthouse Point', x: 2960, y: 2060, radius: 110, needCar: true },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
  {
    id: 9,
    title: 'The Arms Deal',
    giver: 'Dante',
    intro: 'Dante: "A crew is selling military hardware out of a warehouse on 5th Avenue — hardware that was meant for us. Go in loud or quiet, I do not care, but put their shooters down, take the crate, and bring it to the garage. The crate is worth more than the crew."',
    reward: 5000,
    failText: 'The crate is gone — and so is Dante\'s patience.',
    timeLimit: 300,
    shootCount: 3,
    steps: [
      { kind: 'goto', text: 'Get to the 5th Avenue warehouse', x: 2000, y: 400, radius: 120 },
      { kind: 'shoot', text: 'Take down the arms dealers', x: 2000, y: 400, radius: 200 },
      { kind: 'grab', text: 'Take the weapons crate', x: 2000, y: 520, radius: 100 },
      { kind: 'goto', text: 'Bring the crate to Marina Garage', x: 360, y: 360, radius: 110 },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
  {
    id: 10,
    title: 'The Last Score',
    giver: 'Dante',
    intro: 'Dante: "One last job, Rico — the biggest vault in Palmetto Bay, under the Downtown tower. The kingpin\'s old crew guards it now, and they shoot first. Put them down, crack the vault, take the ledger and the cash, and vanish under five stars. Do this and we never work again."',
    reward: 12000,
    failText: 'The vault never opened — the last score slipped away.',
    timeLimit: 420,
    crackSeconds: 14,
    fightCount: 4,
    shootCount: 0,
    steps: [
      { kind: 'goto', text: 'Get to the Downtown tower', x: 2800, y: 1200, radius: 120 },
      { kind: 'fight', text: "Take down the vault guards", x: 2800, y: 1200, radius: 180 },
      { kind: 'crack', text: 'Crack the big vault — stay inside the gold ring', x: 2800, y: 1000, radius: 100 },
      { kind: 'grab', text: 'Take the ledger and the cash', x: 2600, y: 1200, radius: 100 },
      { kind: 'survive', text: 'Survive the five-star heat for 20 seconds', x: 0, y: 0, radius: 0, seconds: 20 },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
];

// The marks for mission 9: three dealers who hold the warehouse. They are
// pedestrians with a flag, like the kingpin's bodyguards — punches and
// bullets already know how to hurt them, they just shoot back instead of
// fleeing.
const DEALER_SPOTS = [
  { x: 1930, y: 330 },
  { x: 2070, y: 330 },
  { x: 2000, y: 470 },
];

// The vault guards for mission 10: four enforcers, tougher than the
// dealers, who chase Rico and hit back up close.
const VAULT_GUARD_SPOTS = [
  { x: 2710, y: 1130 },
  { x: 2890, y: 1130 },
  { x: 2710, y: 1270 },
  { x: 2890, y: 1270 },
];

export function createMission2State() {
  return {
    index: 0, // which mission of MISSION2_DEFS is next (0-based); >= length = arc done
    step: 0,
    active: false,
    introTimer: 0,
    introText: '',
    timer: 0,
    failed: false,
    failText: '',
    done: false,
    // Live counters for the new step kinds.
    shootDown: 0,
    fightDown: 0,
    surviveTimer: 0,
    chaseProgress: 0,
    heist: { crack: 0, alarm: 0, alarmStars: 0, grabAlarm: null },
    enforcersSpawned: false,
    dealersSpawned: false,
    message: '',
    messageTimer: 0,
  };
}

export function startMission2(missions2, index) {
  const def = MISSION2_DEFS[index];
  if (!def) return null;
  missions2.index = index;
  missions2.step = 0;
  missions2.active = true;
  missions2.failed = false;
  missions2.done = false;
  missions2.introText = def.intro;
  missions2.introTimer = 6;
  missions2.timer = def.timeLimit || 0;
  missions2.shootDown = 0;
  missions2.fightDown = 0;
  missions2.surviveTimer = 0;
  missions2.chaseProgress = 0;
  missions2.heist = { crack: 0, alarm: 0, alarmStars: 0, grabAlarm: null };
  missions2.enforcersSpawned = false;
  missions2.dealersSpawned = false;
  missions2.message = `${def.title} — ${def.giver}`;
  missions2.messageTimer = 4;
  return def;
}

export function currentStep2(missions2) {
  const def = MISSION2_DEFS[missions2.index];
  if (!def || !missions2.active) return null;
  return def.steps[missions2.step] || null;
}

export function objectiveText2(missions2) {
  if (!missions2.active) {
    if (missions2.index >= MISSION2_DEFS.length) return 'Second arc complete — free roam. The bay is yours.';
    return 'Press M to start the next mission.';
  }
  const step = currentStep2(missions2);
  if (!step) return '';
  if (step.kind === 'shoot') {
    const def = MISSION2_DEFS[missions2.index];
    return `${step.text} (${missions2.shootDown}/${def.shootCount || 3})`;
  }
  if (step.kind === 'fight') {
    const def = MISSION2_DEFS[missions2.index];
    return `${step.text} (${missions2.fightDown}/${def.fightCount || KINGPIN.fightCount})`;
  }
  if (step.kind === 'survive') {
    const left = Math.max(0, Math.ceil((step.seconds || 20) - missions2.surviveTimer));
    return `${step.text} — ${left}s left`;
  }
  if (step.kind === 'chase') {
    return `${step.text} — ${Math.round(missions2.chaseProgress * 100)}%`;
  }
  return step.text;
}

export function showMessage2(missions2, text, seconds) {
  missions2.message = text;
  missions2.messageTimer = seconds || 3;
}

// The second arc opens only once the first story is done — Rico has to
// own the bay before Dante trusts him with the last score. The check
// reads the main mission state, so a fresh save cannot skip ahead.
export function canStartMission2(state, index) {
  const def = MISSION2_DEFS[index];
  if (!def) return 'There is no such mission.';
  if (state.missions2 && state.missions2.active) return 'You are already on a mission — finish it first.';
  const storyDone = state.missionsDone >= 7 || (state.missions && state.missions.index >= 7);
  if (!storyDone) return 'Finish the first story (missions 1-7) before the second arc opens.';
  if (state.missions && state.missions.active) return 'Finish the current story mission first.';
  return null;
}

// --- Mission 9 dealers ------------------------------------------------------
// Three armed dealers. They do not flee; they stand their ground, shoot
// back when Rico gets close, and go down to punches or bullets. A dealer
// at zero health counts towards the shoot step.
function fieldDealers(missions2, state) {
  state.peds = state.peds.filter((p) => !p.dealer);
  for (const spot of DEALER_SPOTS) {
    state.peds.push({
      x: spot.x, y: spot.y, angle: Math.PI / 2, speed: 0,
      color: '#78350f', walkPhase: 0, fleeing: false, fleeTimer: 0,
      changeTimer: 99, health: 100, dealer: true, target: true, down: false,
      shootTimer: 2,
    });
  }
  missions2.dealersSpawned = true;
}

function workDealers(missions2, state, dt) {
  const player = state.player;
  let down = 0;
  for (const ped of state.peds) {
    if (!ped.dealer) continue;
    if (ped.health <= 0) {
      if (!ped.down) {
        ped.down = true;
        ped.color = '#4b5563';
        showMessage2(missions2, 'Dealer down!', 2);
      }
      down += 1;
      continue;
    }
    // Dealers never flee — they stand their ground and shoot back, so a
    // punch that marks them fleeing must not make them unhittable.
    ped.fleeing = false;
    ped.fleeTimer = 0;
    const d = dist(ped.x, ped.y, player.x, player.y);
    // A dealer shoots back when Rico closes in on foot — a short-range,
    // slow shot, so Rico can dodge it by keeping his distance or by
    // moving fast. In a car the dealers hold their fire (they want the
    // crate intact, not a car chase).
    if (d < 320 && !player.inCar) {
      ped.shootTimer = (ped.shootTimer || 0) - dt;
      if (ped.shootTimer <= 0) {
        ped.shootTimer = 2.2;
        if (player.invulnerable <= 0) {
          damagePlayer(player, 8);
          showMessage2(missions2, 'A dealer is shooting at you — take cover or take them down!', 2);
        }
      }
    }
  }
  missions2.shootDown = down;
}

// --- Mission 10 vault guards ------------------------------------------------
// Four enforcers who hold the Downtown tower. Same shape as the kingpin's
// bodyguards in missions.js, but flagged as enforcers so the two fights
// never count each other's casualties.
function fieldEnforcers(missions2, state) {
  state.peds = state.peds.filter((p) => !p.enforcer);
  for (const spot of VAULT_GUARD_SPOTS) {
    state.peds.push({
      x: spot.x, y: spot.y, angle: Math.PI / 2, speed: 0,
      color: '#111827', walkPhase: 0, fleeing: false, fleeTimer: 0,
      changeTimer: 99, health: KINGPIN.bodyguardHealth,
      enforcer: true, bodyguard: false, down: false,
    });
  }
  missions2.enforcersSpawned = true;
}

function workEnforcers(missions2, state, dt) {
  const player = state.player;
  let down = 0;
  for (const ped of state.peds) {
    if (!ped.enforcer) continue;
    if (ped.health <= 0) {
      if (!ped.down) {
        ped.down = true;
        ped.color = '#4b5563';
        showMessage2(missions2, 'Vault guard down!', 2);
      }
      down += 1;
      continue;
    }
    // Enforcers never flee — they hold the tower, so a punch that marks
    // them fleeing must not make them unhittable.
    ped.fleeing = false;
    ped.fleeTimer = 0;
    const d = dist(ped.x, ped.y, player.x, player.y);
    if (d < KINGPIN.bodyguardRange && !player.inCar) {
      ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
      ped.x += Math.cos(ped.angle) * KINGPIN.bodyguardSpeed * dt;
      ped.y += Math.sin(ped.angle) * KINGPIN.bodyguardSpeed * dt;
      if (d < 34 && player.invulnerable <= 0) {
        damagePlayer(player, KINGPIN.bodyguardDamage);
        showMessage2(missions2, 'A vault guard is beating on you — fight back (Q)!', 2);
      }
    }
  }
  missions2.fightDown = down;
}

// Count any marked target (dealer or enforcer) that is down, so the shoot
// step also advances when a target is shot rather than punched.
function countTargetsDown(state) {
  let down = 0;
  for (const ped of state.peds) {
    if ((ped.dealer || ped.target) && ped.health <= 0) down += 1;
  }
  return down;
}

// --- Shared step machinery --------------------------------------------------
function advance2(missions2, state, def, note) {
  missions2.step += 1;
  if (missions2.step >= def.steps.length) {
    completeMission2(missions2, state, def);
  } else if (note) {
    showMessage2(missions2, note, 3);
  }
}

function failJob2(missions2, def, failText) {
  missions2.active = false;
  missions2.failed = true;
  missions2.failText = failText || def.failText;
}

// The big vault's alarm (mission 10): once Rico is inside, the alarm
// climbs steadily, and at two thresholds it calls the law in for real.
// The alarm only runs while the vault is being cracked — once the ledger
// is taken the survive step is hard enough without it topping the heat
// back up.
function runVaultAlarm(missions2, state, dt, def) {
  if (!(def.id === 10 && missions2.step === 2)) return;
  const heist = missions2.heist;
  heist.alarm = Math.min(100, heist.alarm + HEIST.alarmPerSecond * dt);
  if (heist.alarm >= HEIST.alarmFirstStar && heist.alarmStars < 1) {
    heist.alarmStars = 1;
    addWanted(state, 1);
    showMessage2(missions2, 'The vault alarm is screaming — the cops are coming!', 4);
  } else if (heist.alarm >= HEIST.alarmSecondStar && heist.alarmStars < 2) {
    heist.alarmStars = 2;
    addWanted(state, 1);
    showMessage2(missions2, 'Alarm maxed — the whole precinct is on its way!', 4);
  }
}

// One handler per objective kind — same dispatch-table shape as the first arc.
const STEP2_HANDLERS = {
  goto(missions2, state, def, step) {
    const pos = ricoPos(state);
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius && (!step.needCar || state.player.inCar)) {
      advance2(missions2, state, def, 'Objective done — next stop marked.');
    }
  },

  steal(missions2, state, def, step, events) {
    const wantModel = step.model || 'Harbor Van';
    const ride = state.player.inCar;
    if (ride && ride.model === wantModel) {
      advance2(missions2, state, def, `Got the ${wantModel}. Now get it where it needs to go.`);
    } else if (events && events.stolenCar && ride && ride.model !== wantModel) {
      showMessage2(missions2, `Wrong car — the job needs a ${wantModel}.`, 3);
    }
  },

  deliver(missions2, state, def, step) {
    // A delivery is a goto with cargo: it only counts in the right
    // vehicle, and wrecking the vehicle on the way fails the job — the
    // cargo does not survive a crash.
    const ride = state.player.inCar;
    if (ride && ride.health <= 0) {
      failJob2(missions2, def, 'The delivery vehicle was wrecked — the cargo is scrap.');
      return;
    }
    const pos = ricoPos(state);
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius && (!step.needCar || ride)) {
      advance2(missions2, state, def, 'Delivered — next stop marked.');
    }
  },

  escape(missions2, state, def) {
    if (state.wanted === 0) {
      advance2(missions2, state, def, 'Clean. Now move on to the next stop.');
    }
  },

  crack(missions2, state, def, step, _events, dt) {
    const pos = ricoPos(state);
    const heist = missions2.heist;
    const crackSeconds = def.crackSeconds || HEIST.crackSeconds;
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius) {
      heist.crack = Math.min(1, heist.crack + dt / crackSeconds);
      if (heist.crack >= 1) {
        advance2(missions2, state, def, 'Vault open! Take the ledger and the cash.');
      }
    } else if (heist.crack > 0) {
      heist.crack = Math.max(0, heist.crack - dt / HEIST.crackDecaySeconds);
    }
  },

  shoot(missions2, state, def, _step, _events, dt) {
    if (!missions2.dealersSpawned) fieldDealers(missions2, state);
    workDealers(missions2, state, dt);
    missions2.shootDown = Math.max(missions2.shootDown, countTargetsDown(state));
    if (missions2.shootDown >= (def.shootCount || 3)) {
      advance2(missions2, state, def, 'Dealers down — take the crate!');
    }
  },

  fight(missions2, state, def, _step, _events, dt) {
    if (!missions2.enforcersSpawned) fieldEnforcers(missions2, state);
    workEnforcers(missions2, state, dt);
    if (missions2.fightDown >= (def.fightCount || KINGPIN.fightCount)) {
      advance2(missions2, state, def, 'Guards down — crack the vault!');
    }
  },

  grab(missions2, state, def, step) {
    const pos = ricoPos(state);
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius) {
      missions2.heist.grabAlarm = missions2.heist.alarm;
      if (def.id === 10) {
        // The ledger and the cash are the crown jewels: taking them puts
        // Rico at five stars on the spot.
        addWanted(state, 5);
        advance2(missions2, state, def, 'Ledger and cash taken — the whole precinct is coming for you!');
      } else if (def.id === 9) {
        addWanted(state, 2);
        advance2(missions2, state, def, "Crate taken — the dealers' friends are on their way. Lose them!");
      } else {
        advance2(missions2, state, def, 'Grabbed — now lose the heat!');
      }
    }
  },

  survive(missions2, state, def, step, _events, dt) {
    // Stay alive under heat: the clock only runs while Rico is wanted
    // and still standing. Lose the heat early and the clock stalls — the
    // step wants Rico to ride the storm out, not hide from it.
    if (state.wanted > 0 && state.player.health > 0) {
      missions2.surviveTimer += dt;
      if (missions2.surviveTimer >= (step.seconds || 20)) {
        advance2(missions2, state, def, 'You rode the heat out — now vanish for good.');
      }
    }
  },

  chase(missions2, state, def, step, _events, dt) {
    // Stay on the mark's tail: within chaseRange for chaseSeconds, in
    // total. Fall behind and the progress slips away.
    const mark = step.mark || { x: step.x, y: step.y };
    const pos = ricoPos(state);
    const range = step.chaseRange || 300;
    const need = step.chaseSeconds || 10;
    if (dist(pos.x, pos.y, mark.x, mark.y) < range) {
      missions2.chaseProgress = Math.min(1, missions2.chaseProgress + dt / need);
      if (missions2.chaseProgress >= 1) {
        advance2(missions2, state, def, 'You stayed on their tail — now make your move.');
      }
    } else {
      missions2.chaseProgress = Math.max(0, missions2.chaseProgress - dt / (need * 2));
    }
  },
};

export function stepMissions2(missions2, state, dt, events) {
  if (missions2.messageTimer > 0) missions2.messageTimer -= dt;
  if (missions2.introTimer > 0) missions2.introTimer -= dt;
  const def0 = MISSION2_DEFS[missions2.index];
  // Mission extras live only while their job needs them: dealers hold the
  // warehouse during mission 9's shoot step, enforcers hold the tower
  // during mission 10's fight step, and both go home otherwise.
  const warehouseJob = missions2.active && def0 && def0.id === 9 && missions2.step === 1;
  if (!warehouseJob) {
    if (state.peds.some((p) => p.dealer)) state.peds = state.peds.filter((p) => !p.dealer);
    missions2.dealersSpawned = false;
  }
  const towerJob = missions2.active && def0 && def0.id === 10 && missions2.step === 1;
  if (!towerJob) {
    if (state.peds.some((p) => p.enforcer)) state.peds = state.peds.filter((p) => !p.enforcer);
    missions2.enforcersSpawned = false;
  }
  if (!missions2.active || missions2.failed) return;
  const def = MISSION2_DEFS[missions2.index];
  if (missions2.timer > 0) {
    missions2.timer -= dt;
    if (missions2.timer <= 0) {
      failJob2(missions2, def);
      return;
    }
  }
  const step = currentStep2(missions2);
  if (!step) return;
  runVaultAlarm(missions2, state, dt, def);
  const handler = STEP2_HANDLERS[step.kind];
  if (handler) handler(missions2, state, def, step, events, dt);
  // The getaway vehicle must survive mission 8, and Rico must survive
  // all three — a wasted Rico fails the job on the spot.
  if (state.player.health <= 0) {
    failJob2(missions2, def);
  }
  if (def.id === 8 && state.player.inCar && state.player.inCar.health <= 0 && missions2.step <= 2) {
    failJob2(missions2, def);
  }
}

export function completeMission2(missions2, state, def) {
  missions2.active = false;
  missions2.done = true;
  missions2.index += 1;
  let reward = def.reward;
  // Mission 8 pays a clean-delivery bonus when the van arrives in good
  // shape; mission 10 pays a bigger quiet bonus when the ledger was
  // taken before the vault alarm got loud.
  if (def.id === 8 && state.player.inCar && state.player.inCar.health >= 80) {
    reward += 200;
    showMessage2(missions2, `${def.title} complete! +$${reward} (includes $200 clean-delivery bonus)`, 5);
  } else if (def.id === 10 && missions2.heist.grabAlarm !== null && missions2.heist.grabAlarm < HEIST.quietBonusAlarm) {
    reward += 1500;
    showMessage2(missions2, `${def.title} complete! +$${reward} (includes $1500 quiet-job bonus) — Rico never works again.`, 6);
  } else if (def.id === 10) {
    showMessage2(missions2, `${def.title} complete! +$${reward} — Rico never works again.`, 6);
  } else {
    showMessage2(missions2, `${def.title} complete! +$${reward}`, 5);
  }
  state.player.money += reward;
  if (state.stats) state.stats.earned = (state.stats.earned || 0) + reward;
  if (typeof state.missionsDone === 'number') {
    // missionsDone counts the whole story: 7 from the first arc, plus
    // however far into the second arc Rico has got.
    state.missionsDone = Math.max(state.missionsDone, 7 + missions2.index);
  }
}

// One line per mission for the job board: title, giver, reward, status.
export function mission2SummaryLines(missions2) {
  return MISSION2_DEFS.map((def, i) => {
    if (i < missions2.index) return `${def.title} (${def.giver}): done — $${def.reward}`;
    if (i === missions2.index && missions2.active) return `${def.title} (${def.giver}): in progress — $${def.reward}`;
    if (i === missions2.index && missions2.failed) return `${def.title} (${def.giver}): failed — press M to retry`;
    return `${def.title} (${def.giver}): $${def.reward}`;
  });
}

// The objective position for the minimap arrow: the current step's ring,
// or null for escape / survive steps that have no place to go.
export function mission2ObjectivePos(missions2) {
  if (!missions2.active || missions2.index >= MISSION2_DEFS.length) return null;
  const step = MISSION2_DEFS[missions2.index].steps[missions2.step];
  if (!step || step.kind === 'escape' || step.kind === 'survive') return null;
  return { x: step.x, y: step.y };
}

// Keep the two chapters honest: a step kind the engine does not know is
// a bug, not a feature — the tests assert every kind is handled.
export const MISSION2_STEP_KINDS = new Set([
  'goto', 'steal', 'escape', 'crack', 'grab', 'fight',
  'shoot', 'deliver', 'survive', 'chase',
]);

export function mission2StepKindsKnown() {
  for (const def of MISSION2_DEFS) {
    for (const step of def.steps) {
      if (!MISSION2_STEP_KINDS.has(step.kind)) return false;
    }
  }
  return true;
}

// How far through the second arc Rico is, 0..1 — the job board progress bar.
export function mission2Progress(missions2) {
  return Math.min(1, missions2.index / MISSION2_DEFS.length);
}
