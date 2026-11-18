// Vehicles: driving physics, collisions with buildings and other cars, damage,
// and the traffic cars that cruise the grid. A car is a point with an angle, a
// speed along its nose, and a health bar; steering only bites while it moves.
import { CAR, WORLD } from './config.js';
import { clampToWorld, collideBuildings, isRoad, roadXs, roadYs } from './world.js';

export function stepDrivenCar(car, input, dt, city, others) {
  const throttle = input.throttle();
  const steer = input.steer();
  const braking = input.brake();
  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) car.speed -= CAR.reverseAccel * dt;
  if (braking) car.speed -= Math.sign(car.speed) * CAR.brake * dt;
  car.speed -= car.speed * CAR.drag * dt;
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
  car.speed = Math.max(-CAR.maxReverse, Math.min(car.topSpeed, car.speed));
  const turn = steer * CAR.turnRate * dt * Math.min(1, Math.abs(car.speed) / 120) * (car.speed < 0 ? -1 : 1);
  car.angle += turn;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = collideBuildings(city, nx, ny, CAR.length / 2 - 6);
  const hitWall = Math.hypot(fixed.x - nx, fixed.y - ny) > 1;
  const clamped = clampToWorld(fixed.x, fixed.y, CAR.length / 2);
  if (hitWall && Math.abs(car.speed) > 120) {
    car.health -= Math.abs(car.speed) * 0.03;
    car.speed *= 0.35;
  } else if (hitWall) {
    car.speed *= 0.5;
  }
  car.x = clamped.x;
  car.y = clamped.y;
  // Soft bumps against other cars: slow both, chip a little paint.
  for (const other of others) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 46 && d > 0.01) {
      const push = (46 - d) / 2;
      car.x -= (dx / d) * push;
      car.y -= (dy / d) * push;
      other.x += (dx / d) * push;
      other.y += (dy / d) * push;
      const impact = Math.abs(car.speed - (other.speed || 0));
      if (impact > 90) {
        car.speed *= 0.6;
        if (other.speed !== undefined) other.speed *= 0.6;
        car.health -= impact * 0.02;
      }
    }
  }
  return hitWall;
}

export function createTraffic(random, count) {
  const cars = [];
  const xs = roadXs();
  const ys = roadYs();
  for (let i = 0; i < count; i += 1) {
    const vertical = random() < 0.5;
    const rx = xs[Math.floor(random() * xs.length)];
    const ry = ys[Math.floor(random() * ys.length)];
    const dir = random() < 0.5 ? 1 : -1;
    cars.push({
      id: 1000 + i,
      x: vertical ? rx + (dir > 0 ? 22 : -22) : rx + (random() - 0.5) * 300,
      y: vertical ? ry + (random() - 0.5) * 300 : ry + (dir > 0 ? 22 : -22),
      angle: vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      speed: 110 + random() * 70,
      vertical, dir,
      color: ['#e8533f', '#3f8fe8', '#f2c94c', '#7ec850', '#b8bcc4', '#c65df0', '#e8e8e8'][Math.floor(random() * 7)],
      model: 'City Car', topSpeed: 220, health: 100, parked: false, driver: 'traffic', stolen: false,
    });
  }
  return cars;
}

export function stepTrafficCar(car, dt, random) {
  // Cruise along the current road; at an intersection, sometimes turn onto the cross road.
  const xs = roadXs();
  const ys = roadYs();
  const step = car.speed * dt * car.dir;
  if (car.vertical) car.y += step;
  else car.x += step;
  const nearX = xs.find((rx) => Math.abs(car.x - rx) < 26);
  const nearY = ys.find((ry) => Math.abs(car.y - ry) < 26);
  if (car.vertical && nearY !== undefined && random() < 0.012) {
    car.vertical = false;
    car.dir = random() < 0.5 ? 1 : -1;
    car.angle = car.dir > 0 ? 0 : Math.PI;
    car.y = nearY + (car.dir > 0 ? 22 : -22);
  } else if (!car.vertical && nearX !== undefined && random() < 0.012) {
    car.vertical = true;
    car.dir = random() < 0.5 ? 1 : -1;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    car.x = nearX + (car.dir > 0 ? 22 : -22);
  }
  if (car.x < 60 || car.x > WORLD.width - 60 || car.y < 60 || car.y > WORLD.height - 60) {
    car.dir *= -1;
    car.angle += Math.PI;
  }
  // Keep traffic on the grid: nudge a drifting car back onto its road.
  if (car.vertical) {
    const rx = xs.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a), xs[0]);
    car.x += (rx + (car.dir > 0 ? 22 : -22) - car.x) * 0.02;
  } else {
    const ry = ys.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a), ys[0]);
    car.y += (ry + (car.dir > 0 ? 22 : -22) - car.y) * 0.02;
  }
}

export function createPedestrians(random, count) {
  const peds = [];
  const xs = roadXs();
  const ys = roadYs();
  const colors = ['#f2c94c', '#7ec850', '#e8a34c', '#c65df0', '#3f8fe8', '#e8533f', '#e8e8e8'];
  for (let i = 0; i < count; i += 1) {
    const rx = xs[Math.floor(random() * xs.length)];
    const ry = ys[Math.floor(random() * ys.length)];
    peds.push({
      x: rx + (random() - 0.5) * 200,
      y: ry + (random() - 0.5) * 200,
      angle: random() * Math.PI * 2,
      speed: 40 + random() * 40,
      color: colors[Math.floor(random() * colors.length)],
      walkPhase: random() * Math.PI * 2,
      fleeing: false,
      fleeTimer: 0,
      changeTimer: 2 + random() * 4,
    });
  }
  return peds;
}

export function stepPedestrian(ped, dt, random, city, player) {
  ped.walkPhase += dt * 8;
  if (ped.fleeTimer > 0) {
    ped.fleeTimer -= dt;
    const away = Math.atan2(ped.y - player.y, ped.x - player.x);
    ped.angle = away;
    ped.x += Math.cos(away) * 170 * dt;
    ped.y += Math.sin(away) * 170 * dt;
    if (ped.fleeTimer <= 0) ped.fleeing = false;
  } else {
    ped.changeTimer -= dt;
    if (ped.changeTimer <= 0) {
      ped.changeTimer = 2 + random() * 4;
      ped.angle = random() * Math.PI * 2;
    }
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
  }
  const fixed = collideBuildings(city, ped.x, ped.y, 10);
  ped.x = Math.max(12, Math.min(WORLD.width - 12, fixed.x));
  ped.y = Math.max(12, Math.min(WORLD.height - 12, fixed.y));
  if (!isRoad(ped.x, ped.y) && Math.random() < 0.002) ped.angle += Math.PI / 2;
}
