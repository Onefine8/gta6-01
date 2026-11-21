// Meridian Heat — bootstrap, game loop and state machine.
// Builds the shared object G, wires every module, runs the fixed update
// order from the spec, and owns the menu / playing / paused / busted /
// wasted states. Gameplay modules (Builder B) are loaded dynamically so the
// engine boots cleanly with or without them; engine modules are static.
// Only imports config.js / random.js + engine modules + global THREE.
import { CONFIG } from './config.js';
import { createRng } from './random.js';
import * as world from './world.js';
import * as render from './render.js';
import * as input from './input.js';
import * as audio from './audio.js';
import * as save from './save.js';
import * as shots from './shots.js';

const cfg = CONFIG;

// Gameplay modules owned by Builder B. Loaded dynamically, in loop order;
// a missing module is skipped (logged, never fatal) so the engine boots.
const GAMEPLAY_MODULES = [
  'player',
  'vehicles',
  'traffic',
  'peds',
  'police',
  'missions',
  'combat',
  'activities',
  'hud',
  'story',
];

function createEvents() {
  const listeners = new Map();
  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    off(event, fn) {
      const list = listeners.get(event);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(event, payload) {
      const list = listeners.get(event);
      if (!list) return;
      for (const fn of list.slice()) {
        try { fn(payload); } catch (e) { console.error('[events]', event, e); }
      }
    },
  };
}

function parseSeed() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('seed');
  if (raw !== null && raw !== '' && Number.isFinite(Number(raw))) return Number(raw);
  if (raw !== null && raw !== '') return raw;
  return 20261121; // deterministic default so every fresh boot looks the same
}

function defaultPlayer() {
  return {
    x: -18, z: 108, heading: Math.PI,
    speed: 0, health: cfg.PLAYER.maxHealth,
    money: cfg.START_MONEY, wanted: 0,
    onFoot: true, inVehicle: false, vehicle: null,
  };
}

function $(id) {
  return document.getElementById(id);
}

function showOnly(id) {
  for (const el of ['menu', 'pause-menu', 'end-screen']) {
    const node = $(el);
    if (node) node.classList.toggle('hidden', el !== id);
  }
  const hud = $('hud');
  if (hud) hud.classList.toggle('hidden', id === 'menu');
}

// Minimal HUD sync used only until the hud module (Builder B) loads.
// It touches the same element ids from the spec, so the HUD is never blank.
function fallbackHud(G) {
  const p = G.player;
  if (!p) return;
  const bar = $('health-bar');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, p.health))}%`;
  const num = $('health-num');
  if (num) num.textContent = String(Math.round(p.health));
  const money = $('money');
  if (money) money.textContent = `$${Math.floor(p.money || 0).toLocaleString('en-US')}`;
  const stars = $('stars');
  if (stars) {
    const wanted = (G.police && typeof G.police.wanted === 'number')
      ? G.police.wanted : (p.wanted || 0);
    stars.textContent = '★'.repeat(wanted) + '☆'.repeat(cfg.POLICE.maxWanted - wanted);
  }
  const speed = $('speed');
  if (speed) {
    const kmh = Math.round(Math.abs(p.inVehicle && p.vehicle ? (p.vehicle.speed || 0) : (p.speed || 0)) * 3.6);
    speed.textContent = `${kmh} km/h`;
  }
}

async function loadGameplayModules(G) {
  const loaded = {};
  for (const name of GAMEPLAY_MODULES) {
    try {
      const mod = await import(`./${name}.js`);
      if (mod && typeof mod.init === 'function') mod.init(G);
      loaded[name] = mod;
    } catch (e) {
      // Missing Builder B file: log once and keep going. The engine,
      // the city and the camera all work without gameplay modules.
      console.warn(`[main] gameplay module '${name}' not loaded:`, e.message);
      loaded[name] = null;
    }
  }
  return loaded;
}

function updateGameplay(G, modules, dt) {
  // Spec update order: input -> player -> vehicles -> traffic -> peds ->
  // police -> missions -> combat -> activities -> world -> render -> hud.
  // input.update clears edge presses, so it runs first.
  input.update(G, dt);
  const order = ['player', 'vehicles', 'traffic', 'peds', 'police', 'missions', 'combat', 'activities'];
  for (const name of order) {
    const mod = modules[name];
    if (mod && typeof mod.update === 'function') {
      try { mod.update(G, dt); } catch (e) { console.error(`[main] ${name}.update`, e); }
    }
  }
  world.update(G, dt);
  render.update(G, dt);
  const hudMod = modules.hud;
  if (hudMod && typeof hudMod.update === 'function') {
    try { hudMod.update(G, dt); } catch (e) { console.error('[main] hud.update', e); }
  } else {
    fallbackHud(G);
  }
  audio.update(G, dt);
  save.update(G, dt);
  shots.update(G, dt);
}

async function boot() {
  const seed = parseSeed();
  const rng = createRng(seed);

  // ---- Shared game object G ---------------------------------------------
  const G = {
    cfg,
    rng,
    seed: rng.seed,
    scene: null,
    camera: null,
    renderer: null,
    input: null,
    audio: null,
    save: null,
    world: null,
    player: defaultPlayer(),
    vehicles: null,
    traffic: null,
    peds: null,
    police: null,
    missions: null,
    combat: null,
    hud: null,
    activities: null,
    story: null,
    state: 'menu', // 'menu' | 'playing' | 'paused' | 'busted' | 'wasted'
    time: { t: 0, dayTime: cfg.START_DAY_TIME },
    events: createEvents(),
    shotMode: false,
    shot: null,
    pausedFrom: null,
  };
  window.__MERIDIAN__ = G;

  // ---- Engine modules (static) ------------------------------------------
  render.init(G);
  world.init(G);
  input.init(G);
  audio.init(G);
  save.init(G);

  // Restore a save if one exists (player position/money/missions).
  const saved = G.save.load();
  if (saved) {
    G.player.money = saved.money;
    G.player.health = saved.health;
  }

  // ---- Gameplay modules (dynamic, Builder B) ----------------------------
  const modules = await loadGameplayModules(G);
  G.modules = modules;

  // ---- Screenshot staging (after gameplay modules, so it can use them) ---
  shots.init(G);

  // ---- State machine -----------------------------------------------------
  function setState(next, payload) {
    const prev = G.state;
    G.state = next;
    G.events.emit('state', { from: prev, to: next, payload });
    if (next === 'playing') {
      showOnly(null);
      if (G.render) G.render.setCameraMode('follow');
    } else if (next === 'menu') {
      showOnly('menu');
      if (G.render) G.render.setCameraMode('orbit');
    } else if (next === 'paused') {
      showOnly('pause-menu');
    } else if (next === 'busted' || next === 'wasted') {
      const title = $('end-title');
      if (title) title.textContent = next === 'busted' ? 'BUSTED!' : 'WASTED';
      const sub = $('end-subtitle');
      if (sub) {
        sub.textContent = next === 'busted'
          ? 'The Meridian PD caught up with Rook.'
          : 'Rook went down in Port Meridian.';
      }
      showOnly('end-screen');
      if (G.audio) G.audio.play('missionFail');
    }
  }
  G.setState = setState;

  function startGame(fresh) {
    if (fresh) {
      const p = defaultPlayer();
      G.player.x = p.x; G.player.z = p.z; G.player.heading = p.heading;
      G.player.health = cfg.PLAYER.maxHealth;
      G.player.money = cfg.START_MONEY;
      G.player.inVehicle = false;
      G.player.vehicle = null;
      if (G.missions && typeof G.missions.reset === 'function') G.missions.reset();
      if (G.police && typeof G.police.setWanted === 'function') G.police.setWanted(0);
      G.time.dayTime = cfg.START_DAY_TIME;
    }
    if (G.audio) G.audio.uiClick();
    setState('playing');
  }
  G.startGame = startGame;

  G.events.on('busted', () => setState('busted'));
  G.events.on('wasted', () => setState('wasted'));
  G.events.on('mission-complete', () => {
    if (G.audio) G.audio.play('missionComplete');
  });
  G.events.on('mission-failed', () => {
    if (G.audio) G.audio.play('missionFail');
  });

  // ---- Menu wiring --------------------------------------------------------
  const startBtn = $('start-button');
  if (startBtn) startBtn.addEventListener('click', () => startGame(true));
  const continueBtn = $('continue-button');
  if (continueBtn) {
    continueBtn.classList.toggle('hidden', !G.save.hasSave());
    continueBtn.addEventListener('click', () => startGame(false));
  }
  const resumeBtn = $('resume-button');
  if (resumeBtn) resumeBtn.addEventListener('click', () => setState('playing'));
  const restartBtn = $('restart-button');
  if (restartBtn) restartBtn.addEventListener('click', () => startGame(true));
  const quitBtn = $('quit-button');
  if (quitBtn) quitBtn.addEventListener('click', () => setState('menu'));
  const retryBtn = $('retry-button');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      G.player.health = cfg.PLAYER.maxHealth;
      if (G.police && typeof G.police.setWanted === 'function') G.police.setWanted(0);
      const s = G.world.spawns.garage;
      G.player.x = s.x; G.player.z = s.z; G.player.heading = s.heading;
      setState('playing');
    });
  }
  const endMenuBtn = $('end-menu-button');
  if (endMenuBtn) endMenuBtn.addEventListener('click', () => setState('menu'));
  const muteBtn = $('mute-button');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      const m = !G.audio.isMuted();
      G.audio.setMuted(m);
      muteBtn.textContent = m ? '🔇 Sound: Off' : '🔊 Sound: On';
    });
  }

  // ---- Main loop ----------------------------------------------------------
  let last = performance.now();
  let pausedByHidden = false;
  // FPS guard: if the machine struggles, drop render resolution instead of
  // stuttering. Steps down 2 -> 1.5 -> 1.25 -> 1, at most once per 5 s.
  let fpsEma = 60;
  let fpsCheckTimer = 0;
  const pixelSteps = [2, 1.5, 1.25, 1];
  let pixelStep = 0;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.state === 'playing') {
      pausedByHidden = true;
      setState('paused');
    } else if (!document.hidden && pausedByHidden) {
      pausedByHidden = false;
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05); // clamp tab-switch spikes

    // FPS guard: track a smoothed frame rate and step the pixel ratio down
    // when the game cannot hold ~28 fps.
    if (dt > 0) fpsEma = fpsEma * 0.95 + (1 / dt) * 0.05;
    fpsCheckTimer += dt;
    if (fpsCheckTimer >= 5) {
      fpsCheckTimer = 0;
      if (fpsEma < 28 && pixelStep < pixelSteps.length - 1 && G.renderer) {
        pixelStep += 1;
        G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelSteps[pixelStep]));
        console.info(`[main] fps ${fpsEma.toFixed(0)} — pixel ratio -> ${pixelSteps[pixelStep]}`);
      }
    }

    // Pause toggle (Esc / P) — edge-triggered, checked before updates.
    if (G.input && G.input.wasPressed(cfg.KEYS.pause)) {
      if (G.state === 'playing') setState('paused');
      else if (G.state === 'paused') setState('playing');
    }
    if (G.input && G.input.wasPressed('KeyP')) {
      if (G.state === 'playing') setState('paused');
      else if (G.state === 'paused') setState('playing');
    }
    // Enter starts the game from the menu.
    if (G.state === 'menu' && G.input && G.input.wasPressed('Enter')) startGame(!G.save.hasSave());
    // Radio toggle while playing.
    if (G.state === 'playing' && G.input && G.input.wasPressed(cfg.KEYS.radio)) {
      if (G.audio) {
        const on = !G.audio.isRadioOn();
        G.audio.setRadio(on);
        if (on && G.hud && typeof G.hud.showMessage === 'function') {
          G.hud.showMessage(`Radio: ${G.audio.currentStation()}`);
        }
      }
    }

    if (G.state === 'playing') {
      updateGameplay(G, modules, dt);
    } else if (G.state === 'menu') {
      // Menu: keep the world alive behind the title (water, clock, orbit).
      input.update(G, dt);
      world.update(G, dt);
      render.update(G, dt);
    } else if (G.state === 'paused') {
      // Frozen frame: render once so the pause menu sits over the scene.
      input.update(G, dt);
      render.update(G, 0);
    } else {
      // busted / wasted: frozen scene behind the end screen.
      input.update(G, dt);
      render.update(G, 0);
    }
  }

  // If a screenshot preset staged the scene, the game is already playing.
  if (!G.shotMode) setState('menu');
  else showOnly(null);

  requestAnimationFrame(frame);
  G.events.emit('booted', { seed: rng.seed, modules: Object.keys(modules).filter((k) => modules[k]) });
  return G;
}

boot().catch((e) => {
  console.error('[main] boot failed', e);
  const msg = $('message');
  if (msg) {
    msg.textContent = 'Failed to start Meridian Heat. Please reload the page.';
    msg.classList.remove('hidden');
  }
});

export default { boot };
