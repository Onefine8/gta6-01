// Drawing only: the city, the cars, the people, the weather and the screens.
// The camera follows the player (or his car) across the 3200 x 2400 world and
// paints a 1280 x 720 window of it, scaled to the browser window.
import { CITY, FIELD, FONT, PALETTE, TITLE_FONT, WORLD } from './config.js';
import { drawHud } from './hud.js';
import { onBeach, inWater, roadXs, roadYs } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  const rainDrops = [];
  for (let i = 0; i < 160; i += 1) rainDrops.push({ x: Math.random() * FIELD.width, y: Math.random() * FIELD.height, s: 9 + Math.random() * 7 });

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    view.x = (canvas.width - FIELD.width * view.scale) / 2;
    view.y = (canvas.height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, font) {
    const key = `${size}|${font || FONT}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${font || FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function skyColor(time) {
    if (time.isNight) return '#0d1526';
    if (time.hour > 17.5) return '#e88a4a';
    if (time.hour < 7.5) return '#c97e5a';
    return time.raining ? '#7d8aa0' : '#8ec9ee';
  }

  function drawGround(state, cam) {
    const { x: cx, y: cy } = cam;
    const x0 = Math.max(0, cx - FIELD.width / 2 - 40);
    const y0 = Math.max(0, cy - FIELD.height / 2 - 40);
    const x1 = Math.min(WORLD.width, cx + FIELD.width / 2 + 40);
    const y1 = Math.min(WORLD.height, cy + FIELD.height / 2 + 40);
    // Grass base.
    context.fillStyle = state.time.isNight ? '#2c4a26' : PALETTE.grass;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Mow stripes.
    context.fillStyle = state.time.isNight ? '#27421f' : PALETTE.grassDark;
    for (let gy = Math.floor(y0 / 120) * 120; gy < y1; gy += 240) {
      context.fillRect(x0, gy, x1 - x0, 120);
    }
    // Beach + water along the south edge.
    context.fillStyle = PALETTE.sand;
    context.fillRect(x0, Math.max(y0, CITY.beachY), x1 - x0, Math.max(0, Math.min(y1, CITY.waterY) - Math.max(y0, CITY.beachY)));
    context.fillStyle = state.time.isNight ? '#16324a' : PALETTE.water;
    context.fillRect(x0, Math.max(y0, CITY.waterY), x1 - x0, Math.max(0, y1 - Math.max(y0, CITY.waterY)));
    context.fillStyle = 'rgba(255,255,255,0.25)';
    for (let wx = Math.floor(x0 / 260) * 260; wx < x1; wx += 260) {
      context.fillRect(wx, CITY.waterY + 30 + ((wx / 260) % 3) * 18, 120, 3);
    }
    // Park.
    const park = state.city.park;
    context.fillStyle = state.time.isNight ? '#1e3d1a' : PALETTE.park;
    context.fillRect(park.x, park.y, park.w, park.h);
    context.fillStyle = state.time.isNight ? '#2a5a2a' : '#5aa84f';
    context.beginPath();
    context.arc(park.x + park.w / 2, park.y + park.h / 2, 46, 0, Math.PI * 2);
    context.fill();
    // Roads.
    context.fillStyle = PALETTE.road;
    for (const rx of roadXs()) context.fillRect(rx - CITY.roadWidth / 2, 0, CITY.roadWidth, CITY.beachY);
    for (const ry of roadYs()) context.fillRect(0, ry - CITY.roadWidth / 2, WORLD.width, CITY.roadWidth);
    // Lane dashes.
    context.fillStyle = PALETTE.lane;
    for (const rx of roadXs()) {
      for (let y = 0; y < CITY.beachY; y += 64) context.fillRect(rx - 3, y, 6, 30);
    }
    for (const ry of roadYs()) {
      for (let x = 0; x < WORLD.width; x += 64) context.fillRect(x, ry - 3, 30, 6);
    }
    // Sidewalks.
    context.strokeStyle = PALETTE.sidewalk;
    context.lineWidth = 10;
    for (const rx of roadXs()) {
      context.beginPath(); context.moveTo(rx - CITY.roadWidth / 2 - 6, 0); context.lineTo(rx - CITY.roadWidth / 2 - 6, CITY.beachY); context.stroke();
      context.beginPath(); context.moveTo(rx + CITY.roadWidth / 2 + 6, 0); context.lineTo(rx + CITY.roadWidth / 2 + 6, CITY.beachY); context.stroke();
    }
  }

  function drawBuildings(state, cam) {
    for (const b of state.city.buildings) {
      if (b.x > cam.x + FIELD.width / 2 + 80 || b.x + b.w < cam.x - FIELD.width / 2 - 80) continue;
      if (b.y > cam.y + FIELD.height / 2 + 80 || b.y + b.h < cam.y - FIELD.height / 2 - 80) continue;
      context.fillStyle = state.time.isNight ? '#3a3f4a' : b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // Windows.
      context.fillStyle = state.time.isNight ? '#ffd23f' : 'rgba(255,255,255,0.55)';
      for (let wx = b.x + 16; wx < b.x + b.w - 14; wx += 34) {
        for (let wy = b.y + 16; wy < b.y + b.h - 14; wy += 34) {
          if (((wx + wy) / 34) % 3 !== 0) context.fillRect(wx, wy, 14, 12);
        }
      }
      if (b.name) {
        context.font = `bold 15px ${FONT}`;
        context.fillStyle = '#fff';
        context.textAlign = 'center';
        context.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2);
        context.textAlign = 'left';
      }
    }
    for (const t of state.city.trees) {
      if (t.x > cam.x + FIELD.width / 2 + 40 || t.x < cam.x - FIELD.width / 2 - 40) continue;
      if (t.y > cam.y + FIELD.height / 2 + 40 || t.y < cam.y - FIELD.height / 2 - 40) continue;
      context.fillStyle = '#5a4632';
      context.fillRect(t.x - 3, t.y - 3, 6, 8);
      context.fillStyle = state.time.isNight ? '#1d4a1d' : PALETTE.treeLight;
      context.beginPath();
      context.arc(t.x, t.y - 6, t.r, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCarShape(car, isPolice) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-28, -14, 56, 28);
    context.fillStyle = car.color;
    context.fillRect(-27, -13, 54, 26);
    context.fillStyle = 'rgba(180,220,255,0.85)';
    context.fillRect(-6, -11, 14, 22);
    context.fillStyle = '#222';
    context.fillRect(-24, -14, 8, 5);
    context.fillRect(-24, 9, 8, 5);
    context.fillRect(16, -14, 8, 5);
    context.fillRect(16, 9, 8, 5);
    context.fillStyle = '#fff8c0';
    context.fillRect(25, -10, 3, 6);
    context.fillRect(25, 4, 3, 6);
    if (isPolice) {
      const red = Math.sin(car.lightPhase || 0) > 0;
      context.fillStyle = red ? '#ff3b30' : '#3b82f6';
      context.fillRect(-4, -13, 10, 6);
      context.fillStyle = red ? '#3b82f6' : '#ff3b30';
      context.fillRect(-4, 7, 10, 6);
      context.fillStyle = '#fff';
      context.font = `bold 9px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('PBPD', 0, 3);
      context.textAlign = 'left';
    }
    context.restore();
    // Damage smoke.
    if (car.health < 45 && car.health > 0) {
      context.fillStyle = 'rgba(120,120,120,0.5)';
      context.beginPath();
      context.arc(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 8 + Math.random() * 6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPerson(x, y, angle, color, phase, running) {
    const bob = running ? Math.sin(phase) * 3 : Math.sin(phase) * 1.5;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath(); context.ellipse(0, 4, 12, 6, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = color;
    context.beginPath(); context.arc(0, 0, 11, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#f2c9a0';
    context.beginPath(); context.arc(8, 0, 6, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#222';
    context.lineWidth = 3;
    context.beginPath(); context.moveTo(-6, -8); context.lineTo(-12, -8 + bob); context.stroke();
    context.beginPath(); context.moveTo(-6, 8); context.lineTo(-12, 8 - bob); context.stroke();
    context.restore();
  }

  function drawPackages(state) {
    for (const p of state.city.packages) {
      if (p.taken) continue;
      const pulse = 1 + Math.sin(state.elapsed * 4 + p.x) * 0.15;
      context.save();
      context.translate(p.x, p.y);
      context.scale(pulse, pulse);
      context.fillStyle = PALETTE.gold;
      context.fillRect(-9, -7, 18, 14);
      context.fillStyle = '#b8860b';
      context.fillRect(-2, -7, 4, 14);
      context.fillRect(-9, -2, 18, 4);
      context.restore();
    }
  }

  function drawObjective(state) {
    const obj = state.objectivePos;
    if (!obj) return;
    const px = state.player.inCar ? state.player.inCar.x : state.player.x;
    const py = state.player.inCar ? state.player.inCar.y : state.player.y;
    const dx = obj.x - px;
    const dy = obj.y - py;
    const dist = Math.hypot(dx, dy);
    // Beacon at the target when it is on screen.
    const beam = 0.5 + Math.sin(state.elapsed * 3) * 0.2;
    context.fillStyle = `rgba(255,90,90,${beam})`;
    context.beginPath();
    context.arc(obj.x, obj.y, 26, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ff5a5a';
    context.beginPath();
    context.arc(obj.x, obj.y, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff';
    context.font = `bold 13px ${FONT}`;
    context.textAlign = 'center';
    context.fillText('★', obj.x, obj.y + 4);
    context.textAlign = 'left';
    // Off-screen arrow at the screen edge.
    if (dist > 420) {
      const ang = Math.atan2(dy, dx);
      const ax = px + Math.cos(ang) * 300;
      const ay = py + Math.sin(ang) * 300;
      context.save();
      context.translate(ax, ay);
      context.rotate(ang);
      context.fillStyle = '#ff5a5a';
      context.beginPath();
      context.moveTo(18, 0); context.lineTo(-10, -12); context.lineTo(-10, 12); context.closePath();
      context.fill();
      context.restore();
    }
  }

  function drawRain() {
    context.strokeStyle = PALETTE.rain;
    context.lineWidth = 2;
    context.beginPath();
    for (const d of rainDrops) {
      context.moveTo(d.x, d.y);
      context.lineTo(d.x - 4, d.y + d.s);
    }
    context.stroke();
    for (const d of rainDrops) {
      d.y += d.s * 1.6;
      d.x -= 1.5;
      if (d.y > FIELD.height) { d.y = -20; d.x = Math.random() * (FIELD.width + 100); }
    }
  }

  function drawPanel(title, lines, prompt) {
    const w = 640;
    const h = 150 + lines.length * 34;
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, w, h);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 3;
    context.strokeRect(x, y, w, h);
    text(title, FIELD.width / 2, y + 66, 46, '#ffd23f', 'center', TITLE_FONT);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 118 + i * 34, 20, '#e2e8f0', 'center');
    }
    text(prompt, FIELD.width / 2, y + h - 26, 20, PALETTE.gold, 'center');
  }

  function drawTitle(state, best) {
    // A living backdrop: the city at golden hour with traffic rolling past.
    const cam = { x: 1600, y: 1100 };
    context.save();
    context.translate(FIELD.width / 2 - cam.x, FIELD.height / 2 - cam.y);
    drawGround(state, cam);
    drawBuildings(state, cam);
    for (const car of state.traffic) drawCarShape(car, false);
    context.restore();
    context.fillStyle = 'rgba(8,12,20,0.45)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('PALMETTO BAY HEAT', FIELD.width / 2, 120, 64, '#ffd23f', 'center', TITLE_FONT);
    text('An open-world crime story — steal, drive, race, and outrun the law.', FIELD.width / 2, 168, 20, '#e2e8f0', 'center');
    const lines = [
      'WASD / Arrows — move & drive    E — enter / exit car    Q — punch',
      'M — start mission    R — street race    P — pause    N — mute',
      `Missions done: ${state.missionsDone}   Packages: ${state.missions.packagesFound}/${12}   Best race: ${state.missions.race.best ? state.missions.race.best.toFixed(1) + 's' : '—'}`,
      'Save: progress is kept in this browser automatically.',
    ];
    drawPanel(' ', lines, 'Press Space or click to start');
  }

  function drawWorld(state) {
    const focus = state.player.inCar || state.player;
    const cam = {
      x: Math.max(FIELD.width / 2 - 60, Math.min(WORLD.width - FIELD.width / 2 + 60, focus.x)),
      y: Math.max(FIELD.height / 2 - 60, Math.min(WORLD.height - FIELD.height / 2 + 60, focus.y)),
    };
    // Clamp the camera fully inside the world when the world is bigger than the view.
    cam.x = Math.max(FIELD.width / 2, Math.min(WORLD.width - FIELD.width / 2, focus.x));
    cam.y = Math.max(FIELD.height / 2, Math.min(WORLD.height - FIELD.height / 2, focus.y));
    context.save();
    context.translate(FIELD.width / 2 - cam.x, FIELD.height / 2 - cam.y);
    drawGround(state, cam);
    drawBuildings(state, cam);
    drawPackages(state);
    // Race checkpoints.
    if (state.missions.race.active) {
      const cp = state.raceCheckpoints[state.missions.race.checkpoint];
      context.fillStyle = 'rgba(255,210,63,0.5)';
      context.beginPath(); context.arc(cp.x, cp.y, 46, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#ffd23f';
      context.font = `bold 26px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(`${state.missions.race.checkpoint + 1}`, cp.x, cp.y + 9);
      context.textAlign = 'left';
    }
    drawObjective(state);
    for (const car of state.parkedCars) drawCarShape(car, false);
    for (const car of state.traffic) drawCarShape(car, false);
    for (const car of state.police.cars) drawCarShape(car, true);
    for (const ped of state.peds) drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.walkPhase, ped.fleeing);
    if (!state.player.inCar) {
      const p = state.player;
      // A white ring marks Rico on foot so he never blends into a crowd.
      context.strokeStyle = 'rgba(255,255,255,0.9)';
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(p.x, p.y, 18, 0, Math.PI * 2);
      context.stroke();
      if (p.invulnerable <= 0 || Math.floor(p.invulnerable * 10) % 2 === 1) {
        drawPerson(p.x, p.y, p.angle, PALETTE.playerShirt, state.elapsed * 8, p.running);
      }
      if (p.punchAnim > 0) {
        context.strokeStyle = 'rgba(255,255,255,0.8)';
        context.lineWidth = 4;
        context.beginPath();
        context.arc(p.x + Math.cos(p.angle) * 30, p.y + Math.sin(p.angle) * 30, 12, 0, Math.PI * 2);
        context.stroke();
      }
    } else {
      drawCarShape(state.player.inCar, false);
    }
    context.restore();
    // Night + rain overlays in screen space.
    if (state.time.isNight) {
      context.fillStyle = 'rgba(8,12,30,0.34)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (state.time.raining) drawRain();
  }

  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0d1526';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.fillStyle = skyColor(state.time);
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawWorld(state);
    drawHud(context, state, state.time);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.', 'Progress is saved automatically.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('Wasted', [`Rico is down. The city keeps moving.`, `Cash kept: $${state.player.money}`], 'Press Space to get back up');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('Busted', ['The PBPD caught up with Rico.', `Bail cost $${state.bailCost || 150} — the heat is off, for now.`], 'Press Space to walk free');
    }
    if (state.missions.failed && screen === SCREEN_PLAY) {
      drawPanel('Mission Failed', [state.missions.failText], 'Press M to retry the mission');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize };
}
