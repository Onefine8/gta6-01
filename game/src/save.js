// Meridian Heat — save / load via localStorage.
// Stores progress, money, mission states, player position and side-activity
// tallies. Pure JSON; a corrupt or missing save loads as a fresh game.
// Only imports config.js; no other module is touched.
import { CONFIG } from './config.js';

const cfg = CONFIG;

let autosaveTimer = 0;

function defaultSave() {
  return {
    version: 1,
    money: cfg.START_MONEY,
    health: cfg.PLAYER.maxHealth,
    missionsCompleted: [],
    currentMission: 0,
    packagesFound: 0,
    racesWon: 0,
    taxiDone: 0,
    player: { x: -18, z: 108, heading: Math.PI },
    dayTime: cfg.START_DAY_TIME,
    createdAt: Date.now(),
  };
}

function readRaw() {
  try {
    const raw = window.localStorage.getItem(cfg.SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null; // corrupt save: start fresh, never crash the boot
  }
}

function writeRaw(data) {
  try {
    window.localStorage.setItem(cfg.SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false; // storage full / blocked: game keeps running unsaved
  }
}

export function init(G) {
  function collect() {
    const p = G.player || {};
    const pos = (typeof p.x === 'number')
      ? { x: p.x, z: p.z, heading: p.heading || 0 }
      : { x: -18, z: 108, heading: Math.PI };
    return {
      version: 1,
      money: (G.story && G.story.money) ?? (G.player && G.player.money) ?? cfg.START_MONEY,
      health: (G.player && G.player.health) ?? cfg.PLAYER.maxHealth,
      missionsCompleted: (G.missions && G.missions.completed)
        ? G.missions.completed.slice() : [],
      currentMission: (G.missions && typeof G.missions.currentIndex === 'number')
        ? G.missions.currentIndex : 0,
      packagesFound: (G.activities && G.activities.packagesFound) || 0,
      racesWon: (G.activities && G.activities.racesWon) || 0,
      taxiDone: (G.activities && G.activities.taxiDone) || 0,
      player: pos,
      dayTime: G.time ? G.time.dayTime : cfg.START_DAY_TIME,
      createdAt: Date.now(),
    };
  }

  function apply(data) {
    if (!data) return false;
    if (G.player) {
      G.player.x = data.player.x;
      G.player.z = data.player.z;
      G.player.heading = data.player.heading;
      G.player.health = data.health;
      G.player.money = data.money;
    }
    if (G.missions) {
      G.missions.completed = (data.missionsCompleted || []).slice();
      G.missions.currentIndex = data.currentMission || 0;
    }
    if (G.activities) {
      G.activities.packagesFound = data.packagesFound || 0;
      G.activities.racesWon = data.racesWon || 0;
      G.activities.taxiDone = data.taxiDone || 0;
    }
    if (G.time) G.time.dayTime = data.dayTime;
    return true;
  }

  G.save = {
    data: readRaw(),
    defaultSave,
    save() {
      const data = collect();
      const ok = writeRaw(data);
      G.save.data = data;
      return ok;
    },
    load() {
      const data = readRaw();
      G.save.data = data;
      if (!data) return null;
      apply(data);
      return data;
    },
    hasSave() {
      return readRaw() !== null;
    },
    clear() {
      try { window.localStorage.removeItem(cfg.SAVE_KEY); } catch (e) { /* ignore */ }
      G.save.data = null;
    },
    apply,
  };
  return G.save;
}

export function update(G, dt) {
  // Autosave once a minute while playing (never in menu / screenshots).
  if (G.state !== 'playing' || !G.save) return;
  autosaveTimer += dt;
  if (autosaveTimer >= cfg.AUTOSAVE_SECONDS) {
    autosaveTimer = 0;
    G.save.save();
  }
}

export default { init, update };
