// peds.js — pedestrians on the sidewalks of Port Meridian.
//
// Owns G.peds. Peds stroll between sidewalk points, idle at corners, and
// run when scared: a gunshot, a speeding car, or a police chase nearby.
// Meshes are built only when the THREE global exists; all movement math
// is pure and exported for tests.

export const PED_TARGET = 24;
export const PED_WALK_SPEED = 1.4;
export const PED_FLEE_SPEED = 4.6;
export const PED_SPAWN_RADIUS = 90;
export const PED_DESPAWN_RADIUS = 160;
export const FEAR_RADIUS = 18;

const SHIRT_COLORS = [0x3a6ea5, 0xc25e3a, 0x4a9a5c, 0xd8c25a, 0x8a5aa5, 0x5aa5a0, 0xb03a5a];

// --- pure helpers --------------------------------------------------------

// A point on a sidewalk: a road point pushed sideways off the carriageway.
// Roads come in Builder A's raw form {axis, x1, z1, x2, z2}; {ax, az, bx,
// bz} segments (test stubs) work too.
export function sidewalkPoint(roads, rng) {
  const r = () => (rng && typeof rng.next === 'function' ? rng.next() : Math.random());
  if (!roads || roads.length === 0) return { x: (r() - 0.5) * 300, z: (r() - 0.5) * 300 };
  const road = roads[Math.floor(r() * roads.length)];
  if (road.ax !== undefined) {
    const t = r();
    const x = road.ax + (road.bx - road.ax) * t;
    const z = road.az + (road.bz - road.az) * t;
    const len = Math.max(1, Math.hypot(road.bx - road.ax, road.bz - road.az));
    const nx = -(road.bz - road.az) / len;
    const nz = (road.bx - road.ax) / len;
    const side = r() < 0.5 ? -1 : 1;
    const off = 7.5 + r() * 2.5;
    return { x: x + nx * side * off, z: z + nz * side * off };
  }
  const off = (r() < 0.5 ? -1 : 1) * (7.5 + r() * 2.5);
  if (road.axis === 'x') {
    return { x: road.x1 + r() * (road.x2 - road.x1), z: road.z1 + off };
  }
  return { x: road.x1 + off, z: road.z1 + r() * (road.z2 - road.z1) };
}

// Unit vector away from a threat, with a little wobble so peds don't run
// in a perfect line.
export function fleeDirection(ped, threat, rng) {
  const r = () => (rng && typeof rng.next === 'function' ? rng.next() : Math.random());
  const dx = ped.pos.x - threat.x;
  const dz = ped.pos.z - threat.z;
  const d = Math.hypot(dx, dz) || 1;
  const wobble = (r() - 0.5) * 0.6;
  const cos = Math.cos(wobble);
  const sin = Math.sin(wobble);
  return { x: (dx / d) * cos - (dz / d) * sin, z: (dx / d) * sin + (dz / d) * cos };
}

export function isScared(G, ped) {
  const threats = [];
  if (G.combat && G.combat.lastShotAt !== undefined && G.time) {
    const age = G.time.t - G.combat.lastShotAt;
    if (age < 2.5 && G.combat.lastShotPos) threats.push(G.combat.lastShotPos);
  }
  const pv = G.vehicles ? G.vehicles.playerVehicle : null;
  if (pv && Math.abs(pv.speed) > 14) threats.push(pv.pos);
  const p = G.player ? G.player.pos : null;
  if (p && G.police && G.police.wanted >= 2) threats.push(p);
  for (const t of threats) {
    if (Math.hypot(ped.pos.x - t.x, ped.pos.z - t.z) < FEAR_RADIUS) return t;
  }
  return null;
}

// --- mesh (THREE only when the global exists) ----------------------------

function buildMesh(G, ped) {
  if (typeof THREE === 'undefined') return null;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.8, 0.32),
    new THREE.MeshStandardMaterial({ color: ped.color }),
  );
  body.position.y = 0.95;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xd9a066 }),
  );
  head.position.y = 1.55;
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.6, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x2a2f38 }),
  );
  legs.position.y = 0.3;
  group.add(body, head, legs);
  group.position.set(ped.pos.x, 0, ped.pos.z);
  if (G.scene) G.scene.add(group);
  return group;
}

// --- spawning ------------------------------------------------------------

export function spawnPed(G, x, z) {
  const rng = G.rng;
  const r = () => (rng && typeof rng.next === 'function' ? rng.next() : Math.random());
  const ped = {
    pos: { x, y: 0, z },
    heading: r() * Math.PI * 2,
    speed: PED_WALK_SPEED * (0.8 + r() * 0.5),
    state: 'walk',
    target: null,
    idleTimer: 0,
    color: SHIRT_COLORS[Math.floor(r() * SHIRT_COLORS.length)],
    mesh: null,
  };
  ped.target = sidewalkPoint((G.world && G.world.roads) || [], rng);
  ped.mesh = buildMesh(G, ped);
  G.peds.list.push(ped);
  return ped;
}

// --- lifecycle -----------------------------------------------------------

export function init(G) {
  const target = (G.cfg && G.cfg.WORLD && G.cfg.WORLD.PED_COUNT) || PED_TARGET;
  // Replace the (frozen) module namespace on G with the live peds object:
  // the crowd list plus update() and the spawnNear() shots.js uses.
  G.peds = {
    list: [],
    target,
    update,
    spawnNear: (x, z, radius) => {
      const roads = (G.world && G.world.roads) || [];
      const s = sidewalkPoint(roads, G.rng);
      // Pull the spot toward the requested centre when it lands too far.
      const dx = s.x - x;
      const dz = s.z - z;
      const d = Math.hypot(dx, dz);
      const rr = radius ?? 25;
      const px = d > rr ? x + (dx / d) * rr * 0.8 : s.x;
      const pz = d > rr ? z + (dz / d) * rr * 0.8 : s.z;
      return spawnPed(G, px, pz);
    },
  };
  const roads = (G.world && G.world.roads) || [];
  const p = G.player ? G.player.pos : { x: 0, z: 0 };
  for (let i = 0; i < 12; i++) {
    const s = sidewalkPoint(roads, G.rng);
    if (Math.hypot(s.x - p.x, s.z - p.z) < PED_SPAWN_RADIUS) spawnPed(G, s.x, s.z);
  }
  return G.peds;
}

export function update(G, dt) {
  const pd = G.peds;
  if (!pd || G.state !== 'playing') return;
  const p = G.player ? G.player.pos : { x: 0, z: 0 };
  const roads = (G.world && G.world.roads) || [];

  // Top the crowd back up near the player.
  if (pd.list.length < (pd.target ?? PED_TARGET) && Math.random() < dt * 2) {
    const s = sidewalkPoint(roads, G.rng);
    if (Math.hypot(s.x - p.x, s.z - p.z) < PED_SPAWN_RADIUS) spawnPed(G, s.x, s.z);
  }

  for (let i = pd.list.length - 1; i >= 0; i--) {
    const ped = pd.list[i];
    if (Math.hypot(ped.pos.x - p.x, ped.pos.z - p.z) > PED_DESPAWN_RADIUS) {
      if (ped.mesh && G.scene) G.scene.remove(ped.mesh);
      pd.list.splice(i, 1);
      continue;
    }

    const threat = isScared(G, ped);
    if (threat) ped.state = 'flee';
    else if (ped.state === 'flee' && !threat) ped.state = 'walk';

    if (ped.state === 'flee') {
      const dir = fleeDirection(ped, threat ?? p, G.rng);
      ped.pos.x += dir.x * PED_FLEE_SPEED * dt;
      ped.pos.z += dir.z * PED_FLEE_SPEED * dt;
      ped.heading = Math.atan2(dir.x, -dir.z);
    } else if (ped.state === 'walk' && ped.target) {
      const dx = ped.target.x - ped.pos.x;
      const dz = ped.target.z - ped.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.2) {
        ped.idleTimer += dt;
        if (ped.idleTimer > 1 + Math.random() * 3) {
          ped.target = sidewalkPoint(roads, G.rng);
          ped.idleTimer = 0;
        }
      } else {
        ped.heading = Math.atan2(dx, -dz);
        ped.pos.x += (dx / d) * ped.speed * dt;
        ped.pos.z += (dz / d) * ped.speed * dt;
      }
    }

    if (G.world && typeof G.world.collide === 'function') G.world.collide(ped.pos, 0.4);
    if (ped.mesh) {
      ped.mesh.position.set(ped.pos.x, 0, ped.pos.z);
      ped.mesh.rotation.y = ped.heading;
      ped.mesh.position.y = ped.state === 'flee' ? Math.abs(Math.sin((G.time ? G.time.t : 0) * 14)) * 0.08 : 0;
    }
  }
}
