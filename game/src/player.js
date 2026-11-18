// The player on foot: Rico Vega, a driver back in Palmetto Bay. Movement, punching,
// entering and leaving cars, health and the cash in his pocket.
import { CAR, PLAYER, WORLD } from './config.js';
import { clampToWorld, collideBuildings, inWater } from './world.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, vx: 0, vy: 0,
    health: PLAYER.health, money: 250, moving: false, running: false,
    punchTimer: 0, punchAnim: 0, inCar: null, invulnerable: 0,
  };
}

export function stepPlayer(player, input, dt, city) {
  if (player.inCar) return;
  const mx = input.moveX();
  const my = input.moveY();
  const len = Math.hypot(mx, my);
  player.moving = len > 0.01;
  player.running = input.run() && player.moving;
  const speed = player.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let nx = player.x;
  let ny = player.y;
  if (len > 0.01) {
    nx += (mx / len) * speed * dt;
    ny += (my / len) * speed * dt;
    player.angle = Math.atan2(my, mx);
  }
  const fixed = collideBuildings(city, nx, ny, PLAYER.radius);
  const clamped = clampToWorld(fixed.x, fixed.y, PLAYER.radius);
  if (inWater(clamped.x, clamped.y)) {
    // The harbour is not swimmable: the shore pushes Rico back onto the sand.
    player.x = fixed.x;
    player.y = Math.min(fixed.y, 2310);
  } else {
    player.x = clamped.x;
    player.y = clamped.y;
  }
  if (player.punchTimer > 0) player.punchTimer -= dt;
  if (player.punchAnim > 0) player.punchAnim -= dt;
  if (player.invulnerable > 0) player.invulnerable -= dt;
}

export function nearestCar(player, cars, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(player, car) {
  player.inCar = car;
  car.driver = player;
  car.parked = false;
  if (!car.stolen) {
    car.stolen = true;
    return 'stolen';
  }
  return 'entered';
}

export function exitCar(player) {
  const car = player.inCar;
  if (!car) return;
  car.driver = null;
  car.parked = true;
  car.speed = 0;
  player.inCar = null;
  // Step out to the car's left side, clear of the road centre.
  const sx = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  const sy = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  player.x = Math.max(16, Math.min(WORLD.width - 16, sx));
  player.y = Math.max(16, Math.min(WORLD.height - 16, sy));
  player.angle = car.angle;
}

export function punch(player, peds) {
  if (player.punchTimer > 0 || player.inCar) return null;
  player.punchTimer = PLAYER.punchCooldown;
  player.punchAnim = 0.22;
  const px = player.x + Math.cos(player.angle) * PLAYER.punchRange;
  const py = player.y + Math.sin(player.angle) * PLAYER.punchRange;
  for (const ped of peds) {
    if (ped.fleeing) continue;
    if (Math.hypot(ped.x - px, ped.y - py) < 30) {
      ped.fleeing = true;
      ped.fleeTimer = 4;
      return ped;
    }
  }
  return null;
}
