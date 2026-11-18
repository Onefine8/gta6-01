// Boot and the one loop for Palmetto Bay Heat. The game moves between title,
// play, paused, wasted and busted screens; the world advances in fixed 1/60 s
// steps. Progress (cash, missions, packages, best race) is saved to localStorage.
//
// ?shot=chase|walk|mission|night (with &seed=N) stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { FIELD, SAVE_KEY, STEP, TIME, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createCity, createParkedCars } from './world.js';
import { createPlayer, enterCar, exitCar, nearestCar, punch, stepPlayer } from './player.js';
import { createPedestrians, createTraffic, stepDrivenCar, stepPedestrian, stepTrafficCar } from './vehicles.js';
import { addWanted, clearWanted, createPolice, stepPolice } from './police.js';
import { MISSION_DEFS, RACE, createMissionState, objectiveText, showMessage, startMission, startRace, stepMissions, stepRace } from './missions.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MISSION, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_RACE, createInput } from './input.js';
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
  const state = {
    player,
    city,
    parkedCars: createParkedCars(random, city),
    traffic: createTraffic(random, 14),
    peds: createPedestrians(random, 26),
    police: createPolice(),
    missions: createMissionState(),
    missionsDone: 0,
    time: { hour: TIME.startHour, isNight: false, raining: false },
    elapsed: 0,
    wanted: 0,
    wantedTimer: 26,
    busted: false,
    wasted: false,
    bailCost: 150,
    objectivePos: null,
    raceCheckpoints: RACE.checkpoints,
    weatherTimer: 40,
    saveTimer: 0,
  };
  return state;
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
      raceBest: state.missions.race.best,
      health: state.player.health,
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
    if (typeof data.raceBest === 'number') state.missions.race.best = data.raceBest;
    if (typeof data.health === 'number') state.player.health = data.health;
  } catch {
    // A corrupt save is ignored; a fresh game starts instead.
  }
}

function updateObjectivePos() {
  const m = state.missions;
  if (m.race.active) {
    state.objectivePos = RACE.checkpoints[m.race.checkpoint];
    return;
  }
  if (!m.active || m.index >= MISSION_DEFS.length) { state.objectivePos = null; return; }
  const step = MISSION_DEFS[m.index].steps[m.step];
  if (!step || step.kind === 'escape') { state.objectivePos = null; return; }
  state.objectivePos = { x: step.x, y: step.y };
}

function updateTime(dt) {
  state.time.hour = (state.time.hour + (dt * 24) / TIME.dayLengthSeconds) % 24;
  state.time.isNight = state.time.hour >= TIME.nightStart || state.time.hour < TIME.nightEnd;
  state.weatherTimer -= dt;
  if (state.weatherTimer <= 0) {
    state.weatherTimer = 45 + random() * 40;
    state.time.raining = !state.time.raining && random() < 0.5;
    if (state.time.raining) showMessage(state.missions, 'Rain over Palmetto Bay — roads are slick.', 3);
  }
}

function stepWorld(dt, input) {
  const events = { stolenCar: false };
  state.elapsed += dt;
  updateTime(dt);
  const player = state.player;

  if (player.inCar) {
    const car = player.inCar;
    stepDrivenCar(car, input, dt, city, [...state.parkedCars, ...state.traffic, ...state.police.cars]);
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
  for (const car of state.traffic) stepTrafficCar(car, dt, random);
  for (const ped of state.peds) stepPedestrian(ped, dt, random, city, player);
  stepPolice(state.police, state, dt, random);
  stepMissions(state.missions, state, dt, events);
  stepRace(state.missions, state, dt);
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
    saveGame();
  }
  if (state.busted) {
    state.bailCost = 150;
    player.money = Math.max(0, player.money - state.bailCost);
    clearWanted(state, state.police);
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
      }
    }
    if (actions & ACTION_RACE) {
      const near = Math.hypot(state.player.x - RACE.start.x, state.player.y - RACE.start.y) < 160
        || (state.player.inCar && Math.hypot(state.player.inCar.x - RACE.start.x, state.player.inCar.y - RACE.start.y) < 160);
      if (!state.missions.race.active && near) {
        startRace(state.missions);
        audio.click();
      } else if (!state.missions.race.active) {
        showMessage(state.missions, 'Race starts at the green flag by Marina Garage — drive there and press R.', 4);
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
            addWanted(state, 1);
            showMessage(state.missions, `You took the ${car.model} — the law noticed.`, 3);
          }
        }
      }
    }
    if (actions & ACTION_PUNCH) {
      const hit = punch(state.player, state.peds);
      if (hit) {
        audio.punch();
        addWanted(state, 1);
        showMessage(state.missions, 'That pedestrian is calling the police!', 3);
      }
    }
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const result = stepWorld(STEP, input);
    if (result === 'wasted') {
      screen = SCREEN_OVER;
      saveGame();
      announce('Wasted. Press Space to get back up.');
    } else if (result === 'busted') {
      screen = SCREEN_BUSTED;
      saveGame();
      announce('Busted. Press Space to walk free.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // The title backdrop lives: traffic cruises while the player reads.
      state.elapsed += STEP;
      for (const car of state.traffic) stepTrafficCar(car, STEP, random);
      accumulator = 0;
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) { accumulator = 0; break; }
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
