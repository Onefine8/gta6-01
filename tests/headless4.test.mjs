// Headless tests for the round-6-redo systems — run with: node tests/headless4.test.mjs
// No browser, no canvas: missions 14-16, dockside smuggling and the Bay
// Auto Mall dealership are pure logic, so the whole set can be driven
// step by step here with a fake state shaped like the one main.js builds.
import { createRandom } from '../game/src/random.js';
import { createCity, createParkedCars } from '../game/src/world.js';
import { createPlayer, enterCar, punch } from '../game/src/player.js';
import { createPedestrians, createTraffic } from '../game/src/vehicles.js';
import { addWanted, createPolice } from '../game/src/police.js';
import { createMissionState } from '../game/src/missions.js';
import { createMission2State } from '../game/src/missions2.js';
import { createMission3State } from '../game/src/missions3.js';
import {
  MISSION4_DEFS, MISSION4_STEP_KINDS, canStartMission4, completeMission4,
  createMission4State, currentStep4, mission4ObjectivePos, mission4Progress,
  mission4StepKindsKnown, mission4SummaryLines, objectiveText4, startMission4,
  stepMissions4,
} from '../game/src/missions4.js';
import {
  SMUGGLING, SMUGGLING_DROPS, abandonSmuggling, breakSmugglingStreak,
  canStartSmuggling, createSmugglingState, currentDrop, deserializeSmuggling,
  nextSmugglingPay, serializeSmuggling, smugglingObjective, smugglingObjectiveText,
  startSmugglingRun, stepSmuggling,
} from '../game/src/smuggling.js';
import {
  DEALERSHIP, DEALERSHIP_PRICES, RARE_MODELS, buildDealershipStock,
  buyDealershipCar, canBuyDealershipCar, canSellCar, carValue,
  createDealershipState, dealershipSummaryLines, deserializeDealership,
  featuredCar, modelPrice, rarePrice, sellCar, serializeDealership,
  stepDealership, stockById, tradeInCar,
} from '../game/src/dealership.js';

const STEP = 1 / 60;
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (err) {
    failed += 1;
    failures.push(name);
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function assertEq(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message || 'expected equal'}: got ${actual}, want ${expected}`);
}

// A state shaped like main.js createState(), plus the round-6-redo slices.
function makeState(seed = 1234) {
  const random = createRandom(seed);
  const city = createCity(random);
  return {
    random,
    player: createPlayer(600, 320),
    city,
    parkedCars: createParkedCars(random, city),
    traffic: createTraffic(random, 4),
    peds: createPedestrians(random, 6),
    police: createPolice(),
    missions: createMissionState(),
    missions2: createMission2State(),
    missions3: createMission3State(),
    missions4: createMission4State(),
    smuggling: createSmugglingState(),
    dealership: createDealershipState(createRandom(7)),
    weather: { day: 0 },
    race: { active: false },
    missionsDone: 0,
    time: { hour: 9.5, isNight: false, raining: false },
    elapsed: 0,
    wanted: 0,
    wantedTimer: 26,
    busted: false,
    wasted: false,
    stats: { earned: 0, nearMiss: 0, taxis: 0, racesWon: 0 },
  };
}

function stepFor4(state, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) stepMissions4(state.missions4, state, STEP, {});
}

function teleport(state, x, y) {
  if (state.player.inCar) {
    state.player.inCar.x = x;
    state.player.inCar.y = y;
  } else {
    state.player.x = x;
    state.player.y = y;
  }
}

function giveCar(state, model) {
  const car = state.parkedCars[0];
  car.model = model;
  car.x = state.player.x;
  car.y = state.player.y;
  enterCar(state.player, car);
  return car;
}

// A random that yields a fixed sequence of values, then repeats the last.
function seqRandom(values) {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i += 1;
    return v;
  };
}

// --- Missions 14-16: defs ---------------------------------------------------

test('missions4: three defs, ids 14-16, every step kind is handled', () => {
  assertEq(MISSION4_DEFS.length, 3, 'three missions in the fourth arc');
  assertEq(MISSION4_DEFS.map((d) => d.id).join(','), '14,15,16', 'ids are 14, 15, 16');
  assert(mission4StepKindsKnown(), 'every step kind in the defs is known');
  for (const def of MISSION4_DEFS) {
    for (const step of def.steps) {
      assert(MISSION4_STEP_KINDS.has(step.kind), `kind ${step.kind} is known`);
    }
  }
  assertEq(mission4Progress(createMission4State()), 0, 'progress starts at 0');
  assertEq(MISSION4_DEFS[0].steps[2].points.length, 4, 'mission 14 has four checkpoints');
  assertEq(MISSION4_DEFS[1].steps[1].kind, 'shadow', 'mission 15 shadows the truck');
  assertEq(MISSION4_DEFS[2].steps[1].kind, 'plant', 'mission 16 plants a tracker');
  assertEq(MISSION4_DEFS[2].steps[3].kind, 'grab', 'mission 16 grabs the evidence');
});

test('missions4: the fourth arc stays locked until the third arc is done', () => {
  const state = makeState();
  assert(canStartMission4(state, 0) !== null, 'locked with no story done');
  state.missionsDone = 10;
  assert(canStartMission4(state, 0) !== null, 'locked after only the second arc');
  state.missionsDone = 13;
  assertEq(canStartMission4(state, 0), null, 'open once the third arc is done');
  assertEq(canStartMission4(state, 99), 'There is no such mission.', 'bad index is refused');
  state.missions3.index = 3;
  state.missionsDone = 0;
  assertEq(canStartMission4(state, 0), null, 'open when missions3 reports done');
});

test('missions4: summary lines track done / active / failed', () => {
  const state = makeState();
  const lines = mission4SummaryLines(state.missions4);
  assertEq(lines.length, 3, 'one line per mission');
  assert(lines[0].includes('Dockside Run'), 'first line names Dockside Run');
  assert(lines[1].includes('The Auction'), 'second line names The Auction');
  assert(lines[2].includes('$20000'), 'finale line shows its reward');
});

// --- Mission 14: Dockside Run -----------------------------------------------

test('missions4: mission 14 runs end to end and pays the clean bonus', () => {
  const state = makeState();
  state.missionsDone = 13;
  state.player.money = 0;
  assertEq(canStartMission4(state, 0), null, 'mission 14 can start');
  startMission4(state.missions4, 0);
  assertEq(objectiveText4(state.missions4), 'Get to the Dockside Pier', 'first objective is the pier');
  teleport(state, 300, 2050);
  stepFor4(state, 0.5);
  assertEq(state.missions4.step, 1, 'goto step advances at the pier');
  giveCar(state, 'Container Hauler');
  stepFor4(state, 0.5);
  assertEq(state.missions4.step, 2, 'steal step advances in the hauler');
  assert(objectiveText4(state.missions4).includes('(0/4)'), 'checkpoint counter starts at 0/4');
  for (const point of [[600, 2050], [1000, 2050], [1400, 2050], [1800, 2050]]) {
    teleport(state, point[0], point[1]);
    stepMissions4(state.missions4, state, STEP, {});
  }
  assertEq(state.missions4.checkpointIndex, 4, 'all four checkpoints run');
  assertEq(state.missions4.step, 3, 'checkpoint step advances to the delivery');
  teleport(state, 2200, 2050);
  stepMissions4(state.missions4, state, STEP, {});
  assertEq(state.missions4.step, 4, 'deliver step advances at the warehouse');
  state.wanted = 0;
  stepFor4(state, 0.5);
  assertEq(state.missions4.index, 1, 'mission 14 completes');
  assertEq(state.player.money, 5400, 'reward $5000 plus $400 clean-run bonus');
  assertEq(state.missionsDone, 14, 'story count advances to 14');
  assertEq(mission4Progress(state.missions4), 1 / 3, 'progress is a third');
});

test('missions4: each dock checkpoint adds a wanted star', () => {
  const state = makeState();
  state.missionsDone = 13;
  startMission4(state.missions4, 0);
  teleport(state, 300, 2050);
  stepFor4(state, 0.5);
  giveCar(state, 'Container Hauler');
  stepFor4(state, 0.5);
  assertEq(state.wanted, 0, 'no heat before the checkpoints');
  teleport(state, 600, 2050);
  stepMissions4(state.missions4, state, STEP, {});
  assertEq(state.wanted, 1, 'one star after the first checkpoint');
  teleport(state, 1000, 2050);
  stepMissions4(state.missions4, state, STEP, {});
  assertEq(state.wanted, 2, 'two stars after the second checkpoint');
  assert(objectiveText4(state.missions4).includes('(2/4)'), 'checkpoint counter reads 2/4');
});

test('missions4: mission 14 fails when the timer runs out or the hauler is wrecked', () => {
  const state = makeState();
  state.missionsDone = 13;
  startMission4(state.missions4, 0);
  stepFor4(state, 301);
  assert(state.missions4.failed, 'mission fails past its time limit');
  assert(!state.missions4.active, 'mission is no longer active');
  const state2 = makeState();
  state2.missionsDone = 13;
  startMission4(state2.missions4, 0);
  teleport(state2, 300, 2050);
  stepFor4(state2, 0.5);
  giveCar(state2, 'Container Hauler');
  stepFor4(state2, 0.5);
  state2.player.inCar.health = 0;
  stepFor4(state2, 0.5);
  assert(state2.missions4.failed, 'wrecking the hauler fails the job');
});

// --- Mission 15: The Auction -------------------------------------------------

test('missions4: mission 15 shadows the truck and pays out end to end', () => {
  const state = makeState();
  state.missionsDone = 13;
  state.player.money = 0;
  startMission4(state.missions4, 1);
  teleport(state, 2400, 800);
  stepFor4(state, 0.5);
  assertEq(state.missions4.step, 1, 'goto step advances at the auction house');
  // Stay in the shadow band behind the truck until the tail is done.
  for (let i = 0; i < 12 * 60; i += 1) {
    const mark = state.missions4.mark;
    if (mark) {
      state.player.x = mark.x + 200;
      state.player.y = mark.y;
    }
    stepMissions4(state.missions4, state, STEP, {});
    if (state.missions4.step > 1) break;
  }
  assertEq(state.missions4.step, 2, 'shadow step completes on the truck');
  assert(state.missions4.shadowProgress >= 1, 'shadow progress hit 100%');
  teleport(state, 2000, 1200);
  giveCar(state, 'Kingpin Limo');
  stepFor4(state, 0.5);
  assertEq(state.missions4.step, 3, 'steal step advances in the limo');
  assert(state.missions4.pursuerSpawned || state.missions4.pursuer, 'the house muscle spawns on the chase');
  teleport(state, 400, 360);
  stepMissions4(state.missions4, state, STEP, {});
  assertEq(state.missions4.step, 4, 'chase step advances at Marina Garage');
  state.wanted = 0;
  stepFor4(state, 0.5);
  assertEq(state.missions4.index, 2, 'mission 15 completes');
  assertEq(state.player.money, 8000, 'mission 15 pays $8000');
});

test('missions4: crowding the truck gets Rico made and resets the shadow', () => {
  const state = makeState();
  state.missionsDone = 13;
  startMission4(state.missions4, 1);
  teleport(state, 2400, 800);
  stepFor4(state, 0.5);
  // Three seconds in the band builds progress, then crowding the truck
  // blows it.
  for (let i = 0; i < 3 * 60; i += 1) {
    const mark = state.missions4.mark;
    if (mark) {
      state.player.x = mark.x + 200;
      state.player.y = mark.y;
    }
    stepMissions4(state.missions4, state, STEP, {});
  }
  const gained = state.missions4.shadowProgress;
  assert(gained > 0.1, 'shadow progress grows inside the band');
  const mark = state.missions4.mark;
  state.player.x = mark.x;
  state.player.y = mark.y;
  stepFor4(state, 0.5);
  assertEq(state.missions4.shadowProgress, 0, 'getting made resets the shadow');
  assertEq(state.wanted, 1, 'getting made draws a star');
});

test('missions4: the house muscle can wreck the limo and fail the job', () => {
  const state = makeState();
  state.missionsDone = 13;
  startMission4(state.missions4, 1);
  state.missions4.step = 3;
  state.missions4.active = true;
  teleport(state, 2000, 1200);
  const car = giveCar(state, 'Kingpin Limo');
  car.health = 5;
  stepFor4(state, 3);
  assert(state.missions4.failed, 'the muscle wrecking the limo fails the job');
  assert(car.health <= 0, 'the limo is wrecked');
});

// --- Mission 16: Kingpin's Fall ----------------------------------------------

test('missions4: mission 16 runs end to end and pays $20000', () => {
  const state = makeState();
  state.missionsDone = 13;
  state.player.money = 0;
  startMission4(state.missions4, 2);
  teleport(state, 1000, 1200);
  stepFor4(state, 0.5);
  assertEq(state.missions4.step, 1, 'goto step advances at the compound');
  // Plant the tracker: hold still in the ring for six seconds.
  stepFor4(state, 7);
  assertEq(state.missions4.step, 2, 'plant step advances');
  assertEq(state.wanted, 2, 'planting the tracker draws two stars');
  stepFor4(state, 0.5);
  const guards = state.peds.filter((p) => p.guard);
  assertEq(guards.length, 6, 'six guards hold the compound');
  // One goes down to a real punch, the rest are finished off directly.
  const first = guards[0];
  first.health = 10;
  state.player.x = first.x - 30;
  state.player.y = first.y;
  state.player.angle = 0;
  const hit = punch(state.player, state.peds);
  assert(hit === first, 'a punch lands on a guard');
  for (const member of guards.slice(1)) member.health = 0;
  // Step back out of the compound before the fight resolves, or the
  // grab step would complete on the same ticks — the fight ends where
  // Rico is standing, and the evidence ring is right there.
  state.player.x = 600;
  state.player.y = 320;
  stepFor4(state, 0.5);
  assertEq(state.missions4.fightDown, 6, 'all six guards counted down');
  assertEq(state.missions4.step, 3, 'fight step advances');
  teleport(state, 1000, 1200);
  stepFor4(state, 0.5);
  assertEq(state.missions4.step, 4, 'grab step advances at the evidence');
  assertEq(state.wanted, 5, 'taking the evidence draws five stars in total');
  teleport(state, 1000, 1200);
  stepFor4(state, 21);
  assertEq(state.missions4.step, 5, 'holdout step advances after 20 seconds');
  state.wanted = 0;
  stepFor4(state, 0.5);
  assertEq(state.missions4.index, 3, 'mission 16 completes');
  assertEq(state.player.money, 20000, 'finale pays $20000');
  assertEq(state.missionsDone, 16, 'whole story complete: 16 missions');
  assertEq(mission4Progress(state.missions4), 1, 'fourth arc progress is 100%');
  assert(objectiveText4(state.missions4).includes('complete'), 'objective text says the arc is done');
});

test('missions4: plant progress decays when Rico steps out of the ring', () => {
  const state = makeState();
  state.missionsDone = 13;
  startMission4(state.missions4, 2);
  state.missions4.step = 1;
  state.missions4.active = true;
  teleport(state, 1000, 1200);
  stepFor4(state, 3);
  const gained = state.missions4.plantProgress;
  assert(gained > 0.3, 'plant progress grows inside the ring');
  assert(objectiveText4(state.missions4).includes('%'), 'objective shows plant percent');
  teleport(state, 600, 320);
  stepFor4(state, 3);
  assert(state.missions4.plantProgress < gained, 'plant progress decays outside the ring');
});

test('missions4: holdout clock stalls outside the compound ring', () => {
  const state = makeState();
  state.missionsDone = 13;
  startMission4(state.missions4, 2);
  state.missions4.step = 4;
  state.missions4.active = true;
  addWanted(state, 5);
  teleport(state, 600, 320);
  stepFor4(state, 10);
  assertEq(state.missions4.holdoutTimer, 0, 'no holdout progress outside the ring');
  teleport(state, 1000, 1200);
  stepFor4(state, 5);
  assert(state.missions4.holdoutTimer > 4, 'holdout clock runs inside the ring');
});

test('missions4: objective arrow tracks the truck and the next checkpoint', () => {
  const state = makeState();
  state.missionsDone = 13;
  startMission4(state.missions4, 1);
  teleport(state, 2400, 800);
  stepFor4(state, 0.5);
  const pos = mission4ObjectivePos(state.missions4, state);
  const mark = state.missions4.mark;
  assert(mark, 'truck spawned');
  assertEq(pos.x, mark.x, 'arrow points at the truck x');
  assertEq(pos.y, mark.y, 'arrow points at the truck y');
  const state2 = makeState();
  state2.missionsDone = 13;
  startMission4(state2.missions4, 0);
  teleport(state2, 300, 2050);
  stepFor4(state2, 0.5);
  giveCar(state2, 'Container Hauler');
  stepFor4(state2, 0.5);
  const pos2 = mission4ObjectivePos(state2.missions4, state2);
  assertEq(pos2.x, 600, 'arrow points at the first checkpoint x');
  assertEq(pos2.y, 2050, 'arrow points at the first checkpoint y');
  assertEq(currentStep4(state2.missions4).kind, 'checkpoint', 'current step is the checkpoint run');
});

// --- Smuggling ----------------------------------------------------------------

function dockState(money = 0) {
  const state = makeState();
  state.player.money = money;
  state.player.x = SMUGGLING.pickup.x;
  state.player.y = SMUGGLING.pickup.y;
  return state;
}

function runDelivery(state, randomValue) {
  // Start a run, pick the crate up at the dock, drive to its drop.
  // Each run starts back at the dock on foot.
  state.player.inCar = null;
  state.player.x = SMUGGLING.pickup.x;
  state.player.y = SMUGGLING.pickup.y;
  const drop = startSmugglingRun(state, () => randomValue);
  assert(drop, 'run starts');
  stepSmuggling(state.smuggling, state, STEP);
  assertEq(state.smuggling.phase, 'deliver', 'crate picked up at the dock');
  const target = currentDrop(state.smuggling);
  state.player.x = target.x;
  state.player.y = target.y;
  stepSmuggling(state.smuggling, state, STEP);
  return target;
}

test('smuggling: a run starts only on foot at the dock, never mid-mission', () => {
  const state = dockState();
  assertEq(canStartSmuggling(state), null, 'can start at the dock on foot');
  const far = makeState();
  assert(canStartSmuggling(far) !== null, 'refused away from the dock');
  const inCar = dockState();
  giveCar(inCar, 'Sunset Coupe');
  assert(canStartSmuggling(inCar) !== null, 'refused from inside a car');
  const busy = dockState();
  busy.missions.active = true;
  assert(canStartSmuggling(busy) !== null, 'refused during a story mission');
  const racing = dockState();
  racing.race.active = true;
  assert(canStartSmuggling(racing) !== null, 'refused during a race');
});

test('smuggling: one delivery pays the base $300 and starts the streak', () => {
  const state = dockState();
  const before = state.parkedCars.length;
  assertEq(state.smuggling.streak, 0, 'streak starts at 0');
  runDelivery(state, 0);
  assertEq(state.player.money, 300, 'first delivery pays $300');
  assertEq(state.smuggling.streak, 1, 'streak is 1 after the first delivery');
  assertEq(state.smuggling.runs, 1, 'one run counted');
  assertEq(state.smuggling.earned, 300, 'earned tracks the payout');
  assert(!state.smuggling.active, 'run ends at the drop');
  assertEq(state.parkedCars.length, before, 'no cars spawned by a run');
  assert(smugglingObjective(state.smuggling) === null, 'no objective without a live run');
  assert(smugglingObjectiveText(state.smuggling).includes('Press Z'), 'idle text points at the dock');
});

test('smuggling: the streak raises the pay, capped at $800 a run', () => {
  const state = dockState();
  runDelivery(state, 0);
  runDelivery(state, 0.5);
  assertEq(state.player.money, 300 + 400, 'second delivery pays $400');
  runDelivery(state, 0.99);
  assertEq(state.player.money, 300 + 400 + 500, 'third delivery pays $500');
  assertEq(state.smuggling.streak, 3, 'streak is 3 after three deliveries');
  assertEq(nextSmugglingPay(state.smuggling), 600, 'fourth run would pay $600');
  state.smuggling.streak = 5;
  assertEq(nextSmugglingPay(state.smuggling), 800, 'pay caps at $800');
  state.smuggling.streak = 20;
  assertEq(nextSmugglingPay(state.smuggling), 800, 'pay stays capped at $800');
});

test('smuggling: the drop rotation visits all three drop points', () => {
  const state = dockState();
  const seen = new Set();
  for (const v of [0, 0.5, 0.99]) {
    const drop = startSmugglingRun(state, () => v);
    seen.add(drop.name);
    abandonSmuggling(state);
  }
  assertEq(seen.size, 3, 'three starts visit three different drops');
  assertEq(SMUGGLING_DROPS.length, 3, 'three drop points exist');
  const obj = smugglingObjective(state.smuggling);
  assert(obj === null, 'no objective after abandoning');
});

test('smuggling: the clock running out breaks the streak', () => {
  const state = dockState();
  runDelivery(state, 0);
  assertEq(state.smuggling.streak, 1, 'streak is 1');
  state.player.x = SMUGGLING.pickup.x;
  state.player.y = SMUGGLING.pickup.y;
  startSmugglingRun(state, () => 0);
  stepSmuggling(state.smuggling, state, 121);
  assert(!state.smuggling.active, 'run ends when the clock runs out');
  assertEq(state.smuggling.streak, 0, 'streak breaks on a timeout');
  assertEq(state.smuggling.runs, 1, 'the timed-out run is not counted');
});

test('smuggling: a hot streak draws the law at the drop and at the dock', () => {
  const state = dockState();
  state.smuggling.streak = 2;
  runDelivery(state, 0);
  assertEq(state.wanted, 1, 'delivering on a streak of 2 draws a star');
  assertEq(state.smuggling.heat, 1, 'heat tracks the star');
  const state2 = dockState();
  state2.smuggling.streak = 3;
  startSmugglingRun(state2, () => 0);
  stepSmuggling(state2.smuggling, state2, STEP);
  assertEq(state2.smuggling.phase, 'deliver', 'crate still picked up');
  assertEq(state2.wanted, 1, 'picking up on a streak of 3 draws a star');
});

test('smuggling: abandoning and getting busted both break the streak', () => {
  const state = dockState();
  runDelivery(state, 0);
  state.player.x = SMUGGLING.pickup.x;
  state.player.y = SMUGGLING.pickup.y;
  startSmugglingRun(state, () => 0);
  assert(abandonSmuggling(state), 'abandon works on a live run');
  assert(!state.smuggling.active, 'run is gone after abandoning');
  assertEq(state.smuggling.streak, 0, 'abandon breaks the streak');
  assert(!abandonSmuggling(state), 'abandon does nothing without a live run');
  const state2 = dockState();
  runDelivery(state2, 0);
  state2.player.x = SMUGGLING.pickup.x;
  state2.player.y = SMUGGLING.pickup.y;
  startSmugglingRun(state2, () => 0);
  breakSmugglingStreak(state2, 'Busted — the crate is gone.');
  assert(!state2.smuggling.active, 'bust ends the run');
  assertEq(state2.smuggling.streak, 0, 'bust breaks the streak');
});

test('smuggling: serialize round-trips the totals', () => {
  const state = dockState();
  runDelivery(state, 0);
  runDelivery(state, 0.5);
  const data = serializeSmuggling(state.smuggling);
  const fresh = createSmugglingState();
  deserializeSmuggling(fresh, data);
  assertEq(fresh.streak, 2, 'streak survives');
  assertEq(fresh.runs, 2, 'runs survive');
  assertEq(fresh.earned, 700, 'earned survives');
  assertEq(fresh.heat, 1, 'heat survives');
  const lines = smugglingObjectiveText(state.smuggling);
  assert(typeof lines === 'string' && lines.length > 0, 'objective text is a string');
});

// --- Dealership ---------------------------------------------------------------

function mallState(money = 20000) {
  const state = makeState();
  state.player.money = money;
  state.player.x = DEALERSHIP.x;
  state.player.y = DEALERSHIP.y;
  return state;
}

test('dealership: the lot holds four cars with exactly one rare, featured', () => {
  const state = makeState();
  const stock = state.dealership.stock;
  assertEq(stock.length, 4, 'four cars on the lot');
  assertEq(stock.filter((c) => c.rare).length, 1, 'exactly one rare car');
  const rare = stock.find((c) => c.rare);
  assert(RARE_MODELS.includes(rare.model), 'the rare car is a rare model');
  assertEq(featuredCar(state.dealership).model, rare.model, 'the featured car is the rare one');
  assertEq(rarePrice('Kingpin Limo'), 10800, 'rare limo costs $9000 plus 20%');
  assertEq(modelPrice('Sunset Coupe'), 2500, 'catalogue price is right');
  assertEq(DEALERSHIP_PRICES['Neon GT'], 6000, 'Neon GT lists at $6000');
  const lines = dealershipSummaryLines(state.dealership);
  assertEq(lines.length, 4, 'one summary line per stock car');
  assert(lines.join(' ').includes('(RARE)'), 'summary flags the rare car');
});

test('dealership: buying parks the car on the forecourt and restocks the slot', () => {
  const state = mallState();
  const entry = state.dealership.stock.find((c) => !c.rare);
  const price = entry.price;
  const model = entry.model;
  const before = state.parkedCars.length;
  const car = buyDealershipCar(state, entry.id, () => 0.5);
  assert(car, 'buy returns the car');
  assertEq(car.model, model, 'bought the car that was on the lot');
  assertEq(state.player.money, 20000 - price, 'price comes out of the wallet');
  assertEq(state.parkedCars.length, before + 1, 'the car is parked on the forecourt');
  assertEq(state.dealership.carsBought, 1, 'one car bought');
  assertEq(state.dealership.spent, price, 'spent tracks the price');
  assertEq(state.dealership.stock.length, 4, 'the lot restocks to four cars');
  assert(!state.dealership.stock.some((c) => c.id === entry.id && c.model === model), 'the sold slot holds a different car now');
});

test('dealership: a broke or distant Rico cannot buy, nor one in a car', () => {
  const broke = mallState(100);
  const entry = broke.dealership.stock[0];
  assertEq(buyDealershipCar(broke, entry.id, () => 0.5), null, 'buy returns null when broke');
  assertEq(broke.player.money, 100, 'no money taken');
  assert(canBuyDealershipCar(broke, entry.id) !== null, 'buy is refused when broke');
  const far = makeState();
  far.player.money = 20000;
  assert(canBuyDealershipCar(far, far.dealership.stock[0].id) !== null, 'buy is refused away from the mall');
  const inCar = mallState();
  giveCar(inCar, 'Sunset Coupe');
  assert(canBuyDealershipCar(inCar, inCar.dealership.stock[0].id) !== null, 'buy is refused from inside a car');
  assertEq(buyDealershipCar(inCar, 'no-such-car', () => 0.5), null, 'buy refuses an unknown stock id');
});

test('dealership: selling pays 60% and Rico steps out at the showroom', () => {
  const state = mallState();
  giveCar(state, 'Sunset Coupe');
  const before = state.parkedCars.length;
  const value = sellCar(state);
  assertEq(value, 1500, 'a Sunset Coupe sells for 60% of $2500');
  assertEq(state.player.money, 20000 + 1500, 'sale lands in the wallet');
  assertEq(state.player.inCar, null, 'Rico is on foot after the sale');
  assertEq(state.parkedCars.length, before - 1, 'the sold car leaves the world');
  assertEq(state.dealership.carsSold, 1, 'one car sold');
  assertEq(state.dealership.earned, 1500, 'earned tracks the sale');
  assertEq(carValue({ model: 'Kingpin Limo' }), 5400, 'a limo is worth $5400 used');
  assertEq(carValue({ model: 'Palm Taxi' }), 1080, 'a taxi is worth $1080 used');
});

test('dealership: selling refuses on foot, away from the mall, or in a cruiser', () => {
  const onFoot = mallState();
  assert(canSellCar(onFoot) !== null, 'nothing to sell on foot');
  assertEq(sellCar(onFoot), 0, 'sell returns 0 on foot');
  const far = mallState();
  giveCar(far, 'Sunset Coupe');
  far.player.inCar.x = 600;
  far.player.inCar.y = 320;
  assert(canSellCar(far) !== null, 'sell is refused away from the mall');
  const cop = mallState();
  giveCar(cop, 'PBPD Cruiser');
  assert(canSellCar(cop) !== null, 'the mall does not buy police cruisers');
  assertEq(sellCar(cop), 0, 'cruiser sale returns 0');
});

test('dealership: trading in pays the difference and Rico drives the new car away', () => {
  const state = mallState();
  giveCar(state, 'Sunset Coupe');
  const rare = featuredCar(state.dealership);
  assertEq(rare.model, 'Kingpin Limo', 'day 0 featured car is the limo');
  const report = tradeInCar(state, rare.id, () => 0.5);
  assert(report, 'trade-in returns a report');
  assertEq(report.sold, 'Sunset Coupe', 'report names the car sold');
  assertEq(report.soldValue, 1500, 'report values the old car at $1500');
  assertEq(report.bought, 'Kingpin Limo', 'report names the car bought');
  assertEq(report.paid, 10800 - 1500, 'report charges the $9300 difference');
  assertEq(state.player.money, 20000 - 9300, 'difference comes out of the wallet');
  assertEq(state.player.inCar.model, 'Kingpin Limo', 'Rico drives the limo away');
  assertEq(state.dealership.carsBought, 1, 'trade-in counts a buy');
  assertEq(state.dealership.carsSold, 1, 'trade-in counts a sale');
});

test('dealership: trading down pays money back, trading up broke is refused', () => {
  const state = mallState();
  giveCar(state, 'Kingpin Limo');
  const cheap = state.dealership.stock.find((c) => !c.rare);
  const cheapModel = cheap.model;
  const cheapPrice = cheap.price;
  const report = tradeInCar(state, cheap.id, () => 0.5);
  assert(report, 'trade down returns a report');
  assert(report.paid < 0, 'trading down pays Rico back');
  assertEq(state.player.money, 20000 + (-report.paid), 'money back lands in the wallet');
  assertEq(state.player.inCar.model, cheapModel, 'Rico drives the cheaper car away');
  assertEq(report.bought, cheapModel, 'report names the cheaper car bought');
  assertEq(report.paid, cheapPrice - 5400, 'report charges the negative difference');
  const broke = mallState(100);
  giveCar(broke, 'Sunset Coupe');
  const rare = featuredCar(broke.dealership);
  assertEq(tradeInCar(broke, rare.id, () => 0.5), null, 'trade-in refused when the difference is unaffordable');
  assertEq(broke.player.money, 100, 'no money taken');
  assertEq(broke.player.inCar.model, 'Sunset Coupe', 'Rico keeps his car');
  assertEq(tradeInCar(broke, 'no-such-car', () => 0.5), null, 'trade-in refuses an unknown stock id');
});

test('dealership: the rare car rotates with the in-game day', () => {
  const state = makeState();
  assertEq(featuredCar(state.dealership).model, 'Kingpin Limo', 'day 0 rare is the limo');
  state.weather.day = 1;
  stepDealership(state.dealership, state, STEP, () => 0.5);
  assertEq(state.dealership.day, 1, 'dealership tracks the new day');
  assertEq(featuredCar(state.dealership).model, 'Neon GT', 'day 1 rare is the Neon GT');
  state.weather.day = 2;
  stepDealership(state.dealership, state, STEP, () => 0.5);
  assertEq(featuredCar(state.dealership).model, 'Sunset Roadster', 'day 2 rare is the Roadster');
  state.weather.day = 3;
  stepDealership(state.dealership, state, STEP, () => 0.5);
  assertEq(featuredCar(state.dealership).model, 'Kingpin Limo', 'day 3 rare cycles back to the limo');
  const stock = buildDealershipStock(1, () => 0.5);
  assertEq(stock.filter((c) => c.rare).length, 1, 'a rebuilt lot still holds one rare car');
  assertEq(stockById(state.dealership, 'no-such-id'), null, 'unknown stock id is null');
});

test('dealership: serialize round-trips the totals', () => {
  const state = mallState();
  const entry = state.dealership.stock.find((c) => !c.rare);
  const price = entry.price;
  buyDealershipCar(state, entry.id, () => 0.5);
  giveCar(state, 'Sunset Coupe');
  sellCar(state);
  const data = serializeDealership(state.dealership);
  const fresh = createDealershipState(() => 0.5);
  deserializeDealership(fresh, data);
  assertEq(fresh.carsBought, 1, 'cars bought survives');
  assertEq(fresh.carsSold, 1, 'cars sold survives');
  assertEq(fresh.spent, price, 'spent survives');
  assertEq(fresh.earned, 1500, 'earned survives');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failing: ${failures.join(', ')}`);
  process.exit(1);
}
