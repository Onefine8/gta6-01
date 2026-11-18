// The Palmetto Bay Police Department: patrol cars that spawn at the map edge when
// the wanted level rises, chase the player, ram his car, and bust him on foot.
// Wanted stars decay only while no police car can see the player.
import { WANTED, WORLD } from './config.js';
import { nearestRoadPoint } from './world.js';

export function createPolice() {
  return { cars: [], spawnTimer: 0, seenTimer: 0, nextId: 1 };
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
  let seen = false;
  for (const car of police.cars) {
    const dx = target.x - car.x;
    const dy = target.y - car.y;
    const dist = Math.hypot(dx, dy);
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
}
