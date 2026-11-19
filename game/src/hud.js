// The HUD: cash, health, wanted stars, speed, mission objective, messages and
// the minimap. Drawn in screen space (1280 x 720) on top of the world view.
import { FIELD, FONT, PACKAGES_TOTAL, PALETTE, SITES, WORLD } from './config.js';
import { MISSION_DEFS, RACE, objectiveText, taxiObjective } from './missions.js';
import { districtAt, nearSite } from './world.js';

const MM = { x: FIELD.width - 236, y: 16, w: 220, h: 164 };

function stars(ctx, wanted, x, y, size) {
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < wanted ? '#ffd23f' : 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    const cx = x + i * (size + 6) + size / 2;
    const cy = y + size / 2;
    for (let p = 0; p < 10; p += 1) {
      const r = p % 2 === 0 ? size / 2 : size / 4;
      const a = -Math.PI / 2 + (p * Math.PI) / 5;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}

export function drawMinimap(ctx, state, city) {
  const sx = MM.w / WORLD.width;
  const sy = MM.h / WORLD.height;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.85)';
  ctx.fillRect(MM.x - 4, MM.y - 4, MM.w + 8, MM.h + 8);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(MM.x - 4, MM.y - 4, MM.w + 8, MM.h + 8);
  ctx.beginPath();
  ctx.rect(MM.x, MM.y, MM.w, MM.h);
  ctx.clip();
  // Water + beach + park.
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(MM.x, MM.y + 2220 * sy, MM.w, MM.h);
  ctx.fillStyle = '#e8d39a';
  ctx.fillRect(MM.x, MM.y + 2100 * sy, MM.w, (2220 - 2100) * sy);
  ctx.fillStyle = '#3f8a3a';
  ctx.fillRect(MM.x + city.park.x * sx, MM.y + city.park.y * sy, city.park.w * sx, city.park.h * sy);
  // Roads.
  ctx.fillStyle = '#6a7078';
  for (let x = 400; x < WORLD.width; x += 400) ctx.fillRect(MM.x + x * sx - 3, MM.y, 6, MM.h);
  for (let y = 400; y < 2220; y += 400) ctx.fillRect(MM.x, MM.y + y * sy - 3, MM.w, 6);
  // Packages.
  ctx.fillStyle = PALETTE.gold;
  for (const p of city.packages) {
    if (p.taken) continue;
    ctx.fillRect(MM.x + p.x * sx - 2, MM.y + p.y * sy - 2, 4, 4);
  }
  // Mission objective.
  const obj = currentObjectivePos(state);
  if (obj) {
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath();
    ctx.arc(MM.x + obj.x * sx, MM.y + obj.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Taxi passenger (cyan) and drop-off (cyan ring).
  const taxi = state.missions.taxi;
  if (taxi.active) {
    const tx = taxi.phase === 'pickup' ? taxi.px : taxi.dx;
    const ty = taxi.phase === 'pickup' ? taxi.py : taxi.dy;
    ctx.fillStyle = PALETTE.taxi;
    ctx.beginPath();
    ctx.arc(MM.x + tx * sx, MM.y + ty * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Garage (green G), hospital (white cross) and roadblocks (orange).
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.garage;
  ctx.fillText('G', MM.x + SITES.garage.x * sx, MM.y + SITES.garage.y * sy + 3);
  ctx.fillStyle = '#fff';
  ctx.fillText('+', MM.x + SITES.hospital.x * sx, MM.y + SITES.hospital.y * sy + 3);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.roadblock;
  for (const rb of state.police.roadblocks) {
    ctx.fillRect(MM.x + rb.x * sx - 3, MM.y + rb.y * sy - 3, 6, 6);
  }
  // Police helicopter (red ring) when it is overhead.
  if (state.police.heli) {
    ctx.strokeStyle = PALETTE.heli;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(MM.x + state.police.heli.x * sx, MM.y + state.police.heli.y * sy, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Police (blue) and player (yellow, with a direction tick).
  ctx.fillStyle = '#3b82f6';
  for (const car of state.police.cars) {
    ctx.fillRect(MM.x + car.x * sx - 2, MM.y + car.y * sy - 2, 4, 4);
  }
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(MM.x + px * sx, MM.y + py * sy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#10141b';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export function currentObjectivePos(state) {
  const m = state.missions;
  if (m.race.active) return RACE.checkpoints[m.race.checkpoint];
  if (!m.active || m.index >= MISSION_DEFS.length) {
    const taxi = taxiObjective(m);
    return taxi ? { x: taxi.x, y: taxi.y } : null;
  }
  const step = MISSION_DEFS[m.index].steps[m.step];
  if (!step) return null;
  if (step.kind === 'escape') return null;
  return { x: step.x, y: step.y };
}

export function drawHud(ctx, state, time) {
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  // Top-left: cash, health bar, wanted stars.
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.fillRect(14, 12, 300, 96);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(14, 12, 300, 96);
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillStyle = '#4ade80';
  ctx.fillText(`$${state.player.money}`, 26, 20);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`Packages ${state.missions.packagesFound}/${PACKAGES_TOTAL}`, 26, 56);
  // Health bar.
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(26, 80, 180, 14);
  ctx.fillStyle = state.player.health > 30 ? PALETTE.health : PALETTE.healthLow;
  ctx.fillRect(26, 80, 180 * Math.max(0, state.player.health / 100), 14);
  ctx.fillStyle = '#fff';
  ctx.font = `13px ${FONT}`;
  ctx.fillText('HEALTH', 214, 79);
  // Stamina bar, on foot only: sprinting drains it, walking refills it.
  if (!state.player.inCar) {
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(26, 98, 180, 8);
    ctx.fillStyle = state.player.stamina > 25 ? '#38bdf8' : '#f97316';
    ctx.fillRect(26, 98, 180 * Math.max(0, state.player.stamina / 100), 8);
  }
  stars(ctx, state.wanted, 330, 18, 26);
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillStyle = state.wanted > 0 ? '#ff6b6b' : '#94a3b8';
  ctx.fillText(state.wanted > 0 ? 'WANTED' : 'CLEAN', 330, 52);
  // Clock + weather, top centre.
  const hour = Math.floor(time.hour);
  const min = Math.floor((time.hour - hour) * 60);
  const clock = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  ctx.font = `bold 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(`${clock}  ${time.raining ? 'RAIN' : time.isNight ? 'NIGHT' : 'DAY'}`, FIELD.width / 2, 18);
  ctx.textAlign = 'left';
  // Objective bar, under the clock.
  const obj = objectiveText(state.missions);
  ctx.font = `bold 18px ${FONT}`;
  const w = ctx.measureText(obj).width + 28;
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.fillRect((FIELD.width - w) / 2, 52, w, 32);
  ctx.fillStyle = '#ffd23f';
  ctx.textAlign = 'center';
  ctx.fillText(obj, FIELD.width / 2, 59);
  ctx.textAlign = 'left';
  // District name, under the objective: Rico always knows where he is.
  const px0 = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py0 = state.player.inCar ? state.player.inCar.y : state.player.y;
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = '#cbd5e1';
  ctx.textAlign = 'center';
  ctx.fillText(districtAt(px0, py0), FIELD.width / 2, 90);
  ctx.textAlign = 'left';
  // Taxi job line, when a fare is running.
  const taxi = taxiObjective(state.missions);
  if (taxi) {
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillStyle = PALETTE.taxi;
    ctx.textAlign = 'center';
    ctx.fillText(`TAXI: ${taxi.text} — ${Math.ceil(state.missions.taxi.timer)}s`, FIELD.width / 2, 134);
    ctx.textAlign = 'left';
  }
  // Garage / hospital prompt when Rico is in range and can pay.
  const nearGarage = state.player.inCar && nearSite('garage', px0, py0);
  const nearHospital = !state.player.inCar && nearSite('hospital', px0, py0);
  if (nearGarage && state.player.inCar.health < 100) {
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillStyle = PALETTE.garage;
    ctx.textAlign = 'center';
    ctx.fillText('G — Repair this car for $50', FIELD.width / 2, 156);
    ctx.textAlign = 'left';
  } else if (nearHospital && state.player.health < 100) {
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('G — Patch up at Bay General for $30', FIELD.width / 2, 156);
    ctx.textAlign = 'left';
  }
  // Event feed: the last few things that happened, bottom-right.
  if (state.feed && state.feed.length > 0) {
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'right';
    state.feed.slice(-3).forEach((line, i) => {
      ctx.fillStyle = `rgba(255,255,255,${0.9 - i * 0.25})`;
      ctx.fillText(line, FIELD.width - 16, FIELD.height - 196 + i * 20);
    });
    ctx.textAlign = 'left';
  }
  // Speed + car health, bottom-left when driving.
  if (state.player.inCar) {
    const car = state.player.inCar;
    const mph = Math.round(Math.abs(car.speed) * 0.12);
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.fillRect(14, FIELD.height - 96, 220, 82);
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`${mph}`, 26, FIELD.height - 92);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('MPH', 96, FIELD.height - 76);
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(car.model.toUpperCase(), 26, FIELD.height - 40);
    if (car.drifting) {
      ctx.fillStyle = '#fb923c';
      ctx.fillText('DRIFT!', 150, FIELD.height - 58);
    }
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(150, FIELD.height - 38, 70, 10);
    ctx.fillStyle = car.health > 30 ? PALETTE.health : PALETTE.healthLow;
    ctx.fillRect(150, FIELD.height - 38, 70 * Math.max(0, car.health / 100), 10);
  } else {
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('E — car   Q — punch   M — mission   R — race   T — taxi   G — repair   C — horn   H — help   P — pause', 16, FIELD.height - 28);
  }
  // Race timer.
  if (state.missions.race.active) {
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'center';
    ctx.fillText(`RACE ${state.missions.race.timer.toFixed(1)}s — checkpoint ${state.missions.race.checkpoint + 1}/4`, FIELD.width / 2, 112);
    ctx.textAlign = 'left';
  }
  // Mission countdown.
  if (state.missions.active && state.missions.timer > 0) {
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillStyle = state.missions.timer < 30 ? '#ff6b6b' : '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(`⏱ ${Math.ceil(state.missions.timer)}s`, FIELD.width / 2, 112);
    ctx.textAlign = 'left';
  }
  // Toast message.
  if (state.missions.messageTimer > 0 && state.missions.message) {
    ctx.font = `bold 20px ${FONT}`;
    const mw = ctx.measureText(state.missions.message).width + 32;
    ctx.fillStyle = 'rgba(12,16,24,0.85)';
    ctx.fillRect((FIELD.width - mw) / 2, FIELD.height - 150, mw, 36);
    ctx.fillStyle = '#4ade80';
    ctx.textAlign = 'center';
    ctx.fillText(state.missions.message, FIELD.width / 2, FIELD.height - 142);
    ctx.textAlign = 'left';
  }
  // Intro dialog.
  if (state.missions.introTimer > 0 && state.missions.introText) {
    ctx.fillStyle = 'rgba(12,16,24,0.9)';
    ctx.fillRect(140, FIELD.height - 210, FIELD.width - 280, 54);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(140, FIELD.height - 210, FIELD.width - 280, 54);
    ctx.font = `17px ${FONT}`;
    ctx.fillStyle = '#fff';
    wrapText(ctx, state.missions.introText, 160, FIELD.height - 200, FIELD.width - 320, 22);
  }
  drawMinimap(ctx, state, state.city);
}

export function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
