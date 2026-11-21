// hud.js — the HUD: health bar, cash, wanted stars, speed, objective line,
// center banner, mission tracker, and the 180x180 minimap canvas (roads,
// player arrow, cops, mission waypoint, packages). Owns G.hud. All DOM
// access is guarded so the math stays testable in Node.

import * as configModule from './config.js';
import * as randomModule from './random.js';

const CFG = configModule.CONFIG ?? configModule.default ?? {};
const mulberry32 = randomModule.mulberry32 ?? randomModule.default ?? null;

// ---------------------------------------------------------------- helpers

function cfg(G, key, fallback) {
  const c = G.cfg ?? CFG;
  const v = c == null ? undefined : c[key];
  return v === undefined || v === null ? fallback : v;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function el(id) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

// ---------------------------------------------------------------- pure math (tested)

/** Format cash as $1,234. Pure. */
export function formatMoney(n) {
  const v = Math.max(0, Math.floor(n ?? 0));
  return `$${v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** Format a countdown in seconds as M:SS. Pure. */
export function formatTimer(seconds) {
  const s = Math.max(0, Math.ceil(seconds ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Speed in km/h from m/s. Pure. */
export function kmh(ms) {
  return Math.round((ms ?? 0) * 3.6);
}

/**
 * Project a world (x, z) point onto the minimap: map is `size` px square,
 * `half` is the city half-extent in metres, north is up. Pure.
 */
export function worldToMap(x, z, size, half) {
  const s = size / (half * 2);
  return { x: size / 2 + x * s, y: size / 2 + z * s };
}

/** Star string: filled stars for wanted, empty for the rest. Pure. */
export function starsString(wanted) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < wanted ? '★' : '☆';
  return s;
}

/** Health bar colour by fraction. Pure. */
export function healthColor(frac) {
  if (frac > 0.5) return '#4fc94f';
  if (frac > 0.25) return '#ffb347';
  return '#ff4f4f';
}

// ---------------------------------------------------------------- module

export function init(G) {
  G.hud = {
    els: {},
    bannerTimer: 0,
    bannerQueue: [],
    flashTimer: 0,
    _lastObjective: '',
    _lastTracker: '',

    /** Grab the HUD elements by id (spec contract). Safe to call again. */
    bind() {
      const ids = [
        'hud', 'health-bar', 'health-num', 'money', 'stars', 'speed',
        'objective', 'message', 'radio', 'minimap', 'menu', 'pause-menu',
        'end-screen', 'mission-tracker', 'wanted-flash',
      ];
      for (const id of ids) G.hud.els[id] = el(id);
      return G.hud.els;
    },

    /** Show a center banner message for `seconds` (queues when busy). */
    banner(text, seconds) {
      if (!text) return;
      G.hud.bannerQueue.push({ text, seconds: seconds ?? 4 });
      if (G.hud.bannerTimer <= 0) G.hud._nextBanner();
    },

    /** Alias used by main.js and shots.js for one-off messages. */
    showMessage(text) {
      G.hud.banner(text, 4);
    },

    _nextBanner() {
      const next = G.hud.bannerQueue.shift();
      const m = G.hud.els.message;
      if (!next) {
        if (m) {
          m.textContent = '';
          m.classList?.add?.('hidden');
        }
        G.hud.bannerTimer = 0;
        return;
      }
      if (m) {
        m.textContent = next.text;
        m.classList?.remove?.('hidden');
        m.style.opacity = '1';
      }
      G.hud.bannerTimer = next.seconds;
    },

    /** Red flash over the screen when the wanted level jumps. */
    flashWanted() {
      const f = G.hud.els['wanted-flash'];
      if (f) {
        f.classList?.remove?.('hidden');
        f.style.opacity = '0.55';
        G.hud.flashTimer = 0.5;
      }
    },

    /** Show or hide the start screen (matches main.js 'hidden' class use). */
    showMenu(show) {
      const menu = G.hud.els.menu;
      const hud = G.hud.els.hud;
      if (menu) menu.classList?.toggle?.('hidden', !show);
      if (hud) hud.classList?.toggle?.('hidden', show);
    },

    /** Show or hide the pause menu. */
    showPause(show) {
      const pm = G.hud.els['pause-menu'];
      if (pm) pm.classList?.toggle?.('hidden', !show);
    },

    /** Show or hide the end screen (mission 8 complete = victory text). */
    showEnd(show) {
      const end = G.hud.els['end-screen'];
      if (!end) return;
      end.classList?.toggle?.('hidden', !show);
      if (show) {
        const title = typeof document !== 'undefined'
          ? document.getElementById('end-title') : null;
        const sub = typeof document !== 'undefined'
          ? document.getElementById('end-subtitle') : null;
        const money = G.player?.money ?? 0;
        const done = G.missions?.completed?.length ?? 0;
        if (title) title.textContent = 'KING OF MERIDIAN';
        if (sub) {
          sub.textContent = `You beat Dante Kroll and took the city. `
            + `Missions ${done}/8 — Cash ${formatMoney(money)}. Port Meridian is yours, Rook.`;
        }
        // "Retry" makes no sense on the victory screen.
        const retry = typeof document !== 'undefined'
          ? document.getElementById('retry-button') : null;
        if (retry) retry.style.display = 'none';
      }
    },

    /** Write the objective line (only when it changed). */
    setObjective(text) {
      if (text === G.hud._lastObjective) return;
      G.hud._lastObjective = text;
      const o = G.hud.els.objective;
      if (o) o.textContent = text;
    },

    /** Write the mission tracker list (only when it changed). */
    setTracker(lines) {
      const joined = (lines ?? []).join('\n');
      if (joined === G.hud._lastTracker) return;
      G.hud._lastTracker = joined;
      const t = G.hud.els['mission-tracker'];
      if (t) {
        t.innerHTML = (lines ?? [])
          .map((l) => `<div>${escapeHtml(l)}</div>`)
          .join('');
      }
    },
  };

  G.hud.bind();

  // Start button on the menu (if the page has one) begins the game.
  try {
    const startBtn = typeof document !== 'undefined'
      ? document.querySelector('[data-start]')
      : null;
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        try {
          G.events?.emit?.('start-game');
        } catch (e) { /* best-effort */ }
      });
    }
  } catch (e) { /* best-effort */ }

  return G.hud;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function update(G, dt) {
  const h = G.hud;
  if (!h) return;
  dt = Math.min(dt, 0.05);

  // Banner queue.
  if (h.bannerTimer > 0) {
    h.bannerTimer -= dt;
    if (h.bannerTimer <= 0) h._nextBanner();
  }
  if (h.flashTimer > 0) {
    h.flashTimer -= dt;
    const f = h.els['wanted-flash'];
    if (f) f.style.opacity = String(Math.max(0, h.flashTimer * 1.1));
    if (h.flashTimer <= 0 && f) {
      f.style.opacity = '0';
      f.classList?.add?.('hidden');
    }
  }

  if (G.state !== 'playing') return;
  const p = G.player;
  if (!p) return;

  // Health.
  const frac = clamp(p.health / p.maxHealth, 0, 1);
  const bar = h.els['health-bar'];
  if (bar) {
    bar.style.width = `${Math.round(frac * 100)}%`;
    bar.style.background = healthColor(frac);
  }
  const hn = h.els['health-num'];
  if (hn) hn.textContent = String(Math.ceil(p.health));

  // Cash.
  const money = h.els.money;
  if (money) money.textContent = formatMoney(p.money);

  // Wanted stars.
  const stars = h.els.stars;
  if (stars) {
    const w = G.police?.wanted ?? 0;
    stars.textContent = starsString(w);
    stars.style.color = w >= 3 ? '#ff4f4f' : '#ffd23f';
  }

  // Speed.
  const speed = h.els.speed;
  if (speed) {
    const veh = p.inVehicle ? p.vehicle : null;
    const v = veh ? Math.abs(veh.speed) : Math.abs(p.speed ?? 0);
    speed.textContent = veh ? `${kmh(v)} km/h` : '';
  }

  // Objective + tracker from the active mission.
  const m = G.missions?.current;
  if (m) {
    const timer = m.timerMax > 0 ? `  [${formatTimer(m.timer)}]` : '';
    h.setObjective(`${m.name}${timer} — ${m.objectives?.[0] ?? ''}`);
    h.setTracker(m.objectives ?? []);
  } else {
    const next = G.missions?.nextAvailable?.();
    if (next) {
      const def = G.missions.defs.find((d) => d.id === next);
      h.setObjective(`Next mission: ${def ? def.name : ''} — press M for the mission list`);
    } else {
      h.setObjective('Port Meridian is yours. Free roam — taxi fares, races and packages pay.');
    }
    const acts = G.activities;
    const lines = [];
    if (acts) {
      lines.push(`Packages: ${acts.packagesFound ?? 0}/20`);
      lines.push(`Taxi fares done: ${acts.taxiDone ?? 0}`);
      lines.push(`Races won: ${acts.racesWon ?? 0}/3`);
    }
    h.setTracker(lines);
  }

  // Radio station label.
  const radio = h.els.radio;
  if (radio && G.audio) {
    try {
      radio.textContent = G.audio.isRadioOn?.()
        ? `♪ ${G.audio.currentStation()}` : '';
    } catch (e) { /* best-effort */ }
  }

  drawMinimap(G);
}

// ---------------------------------------------------------------- minimap

function drawMinimap(G) {
  const canvas = G.hud.els.minimap;
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = 180;
  const half = cfg(G, 'CITY_HALF', 290);
  const toMap = (x, z) => worldToMap(x, z, size, half);

  // Background.
  ctx.fillStyle = '#10151d';
  ctx.fillRect(0, 0, size, size);

  // Roads.
  const roads = G.world?.roads ?? G._fallbackRoads ?? [];
  ctx.strokeStyle = '#3a4552';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const r of roads) {
    const a = toMap(r.ax, r.az);
    const b = toMap(r.bx, r.bz);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // Water: harbor on the east edge.
  ctx.fillStyle = '#123a52';
  ctx.fillRect(size - 14, 0, 14, size);

  // Hidden packages (only the unfound ones, faint).
  const acts = G.activities;
  if (acts?.packages) {
    ctx.fillStyle = '#ffd23f';
    for (const pkg of acts.packages) {
      if (pkg.found) continue;
      const q = toMap(pkg.x, pkg.z);
      ctx.fillRect(q.x - 1, q.y - 1, 2, 2);
    }
  }

  // Mission waypoint: pulsing yellow diamond.
  const m = G.missions?.current;
  if (m?.waypoint) {
    const q = toMap(m.waypoint.x, m.waypoint.z);
    const pulse = 3 + Math.sin((G.time?.t ?? 0) * 5) * 1.5;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(q.x, q.y - pulse - 2);
    ctx.lineTo(q.x + pulse, q.y);
    ctx.lineTo(q.x, q.y + pulse + 2);
    ctx.lineTo(q.x - pulse, q.y);
    ctx.closePath();
    ctx.fill();
  }

  // Taxi passenger / fare destination.
  if (acts?.taxi?.active && acts.taxi.destination) {
    const q = toMap(acts.taxi.destination.x, acts.taxi.destination.z);
    ctx.fillStyle = '#4fc9e8';
    ctx.beginPath();
    ctx.arc(q.x, q.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Police: red dots.
  ctx.fillStyle = '#ff4f4f';
  for (const cop of G.police?.cops ?? []) {
    const v = cop.vehicle;
    if (!v) continue;
    const q = toMap(v.pos.x, v.pos.z);
    ctx.beginPath();
    ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Enemies: orange dots.
  ctx.fillStyle = '#ff9a3f';
  for (const e of G.combat?.enemies ?? []) {
    const q = toMap(e.pos.x, e.pos.z);
    ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
  }

  // Player: white arrow, rotated to the heading.
  const p = G.player;
  if (p) {
    const pos = p.inVehicle && p.vehicle ? p.vehicle.pos : p.pos;
    if (!pos) return;
    const heading = p.inVehicle && p.vehicle ? p.vehicle.heading : p.heading;
    const q = toMap(pos.x, pos.z);
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(-heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Border.
  ctx.strokeStyle = '#5a6b7a';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
}
