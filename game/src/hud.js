// hud.js — the heads-up display: bars, stars, money, minimap, banners.
//
// Owns G.hud. All DOM access goes through cached element handles looked up
// once in init(); when `document` does not exist (Node tests) the module
// still runs — every write is guarded and the pure formatters plus the
// minimap math stay testable. The minimap draws roads, the player, police,
// the mission waypoint and enemies onto #minimap (180x180 canvas).
// Element ids follow the HUD contract in the spec.

export const MINIMAP_SIZE = 180;

export function formatMoney(n) {
  const v = Math.round(n ?? 0);
  return '$' + v.toLocaleString('en-US');
}

export function starsText(level) {
  const filled = '★'.repeat(Math.max(0, Math.min(5, level)));
  const empty = '☆'.repeat(5 - filled.length);
  return filled + empty;
}

export function speedText(kmh) {
  return `${Math.round(kmh)} km/h`;
}

export function healthPct(health, max) {
  return Math.max(0, Math.min(100, ((health ?? 0) / (max || 100)) * 100));
}

// World (x, z) -> minimap pixel, given bounds. y grows downwards.
// Bounds may be a scalar half-extent (Builder A's world.bounds = 294)
// or a {minX, maxX, minZ, maxZ} object.
export function worldToMap(x, z, bounds, size) {
  const b = typeof bounds === 'number'
    ? { minX: -bounds, maxX: bounds, minZ: -bounds, maxZ: bounds + 130 }
    : (bounds ?? { minX: -294, maxX: 294, minZ: -294, maxZ: 424 });
  const w = b.maxX - b.minX;
  const h = b.maxZ - b.minZ;
  return {
    x: ((x - b.minX) / w) * size,
    y: ((z - b.minZ) / h) * size,
  };
}

function el(id) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

export function objectiveFor(G) {
  const ms = G.missions;
  if (!ms) return 'Explore Port Meridian';
  const m = ms.active;
  if (!m) {
    const done = ms.done instanceof Set ? ms.done.size : 0;
    if (done >= 8) return 'King of Meridian. The city is yours.';
    // Name the next job, like missions.currentObjective does.
    const next = done + 1;
    const titles = ['First Wheels', 'Courier Run', 'Getaway', 'Rival Rumble',
      'Midnight Race', 'The Pickup', 'Harbor Heist', 'King of Meridian'];
    if (next >= 1 && next <= 8) {
      return `Next job: ${titles[next - 1]} — open the menu (Esc) to start`;
    }
    return 'Open the menu (Esc) to start the next job';
  }
  try {
    return m.def.objective(G, m);
  } catch {
    return 'Mission in progress';
  }
}

export function drawMinimap(ctx, G, size) {
  if (!ctx) return;
  const s = size ?? MINIMAP_SIZE;
  const bounds = (G.world && G.world.bounds) ?? 294;
  const to = (x, z) => worldToMap(x, z, bounds, s);

  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = '#0e1a24';
  ctx.fillRect(0, 0, s, s);

  // Roads (raw form {axis, x1, z1, x2, z2} or {ax, az, bx, bz} segments).
  ctx.strokeStyle = '#4a5a68';
  ctx.lineWidth = 2;
  const roads = (G.world && G.world.roads) || [];
  for (const r of roads) {
    const a = to(r.ax ?? r.x1, r.az ?? r.z1);
    const b = to(r.bx ?? r.x2, r.bz ?? r.z2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Mission waypoint.
  const wp = G.missions && G.missions.active && G.missions.active.data.waypoint;
  if (wp) {
    const p = to(wp.x, wp.z);
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 6);
    ctx.lineTo(p.x + 5, p.y);
    ctx.lineTo(p.x, p.y + 6);
    ctx.lineTo(p.x - 5, p.y);
    ctx.closePath();
    ctx.fill();
  }

  // Enemies (red), traffic (grey), police (blue).
  const dot = (x, z, color, r) => {
    const p = to(x, z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const e of (G.combat && G.combat.enemies) || []) {
    if (e.alive) dot(e.pos.x, e.pos.z, '#ff4d4d', 2.5);
  }
  for (const v of (G.traffic && G.traffic.cars) || []) {
    dot(v.pos.x, v.pos.z, '#9aa5ad', 1.8);
  }
  for (const v of (G.police && G.police.cars) || []) {
    dot(v.pos.x, v.pos.z, '#4d7dff', 2.5);
  }

  // Player: white triangle pointing along the heading.
  const p = G.player;
  if (p) {
    const pt = to(p.pos.x, p.pos.z);
    const h = p.heading ?? 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(pt.x + Math.sin(h) * 6, pt.y - Math.cos(h) * 6);
    ctx.lineTo(pt.x + Math.sin(h + 2.5) * 5, pt.y - Math.cos(h + 2.5) * 5);
    ctx.lineTo(pt.x + Math.sin(h - 2.5) * 5, pt.y - Math.cos(h - 2.5) * 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// --- banner / flashes ----------------------------------------------------

export function showMessage(G, text, duration) {
  const h = G.hud;
  if (!h) return;
  h.message = { text, until: (G.time ? G.time.t : 0) + (duration ?? 4) };
  setText(h.els.message, text);
  if (h.els.message) h.els.message.style.opacity = '1';
}

export function flashWanted(G) {
  const h = G.hud;
  if (!h) return;
  h.wantedFlashUntil = (G.time ? G.time.t : 0) + 0.6;
}

export function flashDamage(G) {
  const h = G.hud;
  if (!h) return;
  h.damageFlashUntil = (G.time ? G.time.t : 0) + 0.35;
}

// Set a one-off objective line (shots.js staging). It wins over the
// computed objective for `duration` seconds, then the game takes over.
export function setObjective(G, text, duration) {
  const h = G.hud;
  if (!h) return;
  h.objectiveOverride = { text, until: (G.time ? G.time.t : 0) + (duration ?? 30) };
  setText(h.els.objective, text);
}

// --- lifecycle -----------------------------------------------------------

export function init(G) {
  const minimap = el('minimap');
  // Replace the (frozen) module namespace on G with the live hud object:
  // cached element handles plus update() and the helpers other modules
  // call (showMessage / flashWanted / flashDamage / setObjective).
  G.hud = {
    els: {
      root: el('hud'),
      healthBar: el('health-bar'),
      healthNum: el('health-num'),
      money: el('money'),
      stars: el('stars'),
      speed: el('speed'),
      objective: el('objective'),
      message: el('message'),
      radio: el('radio'),
      minimap,
      menu: el('menu'),
      pauseMenu: el('pause-menu'),
      endScreen: el('end-screen'),
      tracker: el('mission-tracker'),
      wantedFlash: el('wanted-flash'),
      weapon: el('weapon'),
      district: el('district'),
      clock: el('clock'),
    },
    ctx: minimap && typeof minimap.getContext === 'function' ? minimap.getContext('2d') : null,
    message: null,
    objectiveOverride: null,
    wantedFlashUntil: 0,
    damageFlashUntil: 0,
    lastTracker: '',
    update,
    showMessage: (text, duration) => showMessage(G, text, duration),
    flashWanted: () => flashWanted(G),
    flashDamage: () => flashDamage(G),
    setObjective: (text, duration) => setObjective(G, text, duration),
  };
  return G.hud;
}

export function update(G, dt) {
  const h = G.hud;
  if (!h) return;
  void dt;
  const now = G.time ? G.time.t : 0;
  const p = G.player;
  const pol = G.police;

  // Money and health are canonical on G (main.js / save.js own them).
  const hp = typeof G.health === 'number' ? G.health : (p ? p.health : 100);
  const pct = healthPct(hp, 100);
  if (h.els.healthBar) h.els.healthBar.style.width = `${pct}%`;
  setText(h.els.healthNum, `${Math.ceil(hp)}`);
  setText(h.els.money, formatMoney(typeof G.money === 'number' ? G.money : 0));
  if (p) {
    const pv = G.vehicles ? G.vehicles.playerVehicle : null;
    const kmh = pv ? Math.abs(pv.speed ?? 0) * 3.6 : 0;
    setText(h.els.speed, p.onFoot ? 'On foot' : speedText(kmh));
  }
  if (pol) setText(h.els.stars, starsText(pol.wanted));

  if (h.objectiveOverride && now < h.objectiveOverride.until) {
    setText(h.els.objective, h.objectiveOverride.text);
  } else {
    h.objectiveOverride = null;
    setText(h.els.objective, objectiveFor(G));
  }

  // Radio station name (G.audio.station is an index into CFG.RADIO).
  if (G.audio) {
    const st = G.audio.station;
    let name = '';
    if (typeof st === 'number' && G.cfg && Array.isArray(G.cfg.RADIO)) {
      name = (G.cfg.RADIO[st] && G.cfg.RADIO[st].name) || '';
    } else if (typeof st === 'string') {
      name = st;
    }
    setText(h.els.radio, name ? `♪ ${name}` : '');
  }

  // Weapon + district + clock flavour lines (ids exist in index.html).
  if (G.combat) {
    const w = (G.combat.tuning?.weapons ?? {})[G.combat.weapon];
    setText(h.els.weapon, w ? `${w.name} — ${G.combat.ammo}/${w.mag}` : '');
  }
  if (p && G.world && typeof G.world.districtAt === 'function') {
    setText(h.els.district, G.world.districtAt(p.pos.x, p.pos.z));
  }
  if (G.time) {
    const hh = Math.floor(G.time.dayTime ?? 0) % 24;
    const mm = Math.floor(((G.time.dayTime ?? 0) % 1) * 60);
    setText(h.els.clock, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }

  // Mission tracker: one line per mission, done / current / locked.
  if (h.els.tracker && G.missions) {
    const titles = ['First Wheels', 'Courier Run', 'Getaway', 'Rival Rumble',
      'Midnight Race', 'The Pickup', 'Harbor Heist', 'King of Meridian'];
    const done = G.missions.done instanceof Set ? G.missions.done : new Set();
    const lines = titles.map((title, i) => {
      const num = i + 1;
      const isDone = done.has(num);
      const current = G.missions.current === num;
      const mark = isDone ? '✓' : current ? '▶' : '·';
      return `${mark} ${title}`;
    });
    const text = lines.join('\n');
    if (text !== h.lastTracker) {
      h.lastTracker = text;
      setText(h.els.tracker, text);
    }
  }

  // Banner expiry.
  if (h.message && now > h.message.until) {
    h.message = null;
    if (h.els.message) h.els.message.style.opacity = '0';
  }

  // Wanted flash overlay.
  if (h.els.wantedFlash) {
    const on = pol && pol.wanted > 0 && now < h.wantedFlashUntil;
    h.els.wantedFlash.style.opacity = on ? '1' : '0';
  }
  if (h.els.root) {
    h.els.root.classList.toggle('hurt', now < h.damageFlashUntil);
  }

  drawMinimap(h.ctx, G, MINIMAP_SIZE);
}
