// Meridian Heat — save / load (localStorage).
// Stores progress only: money, health, missions, packages, position,
// time of day and wanted level. No secrets, no credentials.

import { CFG } from './config.js';

export const save = {
  key: CFG.SAVE_KEY,
  has: false,
};

function collect(G) {
  const p = G.player || {};
  const pos = p.pos || { x: 0, z: 0 };
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    money: G.money || 0,
    health: G.health ?? 100,
    wanted: (G.police && G.police.wanted) || 0,
    dayTime: G.time ? G.time.dayTime : CFG.WORLD.START_DAY_TIME,
    seed: G.seed,
    player: {
      x: pos.x, z: pos.z,
      heading: p.heading || 0,
      onFoot: p.onFoot !== false,
    },
    missionsDone: (G.missions && G.missions.done) ? [...G.missions.done] : [],
    currentMission: (G.missions && G.missions.current) || 0,
    packages: (G.activities && G.activities.packagesFound)
      ? [...G.activities.packagesFound] : [],
    taxiDone: (G.activities && G.activities.taxiDone) || 0,
    racesWon: (G.activities && G.activities.racesWon) || 0,
    stats: (G.stats) ? { ...G.stats } : {},
  };
}

function apply(G, data) {
  G.money = data.money ?? CFG.ECONOMY.START_MONEY;
  G.health = data.health ?? CFG.PLAYER.HEALTH;
  if (G.time) G.time.dayTime = data.dayTime ?? CFG.WORLD.START_DAY_TIME;
  if (G.police) G.police.wanted = data.wanted || 0;
  if (G.missions) {
    G.missions.done = new Set(data.missionsDone || []);
    G.missions.current = data.currentMission || 0;
  }
  if (G.activities) {
    G.activities.packagesFound = new Set(data.packages || []);
    G.activities.taxiDone = data.taxiDone || 0;
    G.activities.racesWon = data.racesWon || 0;
  }
  if (G.player && data.player) {
    G.player.pos.x = data.player.x;
    G.player.pos.z = data.player.z;
    G.player.heading = data.player.heading || 0;
  }
  if (data.stats) G.stats = { ...data.stats };
}

export function init(G) {
  G.save = save;
  save.has = hasSave();
  return save;
}

export function hasSave() {
  try {
    return !!window.localStorage.getItem(CFG.SAVE_KEY);
  } catch (e) {
    return false;
  }
}

export function saveGame(G) {
  try {
    const data = collect(G);
    window.localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
    save.has = true;
    return true;
  } catch (e) {
    console.warn('[save] could not write save:', e);
    return false;
  }
}

export function loadGame(G) {
  try {
    const raw = window.localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return false;
    apply(G, data);
    return true;
  } catch (e) {
    console.warn('[save] could not load save:', e);
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(CFG.SAVE_KEY);
    save.has = false;
    return true;
  } catch (e) {
    return false;
  }
}

export default save;
