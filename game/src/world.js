// The city of Palmetto Bay: roads on a grid, buildings in the blocks between them,
// a park, a beach and the harbour water along the south edge. Pure data + geometry
// helpers — no drawing and no browser in here.
import { CITY, DISTRICTS, PACKAGES_TOTAL, PALETTE, SITES, VEHICLE_MODELS, WORLD } from './config.js';
import { pick } from './random.js';

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Palmetto Bay';
}

// Distance from (x, y) to a named site (garage / hospital / precinct).
export function siteDistance(siteName, x, y) {
  const s = SITES[siteName];
  return Math.hypot(x - s.x, y - s.y);
}

export function nearSite(siteName, x, y) {
  const s = SITES[siteName];
  return Math.hypot(x - s.x, y - s.y) < s.radius;
}

export function roadXs() {
  const xs = [];
  for (let x = CITY.roadEvery; x < WORLD.width; x += CITY.roadEvery) xs.push(x);
  return xs;
}
export function roadYs() {
  const ys = [];
  for (let y = CITY.roadEvery; y < CITY.beachY; y += CITY.roadEvery) ys.push(y);
  return ys;
}

export function isRoad(x, y) {
  const half = CITY.roadWidth / 2;
  for (const rx of roadXs()) if (Math.abs(x - rx) < half) return true;
  for (const ry of roadYs()) if (Math.abs(y - ry) < half) return true;
  return false;
}
export function onBeach(x, y) { return y >= CITY.beachY && y < CITY.waterY; }
export function inWater(x, y) { return y >= CITY.waterY; }

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const palms = [];
  const umbrellas = [];
  const xs = roadXs();
  const ys = roadYs();
  const half = CITY.roadWidth / 2;
  // Park block: the block between roads x=1200..1600, y=800..1200.
  const park = { x: 1200 + half + 10, y: 800 + half + 10, w: 400 - CITY.roadWidth - 20, h: 400 - CITY.roadWidth - 20 };
  for (let bx = 0; bx < xs.length - 1; bx += 1) {
    for (let by = 0; by < ys.length - 1; by += 1) {
      const x0 = xs[bx] + half + CITY.blockPad;
      const y0 = ys[by] + half + CITY.blockPad;
      const bw = CITY.roadEvery - CITY.roadWidth - CITY.blockPad * 2;
      const bh = CITY.roadEvery - CITY.roadWidth - CITY.blockPad * 2;
      const block = { x: x0, y: y0, w: bw, h: bh };
      if (rectsOverlap(block, park)) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: park.x + 20 + random() * (park.w - 40), y: park.y + 20 + random() * (park.h - 40), r: 12 + random() * 8 });
        }
        continue;
      }
      // Two buildings per block, split vertically, with a gap for an alley.
      const split = 0.42 + random() * 0.16;
      const b1 = { x: x0, y: y0, w: bw, h: bh * split - 8 };
      const b2 = { x: x0, y: y0 + bh * split + 8, w: bw, h: bh * (1 - split) - 8 };
      for (const b of [b1, b2]) {
        const ci = Math.floor(random() * PALETTE.building.length);
        buildings.push({ ...b, color: pick(random, PALETTE.building), roof: PALETTE.roof[ci], name: '' });
      }
      if (random() < 0.7) trees.push({ x: x0 + 8 + random() * (bw - 16), y: y0 + bh - 14, r: 10 + random() * 6 });
    }
  }
  // Landmarks with names (drawn on the minimap and in mission text).
  const named = [
    { x: 200 + half + CITY.blockPad, y: 200 + half + CITY.blockPad, name: 'Marina Garage' },
    { x: 2800 + half + CITY.blockPad, y: 200 + half + CITY.blockPad, name: 'Coral Hotel' },
    { x: 200 + half + CITY.blockPad, y: 2000 + half + CITY.blockPad, name: 'Harbor Market' },
    { x: 2800 + half + CITY.blockPad, y: 2000 + half + CITY.blockPad, name: 'Lighthouse Point' },
  ];
  for (const n of named) {
    const b = buildings.find((bb) => Math.abs(bb.x - n.x) < 4 && Math.abs(bb.y - n.y) < 4);
    if (b) b.name = n.name;
  }
  // Hidden packages: gold parcels tucked in alleys, the park and the beach.
  const packages = [];
  const spots = [
    [640, 340], [1240, 740], [1640, 1140], [2040, 340], [2440, 1540], [340, 1140],
    [2840, 740], [340, 1940], [1440, 1940], [2240, 1140], [1340, 940], [2900, 2100],
  ];
  for (let i = 0; i < PACKAGES_TOTAL; i += 1) {
    packages.push({ x: spots[i][0], y: spots[i][1], taken: false });
  }
  // Palm trees and beach umbrellas along the sand, so the beach reads as a beach.
  for (let x = 120; x < WORLD.width - 100; x += 170) {
    palms.push({ x: x + pick(random, [-20, 0, 20]), y: CITY.beachY + 24 + random() * 30, r: 11 + random() * 5 });
  }
  const umbrellaColors = ['#e8533f', '#f2c94c', '#3f8fe8', '#c65df0', '#7ec850'];
  for (let i = 0; i < 10; i += 1) {
    umbrellas.push({ x: 200 + random() * (WORLD.width - 400), y: CITY.beachY + 55 + random() * 40, color: pick(random, umbrellaColors) });
  }
  return { buildings, trees, palms, umbrellas, park, packages };
}

export function collideBuildings(city, x, y, r) {
  // Push a circle out of any building it overlaps; returns corrected {x, y}.
  let nx = x;
  let ny = y;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
    const dx = nx - cx;
    const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      nx = cx + (dx / d) * r;
      ny = cy + (dy / d) * r;
    } else if (d2 <= 0.0001 && nx > b.x && nx < b.x + b.w && ny > b.y && ny < b.y + b.h) {
      // Centre inside the building: push out along the smallest penetration.
      const left = nx - b.x;
      const right = b.x + b.w - nx;
      const top = ny - b.y;
      const bottom = b.y + b.h - ny;
      const m = Math.min(left, right, top, bottom);
      if (m === left) nx = b.x - r;
      else if (m === right) nx = b.x + b.w + r;
      else if (m === top) ny = b.y - r;
      else ny = b.y + b.h + r;
    }
  }
  return { x: nx, y: ny };
}

export function clampToWorld(x, y, r) {
  return {
    x: Math.max(r, Math.min(WORLD.width - r, x)),
    y: Math.max(r, Math.min(WORLD.height - r, y)),
  };
}

export function nearestRoadPoint(x, y) {
  const xs = roadXs();
  const ys = roadYs();
  let best = { x, y, d: Infinity };
  for (const rx of xs) {
    const d = Math.abs(x - rx);
    if (d < best.d) best = { x: rx, y, d };
  }
  for (const ry of ys) {
    const d = Math.abs(y - ry);
    if (d < best.d) best = { x, y: ry, d };
  }
  return best;
}

export function createParkedCars(random, city) {
  // Parked cars sit along road edges; each can be stolen and driven.
  const cars = [];
  const xs = roadXs();
  const ys = roadYs();
  const spots = [];
  for (const rx of xs) for (const ry of ys) {
    spots.push({ x: rx + CITY.roadWidth / 2 + 22, y: ry + 60, angle: Math.PI / 2 });
    spots.push({ x: rx - CITY.roadWidth / 2 - 22, y: ry - 60, angle: -Math.PI / 2 });
    spots.push({ x: rx + 60, y: ry + CITY.roadWidth / 2 + 22, angle: 0 });
    spots.push({ x: rx - 60, y: ry - CITY.roadWidth / 2 - 22, angle: Math.PI });
  }
  for (let i = 0; i < spots.length; i += 1) {
    if (random() < 0.45) continue;
    const s = spots[i];
    if (inWater(s.x, s.y)) continue;
    const model = VEHICLE_MODELS[Math.floor(random() * VEHICLE_MODELS.length)];
    cars.push({
      id: cars.length, x: s.x, y: s.y, angle: s.angle, speed: 0,
      model: model.name, color: model.color, topSpeed: model.top,
      health: 100, parked: true, driver: null, stolen: false,
    });
  }
  return cars;
}
