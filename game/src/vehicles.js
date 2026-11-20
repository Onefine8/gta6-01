// Vehicles: driving physics, collisions with buildings and other cars,
// damage, and the traffic cars and pedestrians that cruise the grid. A car
// is a point with an angle, a speed along its nose, and a health bar;
// steering only bites while it moves. Traffic cars are simpler machines:
// they cruise one road, turn at intersections, brake for the car ahead,
// and pull over for a police cruiser with its lights on.
//
// Pedestrians wander the sidewalks, change direction every few seconds,
// and flee from the player when they are scared — punched, shot at, or
// nearly run over. They are the city's softest target and the fastest
// way to earn a wanted star.
import { CAR, WORLD } from './config.js';
import { clampToWorld, collideBuildings, isRoad, roadXs, roadYs } from './world.js';
import { pick } from './random.js';

// A car that can still move: health above zero and a driver or a player.
export function isDrivable(car) {
  return !!car && (car.health === undefined || car.health > 0);
}

// Health as a 0..1 fraction, for the HUD bar and the mission fail checks.
export function carHealthFraction(car) {
  if (!car || car.health === undefined) return 1;
  return Math.max(0, Math.min(1, car.health / 100));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function stepDrivenCar(car, input, dt, city, others, weather) {
  const throttle = input.throttle();
  const steer = input.steer();
  const braking = input.brake();
  // Handbrake at speed = drift: sharper turn, speed bleeds, tyres smoke.
  car.drifting = braking && Math.abs(car.speed) > 200;
  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) car.speed -= CAR.reverseAccel * dt;
  if (braking) car.speed -= Math.sign(car.speed) * CAR.brake * dt;
  car.speed -= car.speed * CAR.drag * dt;
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
  car.speed = Math.max(-CAR.maxReverse, Math.min(car.topSpeed, car.speed));
  // Rain makes the roads slick: less grip, wider turns.
  const grip = weather && weather.raining ? CAR.slickGrip : 1;
  const turnRate = CAR.turnRate * grip * (car.drifting ? CAR.driftTurn : 1);
  const speedFactor = Math.min(1, Math.abs(car.speed) / 120) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * turnRate * dt * speedFactor;
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

const TRAFFIC_COLORS = ['#e8533f', '#3f8fe8', '#f2c94c', '#7ec850', '#b8bcc4', '#c65df0', '#e8e8e8'];
const PED_COLORS = ['#f2c94c', '#7ec850', '#e8a34c', '#c65df0', '#3f8fe8', '#e8533f', '#e8e8e8'];

function trafficSpawn(random, id) {
  const xs = roadXs();
  const ys = roadYs();
  const vertical = random() < 0.5;
  const rx = xs[Math.floor(random() * xs.length)];
  const ry = ys[Math.floor(random() * ys.length)];
  const dir = random() < 0.5 ? 1 : -1;
  const cruise = 110 + random() * 70;
  return {
    id: 1000 + id,
    x: vertical ? rx + (dir > 0 ? 22 : -22) : rx + (random() - 0.5) * 300,
    y: vertical ? ry + (random() - 0.5) * 300 : ry + (dir > 0 ? 22 : -22),
    angle: vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    speed: cruise,
    cruise,
    vertical, dir,
    color: pick(random, TRAFFIC_COLORS),
    model: 'City Car', topSpeed: 220, health: 100, parked: false, driver: 'traffic', stolen: false,
    startled: 0, slowTimer: 0,
  };
}

export function createTraffic(random, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) cars.push(trafficSpawn(random, i));
  return cars;
}

// How fast this traffic car wants to go: the car ahead caps it, a police
// cruiser with lights on makes it pull over, a horn startles it into a
// burst, and otherwise it eases back to its cruise speed.
function trafficTargetSpeed(car, others) {
  let targetSpeed = car.speed;
  if (!others) return targetSpeed;
  for (const other of others) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = car.vertical ? dy * car.dir : dx * car.dir;
    const lateral = car.vertical ? Math.abs(dx) : Math.abs(dy);
    // Don't rear-end the car ahead: brake when something is close in front.
    if (ahead > 0 && ahead < 80 && lateral < 30) {
      targetSpeed = Math.min(targetSpeed, (other.speed || 0) * 0.8);
      car.slowTimer = 0.5;
    }
    // A police cruiser with lights on makes traffic pull over and slow down.
    if (other.driver === 'police' && Math.hypot(dx, dy) < 170) {
      targetSpeed = Math.min(targetSpeed, 60);
      car.slowTimer = 0.8;
    }
  }
  return targetSpeed;
}

// At an intersection, sometimes turn onto the cross road. The car stays
// on its lane offset so it does not drive down the middle of the road.
function maybeTurnTraffic(car, dt, random) {
  const xs = roadXs();
  const ys = roadYs();
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
}

// Keep a traffic car on the grid: nudge a drifting car back onto its road
// and flip it around at the map edge.
function keepTrafficOnGrid(car) {
  const xs = roadXs();
  const ys = roadYs();
  if (car.x < 60 || car.x > WORLD.width - 60 || car.y < 60 || car.y > WORLD.height - 60) {
    car.dir *= -1;
    car.angle += Math.PI;
  }
  if (car.vertical) {
    const rx = xs.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a), xs[0]);
    car.x += (rx + (car.dir > 0 ? 22 : -22) - car.x) * 0.02;
  } else {
    const ry = ys.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a), ys[0]);
    car.y += (ry + (car.dir > 0 ? 22 : -22) - car.y) * 0.02;
  }
}

export function stepTrafficCar(car, dt, random, others) {
  const targetSpeed = trafficTargetSpeed(car, others);
  if (car.slowTimer > 0) {
    car.slowTimer -= dt;
    car.speed += (targetSpeed - car.speed) * dt * 3;
  } else if (car.startled > 0) {
    // Startled by a horn: a short burst of speed, then back to cruising.
    car.startled -= dt;
    car.speed = Math.min(car.topSpeed + 60, car.speed + 260 * dt);
  } else {
    // Nothing ahead: ease back to cruising speed.
    car.speed += ((car.cruise || 150) - car.speed) * dt * 0.8;
  }
  const step = car.speed * dt * car.dir;
  if (car.vertical) car.y += step;
  else car.x += step;
  maybeTurnTraffic(car, dt, random);
  keepTrafficOnGrid(car);
}

export function createPedestrians(random, count) {
  const peds = [];
  const xs = roadXs();
  const ys = roadYs();
  for (let i = 0; i < count; i += 1) {
    const rx = xs[Math.floor(random() * xs.length)];
    const ry = ys[Math.floor(random() * ys.length)];
    peds.push({
      x: rx + (random() - 0.5) * 200,
      y: ry + (random() - 0.5) * 200,
      angle: random() * Math.PI * 2,
      speed: 40 + random() * 40,
      color: pick(random, PED_COLORS),
      walkPhase: random() * Math.PI * 2,
      fleeing: false,
      fleeTimer: 0,
      changeTimer: 2 + random() * 4,
      health: 100,
    });
  }
  return peds;
}

// A horn blast startles nearby traffic into a short burst of speed.
export function startleTraffic(traffic, x, y, radius) {
  for (const car of traffic) {
    if (Math.hypot(car.x - x, car.y - y) < radius) car.startled = 1.2;
  }
}

export function stepPedestrian(ped, dt, random, city, player) {
  ped.walkPhase += dt * 8;
  if (ped.fleeTimer > 0) {
    // Fleeing: run straight away from the player, fast, until the timer ends.
    ped.fleeTimer -= dt;
    const away = Math.atan2(ped.y - player.y, ped.x - player.x);
    ped.angle = away;
    ped.x += Math.cos(away) * 170 * dt;
    ped.y += Math.sin(away) * 170 * dt;
    if (ped.fleeTimer <= 0) ped.fleeing = false;
  } else {
    // Wandering: drift along the current heading, picking a new one every
    // few seconds.
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
