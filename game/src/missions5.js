// Story missions 17, 18, 19 and 20 — the fifth arc, the Bay Heist chain.
// After the Last Score, Dante wants one job bigger than all the rest:
// rob the Bay Federal Reserve vault under the Downtown tower, and do it
// properly — with a crew, a plan, and a getaway. The arc runs in four
// jobs, each one unlocking the next:
//
//   17 The Crew — recruit three specialists across the city.
//   18 The Plan — scout the vault, the garage and the getaway route.
//   19 The Vault Run — crack the big vault, carry the loot out on foot,
//      and ride the heat out under five stars.
//   20 The Getaway — steal the getaway car, run three checkpoints against
//      the clock, and vanish.
//
// New step kinds in this arc, on top of the ones the earlier arcs know:
//   recruit — channel in a ring to talk a specialist into the job; they
//             join Rico's crew and follow him for the rest of the arc.
//   scout   — channel in a ring to case a site; each site cased makes the
//             vault crack faster in mission 19.
//   carry   — walk the loot to the drop on foot; driving does not count,
//             the bag is too hot to put in a car.
//   survive — stay alive for N seconds while the heat is on.
// The arc is pure logic like the others, so the headless tests can run
// the whole heist chain in milliseconds.
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

function tell(missions5, text, seconds) {
  missions5.message = text;
  missions5.messageTimer = seconds || 3;
}

export const MISSION5_DEFS = [
  {
    id: 17,
    title: 'The Crew',
    giver: 'Dante',
    intro: 'Dante: "The Reserve vault, Rico — the biggest score in Palmetto Bay, and I am not doing it with two hands. Three specialists: a wheelman at the Marina, a safecracker at the Neon Bar, and a lookout on the Beachfront Pier. Talk them into it. The job does not start until the crew is whole."',
    reward: 3000,
    failText: 'The crew never came together — Dante is done waiting.',
    timeLimit: 300,
    recruitSeconds: 4,
    steps: [
      { kind: 'recruit', crew: 'wheelman', text: 'Recruit the wheelman at Marina Garage', x: 360, y: 360, radius: 120 },
      { kind: 'recruit', crew: 'safecracker', text: 'Recruit the safecracker at the Neon Bar', x: 2100, y: 340, radius: 120 },
      { kind: 'recruit', crew: 'lookout', text: 'Recruit the lookout at Beachfront Pier', x: 600, y: 2260, radius: 120 },
    ],
  },
  {
    id: 18,
    title: 'The Plan',
    giver: 'Marina',
    intro: 'Marina: "A crew is only half a job, Rico. Case the vault, the garage where we stash the take, and the route out of Downtown — then bring me the plan. Every site you case makes the vault crack faster on the night."',
    reward: 4000,
    failText: 'The plan fell apart — the vault is not going anywhere.',
    timeLimit: 360,
    scoutSeconds: 5,
    steps: [
      { kind: 'scout', site: 'vault', text: 'Case the Downtown bank vault', x: 2800, y: 1200, radius: 120 },
      { kind: 'scout', site: 'garage', text: 'Case the Marina Garage stash point', x: 360, y: 360, radius: 120 },
      { kind: 'scout', site: 'route', text: 'Case the getaway route through Old Town', x: 800, y: 1200, radius: 120 },
      { kind: 'goto', text: 'Bring the plan to Marina at the Coral Hotel', x: 2960, y: 260, radius: 120 },
    ],
  },
  {
    id: 19,
    title: 'The Vault Run',
    giver: 'Dante',
    intro: 'Dante: "Tonight, Rico. The crew is ready, the plan is set, the vault is waiting. Crack it, carry the loot out on foot — no car, the bag is too hot — and ride the heat out. Five stars, one night, and we never work again."',
    reward: 15000,
    failText: 'The vault never opened — the last score slipped away.',
    timeLimit: 420,
    crackSeconds: 16,
    steps: [
      { kind: 'goto', text: 'Get to the Downtown tower', x: 2800, y: 1200, radius: 120 },
      { kind: 'crack', text: 'Crack the Reserve vault — stay inside the gold ring', x: 2800, y: 1000, radius: 100 },
      { kind: 'grab', text: 'Take the Reserve cash', x: 2600, y: 1200, radius: 100 },
      { kind: 'carry', text: 'Carry the loot to the Marina stash — on foot', x: 360, y: 360, radius: 120 },
      { kind: 'survive', text: 'Survive the five-star heat for 15 seconds', x: 0, y: 0, radius: 0, seconds: 15 },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
  {
    id: 20,
    title: 'The Getaway',
    giver: 'Marina',
    intro: 'Marina: "The money is stashed and the precinct is tearing the city apart. One last drive, Rico: steal the getaway car from the Coral Heights auction house, run the three checkpoints, and vanish before they lock the bridges. Make it clean and we are done — for good."',
    reward: 20000,
    failText: 'The getaway went sideways — the whole job is blown.',
    timeLimit: 240,
    steps: [
      { kind: 'steal', model: 'Neon GT', text: 'Steal the getaway Neon GT at the auction house', x: 2400, y: 800, radius: 130 },
      { kind: 'goto', text: 'Checkpoint 1 of 3: Lighthouse Point', x: 2960, y: 2060, radius: 120, needCar: true },
      { kind: 'goto', text: 'Checkpoint 2 of 3: Harbor Market', x: 360, y: 2060, radius: 120, needCar: true },
      { kind: 'goto', text: 'Checkpoint 3 of 3: Marina Garage', x: 360, y: 360, radius: 120, needCar: true },
      { kind: 'escape', text: 'Lose the police — vanish for good', x: 0, y: 0, radius: 0 },
    ],
  },
];

// The three specialists. Each one has a name, a colour on the street, and
// a job in the crew; once recruited they follow Rico for the rest of the
// arc, and the safecracker makes the vault crack faster.
export const CREW_DEFS = [
  { id: 'wheelman', name: 'Vex Marlowe', role: 'Wheelman', color: '#c65df0', x: 360, y: 360 },
  { id: 'safecracker', name: 'Old Sal', role: 'Safecracker', color: '#e8a34c', x: 2100, y: 340 },
  { id: 'lookout', name: 'Pip', role: 'Lookout', color: '#3f8fe8', x: 600, y: 2260 },
];

// How much each cased site in mission 18 shortens the mission 19 crack:
// three sites cased means the vault opens in half the time.
export const SCOUT_CRACK_BONUS = 0.18;

export function createMission5State() {
  return {
    index: 0, // which mission of MISSION5_DEFS is next (0-based); >= length = arc done
    step: 0,
    active: false,
    introTimer: 0,
    introText: '',
    timer: 0,
    failed: false,
    failText: '',
    done: false,
    // Live counters for the new step kinds.
    recruitProgress: 0, // 0..1 channel on the current recruit step
    scoutProgress: 0, // 0..1 channel on the current scout step
    scouted: [], // site ids cased in mission 18
    crew: [], // crew ids recruited in mission 17
    surviveTimer: 0,
    heist: { crack: 0, alarm: 0, alarmStars: 0, grabAlarm: null },
    message: '',
    messageTimer: 0,
  };
}

export function startMission5(missions5, index) {
  const def = MISSION5_DEFS[index];
  if (!def) return null;
  missions5.index = index;
  missions5.step = 0;
  missions5.active = true;
  missions5.failed = false;
  missions5.done = false;
  missions5.introText = def.intro;
  missions5.introTimer = 6;
  missions5.timer = def.timeLimit || 0;
  missions5.recruitProgress = 0;
  missions5.scoutProgress = 0;
  missions5.surviveTimer = 0;
  missions5.heist = { crack: 0, alarm: 0, alarmStars: 0, grabAlarm: null };
  missions5.message = `${def.title} — ${def.giver}`;
  missions5.messageTimer = 4;
  return def;
}

export function currentStep5(missions5) {
  const def = MISSION5_DEFS[missions5.index];
  if (!def || !missions5.active) return null;
  return def.steps[missions5.step] || null;
}

export function objectiveText5(missions5) {
  if (!missions5.active) {
    if (missions5.index >= MISSION5_DEFS.length) return 'The Bay Heist is done — Rico owns Palmetto Bay. Free roam.';
    return 'Press M to start the next mission.';
  }
  const step = currentStep5(missions5);
  if (!step) return '';
  if (step.kind === 'recruit') return `${step.text} — ${Math.round(missions5.recruitProgress * 100)}%`;
  if (step.kind === 'scout') return `${step.text} — ${Math.round(missions5.scoutProgress * 100)}%`;
  if (step.kind === 'survive') {
    const left = Math.max(0, Math.ceil((step.seconds || 15) - missions5.surviveTimer));
    return `${step.text} — ${left}s left`;
  }
  if (step.kind === 'crack') return `${step.text} — ${Math.round(missions5.heist.crack * 100)}%`;
  return step.text;
}

export function showMessage5(missions5, text, seconds) {
  missions5.message = text;
  missions5.messageTimer = seconds || 3;
}

// The fifth arc opens only once the fourth is done — Rico has to have
// finished the sixteen missions before Dante trusts him with the Reserve.
export function canStartMission5(state, index) {
  const def = MISSION5_DEFS[index];
  if (!def) return 'There is no such mission.';
  if (state.missions5 && state.missions5.active) return 'You are already on a mission — finish it first.';
  const storyDone = state.missionsDone >= 16 || (state.missions4 && state.missions4.index >= 3);
  if (!storyDone) return 'Finish the fourth arc (missions 14-16) before the Bay Heist opens.';
  if (state.missions && state.missions.active) return 'Finish the current story mission first.';
  if (state.missions2 && state.missions2.active) return 'Finish the current story mission first.';
  if (state.missions3 && state.missions3.active) return 'Finish the current story mission first.';
  if (state.missions4 && state.missions4.active) return 'Finish the current story mission first.';
  return null;
}

// The vault crack time for mission 19: the base time, shortened by every
// site cased in mission 18 and by having the safecracker on the crew.
export function vaultCrackSeconds(missions5) {
  const def = MISSION5_DEFS[2];
  let seconds = def.crackSeconds || HEIST.crackSeconds;
  seconds *= 1 - Math.min(0.5, missions5.scouted.length * SCOUT_CRACK_BONUS);
  if (missions5.crew.includes('safecracker')) seconds *= 0.85;
  return Math.max(6, seconds);
}

export function crewDef(id) {
  return CREW_DEFS.find((c) => c.id === id) || null;
}

export function crewCount(missions5) {
  return missions5.crew.length;
}

// --- Crew on the street -----------------------------------------------------
// A recruited specialist is a pedestrian with a crew flag who follows Rico
// around the city for the rest of the arc. They do not fight — they are
// the reason the vault opens faster and the reason the job feels like a
// crew job instead of a solo run.
function addCrewMember(missions5, state, crewId) {
  const def = crewDef(crewId);
  if (!def) return;
  if (missions5.crew.includes(crewId)) return;
  missions5.crew.push(crewId);
  state.peds.push({
    x: def.x, y: def.y, angle: Math.PI / 2, speed: 120,
    color: def.color, walkPhase: 0, fleeing: false, fleeTimer: 0,
    changeTimer: 99, health: 100, crew: true, crewId, down: false,
  });
}

function stepCrew(missions5, state, dt) {
  const player = state.player;
  for (const ped of state.peds) {
    if (!ped.crew || ped.health <= 0) continue;
    const d = dist(ped.x, ped.y, player.x, player.y);
    if (d > 90) {
      // Trail Rico at a respectful distance: close enough to feel like a
      // crew, far enough not to trip over him.
      ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
      const speed = d > 300 ? 260 : 150;
      ped.x += Math.cos(ped.angle) * speed * dt;
      ped.y += Math.sin(ped.angle) * speed * dt;
    }
  }
}

// The crew only exists while the fifth arc is running; when the arc is
// not active, or a mission is not the crew job, the specialists go home.
function pruneCrew(missions5, state) {
  if (missions5.active) return;
  if (state.peds.some((p) => p.crew)) state.peds = state.peds.filter((p) => !p.crew);
}

// --- Shared step machinery --------------------------------------------------
function advance5(missions5, state, def, note) {
  missions5.step += 1;
  if (missions5.step >= def.steps.length) {
    completeMission5(missions5, state, def);
  } else if (note) {
    showMessage5(missions5, note, 3);
  }
}

function failJob5(missions5, def, failText) {
  missions5.active = false;
  missions5.failed = true;
  missions5.failText = failText || def.failText;
}

// The Reserve vault alarm (mission 19): it climbs while Rico cracks the
// vault, and at two thresholds it calls the law in for real. It stops
// the moment the loot is taken — the carry is hard enough already.
function runReserveAlarm(missions5, state, dt, def) {
  if (!(def.id === 19 && missions5.step === 1)) return;
  const heist = missions5.heist;
  heist.alarm = Math.min(100, heist.alarm + HEIST.alarmPerSecond * dt);
  if (heist.alarm >= HEIST.alarmFirstStar && heist.alarmStars < 1) {
    heist.alarmStars = 1;
    addWanted(state, 1);
    showMessage5(missions5, 'The Reserve alarm is screaming — the cops are coming!', 4);
  } else if (heist.alarm >= HEIST.alarmSecondStar && heist.alarmStars < 2) {
    heist.alarmStars = 2;
    addWanted(state, 1);
    showMessage5(missions5, 'Alarm maxed — the whole precinct is on its way!', 4);
  }
}

// One handler per objective kind — same dispatch-table shape as the
// earlier arcs, with the four new kinds this arc adds.
const STEP5_HANDLERS = {
  goto(missions5, state, def, step) {
    const pos = ricoPos(state);
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius && (!step.needCar || state.player.inCar)) {
      advance5(missions5, state, def, 'Objective done — next stop marked.');
    }
  },

  steal(missions5, state, def, step, events) {
    const wantModel = step.model || 'Neon GT';
    const ride = state.player.inCar;
    if (ride && ride.model === wantModel) {
      advance5(missions5, state, def, `Got the ${wantModel}. Now run the checkpoints.`);
    } else if (events && events.stolenCar && ride && ride.model !== wantModel) {
      showMessage5(missions5, `Wrong car — the job needs a ${wantModel}.`, 3);
    }
  },

  escape(missions5, state, def) {
    if (state.wanted === 0) {
      advance5(missions5, state, def, 'Clean. The Bay Heist is one step closer.');
    }
  },

  crack(missions5, state, def, step, _events, dt) {
    const pos = ricoPos(state);
    const heist = missions5.heist;
    const seconds = vaultCrackSeconds(missions5);
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius) {
      heist.crack = Math.min(1, heist.crack + dt / seconds);
      if (heist.crack >= 1) {
        advance5(missions5, state, def, 'Vault open! Take the cash and run.');
      }
    } else if (heist.crack > 0) {
      heist.crack = Math.max(0, heist.crack - dt / HEIST.crackDecaySeconds);
    }
  },

  grab(missions5, state, def, step) {
    const pos = ricoPos(state);
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius) {
      missions5.heist.grabAlarm = missions5.heist.alarm;
      if (def.id === 19) {
        // The Reserve cash is the crown jewels: taking it puts Rico at
        // five stars on the spot.
        addWanted(state, 5);
        advance5(missions5, state, def, 'Cash taken — carry it to the stash, on foot!');
      } else {
        advance5(missions5, state, def, 'Grabbed — now lose the heat!');
      }
    }
  },

  recruit(missions5, state, def, step, _events, dt) {
    const pos = ricoPos(state);
    const seconds = def.recruitSeconds || 4;
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius) {
      missions5.recruitProgress = Math.min(1, missions5.recruitProgress + dt / seconds);
      if (missions5.recruitProgress >= 1) {
        const crewDefNow = crewDef(step.crew);
        addCrewMember(missions5, state, step.crew);
        missions5.recruitProgress = 0;
        advance5(missions5, state, def, crewDefNow ? `${crewDefNow.name} is in — ${crewDefNow.role} of the crew.` : 'Crew member recruited.');
      }
    } else if (missions5.recruitProgress > 0) {
      missions5.recruitProgress = Math.max(0, missions5.recruitProgress - dt / 2);
    }
  },

  scout(missions5, state, def, step, _events, dt) {
    const pos = ricoPos(state);
    const seconds = def.scoutSeconds || 5;
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius) {
      missions5.scoutProgress = Math.min(1, missions5.scoutProgress + dt / seconds);
      if (missions5.scoutProgress >= 1) {
        if (step.site && !missions5.scouted.includes(step.site)) missions5.scouted.push(step.site);
        missions5.scoutProgress = 0;
        advance5(missions5, state, def, 'Site cased — the vault crack will be faster on the night.');
      }
    } else if (missions5.scoutProgress > 0) {
      missions5.scoutProgress = Math.max(0, missions5.scoutProgress - dt / 2);
    }
  },

  carry(missions5, state, def, step) {
    // The loot goes on foot: driving with the bag does not count, and
    // stepping into a car is the wrong instinct for a hot bag.
    if (state.player.inCar) return;
    const pos = ricoPos(state);
    if (dist(pos.x, pos.y, step.x, step.y) < step.radius) {
      advance5(missions5, state, def, 'Loot stashed — now ride the heat out.');
    }
  },

  survive(missions5, state, def, step, _events, dt) {
    if (state.wanted > 0 && state.player.health > 0) {
      missions5.surviveTimer += dt;
      if (missions5.surviveTimer >= (step.seconds || 15)) {
        advance5(missions5, state, def, 'You rode the heat out — now vanish for good.');
      }
    }
  },
};

export function stepMissions5(missions5, state, dt, events) {
  if (missions5.messageTimer > 0) missions5.messageTimer -= dt;
  if (missions5.introTimer > 0) missions5.introTimer -= dt;
  pruneCrew(missions5, state);
  if (missions5.active) stepCrew(missions5, state, dt);
  if (!missions5.active || missions5.failed) return;
  const def = MISSION5_DEFS[missions5.index];
  if (missions5.timer > 0) {
    missions5.timer -= dt;
    if (missions5.timer <= 0) {
      failJob5(missions5, def);
      return;
    }
  }
  const step = currentStep5(missions5);
  if (!step) return;
  runReserveAlarm(missions5, state, dt, def);
  const handler = STEP5_HANDLERS[step.kind];
  if (handler) handler(missions5, state, def, step, events, dt);
  // Rico must survive every job in the chain, and the getaway car must
  // survive mission 20.
  if (state.player.health <= 0) {
    failJob5(missions5, def);
  }
  if (def.id === 20 && state.player.inCar && state.player.inCar.health <= 0 && missions5.step <= 3) {
    failJob5(missions5, def);
  }
}

export function completeMission5(missions5, state, def) {
  missions5.active = false;
  missions5.done = true;
  missions5.index += 1;
  let reward = def.reward;
  // Mission 19 pays a quiet bonus when the cash was taken before the
  // Reserve alarm got loud — the whole point of casing the vault first.
  if (def.id === 19 && missions5.heist.grabAlarm !== null && missions5.heist.grabAlarm < HEIST.quietBonusAlarm) {
    reward += 2000;
    showMessage5(missions5, `${def.title} complete! +$${reward} (includes $2000 quiet-job bonus) — the crew did it clean.`, 6);
  } else if (def.id === 20) {
    showMessage5(missions5, `${def.title} complete! +$${reward} — the Bay Heist is done. Rico owns Palmetto Bay.`, 6);
  } else {
    showMessage5(missions5, `${def.title} complete! +$${reward}`, 5);
  }
  state.player.money += reward;
  if (state.stats) state.stats.earned = (state.stats.earned || 0) + reward;
  if (typeof state.missionsDone === 'number') {
    // missionsDone counts the whole story: 16 from the earlier arcs, plus
    // however far into the fifth arc Rico has got.
    state.missionsDone = Math.max(state.missionsDone, 16 + missions5.index);
  }
}

// One line per mission for the job board: title, giver, reward, status.
export function mission5SummaryLines(missions5) {
  return MISSION5_DEFS.map((def, i) => {
    if (i < missions5.index) return `${def.title} (${def.giver}): done — $${def.reward}`;
    if (i === missions5.index && missions5.active) return `${def.title} (${def.giver}): in progress — $${def.reward}`;
    if (i === missions5.index && missions5.failed) return `${def.title} (${def.giver}): failed — press M to retry`;
    return `${def.title} (${def.giver}): $${def.reward}`;
  });
}

// The objective position for the minimap arrow: the current step's ring,
// or null for escape / survive steps that have no place to go.
export function mission5ObjectivePos(missions5) {
  if (!missions5.active || missions5.index >= MISSION5_DEFS.length) return null;
  const step = MISSION5_DEFS[missions5.index].steps[missions5.step];
  if (!step || step.kind === 'escape' || step.kind === 'survive') return null;
  return { x: step.x, y: step.y };
}

// Keep the arc honest: a step kind the engine does not know is a bug,
// not a feature — the tests assert every kind is handled.
export const MISSION5_STEP_KINDS = new Set([
  'goto', 'steal', 'escape', 'crack', 'grab',
  'recruit', 'scout', 'carry', 'survive',
]);

export function mission5StepKindsKnown() {
  for (const def of MISSION5_DEFS) {
    for (const step of def.steps) {
      if (!MISSION5_STEP_KINDS.has(step.kind)) return false;
    }
  }
  return true;
}

// How far through the fifth arc Rico is, 0..1 — the job board progress bar.
export function mission5Progress(missions5) {
  return Math.min(1, missions5.index / MISSION5_DEFS.length);
}
