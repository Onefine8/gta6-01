// Headless tests for the round-6 systems — run with: node tests/headless3.test.mjs
// No browser, no canvas: missions 11-13, the Marina Garage tuning shop
// and the Coral Casino are pure logic, so the whole set can be driven
// step by step here with a fake state shaped like the one main.js builds.
import { createRandom } from '../game/src/random.js';
import { createCity, createParkedCars } from '../game/src/world.js';
import { createPlayer, enterCar, punch } from '../game/src/player.js';
import { createPedestrians, createTraffic } from '../game/src/vehicles.js';
import { addWanted, createPolice } from '../game/src/police.js';
import { createMissionState } from '../game/src/missions.js';
import { createMission2State } from '../game/src/missions2.js';
import {
  MISSION3_DEFS, MISSION3_STEP_KINDS, canStartMission3, completeMission3,
  createMission3State, currentStep3, mission3ObjectivePos, mission3Progress,
  mission3StepKindsKnown, mission3SummaryLines, objectiveText3, startMission3,
  stepMissions3,
} from '../game/src/missions3.js';
import {
  ARMOR_HEALTH_PER_LEVEL, ENGINE_SPEED_PER_LEVEL, NITRO_CHARGES,
  TUNING_ORDER, TUNING_PAINTS, TUNING_UPGRADES, buyNextUpgrade, buyUpgrade,
  canBuyUpgrade, createTuningState, deserializeTuning, nextUpgradeFor,
  serializeTuning, stepTuning, tuningOf, tuningProgress, tuningSummaryLines,
  upgradeById,
} from '../game/src/tuning.js';
import {
  BLACKJACK_BET, ROULETTE_BET, SLOTS_BET, canPlayCasino, casinoSummaryLines,
  createCasinoState, deserializeCasino, drawCard, handValue, isBlackjack,
  playBlackjack, playRoulette, rouletteColor, serializeCasino, spinRouletteWheel,
  spinSlots, stepCasino,
} from '../game/src/casino.js';

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

// A state shaped like main.js createState(), plus the round-6 slices.
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
    tuning: createTuningState(),
    casino: createCasinoState(),
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

function stepFor3(state, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) stepMissions3(state.missions3, state, STEP, {});
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

// --- Missions 11-13: defs ---------------------------------------------------

test('missions3: three defs, ids 11-13, every step kind is handled', () => {
  assertEq(MISSION3_DEFS.length, 3, 'three missions in the third arc');
  assertEq(MISSION3_DEFS.map((d) => d.id).join(','), '11,12,13', 'ids are 11, 12, 13');
  assert(mission3StepKindsKnown(), 'every step kind in the defs is known');
  for (const def of MISSION3_DEFS) {
    for (const step of def.steps) {
      assert(MISSION3_STEP_KINDS.has(step.kind), `kind ${step.kind} is known`);
    }
  }
  assertEq(mission3Progress(createMission3State()), 0, 'progress starts at 0');
});

test('missions3: the third arc stays locked until the second arc is done', () => {
  const state = makeState();
  assert(canStartMission3(state, 0) !== null, 'locked with no story done');
  state.missionsDone = 7;
  assert(canStartMission3(state, 0) !== null, 'locked after only the first arc');
  state.missionsDone = 10;
  assertEq(canStartMission3(state, 0), null, 'open once the second arc is done');
  assertEq(canStartMission3(state, 99), 'There is no such mission.', 'bad index is refused');
});

test('missions3: summary lines track done / active / failed', () => {
  const state = makeState();
  const lines = mission3SummaryLines(state.missions3);
  assertEq(lines.length, 3, 'one line per mission');
  assert(lines[0].includes('Harbor Lights'), 'first line names Harbor Lights');
  assert(lines[2].includes('$15000'), 'finale line shows its reward');
});

// --- Mission 11: Harbor Lights ----------------------------------------------

test('missions3: mission 11 runs end to end and pays the clean bonus', () => {
  const state = makeState();
  state.missionsDone = 10;
  state.player.money = 0;
  assertEq(canStartMission3(state, 0), null, 'mission 11 can start');
  startMission3(state.missions3, 0);
  assertEq(objectiveText3(state.missions3), 'Get to the Beachfront Pier', 'first objective is the pier');
  teleport(state, 600, 2260);
  stepFor3(state, 0.5);
  assertEq(state.missions3.step, 1, 'goto step advances at the pier');
  giveCar(state, 'Sunset Roadster');
  stepFor3(state, 0.5);
  assertEq(state.missions3.step, 2, 'steal step advances in the Roadster');
  teleport(state, 460, 1940);
  stepMissions3(state.missions3, state, STEP, {});
  assertEq(state.missions3.step, 3, 'deliver step advances at the warehouse');
  stepFor3(state, 0.5);
  assertEq(state.missions3.step, 4, 'escape step advances with no wanted level');
  assertEq(state.missions3.index, 1, 'mission 11 completes');
  assertEq(state.player.money, 4300, 'reward $4000 plus $300 clean-delivery bonus');
  assertEq(state.missionsDone, 11, 'story count advances to 11');
  assertEq(mission3Progress(state.missions3), 1 / 3, 'progress is a third');
});

test('missions3: mission 11 fails when the timer runs out', () => {
  const state = makeState();
  state.missionsDone = 10;
  startMission3(state.missions3, 0);
  stepFor3(state, 241);
  assert(state.missions3.failed, 'mission fails past its time limit');
  assert(!state.missions3.active, 'mission is no longer active');
});

test('missions3: mission 11 fails when the delivery car is wrecked', () => {
  const state = makeState();
  state.missionsDone = 10;
  startMission3(state.missions3, 0);
  teleport(state, 600, 2260);
  stepFor3(state, 0.5);
  giveCar(state, 'Sunset Roadster');
  stepFor3(state, 0.5);
  state.player.inCar.health = 0;
  stepFor3(state, 0.5);
  assert(state.missions3.failed, 'wrecking the Roadster fails the job');
});

// --- Mission 12: The Rat ----------------------------------------------------

test('missions3: mission 12 tail follows the rat and pays out', () => {
  const state = makeState();
  state.missionsDone = 10;
  state.player.money = 0;
  startMission3(state.missions3, 1);
  teleport(state, 2000, 1200);
  stepFor3(state, 0.5);
  assertEq(state.missions3.step, 1, 'goto step advances Downtown');
  // Stay glued to the rat for the whole tail: the progress bar climbs.
  for (let i = 0; i < 13 * 60; i += 1) {
    const rat = state.peds.find((p) => p.rat);
    if (rat) {
      state.player.x = rat.x;
      state.player.y = rat.y;
    }
    stepMissions3(state.missions3, state, STEP, {});
    if (state.missions3.step > 1) break;
  }
  assertEq(state.missions3.step, 2, 'tail step completes on the rat');
  assert(state.missions3.tailProgress >= 1, 'tail progress hit 100%');
  // The handlers go down and the ledger comes back.
  stepFor3(state, 0.5);
  const handlers = state.peds.filter((p) => p.handler);
  assertEq(handlers.length, 2, 'two handlers spawn');
  for (const h of handlers) h.health = 0;
  stepMissions3(state.missions3, state, STEP, {});
  assertEq(state.missions3.shootDown, 2, 'both handlers counted down');
  assertEq(state.missions3.step, 3, 'shoot step advances');
  const rat = state.peds.find((p) => p.rat);
  assert(rat, 'the rat is still around for the grab');
  state.player.x = rat.x;
  state.player.y = rat.y;
  stepFor3(state, 0.5);
  assertEq(state.missions3.step, 4, 'grab step advances at the rat');
  assertEq(state.wanted, 2, 'taking the ledger draws two stars');
  state.wanted = 0;
  stepFor3(state, 0.5);
  assertEq(state.missions3.index, 2, 'mission 12 completes');
  assertEq(state.player.money, 6000, 'mission 12 pays $6000');
});

test('missions3: falling behind the rat loses tail progress', () => {
  const state = makeState();
  state.missionsDone = 10;
  startMission3(state.missions3, 1);
  teleport(state, 2000, 1200);
  stepFor3(state, 0.5);
  // Stand on the rat for 3 seconds, then stand still far away: the
  // progress earned first slips away again.
  for (let i = 0; i < 3 * 60; i += 1) {
    const rat = state.peds.find((p) => p.rat);
    if (rat) {
      state.player.x = rat.x;
      state.player.y = rat.y;
    }
    stepMissions3(state.missions3, state, STEP, {});
  }
  const gained = state.missions3.tailProgress;
  assert(gained > 0.1, 'tail progress grows while close');
  teleport(state, 600, 320);
  stepFor3(state, 6);
  assert(state.missions3.tailProgress < gained, 'tail progress decays when far away');
});

// --- Mission 13: Bayfront Finale --------------------------------------------

test('missions3: mission 13 runs end to end, finale crew punchable', () => {
  const state = makeState();
  state.missionsDone = 10;
  state.player.money = 0;
  startMission3(state.missions3, 2);
  teleport(state, 2800, 1200);
  stepFor3(state, 0.5);
  assertEq(state.missions3.step, 1, 'goto step advances at the tower');
  stepFor3(state, 0.5);
  const crew = state.peds.filter((p) => p.finale);
  assertEq(crew.length, 5, 'five crew members spawn');
  // One goes down to a real punch, the rest are finished off directly.
  const first = crew[0];
  first.health = 10;
  state.player.x = first.x - 30;
  state.player.y = first.y;
  state.player.angle = 0;
  const hit = punch(state.player, state.peds);
  assert(hit === first, 'a punch lands on a crew member');
  for (const member of crew.slice(1)) member.health = 0;
  stepFor3(state, 0.5);
  assertEq(state.missions3.fightDown, 5, 'all five crew members counted down');
  assertEq(state.missions3.step, 2, 'fight step advances');
  teleport(state, 2600, 1200);
  stepFor3(state, 0.5);
  assertEq(state.missions3.step, 3, 'grab step advances at the ledger');
  assertEq(state.wanted, 5, 'taking the ledger draws five stars');
  // Hold Downtown: the clock runs while wanted and inside the ring.
  teleport(state, 2800, 1200);
  stepFor3(state, 26);
  assertEq(state.missions3.step, 4, 'holdout step advances after 25 seconds');
  state.wanted = 0;
  stepFor3(state, 0.5);
  assertEq(state.missions3.index, 3, 'mission 13 completes');
  assertEq(state.player.money, 15000, 'finale pays $15000');
  assertEq(state.missionsDone, 13, 'whole story complete: 13 missions');
  assertEq(mission3Progress(state.missions3), 1, 'third arc progress is 100%');
  assert(objectiveText3(state.missions3).includes('complete'), 'objective text says the arc is done');
});

test('missions3: holdout clock stalls outside the Downtown ring', () => {
  const state = makeState();
  state.missionsDone = 10;
  startMission3(state.missions3, 2);
  state.missions3.step = 3;
  state.missions3.active = true;
  addWanted(state, 5);
  teleport(state, 600, 320);
  stepFor3(state, 10);
  assertEq(state.missions3.holdoutTimer, 0, 'no holdout progress outside the ring');
  teleport(state, 2800, 1200);
  stepFor3(state, 5);
  assert(state.missions3.holdoutTimer > 4, 'holdout clock runs inside the ring');
});

test('missions3: objective arrow tracks the rat on the tail step', () => {
  const state = makeState();
  state.missionsDone = 10;
  startMission3(state.missions3, 1);
  teleport(state, 2000, 1200);
  stepFor3(state, 0.5);
  const pos = mission3ObjectivePos(state.missions3, state);
  const rat = state.peds.find((p) => p.rat);
  assert(rat, 'rat spawned');
  assertEq(pos.x, rat.x, 'arrow points at the rat x');
  assertEq(pos.y, rat.y, 'arrow points at the rat y');
});

// --- Tuning -----------------------------------------------------------------

function garageState(money = 10000) {
  const state = makeState();
  state.player.money = money;
  const car = state.parkedCars[0];
  car.model = 'Sunset Coupe';
  car.x = 400;
  car.y = 360;
  car.topSpeed = 580;
  car.health = 100;
  enterCar(state.player, car);
  return { state, car };
}

test('tuning: engine stages stack and must be bought in order', () => {
  const { state, car } = garageState();
  assert(canBuyUpgrade(state, car, 'engine3') !== null, 'stage 3 is blocked before stage 1');
  assertEq(canBuyUpgrade(state, car, 'engine1'), null, 'stage 1 can be bought');
  const bought = buyUpgrade(state, car, 'engine1');
  assertEq(bought.id, 'engine1', 'engine stage 1 bought');
  assertEq(car.topSpeed, Math.round(580 * (1 + ENGINE_SPEED_PER_LEVEL)), 'top speed up 12%');
  assertEq(state.player.money, 10000 - 800, 'stage 1 costs $800');
  buyUpgrade(state, car, 'engine2');
  buyUpgrade(state, car, 'engine3');
  assertEq(car.topSpeed, Math.round(580 * (1 + ENGINE_SPEED_PER_LEVEL * 3)), 'top speed up 36% at stage 3');
  assert(canBuyUpgrade(state, car, 'engine1') !== null, 'a fitted stage cannot be bought twice');
});

test('tuning: armor raises max health and patches the car up', () => {
  const { state, car } = garageState();
  car.health = 40;
  buyUpgrade(state, car, 'armor1');
  assertEq(car.maxHealth, 100 + ARMOR_HEALTH_PER_LEVEL, 'max health up 50');
  assertEq(car.health, 90, 'armor fitting patches 50 health');
  buyUpgrade(state, car, 'armor2');
  assertEq(car.maxHealth, 200, 'max health up 100 at stage 2');
});

test('tuning: the U key buys the next upgrade in build order', () => {
  const { state, car } = garageState();
  const first = buyNextUpgrade(state);
  assertEq(first.id, 'engine1', 'first U buy is engine stage 1');
  const second = buyNextUpgrade(state);
  assertEq(second.id, 'armor1', 'second U buy is armor stage 1');
  const third = buyNextUpgrade(state);
  assertEq(third.id, 'nitro', 'third U buy is the nitro kit');
  assertEq(tuningOf(car).nitroCharges, NITRO_CHARGES, 'nitro comes with 3 charges');
});

test('tuning: U refuses when Rico is on foot or away from the garage', () => {
  const state = makeState();
  state.player.money = 10000;
  assertEq(buyNextUpgrade(state), null, 'no tuning on foot');
  const { state: s2 } = garageState();
  s2.player.inCar.x = 2000;
  s2.player.inCar.y = 2000;
  assertEq(buyNextUpgrade(s2), null, 'no tuning away from the garage');
});

test('tuning: a broke Rico cannot buy anything', () => {
  const { state, car } = garageState(100);
  assert(canBuyUpgrade(state, car, 'engine1') !== null, 'engine 1 is refused when broke');
  assertEq(buyUpgrade(state, car, 'engine1'), null, 'buy returns null when broke');
  assertEq(state.player.money, 100, 'no money taken');
});

test('tuning: nitro fires on the horn, boosts, then falls back', () => {
  const { state, car } = garageState();
  buyUpgrade(state, car, 'nitro');
  const stockTop = car.topSpeed;
  const horn = { horn: () => true };
  stepTuning(state, STEP, horn);
  assertEq(tuningOf(car).nitroCharges, NITRO_CHARGES - 1, 'one charge spent');
  assert(car.topSpeed > stockTop, 'top speed jumps during the boost');
  assert(car.speed > 0, 'nitro kicks the car forward');
  const quiet = { horn: () => false };
  stepTuning(state, 3, quiet);
  assertEq(car.topSpeed, stockTop, 'top speed falls back after the boost');
});

test('tuning: nitro charges come back one at a time', () => {
  const { state, car } = garageState();
  buyUpgrade(state, car, 'nitro');
  const t = tuningOf(car);
  t.nitroCharges = 0;
  stepTuning(state, 21, { horn: () => false });
  assertEq(t.nitroCharges, 1, 'one charge back after 20 seconds');
});

test('tuning: paint changes the car colour, and a full build has no next upgrade', () => {
  const { state, car } = garageState(20000);
  const paint = TUNING_PAINTS.find((p) => p.id === 'paint-gold');
  buyUpgrade(state, car, 'paint-gold');
  assertEq(car.color, paint.color, 'car wears Bay Gold');
  assertEq(tuningOf(car).paint, paint.color, 'paint recorded on the car');
  for (const id of TUNING_ORDER) {
    if (id.startsWith('paint')) continue;
    buyUpgrade(state, car, id);
  }
  assertEq(nextUpgradeFor(car), null, 'fully built car has no next upgrade');
  assertEq(tuningProgress(car), 1, 'full build is 100%');
  assert(tuningSummaryLines(state).join(' ').includes('fully built'), 'summary says fully built');
});

test('tuning: serialize round-trips the shop totals', () => {
  const { state } = garageState();
  buyUpgrade(state, state.player.inCar, 'engine1');
  const data = serializeTuning(state.tuning);
  const fresh = createTuningState();
  deserializeTuning(fresh, data);
  assertEq(fresh.upgradesBought, 1, 'upgrades bought survives');
  assertEq(fresh.spent, 800, 'money spent survives');
  assertEq(upgradeById('engine1').price, 800, 'catalogue price is right');
  assertEq(TUNING_UPGRADES.length, 7, 'seven performance upgrades');
  assertEq(TUNING_ORDER.length, 8, 'eight steps in the build order');
});

// --- Casino -----------------------------------------------------------------

function casinoState(money = 1000) {
  const state = makeState();
  state.player.money = money;
  state.player.x = 2800;
  state.player.y = 400;
  return state;
}

test('casino: slots pay the jackpot on three of a kind', () => {
  const state = casinoState();
  const report = spinSlots(state, () => 0.01);
  assertEq(report.reels.join(','), '7,7,7', 'all three reels land on 7');
  assertEq(report.payout, SLOTS_BET * 10, 'jackpot pays 10x');
  assertEq(state.player.money, 1000 - SLOTS_BET + 500, 'jackpot lands in the wallet');
  assertEq(state.casino.spins, 1, 'one spin counted');
  assertEq(state.casino.biggestWin, 500, 'biggest win recorded');
});

test('casino: slots pay the bet back on any pair and nothing otherwise', () => {
  const state = casinoState();
  const pair = spinSlots(state, seqRandom([0.01, 0.01, 0.5]));
  assertEq(pair.payout, SLOTS_BET * 1, 'a pair pays the bet back');
  const miss = spinSlots(state, seqRandom([0.01, 0.2, 0.5]));
  assertEq(miss.payout, 0, 'no match pays nothing');
  assertEq(state.player.money, 1000 - 50 + 50 - 50, 'money accounts exactly');
});

test('casino: a thousand seeded spins account for every dollar', () => {
  const state = casinoState(100000);
  const random = createRandom(99);
  let paid = 0;
  for (let i = 0; i < 1000; i += 1) {
    const report = spinSlots(state, random);
    paid += report.payout;
  }
  assertEq(state.casino.spins, 1000, 'a thousand spins counted');
  assertEq(state.player.money, 100000 - 1000 * SLOTS_BET + paid, 'every dollar accounted for');
  assert(state.casino.net < 0, 'the house keeps an edge over a thousand spins');
});

test('casino: blackjack values aces and spots a blackjack', () => {
  assertEq(handValue([11, 10]), 21, 'ace plus ten is 21');
  assertEq(handValue([11, 10, 2]), 13, 'ace drops to 1 to avoid the bust');
  assertEq(handValue([11, 11, 9]), 21, 'two aces count 11 and 1');
  assert(isBlackjack([11, 10]), 'ace plus ten is blackjack');
  assert(!isBlackjack([10, 10, 1]), 'three cards is never blackjack');
  assertEq(drawCard(() => 0), 11, 'lowest roll draws an ace');
  assertEq(drawCard(() => 0.9), 10, 'high roll draws a ten');
});

test('casino: a dealt blackjack pays 2.5x', () => {
  const state = casinoState();
  // Player: ace, ten. Dealer: 2, 3, then hits 7 and 8 to reach 20.
  const random = seqRandom([0, 0.85, 0.1, 0.2, 0.5, 0.6]);
  const report = playBlackjack(state, random);
  assertEq(report.playerValue, 21, 'player holds 21');
  assert(report.payout === Math.round(BLACKJACK_BET * 2.5), 'blackjack pays 2.5x');
  assertEq(state.player.money, 1000 - BLACKJACK_BET + 250, 'blackjack lands in the wallet');
  assertEq(state.casino.blackjackHands, 1, 'one hand counted');
});

test('casino: a busted blackjack hand loses the stake', () => {
  const state = casinoState();
  // Player: 10, 6, then hits 10 to bust at 26. Dealer draws are unused.
  const random = seqRandom([0.85, 0.4, 0.1, 0.1, 0.85]);
  const report = playBlackjack(state, random);
  assert(report.playerValue > 21, 'player busts');
  assertEq(report.payout, 0, 'a bust pays nothing');
  assertEq(state.player.money, 1000 - BLACKJACK_BET, 'stake lost');
});

test('casino: roulette red wins on red and loses on green', () => {
  const state = casinoState();
  const win = playRoulette(state, () => 0.1, 'red');
  assertEq(win.pocket, 3, 'pocket 3 is red');
  assertEq(rouletteColor(3), 'red', 'pocket 3 reads red');
  assertEq(win.payout, ROULETTE_BET * 2, 'red pays 2x');
  const green = playRoulette(state, () => 0, 'red');
  assertEq(green.pocket, 0, 'pocket 0 is green');
  assertEq(rouletteColor(0), 'green', 'pocket 0 reads green');
  assertEq(green.payout, 0, 'green loses a red bet');
  const black = playRoulette(state, () => 0.99, 'black');
  assertEq(black.pocket, 36, 'pocket 36 is black');
  assertEq(black.payout, ROULETTE_BET * 2, 'black pays 2x on a black bet');
  assertEq(spinRouletteWheel(() => 0.5), 18, 'wheel lands on 18 at 0.5');
});

test('casino: a broke or distant Rico cannot play', () => {
  const broke = casinoState(10);
  assertEq(spinSlots(broke, () => 0.01), null, 'slots refuse a broke player');
  assertEq(broke.player.money, 10, 'no money taken');
  const far = makeState();
  far.player.money = 1000;
  assert(canPlayCasino(far, SLOTS_BET) !== null, 'casino refuses play outside its ring');
  const inCar = casinoState();
  giveCar(inCar, 'Sunset Coupe');
  assert(canPlayCasino(inCar, SLOTS_BET) !== null, 'casino refuses play from inside a car');
  assertEq(playRoulette(casinoState(), () => 0.1, 'green'), null, 'roulette refuses a bad colour choice');
});

test('casino: summary lines and serialize round-trip', () => {
  const state = casinoState();
  spinSlots(state, () => 0.01);
  playBlackjack(state, seqRandom([0, 0.85, 0.1, 0.2, 0.5, 0.6]));
  const lines = casinoSummaryLines(state);
  assert(lines.join(' ').includes('1 slots spins'), 'summary counts the spin');
  assert(lines.join(' ').includes('1 blackjack hands'), 'summary counts the hand');
  const data = serializeCasino(state.casino);
  const fresh = createCasinoState();
  deserializeCasino(fresh, data);
  assertEq(fresh.spins, 1, 'spins survive');
  assertEq(fresh.biggestWin, 500, 'biggest win survives');
  assertEq(fresh.net, state.casino.net, 'net survives');
  stepCasino(state, 1);
  assert(state.casino.messageTimer <= 2, 'casino message timer decays');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failing: ${failures.join(', ')}`);
  process.exit(1);
}
