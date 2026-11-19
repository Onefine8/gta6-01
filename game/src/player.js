// The player on foot: Rico Vega, a driver back in Palmetto Bay. Movement, punching,
// entering and leaving cars, health and the cash in his pocket.
import { CAR, PLAYER, WORLD } from './config.js';
import { clampToWorld, collideBuildings, inWater } from './world.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, vx: 0, vy: 0,
    health: PLAYER.health, money: 250, moving: false, running: false,
    stamina: PLAYER.stamina, hurtTimer: 0,
    punchTimer: 0, punchAnim: 0, punchCombo: 0, punchComboTimer: 0,
    inCar: null, invulnerable: 0,
  };
}

// One place for all damage to Rico: it resets the health-regen clock and
// reports whether he went down, so police, crashes and falls agree.
export function damagePlayer(player, amount) {
  if (player.invulnerable > 0 || player.health <= 0) return false;
  player.health = Math.max(0, player.health - amount);
  player.hurtTimer = PLAYER.healthRegenDelay;
  player.invulnerable = 0.6;
  return player.health <= 0;
}

export function healPlayer(player, amount) {
  player.health = Math.min(PLAYER.health, player.health + amount);
}

export function stepPlayer(player, input, dt, city) {
  if (player.inCar) return;
  const mx = input.moveX();
  const my = input.moveY();
  const len = Math.hypot(mx, my);
  player.moving = len > 0.01;
  // Sprinting drains stamina; an empty tank forces a walk until it recovers.
  const wantRun = input.run() && player.moving;
  player.running = wantRun && player.stamina > 1;
  if (player.running) player.stamina = Math.max(0, player.stamina - PLAYER.staminaDrain * dt);
  else player.stamina = Math.min(PLAYER.stamina, player.stamina + PLAYER.staminaRegen * dt);
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
  if (player.punchComboTimer > 0) {
    player.punchComboTimer -= dt;
    if (player.punchComboTimer <= 0) player.punchCombo = 0;
  }
  if (player.invulnerable > 0) player.invulnerable -= dt;
  // Health creeps back once Rico has been out of trouble for a while.
  if (player.hurtTimer > 0) player.hurtTimer -= dt;
  else if (player.health > 0 && player.health < PLAYER.health) {
    healPlayer(player, PLAYER.healthRegenRate * dt);
  }
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
  // Chained punches build a combo (up to 3) that hits harder each time.
  player.punchCombo = player.punchComboTimer > 0 ? Math.min(3, player.punchCombo + 1) : 1;
  player.punchComboTimer = 0.9;
  const px = player.x + Math.cos(player.angle) * PLAYER.punchRange;
  const py = player.y + Math.sin(player.angle) * PLAYER.punchRange;
  for (const ped of peds) {
    if (ped.fleeing) continue;
    if (Math.hypot(ped.x - px, ped.y - py) < 30) {
      ped.fleeing = true;
      ped.fleeTimer = 4;
      // Knockback: the pedestrian stumbles away from Rico.
      const away = Math.atan2(ped.y - player.y, ped.x - player.x);
      ped.x += Math.cos(away) * (18 + player.punchCombo * 10);
      ped.y += Math.sin(away) * (18 + player.punchCombo * 10);
      ped.health = Math.max(0, (ped.health ?? 100) - (PLAYER.punchDamage + player.punchCombo * 10));
      return ped;
    }
  }
  return null;
}
