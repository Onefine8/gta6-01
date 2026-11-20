// Headless tests for the round-5 systems — run with: node tests/headless2.test.mjs
// No browser, no canvas: weather, weapons, minigames, missions 8-10 and
// radio are pure logic, so the whole set can be driven step by step here
// with a fake state shaped like the one main.js builds.
import { WORLD } from '../game/src/config.js';
import { createRandom } from '../game/src/random.js';
import { createCity, createParkedCars } from '../game/src/world.js';
import { createPlayer, enterCar, punch } from '../game/src/player.js';
import { createPedestrians, createTraffic } from '../game/src/vehicles.js';
import { addWanted, createPolice } from '../game/src/police.js';
import { createMissionState } from '../game/src/missions.js';
import {
  WEATHER_DEFS, WEATHER_TYPES, ambientLight, createWeatherState, effectiveWeather,
  forceWeather, forecastText, gripFactor, isFoggy, isNightHour, isRaining,
  isStorming, pickNextWeather, policeAggression, policeCanSee, policeSightRange,
  rainChanceNext, serializeWeather, deserializeWeather, setHour, stepWeather,
  timeOfDay, visibilityRange, weatherHudLine,
} from '../game/src/weather.js';
import {
  AMMO_BOX_ROUNDS, WEAPON_DEFS, WEAPON_PICKUP_SPOTS, accuracy, addAmmo, buyAmmo,
  buyWeapon, canBuyWeapon, canShoot, collectWeaponPickups, createWeaponsState,
  currentSpread, cycleWeapon, damageAtRange, equipWeapon, giveWeapon, hasWeapon,
  nearestWeaponPickup, needsReload, ownedWeaponCount, setAiming, aimSpeedFactor,
  shootFromPlayer, shootWeapon, startReload, stepWeapons, totalAmmo, weaponById,
  weaponHudLine, equippedWeapon,
} from '../game/src/weapons.js';
import {
  BET_MAX, BET_MIN, BET_RIVALS, COURIER_DROP_SECONDS, RANGE_ENTRY_FEE,
  VIGILANTE_FUGITIVES, canPlaceBet, canStartRange, checkVigilanteCatch,
  createMinigameState, minigameObjective, minigameSummaryLines, placeBet,
  quitCourier, quitVigilante, rangeAccuracy, rangeShoot, resolveBet,
  simulateBetRace, startCourier, startRange, startVigilante, stepMinigames,
  stepCourier, stepRange, stepVigilante,
} from '../game/src/minigames.js';
import {
  MISSION2_DEFS, MISSION2_STEP_KINDS, canStartMission2, completeMission2,
  createMission2State, currentStep2, mission2ObjectivePos, mission2Progress,
  mission2StepKindsKnown, mission2SummaryLines, objectiveText2, startMission2,
  stepMissions2,
} from '../game/src/missions2.js';
import {
  RADIO_STATIONS, createRadioState, currentStation, currentTrack, djBanter,
  findTrack, longestTrack, nextStation, nextTrack, prevStation, radioHudLine,
  radioSummaryLines, setStation, setVolume, shortestTrack, stationById,
  stationForGiver, stationPlaylistLength, stepRadio, suggestedStation,
  toggleMute, togglePlay, trackProgress, volumeDown, volumeUp,
  serializeRadio, deserializeRadio,
} from '../game/src/radio.js';

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

// A state shaped like main.js createState(), plus the round-5 slices.
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

function makeFullState(seed = 1234) {
  const state = makeState(seed);
  const { createWeatherState: makeWeather } = { createWeatherState };
  state.weather = makeWeather();
  state.weapons = createWeaponsState();
  state.minigames = createMinigameState();
  state.radio = createRadioState();
  return state;
}

function stepFor2(state, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) stepMissions2(state.missions2, state, STEP, {});
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

// A random that always rolls 0: every accuracy check passes, every pick
// takes the first candidate. Deterministic shooting for the tests.
const alwaysHit = () => 0;

// --- Weather ----------------------------------------------------------------

test('weather: starts clear at 09:30 in the morning', () => {
  const w = createWeatherState();
  assertEq(w.type, 'clear', 'starts clear');
  assertEq(w.hour, 9.5, 'starts at 09:30');
  assertEq(w.isNight, false, 'morning is not night');
  assertEq(w.day, 1, 'day one');
  assertEq(isRaining(w), false, 'clear sky does not rain');
  assertEq(timeOfDay(w.hour), 'morning', '09:30 is morning');
});

test('weather: the clock advances a full day and counts days', () => {
  const w = createWeatherState(23.5);
  const events = stepWeather(w, 360, createRandom(7));
  assertEq(w.day, 2, 'midnight rolls the day over');
  assert(events.some((e) => e.includes('Day 2')), 'day rollover announced');
});

test('weather: night falls on schedule and dawn breaks', () => {
  assert(isNightHour(22), '22:00 is night');
  assert(isNightHour(3), '03:00 is night');
  assert(!isNightHour(12), 'noon is not night');
  assert(!isNightHour(7), '07:00 is not night');
  const w = createWeatherState(19);
  stepWeather(w, 60, createRandom(7));
  assert(w.isNight, 'night after 19:30');
  setHour(w, 7);
  assert(!w.isNight, 'morning after setHour');
  assertEq(timeOfDay(7), 'morning', '07:00 is morning');
  assertEq(timeOfDay(18), 'dusk', '18:00 is dusk');
});

test('weather: all four conditions exist with sane numbers', () => {
  assertEq(WEATHER_TYPES.length, 4, 'four conditions');
  for (const type of WEATHER_TYPES) {
    const def = WEATHER_DEFS[type];
    assert(def.visibility > 0, `${type} has visibility`);
    assert(def.grip > 0 && def.grip <= 1, `${type} grip in range`);
    assert(def.policeSight > 0, `${type} has police sight`);
  }
  assert(WEATHER_DEFS.storm.grip < WEATHER_DEFS.rain.grip, 'storm slicker than rain');
  assert(WEATHER_DEFS.fog.visibility < WEATHER_DEFS.clear.visibility, 'fog blinds');
  assert(WEATHER_DEFS.clear.grip === 1, 'clear roads have full grip');
});

test('weather: fog cuts visibility and police sight more than rain', () => {
  const w = createWeatherState();
  const clearVis = visibilityRange(w);
  const clearSight = policeSightRange(w);
  forceWeather(w, 'fog', createRandom(3));
  stepWeather(w, 9, createRandom(3));
  assertEq(w.type, 'fog', 'fog settles');
  assert(visibilityRange(w) < clearVis * 0.5, 'fog halves visibility');
  assert(policeSightRange(w) < clearSight * 0.6, 'fog shrinks police sight');
  assert(isFoggy(w), 'foggy flag on');
  assert(policeAggression(w) < 1, 'police hang back in fog');
});

test('weather: a forced storm blends in, rains, and throws lightning', () => {
  const w = createWeatherState();
  assert(forceWeather(w, 'storm', createRandom(5)), 'storm forced');
  assertEq(w.blend, 0, 'blend starts at zero');
  stepWeather(w, 4, createRandom(5));
  assert(w.blend > 0 && w.blend < 1, 'blend halfway');
  assert(gripFactor(w) < 1, 'grip already dropping mid-blend');
  stepWeather(w, 20, createRandom(5));
  assertEq(w.type, 'storm', 'storm settles');
  assert(isStorming(w), 'storming flag on');
  assert(isRaining(w), 'storm rains');
  assert(w.strikes >= 1, 'lightning struck during the storm');
  assert(w.flash >= 0, 'flash tracked');
  assert(rainChanceNext(w) >= 0 && rainChanceNext(w) <= 1, 'rain chance is a probability');
});

test('weather: night shortens visibility and dims the light', () => {
  const day = createWeatherState(12);
  const night = createWeatherState(23);
  assert(visibilityRange(night) < visibilityRange(day), 'night sees less far');
  assert(ambientLight(night) < ambientLight(day), 'night is darker');
  assert(ambientLight(night) >= 0.12, 'night never goes pitch black');
});

test('weather: police spot Rico closer in fog, further when a heli watches', () => {
  const w = createWeatherState();
  forceWeather(w, 'fog', createRandom(3));
  stepWeather(w, 9, createRandom(3));
  assert(!policeCanSee(w, 600, 320, 600, 700, false), 'cruiser 380 away cannot see through fog');
  assert(policeCanSee(w, 600, 320, 600, 500, false), 'cruiser 180 away can see');
  assert(policeCanSee(w, 600, 320, 600, 900, true), 'heli sees through anything');
});

test('weather: the next condition follows the transition table', () => {
  assertEq(pickNextWeather(() => 0.1, 'fog'), 'clear', 'fog usually lifts');
  assertEq(pickNextWeather(() => 0, 'clear'), 'clear', 'clear can hold');
  assertEq(pickNextWeather(() => 0.5, 'storm'), 'rain', 'storm usually breaks into rain');
  const w = createWeatherState();
  assert(forecastText(w).includes('Forecast'), 'forecast line reads');
  assert(weatherHudLine(w).includes('09:30'), 'HUD line shows the time');
});

test('weather: save and load round-trips the settled condition', () => {
  const w = createWeatherState();
  forceWeather(w, 'rain', createRandom(3));
  stepWeather(w, 9, createRandom(3));
  const saved = serializeWeather(w);
  const loaded = deserializeWeather(saved);
  assertEq(loaded.type, 'rain', 'rain survives the save');
  assertEq(loaded.hour, saved.hour, 'hour survives the save');
  assertEq(loaded.day, 1, 'day survives the save');
  assert(isRaining(loaded), 'loaded state rains');
});

// --- Weapons ----------------------------------------------------------------

test('weapons: four guns with unique ids and sane tuning', () => {
  assertEq(WEAPON_DEFS.length, 4, 'four guns');
  assertEq(new Set(WEAPON_DEFS.map((d) => d.id)).size, 4, 'gun ids unique');
  for (const def of WEAPON_DEFS) {
    assert(def.damage > 0 && def.range > 0, `${def.name} hits`);
    assert(def.magSize > 0 && def.fireRate > 0, `${def.name} fires`);
    assert(def.price > 0, `${def.name} priced`);
  }
  assert(weaponById('rifle').range > weaponById('shotgun').range, 'rifle outranges shotgun');
  assert(weaponById('smg').fireRate > weaponById('rifle').fireRate, 'SMG fires faster than rifle');
});

test('weapons: fists only until a gun is given or bought', () => {
  const state = makeFullState();
  assertEq(state.weapons.equipped, null, 'starts unarmed');
  assertEq(ownedWeaponCount(state.weapons), 0, 'owns nothing');
  assert(!canShoot(state.weapons), 'cannot shoot unarmed');
  assertEq(weaponHudLine(state.weapons), 'Fists (Q to punch)', 'HUD shows fists');
  assert(!setAiming(state.weapons, true), 'cannot aim unarmed');
});

test('weapons: buying needs cash and equips the gun', () => {
  const state = makeFullState();
  assert(canBuyWeapon(state, 'rifle').includes('$2500'), 'broke player sees the price');
  assert(!buyWeapon(state, 'rifle'), 'broke player cannot buy');
  state.player.money = 3000;
  assertEq(canBuyWeapon(state, 'rifle'), null, 'funded player can buy');
  assert(buyWeapon(state, 'rifle'), 'buy succeeds');
  assertEq(state.player.money, 500, 'price taken');
  assert(hasWeapon(state.weapons, 'rifle'), 'rifle owned');
  assertEq(state.weapons.equipped, 'rifle', 'rifle equipped');
  assertEq(totalAmmo(state.weapons, 'rifle'), 20, 'full mag plus a box of reserve');
  assert(!buyWeapon(state, 'rifle'), 'cannot buy twice');
});

test('weapons: a pistol shot hits the pedestrian in front of Rico', () => {
  const state = makeFullState();
  giveWeapon(state.weapons, 'pistol');
  const ped = state.peds[0];
  ped.x = state.player.x + 100;
  ped.y = state.player.y;
  state.player.angle = 0;
  const report = shootWeapon(state, state.player.x, state.player.y, 0, alwaysHit);
  assert(report.fired, 'shot fired');
  assertEq(report.hits, 1, 'one pellet hit');
  assert(report.damage > 0, 'damage done');
  assert(ped.health < 100, 'pedestrian hurt');
  assert(ped.fleeing, 'pedestrian flees the gunfire');
  assertEq(state.weapons.shotsFired, 1, 'shot counted');
  assertEq(state.weapons.inventory.pistol.mag, 11, 'one round spent');
  assertEq(accuracy(state.weapons), 1, 'perfect accuracy so far');
});

test('weapons: a shot at empty street fires but hits nothing', () => {
  const state = makeFullState();
  giveWeapon(state.weapons, 'pistol');
  for (const ped of state.peds) { ped.x = 3000; ped.y = 2300; }
  for (const car of state.traffic) { car.x = 3000; car.y = 2300; }
  const report = shootWeapon(state, state.player.x, state.player.y, 0, alwaysHit);
  assert(report.fired, 'shot fired');
  assertEq(report.hits, 0, 'nothing hit');
  assertEq(state.weapons.inventory.pistol.mag, 11, 'round still spent');
});

test('weapons: the cooldown blocks a second instant shot', () => {
  const state = makeFullState();
  giveWeapon(state.weapons, 'pistol');
  shootWeapon(state, state.player.x, state.player.y, 0, alwaysHit);
  const second = shootWeapon(state, state.player.x, state.player.y, 0, alwaysHit);
  assert(!second.fired, 'second shot blocked');
  assertEq(second.reason, 'cooling down', 'blocked by cooldown');
  stepWeapons(state.weapons, state, 1);
  const third = shootWeapon(state, state.player.x, state.player.y, 0, alwaysHit);
  assert(third.fired, 'shot fires again after the cooldown');
});

test('weapons: the shotgun fires six pellets up close', () => {
  const state = makeFullState();
  giveWeapon(state.weapons, 'shotgun');
  const ped = state.peds[0];
  ped.x = state.player.x + 60;
  ped.y = state.player.y;
  ped.health = 100;
  const report = shootWeapon(state, state.player.x, state.player.y, 0, alwaysHit);
  assert(report.fired, 'shotgun fired');
  assertEq(report.hits, 6, 'six pellets hit up close');
  assert(report.damage >= 90, `shotgun hurts up close, got ${report.damage}`);
  assert(ped.health <= 0, 'pedestrian down to a point-blank blast');
  assertEq(report.killed, 1, 'kill counted');
});

test('weapons: damage falls off with range and stops at the far edge', () => {
  const pistol = weaponById('pistol');
  assertEq(damageAtRange(pistol, 0), 34, 'full damage point blank');
  assert(damageAtRange(pistol, 210) < 34, 'half range hurts less');
  assertEq(damageAtRange(pistol, 420), 0, 'nothing past the range');
  assertEq(damageAtRange(pistol, 1000), 0, 'nothing far past the range');
});

test('weapons: an empty magazine auto-reloads from reserve', () => {
  const state = makeFullState();
  giveWeapon(state.weapons, 'pistol');
  state.weapons.inventory.pistol.mag = 1;
  state.weapons.inventory.pistol.reserve = 12;
  shootWeapon(state, state.player.x, state.player.y, 0, alwaysHit);
  assertEq(state.weapons.inventory.pistol.mag, 0, 'magazine empty');
  assert(needsReload(state.weapons), 'reload needed');
  stepWeapons(state.weapons, state, 0.5);
  assert(state.weapons.reloadTimer > 0, 'reload started');
  stepWeapons(state.weapons, state, 2);
  assertEq(state.weapons.inventory.pistol.mag, 12, 'magazine refilled');
  assertEq(state.weapons.inventory.pistol.reserve, 0, 'reserve spent');
});

test('weapons: reload does nothing with an empty reserve', () => {
  const state = makeFullState();
  giveWeapon(state.weapons, 'pistol');
  state.weapons.inventory.pistol.mag = 0;
  state.weapons.inventory.pistol.reserve = 0;
  assert(!startReload(state.weapons), 'no reload without reserve');
  const report = shootWeapon(state, state.player.x, state.player.y, 0, alwaysHit);
  assert(!report.fired, 'cannot fire an empty gun');
  assertEq(report.reason, 'magazine empty', 'empty reason');
});

test('weapons: ammo boxes cost $40 and add 24 rounds', () => {
  const state = makeFullState();
  giveWeapon(state.weapons, 'pistol');
  state.player.money = 30;
  assert(!buyAmmo(state, 'pistol'), 'broke player cannot buy ammo');
  state.player.money = 100;
  assert(buyAmmo(state, 'pistol'), 'ammo bought');
  assertEq(state.player.money, 60, 'box price taken');
  assertEq(state.weapons.inventory.pistol.reserve, 12 + AMMO_BOX_ROUNDS, 'reserve topped up');
  assert(addAmmo(state.weapons, 'pistol', 10), 'manual ammo add works');
});

test('weapons: cycling walks the owned guns and ends at fists', () => {
  const state = makeFullState();
  giveWeapon(state.weapons, 'pistol');
  giveWeapon(state.weapons, 'smg');
  assertEq(state.weapons.equipped, 'pistol', 'first gun equipped');
  assertEq(cycleWeapon(state.weapons), 'smg', 'cycles to SMG');
  assertEq(cycleWeapon(state.weapons), null, 'cycles past the last gun to fists');
  assertEq(state.weapons.equipped, null, 'holstered');
  assertEq(cycleWeapon(state.weapons), 'pistol', 'cycles back to the first gun');
  assert(!equipWeapon(state.weapons, 'rifle'), 'cannot equip an unowned gun');
  assert(equipWeapon(state.weapons, null), 'can holster by hand');
});

test('weapons: aiming slows Rico and tightens the spread', () => {
  const state = makeFullState();
  giveWeapon(state.weapons, 'rifle');
  const hip = currentSpread(state.weapons);
  assertEq(aimSpeedFactor(state.weapons), 1, 'full speed from the hip');
  setAiming(state.weapons, true);
  assertEq(aimSpeedFactor(state.weapons), 0.55, 'aiming slows the walk');
  assert(currentSpread(state.weapons) < hip, 'aiming tightens the spread');
  assert(weaponHudLine(state.weapons).includes('aiming'), 'HUD shows aiming');
});

test('weapons: pickups on the street arm Rico for free', () => {
  const state = makeFullState();
  assertEq(WEAPON_PICKUP_SPOTS.length, 5, 'five pickup spots');
  const spot = WEAPON_PICKUP_SPOTS[0];
  teleport(state, spot.x, spot.y);
  const got = collectWeaponPickups(state);
  assertEq(got, spot.weapon, 'pickup collected');
  assert(hasWeapon(state.weapons, spot.weapon), 'gun owned after pickup');
  assertEq(collectWeaponPickups(state), null, 'pickup is gone once taken');
  const pickup = state.weapons.pickups.find((p) => p.id === spot.id);
  assert(pickup.taken, 'pickup marked taken');
  stepWeapons(state.weapons, state, 121);
  assert(!pickup.taken, 'pickup respawns after two minutes');
});

test('weapons: shooting from a car is not allowed', () => {
  const state = makeFullState();
  giveWeapon(state.weapons, 'pistol');
  giveCar(state, 'Sunset Coupe');
  const report = shootFromPlayer(state, alwaysHit);
  assert(!report.fired, 'no drive-by shooting');
  assertEq(report.reason, 'in a car', 'blocked in a car');
});

test('weapons: the nearest pickup is findable by distance', () => {
  const state = makeFullState();
  const near = nearestWeaponPickup(state.weapons, 460, 1980);
  assert(near && near.id === 'dock-pistol', 'dock pistol is nearest');
  assertEq(nearestWeaponPickup(state.weapons, 1600, 1200), null, 'park centre has no pickup');
});

// --- Minigames --------------------------------------------------------------

test('minigames: a courier shift pays per drop and chains the next one', () => {
  const state = makeFullState();
  const c = state.minigames.courier;
  assert(startCourier(c, state, state.random), 'shift starts');
  assert(c.active, 'courier active');
  assert(c.pay >= 80, 'drop pays at least the base fee');
  teleport(state, c.dx, c.dy);
  const before = state.player.money;
  stepCourier(c, state, STEP, state.random);
  assertEq(c.drops, 1, 'one drop done');
  assert(state.player.money > before, 'drop paid');
  assert(c.active, 'next drop chained');
  assertEq(c.streak, 1, 'streak started');
});

test('minigames: a missed courier clock ends the shift', () => {
  const state = makeFullState();
  const c = state.minigames.courier;
  startCourier(c, state, state.random);
  stepCourier(c, state, COURIER_DROP_SECONDS + 1, state.random);
  assert(!c.active, 'shift over on timeout');
  assertEq(c.streak, 0, 'streak reset');
  assert(quitCourier(c, state) === false, 'cannot quit a finished shift');
});

test('minigames: a vigilante hunt spawns a fugitive worth a bounty', () => {
  const state = makeFullState();
  const v = state.minigames.vigilante;
  assert(startVigilante(v, state, state.random), 'hunt starts');
  assert(v.active, 'hunt active');
  assert(VIGILANTE_FUGITIVES.some((f) => f.name === v.name), 'fugitive is a known face');
  assert(v.bounty >= 300, 'bounty pays at least $300');
  const fugitive = state.peds.find((p) => p.fugitive);
  assert(fugitive, 'fugitive is on the street');
  assertEq(fugitive.health, VIGILANTE_FUGITIVES[0].health, 'first fugitive has first-fugitive health');
  assert(!startVigilante(v, state, state.random), 'cannot start a second hunt');
});

test('minigames: taking a fugitive down pays the bounty and spawns the next', () => {
  const state = makeFullState();
  const v = state.minigames.vigilante;
  startVigilante(v, state, state.random);
  const fugitive = state.peds.find((p) => p.fugitive);
  fugitive.health = 0;
  const before = state.player.money;
  const paid = checkVigilanteCatch(v, state);
  assertEq(paid, 300, 'first bounty pays $300');
  assertEq(state.player.money, before + 300, 'bounty in the pocket');
  assertEq(v.caught, 1, 'one caught');
  assertEq(v.earned, 300, 'earnings tracked');
  assert(v.active, 'the next fugitive is already running');
  assertEq(v.bounty, 400, 'second bounty is bigger');
});

test('minigames: a fugitive who runs the clock out escapes', () => {
  const state = makeFullState();
  const v = state.minigames.vigilante;
  startVigilante(v, state, state.random);
  stepVigilante(v, state, 91, state.random);
  assert(!v.active, 'hunt over');
  assertEq(v.escaped, 1, 'one escaped');
  assert(!state.peds.some((p) => p.fugitive), 'fugitive left the street');
  assert(quitVigilante(v, state) === false, 'cannot quit a finished hunt');
});

test('minigames: the shooting range charges entry and scores hits', () => {
  const state = makeFullState();
  const r = state.minigames.range;
  state.player.money = 30;
  assert(!startRange(r, state, state.random), 'broke player cannot enter');
  state.player.money = 500;
  assert(canStartRange(state) === null, 'funded player can enter');
  assert(startRange(r, state, state.random), 'round starts');
  assertEq(state.player.money, 450, 'entry fee taken');
  assert(r.active, 'round active');
  const upIndex = r.targets.findIndex((t) => t.up);
  assert(upIndex >= 0, 'a target is up');
  const points = rangeShoot(r, state, upIndex, true);
  assert(points > 0, 'hit scores points');
  assertEq(r.hits, 1, 'hit counted');
  assertEq(r.score, points, 'score tracks the hit');
  assertEq(rangeShoot(r, state, upIndex, true), 0, 'a downed target cannot be hit twice');
  assert(rangeAccuracy(r) > 0, 'accuracy tracked');
});

test('minigames: a range round pays the score when the clock runs out', () => {
  const state = makeFullState();
  const r = state.minigames.range;
  state.player.money = 500;
  startRange(r, state, state.random);
  const upIndex = r.targets.findIndex((t) => t.up);
  rangeShoot(r, state, upIndex, true);
  const score = r.score;
  stepRange(r, state, 61, state.random);
  assert(!r.active, 'round over');
  assertEq(state.player.money, 450 + score, 'score paid out');
  assertEq(r.best, score, 'best score recorded');
});

test('minigames: street bets take cash and resolve win or lose', () => {
  const state = makeFullState();
  const b = state.minigames.bets;
  assert(canPlaceBet(state, 'Nobody', 100).includes('no racer'), 'unknown racer rejected');
  assert(canPlaceBet(state, 'Ghost', 10).includes(`$${BET_MIN}`), 'tiny bet rejected');
  assert(canPlaceBet(state, 'Ghost', BET_MAX + 1).includes(`$${BET_MAX}`), 'huge bet rejected');
  state.player.money = 1000;
  assertEq(canPlaceBet(state, 'Ghost', 100), null, 'a fair bet is allowed');
  assert(placeBet(b, state, 'Ghost', 100), 'bet placed');
  assertEq(state.player.money, 900, 'stake taken');
  assert(!placeBet(b, state, 'Vex', 100), 'cannot stack a second bet');
  const result = resolveBet(b, state, state.random);
  assert(result && typeof result.winner === 'string', 'a winner is named');
  assert(BET_RIVALS.some((r) => r.name === result.winner), 'winner is a real racer');
  assertEq(b.placed, null, 'bet cleared');
  assertEq(b.won + b.lost, 1, 'one bet settled');
  if (result.won) assertEq(state.player.money, 900 + Math.round(100 * 1.8), 'favourite pays out');
  else assertEq(state.player.money, 900, 'loser keeps the stake lost');
});

test('minigames: the bet race is replayable from a seed', () => {
  const a = simulateBetRace(createRandom(42));
  const b = simulateBetRace(createRandom(42));
  assertEq(a, b, 'same seed, same winner');
});

test('minigames: the summary lines cover all four activities', () => {
  const state = makeFullState();
  const lines = minigameSummaryLines(state.minigames);
  assertEq(lines.length, 4, 'four summary lines');
  assert(lines[0].includes('Courier'), 'courier line');
  assert(lines[1].includes('Vigilante'), 'vigilante line');
  assert(lines[2].includes('range'), 'range line');
  assert(lines[3].includes('bets'), 'bets line');
  assertEq(minigameObjective(state.minigames), null, 'no objective when nothing is live');
});

// --- Missions 8-10 ----------------------------------------------------------

test('missions2: three missions with unique ids 8-10', () => {
  assertEq(MISSION2_DEFS.length, 3, 'three missions');
  const ids = MISSION2_DEFS.map((d) => d.id);
  assertEq(new Set(ids).size, 3, 'ids unique');
  assertEq(Math.min(...ids), 8, 'first id');
  assertEq(Math.max(...ids), 10, 'last id');
  assert(mission2StepKindsKnown(), 'every step kind is handled');
  for (const def of MISSION2_DEFS) {
    assert(def.steps.length >= 4, `${def.title} has steps`);
    assert(def.reward > 0, `${def.title} pays`);
    for (const s of def.steps) {
      assert(MISSION2_STEP_KINDS.has(s.kind), `${def.title}: unknown step kind ${s.kind}`);
      assert(s.x >= 0 && s.x <= WORLD.width, `${def.title}: step x in world`);
      assert(s.y >= 0 && s.y <= WORLD.height, `${def.title}: step y in world`);
    }
  }
});

test('missions2: the second arc stays locked until the first story is done', () => {
  const state = makeState();
  assert(canStartMission2(state, 0).includes('first story'), 'locked on a fresh save');
  state.missionsDone = 7;
  assertEq(canStartMission2(state, 0), null, 'open once the story is done');
  assert(canStartMission2(state, 9).includes('no such mission'), 'bad index rejected');
});

test('missions2: mission 8 runs the full storm job and pays $2500 plus clean bonus', () => {
  const state = makeState();
  state.missionsDone = 7;
  startMission2(state.missions2, 0);
  teleport(state, 360, 2060);
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.step, 1, 'at the market, steal step');
  giveCar(state, 'Harbor Van');
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.step, 2, 'van stolen');
  teleport(state, 2960, 2060);
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.step, 3, 'van delivered, escape step');
  state.wanted = 0;
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.index, 1, 'mission 8 done');
  assertEq(state.player.money, 250 + 2500 + 200, 'reward plus clean-delivery bonus');
  assertEq(state.missionsDone, 8, 'story counter counts the second arc');
});

test('missions2: mission 8 fails when the clock runs out', () => {
  const state = makeState();
  startMission2(state.missions2, 0);
  stepFor2(state, 211);
  assert(state.missions2.failed, 'mission failed on timeout');
  assert(!state.missions2.active, 'mission no longer active');
});

test('missions2: mission 8 fails when the delivery van is wrecked', () => {
  const state = makeState();
  startMission2(state.missions2, 0);
  teleport(state, 360, 2060);
  stepMissions2(state.missions2, state, STEP, {});
  giveCar(state, 'Harbor Van');
  stepMissions2(state.missions2, state, STEP, {});
  state.player.inCar.health = 0;
  teleport(state, 2960, 2060);
  stepMissions2(state.missions2, state, STEP, {});
  assert(state.missions2.failed, 'wrecked van fails the delivery');
});

test('missions2: mission 9 dealers spawn, shoot back, and go down', () => {
  const state = makeState();
  startMission2(state.missions2, 1);
  teleport(state, 2000, 400);
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.step, 1, 'shoot step starts at the warehouse');
  stepMissions2(state.missions2, state, STEP, {});
  const dealers = state.peds.filter((p) => p.dealer);
  assertEq(dealers.length, 3, 'three dealers');
  assert(objectiveText2(state.missions2).includes('(0/3)'), 'objective counts the dealers');
  // A dealer shoots back when Rico closes in on foot.
  state.player.x = dealers[0].x + 10;
  state.player.y = dealers[0].y;
  state.player.invulnerable = 0;
  const healthBefore = state.player.health;
  stepFor2(state, 3);
  assert(state.player.health < healthBefore, 'dealer lands a shot');
  // Put all three down by hand.
  for (const dealer of state.peds.filter((p) => p.dealer)) {
    dealer.health = 0;
  }
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.shootDown, 3, 'three dealers down');
  assertEq(state.missions2.step, 2, 'dealers down, crate step');
});

test('missions2: mission 9 runs the full arms deal and pays $5000', () => {
  const state = makeState();
  startMission2(state.missions2, 1);
  teleport(state, 2000, 400);
  stepMissions2(state.missions2, state, STEP, {});
  stepMissions2(state.missions2, state, STEP, {});
  for (const dealer of state.peds.filter((p) => p.dealer)) dealer.health = 0;
  stepMissions2(state.missions2, state, STEP, {});
  teleport(state, 2000, 520);
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.step, 3, 'crate taken, garage step');
  assertEq(state.wanted, 2, 'taking the crate draws two stars');
  teleport(state, 360, 360);
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.step, 4, 'crate delivered, escape step');
  state.wanted = 0;
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.index, 2, 'mission 9 done');
  assertEq(state.player.money, 250 + 5000, 'reward paid');
});

function punchDownEnforcer(state, guard) {
  for (let i = 0; i < 3; i += 1) {
    guard.fleeing = false;
    guard.fleeTimer = 0;
    state.player.x = guard.x - 10;
    state.player.y = guard.y;
    state.player.angle = 0;
    state.player.punchTimer = 0;
    state.player.punchComboTimer = 0;
    const hit = punch(state.player, state.peds);
    assert(hit === guard, 'punch lands on the vault guard');
  }
  assert(guard.health <= 0, 'vault guard down after three punches');
}

test('missions2: mission 10 guards spawn and go down to punches', () => {
  const state = makeState();
  startMission2(state.missions2, 2);
  teleport(state, 2800, 1200);
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.step, 1, 'fight step starts at the tower');
  stepMissions2(state.missions2, state, STEP, {});
  const guards = state.peds.filter((p) => p.enforcer);
  assertEq(guards.length, 4, 'four vault guards');
  const guard = guards[0];
  state.player.x = guard.x - 10;
  state.player.y = guard.y;
  state.player.angle = 0;
  state.player.punchTimer = 0;
  guard.fleeing = false;
  const hit = punch(state.player, state.peds);
  assert(hit === guard, 'punch hits the vault guard');
  assert(guard.health < 100, 'guard takes damage');
});

test('missions2: mission 10 runs the full last score and pays $12000 plus quiet bonus', () => {
  const state = makeState();
  startMission2(state.missions2, 2);
  teleport(state, 2800, 1200);
  stepMissions2(state.missions2, state, STEP, {});
  stepMissions2(state.missions2, state, STEP, {});
  for (const guard of state.peds.filter((p) => p.enforcer)) punchDownEnforcer(state, guard);
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.step, 2, 'guards down, vault step');
  assertEq(state.missions2.fightDown, 4, 'four guards down counted');
  teleport(state, 2800, 1000);
  stepFor2(state, 15);
  assertEq(state.missions2.step, 3, 'vault cracked');
  teleport(state, 2600, 1200);
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.step, 4, 'ledger taken, survive step');
  assertEq(state.wanted, 5, 'five stars on the spot');
  stepFor2(state, 21);
  assertEq(state.missions2.step, 5, 'survived the heat, escape step');
  state.wanted = 0;
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.index, 3, 'second arc complete');
  assertEq(state.player.money, 250 + 12000 + 1500, 'reward plus quiet bonus');
  assertEq(mission2Progress(state.missions2), 1, 'arc progress full');
});

test('missions2: a loud vault costs the quiet bonus', () => {
  const state = makeState();
  startMission2(state.missions2, 2);
  state.missions2.step = 3;
  state.missions2.heist.alarm = 95;
  teleport(state, 2600, 1200);
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.step, 4, 'ledger taken');
  state.wanted = 5;
  stepFor2(state, 21);
  state.wanted = 0;
  const before = state.player.money;
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.player.money - before, 12000, 'no quiet bonus when loud');
});

test('missions2: the survive step only counts while Rico is wanted', () => {
  const state = makeState();
  startMission2(state.missions2, 2);
  state.missions2.step = 4;
  state.wanted = 0;
  stepFor2(state, 10);
  assertEq(state.missions2.surviveTimer, 0, 'clock stalls with no heat');
  assertEq(state.missions2.step, 4, 'still surviving');
  state.wanted = 3;
  stepFor2(state, 21);
  assertEq(state.missions2.step, 5, 'heat survived, escape step');
});

test('missions2: the objective arrow and summary lines read right', () => {
  const state = makeState();
  assertEq(mission2ObjectivePos(state.missions2), null, 'no arrow when idle');
  startMission2(state.missions2, 0);
  const pos = mission2ObjectivePos(state.missions2);
  assert(pos && pos.x === 360 && pos.y === 2060, 'arrow points at Harbor Market');
  const lines = mission2SummaryLines(state.missions2);
  assertEq(lines.length, 3, 'three summary lines');
  assert(lines[0].includes('in progress'), 'first line shows the active job');
  assert(lines[1].includes('Storm Runner') === false, 'second line is the arms deal');
});

// --- Radio ------------------------------------------------------------------

test('radio: four stations, Bay FM first, with a DJ and a playlist each', () => {
  assertEq(RADIO_STATIONS.length, 4, 'four stations');
  assertEq(new Set(RADIO_STATIONS.map((s) => s.id)).size, 4, 'station ids unique');
  for (const s of RADIO_STATIONS) {
    assert(s.tracks.length >= 5, `${s.name} has a playlist`);
    assert(s.dj && s.banter.length >= 4, `${s.name} has a DJ with lines`);
    assert(stationPlaylistLength(s) > 0, `${s.name} playlist has length`);
  }
  const radio = createRadioState();
  assertEq(currentStation(radio).id, 'bayfm', 'Bay FM is first');
  assertEq(currentTrack(radio).title, 'Palmetto Sun', 'first track plays first');
  assertEq(stationById('rock').name, 'Palmetto Rock', 'station lookup by id');
});

test('radio: switching stations wraps around the dial', () => {
  const radio = createRadioState();
  assert(nextStation(radio), 'next station works');
  assertEq(currentStation(radio).id, 'rock', 'Rock is next');
  assertEq(radio.switches, 1, 'switch counted');
  assert(prevStation(radio), 'previous station works');
  assertEq(currentStation(radio).id, 'bayfm', 'back to Bay FM');
  assert(prevStation(radio), 'previous wraps');
  assertEq(currentStation(radio).id, 'neon', 'wraps to Neon Nights');
  assert(setStation(radio, 'talk'), 'set by id works');
  assertEq(currentStation(radio).id, 'talk', 'Harbor Talk tuned in');
  assert(!setStation(radio, 'nope'), 'bad station rejected');
  assert(!setStation(radio, 99), 'bad index rejected');
});

test('radio: tracks advance with time and roll into the next song', () => {
  const radio = createRadioState();
  stepRadio(radio, 100, createRandom(1));
  assertEq(currentTrack(radio).title, 'Palmetto Sun', 'still on the first track');
  const progress = trackProgress(radio);
  assertEq(Math.round(progress.elapsed), 100, 'track clock advances');
  assert(progress.fraction > 0.5, 'more than halfway through');
  stepRadio(radio, 100, createRandom(1));
  assertEq(currentTrack(radio).title, 'Boardwalk Lights', 'second track starts');
  assertEq(radio.tracksPlayed, 1, 'track change counted');
  assert(radio.history.length === 1, 'history records the finished track');
});

test('radio: switching away and back resumes the station playlist', () => {
  const radio = createRadioState();
  stepRadio(radio, 200, createRandom(1));
  assertEq(currentTrack(radio).title, 'Boardwalk Lights', 'second track playing');
  nextStation(radio);
  assertEq(currentStation(radio).id, 'rock', 'on Rock now');
  prevStation(radio);
  assertEq(currentStation(radio).id, 'bayfm', 'back on Bay FM');
  assertEq(currentTrack(radio).title, 'Boardwalk Lights', 'Bay FM resumes its own track');
});

test('radio: next track skips ahead and wraps the playlist', () => {
  const radio = createRadioState();
  assertEq(nextTrack(radio, createRandom(1)).title, 'Boardwalk Lights', 'skip works');
  for (let i = 0; i < 5; i += 1) nextTrack(radio, createRandom(1));
  assertEq(currentTrack(radio).title, 'Palmetto Sun', 'playlist wraps around');
});

test('radio: volume, mute and pause behave', () => {
  const radio = createRadioState();
  assertEq(radio.volume, 0.7, 'default volume');
  assertEq(volumeUp(radio), 0.8, 'volume up a step');
  assertEq(volumeDown(radio), 0.7, 'volume down a step');
  assertEq(setVolume(radio, 5), 1, 'volume caps at one');
  assertEq(setVolume(radio, -1), 0, 'volume floors at zero');
  assert(toggleMute(radio), 'muted');
  assert(radioHudLine(radio).includes('muted'), 'HUD shows muted');
  assert(!toggleMute(radio), 'unmuted');
  assert(!togglePlay(radio), 'paused');
  assert(radioHudLine(radio).includes('paused'), 'HUD shows paused');
  stepRadio(radio, 100, createRandom(1));
  assertEq(currentTrack(radio).title, 'Palmetto Sun', 'paused radio does not advance');
  assert(togglePlay(radio), 'playing again');
});

test('radio: the DJ talks between tracks', () => {
  const radio = createRadioState();
  const line = djBanter(radio, createRandom(2));
  assert(typeof line === 'string' && line.length > 10, 'banter line returned');
  assert(currentStation(radio).banter.includes(line), 'line belongs to this station');
  assertEq(radio.banterTimer, 5, 'banter shows for five seconds');
  stepRadio(radio, 6, createRandom(2));
  assert(radio.banterTimer <= 0, 'banter fades');
});

test('radio: suggestions fit the moment and the giver', () => {
  assertEq(suggestedStation({ isNight: true, hour: 23 }, 0), 'neon', 'neon after midnight');
  assertEq(suggestedStation({ isNight: false, hour: 8 }, 0), 'talk', 'talk in the morning');
  assertEq(suggestedStation({ isNight: false, hour: 12 }, 4), 'rock', 'rock for a getaway');
  assertEq(suggestedStation({ isNight: false, hour: 12 }, 0), 'bayfm', 'pop by day');
  assertEq(stationForGiver('Marina'), 'bayfm', 'Marina listens to Bay FM');
  assertEq(stationForGiver('Dante'), 'rock', 'Dante listens to Rock');
});

test('radio: track search finds songs across the dial', () => {
  const found = findTrack('Redline');
  assert(found && found.station === 'rock', 'Redline is on Rock');
  const byArtist = findTrack('DJ Mirage');
  assert(byArtist && byArtist.station === 'neon', 'DJ Mirage is on Neon Nights');
  assertEq(findTrack('no such song'), null, 'unknown song returns null');
  assertEq(findTrack(''), null, 'empty search returns null');
  const longest = longestTrack();
  const shortest = shortestTrack();
  assert(longest.track.duration >= shortest.track.duration, 'longest is longer than shortest');
});

test('radio: the HUD line and summary lines read right', () => {
  const radio = createRadioState();
  const hud = radioHudLine(radio);
  assert(hud.includes('Bay FM'), 'HUD names the station');
  assert(hud.includes('Palmetto Sun'), 'HUD names the track');
  const lines = radioSummaryLines(radio);
  assertEq(lines.length, 4, 'four summary lines');
  assert(lines[0].includes('tuned in'), 'first line shows the tuned station');
});

test('radio: save and load round-trips the tuned station', () => {
  const radio = createRadioState();
  setStation(radio, 'neon');
  stepRadio(radio, 50, createRandom(1));
  setVolume(radio, 0.4);
  const saved = serializeRadio(radio);
  const loaded = deserializeRadio(saved);
  assertEq(currentStation(loaded).id, 'neon', 'station survives the save');
  assertEq(loaded.volume, 0.4, 'volume survives the save');
  assertEq(loaded.tracksPlayed, radio.tracksPlayed, 'play count survives the save');
});

// --- Cross-system -----------------------------------------------------------

test('cross-system: rain makes the getaway harder and the radio fits the storm', () => {
  const state = makeFullState();
  forceWeather(state.weather, 'storm', state.random);
  stepWeather(state.weather, 9, state.random);
  assert(gripFactor(state.weather) < 0.7, 'storm roads are slick');
  assertEq(suggestedStation(state.weather, 0), 'bayfm', 'daytime storm still suggests pop');
  addWanted(state, 3);
  assertEq(suggestedStation(state.weather, state.wanted), 'rock', 'three stars suggests Rock');
});

test('cross-system: a courier drop in the fog still pays', () => {
  const state = makeFullState();
  forceWeather(state.weather, 'fog', state.random);
  stepWeather(state.weather, 9, state.random);
  const c = state.minigames.courier;
  startCourier(c, state, state.random);
  teleport(state, c.dx, c.dy);
  const before = state.player.money;
  stepMinigames(state.minigames, state, STEP, state.random);
  assertEq(c.drops, 1, 'drop done in the fog');
  assert(state.player.money > before, 'drop paid in the fog');
});

test('cross-system: shooting a dealer counts for mission 9', () => {
  const state = makeFullState();
  startMission2(state.missions2, 1);
  teleport(state, 2000, 400);
  stepMissions2(state.missions2, state, STEP, {});
  stepMissions2(state.missions2, state, STEP, {});
  giveWeapon(state.weapons, 'rifle');
  const dealer = state.peds.find((p) => p.dealer);
  dealer.health = 10;
  state.player.x = dealer.x - 100;
  state.player.y = dealer.y;
  state.player.angle = 0;
  const report = shootWeapon(state, state.player.x, state.player.y, 0, alwaysHit);
  assert(report.fired, 'rifle fired');
  assert(dealer.health <= 0, 'dealer shot down');
  stepMissions2(state.missions2, state, STEP, {});
  assertEq(state.missions2.shootDown, 1, 'shot dealer counts towards the step');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failing: ${failures.join(', ')}`);
  process.exit(1);
}
