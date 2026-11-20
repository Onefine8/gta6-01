// Headless tests for the round-7 systems — run with: node tests/headless5.test.mjs
// No browser, no canvas: missions 17-20, the property empire, the racing
// league, traffic AI, day/night events and the heat map are pure logic, so
// the whole set can be driven step by step here with a fake state shaped
// like the one main.js builds.
import { createRandom } from '../game/src/random.js';
import { createCity, createParkedCars } from '../game/src/world.js';
import { createPlayer, enterCar } from '../game/src/player.js';
import { createPedestrians, createTraffic } from '../game/src/vehicles.js';
import { addWanted, createPolice, cruisersForStars, wantedLabel } from '../game/src/police.js';
import { createMissionState } from '../game/src/missions.js';
import { createMission2State } from '../game/src/missions2.js';
import { createMission3State } from '../game/src/missions3.js';
import { createMission4State } from '../game/src/missions4.js';
import {
  CREW_DEFS, MISSION5_DEFS, MISSION5_STEP_KINDS, canStartMission5,
  completeMission5, createMission5State, crewCount, crewDef,
  currentStep5, mission5ObjectivePos, mission5Progress,
  mission5StepKindsKnown, mission5SummaryLines, objectiveText5,
  startMission5, stepMissions5, vaultCrackSeconds,
} from '../game/src/missions5.js';
import {
  PROPERTY_DEFS, buyProperty, canBuyProperty, canSellProperty,
  canUpgradeProperty, collectAllRent, collectRent, createPropertyState,
  deserializeProperties, nearestProperty, nextPropertyToBuy,
  ownedPropertyCount, propertyHudLine, propertyLevel, propertyPortfolioValue,
  propertyRent, propertySellPrice, propertySummaryLines, sellProperty,
  serializeProperties, stepProperties, totalRentPerMinute, totalRentWaiting,
  upgradeProperty,
} from '../game/src/properties.js';
import {
  LEAGUE_CHAMPION_PRIZE, LEAGUE_PLAYER_NAME, buildLeagueResults,
  createLeagueState, deserializeLeague, isLeagueRound, leagueHudLine,
  leagueLeader, leagueStandings, nextLeagueCircuit, playerLeaguePoints,
  playerLeagueRank, pointsBehindLeader, pointsForPlace, recordLeagueRace,
  serializeLeague, titleStillOpen,
} from '../game/src/league.js';
import {
  TRAFFIC_PERSONALITIES, assignTrafficPersonality, createTrafficAIState,
  findTrafficJams, honkAt, isRoadRaging, isRushHour, nearestTrafficCar,
  personalityById, pickPersonality, provokeDriver, roadRageLevel,
  rushHourFactor, stepTrafficAI, stepTrafficSystem, trafficDensityForHour,
  trafficNearMiss, trafficPersonality, trafficSummaryLines,
} from '../game/src/traffic.js';
import {
  DAY_EVENTS, createDayNightState, currentPhase, dayNightHudLine,
  deserializeDayNight, eventById, eventCounts, eventEffect, forceEvent,
  isEventActive, moonPhase, nightlifeMultiplier, phaseForHour, phaseIdForHour,
  pickEventFor, scheduleEvent, serializeDayNight, stepDayNight, streetlightsOn,
} from '../game/src/daynight.js';
import {
  COOLDOWN_SPOTS, addHeat, addHeatForStars, bribeCost, canBribe,
  coolestDistrict, createHeatState, currentCooldownSpot, deserializeHeat,
  heatAt, heatForDistrict, heatHudLine, heatMultiplier, heatSummaryLines, heatWord,
  hottestDistrict, nearestCooldownSpot, payBribe, serializeHeat, stepHeat,
  wantedDecayRate,
} from '../game/src/heat.js';
import { createWeatherState } from '../game/src/weather.js';
import { buyBusiness, canUpgradeBusiness, createBusinessState, stepBusinesses, upgradeBusiness } from '../game/src/business.js';

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

// A state shaped like main.js createState(), plus the round-7 slices.
function makeState(seed = 1234) {
  const random = createRandom(seed);
  const city = createCity(random);
  return {
    random,
    player: createPlayer(600, 320),
    city,
    parkedCars: createParkedCars(random, city),
    traffic: createTraffic(random, 6),
    peds: createPedestrians(random, 6),
    police: createPolice(),
    missions: createMissionState(),
    missions2: createMission2State(),
    missions3: createMission3State(),
    missions4: createMission4State(),
    missions5: createMission5State(),
    properties: createPropertyState(),
    league: createLeagueState(),
    trafficAI: createTrafficAIState(),
    daynight: createDayNightState(),
    heat: createHeatState(),
    weather: createWeatherState(),
    business: createBusinessState(),
    race: { active: false },
    missionsDone: 16,
    time: { hour: 9.5, isNight: false, raining: false },
    elapsed: 0,
    wanted: 0,
    wantedTimer: 26,
    busted: false,
    wasted: false,
    stats: { earned: 0, nearMiss: 0, taxis: 0, racesWon: 0 },
  };
}

function stepFor5(state, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) stepMissions5(state.missions5, state, STEP, {});
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

// --- Missions 17-20: defs ---------------------------------------------------

test('missions5: four defs, ids 17-20, every step kind is handled', () => {
  assertEq(MISSION5_DEFS.length, 4, 'four missions in the fifth arc');
  assertEq(MISSION5_DEFS.map((d) => d.id).join(','), '17,18,19,20', 'ids are 17, 18, 19, 20');
  assert(mission5StepKindsKnown(), 'every step kind in the defs is known');
  for (const def of MISSION5_DEFS) {
    for (const step of def.steps) {
      assert(MISSION5_STEP_KINDS.has(step.kind), `kind ${step.kind} is known`);
    }
  }
  assertEq(mission5Progress(createMission5State()), 0, 'progress starts at 0');
  assertEq(CREW_DEFS.length, 3, 'three specialists to recruit');
  assertEq(crewDef('wheelman').name, 'Vex Marlowe', 'wheelman named');
});

test('missions5: the fifth arc stays locked until the fourth arc is done', () => {
  const state = makeState();
  state.missionsDone = 10;
  assert(canStartMission5(state, 0).includes('fourth arc'), 'locked on an early save');
  state.missionsDone = 16;
  assertEq(canStartMission5(state, 0), null, 'open once the fourth arc is done');
  assert(canStartMission5(state, 9).includes('no such mission'), 'bad index rejected');
});

test('missions5: mission 17 recruits the whole crew', () => {
  const state = makeState();
  startMission5(state.missions5, 0);
  assertEq(objectiveText5(state.missions5).includes('wheelman'), true, 'first objective is the wheelman');
  const spots = [[360, 360], [2100, 340], [600, 2260]];
  for (let i = 0; i < spots.length; i += 1) {
    teleport(state, spots[i][0], spots[i][1]);
    stepFor5(state, 5);
    if (i < spots.length - 1) {
      // While the arc is running the recruited specialists walk with Rico.
      assertEq(state.peds.filter((ped) => ped.crew).length, i + 1, `crew member ${i + 1} on the street`);
    }
  }
  assertEq(state.missions5.index, 1, 'mission 17 done');
  assertEq(crewCount(state.missions5), 3, 'three crew recruited');
  assertEq(state.player.money, 250 + 3000, 'crew job pays $3000');
  // The crew goes home once the arc is idle — the roster lives on the state.
  assertEq(state.peds.filter((ped) => ped.crew).length, 0, 'crew goes home when the arc is idle');
});


test('missions5: mission 17 recruit channels and decays outside the ring', () => {
  const state = makeState();
  startMission5(state.missions5, 0);
  teleport(state, 360, 360);
  stepFor5(state, 2);
  assert(state.missions5.recruitProgress > 0.2, 'recruit channels in the ring');
  teleport(state, 2000, 2000);
  stepFor5(state, 5);
  assertEq(Math.round(state.missions5.recruitProgress * 100), 0, 'recruit decays outside the ring');
  assertEq(state.missions5.step, 0, 'still on the first recruit');
});

test('missions5: mission 18 cases three sites and the vault cracks faster', () => {
  const state = makeState();
  startMission5(state.missions5, 1);
  const before = vaultCrackSeconds(state.missions5);
  for (const spot of [[2800, 1200], [360, 360], [800, 1200]]) {
    teleport(state, spot[0], spot[1]);
    stepFor5(state, 6);
  }
  assertEq(state.missions5.step, 3, 'all three sites cased, plan step');
  teleport(state, 2960, 260);
  stepMissions5(state.missions5, state, STEP, {});
  assertEq(state.missions5.index, 2, 'mission 18 done');
  assertEq(state.player.money, 250 + 4000, 'plan pays $4000');
  assert(vaultCrackSeconds(state.missions5) < before, 'cased sites shorten the crack');
  assertEq(state.missions5.scouted.length, 3, 'three sites on record');
});

test('missions5: mission 19 runs the full vault job and pays $15000 plus the quiet bonus', () => {
  const state = makeState();
  // The crew and the plan come first: recruit, case, then run the vault.
  startMission5(state.missions5, 0);
  for (const spot of [[360, 360], [2100, 340], [600, 2260]]) {
    teleport(state, spot[0], spot[1]);
    stepFor5(state, 5);
  }
  startMission5(state.missions5, 1);
  for (const spot of [[2800, 1200], [360, 360], [800, 1200]]) {
    teleport(state, spot[0], spot[1]);
    stepFor5(state, 6);
  }
  teleport(state, 2960, 260);
  stepMissions5(state.missions5, state, STEP, {});
  const moneyBeforeVault = state.player.money;
  startMission5(state.missions5, 2);
  teleport(state, 2800, 1200);
  stepMissions5(state.missions5, state, STEP, {});
  assertEq(state.missions5.step, 1, 'vault step starts at the tower');
  teleport(state, 2800, 1000);
  stepFor5(state, 9);
  assertEq(state.missions5.step, 2, 'vault cracked with the crew and the plan');
  teleport(state, 2600, 1200);
  stepMissions5(state.missions5, state, STEP, {});
  assertEq(state.missions5.step, 3, 'cash taken, carry step');
  assertEq(state.wanted, 5, 'five stars on the spot');
  teleport(state, 360, 360);
  stepMissions5(state.missions5, state, STEP, {});
  assertEq(state.missions5.step, 4, 'loot stashed, survive step');
  stepFor5(state, 16);
  assertEq(state.missions5.step, 5, 'survived the heat, escape step');
  state.wanted = 0;
  stepMissions5(state.missions5, state, STEP, {});
  assertEq(state.missions5.index, 3, 'mission 19 done');
  assertEq(state.player.money, moneyBeforeVault + 15000 + 2000, 'reward plus quiet bonus');
});

test('missions5: mission 19 carry step does not count in a car', () => {
  const state = makeState();
  startMission5(state.missions5, 2);
  state.missions5.step = 3;
  state.missions5.active = true;
  giveCar(state, 'Sunset Coupe');
  teleport(state, 360, 360);
  stepMissions5(state.missions5, state, STEP, {});
  assertEq(state.missions5.step, 3, 'driving with the bag does not count');
});

test('missions5: mission 20 runs the full getaway and pays $20000', () => {
  const state = makeState();
  startMission5(state.missions5, 3);
  teleport(state, 2400, 800);
  giveCar(state, 'Neon GT');
  stepMissions5(state.missions5, state, STEP, {});
  assertEq(state.missions5.step, 1, 'getaway car stolen');
  teleport(state, 2960, 2060);
  stepMissions5(state.missions5, state, STEP, {});
  teleport(state, 360, 2060);
  stepMissions5(state.missions5, state, STEP, {});
  teleport(state, 360, 360);
  stepMissions5(state.missions5, state, STEP, {});
  assertEq(state.missions5.step, 4, 'all checkpoints run, escape step');
  state.wanted = 0;
  stepMissions5(state.missions5, state, STEP, {});
  assertEq(state.missions5.index, 4, 'mission 20 done — arc complete');
  assertEq(state.player.money, 250 + 20000, 'getaway pays $20000');
  assertEq(mission5Progress(state.missions5), 1, 'arc progress full');
  assert(mission5ObjectivePos(state.missions5) === null, 'no objective after the arc');
});

test('missions5: mission 20 fails when the getaway car is wrecked', () => {
  const state = makeState();
  startMission5(state.missions5, 3);
  giveCar(state, 'Neon GT');
  stepMissions5(state.missions5, state, STEP, {});
  state.player.inCar.health = 0;
  teleport(state, 2960, 2060);
  stepMissions5(state.missions5, state, STEP, {});
  assert(state.missions5.failed, 'wrecked getaway fails the job');
  assert(!state.missions5.active, 'mission no longer active');
});

test('missions5: mission timer still fails the job', () => {
  const state = makeState();
  startMission5(state.missions5, 0);
  stepFor5(state, 301);
  assert(state.missions5.failed, 'mission failed on timeout');
  assertEq(mission5SummaryLines(state.missions5)[0].includes('failed'), true, 'summary shows the failure');
});

// --- Properties --------------------------------------------------------------

test('properties: eight properties across the districts', () => {
  assertEq(PROPERTY_DEFS.length, 8, 'eight properties');
  const ids = PROPERTY_DEFS.map((p) => p.id);
  assertEq(new Set(ids).size, 8, 'ids unique');
  for (const p of PROPERTY_DEFS) {
    assert(p.price > 0 && p.rent > 0, `${p.name} has a price and a rent`);
    assert(p.x >= 0 && p.x <= 3200 && p.y >= 0 && p.y <= 2400, `${p.name} is in the world`);
  }
  assertEq(nextPropertyToBuy(createPropertyState()).id, 'old-town-flat', 'cheapest first');
});

test('properties: buying needs cash and the front door', () => {
  const state = makeState();
  assert(canBuyProperty(state, 'old-town-flat').includes('closer'), 'far away cannot buy');
  teleport(state, 600, 1200);
  assert(canBuyProperty(state, 'old-town-flat').includes('$2000'), 'broke player sees the price');
  state.player.money = 5000;
  assertEq(canBuyProperty(state, 'old-town-flat'), null, 'funded player can buy');
  assert(buyProperty(state, 'old-town-flat'), 'buy succeeds');
  assertEq(state.player.money, 3000, 'price taken');
  assertEq(ownedPropertyCount(state.properties), 1, 'one property owned');
  assert(!buyProperty(state, 'old-town-flat'), 'cannot buy twice');
});

test('properties: rent accrues per tick and caps at 4 ticks', () => {
  const state = makeState();
  state.player.money = 5000;
  teleport(state, 600, 1200);
  buyProperty(state, 'old-town-flat');
  stepProperties(state.properties, state, 60);
  assertEq(state.properties.rent['old-town-flat'], 60, 'one tick of rent');
  stepProperties(state.properties, state, 60 * 10);
  assertEq(state.properties.rent['old-town-flat'], 240, 'rent caps at 4 ticks');
});

test('properties: collecting pays the till and empties it', () => {
  const state = makeState();
  state.player.money = 5000;
  teleport(state, 600, 1200);
  buyProperty(state, 'old-town-flat');
  stepProperties(state.properties, state, 120);
  const before = state.player.money;
  assertEq(collectRent(state, 'old-town-flat'), 120, 'two ticks collected');
  assertEq(state.player.money, before + 120, 'rent in the pocket');
  assertEq(state.properties.rent['old-town-flat'], 0, 'till emptied');
  assertEq(collectRent(state, 'old-town-flat'), 0, 'empty till pays nothing');
});

test('properties: renovation raises the rent', () => {
  const state = makeState();
  state.player.money = 10000;
  teleport(state, 600, 1200);
  buyProperty(state, 'old-town-flat');
  assertEq(propertyRent(state.properties, PROPERTY_DEFS[0]), 60, 'base rent $60');
  assert(upgradeProperty(state, 'old-town-flat'), 'renovation buys');
  assertEq(propertyLevel(state.properties, 'old-town-flat'), 1, 'level 1');
  assertEq(propertyRent(state.properties, PROPERTY_DEFS[0]), 84, 'rent up 40%');
  stepProperties(state.properties, state, 60);
  assertEq(state.properties.rent['old-town-flat'], 84, 'renovated rent ticks in');
});

test('properties: selling pays the price back and frees the property', () => {
  const state = makeState();
  state.player.money = 5000;
  teleport(state, 600, 1200);
  buyProperty(state, 'old-town-flat');
  stepProperties(state.properties, state, 60);
  const before = state.player.money;
  const got = sellProperty(state, 'old-town-flat');
  assertEq(got, Math.round(2000 * 0.7) + 60, 'sell price plus waiting rent');
  assertEq(state.player.money, before + got, 'sale paid');
  assertEq(ownedPropertyCount(state.properties), 0, 'no longer owned');
  assertEq(state.properties.sold, 1, 'sale counted');
  assert(!canSellProperty(state, 'old-town-flat').includes('closer'), 'cannot sell what is not owned');
});

test('properties: save and load round-trips ownership and rent', () => {
  const state = makeState();
  state.player.money = 5000;
  teleport(state, 600, 1200);
  buyProperty(state, 'old-town-flat');
  stepProperties(state.properties, state, 60);
  const saved = serializeProperties(state.properties);
  const loaded = deserializeProperties(saved);
  assert(loaded.owned['old-town-flat'], 'ownership survives');
  assertEq(loaded.rent['old-town-flat'], 60, 'rent survives');
  assertEq(propertyHudLine(loaded).includes('Properties 1/8'), true, 'HUD line reads');
  assertEq(propertySummaryLines(loaded).length, 8, 'eight summary lines');
  assertEq(totalRentPerMinute(loaded), 60, 'portfolio rent $60/min');
  assertEq(propertyPortfolioValue(loaded), 2000, 'portfolio worth $2000');
});

// --- League ------------------------------------------------------------------

test('league: points by place and five rounds a season', () => {
  assertEq(pointsForPlace(1), 10, 'win pays 10');
  assertEq(pointsForPlace(2), 8, 'second pays 8');
  assertEq(pointsForPlace(5), 2, 'last pays 2');
  assertEq(pointsForPlace(9), 1, 'past the table pays 1');
  const league = createLeagueState();
  assertEq(nextLeagueCircuit(league).name, 'Marina Loop', 'season opens at Marina Loop');
  assertEq(isLeagueRound(league, 0), true, 'circuit 0 is the next round');
  assertEq(isLeagueRound(league, 1), false, 'circuit 1 is not yet');
});

test('league: a round pays points and moves the standings', () => {
  const state = makeState();
  const league = state.league;
  const report = recordLeagueRace(league, 0, [
    { name: 'Rico', time: 61.2 },
    { name: 'Ghost', time: 63.0 },
    { name: 'Marisol', time: 64.5 },
    { name: 'Turbo Tommy', time: 66.1 },
    { name: 'Vex', time: 68.0 },
  ], state);
  assertEq(report.playerPlace, 1, 'Rico won the round');
  assertEq(report.playerPoints, 10, 'win pays 10 points');
  assertEq(playerLeaguePoints(league), 10, '10 points on the board');
  assertEq(playerLeagueRank(league), 1, 'Rico leads');
  assertEq(leagueLeader(league).name, 'Rico', 'Rico is the leader');
  assertEq(nextLeagueCircuit(league).name, 'Downtown Dash', 'next round moves on');
  assertEq(pointsBehindLeader(league), 0, 'leader trails nobody');
});

test('league: a full season crowns a champion and pays the purse', () => {
  const state = makeState();
  const league = state.league;
  const rivals = ['Ghost', 'Marisol', 'Turbo Tommy', 'Vex'];
  let champion = null;
  for (let round = 0; round < 5; round += 1) {
    const results = [{ name: 'Rico', time: 60 + round }];
    rivals.forEach((name, i) => results.push({ name, time: 65 + round + i }));
    const report = recordLeagueRace(league, round, results, state);
    if (report.champion) champion = report.champion;
  }
  assertEq(champion, 'Rico', 'Rico takes the season');
  assertEq(state.player.money, 250 + LEAGUE_CHAMPION_PRIZE, 'champion purse paid');
  assertEq(league.season, 2, 'next season starts');
  assertEq(league.round, 0, 'rounds reset');
  assertEq(playerLeaguePoints(league), 0, 'points reset for the new season');
  assertEq(league.seasonsWon, 1, 'one season won');
  assertEq(league.champions.length, 1, 'champion on record');
  assert(titleStillOpen(league), 'a fresh season is wide open');
});

test('league: standings break ties by wins, and the HUD line reads', () => {
  const state = makeState();
  const league = state.league;
  recordLeagueRace(league, 0, [
    { name: 'Rico', time: 60 },
    { name: 'Ghost', time: 62 },
    { name: 'Turbo Tommy', time: 64 },
    { name: 'Vex', time: 66 },
    { name: 'Marisol', time: 68 },
  ], state);
  // Round 2: Vex wins slowly, Turbo 2nd, Ghost 3rd, Rico 4th — four
  // racers end on 14 points, but Rico has a win and the fastest best
  // time of the tied winners.
  recordLeagueRace(league, 1, [
    { name: 'Vex', time: 63 },
    { name: 'Turbo Tommy', time: 65 },
    { name: 'Ghost', time: 67 },
    { name: 'Rico', time: 69 },
    { name: 'Marisol', time: 71 },
  ], state);
  const standings = leagueStandings(league);
  assertEq(standings[0].name, 'Rico', 'tied on points, Rico leads on wins');
  assertEq(playerLeagueRank(league), 1, 'Rico first');
  assert(leagueHudLine(league).includes('1st'), 'HUD shows the rank');
  assertEq(serializeLeague(league).season, 1, 'season survives');
  assertEq(deserializeLeague(serializeLeague(league)).season, 1, 'league round-trips');
});


test('league: finishing order builds from a race result', () => {
  const race = {
    rivals: [
      { name: 'Ghost', finished: true, finishTime: 63.0 },
      { name: 'Vex', finished: false, finishTime: null },
    ],
  };
  const results = buildLeagueResults(race, 61.2);
  assertEq(results[0].name, 'Rico', 'Rico first on time');
  assertEq(results[1].name, 'Ghost', 'Ghost second');
  assertEq(results[2].name, 'Vex', 'unfinished last');
  assertEq(results.length, 3, 'three entries');
});

// --- Traffic AI --------------------------------------------------------------

test('traffic: five personalities with distinct speeds', () => {
  assertEq(TRAFFIC_PERSONALITIES.length, 5, 'five personalities');
  const ids = TRAFFIC_PERSONALITIES.map((p) => p.id);
  assertEq(new Set(ids).size, 5, 'ids unique');
  for (const p of TRAFFIC_PERSONALITIES) {
    assert(personalityById(p.id) === p, `${p.id} looks up`);
    assert(p.cruise > 0 && p.weight > 0, `${p.id} has a cruise multiplier and a weight`);
  }
  assert(personalityById('speeder').cruise > personalityById('truck').cruise, 'speeders cruise faster than trucks');
  assertEq(pickPersonality(createRandom(42)), pickPersonality(createRandom(42)), 'personality pick is deterministic');
  assert(ids.includes(pickPersonality(createRandom(7))), 'pick returns a known id');
});


test('traffic: rush hour multiplies density, night thins it out', () => {
  assertEq(rushHourFactor(8), 1.8, 'morning rush');
  assertEq(rushHourFactor(18), 1.6, 'evening rush');
  assertEq(rushHourFactor(3), 0.5, 'dead of night');
  assertEq(rushHourFactor(12), 1.3, 'midday lunch traffic');
  assertEq(rushHourFactor(10), 1, 'late morning is normal');
  assert(isRushHour(8), '8:00 is rush hour');
  assert(!isRushHour(3), '3:00 is not');
  assert(trafficDensityForHour(8, 8) > trafficDensityForHour(8, 3), 'rush hour is busier than night');
  assertEq(trafficDensityForHour(8, 8), 14, 'rush hour density 14');
  assertEq(trafficDensityForHour(8, 3), 4, 'night density 4');
});


test('traffic: cars get personalities and cruise inside their band', () => {
  const state = makeState();
  for (const car of state.traffic) assignTrafficPersonality(car, createRandom(7));
  for (const car of state.traffic) {
    assert(typeof car.personality === 'string', 'car has a personality id');
    assert(trafficPersonality(car).id === car.personality, 'personality looks up');
    assert(car.cruise > 0, 'car has a cruise speed');
    assert(car.rage === 0, 'car starts calm');
  }
  const ai = stepTrafficSystem(state.trafficAI, state.traffic, 1, createRandom(2), state);
  assert(typeof ai.raging === 'number', 'system counts raging drivers');
  assert(Array.isArray(ai.jams), 'system reports jams');
});


test('traffic: a near miss provokes road rage, then the driver calms down', () => {
  const state = makeState();
  const car = state.traffic[0];
  car.personality = 'speeder';
  car.rage = 0;
  assert(!isRoadRaging(car), 'calm at first');
  const hit = trafficNearMiss(state.trafficAI, state.traffic, car.x, car.y);
  assert(hit === car, 'near miss finds the car');
  assertEq(state.trafficAI.nearMisses, 1, 'near miss counted');
  assert(roadRageLevel(car) > 0, 'near miss provokes some rage');
  assert(!isRoadRaging(car), 'a single near miss does not make a rager');
  provokeDriver(car, 100);
  assert(isRoadRaging(car), 'a hard shove makes the driver rage');
  assertEq(honkAt(car, createRandom(5)), true, 'a raging driver honks back');
  stepTrafficSystem(state.trafficAI, state.traffic, 45, createRandom(3), state);
  assert(!isRoadRaging(car), 'rage cools after 45 seconds of open road');
});


test('traffic: a jam is three slow cars close together', () => {
  const state = makeState();
  const cars = state.traffic.slice(0, 3);
  cars.forEach((c, i) => {
    c.x = 1000 + i * 30;
    c.y = 1000;
    c.speed = 10;
  });
  for (let i = 3; i < state.traffic.length; i += 1) {
    state.traffic[i].x = 3000;
    state.traffic[i].y = 2000;
    state.traffic[i].speed = 100;
  }
  const jams = findTrafficJams(state.traffic);
  assertEq(jams.length, 1, 'one jam found');
  assertEq(jams[0].cars, 3, 'three cars in the jam');
  assert(jams[0].x > 900 && jams[0].x < 1200, 'jam centred on the cluster');
  stepTrafficSystem(state.trafficAI, state.traffic, 1, createRandom(4), state);
  assert(trafficSummaryLines(state.traffic, state.trafficAI).some((l) => l.includes('jams right now: 1')), 'summary reports the jam');
});


test('traffic: stepTrafficSystem keeps the fleet moving without crashing', () => {
  const state = makeState();
  for (let i = 0; i < 10; i += 1) stepTrafficSystem(state.trafficAI, state.traffic, 1, createRandom(11), state);
  assertEq(state.traffic.length, 6, 'fleet size held');
  for (const car of state.traffic) {
    assert(Number.isFinite(car.x) && Number.isFinite(car.y), 'car position finite');
    assert(car.speed >= 0, 'speed never negative');
  }
});

// --- Day / night -------------------------------------------------------------

test('daynight: six phases map the whole clock', () => {
  assertEq(phaseForHour(23).id, 'night', 'late night');
  assertEq(phaseForHour(5.5).id, 'dawn', 'dawn');
  assertEq(phaseForHour(8).id, 'morning', 'morning');
  assertEq(phaseForHour(12).id, 'midday', 'midday');
  assertEq(phaseForHour(16).id, 'afternoon', 'afternoon');
  assertEq(phaseForHour(18.5).id, 'dusk', 'dusk');
  assertEq(currentPhase(createDayNightState()).id, 'morning', 'day starts in the morning');
  assertEq(phaseIdForHour(12), 'midday', 'id lookup');
  assert(streetlightsOn(22), 'streetlights on at night');
  assert(!streetlightsOn(12), 'streetlights off at midday');
});

test('daynight: the moon runs eight phases across the week', () => {
  assertEq(moonPhase(1), 'New Moon', 'day 1 is a new moon');
  assertEq(moonPhase(3), 'First Quarter', 'day 3 is first quarter');
  assertEq(moonPhase(5), 'Full Moon', 'day 5 is full');
  assertEq(moonPhase(9), 'New Moon', 'day 9 wraps the cycle');
  assert(dayNightHudLine(createDayNightState()).includes('Day 1'), 'HUD line reads');
});


test('daynight: nightlife pays at night and dries up at the workshop', () => {
  assertEq(nightlifeMultiplier(19.5, 'bar'), 1.5, 'bar booms after dark');
  assertEq(nightlifeMultiplier(12, 'bar'), 1, 'bar normal at noon');
  assertEq(nightlifeMultiplier(20, 'workshop'), 0.5, 'workshop quiet at night');
  assertEq(nightlifeMultiplier(12, 'workshop'), 1, 'workshop normal at noon');
});

test('daynight: events are known, forceable and shape the world', () => {
  assertEq(DAY_EVENTS.length, 5, 'five dynamic events');
  for (const event of DAY_EVENTS) {
    assert(eventById(event.id) === event, `${event.id} looks up`);
    assert(event.minDuration >= 60 && event.maxDuration <= 240, `${event.id} lasts one to four minutes`);
  }
  const dn = createDayNightState();
  forceEvent(dn, 'fogbank', 5);
  assert(isEventActive(dn), 'forced event is active');
  assertEq(eventEffect(dn).visibilityMul, 0.45, 'fog cuts visibility');
  assertEq(eventEffect(dn).policeMul, 0.7, 'fog blinds the cops a little');
  forceEvent(dn, 'stormsurge', 5);
  assertEq(eventEffect(dn).gripMul, 0.7, 'storm loosens grip');
  assertEq(eventEffect(dn).policeMul, 1.25, 'storm makes the cops keener');
  forceEvent(dn, 'heatwave', 5);
  assertEq(eventEffect(dn).staminaMul, 1.5, 'heat drains stamina');
});


test('daynight: stepping advances the clock and rolls events in and out', () => {
  const state = makeState();
  const dn = state.daynight;
  const events = stepDayNight(dn, state.weather, 360, createRandom(21));
  assert(events.length >= 1, 'a full day books at least one event');
  assert(dn.eventsSeen.length >= 1, 'event counter counts');
  const saved = serializeDayNight(dn);
  const loaded = deserializeDayNight(saved);
  assertEq(loaded.day, dn.day, 'day survives a save');
  assertEq(loaded.eventsSeen.length, dn.eventsSeen.length, 'event history survives a save');
  const total = Object.values(eventCounts(dn)).reduce((a, b) => a + b, 0);
  assertEq(total, dn.eventsSeen.length, 'counts match the history');
});


test('daynight: events schedule at dusk and night, not at noon', () => {
  const state = makeState();
  const dn = createDayNightState();
  dn.hour = 18.5;
  const started = scheduleEvent(dn, state.weather, createRandom(31));
  assert(started && typeof started.id === 'string', 'dusk schedules an event');
  assertEq(isEventActive(dn), true, 'event is active after scheduling');
  const noonPick = pickEventFor({ type: 'clear' }, 12, createRandom(32));
  assert(noonPick && noonPick.id !== 'fogbank' && noonPick.id !== 'nightchill', 'noon never picks fog or night chill');
  assert(pickEventFor({ type: 'clear' }, 19, createRandom(33)) !== null, 'night has an event to pick');
});


// --- Heat --------------------------------------------------------------------

test('heat: five districts track heat separately', () => {
  const heat = createHeatState();
  addHeat(heat, 600, 320, 30);
  assertEq(heatForDistrict(heat, 'Marina District'), 30, 'heat recorded in the marina');
  assertEq(heatForDistrict(heat, 'Downtown'), 0, 'downtown untouched');
  assertEq(hottestDistrict(heat).name, 'Marina District', 'marina is hottest');
  assert(coolestDistrict(heat).name !== 'Marina District', 'somewhere else is coolest');
  assertEq(heatWord(30), 'hot', '30 is hot');
  assertEq(heatWord(80), 'on fire', '80 is on fire');
  assertEq(heatWord(0), 'cold', '0 is cold');
  assertEq(heatWord(10), 'warm', '10 is warm');
  assertEq(heatWord(60), 'burning', '60 is burning');
});


test('heat: a wanted level heats the district Rico is standing in', () => {
  const state = makeState();
  teleport(state, 600, 320);
  addHeatForStars(state.heat, state, 2);
  assertEq(heatForDistrict(state.heat, 'Marina District'), 24, 'two stars add 24 heat in the marina');
  assertEq(heatMultiplier(state.heat, 600, 320).spawn, 1.24, '24 heat spawns 24% faster');
  addHeatForStars(state.heat, state, 3);
  assert(heatMultiplier(state.heat, 600, 320).spawn > 1.5, 'hot districts spawn much faster');
});


test('heat: heat decays while Rico stays quiet', () => {
  const state = makeState();
  assertEq(wantedDecayRate(state.heat, state), 1, 'quiet decay is the base rate');
  addHeat(state.heat, 600, 320, 60);
  state.wanted = 0;
  stepHeat(state.heat, state, 30);
  assertEq(heatForDistrict(state.heat, 'Marina District'), 57, 'quiet decays 6 per minute');
  assert(wantedDecayRate(state.heat, state) < 1, 'hot districts slow the wanted decay');
});


test('heat: a bribe knocks a star off and costs $150 a star', () => {
  const state = makeState();
  assertEq(bribeCost(state), null, 'no bribe at zero stars');
  state.wanted = 2;
  assertEq(bribeCost(state), 300, 'two stars cost $300');
  state.wanted = 5;
  assertEq(bribeCost(state), null, 'five stars cannot be bribed');
  state.wanted = 2;
  assert(typeof canBribe(state) === 'string' && canBribe(state).includes('300'), 'broke Rico cannot bribe');
  state.player.money = 500;
  assertEq(canBribe(state), null, 'a funded Rico can bribe');
  const report = payBribe(state, state.heat);
  assert(report.ok, 'bribe goes through');
  assertEq(state.wanted, 1, 'one star gone');
  assertEq(state.player.money, 200, 'bribe paid');
  assertEq(report.cost, 300, 'cost recorded');
});


test('heat: cool-down spots are where the map says they are', () => {
  assertEq(COOLDOWN_SPOTS.length, 5, 'five cool-down spots');
  const state = makeState();
  teleport(state, 500, 300);
  const spot = nearestCooldownSpot(500, 300);
  assert(spot !== null && spot.id === 'payphone-marina', 'a spot is at the marina payphone');
  assertEq(currentCooldownSpot(state).id, spot.id, 'standing in the spot reads');
  assertEq(nearestCooldownSpot(1600, 1200), null, 'the centre is not near a spot');
  assert(heatHudLine(createHeatState(), state) === '', 'no HUD line while the map is cold');
  addHeat(state.heat, 600, 320, 50);
  assert(heatHudLine(state.heat, state).includes('Marina District'), 'HUD names the hot district');
  assert(heatSummaryLines(state.heat).length >= 2, 'summary lists the districts');
  assertEq(serializeHeat(state.heat).districts['Marina District'], 50, 'heat saves');
  assertEq(deserializeHeat(serializeHeat(state.heat)).districts['Marina District'], 50, 'heat loads');
});


// --- Regression spot-checks on the rewritten systems -------------------------

test('regression: business renovations pay more per tick', () => {
  const state = makeState();
  state.player.money = 10000;
  teleport(state, 700, 340);
  assert(buyBusiness(state, 'safehouse'), 'safehouse buys at its door');
  assert(upgradeBusiness(state, 'safehouse'), 'renovation buys');
  stepBusinesses(state.business, state, 60);
  assert(state.business.till.safehouse > 45, 'renovated safehouse earns more than base');
  assertEq(canUpgradeBusiness(state, 'safehouse'), null, 'a second renovation is open');
});


test('regression: police labels and cruiser counts by stars', () => {
  assertEq(wantedLabel(0), 'Clean', 'clean');
  assertEq(wantedLabel(3), '3 stars — roadblocks ahead', 'three stars');
  assertEq(wantedLabel(5), '5 stars — the whole precinct', 'five stars');
  assertEq(cruisersForStars(0), 0, 'no cruisers clean');
  assertEq(cruisersForStars(3), 4, 'four cruisers at three stars');
  const state = makeState();
  addWanted(state, 2);
  assertEq(state.wanted, 2, 'wanted added');
});


console.log(`\nheadless5: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('failing:');
  for (const name of failures) console.log(`  - ${name}`);
  process.exitCode = 1;
}
