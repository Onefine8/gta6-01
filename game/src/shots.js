// The screenshot scenes behind ?shot=chase|walk|mission|night. Each one stages a
// real game state — a car, police, pedestrians, traffic and a live mission —
// using the game's own state, then paints it twice so the frame is exactly what
// a player sees mid-game. The same seed always gives the same frame.
import { FIELD } from './config.js';
import { enterCar } from './player.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY } from './render.js';
import { nearestRoadPoint } from './world.js';

function snapToRoad(x, y) {
  const p = nearestRoadPoint(x, y);
  return { x: p.x, y: p.y };
}

function placeTrafficNear(state, cx, cy, random) {
  // Scatter traffic cars on the roads around the camera centre.
  const offsets = [[-260, -40], [300, 40], [-80, 260], [180, -260], [-420, 120], [420, -120], [60, 420], [-180, -420]];
  state.traffic.forEach((car, i) => {
    const o = offsets[i % offsets.length];
    const p = snapToRoad(cx + o[0], cy + o[1]);
    car.x = p.x + (o[0] > 0 ? 22 : -22);
    car.y = p.y + (o[1] > 0 ? 22 : -22);
    car.vertical = Math.abs(o[0]) < Math.abs(o[1]);
    car.angle = car.vertical ? Math.PI / 2 : 0;
    car.speed = 120 + random() * 60;
  });
}

function placePedsNear(state, cx, cy, random) {
  state.peds.forEach((ped, i) => {
    const a = (i / state.peds.length) * Math.PI * 2;
    const p = snapToRoad(cx + Math.cos(a) * (120 + random() * 260), cy + Math.sin(a) * (120 + random() * 200));
    // Pedestrians walk the sidewalks, just off the road edge.
    ped.x = p.x + 62;
    ped.y = p.y + 62;
    ped.fleeing = false;
  });
}

function putPlayerInCar(state, x, y, angle) {
  const car = state.parkedCars.find((c) => c.model === 'Sunset Coupe') || state.parkedCars[0];
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 260;
  car.health = 82;
  enterCar(state.player, car);
  state.player.x = x;
  state.player.y = y;
  return car;
}

function spawnPoliceChase(state, x, y) {
  state.police.cars = [];
  // Cruisers right behind the player, in the road lanes (never on buildings).
  const spots = [
    { x: x - 260, y: y + 22, angle: 0 },
    { x: x - 340, y: y - 22, angle: 0 },
    { x: x - 430, y: y + 22, angle: 0 },
  ];
  spots.forEach((s, i) => {
    state.police.cars.push({
      id: i + 1, x: s.x, y: s.y, angle: s.angle, speed: 300, health: 100,
      color: '#1d4ed8', model: 'PBPD Cruiser', topSpeed: 380,
      parked: false, driver: 'police', stolen: false, lightPhase: i * 1.7,
    });
  });
}

/**
 * Stage `state` for the named scene and return the screen to draw over it.
 * Unknown names stage the chase (the cover).
 */
export function stageShot(name, state, random) {
  state.elapsed = 12;
  state.player.money = 1250;
  state.player.health = 86;
  state.missions.packagesFound = 4;
  state.city.packages.forEach((p, i) => { p.taken = i < 4; });
  if (name === 'walk') {
    state.time.hour = 14.5;
    state.time.isNight = false;
    state.time.raining = false;
    state.wanted = 0;
    // Rico on foot at the 5th Avenue crossroads, right where the camera sits.
    state.player.x = 2000;
    state.player.y = 1200;
    state.player.angle = -Math.PI / 2;
    placeTrafficNear(state, 2000, 1200, random);
    placePedsNear(state, 2000, 1200, random);
    state.missions.message = 'Explore Palmetto Bay on foot — packages hide in alleys and parks.';
    state.missions.messageTimer = 99;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'mission') {
    state.time.hour = 17.5;
    state.time.isNight = false;
    state.time.raining = false;
    state.wanted = 1;
    putPlayerInCar(state, 2000, 800, 0);
    startMission(state.missions, 1);
    state.missions.introTimer = 99;
    state.missions.step = 0;
    state.objectivePos = { x: 360, y: 2060 };
    placeTrafficNear(state, 2000, 800, random);
    placePedsNear(state, 2000, 800, random);
    spawnPoliceChase(state, 2000, 800);
    state.police.cars = state.police.cars.slice(0, 1);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'night') {
    state.time.hour = 22.5;
    state.time.isNight = true;
    state.time.raining = true;
    state.wanted = 2;
    putPlayerInCar(state, 2000, 1600, Math.PI / 2);
    state.missions.message = 'Night rain over the bay — lose the heat before dawn.';
    state.missions.messageTimer = 99;
    placeTrafficNear(state, 2000, 1600, random);
    placePedsNear(state, 2000, 1600, random);
    spawnPoliceChase(state, 2000, 1600);
    state.police.cars = state.police.cars.slice(0, 2);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // chase (cover): broad daylight, three stars, three cruisers, mission objective live.
  state.time.hour = 11.5;
  state.time.isNight = false;
  state.time.raining = false;
  state.wanted = 3;
  putPlayerInCar(state, 2000, 1200, 0);
  startMission(state.missions, 0);
  state.missions.step = 1;
  state.missions.introTimer = 0;
  state.objectivePos = { x: 360, y: 360 };
  state.missions.message = 'Drive the coupe to Marina Garage — and shake the PBPD!';
  state.missions.messageTimer = 99;
  placeTrafficNear(state, 2000, 1200, random);
  placePedsNear(state, 2000, 1200, random);
  spawnPoliceChase(state, 2000, 1200);
  return { screen: SCREEN_PLAY, best: 0 };
}
