// Meridian Heat — procedural Port Meridian.
// Builds the whole city from the seeded RNG: road grid, districts,
// buildings, harbor + pier, bridge, props, neon and sky.
// Exposes the collision + road helpers every other module relies on:
//   world.collide(pos, r)          — push a circle out of building AABBs
//   world.nearestRoadPoint(x, z)   — snap a point onto the road network
//   world.randomRoadPos(rng)       — random drivable spot with heading
//   world.districtAt(x, z)         — district name for HUD flavour
//   world.landmarks                — named spawn / mission spots
//   world.groundHeight(x, z)       — always 0 (flat arcade ground)

import { CFG } from './config.js';

const THREE = globalThis.THREE;

const PALETTE = {
  asphalt: '#2b2d33',
  asphaltLine: '#d8c95a',
  sidewalk: '#55575e',
  block: '#3a3b41',
  park: '#2f5d33',
  plaza: '#6e6a5e',
  sand: '#c9b489',
};

// Block roles: most blocks hold buildings; a few are parks / plazas / lots.
const BLOCK_ROLES = [
  'buildings', 'buildings', 'buildings', 'buildings',
  'buildings', 'park', 'plaza', 'parking',
];

export const world = {
  roads: [], // {x1,z1,x2,z2,axis}
  roadLines: [], // road centre lines, one per road
  buildings: [], // {minX,maxX,minZ,maxZ,h,cx,cz,district,mesh}
  lamps: [], // {x,z}
  trees: [],
  neonSigns: [],
  landmarks: {},
  bounds: 0,
  group: null,
  water: null,
  stars: null,
  _neonMats: [],
  _waterMat: null,
  _sunMesh: null,
  _moonMesh: null,
};

function roadCentres() {
  const { BLOCK, ROAD, BLOCKS } = CFG.CITY;
  const half = CFG.CITY.HALF;
  const centres = [];
  for (let i = 0; i <= BLOCKS; i++) {
    centres.push(-half + ROAD / 2 + i * (BLOCK + ROAD));
  }
  return centres;
}

function blockCentres() {
  const centres = roadCentres();
  const out = [];
  for (let i = 0; i < CFG.CITY.BLOCKS; i++) {
    out.push((centres[i] + centres[i + 1]) / 2);
  }
  return out;
}

function districtFor(bx, bz) {
  if (bz >= 6) return 'HARBOR';
  if (bx >= 6) return 'BEACHFRONT';
  if (bz <= 1) return 'HILLS';
  if (bx >= 3 && bx <= 4 && bz >= 2 && bz <= 4) return 'DOWNTOWN';
  if (bx <= 1) return 'OLD_TOWN';
  return 'DOWNTOWN';
}

// --- Ground texture: top-down map of roads, sidewalks and blocks -----------
function makeGroundTexture(rng, blockRole) {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  const half = CFG.CITY.HALF;
  const toPx = (v) => ((v + half) / (half * 2)) * S;
  const scale = S / (half * 2);

  // Base: sidewalk grey everywhere.
  ctx.fillStyle = PALETTE.sidewalk;
  ctx.fillRect(0, 0, S, S);

  const centres = roadCentres();
  const bCentres = blockCentres();

  // Block interiors.
  for (let bz = 0; bz < CFG.CITY.BLOCKS; bz++) {
    for (let bx = 0; bx < CFG.CITY.BLOCKS; bx++) {
      const cx = bCentres[bx];
      const cz = bCentres[bz];
      const role = blockRole[bz][bx];
      const x = toPx(cx - CFG.CITY.BLOCK / 2);
      const z = toPx(cz - CFG.CITY.BLOCK / 2);
      const w = CFG.CITY.BLOCK * scale;
      if (role === 'park') ctx.fillStyle = PALETTE.park;
      else if (role === 'plaza') ctx.fillStyle = PALETTE.plaza;
      else if (role === 'parking') ctx.fillStyle = '#33343a';
      else ctx.fillStyle = PALETTE.block;
      ctx.fillRect(x, z, w, w);
      // Subtle inner border so blocks read as parcels.
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, z + 2, w - 4, w - 4);
    }
  }

  // Roads: dark asphalt bands + centre dashes.
  ctx.fillStyle = PALETTE.asphalt;
  for (const c of centres) {
    ctx.fillRect(0, toPx(c - CFG.CITY.ROAD / 2), S, CFG.CITY.ROAD * scale);
    ctx.fillRect(toPx(c - CFG.CITY.ROAD / 2), 0, CFG.CITY.ROAD * scale, S);
  }
  ctx.strokeStyle = PALETTE.asphaltLine;
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 18]);
  for (const c of centres) {
    ctx.beginPath();
    ctx.moveTo(0, toPx(c));
    ctx.lineTo(S, toPx(c));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toPx(c), 0);
    ctx.lineTo(toPx(c), S);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const cx of centres) {
    for (const cz of centres) {
      const w = CFG.CITY.ROAD * scale;
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(toPx(cx) + k * 7 - 2, toPx(cz) - w / 2 + 3, 4, w - 6);
      }
    }
  }

  // Beach strip on the east edge.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(toPx(half - 2), 0, toPx(half + 14) - toPx(half - 2), S);

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Window texture shared by building facades ------------------------------
function makeWindowTexture(lit) {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#20242c';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      const on = Math.random() < (lit ? 0.55 : 0.12);
      ctx.fillStyle = on ? '#ffd98a' : '#11141a';
      ctx.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let windowTexDay = null;
let windowTexNight = null;

function buildingMaterial(districtKey, height) {
  const d = CFG.DISTRICTS[districtKey];
  const base = new THREE.Color(d.color);
  // Vary brightness a little so the skyline is not flat.
  const v = 0.85 + Math.random() * 0.3;
  base.multiplyScalar(v);
  const mat = new THREE.MeshLambertMaterial({
    color: base,
    map: height > 26 ? windowTexNight : windowTexDay,
    emissive: 0x000000,
  });
  return mat;
}

function buildCity(G) {
  const rng = G.rng;
  const group = new THREE.Group();
  group.name = 'city';
  world.group = group;
  G.scene.add(group);

  const half = CFG.CITY.HALF;
  world.bounds = half;

  // Roads list (segments + centre lines).
  const centres = roadCentres();
  for (const c of centres) {
    world.roads.push({ x1: -half, z1: c, x2: half, z2: c, axis: 'x' });
    world.roads.push({ x1: c, z1: -half, x2: c, z2: half, axis: 'z' });
    world.roadLines.push({ axis: 'x', at: c });
    world.roadLines.push({ axis: 'z', at: c });
  }

  // Block roles (seeded, but keep the centre plaza + harbor lots fixed).
  const bCentres = blockCentres();
  const blockRole = [];
  for (let bz = 0; bz < CFG.CITY.BLOCKS; bz++) {
    blockRole.push([]);
    for (let bx = 0; bx < CFG.CITY.BLOCKS; bx++) {
      if (bx === 3 && bz === 3) blockRole[bz].push('plaza'); // Meridian Plaza
      else if (bz >= 7) blockRole[bz].push('parking'); // harbor lots
      else blockRole[bz].push(rng.pick(BLOCK_ROLES));
    }
  }

  // Ground plane.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 40, half * 2 + 40),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(rng, blockRole) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 10);
  ground.name = 'ground';
  group.add(ground);

  // --- Buildings ------------------------------------------------------------
  windowTexDay = makeWindowTexture(false);
  windowTexNight = makeWindowTexture(true);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0); // origin at base
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x1c1e24 });

  for (let bz = 0; bz < CFG.CITY.BLOCKS; bz++) {
    for (let bx = 0; bx < CFG.CITY.BLOCKS; bx++) {
      if (blockRole[bz][bx] !== 'buildings') continue;
      const district = districtFor(bx, bz);
      const cx = bCentres[bx];
      const cz = bCentres[bz];
      const count = rng.int(1, 3);
      for (let k = 0; k < count; k++) {
        const w = rng.range(16, 26);
        const d = rng.range(16, 26);
        const ox = rng.range(-14, 14);
        const oz = rng.range(-14, 14);
        if (Math.abs(ox) + w / 2 > 28 || Math.abs(oz) + d / 2 > 28) continue;
        let h;
        if (district === 'DOWNTOWN') h = rng.range(28, 95);
        else if (district === 'HARBOR') h = rng.range(10, 22);
        else if (district === 'HILLS') h = rng.range(8, 18);
        else if (district === 'OLD_TOWN') h = rng.range(10, 20);
        else h = rng.range(12, 30);
        const x = cx + ox;
        const z = cz + oz;
        const mesh = new THREE.Mesh(boxGeo, buildingMaterial(district, h));
        mesh.scale.set(w, h, d);
        mesh.position.set(x, 0, z);
        mesh.name = `building-${district}-${bx}-${bz}-${k}`;
        group.add(mesh);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.scale.set(w + 0.6, 0.8, d + 0.6);
        roof.position.set(x, h, z);
        group.add(roof);
        // Rooftop beacon on the tallest downtown towers.
        if (h > 60 && rng.chance(0.5)) {
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff4444 }),
          );
          beacon.position.set(x, h + 1.2, z);
          beacon.name = 'beacon';
          group.add(beacon);
          world.neonSigns.push({ mesh: beacon, kind: 'beacon' });
        }
        world.buildings.push({
          minX: x - w / 2, maxX: x + w / 2,
          minZ: z - d / 2, maxZ: z + d / 2,
          h, cx: x, cz: z, district, mesh,
        });
      }
    }
  }

  // Meridian Tower — the tallest landmark, final-mission site.
  const towerX = bCentres[4] + 8;
  const towerZ = bCentres[2] - 6;
  const towerMat = new THREE.MeshLambertMaterial({
    color: 0x35465e, map: windowTexNight, emissive: 0x111522,
  });
  const tower = new THREE.Mesh(boxGeo, towerMat);
  tower.scale.set(30, 130, 30);
  tower.position.set(towerX, 0, towerZ);
  tower.name = 'meridian-tower';
  group.add(tower);
  world.buildings.push({
    minX: towerX - 15, maxX: towerX + 15,
    minZ: towerZ - 15, maxZ: towerZ + 15,
    h: 130, cx: towerX, cz: towerZ, district: 'DOWNTOWN', mesh: tower,
  });
  const towerTop = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff2255 }),
  );
  towerTop.position.set(towerX, 132, towerZ);
  group.add(towerTop);
  world.neonSigns.push({ mesh: towerTop, kind: 'beacon' });

  return { blockRole, bCentres, centres };
}

function buildProps(G, layout) {
  const rng = G.rng;
  const group = world.group;
  const { blockRole, bCentres } = layout;
  const half = CFG.CITY.HALF;

  // --- Trees: parks + sidewalk rows ----------------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
  const leafGeo = new THREE.ConeGeometry(2.2, 5.5, 7);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e6b2f });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x3a7d33 });
  function tree(x, z, s) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.1;
    const leaf = new THREE.Mesh(leafGeo, rng.chance(0.5) ? leafMat : leafMat2);
    leaf.position.y = 4.4;
    t.add(trunk);
    t.add(leaf);
    t.position.set(x, 0, z);
    t.scale.setScalar(s);
    group.add(t);
    world.trees.push({ x, z });
  }
  for (let bz = 0; bz < CFG.CITY.BLOCKS; bz++) {
    for (let bx = 0; bx < CFG.CITY.BLOCKS; bx++) {
      const role = blockRole[bz][bx];
      const cx = bCentres[bx];
      const cz = bCentres[bz];
      if (role === 'park') {
        const n = rng.int(6, 10);
        for (let i = 0; i < n; i++) {
          tree(cx + rng.range(-24, 24), cz + rng.range(-24, 24), rng.range(0.8, 1.4));
        }
      } else if (role === 'plaza') {
        tree(cx - 20, cz - 20, 1.2);
        tree(cx + 20, cz - 20, 1.2);
        tree(cx - 20, cz + 20, 1.2);
        tree(cx + 20, cz + 20, 1.2);
      } else if (rng.chance(0.4)) {
        tree(cx + rng.range(-26, 26), cz + rng.range(-26, 26), rng.range(0.7, 1.1));
      }
    }
  }

  // --- Street lamps along every road ----------------------------------------
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.5, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 8);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const centres = layout.centres;
  for (const cx of centres) {
    for (const cz of centres) {
      if (rng.chance(0.55)) continue;
      const x = cx + CFG.CITY.ROAD / 2 + 1.2;
      const z = cz + CFG.CITY.ROAD / 2 + 1.2;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 2.75, z);
      group.add(pole);
      const bulb = new THREE.Mesh(lampGeo, lampMat);
      bulb.position.set(x, 5.6, z);
      bulb.name = 'lamp-bulb';
      group.add(bulb);
      world.lamps.push({ x, z });
    }
  }

  // --- Neon signs on downtown rooftops --------------------------------------
  const neonColors = [0xff2d78, 0x00e5ff, 0xffe600, 0x7dff5e, 0xff6a00];
  const signGeo = new THREE.BoxGeometry(1, 1, 0.4);
  let placed = 0;
  for (const b of world.buildings) {
    if (b.district !== 'DOWNTOWN' || b.h < 30 || placed >= 14) continue;
    if (!rng.chance(0.35)) continue;
    const color = rng.pick(neonColors);
    const mat = new THREE.MeshBasicMaterial({ color });
    const sign = new THREE.Mesh(signGeo, mat);
    const w = rng.range(8, 16);
    sign.scale.set(w, rng.range(1.2, 2.4), 1);
    sign.position.set(b.cx, b.h + 1.4, b.minZ - 0.4);
    sign.name = 'neon-sign';
    group.add(sign);
    world.neonSigns.push({ mesh: sign, kind: 'sign', mat, color });
    world._neonMats.push(mat);
    placed++;
  }

  // --- Plaza fountain (centre block) -----------------------------------------
  const plazaX = bCentres[3];
  const plazaZ = bCentres[3];
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 7, 1.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x8a8f98 }),
  );
  fountain.position.set(plazaX, 0.6, plazaZ);
  group.add(fountain);
  const fWater = new THREE.Mesh(
    new THREE.CylinderGeometry(5.2, 5.2, 0.3, 20),
    new THREE.MeshLambertMaterial({ color: 0x2e7fa8 }),
  );
  fWater.position.set(plazaX, 1.2, plazaZ);
  group.add(fWater);
}

function buildHarbor(G, layout) {
  const rng = G.rng;
  const group = world.group;
  const half = CFG.CITY.HALF;
  const waterZ0 = half + 6;
  const waterZ1 = half + 130;

  // --- Sea / harbor water -----------------------------------------------------
  const waterGeo = new THREE.PlaneGeometry(half * 2 + 200, waterZ1 - waterZ0 + 60);
  world._waterMat = new THREE.MeshLambertMaterial({
    color: 0x14425e,
    transparent: true,
    opacity: 0.92,
  });
  const water = new THREE.Mesh(waterGeo, world._waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, CFG.WORLD.WATER_LEVEL, (waterZ0 + waterZ1) / 2);
  water.name = 'harbor-water';
  group.add(water);
  world.water = water;

  // Sand beach along the east edge.
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(16, half * 2),
    new THREE.MeshLambertMaterial({ color: 0xc9b489 }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(half + 8, 0.05, 0);
  group.add(beach);

  // --- Pier: wooden deck reaching into the harbor ------------------------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 70), pierMat);
  pier.position.set(-60, 0.4, half + 40);
  pier.name = 'pier';
  group.add(pier);
  // Pier posts.
  const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 3, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x4a3018 });
  for (let i = 0; i < 6; i++) {
    for (const sx of [-6, 6]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(-60 + sx, -0.8, half + 12 + i * 11);
      group.add(post);
    }
  }
  // Shipping containers stacked near the docks.
  const contColors = [0xb03030, 0x2e6bb0, 0x3a8a3a, 0xb07a2e, 0x7a3ab0];
  const contGeo = new THREE.BoxGeometry(12, 2.6, 2.6);
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshLambertMaterial({ color: rng.pick(contColors) });
    const c = new THREE.Mesh(contGeo, mat);
    const cx = rng.range(-220, 220);
    const cz = half - 18 - Math.floor(i / 5) * 8;
    c.position.set(cx, 1.3 + (i % 2) * 0, cz);
    c.rotation.y = rng.chance(0.3) ? Math.PI / 2 : 0;
    c.name = 'container';
    group.add(c);
    world.buildings.push({
      minX: cx - 6, maxX: cx + 6, minZ: cz - 1.5, maxZ: cz + 1.5,
      h: 2.6, cx, cz, district: 'HARBOR', mesh: c,
    });
  }
  // Two dock cranes (simple gantry shapes).
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a020 });
  for (const cx of [-180, 120]) {
    const crane = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(1.2, 26, 1.2);
    for (const [lx, lz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
      const leg = new THREE.Mesh(legGeo, craneMat);
      leg.position.set(lx, 13, lz);
      crane.add(leg);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(26, 1.6, 2), craneMat);
    beam.position.set(6, 26, 0);
    crane.add(beam);
    crane.position.set(cx, 0, half - 6);
    group.add(crane);
  }

  // --- Bridge: road at x = 0 crossing to a small island -------------------------
  const bridgeDeck = new THREE.Mesh(
    new THREE.BoxGeometry(CFG.CITY.ROAD + 4, 1, 120),
    new THREE.MeshLambertMaterial({ color: 0x3a3d44 }),
  );
  bridgeDeck.position.set(0, 0.5, half + 60);
  bridgeDeck.name = 'bridge';
  group.add(bridgeDeck);
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(26, 30, 2, 12),
    new THREE.MeshLambertMaterial({ color: 0x4a4d55 }),
  );
  island.position.set(0, 0.2, half + 118);
  group.add(island);
  // Bridge cables (two arcs of thin boxes).
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
  for (const sx of [-7, 7]) {
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 120), cableMat);
    cable.position.set(sx, 6, half + 60);
    group.add(cable);
  }
}

function buildSky(G) {
  const scene = G.scene;
  // Stars (visible at night; opacity driven by render.js).
  const starCount = 900;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * Math.PI * 0.45 + 0.08;
    const r = 900;
    positions[i * 3] = Math.cos(a) * Math.cos(e) * r;
    positions[i * 3 + 1] = Math.sin(e) * r;
    positions[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0,
  });
  world.stars = new THREE.Points(starGeo, starMat);
  world.stars.name = 'stars';
  scene.add(world.stars);

  // Sun + moon discs.
  world._sunMesh = new THREE.Mesh(
    new THREE.CircleGeometry(22, 24),
    new THREE.MeshBasicMaterial({ color: 0xffdf6b, fog: false }),
  );
  world._sunMesh.name = 'sun';
  scene.add(world._sunMesh);
  world._moonMesh = new THREE.Mesh(
    new THREE.CircleGeometry(14, 24),
    new THREE.MeshBasicMaterial({ color: 0xdde4f0, fog: false }),
  );
  world._moonMesh.name = 'moon';
  scene.add(world._moonMesh);

  // A few drifting clouds (flat white blobs).
  const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, transparent: true, opacity: 0.75,
  });
  world.clouds = [];
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(8 + Math.random() * 8, 8, 6), cloudMat);
      puff.position.set(k * 10 - n * 5, Math.random() * 3, Math.random() * 6 - 3);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(
      Math.random() * 800 - 400,
      120 + Math.random() * 60,
      Math.random() * 800 - 400,
    );
    cloud.name = 'cloud';
    scene.add(cloud);
    world.clouds.push(cloud);
  }
}

function buildLandmarks(G, layout) {
  const { bCentres } = layout;
  const half = CFG.CITY.HALF;
  // Player spawn: Meridian Plaza (centre).
  const spawn = { x: bCentres[3], z: bCentres[3] + 10 };
  world.landmarks = {
    spawn,
    plaza: { x: bCentres[3], z: bCentres[3] },
    garage: { x: bCentres[2] - 20, z: bCentres[5] + 18 }, // Mara's garage, Old Town
    pier: { x: -60, z: half + 40 },
    tower: { x: bCentres[4] + 8, z: bCentres[2] - 6 },
    beach: { x: half - 8, z: 40 },
    harborGate: { x: 0, z: half - 8 },
    raceStart: { x: bCentres[3], z: bCentres[0] },
    warehouse: { x: 200, z: half - 24 },
  };
  // Mara's garage: a low wide building with a glowing sign.
  const garage = new THREE.Mesh(
    new THREE.BoxGeometry(30, 8, 18),
    new THREE.MeshLambertMaterial({ color: 0x5e2e2e }),
  );
  garage.position.set(world.landmarks.garage.x, 4, world.landmarks.garage.z);
  garage.name = 'maras-garage';
  world.group.add(garage);
  world.buildings.push({
    minX: world.landmarks.garage.x - 15, maxX: world.landmarks.garage.x + 15,
    minZ: world.landmarks.garage.z - 9, maxZ: world.landmarks.garage.z + 9,
    h: 8, cx: world.landmarks.garage.x, cz: world.landmarks.garage.z,
    district: 'OLD_TOWN', mesh: garage,
  });
  const gSign = new THREE.Mesh(
    new THREE.BoxGeometry(12, 2, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xff2d78 }),
  );
  gSign.position.set(world.landmarks.garage.x, 9.4, world.landmarks.garage.z - 9.2);
  world.group.add(gSign);
  world.neonSigns.push({ mesh: gSign, kind: 'sign', mat: gSign.material, color: 0xff2d78 });
  world._neonMats.push(gSign.material);
}

// --- Public API ---------------------------------------------------------------

export function init(G) {
  G.world = world;
  const layout = buildCity(G);
  buildProps(G, layout);
  buildHarbor(G, layout);
  buildSky(G);
  buildLandmarks(G, layout);
  return world;
}

/** Push a circle (pos.xz, radius r) out of every building AABB it overlaps.
 *  Mutates pos in place. Returns true when a collision happened. */
export function collide(pos, r) {
  let hit = false;
  const half = CFG.CITY.HALF;
  // City bounds act as invisible walls.
  if (pos.x < -half + r) { pos.x = -half + r; hit = true; }
  if (pos.x > half - r) { pos.x = half - r; hit = true; }
  if (pos.z < -half + r) { pos.z = -half + r; hit = true; }
  if (pos.z > half + 130 - r) { pos.z = half + 130 - r; hit = true; }
  for (const b of world.buildings) {
    if (pos.x + r <= b.minX || pos.x - r >= b.maxX) continue;
    if (pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
    // Overlap: push out along the smallest penetration axis.
    const dxMin = (pos.x + r) - b.minX;
    const dxMax = b.maxX - (pos.x - r);
    const dzMin = (pos.z + r) - b.minZ;
    const dzMax = b.maxZ - (pos.z - r);
    const m = Math.min(dxMin, dxMax, dzMin, dzMax);
    if (m === dxMin) pos.x = b.minX - r;
    else if (m === dxMax) pos.x = b.maxX + r;
    else if (m === dzMin) pos.z = b.minZ - r;
    else pos.z = b.maxZ + r;
    hit = true;
  }
  return hit;
}

/** Snap (x, z) to the nearest point on the road network.
 *  Returns {x, z, heading} where heading follows the road direction. */
export function nearestRoadPoint(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const road of world.roads) {
    let px;
    let pz;
    let heading;
    if (road.axis === 'x') {
      px = Math.max(road.x1, Math.min(road.x2, x));
      pz = road.z1;
      heading = 0;
    } else {
      px = road.x1;
      pz = Math.max(road.z1, Math.min(road.z2, z));
      heading = Math.PI / 2;
    }
    const d = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (d < bestD) {
      bestD = d;
      best = { x: px, z: pz, heading };
    }
  }
  return best;
}

/** Random drivable position on a road, with a heading along the road. */
export function randomRoadPos(rng) {
  const road = rng.pick(world.roads);
  const t = rng.range(0.05, 0.95);
  if (road.axis === 'x') {
    const x = road.x1 + (road.x2 - road.x1) * t;
    const lane = rng.chance(0.5) ? -2.8 : 2.8;
    return { x, z: road.z1 + lane, heading: rng.chance(0.5) ? 0 : Math.PI };
  }
  const z = road.z1 + (road.z2 - road.z1) * t;
  const lane = rng.chance(0.5) ? -2.8 : 2.8;
  return { x: road.x1 + lane, z, heading: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
}

/** District name at a world position (for HUD flavour text). */
export function districtAt(x, z) {
  const half = CFG.CITY.HALF;
  if (z > half) return 'Harbor';
  if (x > half - 20) return 'Beachfront';
  const bx = Math.max(0, Math.min(7, Math.floor((x + half) / CFG.CITY.STEP)));
  const bz = Math.max(0, Math.min(7, Math.floor((z + half) / CFG.CITY.STEP)));
  return CFG.DISTRICTS[districtFor(bx, bz)].name;
}

/** Ground height — flat arcade ground (bridges/pier sit at y = 0). */
export function groundHeight(/* x, z */) {
  return 0;
}

/** True when (x, z) is over open harbor water (south of the city edge). */
export function isWater(x, z) {
  const half = CFG.CITY.HALF;
  if (z <= half + 4) return false;
  // The pier deck and bridge deck are dry.
  if (Math.abs(x + 60) < 8 && z > half + 6 && z < half + 76) return false;
  if (Math.abs(x) < 9 && z > half + 4 && z < half + 122) return false;
  if (Math.hypot(x, z - (half + 118)) < 28) return false;
  return true;
}

/** Per-frame world animation: water shimmer, neon flicker, clouds, sun/moon. */
export function update(G, dt) {
  const t = G.time.t;
  // Water: gentle opacity breathing so the harbor reads as alive.
  if (world._waterMat) {
    world._waterMat.opacity = 0.9 + Math.sin(t * 0.7) * 0.03;
  }
  // Neon flicker: one sign at a time stutters, like a tired tube.
  if (world._neonMats.length > 0) {
    const idx = Math.floor(t * 2) % world._neonMats.length;
    const mat = world._neonMats[idx];
    if (mat.userData.base === undefined) {
      mat.userData.base = mat.color.getHex();
    }
    const flicker = Math.sin(t * 13) > -0.85;
    mat.color.setHex(flicker ? mat.userData.base : 0x331111);
  }
  // Clouds drift slowly east.
  if (world.clouds) {
    for (const c of world.clouds) {
      c.position.x += dt * 1.5;
      if (c.position.x > 450) c.position.x = -450;
    }
  }
  // Sun / moon orbit the city with the time of day.
  const dayTime = G.time.dayTime;
  const sunAngle = ((dayTime - 6) / 12) * Math.PI; // 0 at 06:00, PI at 18:00
  const R = 800;
  if (world._sunMesh) {
    world._sunMesh.position.set(Math.cos(sunAngle) * R, Math.sin(sunAngle) * R * 0.6 + 40, -200);
    world._sunMesh.lookAt(G.camera.position);
    world._sunMesh.visible = dayTime > 5 && dayTime < 19.5;
  }
  if (world._moonMesh) {
    const moonAngle = sunAngle + Math.PI;
    world._moonMesh.position.set(Math.cos(moonAngle) * R, Math.sin(moonAngle) * R * 0.6 + 40, -200);
    world._moonMesh.lookAt(G.camera.position);
    world._moonMesh.visible = !(dayTime > 5 && dayTime < 19.5);
  }
}

export default world;
