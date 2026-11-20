// Story missions 14, 15 and 16 for Palmetto Bay Heat — the fourth arc,
// picked up after the Bayfront Finale (mission 13) closes the third arc.
// Same shape as missions3.js on purpose: MISSION4_DEFS is a list of defs
// with an intro line, a chain of objective steps, a reward and a fail
// condition, and the state machine below walks the chain one step at a
// time. The main loop treats missions, missions2, missions3 and missions4
// as four chapters of the same book: only one chapter is active at a time,
// and the objective arrow always points at whichever chapter is running.
//
// New step kinds in this chapter, on top of the ones missions3.js already
// knows (goto, steal, escape, grab, fight, shoot, deliver, tail, holdout):
//   - checkpoint: a smuggling run through a chain of rings in order —
//     drive a hauler through every dock checkpoint, one at a time, and
//     each ring passed puts another star on Rico's head.
//   - shadow: follow a moving mark car without being made — progress
//     grows while Rico stays inside a band (close enough to watch, far
//     enough not to be spotted) and resets to zero when he gets too
//     close and the mark calls it in.
//   - plant: stand inside a ring and hold still while the tracker is
//     planted — progress grows inside the ring and slips away outside
//     it, so Rico has to commit to the spot.
//   - chase: a rival car spawns on Rico's tail and rams his car while he
//     drives for the destination ring — the step ends at the ring, and
//     a wrecked car ends the job.
import { KINGPIN } from './config.js';
import { addWanted } from './police.js';
import { damagePlayer } from './player.js';

export const MISSION4_DEFS = [
  {
    id: 14,
    title: 'Dockside Run',
    giver: 'Marina',
    intro: 'Marina: "The dock crews move product in a Container Hauler — slow, heavy, and nobody looks twice at it. Take the hauler, run the checkpoints down the pier, and drop it at the Lighthouse Warehouse. Every checkpoint you pass, the law gets a little more interested, so keep moving."',
    reward: 5000,
    failText: 'The hauler never made the Lighthouse Warehouse. Marina is done waiting.',
    timeLimit: 300,
    steps: [
      { kind: 'goto', text: 'Get to the Dockside Pier', x: 300, y: 2050, radius: 120 },
      { kind: 'steal', model: 'Container Hauler', text: 'Steal the Container Hauler', x: 300, y: 2050, radius: 130 },
      {
        kind: 'checkpoint',
        text: 'Run the dock checkpoints in order',
        points: [
          { x: 600, y: 2050, radius: 110 },
          { x: 1000, y: 2050, radius: 110 },
          { x: 1400, y: 2050, radius: 110 },
          { x: 1800, y: 2050, radius: 110 },
        ],
      },
      { kind: 'deliver', text: 'Deliver the hauler to the Lighthouse Warehouse', x: 2200, y: 2050, radius: 110, needCar: true },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
  {
    id: 15,
    title: 'The Auction',
    giver: 'Dante',
    intro: 'Dante: "A Kingpin Limo goes under the hammer tonight — black, armored, and the only one of its kind in the bay. A transport truck hauls it to the lot first. Shadow the truck, do not let the driver make you, then take the limo and outrun the house muscle to Marina Garage."',
    reward: 8000,
    failText: 'The limo stayed with the auction house. Dante does not pay for almost.',
    timeLimit: 360,
    steps: [
      { kind: 'goto', text: 'Get to the Coral Heights Auction House', x: 2400, y: 800, radius: 120 },
      {
        kind: 'shadow',
        text: 'Shadow the transport truck to the lot — stay close, but do not get made',
        x: 2000, y: 1200, radius: 0,
        waypoints: [
          { x: 2400, y: 800 },
          { x: 2400, y: 1200 },
          { x: 2000, y: 1200 },
        ],
        markSpeed: 90,
        minDist: 120,
        maxDist: 380,
        shadowSeconds: 10,
      },
      { kind: 'steal', model: 'Kingpin Limo', text: 'Steal the Kingpin Limo', x: 2000, y: 1200, radius: 130 },
      { kind: 'chase', text: 'Outrun the house muscle — get the limo to Marina Garage', x: 400, y: 360, radius: 120, needCar: true },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
  {
    id: 16,
    title: "Kingpin's Fall",
    giver: 'Marina',
    intro: 'Marina: "This ends it, Rico — the kingpin runs his whole operation out of the Old Town compound, and the evidence that buries him is inside. Plant the tracker, put his guards down, take the evidence, and hold the compound while the whole precinct comes for you. Walk out of that and the bay is finally yours."',
    reward: 20000,
    failText: 'The compound still stands — the kingpin keeps the bay.',
    timeLimit: 480,
    fightCount: 6,
    holdoutSeconds: 20,
    plantSeconds: 6,
    steps: [
      { kind: 'goto', text: 'Get to the Old Town compound', x: 1000, y: 1200, radius: 120 },
      { kind: 'plant', text: 'Plant the tracker inside the compound', x: 1000, y: 1200, radius: 100, seconds: 6 },
      { kind: 'fight', text: 'Take down the kingpin\'s guards', x: 1000, y: 1200, radius: 220 },
      { kind: 'grab', text: 'Take the evidence that buries the kingpin', x: 1000, y: 1200, radius: 100 },
      { kind: 'holdout', text: 'Hold the compound under five stars for 20 seconds', x: 1000, y: 1200, radius: 300, seconds: 20 },
      { kind: 'escape', text: 'Lose the police — get your wanted level to zero', x: 0, y: 0, radius: 0 },
    ],
  },
];

// The transport truck for mission 15: it hauls the limo from the auction
// house to the lot at (2000, 1200), one waypoint at a time, then waits.
const MARK_START = { x: 2400, y: 800 };

// The house muscle for mission 15: one rival driver who spawns on Rico's
// tail the moment he takes the limo and rams his car until he shakes him.
const PURSUER_SPEED = 430;
const PURSUER_RAM_DAMAGE = 10;

// The kingpin's guards for mission 16: six enforcers who hold the Old
// Town compound, chase Rico and hit back up close.
const GUARD_SPOTS = [
  { x: 910, y: 1130 },
  { x: 1090, y: 1130 },
  { x: 910, y: 1270 },
  { x: 1090, y: 1270 },
  { x: 1000, y: 1130 },
  { x: 1000, y: 1270 },
];

export function createMission4State() {
  return {
    index: 0, // which mission of MISSION4_DEFS is active (0-based); >= length = arc done
    step: 0,
    active: false,
    introTimer: 0,
    introText: '',
    timer: 0,
    failed: false,
    failText: '',
    done: false,
    // Live counters for the new step kinds.
    checkpointIndex: 0,
    shadowProgress: 0,
    spottedCooldown: 0,
    plantProgress: 0,
    fightDown: 0,
    holdoutTimer: 0,
    markSpawned: false,
    mark: null, // { x, y, wp } — the transport truck, while the shadow runs
    pursuerSpawned: false,
    pursuer: null, // { x, y, ramTimer } — the house muscle, while the chase runs
    guardsSpawned: false,
    message: '',
    messageTimer: 0,
  };
}

export function startMission4(missions4, index) {
  const def = MISSION4_DEFS[index];
  if (!def) return null;
  missions4.index = index;
  missions4.step = 0;
  missions4.active = true;
  missions4.failed = false;
  missions4.done = false;
  missions4.introText = def.intro;
  missions4.introTimer = 6;
  missions4.timer = def.timeLimit || 0;
  missions4.checkpointIndex = 0;
  missions4.shadowProgress = 0;
  missions4.spottedCooldown = 0;
  missions4.plantProgress = 0;
  missions4.fightDown = 0;
  missions4.holdoutTimer = 0;
  missions4.markSpawned = false;
  missions4.mark = null;
  missions4.pursuerSpawned = false;
  missions4.pursuer = null;
  missions4.guardsSpawned = false;
  missions4.message = `${def.title} — ${def.giver}`;
  missions4.messageTimer = 4;
  return def;
}

export function currentStep4(missions4) {
  const def = MISSION4_DEFS[missions4.index];
  if (!def || !missions4.active) return null;
  return def.steps[missions4.step] || null;
}

export function objectiveText4(missions4) {
  if (!missions4.active) {
    if (missions4.index >= MISSION4_DEFS.length) return 'Fourth arc complete — the whole story is done. Free roam.';
    return 'Press M to start the next mission.';
  }
  const step = currentStep4(missions4);
  if (!step) return '';
  if (step.kind === 'checkpoint') {
    const total = (step.points || []).length;
    return `${step.text} (${missions4.checkpointIndex}/${total})`;
  }
  if (step.kind === 'shadow') {
    return `${step.text} — ${Math.round(missions4.shadowProgress * 100)}%`;
  }
  if (step.kind === 'plant') {
    return `${step.text} — ${Math.round(missions4.plantProgress * 100)}%`;
  }
  if (step.kind === 'fight') {
    const def = MISSION4_DEFS[missions4.index];
    return `${step.text} (${missions4.fightDown}/${def.fightCount || 6})`;
  }
  if (step.kind === 'holdout') {
    const left = Math.max(0, Math.ceil((step.seconds || 20) - missions4.holdoutTimer));
    return `${step.text} — ${left}s left`;
  }
  return step.text;
}

export function showMessage4(missions4, text, seconds) {
  missions4.message = text;
  missions4.messageTimer = seconds || 3;
}

// The fourth arc opens only once the third arc is done — Marina does not
// hand Rico the kingpin's fall before the Bayfront Finale is finished.
// The check reads the main mission state, so a fresh save cannot skip ahead.
export function canStartMission4(state, index) {
  const def = MISSION4_DEFS[index];
  if (!def) return 'There is no such mission.';
  if (state.missions4 && state.missions4.active) return 'You are already on a mission — finish it first.';
  const arc3Done = state.missionsDone >= 13
    || (state.missions3 && state.missions3.index >= 3);
  if (!arc3Done) return 'Finish the third arc (missions 11-13) before the final arc opens.';
  if (state.missions && state.missions.active) return 'Finish the current story mission first.';
  if (state.missions2 && state.missions2.active) return 'Finish the current second-arc mission first.';
  if (state.missions3 && state.missions3.active) return 'Finish the current third-arc mission first.';
  return null;
}

// --- Mission 15: the transport truck ----------------------------------------
// The mark is a truck, not a pedestrian: it drives its route on rails,
// one waypoint at a time, and waits at the lot once it arrives. Rico has
// to keep it in sight without crowding it.
function spawnMark(missions4, state) {
  const step = currentStep4(missions4);
  const waypoints = (step && step.waypoints) || [{ x: 2000, y: 1200 }];
  missions4.mark = { x: MARK_START.x, y: MARK_START.y, wp: 0, waypoints };
  missions4.markSpawned = true;
  // The truck spawns on the auction-house forecourt, exactly where the
  // goto step just delivered Rico — give him two seconds to fall back
  // into the band before the driver can make him.
  missions4.spottedCooldown = 2;
  return missions4.mark;
}

function markPosition(missions4) {
  if (missions4.mark) return { x: missions4.mark.x, y: missions4.mark.y };
  return { x: MARK_START.x, y: MARK_START.y };
}

function stepMark(missions4, state, dt) {
  const mark = missions4.mark;
  if (!mark) return;
  const step = currentStep4(missions4);
  const speed = (step && step.markSpeed) || 90;
  const wp = mark.waypoints[Math.min(mark.wp, mark.waypoints.length - 1)];
  if (!wp) return;
  const dx = wp.x - mark.x;
  const dy = wp.y - mark.y;
  const d = Math.hypot(dx, dy);
  if (d < 12) {
    // Reached a waypoint: roll on to the next, or wait at the lot.
    if (mark.wp < mark.waypoints.length - 1) mark.wp += 1;
    return;
  }
  mark.x += (dx / d) * speed * dt;
  mark.y += (dy / d) * speed * dt;
}

// --- Mission 15: the house muscle -------------------------------------------
// One rival driver who spawns behind Rico's car and rams it until Rico
// reaches the garage. He is a plain object on the state, not a ped —
// peds walk, this one drives.
function spawnPursuer(missions4, state) {
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  missions4.pursuer = { x: px - 220, y: py + 120, ramTimer: 0 };
  missions4.pursuerSpawned = true;
  return missions4.pursuer;
}

function stepPursuer(missions4, state, dt) {
  const pursuer = missions4.pursuer;
  if (!pursuer) return;
  const car = state.player.inCar;
  if (!car) return;
  const dx = car.x - pursuer.x;
  const dy = car.y - pursuer.y;
  const d = Math.hypot(dx, dy);
  if (d > 1) {
    pursuer.x += (dx / d) * PURSUER_SPEED * dt;
    pursuer.y += (dy / d) * PURSUER_SPEED * dt;
  }
  pursuer.ramTimer = Math.max(0, pursuer.ramTimer - dt);
  if (d < 52 && pursuer.ramTimer <= 0) {
    pursuer.ramTimer = 1;
    car.health = Math.max(0, car.health - PURSUER_RAM_DAMAGE);
    showMessage4(missions4, 'The house muscle is ramming you — keep moving!', 2);
  }
}

// --- Mission 16: the compound guards ----------------------------------------
// Six enforcers who chase Rico and hit back up close. They are flagged
// bodyguard so punches can put them down, and guard so the two fights
// never count each other's casualties.
function spawnGuards(missions4, state) {
  state.peds = state.peds.filter((p) => !p.guard);
  for (const spot of GUARD_SPOTS) {
    state.peds.push({
      x: spot.x, y: spot.y, angle: Math.PI / 2, speed: 0,
      color: '#450a0a', walkPhase: 0, fleeing: false, fleeTimer: 0,
      changeTimer: 99, health: KINGPIN.bodyguardHealth,
      guard: true, bodyguard: true, down: false, punchTimer: 0,
    });
  }
  missions4.guardsSpawned = true;
}

function stepGuards(missions4, state, dt) {
  const player = state.player;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  let down = 0;
  for (const ped of state.peds) {
    if (!ped.guard) continue;
    if (ped.health <= 0) {
      if (!ped.down) {
        ped.down = true;
        ped.color = '#4b5563';
        showMessage4(missions4, 'Guard down!', 2);
      }
      down += 1;
      continue;
    }
    ped.fleeing = false;
    ped.fleeTimer = 0;
    // Chase Rico on foot; in a car he is too fast to catch, so the
    // guards hold their ground and wait for him to step out.
    const d = Math.hypot(ped.x - px, ped.y - py);
    if (!player.inCar && d > 30) {
      const toward = Math.atan2(py - ped.y, px - ped.x);
      ped.x += Math.cos(toward) * 70 * dt;
      ped.y += Math.sin(toward) * 70 * dt;
      ped.angle = toward;
    }
    ped.punchTimer = Math.max(0, (ped.punchTimer || 0) - dt);
    if (d < 44 && !player.inCar && ped.punchTimer <= 0) {
      ped.punchTimer = 1;
      if (player.invulnerable <= 0) {
        damagePlayer(player, 6);
        showMessage4(missions4, 'The guards are on you — fight back or fall back!', 2);
      }
    }
  }
  missions4.fightDown = down;
}

export function stepMissions4(missions4, state, dt, events) {
  if (missions4.messageTimer > 0) missions4.messageTimer -= dt;
  if (missions4.introTimer > 0) missions4.introTimer -= dt;
  if (missions4.spottedCooldown > 0) missions4.spottedCooldown -= dt;
  // Mission extras live only while their job needs them: the truck drives
  // during mission 15's shadow step and waits at the lot through its
  // steal step; the house muscle hunts during its chase step; the guards
  // hold the compound during mission 16's fight step — otherwise they
  // go home.
  const def0 = MISSION4_DEFS[missions4.index];
  const shadowLive = missions4.active && def0 && def0.id === 15 && (missions4.step === 1 || missions4.step === 2);
  if (!shadowLive) {
    missions4.mark = null;
    missions4.markSpawned = false;
  }
  const chaseLive = missions4.active && def0 && def0.id === 15 && missions4.step === 3;
  if (!chaseLive) {
    missions4.pursuer = null;
    missions4.pursuerSpawned = false;
  }
  if (!(missions4.active && def0 && def0.id === 16 && missions4.step === 2)) {
    if (state.peds.some((p) => p.guard)) state.peds = state.peds.filter((p) => !p.guard);
    missions4.guardsSpawned = false;
  }
  if (!missions4.active || missions4.failed) return;
  const def = MISSION4_DEFS[missions4.index];
  if (missions4.timer > 0) {
    missions4.timer -= dt;
    if (missions4.timer <= 0) {
      missions4.active = false;
      missions4.failed = true;
      missions4.failText = def.failText;
      return;
    }
  }
  const step = currentStep4(missions4);
  if (!step) return;
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  if (step.kind === 'checkpoint') {
    // The dock run: one ring at a time, in order. Each ring passed puts
    // another star on Rico — the law watches the pier.
    const points = step.points || [];
    const point = points[missions4.checkpointIndex];
    if (!point) {
      missions4.step += 1;
    } else {
      const d = Math.hypot(px - point.x, py - point.y);
      if (d < point.radius) {
        missions4.checkpointIndex += 1;
        addWanted(state, 1);
        if (missions4.checkpointIndex >= points.length) {
          missions4.step += 1;
          showMessage4(missions4, 'All checkpoints run — drop the hauler at the warehouse!', 3);
        } else {
          showMessage4(missions4, `Checkpoint ${missions4.checkpointIndex}/${points.length} — heat is rising!`, 3);
        }
      }
    }
    if (state.player.inCar && state.player.inCar.health <= 0) {
      missions4.active = false;
      missions4.failed = true;
      missions4.failText = 'The hauler was wrecked on the pier — the cargo is scrap.';
      return;
    }
  } else if (step.kind === 'shadow') {
    // Shadow the truck: inside the band the progress climbs, outside it
    // the trail goes cold, and crowding the truck gets Rico made — the
    // progress resets and the driver calls the law.
    if (!missions4.markSpawned) spawnMark(missions4, state);
    stepMark(missions4, state, dt);
    const mark = markPosition(missions4);
    const d = Math.hypot(px - mark.x, py - mark.y);
    const minDist = step.minDist || 120;
    const maxDist = step.maxDist || 380;
    const need = step.shadowSeconds || 10;
    if (d < minDist) {
      if (missions4.spottedCooldown <= 0) {
        missions4.spottedCooldown = 5;
        missions4.shadowProgress = 0;
        addWanted(state, 1);
        showMessage4(missions4, 'Made! The driver called it in — back off and start the tail over.', 3);
      }
    } else if (d <= maxDist) {
      missions4.shadowProgress = Math.min(1, missions4.shadowProgress + dt / need);
      if (missions4.shadowProgress >= 1) {
        missions4.step += 1;
        showMessage4(missions4, 'The truck led you to the lot — take the limo!', 3);
      }
    } else {
      missions4.shadowProgress = Math.max(0, missions4.shadowProgress - dt / (need * 2));
    }
  } else if (step.kind === 'plant') {
    // Plant the tracker: hold still inside the ring while it arms.
    // Step out and the arming slips back — the job wants commitment.
    const d = Math.hypot(px - step.x, py - step.y);
    const need = step.seconds || 6;
    if (d < step.radius) {
      missions4.plantProgress = Math.min(1, missions4.plantProgress + dt / need);
      if (missions4.plantProgress >= 1) {
        missions4.step += 1;
        addWanted(state, 2);
        showMessage4(missions4, 'Tracker planted — the guards know someone is inside!', 3);
      }
    } else {
      missions4.plantProgress = Math.max(0, missions4.plantProgress - dt / (need / 2));
    }
  } else if (step.kind === 'fight') {
    // The kingpin's guards: six enforcers who chase Rico and hit back.
    // Punch them down (Q) — when all six are down, the evidence is Rico's.
    if (!missions4.guardsSpawned) spawnGuards(missions4, state);
    stepGuards(missions4, state, dt);
    if (missions4.fightDown >= (def.fightCount || 6)) {
      missions4.step += 1;
      showMessage4(missions4, 'Guards down — take the evidence!', 3);
    }
  } else if (step.kind === 'grab') {
    const d = Math.hypot(px - step.x, py - step.y);
    if (d < step.radius) {
      missions4.step += 1;
      if (def.id === 16) {
        // The evidence is the crown jewel: taking it puts Rico at three
        // more stars on the spot.
        addWanted(state, 3);
        showMessage4(missions4, 'Evidence taken — the whole precinct is coming for you!', 4);
      } else {
        showMessage4(missions4, 'Grabbed — now lose the heat!', 3);
      }
    }
  } else if (step.kind === 'steal') {
    // The step advances only when Rico is actually driving the right car —
    // any old stolen car does not count.
    const wantModel = step.model || 'Container Hauler';
    if (state.player.inCar && state.player.inCar.model === wantModel) {
      missions4.step += 1;
      showMessage4(missions4, `Got the ${wantModel}. Now get it where it needs to go.`, 3);
    } else if (events && events.stolenCar && state.player.inCar && state.player.inCar.model !== wantModel) {
      showMessage4(missions4, `Wrong car — the job needs a ${wantModel}.`, 3);
    }
  } else if (step.kind === 'deliver') {
    // A delivery is a goto with a cargo: it only counts in the right
    // vehicle, and wrecking the vehicle on the way fails the job — the
    // cargo does not survive a crash.
    const d = Math.hypot(px - step.x, py - step.y);
    if (state.player.inCar && state.player.inCar.health <= 0) {
      missions4.active = false;
      missions4.failed = true;
      missions4.failText = 'The delivery vehicle was wrecked — the cargo is scrap.';
      return;
    }
    if (d < step.radius && (!step.needCar || state.player.inCar)) {
      missions4.step += 1;
      if (missions4.step >= def.steps.length) completeMission4(missions4, state, def);
      else showMessage4(missions4, 'Delivered — next stop marked.', 3);
    }
  } else if (step.kind === 'chase') {
    // Outrun the house muscle: the pursuer rams Rico's car the whole way,
    // and the step ends at the garage ring — a wrecked car ends the job.
    if (!missions4.pursuerSpawned) spawnPursuer(missions4, state);
    stepPursuer(missions4, state, dt);
    if (state.player.inCar && state.player.inCar.health <= 0) {
      missions4.active = false;
      missions4.failed = true;
      missions4.failText = 'The house muscle wrecked the limo — the job is blown.';
      return;
    }
    const d = Math.hypot(px - step.x, py - step.y);
    if (d < step.radius && (!step.needCar || state.player.inCar)) {
      missions4.step += 1;
      showMessage4(missions4, 'Shook the muscle — now vanish for good.', 3);
    }
  } else if (step.kind === 'holdout') {
    // Stand your ground in the compound: the clock only runs while Rico
    // is wanted, alive, and inside the marked ring. Run out of the ring
    // and the clock stalls — the finale wants a stand, not a hide.
    const d = Math.hypot(px - step.x, py - step.y);
    if (state.wanted > 0 && state.player.health > 0 && d < (step.radius || 300)) {
      missions4.holdoutTimer += dt;
      if (missions4.holdoutTimer >= (step.seconds || 20)) {
        missions4.step += 1;
        showMessage4(missions4, 'You held the compound — now vanish for good.', 3);
      }
    }
  } else if (step.kind === 'goto') {
    const d = Math.hypot(px - step.x, py - step.y);
    if (d < step.radius && (!step.needCar || state.player.inCar)) {
      missions4.step += 1;
      if (missions4.step >= def.steps.length) completeMission4(missions4, state, def);
      else showMessage4(missions4, 'Objective done — next stop marked.', 3);
    }
  } else if (step.kind === 'escape') {
    if (state.wanted === 0) {
      missions4.step += 1;
      if (missions4.step >= def.steps.length) completeMission4(missions4, state, def);
      else showMessage4(missions4, 'Clean. Now move on to the next stop.', 3);
    }
  }
  // Rico must survive all three — a wasted Rico fails the job on the
  // spot. The getaway car must survive mission 14 too.
  if (state.player.health <= 0) {
    missions4.active = false;
    missions4.failed = true;
    missions4.failText = def.failText;
  }
  if (def.id === 14 && state.player.inCar && state.player.inCar.health <= 0 && missions4.step <= 3) {
    missions4.active = false;
    missions4.failed = true;
    missions4.failText = def.failText;
  }
}

export function completeMission4(missions4, state, def) {
  missions4.active = false;
  missions4.done = true;
  missions4.index += 1;
  let reward = def.reward;
  // Mission 14 pays a clean-run bonus when the hauler arrives in good
  // shape; mission 16 closes the whole story, so its message says so.
  if (def.id === 14 && state.player.inCar && state.player.inCar.health >= 80) {
    reward += 400;
    showMessage4(missions4, `${def.title} complete! +$${reward} (includes $400 clean-run bonus)`, 5);
  } else if (def.id === 16) {
    showMessage4(missions4, `${def.title} complete! +$${reward} — the kingpin falls, the bay is yours, Rico. Every mission done.`, 6);
  } else {
    showMessage4(missions4, `${def.title} complete! +$${reward}`, 5);
  }
  state.player.money += reward;
  if (state.stats) state.stats.earned = (state.stats.earned || 0) + reward;
  if (typeof state.missionsDone === 'number') {
    // missionsDone counts the whole story: 7 from the first arc, 3 from
    // the second, 3 from the third, plus however far into the fourth arc
    // Rico has got.
    state.missionsDone = Math.max(state.missionsDone, 13 + missions4.index);
  }
}

// One line per mission for the job board: title, giver, reward, status.
export function mission4SummaryLines(missions4) {
  return MISSION4_DEFS.map((def, i) => {
    if (i < missions4.index) return `${def.title} (${def.giver}): done — $${def.reward}`;
    if (i === missions4.index && missions4.active) return `${def.title} (${def.giver}): in progress — $${def.reward}`;
    if (i === missions4.index && missions4.failed) return `${def.title} (${def.giver}): failed — press M to retry`;
    return `${def.title} (${def.giver}): $${def.reward}`;
  });
}

// The objective position for the minimap arrow: the current step's ring,
// or the truck's live position for mission 15's shadow step, or the next
// checkpoint for mission 14's checkpoint step, or null for escape /
// holdout steps that have no single place to go.
export function mission4ObjectivePos(missions4, state) {
  if (!missions4.active || missions4.index >= MISSION4_DEFS.length) return null;
  const step = MISSION4_DEFS[missions4.index].steps[missions4.step];
  if (!step || step.kind === 'escape' || step.kind === 'holdout') return null;
  if (step.kind === 'checkpoint') {
    const point = (step.points || [])[missions4.checkpointIndex];
    return point ? { x: point.x, y: point.y } : { x: step.x || 0, y: step.y || 0 };
  }
  if (step.kind === 'shadow') {
    return markPosition(missions4);
  }
  return { x: step.x, y: step.y };
}

// Keep the four chapters honest: a step kind the engine does not know is
// a bug, not a feature — the tests assert every kind is handled.
export const MISSION4_STEP_KINDS = new Set([
  'goto', 'steal', 'escape', 'grab', 'fight',
  'deliver', 'holdout', 'checkpoint', 'shadow', 'plant', 'chase',
]);

export function mission4StepKindsKnown() {
  for (const def of MISSION4_DEFS) {
    for (const step of def.steps) {
      if (!MISSION4_STEP_KINDS.has(step.kind)) return false;
    }
  }
  return true;
}

// How far through the fourth arc Rico is, 0..1 — the job board progress bar.
export function mission4Progress(missions4) {
  return Math.min(1, missions4.index / MISSION4_DEFS.length);
}
