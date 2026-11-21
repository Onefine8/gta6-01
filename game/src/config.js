// Meridian Heat — configuration constants.
// Single source of truth for city size, colours, tuning and controls.
// No browser globals are touched here; this module is pure data.
export const CONFIG = {
  // ---- City layout -------------------------------------------------------
  // 8x8 blocks, block ~60 m, road ~12 m, pitch 72 m between road centrelines.
  GRID_BLOCKS: 8,
  BLOCK_SIZE: 60,
  ROAD_WIDTH: 12,
  ROAD_PITCH: 72,
  // Road centrelines run from -288 to +288 on both axes.
  CITY_HALF: 288,
  // Water (harbour) starts east of this x; beach strip south of this z.
  WATER_X: 320,
  BEACH_Z: 300,
  WORLD_BOUND: 420,

  // ---- Districts ---------------------------------------------------------
  // name, centre [x, z], radius, max building height, palette tag.
  DISTRICTS: [
    { name: 'Downtown',   cx: 0,    cz: 0,    r: 150, maxHeight: 95, tag: 'downtown' },
    { name: 'Harbor',     cx: 300,  cz: -40,  r: 120, maxHeight: 26, tag: 'harbor' },
    { name: 'Old Town',   cx: -190, cz: 150,  r: 130, maxHeight: 30, tag: 'oldtown' },
    { name: 'Beachfront', cx: 60,   cz: 300,  r: 140, maxHeight: 34, tag: 'beach' },
    { name: 'Hills',      cx: -200, cz: -190, r: 130, maxHeight: 42, tag: 'hills' },
  ],

  // ---- Colours -----------------------------------------------------------
  COLORS: {
    skyDay: 0x87b5e0,
    skyDusk: 0xe08a5a,
    skyNight: 0x0b1026,
    fogDay: 0x9db8cc,
    fogNight: 0x0d1428,
    sunDay: 0xfff2d8,
    sunNight: 0x8fa8ff,
    ground: 0x3d4a3a,
    sidewalk: 0x8d8d8d,
    road: 0x2b2b30,
    roadLine: 0xd8c95a,
    waterDay: 0x1d6f8f,
    waterNight: 0x0a2438,
    buildingGlass: 0x9fc4d8,
    neonPink: 0xff2e88,
    neonCyan: 0x29e6ff,
    neonAmber: 0xffb02e,
    policeBlue: 0x2244ff,
    policeRed: 0xff2222,
  },

  // ---- Time of day -------------------------------------------------------
  // dayTime is hours in [0, 24). 8 = morning, 13 = noon, 21 = night.
  DAY_LENGTH_SECONDS: 600, // full 24 h cycle in 10 minutes of play
  START_DAY_TIME: 10.5,

  // ---- Player / vehicle tuning (shared by engine + gameplay) -------------
  PLAYER: {
    walkSpeed: 5.2,
    runSpeed: 9.0,
    jumpSpeed: 7.5,
    radius: 0.55,
    maxHealth: 100,
  },
  VEHICLE: {
    accel: 14,
    brake: 26,
    reverseAccel: 8,
    maxSpeed: 42,
    maxReverse: 10,
    steer: 1.9,
    grip: 6.5,
    radius: 1.6,
  },
  POLICE: {
    maxWanted: 5,
    decayDelay: 12, // seconds out of sight before wanted decays
    bustRadius: 2.2,
  },

  // ---- Economy -----------------------------------------------------------
  START_MONEY: 250,
  MISSION_REWARDS: [500, 800, 1200, 1500, 2000, 2500, 4000, 10000],
  TAXI_FARE: 120,
  HIDDEN_PACKAGES: 20,

  // ---- Controls ----------------------------------------------------------
  KEYS: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    run: 'ShiftLeft',
    jump: 'Space',
    enterVehicle: 'KeyE',
    shoot: 'Mouse0',
    pause: 'Escape',
    radio: 'KeyR',
    horn: 'KeyH',
    camera: 'KeyC',
    reload: 'KeyR',
  },

  // ---- Rendering ---------------------------------------------------------
  CAMERA: {
    followDistance: 11,
    followHeight: 6.5,
    lookAhead: 6,
    orbitDistance: 260,
    orbitHeight: 170,
    fov: 62,
  },
  FOG_NEAR: 90,
  FOG_FAR_DAY: 620,
  FOG_FAR_NIGHT: 380,

  // ---- Persistence -------------------------------------------------------
  SAVE_KEY: 'meridian-heat-save-v1',
  AUTOSAVE_SECONDS: 60,

  // ---- Screenshot presets ------------------------------------------------
  SHOTS: {
    chase:   { seed: 7, dayTime: 15.0, wanted: 2 },
    walk:    { seed: 7, dayTime: 11.0, wanted: 0 },
    mission: { seed: 7, dayTime: 13.5, wanted: 0 },
    night:   { seed: 7, dayTime: 21.5, wanted: 1 },
  },
};

export default CONFIG;
