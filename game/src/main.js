// Boot and the one loop for Palmetto Bay Heat. The game moves between title,
// play, paused, wasted and busted screens; the world advances in fixed 1/60 s
// steps. Progress (cash, missions, packages, best race) is saved to localStorage.
//
// ?shot=chase|walk|mission|night (with &seed=N) stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { FIELD, HEAL_COST, REPAIR_COST, SAVE_KEY, STEP, TIME, VEHICLE_MODELS, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createCity, createParkedCars, nearSite } from './world.js';
import { createPlayer, enterCar, exitCar, nearestCar, punch, stepPlayer } from './player.js';
import { createPedestrians, createTraffic, startleTraffic, stepDrivenCar, stepPedestrian, stepTrafficCar } from './vehicles.js';
import { addWanted, clearWanted, createPolice, stepPolice } from './police.js';
import { MISSION_DEFS, createMissionState, objectiveText, showMessage, startMission, startTaxi, stepMissions, stepTaxi, taxiObjective } from './missions.js';
import { MISSION2_DEFS, canStartMission2, createMission2State, mission2ObjectivePos, startMission2, stepMissions2 } from './missions2.js';
import { createWeatherState, stepWeather, weatherAsTime } from './weather.js';
import { canShoot, collectWeaponPickups, createWeaponsState, shootFromPlayer, stepWeapons } from './weapons.js';
import { createMinigameState, minigameObjective, stepMinigames } from './minigames.js';
import { createRadioState, stepRadio } from './radio.js';
import { RACE_CIRCUITS, canStartRace, createRaceState, currentRaceCheckpoint, nearestCircuit, startRace, stepRace } from './races.js';
import { BUSINESS_DEFS, buyBusiness, canBuyBusiness, collectBusiness, createBusinessState, nearestBusiness, nearestBusinessWithTill, stepBusinesses, totalTill } from './business.js';
import { ACTION_BUSINESS, ACTION_CONFIRM, ACTION_ENTER, ACTION_HELP, ACTION_MISSION, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_RACE, ACTION_REPAIR, ACTION_TAXI, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const city = createCity(random);

function createState() {
  const player = createPlayer(600, 320);
  const parkedCars = createParkedCars(random, city);
  // The Container Heist needs a hauler to steal: make sure one is parked by
  // the harbor yard, whatever the random draw gave the street.
  const hauler = VEHICLE_MODELS.find((m) => m.name === 'Container Hauler');
  if (hauler) {
    let nearest = null;
    let nearestD = Infinity;
    for (const car of parkedCars) {
      const d = Math.hypot(car.x - 500, car.y - 2050);
      if (d < nearestD) { nearestD = d; nearest = car; }
    }
    if (nearest) {
      nearest.model = hauler.name;
      nearest.color = hauler.color;
      nearest.topSpeed = hauler.top;
    }
  }
  const state = {
    player,
    city,
    parkedCars,
    traffic: createTraffic(random, 14),
    peds: createPedestrians(random, 26),
    police: createPolice(),
    missions: createMissionState(),
    missions2: createMission2State(),
    weather: createWeatherState(),
    weapons: createWeaponsState(),
    minigames: createMinigameState(),
    radio: createRadioState(),
    race: createRaceState(),
    business: createBusinessState(),
    missionsDone: 0,
    time: { hour: TIME.startHour, isNight: false, raining: false },
    elapsed: 0,
    wanted: 0,
    wantedTimer: 26,
    busted: false,
    wasted: false,
    bailCost: 150,
    objectivePos: null,
    weatherTimer: 40,
    saveTimer: 0,
    // New in this round: a short event feed for the HUD, run stats, the help
    // overlay flag, a pending-steal flag for mission 1, and near-miss timing.
    feed: [],
    stats: { earned: 0, nearMiss: 0, taxis: 0, racesWon: 0 },
    helpOpen: false,
    pendingSteal: false,
    nearMissCooldown: 0,
    hornCooldown: 0,
    skidCooldown: 0,
  };
  return state;
}

function pushFeed(state, text) {
  state.feed.push(text);
  if (state.feed.length > 6) state.feed.shift();
}

const state = createState();
const renderer = createRenderer(canvas);
const audio = createAudio();
// Debug/testing handle: lets an automated play-test read the live state.
window.__game = state;

function saveGame() {
  try {
    const taken = state.city.packages.map((p) => (p.taken ? 1 : 0));
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.player.money,
      missionsDone: state.missionsDone,
      missionIndex: state.missions.index,
      packages: taken,
      raceBest: state.race.best,
      raceWins: state.race.wins,
      business: { owned: state.business.owned, till: state.business.till },
      weather: { type: state.weather.type, hour: state.weather.hour, day: state.weather.day },
      weapons: { equipped: state.weapons.equipped, shotsFired: state.weapons.shotsFired, shotsHit: state.weapons.shotsHit, kills: state.weapons.kills },
      minigames: { courier: state.minigames.courier.drops, vigilante: state.minigames.vigilante.caught, rangeBest: state.minigames.range.best },
      missions2Index: state.missions2.index,
      radioStation: state.radio.stationIndex,
      health: state.player.health,
      stats: state.stats,
    }));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
}

function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.money === 'number') state.player.money = data.money;
    if (typeof data.missionsDone === 'number') {
      state.missionsDone = data.missionsDone;
      state.missions.index = Math.min(data.missionIndex ?? data.missionsDone, MISSION_DEFS.length);
    }
    if (Array.isArray(data.packages)) {
      state.city.packages.forEach((p, i) => { p.taken = data.packages[i] === 1; });
      state.missions.packagesFound = state.city.packages.filter((p) => p.taken).length;
    }
    if (Array.isArray(data.raceBest)) state.race.best = data.raceBest.slice(0, RACE_CIRCUITS.length);
    else if (typeof data.raceBest === 'number') state.race.best = [data.raceBest, ...RACE_CIRCUITS.slice(1).map(() => null)];
    if (typeof data.raceWins === 'number') state.race.wins = data.raceWins;
    if (data.business && typeof data.business === 'object') {
      if (data.business.owned && typeof data.business.owned === 'object') {
        for (const b of BUSINESS_DEFS) {
          if (data.business.owned[b.id]) state.business.owned[b.id] = true;
        }
      }
      if (data.business.till && typeof data.business.till === 'object') {
        for (const b of BUSINESS_DEFS) {
          if (typeof data.business.till[b.id] === 'number') state.business.till[b.id] = data.business.till[b.id];
        }
      }
    }
    if (typeof data.health === 'number') state.player.health = data.health;
    if (typeof data.missions2Index === 'number') state.missions2.index = Math.max(0, Math.min(MISSION2_DEFS.length, data.missions2Index));
    if (typeof data.radioStation === 'number') state.radio.stationIndex = Math.max(0, Math.min(3, data.radioStation));
    if (data.weather && typeof data.weather === 'object') {
      if (typeof data.weather.hour === 'number') state.weather.hour = data.weather.hour;
      if (typeof data.weather.day === 'number') state.weather.day = data.weather.day;
    }
    if (data.weapons && typeof data.weapons === 'object') {
      if (typeof data.weapons.shotsFired === 'number') state.weapons.shotsFired = data.weapons.shotsFired;
      if (typeof data.weapons.shotsHit === 'number') state.weapons.shotsHit = data.weapons.shotsHit;
      if (typeof data.weapons.kills === 'number') state.weapons.kills = data.weapons.kills;
    }
    if (data.stats && typeof data.stats === 'object') state.stats = { ...state.stats, ...data.stats };
  } catch {
    // A corrupt save is ignored; a fresh game starts instead.
  }
}

function updateObjectivePos() {
  const m = state.missions;
  if (state.race.active) {
    state.objectivePos = currentRaceCheckpoint(state.race);
    return;
  }
  // The second arc owns the arrow while it runs.
  if (state.missions2.active) {
    state.objectivePos = mission2ObjectivePos(state.missions2);
    return;
  }
  if (!m.active || m.index >= MISSION_DEFS.length) {
    const taxi = taxiObjective(m);
    if (taxi) {
      state.objectivePos = { x: taxi.x, y: taxi.y };
      return;
    }
    // A live side job (courier drop, vigilante hunt) owns the arrow next.
    const side = minigameObjective(state.minigames);
    if (side) {
      state.objectivePos = { x: side.x, y: side.y };
      return;
    }
    // Free roam with money waiting: point at the nearest owned business
    // whose till is worth the drive.
    if (totalTill(state.business) >= 200) {
      const px = state.player.inCar ? state.player.inCar.x : state.player.x;
      const py = state.player.inCar ? state.player.inCar.y : state.player.y;
      const biz = nearestBusinessWithTill(state.business, px, py);
      state.objectivePos = biz ? { x: biz.x, y: biz.y } : null;
      return;
    }
    state.objectivePos = null;
    return;
  }
  const step = MISSION_DEFS[m.index].steps[m.step];
  if (!step || step.kind === 'escape') { state.objectivePos = null; return; }
  state.objectivePos = { x: step.x, y: step.y };
}

function updateTime(dt) {
  // The weather module owns the clock now: it advances the hour, flips
  // night, and rolls the weather dice. state.time stays the old shape
  // ({ hour, isNight, raining }) so driving and police keep reading it.
  const events = stepWeather(state.weather, dt, random);
  state.time = weatherAsTime(state.weather);
  for (const event of events) showMessage(state.missions, event, 3);
}

function stepWorld(dt, input) {
  const events = { stolenCar: state.pendingSteal };
  state.pendingSteal = false;
  state.elapsed += dt;
  updateTime(dt);
  const player = state.player;

  if (player.inCar) {
    const car = player.inCar;
    stepDrivenCar(car, input, dt, city, [...state.parkedCars, ...state.traffic, ...state.police.cars], state.time);
    state.skidCooldown -= dt;
    if (car.drifting && state.skidCooldown <= 0) {
      state.skidCooldown = 0.35;
      audio.skid();
    }
    // Horn (held): toot, and startle nearby traffic into a burst of speed.
    state.hornCooldown -= dt;
    if (input.horn() && state.hornCooldown <= 0) {
      state.hornCooldown = 0.8;
      audio.horn();
      startleTraffic(state.traffic, car.x, car.y, 260);
    }
    // Near-miss bonus: flashing past a traffic car at speed pays $25.
    state.nearMissCooldown -= dt;
    if (Math.abs(car.speed) > 300 && state.nearMissCooldown <= 0) {
      for (const other of state.traffic) {
        const d = Math.hypot(other.x - car.x, other.y - car.y);
        if (d > 46 && d < 72) {
          state.nearMissCooldown = 3;
          state.stats.nearMiss += 1;
          player.money += 25;
          state.stats.earned += 25;
          audio.pickup();
          pushFeed(state, 'Near miss  +$25');
          showMessage(state.missions, 'Near miss! +$25', 2);
          break;
        }
      }
    }
    // Running over a pedestrian at speed draws the law.
    for (const ped of state.peds) {
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 34 && Math.abs(car.speed) > 140) {
        ped.fleeing = true;
        ped.fleeTimer = 5;
        addWanted(state, 1);
        audio.crash();
      }
    }
    if (car.health <= 0) {
      state.wasted = true;
      player.health = 0;
    }
  } else {
    stepPlayer(player, input, dt, city);
  }
  for (const car of state.traffic) stepTrafficCar(car, dt, random, [...state.traffic, ...state.police.cars, ...(state.player.inCar ? [state.player.inCar] : [])]);
  for (const ped of state.peds) stepPedestrian(ped, dt, random, city, player);
  stepPolice(state.police, state, dt, random);
  stepMissions(state.missions, state, dt, events);
  stepMissions2(state.missions2, state, dt, events);
  stepWeapons(state.weapons, state, dt);
  collectWeaponPickups(state);
  stepMinigames(state.minigames, state, dt, random);
  stepRadio(state.radio, dt, random);
  stepRace(state.race, state, dt, random);
  stepTaxi(state.missions, state, dt);
  stepBusinesses(state.business, state, dt);
  updateObjectivePos();

  // Hidden packages: walk or drive over one to collect it ($100 each).
  for (const p of state.city.packages) {
    if (p.taken) continue;
    const px = player.inCar ? player.inCar.x : player.x;
    const py = player.inCar ? player.inCar.y : player.y;
    if (Math.hypot(p.x - px, p.y - py) < 30) {
      p.taken = true;
      state.missions.packagesFound += 1;
      player.money += 100;
      audio.pickup();
      showMessage(state.missions, `Hidden package found! ${state.missions.packagesFound}/12  +$100`, 3);
      saveGame();
    }
  }
  if (state.missions.done) {
    state.missionsDone = Math.max(state.missionsDone, state.missions.index);
    state.missions.done = false;
    audio.fanfare();
    saveGame();
  }
  if (state.missions2.done) {
    state.missionsDone = Math.max(state.missionsDone, 7 + state.missions2.index);
    state.missions2.done = false;
    audio.fanfare();
    saveGame();
  }
  // Standing in the hospital zone patches Rico up for free, slowly.
  if (!player.inCar && nearSite('hospital', player.x, player.y) && player.health < 100) {
    player.health = Math.min(100, player.health + 6 * dt);
  }
  if (state.busted) {
    state.bailCost = 150;
    player.money = Math.max(0, player.money - state.bailCost);
    clearWanted(state, state.police);
    state.missions.taxi.active = false;
    state.race.active = false;
    state.race.rivals = [];
    player.x = 600;
    player.y = 320;
    if (player.inCar) { player.inCar.driver = null; player.inCar = null; }
    player.health = 100;
    state.busted = false;
    state.wasted = false;
    return 'busted';
  }
  if (state.wasted) return 'wasted';
  state.saveTimer += dt;
  if (state.saveTimer > 10) { state.saveTimer = 0; saveGame(); }
  audio.setEngine(player.inCar ? player.inCar.speed : 0, !!player.inCar);
  audio.siren(state.police.cars.length > 0);
  audio.setHeli(!!state.police.heli);
  return null;
}

function runShot(name) {
  const scene = stageShot(name, state, random);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, 0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  loadGame();
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.click();
    state.wasted = false;
    state.busted = false;
    if (state.player.health <= 0) state.player.health = 100;
    screen = SCREEN_PLAY;
    announce(`Playing in Palmetto Bay. ${objectiveText(state.missions)}`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    // The help overlay (play screen only) eats every key except H / P to close.
    if (state.helpOpen && screen === SCREEN_PLAY) {
      if (actions & (ACTION_HELP | ACTION_PAUSE)) {
        state.helpOpen = false;
        announce('Playing.');
      }
      return;
    }
    if ((actions & ACTION_HELP) && screen === SCREEN_PLAY) {
      state.helpOpen = true;
      announce('Help open. Press H to close.');
      return;
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) { screen = SCREEN_PLAY; announce('Playing.'); }
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      saveGame();
      announce('Paused.');
      return;
    }
    if (actions & ACTION_MISSION) {
      const m = state.missions;
      if (!m.active && m.index < MISSION_DEFS.length) {
        startMission(m, m.index);
        audio.click();
        announce(`${MISSION_DEFS[m.index].title} started.`);
      } else if (m.failed) {
        startMission(m, m.index);
        announce('Mission restarted.');
      } else if (!m.active && m.index >= MISSION_DEFS.length) {
        // First story done: M opens the second arc (missions 8-10).
        const m2 = state.missions2;
        if (!m2.active && m2.index < MISSION2_DEFS.length) {
          const whyNot = canStartMission2(state, m2.index);
          if (whyNot) {
            showMessage(m, whyNot, 4);
          } else {
            startMission2(m2, m2.index);
            audio.click();
            announce(`${MISSION2_DEFS[m2.index].title} started.`);
          }
        } else if (m2.failed) {
          startMission2(m2, m2.index);
          announce('Mission restarted.');
        }
      }
    }
    if (actions & ACTION_RACE) {
      const px = state.player.inCar ? state.player.inCar.x : state.player.x;
      const py = state.player.inCar ? state.player.inCar.y : state.player.y;
      const circuit = nearestCircuit(px, py);
      if (state.race.active) {
        showMessage(state.missions, 'You are already racing — reach the last checkpoint!', 3);
      } else if (circuit < 0) {
        const names = RACE_CIRCUITS.map((c) => c.name).join(', ');
        showMessage(state.missions, `Races start at the checkered flags — ${names}. Drive to one and press R.`, 5);
      } else {
        const whyNot = canStartRace(state, circuit);
        if (whyNot) {
          showMessage(state.missions, whyNot, 4);
        } else {
          const fee = RACE_CIRCUITS[circuit].entryFee;
          if (startRace(state.race, state, circuit, random)) {
            pushFeed(state, `Entered ${RACE_CIRCUITS[circuit].name}  -$${fee}`);
            audio.click();
          }
        }
      }
    }
    if (actions & ACTION_TAXI) {
      if (!state.missions.taxi.active) {
        startTaxi(state.missions, state, random);
        audio.click();
      } else {
        showMessage(state.missions, 'You already have a fare — finish it first.', 3);
      }
    }
    if (actions & ACTION_BUSINESS) {
      // Buy a business at its front door, or collect the takings from one
      // Rico already owns. Each business keeps its own till, so Rico
      // collects them one stop at a time.
      const px = state.player.inCar ? state.player.inCar.x : state.player.x;
      const py = state.player.inCar ? state.player.inCar.y : state.player.y;
      const biz = nearestBusiness(px, py);
      if (!biz) {
        const names = BUSINESS_DEFS.map((b) => b.name).join(', ');
        showMessage(state.missions, `Businesses for sale: ${names}. Stand at one's front door and press B.`, 5);
      } else if (state.business.owned[biz.id]) {
        const amount = collectBusiness(state, biz.id);
        if (amount > 0) {
          audio.pickup();
          pushFeed(state, `Collected ${biz.name} takings  +$${amount}`);
          showMessage(state.missions, `Collected $${amount} from the ${biz.name}.`, 4);
          saveGame();
        } else {
          showMessage(state.missions, `The ${biz.name} till is empty — it pays every minute.`, 3);
        }
      } else {
        const whyNot = canBuyBusiness(state, biz.id);
        if (whyNot) {
          showMessage(state.missions, whyNot, 4);
        } else if (buyBusiness(state, biz.id)) {
          audio.fanfare();
          pushFeed(state, `Bought the ${biz.name}  -$${biz.price}`);
          showMessage(state.missions, `You own the ${biz.name} now — it earns $${biz.income} a minute. Press B here to collect.`, 5);
          saveGame();
        }
      }
    }
    if (actions & ACTION_REPAIR) {
      const player = state.player;
      if (player.inCar && nearSite('garage', player.inCar.x, player.inCar.y)) {
        if (player.inCar.health >= 100) {
          showMessage(state.missions, 'This car is already in perfect shape.', 2);
        } else if (player.money < REPAIR_COST) {
          showMessage(state.missions, `Repairs cost $${REPAIR_COST} — you cannot afford it yet.`, 3);
        } else {
          player.money -= REPAIR_COST;
          player.inCar.health = 100;
          audio.repair();
          pushFeed(state, `Car repaired  -$${REPAIR_COST}`);
          showMessage(state.missions, 'Marina Garage patched the car up — good as new.', 3);
        }
      } else if (!player.inCar && nearSite('hospital', player.x, player.y)) {
        if (player.health >= 100) {
          showMessage(state.missions, 'You are already at full health.', 2);
        } else if (player.money < HEAL_COST) {
          showMessage(state.missions, `Treatment costs $${HEAL_COST} — you cannot afford it yet.`, 3);
        } else {
          player.money -= HEAL_COST;
          player.health = 100;
          audio.repair();
          pushFeed(state, `Patched up at Bay General  -$${HEAL_COST}`);
          showMessage(state.missions, 'Bay General patched you up — full health.', 3);
        }
      } else {
        showMessage(state.missions, 'Repairs happen at Marina Garage; healing at Bay General.', 3);
      }
    }
    if (actions & ACTION_ENTER) {
      const player = state.player;
      if (player.inCar) {
        exitCar(player);
      } else {
        const car = nearestCar(player, state.parkedCars, 70);
        if (car) {
          const result = enterCar(player, car);
          audio.click();
          if (result === 'stolen') {
            state.pendingSteal = true;
            addWanted(state, 1);
            pushFeed(state, `Stole the ${car.model} — wanted level up`);
            showMessage(state.missions, `You took the ${car.model} — the law noticed.`, 3);
          }
        }
      }
    }
    if (actions & ACTION_PUNCH) {
      // On foot with a gun equipped, Q fires the gun instead of punching —
      // fists are what Q means when Rico is unarmed.
      if (!state.player.inCar && state.weapons.equipped && canShoot(state.weapons)) {
        const report = shootFromPlayer(state, random);
        if (report.fired && report.hits > 0) addWanted(state, 1);
        else if (report.fired) showMessage(state.missions, 'Shot fired — the street heard that.', 2);
        else if (report.reason === 'magazine empty') showMessage(state.missions, 'Magazine empty — reloading.', 2);
        return;
      }
      const hit = punch(state.player, state.peds);
      if (hit && !hit.bodyguard) {
        audio.punch();
        addWanted(state, 1);
        showMessage(state.missions, 'That pedestrian is calling the police!', 3);
      } else if (hit) {
        // Punching a bodyguard is part of the job, not a street crime — the
        // kingpin's crew does not call the cops on itself.
        audio.punch();
      }
    }
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const result = stepWorld(STEP, input);
    if (result === 'wasted') {
      screen = SCREEN_OVER;
      audio.sting();
      saveGame();
      announce('Wasted. Press Space to get back up.');
    } else if (result === 'busted') {
      screen = SCREEN_BUSTED;
      audio.sting();
      saveGame();
      announce('Busted. Press Space to walk free.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    renderer.setZoom(input.zoomLevel());
    if (screen === SCREEN_TITLE) {
      // The title backdrop lives: traffic cruises while the player reads.
      state.elapsed += STEP;
      for (const car of state.traffic) stepTrafficCar(car, STEP, random);
      accumulator = 0;
    } else if (screen === SCREEN_PLAY) {
      // The help overlay freezes the world while Rico reads it.
      if (state.helpOpen) {
        accumulator = 0;
      } else {
        while (accumulator >= STEP) {
          step();
          accumulator -= STEP;
          if (screen !== SCREEN_PLAY) { accumulator = 0; break; }
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, state.player.money);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame();
      announce('Paused.');
    }
  });

  announce('Palmetto Bay Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
