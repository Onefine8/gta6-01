// The Palmetto Bay Police Department: patrol cars that spawn at the map edge when
// the wanted level rises, chase the player, ram his car, and bust him on foot.
// Wanted stars decay only while no police car can see the player.
import { WANTED, WORLD } from './config.js';
import { nearestRoadPoint } from './world.js';

export function createPolice() {
  return { cars: [], spawnTimer: 0, seenTimer: 0, nextId: 1, roadblocks: [], roadblockTimer: 18, heli: null, pitTimer: 0 };
}

export function addWanted(state, stars) {
  state.wanted = Math.max(0, Math.min(WANTED.max, state.wanted + stars));
  if (state.wanted > 0) state.wantedTimer = WANTED.decaySeconds;
}

export function stepPolice(police, state, dt, random) {
  const target = state.player.inCar ? state.player.inCar : state.player;
  const want = WANTED.maxPolice[state.wanted] || 0;
  police.spawnTimer -= dt;
  if (police.cars.length < want && police.spawnTimer <= 0) {
    police.spawnTimer = 1.2;
    const edge = Math.floor(random() * 4);
    let x = 200;
    let y = 200;
    if (edge === 0) { x = target.x - 700; y = target.y - 500; }
    if (edge === 1) { x = target.x + 700; y = target.y - 500; }
    if (edge === 2) { x = target.x - 700; y = target.y + 500; }
    if (edge === 3) { x = target.x + 700; y = target.y + 500; }
    const road = nearestRoadPoint(x, y);
    police.cars.push({
      id: police.nextId,
      x: Math.max(60, Math.min(WORLD.width - 60, road.x)),
      y: Math.max(60, Math.min(WORLD.height - 60, road.y)),
      angle: 0, speed: 0, health: 100,
      color: '#1d4ed8', model: 'PBPD Cruiser', topSpeed: WANTED.policeSpeed[state.wanted],
      parked: false, driver: 'police', stolen: false, lightPhase: random() * Math.PI * 2,
    });
    police.nextId += 1;
  }
  // Too many cruisers for the current heat: the extras peel off and despawn.
  while (police.cars.length > want) police.cars.pop();
  // At 3+ stars the PBPD sets roadblocks ahead of the player on his road.
  police.roadblockTimer -= dt;
  if (state.wanted >= WANTED.roadblockStars && police.roadblocks.length < WANTED.maxRoadblocks && police.roadblockTimer <= 0) {
    police.roadblockTimer = WANTED.roadblockCooldown;
    const fx = state.player.inCar ? Math.cos(state.player.inCar.angle) : Math.cos(state.player.angle);
    const fy = state.player.inCar ? Math.sin(state.player.inCar.angle) : Math.sin(state.player.angle);
    const ahead = nearestRoadPoint(target.x + fx * 520, target.y + fy * 520);
    police.roadblocks.push({
      x: Math.max(60, Math.min(WORLD.width - 60, ahead.x)),
      y: Math.max(60, Math.min(WORLD.height - 60, ahead.y)),
      angle: Math.atan2(fy, fx) + Math.PI / 2,
      timer: 30,
    });
  }
  for (const rb of police.roadblocks) rb.timer -= dt;
  police.roadblocks = police.roadblocks.filter((rb) => rb.timer > 0);
  // A roadblock is a wall of steel: ramming it at speed wrecks the car.
  for (const rb of police.roadblocks) {
    if (state.player.inCar && Math.hypot(state.player.inCar.x - rb.x, state.player.inCar.y - rb.y) < 52) {
      const pc = state.player.inCar;
      if (Math.abs(pc.speed) > 120) {
        pc.health -= 22;
        pc.speed *= 0.25;
        state.player.inCar = pc;
      } else {
        pc.speed *= 1 - 2.5 * dt;
      }
    }
  }
  // At 4+ stars a police helicopter circles overhead and never loses sight —
  // the wanted level cannot cool off while it watches.
  if (state.wanted >= WANTED.heliStars) {
    if (!police.heli) police.heli = { angle: 0, x: target.x, y: target.y - 220 };
    police.heli.angle += dt * 0.55;
    police.heli.x = target.x + Math.cos(police.heli.angle) * 230;
    police.heli.y = target.y + Math.sin(police.heli.angle) * 230;
  } else {
    police.heli = null;
  }
  let seen = !!police.heli;
  // Predict where the player is going, so cruisers cut him off instead of
  // trailing forever behind a faster car.
  const tvx = state.player.inCar
    ? Math.cos(state.player.inCar.angle) * state.player.inCar.speed
    : (state.player.vx || 0);
  const tvy = state.player.inCar
    ? Math.sin(state.player.inCar.angle) * state.player.inCar.speed
    : (state.player.vy || 0);
  const aimX = target.x + tvx * 0.45;
  const aimY = target.y + tvy * 0.45;
  for (const car of police.cars) {
    const dx = aimX - car.x;
    const dy = aimY - car.y;
    const dist = Math.hypot(target.x - car.x, target.y - car.y);
    if (dist < 620) seen = true;
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    const desired = dist > 60 ? car.topSpeed : car.topSpeed * 0.4;
    car.speed += (desired - car.speed) * dt * 1.4;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.lightPhase += dt * 9;
    // Ram the player's car; on foot, a touch means a bust.
    if (dist < 44) {
      if (state.player.inCar) {
        const pc = state.player.inCar;
        pc.health -= 14 * dt;
        pc.speed *= 1 - 0.6 * dt;
        car.speed *= 0.7;
      } else if (state.player.invulnerable <= 0) {
        state.busted = true;
      }
    }
    // PIT maneuver: a cruiser riding alongside for a second shoves the
    // player's car sideways and spins it, instead of only rear-ending it.
    if (state.player.inCar && dist >= 44 && dist < 95) {
      car.pitTimer = (car.pitTimer || 0) + dt;
      if (car.pitTimer > 1.1) {
        car.pitTimer = 0;
        const pc = state.player.inCar;
        const side = Math.sin(car.angle - pc.angle) >= 0 ? 1 : -1;
        pc.angle += side * 0.35;
        pc.speed *= 0.55;
        pc.health -= 6;
      }
    } else {
      car.pitTimer = 0;
    }
  }
  if (state.wanted > 0) {
    if (seen) {
      police.seenTimer = 3;
      state.wantedTimer = WANTED.decaySeconds;
    } else {
      state.wantedTimer -= dt;
      if (state.wantedTimer <= 0) {
        state.wanted -= 1;
        state.wantedTimer = WANTED.decaySeconds;
        if (state.wanted === 0) police.cars = [];
      }
    }
  }
  return seen;
}

export function clearWanted(state, police) {
  state.wanted = 0;
  state.wantedTimer = WANTED.decaySeconds;
  police.cars = [];
  police.roadblocks = [];
  police.heli = null;
}
