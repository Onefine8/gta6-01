// The HUD: cash, health, wanted stars, speed, mission objective, messages and
// the minimap. Drawn in screen space (1280 x 720) on top of the world view.
import { FIELD, FONT, PACKAGES_TOTAL, PALETTE, SITES, WORLD } from './config.js';
import { MISSION_DEFS, objectiveText, taxiObjective } from './missions.js';
import { mission2ObjectivePos, objectiveText2 } from './missions2.js';
import { mission3ObjectivePos, objectiveText3 } from './missions3.js';
import { mission4ObjectivePos, objectiveText4 } from './missions4.js';
import { smugglingObjective, smugglingObjectiveText } from './smuggling.js';
import { BUSINESS_DEFS, ownedCount, totalTill } from './business.js';
import { RACE_CIRCUITS, currentRaceCheckpoint, racePositionText } from './races.js';
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
  // Race start flags (checkered squares) and, mid-race, the rivals.
  ctx.fillStyle = '#fff';
  for (const c of RACE_CIRCUITS) {
    ctx.fillRect(MM.x + c.start.x * sx - 3, MM.y + c.start.y * sy - 3, 6, 6);
  }
  if (state.race.active) {
    for (const rival of state.race.rivals) {
      ctx.fillStyle = rival.color;
      ctx.beginPath();
      ctx.arc(MM.x + rival.x * sx, MM.y + rival.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Businesses: gold $ for sale, green $ once Rico owns the place.
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  for (const b of BUSINESS_DEFS) {
    ctx.fillStyle = state.business && state.business.owned[b.id] ? PALETTE.health : PALETTE.gold;
    ctx.fillText('$', MM.x + b.x * sx, MM.y + b.y * sy + 3);
  }
  // Bay Auto Mall (gold D), Dockside Pier (orange S) and the auction
  // house (white A), so Rico can find the new round-6 spots at a glance.
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText('D', MM.x + SITES.dealership.x * sx, MM.y + SITES.dealership.y * sy + 3);
  ctx.fillStyle = '#fb923c';
  ctx.fillText('S', MM.x + SITES.dock.x * sx, MM.y + SITES.dock.y * sy + 3);
  ctx.fillStyle = '#fff';
  ctx.fillText('A', MM.x + SITES.auction.x * sx, MM.y + SITES.auction.y * sy + 3);
  ctx.textAlign = 'left';
  // Garage (green G), hospital (white cross), bank (gold B) and roadblocks (orange).
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.garage;
  ctx.fillText('G', MM.x + SITES.garage.x * sx, MM.y + SITES.garage.y * sy + 3);
  ctx.fillStyle = '#fff';
  ctx.fillText('+', MM.x + SITES.hospital.x * sx, MM.y + SITES.hospital.y * sy + 3);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText('B', MM.x + SITES.bank.x * sx, MM.y + SITES.bank.y * sy + 3);
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
  if (state.race.active) return currentRaceCheckpoint(state.race);
  // The newest arc owns the arrow while it runs, then the older arcs.
  if (state.missions4 && state.missions4.active) return mission4ObjectivePos(state.missions4, state);
  if (state.missions3 && state.missions3.active) return mission3ObjectivePos(state.missions3, state);
  if (state.missions2 && state.missions2.active) return mission2ObjectivePos(state.missions2);
  // A live smuggling run owns the arrow once the story arcs are quiet.
  if (state.smuggling && state.smuggling.active) return smugglingObjective(state.smuggling);
  if (!m.active || m.index >= MISSION_DEFS.length) {
    const taxi = taxiObjective(m);
    return taxi ? { x: taxi.x, y: taxi.y } : null;
  }
  const step = MISSION_DEFS[m.index].steps[m.step];
  if (!step) return null;
  if (step.kind === 'escape') return null;
  return { x: step.x, y: step.y };
}

// The objective line for the HUD: the running arc owns it, and when no
// arc is running the next unstarted arc owns the M prompt.
export function currentObjectiveLine(state) {
  if (state.missions4 && state.missions4.active) return objectiveText4(state.missions4);
  if (state.missions3 && state.missions3.active) return objectiveText3(state.missions3);
  if (state.missions2 && state.missions2.active) return objectiveText2(state.missions2);
  if (state.missions && state.missions.active) return objectiveText(state.missions);
  if (state.missions4 && state.missions4.index < 3) return objectiveText4(state.missions4);
  if (state.missions3 && state.missions3.index < 3) return objectiveText3(state.missions3);
  if (state.missions2 && state.missions2.index < 3) return objectiveText2(state.missions2);
  return objectiveText(state.missions);
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
  // Business empire line: how many properties Rico owns and what is waiting
  // in their tills. Shown under the top-left panel once he owns something
  // or a till is filling (the stamina bar owns the panel's bottom row).
  if (state.business && (ownedCount(state.business) > 0 || totalTill(state.business) > 0)) {
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.fillRect(14, 112, 300, 22);
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(`Businesses ${ownedCount(state.business)}/${BUSINESS_DEFS.length} — till $${totalTill(state.business)} (B to collect)`, 26, 117);
  }
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
  const obj = currentObjectiveLine(state);
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
  // Smuggling run line, when a crate is live (below the taxi line when
  // both are running, so the two never share a row).
  if (state.smuggling && state.smuggling.active) {
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillStyle = '#fb923c';
    ctx.textAlign = 'center';
    ctx.fillText(`SMUGGLING: ${smugglingObjectiveText(state.smuggling)}`, FIELD.width / 2, taxi ? 156 : 134);
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
  // Smuggling and dealership prompts when Rico is standing on the spot.
  const nearDock = !state.player.inCar && nearSite('dock', px0, py0);
  const nearMall = nearSite('dealership', px0, py0);
  if (nearDock && !(state.smuggling && state.smuggling.active)) {
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillStyle = '#fb923c';
    ctx.textAlign = 'center';
    ctx.fillText('Z — Start a smuggling run (pick up a crate, $300 and up)', FIELD.width / 2, 178);
    ctx.textAlign = 'left';
  } else if (nearMall) {
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    ctx.textAlign = 'center';
    ctx.fillText(state.player.inCar ? 'O — Trade this car in at Bay Auto Mall' : 'O — Buy the featured car at Bay Auto Mall', FIELD.width / 2, 178);
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
    ctx.fillText('E — car   Q — punch   M — mission   R — race   T — taxi   B — business   G — repair   U — tune   V/J/K — casino   Z — smuggling   O — dealer   C — horn   H — help   P — pause', 16, FIELD.height - 28);
  }
  // Race timer: circuit name, clock, checkpoint and live position.
  if (state.race.active) {
    const circuit = RACE_CIRCUITS[state.race.circuitIndex];
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'center';
    ctx.fillText(`${circuit.name}  ${state.race.timer.toFixed(1)}s — checkpoint ${state.race.checkpoint + 1}/${circuit.checkpoints.length} — ${racePositionText(state.race)}`, FIELD.width / 2, 112);
    ctx.textAlign = 'left';
  }
  // Heist meters: vault-crack progress and the rising alarm, for the
  // Downtown Heist (mission 5) and the kingpin's safe (mission 7).
  // (Drawn below the countdown so the two never share a line.)
  if (state.missions.active && ((state.missions.index === 4 && state.missions.step >= 1) || (state.missions.index === 6 && state.missions.step >= 2))) {
    const heist = state.missions.heist;
    const barY = 158;
    const crackLabel = state.missions.index === 6 ? 'SAFE' : 'VAULT';
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`${crackLabel} ${Math.round(heist.crack * 100)}%`, FIELD.width / 2 - 130, barY + 4);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(FIELD.width / 2 - 60, barY, 120, 12);
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(FIELD.width / 2 - 60, barY, 120 * Math.max(0, Math.min(1, heist.crack)), 12);
    ctx.fillStyle = heist.alarm > 70 ? '#ff6b6b' : '#fb923c';
    ctx.fillText(`ALARM ${Math.round(heist.alarm)}%`, FIELD.width / 2 + 130, barY + 4);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(FIELD.width / 2 + 190, barY, 120, 12);
    ctx.fillStyle = heist.alarm > 70 ? '#ff6b6b' : '#fb923c';
    ctx.fillRect(FIELD.width / 2 + 190, barY, 120 * Math.max(0, Math.min(1, heist.alarm / 100)), 12);
    ctx.textAlign = 'left';
  }
  // Container Heist meters: how cracked the lock is, and how spotted Rico
  // is by the patrol guards.
  if (state.missions.active && state.missions.index === 5 && state.missions.step === 1) {
    const sneak = state.missions.sneak;
    const barY = 158;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`LOCK ${Math.round(sneak.progress * 100)}%`, FIELD.width / 2 - 130, barY + 4);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(FIELD.width / 2 - 60, barY, 120, 12);
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(FIELD.width / 2 - 60, barY, 120 * Math.max(0, Math.min(1, sneak.progress)), 12);
    ctx.fillStyle = sneak.spot > 70 ? '#ff6b6b' : '#fb923c';
    ctx.fillText(`SPOTTED ${Math.round(sneak.spot)}%`, FIELD.width / 2 + 130, barY + 4);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(FIELD.width / 2 + 190, barY, 120, 12);
    ctx.fillStyle = sneak.spot > 70 ? '#ff6b6b' : '#fb923c';
    ctx.fillRect(FIELD.width / 2 + 190, barY, 120 * Math.max(0, Math.min(1, sneak.spot / 100)), 12);
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
