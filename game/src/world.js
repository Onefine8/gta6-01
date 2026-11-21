// Meridian Heat — procedural city of Port Meridian.
// Builds the whole explorable map from a seed: an 8x8 road grid, district
// buildings as AABBs, harbour water + piers, a bridge, beach, street props,
// sky dome and sun/moon. Exposes collision + road queries used by every
// gameplay module. Only imports config.js / random.js + global THREE.
import { CONFIG } from './config.js';
import { createRng } from './random.js';

const cfg = CONFIG;

// Road centreline coordinates, shared by geometry and queries.
function roadLines() {
  const lines = [];
  const half = cfg.CITY_HALF;
  for (let i = 0; i <= cfg.GRID_BLOCKS; i++) {
    lines.push(-half + i * cfg.ROAD_PITCH);
  }
  return lines;
}

// Which district contains a point (nearest centre within radius).
function districtAt(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const d of cfg.DISTRICTS) {
    const dx = x - d.cx;
    const dz = z - d.cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return bestD <= best.r ? best : null;
}

function makeMaterial(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMaterial(color, opts));
  mesh.position.set(x, y, z);
  return mesh;
}

// ---------------------------------------------------------------------------
// City generation (pure geometry data, driven by the seeded RNG)
// ---------------------------------------------------------------------------
function generateCity(rng) {
  const lines = roadLines();
  const half = cfg.CITY_HALF;
  const pitch = cfg.ROAD_PITCH;
  const roadHalf = cfg.ROAD_WIDTH / 2;

  // Road segments: one per grid line, both directions.
  const roads = [];
  for (const c of lines) {
    roads.push({ ax: -half - roadHalf, az: c, bx: half + roadHalf, bz: c, dir: 'x' });
    roads.push({ ax: c, az: -half - roadHalf, bx: c, bz: half + roadHalf, dir: 'z' });
  }

  // Buildings: fill each block with 1-4 AABBs, leaving sidewalk margins.
  const buildings = [];
  const margin = roadHalf + 4;
  for (let bx = 0; bx < cfg.GRID_BLOCKS; bx++) {
    for (let bz = 0; bz < cfg.GRID_BLOCKS; bz++) {
      const x0 = lines[bx] + margin;
      const x1 = lines[bx + 1] - margin;
      const z0 = lines[bz] + margin;
      const z1 = lines[bz + 1] - margin;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const district = districtAt(cx, cz) || { name: 'Uptown', maxHeight: 22, tag: 'uptown' };
      const count = rng.int(1, 4);
      if (count === 1) {
        // One big block-filling building.
        const w = (x1 - x0) * rng.range(0.55, 0.8);
        const d = (z1 - z0) * rng.range(0.55, 0.8);
        const h = rng.range(8, district.maxHeight);
        buildings.push(makeBuilding(cx, cz, w, d, h, district, rng));
      } else {
        // Split the block into a 2x2 grid of smaller plots.
        const plots = [
          [x0, z0, cx, cz], [cx, z0, x1, cz],
          [x0, cz, cx, z1], [cx, cz, x1, z1],
        ];
        for (const [px0, pz0, px1, pz1] of rng.shuffle(plots).slice(0, count)) {
          const w = (px1 - px0) * rng.range(0.6, 0.85);
          const d = (pz1 - pz0) * rng.range(0.6, 0.85);
          const h = rng.range(6, district.maxHeight * rng.range(0.5, 1));
          buildings.push(makeBuilding((px0 + px1) / 2, (pz0 + pz1) / 2, w, d, h, district, rng));
        }
      }
    }
  }

  // Landmarks: Mara's garage, the Meridian Tower, the harbour warehouse.
  const landmarks = [
    {
      name: "Mara's Garage", district: 'Downtown',
      minX: -30, maxX: -6, minZ: 96, maxZ: 120, height: 12, color: 0x8a5a2e,
    },
    {
      name: 'Meridian Tower', district: 'Downtown',
      minX: -14, maxX: 14, minZ: -150, maxZ: -122, height: 120, color: 0x5a7a9a,
    },
    {
      name: 'Harbor Warehouse', district: 'Harbor',
      minX: 296, maxX: 318, minZ: -84, maxZ: -40, height: 16, color: 0x6a6a72,
    },
  ];
  for (const lm of landmarks) {
    buildings.push({
      name: lm.name, district: lm.district,
      minX: lm.minX, maxX: lm.maxX, minZ: lm.minZ, maxZ: lm.maxZ,
      height: lm.height, color: lm.color, landmark: true,
    });
  }

  // Street props: lamps along roads, trees on sidewalks, hydrants.
  const lamps = [];
  for (const c of lines) {
    for (let t = -half + 36; t <= half - 36; t += 72) {
      if (rng.chance(0.7)) lamps.push({ x: c + roadHalf + 1.5, z: t, side: 1 });
      if (rng.chance(0.7)) lamps.push({ x: t, z: c + roadHalf + 1.5, side: 1 });
    }
  }
  const trees = [];
  for (let i = 0; i < 260; i++) {
    const x = rng.range(-half, half);
    const z = rng.range(-half, half);
    if (onRoad(x, z, lines)) continue;
    if (insideAnyBuilding(x, z, buildings)) continue;
    trees.push({ x, z, s: rng.range(0.8, 1.4) });
  }

  // Hidden-package spots (activities.js hides 20 packages on these).
  const packageSpots = [];
  for (let i = 0; i < 40 && packageSpots.length < 30; i++) {
    const x = rng.range(-half + 20, half - 20);
    const z = rng.range(-half + 20, half - 20);
    if (onRoad(x, z, lines) || insideAnyBuilding(x, z, buildings)) continue;
    packageSpots.push({ x, z });
  }

  // Piers: wooden walkways reaching east into the harbour water.
  const piers = [
    { x0: 318, x1: 372, z0: -30, z1: -18 },
    { x0: 318, x1: 360, z0: 24, z1: 36 },
    { x0: 318, x1: 348, z0: 84, z1: 94 },
  ];

  // Bridge: the north road (z = -288) crosses a canal gap on the west edge.
  const bridge = { x0: -420, x1: -288, z0: -294, z1: -282 };

  return { lines, roads, buildings, landmarks, lamps, trees, packageSpots, piers, bridge };
}

function makeBuilding(cx, cz, w, d, h, district, rng) {
  const palette = {
    downtown: [0x7a8a99, 0x5a6a7a, 0x8a7a6a, 0x6a7a8a],
    harbor: [0x6a6a72, 0x7a6a5a, 0x5a5a62],
    oldtown: [0x9a7a5a, 0x8a6a4a, 0xa88a6a],
    beach: [0xe8d8c0, 0xd8c8a8, 0xc8b898],
    hills: [0x7a6a5a, 0x8a7a6a, 0x6a5a4a],
    uptown: [0x7a7a82, 0x8a8a92, 0x6a6a72],
  };
  const colors = palette[district.tag] || palette.uptown;
  return {
    name: `${district.name} Block`,
    district: district.name,
    minX: cx - w / 2, maxX: cx + w / 2,
    minZ: cz - d / 2, maxZ: cz + d / 2,
    height: Math.round(h),
    color: rng.pick(colors),
    windows: rng.chance(0.8),
    neon: district.tag === 'downtown' && rng.chance(0.35),
    landmark: false,
  };
}

function onRoad(x, z, lines) {
  const roadHalf = cfg.ROAD_WIDTH / 2 + 1;
  for (const c of lines) {
    if (Math.abs(x - c) < roadHalf || Math.abs(z - c) < roadHalf) return true;
  }
  return false;
}

function insideAnyBuilding(x, z, buildings) {
  for (const b of buildings) {
    if (x >= b.minX - 1 && x <= b.maxX + 1 && z >= b.minZ - 1 && z <= b.maxZ + 1) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
function buildQueries(city) {
  const { roads, buildings, piers } = city;

  function collide(pos, r) {
    // pos is {x, z} (or a THREE.Vector3 — we use .x/.z only, y untouched).
    // Buildings: push out along the smallest penetration axis.
    for (const b of buildings) {
      if (pos.x > b.minX - r && pos.x < b.maxX + r && pos.z > b.minZ - r && pos.z < b.maxZ + r) {
        const pushL = pos.x - (b.minX - r);
        const pushR = (b.maxX + r) - pos.x;
        const pushU = pos.z - (b.minZ - r);
        const pushD = (b.maxZ + r) - pos.z;
        const min = Math.min(pushL, pushR, pushU, pushD);
        if (min === pushL) pos.x = b.minX - r;
        else if (min === pushR) pos.x = b.maxX + r;
        else if (min === pushU) pos.z = b.minZ - r;
        else pos.z = b.maxZ + r;
      }
    }
    // Harbour water: blocked, except while standing on a pier.
    if (pos.x > cfg.WATER_X - r) {
      let onPier = false;
      for (const p of piers) {
        if (pos.x >= p.x0 && pos.x <= p.x1 && pos.z >= p.z0 && pos.z <= p.z1) { onPier = true; break; }
      }
      if (!onPier) pos.x = cfg.WATER_X - r;
    }
    // Outer world bound (soft fence).
    const B = cfg.WORLD_BOUND;
    pos.x = Math.max(-B, Math.min(B, pos.x));
    pos.z = Math.max(-B, Math.min(B, pos.z));
    return pos;
  }

  function nearestRoadPoint(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const seg of roads) {
      const dx = seg.bx - seg.ax;
      const dz = seg.bz - seg.az;
      const len2 = dx * dx + dz * dz;
      let t = len2 === 0 ? 0 : ((x - seg.ax) * dx + (z - seg.az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = seg.ax + dx * t;
      const pz = seg.bz + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bestD) {
        bestD = d;
        best = { x: px, z: pz, dist: d, dir: seg.dir };
      }
    }
    return best;
  }

  function randomRoadPos(rng) {
    const seg = rng.pick(roads);
    const t = rng.next();
    return {
      x: seg.ax + (seg.bx - seg.ax) * t,
      z: seg.az + (seg.bz - seg.az) * t,
      dir: seg.dir,
    };
  }

  return { collide, nearestRoadPoint, randomRoadPos };
}

// ---------------------------------------------------------------------------
// Mesh construction
// ---------------------------------------------------------------------------
function buildMeshes(G, city) {
  const group = new THREE.Group();
  group.name = 'city';
  const half = cfg.CITY_HALF;
  const roadHalf = cfg.ROAD_WIDTH / 2;

  // Ground: big grass/concrete slab under everything.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(cfg.WORLD_BOUND * 2 + 400, cfg.WORLD_BOUND * 2 + 400),
    makeMaterial(0x44503f),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(60, -0.05, 0);
  group.add(ground);

  // City base slab (sidewalk grey) covering the grid area.
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + cfg.ROAD_WIDTH + 8, half * 2 + cfg.ROAD_WIDTH + 8),
    makeMaterial(cfg.COLORS.sidewalk),
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(0, 0, 0);
  group.add(slab);

  // Roads: dark strips + centre dashes.
  const roadMat = makeMaterial(cfg.COLORS.road);
  const dashMat = makeMaterial(cfg.COLORS.roadLine);
  for (const c of city.lines) {
    for (const horizontal of [true, false]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(half * 2 + cfg.ROAD_WIDTH, cfg.ROAD_WIDTH),
        roadMat,
      );
      strip.rotation.x = -Math.PI / 2;
      if (horizontal) strip.position.set(0, 0.02, c);
      else { strip.rotation.z = Math.PI / 2; strip.position.set(c, 0.02, 0); }
      group.add(strip);
      // Centre dashes every 12 m.
      for (let t = -half + 6; t <= half - 6; t += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
        dash.rotation.x = -Math.PI / 2;
        if (horizontal) dash.position.set(t, 0.04, c);
        else { dash.rotation.z = Math.PI / 2; dash.position.set(c, 0.04, t); }
        group.add(dash);
      }
    }
  }

  // Beach: sand strip along the south edge.
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 200, 90),
    makeMaterial(0xd8c49a),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.01, cfg.BEACH_Z + 45);
  group.add(beach);

  // Harbour water: big plane east of the city, animated in update().
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 900),
    new THREE.MeshLambertMaterial({ color: cfg.COLORS.waterDay, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(cfg.WATER_X + 160, 0.05, 0);
  water.name = 'water';
  group.add(water);

  // Piers.
  const pierMat = makeMaterial(0x7a5a34);
  for (const p of city.piers) {
    const pier = box(p.x1 - p.x0, 0.8, p.z1 - p.z0, 0x7a5a34, (p.x0 + p.x1) / 2, 0.4, (p.z0 + p.z1) / 2);
    pier.material = pierMat;
    group.add(pier);
  }

  // Bridge deck over the west canal gap.
  const bridge = box(
    city.bridge.x1 - city.bridge.x0, 1.2,
    city.bridge.z1 - city.bridge.z0, 0x4a4a52,
    (city.bridge.x0 + city.bridge.x1) / 2, 0.6, (city.bridge.z0 + city.bridge.z1) / 2,
  );
  group.add(bridge);

  // Buildings.
  const windowMat = makeMaterial(0x2a3a4a, { emissive: 0x111111 });
  void windowMat;
  for (let bi = 0; bi < city.buildings.length; bi++) {
    const b = city.buildings[bi];
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    const mesh = box(w, b.height, d, b.color, (b.minX + b.maxX) / 2, b.height / 2, (b.minZ + b.maxZ) / 2);
    mesh.name = b.name;
    group.add(mesh);
    // Roof rim.
    const rim = box(w + 0.6, 0.5, d + 0.6, 0x333333, (b.minX + b.maxX) / 2, b.height + 0.25, (b.minZ + b.maxZ) / 2);
    group.add(rim);
    // Window strips on tall buildings (cheap: thin lit planes on two faces).
    if (b.height >= 20 && b.windows) {
      const floors = Math.min(12, Math.floor(b.height / 6));
      for (let f = 0; f < floors; f++) {
        const y = 4 + f * 6;
        const strip = new THREE.Mesh(
          new THREE.PlaneGeometry(w * 0.8, 1.6),
          makeMaterial(0xbfd9e8, { emissive: 0x223344 }),
        );
        strip.position.set((b.minX + b.maxX) / 2, y, b.maxZ + 0.06);
        strip.name = 'windows';
        group.add(strip);
      }
    }
    // Neon sign on some downtown towers.
    if (b.neon) {
      const neon = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.7, 14), 1.2),
        new THREE.MeshBasicMaterial({ color: bi % 2 === 0 ? cfg.COLORS.neonPink : cfg.COLORS.neonCyan }),
      );
      neon.position.set((b.minX + b.maxX) / 2, b.height * 0.8, b.maxZ + 0.08);
      neon.name = 'neon';
      group.add(neon);
    }
  }

  // Street lamps: pole + glowing head (heads toggle at night in render).
  const poleMat = makeMaterial(0x222222);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const lamp of city.lamps) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6), poleMat);
    pole.position.set(lamp.x, 2.7, lamp.z);
    group.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampHeadMat);
    head.position.set(lamp.x, 5.5, lamp.z);
    head.name = 'lampHead';
    group.add(head);
  }

  // Trees: trunk + canopy cone.
  const trunkMat = makeMaterial(0x5a3a22);
  const leafMat = makeMaterial(0x2e6a2e);
  for (const t of city.trees) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), trunkMat);
    trunk.position.set(t.x, 1.1, t.z);
    group.add(trunk);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.8 * t.s, 4.5 * t.s, 8), leafMat);
    canopy.position.set(t.x, 2.2 + 2.2 * t.s, t.z);
    group.add(canopy);
  }

  // ---- Harbour yard: shipping containers + gantry cranes ------------------
  const containerColors = [0xb03030, 0x2a6a9a, 0x3a8a4a, 0xc07a20, 0x7a5a9a];
  let ci = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      const cx = 330 + col * 8;
      const cz = -110 + row * 16;
      const stack = (ci % 3 === 0) ? 2 : 1;
      for (let s = 0; s < stack; s++) {
        const cont = box(6, 2.6, 2.6, containerColors[(ci + s) % containerColors.length], cx, 1.3 + s * 2.6, cz);
        group.add(cont);
      }
      ci++;
    }
  }
  // Two gantry cranes over the piers (legs + top beam + hanging hook block).
  for (const pz of [-24, 30]) {
    const craneMat = makeMaterial(0xd8a020);
    const legA = new THREE.Mesh(new THREE.BoxGeometry(1.2, 26, 1.2), craneMat);
    legA.position.set(330, 13, pz - 8);
    group.add(legA);
    const legB = new THREE.Mesh(new THREE.BoxGeometry(1.2, 26, 1.2), craneMat);
    legB.position.set(330, 13, pz + 8);
    group.add(legB);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 26), craneMat);
    beam.position.set(330, 26, pz);
    group.add(beam);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 1.2), craneMat);
    jib.position.set(342, 26.5, pz);
    group.add(jib);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), makeMaterial(0x333333));
    hook.position.set(352, 18, pz);
    group.add(hook);
  }

  // ---- Beach props: umbrellas, lifeguard tower ----------------------------
  for (let i = 0; i < 10; i++) {
    const ux = -140 + i * 32 + (i % 2) * 8;
    const uz = 322 + (i % 3) * 10;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), makeMaterial(0xdddddd));
    pole.position.set(ux, 1.5, uz);
    group.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 1.2, 8),
      makeMaterial(i % 2 === 0 ? 0xff5a5a : 0x29e6ff),
    );
    top.position.set(ux, 3.4, uz);
    group.add(top);
  }
  const tower = box(3, 6, 3, 0xe8e8e8, 120, 3, 330);
  group.add(tower);
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(3, 2, 4), makeMaterial(0xff2e88));
  towerRoof.position.set(120, 7, 330);
  towerRoof.rotation.y = Math.PI / 4;
  group.add(towerRoof);

  // ---- Crosswalks at every other intersection ------------------------------
  const crossMat = makeMaterial(0xe8e8e8);
  for (let ix = 0; ix < city.lines.length; ix += 2) {
    for (let iz = 0; iz < city.lines.length; iz += 2) {
      const cx = city.lines[ix];
      const cz = city.lines[iz];
      for (let s = -4; s <= 4; s += 2) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4.5), crossMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(cx + s, 0.05, cz + roadHalf + 2.2);
        group.add(stripe);
      }
    }
  }

  // ---- Downtown billboards --------------------------------------------------
  for (let i = 0; i < 4; i++) {
    const bx = -144 + i * 96;
    const bz = -72;
    const post = box(0.8, 14, 0.8, 0x222222, bx, 7, bz);
    group.add(post);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 7),
      new THREE.MeshBasicMaterial({ color: [0xff2e88, 0x29e6ff, 0xffb02e, 0x7be36b][i] }),
    );
    board.position.set(bx, 17, bz);
    board.name = 'billboard';
    group.add(board);
  }

  // Sky dome (colour driven by render.js) + sun + moon billboards.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ color: cfg.COLORS.skyDay, side: THREE.BackSide, fog: false }),
  );
  sky.name = 'sky';
  group.add(sky);

  return group;
}

// ---------------------------------------------------------------------------
// Module API
// ---------------------------------------------------------------------------
export function init(G) {
  const rng = createRng(G.seed);
  const city = generateCity(rng);
  const queries = buildQueries(city);
  const group = buildMeshes(G, city);
  G.scene.add(group);

  G.world = {
    ...queries,
    roads: city.roads,
    buildings: city.buildings,
    landmarks: city.landmarks,
    lamps: city.lamps,
    trees: city.trees,
    packageSpots: city.packageSpots,
    piers: city.piers,
    bridge: city.bridge,
    group,
    districtAt,
    // Named spawn points gameplay modules can use.
    spawns: {
      garage: { x: -18, z: 108, heading: Math.PI },
      downtown: { x: 0, z: 36, heading: 0 },
      harbor: { x: 300, z: -60, heading: Math.PI / 2 },
      beach: { x: 60, z: 288, heading: Math.PI },
      tower: { x: 0, z: -108, heading: 0 },
      pier: { x: 340, z: -24, heading: Math.PI / 2 },
    },
  };
  return G.world;
}

export function update(G, dt) {
  // Gentle water shimmer: slide the water plane's opacity/offset slightly.
  if (!G.world || !G.world.group) return;
  const water = G.world.group.getObjectByName('water');
  if (water) {
    const t = G.time.t;
    water.position.y = 0.05 + Math.sin(t * 0.7) * 0.03;
    const night = G.time.dayTime < 6 || G.time.dayTime >= 19;
    water.material.color.setHex(night ? cfg.COLORS.waterNight : cfg.COLORS.waterDay);
  }
  // Advance the clock (render.js owns sun/fog; world owns the clock).
  G.time.t += dt;
  G.time.dayTime = (G.time.dayTime + (dt / cfg.DAY_LENGTH_SECONDS) * 24) % 24;
}

export default { init, update };
