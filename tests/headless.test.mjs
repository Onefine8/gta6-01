// Headless tests for Palmetto Bay Heat — run with: node tests/headless.test.mjs
// No browser, no canvas: the pure-logic modules (config, world, player,
// vehicles, police, missions, races, business) import cleanly in Node, so the
// whole story, race and empire loop can be driven step by step here with a
// fake state shaped like the one main.js builds.
import { CONTAINER, EMPIRE, HEIST, KINGPIN, VEHICLE_MODELS, WORLD } from '../game/src/config.js';
import { createRandom } from '../game/src/random.js';
import { createCity, createParkedCars } from '../game/src/world.js';
import { createPlayer, enterCar, punch } from '../game/src/player.js';
import { createPedestrians, createTraffic } from '../game/src/vehicles.js';
import { addWanted, clearWanted, createPolice } from '../game/src/police.js';
import { MISSION_DEFS, createMissionState, startMission, startTaxi, stepMissions, stepTaxi } from '../game/src/missions.js';
import { RACE_CIRCUITS, RACE_RIVALS, canStartRace, circuitsFitWorld, createRaceState, nearestCircuit, startRace, stepRace } from '../game/src/races.js';
import { BUSINESS_DEFS, buyBusiness, canBuyBusiness, collectBusiness, createBusinessState, nearestBusiness, nearestBusinessWithTill, ownedCount, stepBusinesses, totalTill } from '../game/src/business.js';
import { ACTION_BUSINESS } from '../game/src/input.js';

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

// A state shaped like main.js createState(), minus renderer/audio/input.
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
    race: createRaceState(),
    business: createBusinessState(),
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

function stepFor(state, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) stepMissions(state.missions, state, STEP, {});
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

// --- Config & world ---------------------------------------------------------

test('config: 7 missions with unique ids 1-7', () => {
  assertEq(MISSION_DEFS.length, 7, 'mission count');
  const ids = MISSION_DEFS.map((d) => d.id);
  assertEq(new Set(ids).size, 7, 'mission ids unique');
  assertEq(Math.min(...ids), 1, 'first id');
  assertEq(Math.max(...ids), 7, 'last id');
});

test('config: every mission step is a known kind inside the world', () => {
  const kinds = new Set(['steal', 'goto', 'escape', 'crack', 'grab', 'sneak', 'fight']);
  for (const def of MISSION_DEFS) {
    assert(def.steps.length >= 2, `${def.title} has steps`);
    assert(def.reward > 0, `${def.title} pays`);
    for (const s of def.steps) {
      assert(kinds.has(s.kind), `${def.title}: unknown step kind ${s.kind}`);
      assert(s.x >= 0 && s.x <= WORLD.width, `${def.title}: step x in world`);
      assert(s.y >= 0 && s.y <= WORLD.height, `${def.title}: step y in world`);
      // Escape steps have no ring (radius 0); every other step needs one.
      if (s.kind !== 'escape') assert(s.radius > 0, `${def.title}: step radius`);
    }
  }
});

test('config: new vehicle models exist', () => {
  const names = VEHICLE_MODELS.map((m) => m.name);
  assert(names.includes('Container Hauler'), 'Container Hauler listed');
  assert(names.includes('Kingpin Limo'), 'Kingpin Limo listed');
  assert(VEHICLE_MODELS.find((m) => m.name === 'Kingpin Limo').top === 600, 'limo top speed');
});

test('config: empire has 4 businesses with unique ids and prices', () => {
  assertEq(BUSINESS_DEFS.length, 4, 'business count');
  assertEq(new Set(BUSINESS_DEFS.map((b) => b.id)).size, 4, 'business ids unique');
  for (const b of BUSINESS_DEFS) {
    assert(b.price > 0 && b.income > 0, `${b.name} priced`);
    assert(b.x >= 0 && b.x <= WORLD.width && b.y >= 0 && b.y <= WORLD.height, `${b.name} in world`);
  }
  assertEq(EMPIRE.tickSeconds, 60, 'income tick');
  assertEq(EMPIRE.maxTicks, 4, 'till cap in ticks');
});

test('config: mission 6/7 tuning present', () => {
  assertEq(CONTAINER.sneakSeconds, 12, 'sneak seconds');
  assertEq(KINGPIN.fightCount, 4, 'bodyguard count');
  assertEq(HEIST.kingpinCrackSeconds, 12, 'kingpin crack seconds');
  assertEq(HEIST.kingpinQuietBonus, 1000, 'kingpin quiet bonus');
});

test('world: same seed builds the same city', () => {
  const a = createCity(createRandom(99));
  const b = createCity(createRandom(99));
  assertEq(a.buildings.length, b.buildings.length, 'building count');
  assertEq(a.buildings[0].x, b.buildings[0].x, 'first building x');
  assertEq(a.buildings[0].y, b.buildings[0].y, 'first building y');
  assertEq(a.packages.length, 12, '12 hidden packages');
});

// --- Races ------------------------------------------------------------------

test('races: 5 circuits, 4 rivals, Ghost is the fastest', () => {
  assertEq(RACE_CIRCUITS.length, 5, 'circuit count');
  assertEq(RACE_RIVALS.length, 4, 'rival count');
  const ghost = RACE_RIVALS.find((r) => r.name === 'Ghost');
  assert(ghost, 'Ghost exists');
  assertEq(ghost.topSpeed, 560, 'Ghost top speed');
  assert(ghost.topSpeed > Math.max(...RACE_RIVALS.filter((r) => r.name !== 'Ghost').map((r) => r.topSpeed)), 'Ghost fastest');
});

test('races: all circuits fit inside the world', () => {
  assert(circuitsFitWorld(), 'circuits fit world');
});

test('races: new start flags are findable', () => {
  assertEq(nearestCircuit(400, 400), 3, 'Bay Perimeter Run flag');
  assertEq(nearestCircuit(1600, 1200), 4, 'Park Slalom flag');
  assertEq(nearestCircuit(600, 200), 0, 'Marina Loop flag still first');
  assertEq(nearestCircuit(1600, 600), -1, 'empty road has no flag');
});

test('races: best-time slots exist for every circuit', () => {
  const race = createRaceState();
  assertEq(race.best.length, 5, 'best slots');
  assert(race.best.every((t) => t === null), 'best slots start empty');
});

test('races: entry rules still gate broke and car-less players', () => {
  const state = makeState();
  assert(canStartRace(state, 3).includes('need a car'), 'no car, no race');
  giveCar(state, 'Sunset Coupe');
  assert(canStartRace(state, 3).includes('$400'), 'broke player sees the fee');
  state.player.money = 1000;
  assertEq(canStartRace(state, 3), null, 'funded driver can enter');
});

test('races: a new circuit runs with 4 rivals and pays the winner', () => {
  const state = makeState();
  state.player.money = 1000;
  giveCar(state, 'Sunset Coupe');
  assert(startRace(state.race, state, 3, state.random), 'race starts');
  assertEq(state.player.money, 600, 'entry fee taken');
  assertEq(state.race.rivals.length, 4, 'four rivals line up');
  assert(state.race.rivals.some((r) => r.name === 'Ghost'), 'Ghost lines up');
  // Drive the car onto the last checkpoint to finish the lap.
  const circuit = RACE_CIRCUITS[3];
  state.race.checkpoint = circuit.checkpoints.length - 1;
  const last = circuit.checkpoints[circuit.checkpoints.length - 1];
  state.player.inCar.x = last.x;
  state.player.inCar.y = last.y;
  stepRace(state.race, state, STEP, state.random);
  assert(!state.race.active, 'race ends at the flag');
  assertEq(state.race.wins, 1, 'win counted');
  assertEq(state.player.money, 1400, 'prize paid');
  assert(state.race.best[3] !== null, 'best time recorded for circuit 3');
});

test('races: leaving the car abandons the race', () => {
  const state = makeState();
  state.player.money = 1000;
  giveCar(state, 'Sunset Coupe');
  assert(startRace(state.race, state, 4, state.random), 'Park Slalom starts');
  state.player.inCar = null;
  stepRace(state.race, state, STEP, state.random);
  assert(!state.race.active, 'race abandoned');
  assertEq(state.race.rivals.length, 0, 'rivals cleared');
});

// --- Business Empire --------------------------------------------------------

test('business: buying needs cash and the front door', () => {
  const state = makeState();
  teleport(state, 2000, 1200); // Downtown, far from every business
  assert(canBuyBusiness(state, 'safehouse').includes('closer'), 'far away cannot buy');
  state.player.x = 700;
  state.player.y = 340;
  assert(canBuyBusiness(state, 'safehouse').includes('$1500'), 'broke player sees the price');
  state.player.money = 2000;
  assertEq(canBuyBusiness(state, 'safehouse'), null, 'funded player at the door can buy');
});

test('business: buying records ownership and takes the price', () => {
  const state = makeState();
  state.player.x = 700;
  state.player.y = 340;
  state.player.money = 2000;
  assert(buyBusiness(state, 'safehouse'), 'buy succeeds');
  assertEq(state.player.money, 500, 'price taken');
  assert(state.business.owned.safehouse, 'owned');
  assertEq(ownedCount(state.business), 1, 'one owned');
  assert(!buyBusiness(state, 'safehouse'), 'cannot buy twice');
});

test('business: income accrues per tick and caps at 4 ticks', () => {
  const state = makeState();
  state.player.x = 700;
  state.player.y = 340;
  state.player.money = 2000;
  buyBusiness(state, 'safehouse');
  stepBusinesses(state.business, state, 30);
  assertEq(state.business.till.safehouse || 0, 0, 'nothing before the first tick');
  stepBusinesses(state.business, state, 31);
  assertEq(state.business.till.safehouse, 45, 'one tick of income');
  stepBusinesses(state.business, state, 300);
  assertEq(state.business.till.safehouse, 180, 'till caps at 4 ticks');
});

test('business: collecting pays the till and empties it', () => {
  const state = makeState();
  state.player.x = 700;
  state.player.y = 340;
  state.player.money = 2000;
  buyBusiness(state, 'safehouse');
  stepBusinesses(state.business, state, 121);
  assertEq(collectBusiness(state, 'safehouse'), 90, 'two ticks collected');
  assertEq(state.player.money, 590, 'money after collect');
  assertEq(state.business.till.safehouse, 0, 'till emptied');
  assertEq(collectBusiness(state, 'safehouse'), 0, 'empty till pays nothing');
});

test('business: unowned businesses pay nothing', () => {
  const state = makeState();
  assertEq(collectBusiness(state, 'bar'), 0, 'cannot collect what you do not own');
  stepBusinesses(state.business, state, 600);
  assertEq(totalTill(state.business), 0, 'no income without ownership');
});

test('business: total till sums every owned property', () => {
  const state = makeState();
  state.player.money = 20000;
  state.player.x = 700;
  state.player.y = 340;
  buyBusiness(state, 'safehouse');
  state.player.x = 1300;
  state.player.y = 740;
  buyBusiness(state, 'workshop');
  stepBusinesses(state.business, state, 61);
  assertEq(totalTill(state.business), 145, 'safehouse 45 + workshop 100');
  const next = nearestBusinessWithTill(state.business, 600, 320);
  assert(next && next.id === 'safehouse', 'nearest till is the safehouse');
});

test('business: nearestBusiness finds the right front door', () => {
  assertEq(nearestBusiness(2100, 340).id, 'bar', 'Neon Bar door');
  assertEq(nearestBusiness(460, 1940).id, 'warehouse', 'Harbor Warehouse door');
  assertEq(nearestBusiness(1600, 1200), null, 'park has no business');
});

test('input: business action is its own bit', () => {
  assertEq(ACTION_BUSINESS, 2048, 'B action bit');
});

// --- Mission 6: Container Heist --------------------------------------------

test('mission 6: sneak progress channels in the yard and decays outside', () => {
  const state = makeState();
  startMission(state.missions, 5);
  teleport(state, 500, 2050);
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.step, 1, 'reached the yard, sneak step starts');
  stepFor(state, 6);
  assert(state.missions.sneak.progress > 0.4 && state.missions.sneak.progress < 0.6, `progress halfway after 6s, got ${state.missions.sneak.progress}`);
  teleport(state, 1600, 1200);
  stepFor(state, 3);
  assert(state.missions.sneak.progress < 0.3, 'progress decays outside the yard');
});

test('mission 6: guards patrol the yard and spot a close Rico', () => {
  const state = makeState();
  startMission(state.missions, 5);
  teleport(state, 500, 2050);
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.guards.length, 2, 'two guards on patrol');
  const before = { x: state.missions.guards[0].x, y: state.missions.guards[0].y };
  stepFor(state, 2);
  assert(state.missions.guards[0].x !== before.x || state.missions.guards[0].y !== before.y, 'guards move');
  // Park a guard next to Rico inside the yard: the spotted meter must rise.
  state.missions.guards[0].x = 520;
  state.missions.guards[0].y = 2050;
  const spotBefore = state.missions.sneak.spot;
  stepFor(state, 1);
  assert(state.missions.sneak.spot > spotBefore, 'spotted meter rises near a guard');
});

test('mission 6: the full job pays $4500', () => {
  const state = makeState();
  startMission(state.missions, 5);
  teleport(state, 500, 2050);
  stepMissions(state.missions, state, STEP, {});
  stepFor(state, 13); // crack the lock
  assertEq(state.missions.step, 2, 'lock cracked, steal step');
  giveCar(state, 'Container Hauler');
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.step, 3, 'hauler stolen');
  teleport(state, 360, 360);
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.step, 4, 'hauler delivered, escape step');
  state.wanted = 0;
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.index, 6, 'mission 6 done, mission 7 next');
  assertEq(state.player.money, 250 + 4500, 'reward paid');
});

test('mission 6: the wrong car does not count for the steal', () => {
  const state = makeState();
  startMission(state.missions, 5);
  teleport(state, 500, 2050);
  stepMissions(state.missions, state, STEP, {});
  stepFor(state, 13);
  giveCar(state, 'Sunset Coupe');
  stepMissions(state.missions, state, STEP, { stolenCar: true });
  assertEq(state.missions.step, 2, 'still waiting for the hauler');
});

// --- Mission 7: Kingpin Takedown --------------------------------------------

function punchDownGuard(state, guard) {
  for (let i = 0; i < 3; i += 1) {
    state.player.x = guard.x - 10;
    state.player.y = guard.y;
    state.player.angle = 0;
    state.player.punchTimer = 0;
    state.player.punchComboTimer = 0;
    const hit = punch(state.player, state.peds);
    assert(hit === guard, 'punch lands on the bodyguard');
  }
  assert(guard.health <= 0, 'bodyguard down after three punches');
}

test('mission 7: bodyguards spawn, fight back, and go down to punches', () => {
  const state = makeState();
  startMission(state.missions, 6);
  teleport(state, 2800, 400);
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.step, 1, 'fight step starts at the compound');
  stepMissions(state.missions, state, STEP, {}); // the fight step spawns the crew
  const guards = state.peds.filter((p) => p.bodyguard);
  assertEq(guards.length, 4, 'four bodyguards');
  // A bodyguard does not flee when punched, and loses health.
  const guard = guards[0];
  state.player.x = guard.x - 10;
  state.player.y = guard.y;
  state.player.angle = 0;
  state.player.punchTimer = 0;
  const hit = punch(state.player, state.peds);
  assert(hit === guard, 'punch hits the bodyguard');
  assert(!guard.fleeing, 'bodyguard does not flee');
  assert(guard.health < 100, 'bodyguard takes damage');
});

test('mission 7: bodyguards chase Rico and hit him up close', () => {
  const state = makeState();
  startMission(state.missions, 6);
  teleport(state, 2800, 400);
  stepMissions(state.missions, state, STEP, {});
  stepMissions(state.missions, state, STEP, {}); // the fight step spawns the crew
  const guard = state.peds.find((p) => p.bodyguard);
  const before = { x: guard.x, y: guard.y };
  stepFor(state, 2);
  assert(Math.hypot(guard.x - before.x, guard.y - before.y) > 20, 'guard closes in');
  // Stand on top of a guard: Rico takes a hit.
  state.player.x = guard.x;
  state.player.y = guard.y;
  state.player.invulnerable = 0;
  const healthBefore = state.player.health;
  stepFor(state, 1);
  assert(state.player.health < healthBefore, 'guard lands a hit');
});

test('mission 7: the full finale pays $8000 plus the $1000 quiet bonus', () => {
  const state = makeState();
  startMission(state.missions, 6);
  teleport(state, 2800, 400);
  stepMissions(state.missions, state, STEP, {});
  stepMissions(state.missions, state, STEP, {}); // the fight step spawns the crew
  // Beat down all four bodyguards.
  for (const guard of state.peds.filter((p) => p.bodyguard)) punchDownGuard(state, guard);
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.step, 2, 'crew down, safe step');
  assertEq(state.missions.fightDown, 4, 'four down counted');
  // Crack the safe (12s), then take the ledger.
  teleport(state, 2800, 260);
  stepFor(state, 13);
  assertEq(state.missions.step, 3, 'safe cracked');
  teleport(state, 2600, 400);
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.step, 4, 'ledger taken, escape step');
  assertEq(state.wanted, 5, 'five stars on the spot');
  state.wanted = 0;
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.index, 7, 'story complete');
  assertEq(state.player.money, 250 + 8000 + 1000, 'reward plus quiet bonus');
});

test('mission 7: a loud safe costs the quiet bonus', () => {
  const state = makeState();
  startMission(state.missions, 6);
  state.missions.step = 3; // jump to the grab: alarm already maxed
  state.missions.heist.alarm = 95;
  teleport(state, 2600, 400);
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.step, 4, 'ledger taken');
  state.wanted = 0;
  const before = state.player.money;
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.player.money - before, 8000, 'no quiet bonus when loud');
});

// --- Regression: rounds 1-3 still work --------------------------------------

test('regression: mission 1 still pays the clean-delivery bonus', () => {
  const state = makeState();
  startMission(state.missions, 0);
  giveCar(state, 'Sunset Coupe');
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.step, 1, 'coupe stolen');
  teleport(state, 360, 360);
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.index, 1, 'mission 1 done');
  assertEq(state.player.money, 250 + 400 + 100, 'reward plus clean bonus');
});

test('regression: mission 5 vault crack and quiet bonus still work', () => {
  const state = makeState();
  startMission(state.missions, 4);
  teleport(state, 2800, 1200);
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.step, 1, 'inside the bank');
  teleport(state, 2800, 1000);
  stepFor(state, 9);
  assertEq(state.missions.step, 2, 'vault cracked');
  teleport(state, 2600, 1200);
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.step, 3, 'cash grabbed');
  state.wanted = 0;
  stepMissions(state.missions, state, STEP, {});
  assertEq(state.missions.index, 5, 'mission 5 done');
  assertEq(state.player.money, 250 + 3500 + 500, 'reward plus quiet bonus');
});

test('regression: mission timer still fails the job', () => {
  const state = makeState();
  startMission(state.missions, 1);
  stepFor(state, 151);
  assert(state.missions.failed, 'mission failed on timeout');
  assert(!state.missions.active, 'mission no longer active');
});

test('regression: taxi fares still pay by distance', () => {
  const state = makeState();
  startTaxi(state.missions, state, state.random);
  assert(state.missions.taxi.active, 'fare started');
  const t = state.missions.taxi;
  teleport(state, t.px, t.py);
  stepTaxi(state.missions, state, STEP);
  assertEq(state.missions.taxi.phase, 'dropoff', 'passenger aboard');
  assert(state.missions.taxi.fare > 60, 'fare priced by distance');
  const fare = state.missions.taxi.fare;
  teleport(state, t.dx, t.dy);
  stepTaxi(state.missions, state, STEP);
  assert(!state.missions.taxi.active, 'fare done');
  assertEq(state.player.money, 250 + fare, 'fare paid');
});

test('regression: punching a normal pedestrian still scares them off', () => {
  const state = makeState();
  const ped = state.peds[0];
  state.player.x = ped.x - 10;
  state.player.y = ped.y;
  state.player.angle = 0;
  const hit = punch(state.player, state.peds);
  assert(hit === ped, 'punch lands');
  assert(ped.fleeing, 'pedestrian flees');
});

test('regression: wanted stars rise and clear', () => {
  const state = makeState();
  addWanted(state, 2);
  assertEq(state.wanted, 2, 'two stars');
  addWanted(state, 9);
  assertEq(state.wanted, 5, 'capped at five stars');
  clearWanted(state, state.police);
  assertEq(state.wanted, 0, 'heat cleared');
  assertEq(state.police.cars.length, 0, 'cruisers gone');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failing: ${failures.join(', ')}`);
  process.exit(1);
}
