// Meridian Heat — bootstrap, game loop and state machine.
// Creates G (the shared state object every module talks through), wires the
// engine modules (Builder A) and the gameplay modules (Builder B), then runs
// the fixed update order from the spec:
//   input -> player -> vehicles -> traffic -> peds -> police -> missions
//   -> combat -> activities -> world -> render -> hud
// Gameplay modules are loaded dynamically with safe stubs, so the engine
// boots and renders even before a gameplay module lands.

import { CFG } from './config.js';
import { makeRng } from './random.js';
import { init as renderInit, update as renderUpdate, draw as renderDraw } from './render.js';
import { init as worldInit, update as worldUpdate } from './world.js';
import { init as inputInit, update as inputUpdate, wasPressed } from './input.js';
import { init as audioInit, update as audioUpdate, unlock as audioUnlock, playConfirm, playBlip, playBusted } from './audio.js';
import { init as saveInit, saveGame, loadGame, hasSave } from './save.js';
import { init as shotsInit } from './shots.js';

const THREE = globalThis.THREE;

// Gameplay modules (Builder B). Loaded dynamically; a missing module gets a
// stub so the engine still boots and the menu / world remain viewable.
const GAMEPLAY_MODULES = [
  'player', 'vehicles', 'traffic', 'peds', 'police',
  'missions', 'combat', 'hud', 'activities', 'story',
];

function stubFor(name) {
  const base = {
    __stub: true,
    init() {},
    update() {},
  };
  if (name === 'player') {
    base.pos = { x: 0, y: 0, z: 0 };
    base.heading = 0;
    base.speed = 0;
    base.onFoot = true;
    base.vehicle = null;
    base.health = CFG.PLAYER.HEALTH;
  }
  if (name === 'vehicles') base.getActive = () => null;
  if (name === 'police') base.wanted = 0;
  if (name === 'missions') {
    base.done = new Set();
    base.current = 0;
    base.active = null;
  }
  if (name === 'activities') {
    base.packagesFound = new Set();
    base.taxiDone = 0;
    base.racesWon = 0;
  }
  if (name === 'combat') base.weapon = 'pistol';
  if (name === 'hud') base.showMessage = () => {};
  return base;
}

async function loadGameplay(G) {
  const loaded = {};
  for (const name of GAMEPLAY_MODULES) {
    try {
      const mod = await import(`./${name}.js`);
      const api = mod.default && typeof mod.default === 'object' ? mod.default : mod;
      G[name] = api;
      loaded[name] = true;
      if (typeof api.init === 'function') api.init(G);
    } catch (e) {
      console.warn(`[main] gameplay module "${name}" not available, using stub:`, e.message);
      G[name] = stubFor(name);
      loaded[name] = false;
    }
  }
  return loaded;
}

// --- G: the shared state object ---------------------------------------------
function createG() {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  const seed = seedParam !== null ? Number(seedParam) || CFG.DEFAULT_SEED : CFG.DEFAULT_SEED;
  const listeners = new Map();
  const G = {
    cfg: CFG,
    seed,
    rng: makeRng(seed),
    scene: null,
    camera: null,
    renderer: null,
    input: null,
    audio: null,
    save: null,
    world: null,
    player: null,
    vehicles: null,
    traffic: null,
    peds: null,
    police: null,
    missions: null,
    combat: null,
    hud: null,
    activities: null,
    story: null,
    state: 'menu', // menu | playing | paused | busted | wasted
    time: { t: 0, dayTime: CFG.WORLD.START_DAY_TIME },
    money: CFG.ECONOMY.START_MONEY,
    health: CFG.PLAYER.HEALTH,
    stats: { playSeconds: 0, carsStolen: 0, distanceDriven: 0 },
    shotMode: false,
    events: {
      on(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      emit(type, data) {
        const fns = listeners.get(type) || [];
        for (const fn of fns) {
          try { fn(data); } catch (e) { console.error('[event]', type, e); }
        }
      },
    },
  };
  return G;
}

// --- DOM helpers --------------------------------------------------------------
function el(id) { return document.getElementById(id); }

function show(id, on) {
  const n = el(id);
  if (n) n.classList.toggle('hidden', !on);
}

function setText(id, text) {
  const n = el(id);
  if (n) n.textContent = text;
}

// --- Fallback HUD (used only while hud.js is still a stub) ----------------------
function updateHudFallback(G) {
  setText('money', `$${Math.floor(G.money).toLocaleString('en-US')}`);
  setText('health-num', `${Math.max(0, Math.ceil(G.health))}`);
  const bar = el('health-bar');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, G.health))}%`;
  const stars = el('stars');
  if (stars) {
    const w = (G.police && G.police.wanted) || 0;
    stars.textContent = '★'.repeat(w) + '☆'.repeat(5 - w);
    stars.classList.toggle('hot', w >= 3);
  }
  const speedEl = el('speed');
  if (speedEl) {
    let kmh = 0;
    if (G.player && G.player.vehicle && G.vehicles && G.vehicles.getActive) {
      const v = G.vehicles.getActive();
      if (v) kmh = Math.abs(v.speed || 0) * 3.6;
    } else if (G.player) {
      kmh = Math.abs(G.player.speed || 0) * 3.6;
    }
    speedEl.textContent = `${Math.round(kmh)} km/h`;
  }
}

// --- State transitions ----------------------------------------------------------
function startGame(G, fresh) {
  audioUnlock();
  playConfirm();
  if (fresh) {
    G.money = CFG.ECONOMY.START_MONEY;
    G.health = CFG.PLAYER.HEALTH;
    G.time.dayTime = CFG.WORLD.START_DAY_TIME;
    if (G.missions) {
      G.missions.done = new Set();
      G.missions.current = 0;
    }
    if (G.player && G.world && G.world.landmarks) {
      G.player.pos.x = G.world.landmarks.spawn.x;
      G.player.pos.z = G.world.landmarks.spawn.z;
      G.player.heading = Math.PI;
    }
  } else {
    loadGame(G);
    if (G.player && G.player.pos) {
      // Player position was restored by loadGame; make sure we are on foot.
      G.player.vehicle = null;
      G.player.onFoot = true;
    }
  }
  G.state = 'playing';
  show('menu', false);
  show('pause-menu', false);
  show('end-screen', false);
  show('hud', true);
  G.events.emit('game-start', { fresh });
}

function pauseGame(G) {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  show('pause-menu', true);
  playBlip();
}

function resumeGame(G) {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  show('pause-menu', false);
  playBlip();
}

function quitToMenu(G) {
  saveGame(G);
  G.state = 'menu';
  show('pause-menu', false);
  show('end-screen', false);
  show('hud', false);
  show('menu', true);
  if (G.police) G.police.wanted = 0;
}

function endGame(G, kind) {
  // kind: 'busted' | 'wasted'
  if (G.state !== 'playing') return;
  G.state = kind;
  playBusted();
  const title = el('end-title');
  const sub = el('end-sub');
  if (title) title.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  if (sub) {
    sub.textContent = kind === 'busted'
      ? 'The Meridian PD caught up with you. Bail is $200.'
      : 'Rook is down. Mara is already lining up a replacement driver.';
  }
  // Penalty: lose the bail / hospital fee, respawn at the plaza.
  G.money = Math.max(0, G.money - 200);
  if (G.police) G.police.wanted = 0;
  show('end-screen', true);
  G.events.emit('game-end', { kind });
}

function retryAfterEnd(G) {
  G.health = CFG.PLAYER.HEALTH;
  if (G.player && G.world && G.world.landmarks) {
    G.player.pos.x = G.world.landmarks.spawn.x;
    G.player.pos.z = G.world.landmarks.spawn.z;
    G.player.pos.y = 0;
    G.player.heading = Math.PI;
    G.player.vehicle = null;
    G.player.onFoot = true;
  }
  if (G.vehicles && G.vehicles.clearActive) G.vehicles.clearActive();
  show('end-screen', false);
  G.state = 'playing';
  playConfirm();
}

// --- Menu wiring ------------------------------------------------------------------
function wireMenus(G, loaded) {
  const startBtn = el('btn-start');
  if (startBtn) {
    startBtn.addEventListener('click', () => startGame(G, true));
  }
  const contBtn = el('btn-continue');
  if (contBtn) {
    if (hasSave()) {
      contBtn.classList.remove('hidden');
      contBtn.addEventListener('click', () => startGame(G, false));
    }
  }
  const howBtn = el('btn-howto');
  const howPanel = el('howto');
  if (howBtn && howPanel) {
    howBtn.addEventListener('click', () => {
      howPanel.classList.toggle('hidden');
      playBlip();
    });
  }
  const resumeBtn = el('btn-resume');
  if (resumeBtn) resumeBtn.addEventListener('click', () => resumeGame(G));
  const saveBtn = el('btn-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const ok = saveGame(G);
      setText('save-note', ok ? 'Progress saved.' : 'Save failed.');
      playConfirm();
    });
  }
  const restartBtn = el('btn-restart');
  if (restartBtn) restartBtn.addEventListener('click', () => startGame(G, true));
  const quitBtn = el('btn-quit');
  if (quitBtn) quitBtn.addEventListener('click', () => quitToMenu(G));
  const retryBtn = el('btn-retry');
  if (retryBtn) retryBtn.addEventListener('click', () => retryAfterEnd(G));
  const menuBtn = el('btn-end-menu');
  if (menuBtn) menuBtn.addEventListener('click', () => quitToMenu(G));
  // Mute toggle (M key is the mission menu; use the button instead).
  const muteBtn = el('btn-mute');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (G.audio) {
        const m = !G.audio.muted;
        if (G.audio.setMuted) G.audio.setMuted(m);
        else G.audio.muted = m;
        muteBtn.textContent = m ? '🔇 Sound: Off' : '🔊 Sound: On';
      }
    });
  }
  void loaded;
}

// --- Main loop -----------------------------------------------------------------------
let lastTime = 0;
let autosaveTimer = 0;

function callUpdate(mod, G, dt) {
  if (mod && typeof mod.update === 'function') mod.update(G, dt);
}

function frame(G, now) {
  requestAnimationFrame((t) => frame(G, t));
  const dt = Math.min(0.05, Math.max(0.0001, (now - lastTime) / 1000 || 0.016));
  lastTime = now;
  G.time.t += dt;

  // Pause toggle.
  if (wasPressed(CFG.KEYS.PAUSE)) {
    if (G.state === 'playing') pauseGame(G);
    else if (G.state === 'paused') resumeGame(G);
  }

  // 1. Input (promotes presses for this frame).
  inputUpdate(G, dt);

  if (G.state === 'playing') {
    G.stats.playSeconds += dt;
    // 2-9. Gameplay, in spec order.
    callUpdate(G.player, G, dt);
    callUpdate(G.vehicles, G, dt);
    callUpdate(G.traffic, G, dt);
    callUpdate(G.peds, G, dt);
    callUpdate(G.police, G, dt);
    callUpdate(G.missions, G, dt);
    callUpdate(G.combat, G, dt);
    callUpdate(G.activities, G, dt);
    // 10. World (water, neon, clouds, sun/moon).
    worldUpdate(G, dt);
    // Autosave once a minute while playing.
    autosaveTimer += dt;
    if (autosaveTimer > 60) {
      autosaveTimer = 0;
      saveGame(G);
    }
  } else if (G.state === 'menu') {
    // Menu backdrop: the city still breathes behind the title screen.
    worldUpdate(G, dt);
  }

  // 11. Render (camera + lights + draw).
  renderUpdate(G, dt);
  renderDraw(G);

  // 12. HUD last, so it reads the freshest state.
  if (G.hud && !G.hud.__stub) callUpdate(G.hud, G, dt);
  else updateHudFallback(G);

  // Audio follows the world every frame (engine pitch, sirens, radio).
  audioUpdate(G, dt);
}

// --- Boot -------------------------------------------------------------------------------
async function boot() {
  const G = createG();
  window.__G = G; // debug handle (also handy for the finisher's checks)

  renderInit(G);
  worldInit(G);
  inputInit(G);
  audioInit(G);
  saveInit(G);

  // Player spawn (before gameplay modules init, so they see a sane pos).
  G.player = stubFor('player');
  if (G.world && G.world.landmarks) {
    G.player.pos.x = G.world.landmarks.spawn.x;
    G.player.pos.z = G.world.landmarks.spawn.z;
  }

  const loaded = await loadGameplay(G);

  // Game events.
  G.events.on('mission-complete', (data) => {
    if (data && data.reward) G.money += data.reward;
    saveGame(G);
  });
  G.events.on('busted', () => endGame(G, 'busted'));
  G.events.on('wasted', () => endGame(G, 'wasted'));
  G.events.on('player-died', () => endGame(G, 'wasted'));

  wireMenus(G, loaded);

  // Screenshot staging (?shot=chase|walk|mission|night&seed=N).
  shotsInit(G);

  // Global error surface: show it in the banner instead of failing silently.
  window.addEventListener('error', (e) => {
    const m = el('message');
    if (m) {
      m.textContent = `Error: ${e.message}`;
      m.classList.remove('hidden');
    }
    console.error(e.error || e.message);
  });

  // Start in menu (or straight into a staged shot).
  if (G.shotMode) {
    show('menu', false);
    show('hud', true);
    G.state = 'playing';
  } else {
    show('hud', false);
    show('menu', true);
  }

  lastTime = performance.now();
  requestAnimationFrame((t) => frame(G, t));
  console.log('[main] Meridian Heat booted, seed', G.seed, 'modules:', loaded);
}

boot().catch((e) => {
  console.error('[main] boot failed:', e);
  const m = document.getElementById('message');
  if (m) {
    m.textContent = `Boot failed: ${e.message}`;
    m.classList.remove('hidden');
  }
});

export default boot;
