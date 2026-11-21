// Meridian Heat — configuration & tuning constants.
// Single source of truth for city size, physics, economy and controls.
// Gameplay modules read this through G.cfg; they never hard-code tuning.

export const CFG = {
  // ---- City layout -------------------------------------------------------
  CITY: {
    BLOCKS: 8, // 8 x 8 blocks
    BLOCK: 60, // metres per block
    ROAD: 12, // metres of road width
    // SIZE is derived: BLOCKS*BLOCK + (BLOCKS+1)*ROAD = 588
    get SIZE() { return this.BLOCKS * this.BLOCK + (this.BLOCKS + 1) * this.ROAD; },
    get HALF() { return this.SIZE / 2; },
    get STEP() { return this.BLOCK + this.ROAD; }, // road-centre spacing
  },

  // ---- Districts (block coords bx,bz in 0..7; bz grows south) ------------
  DISTRICTS: {
    DOWNTOWN: { name: 'Downtown', color: 0x2e4a6b, accent: 0x39c5ff },
    HARBOR: { name: 'Harbor', color: 0x3d5a4a, accent: 0xffb347 },
    OLD_TOWN: { name: 'Old Town', color: 0x6b4a2e, accent: 0xffd27d },
    BEACHFRONT: { name: 'Beachfront', color: 0x2e6b6b, accent: 0x7df9ff },
    HILLS: { name: 'Hills', color: 0x4a6b2e, accent: 0xa8ff7d },
  },

  // ---- Player on foot -----------------------------------------------------
  PLAYER: {
    WALK_SPEED: 6,
    RUN_SPEED: 10.5,
    JUMP_VEL: 8.5,
    GRAVITY: 24,
    RADIUS: 0.6,
    HEIGHT: 1.8,
    HEALTH: 100,
    PUNCH_DAMAGE: 12,
  },

  // ---- Vehicles (arcade physics) ------------------------------------------
  CAR: {
    ACCEL: 24, // m/s^2 forward
    BRAKE: 38,
    REVERSE_ACCEL: 14,
    MAX_SPEED: 58, // ~209 km/h
    MAX_REVERSE: 16,
    STEER: 2.1, // rad/s at full lock, scaled by speed
    DRAG: 0.55, // 1/s linear drag
    GRIP: 6.0, // lateral velocity damping
    RADIUS: 1.6,
    LENGTH: 4.4,
    WIDTH: 2.0,
  },

  // ---- Wanted / police ------------------------------------------------------
  WANTED: {
    MAX: 5,
    DECAY_DELAY: 14, // seconds out of sight before decay starts
    DECAY_RATE: 0.08, // stars per second once decaying
    BUST_RADIUS: 2.2, // cop on foot must be this close to bust
    BUST_TIME: 2.5, // seconds held inside radius to get busted
    COP_CARS_PER_STAR: 1,
    COP_FOOT_PER_STAR: 1,
    SIGHT_RANGE: 55,
  },

  // ---- Combat ---------------------------------------------------------------
  COMBAT: {
    PISTOL_DAMAGE: 34,
    PISTOL_RATE: 0.28, // seconds between shots
    PISTOL_RANGE: 60,
    PISTOL_MAG: 12,
    SMG_DAMAGE: 18,
    SMG_RATE: 0.09,
    SMG_RANGE: 50,
    SMG_MAG: 30,
    ENEMY_HEALTH: 60,
    ENEMY_DAMAGE: 8,
    ENEMY_RANGE: 38,
  },

  // ---- Economy ---------------------------------------------------------------
  ECONOMY: {
    START_MONEY: 500,
    MISSION_REWARDS: [800, 1200, 1500, 2000, 2500, 3000, 5000, 10000],
    TAXI_FARE_BASE: 60,
    TAXI_FARE_PER_M: 0.9,
    PACKAGE_REWARD: 250,
    RACE_REWARD: 1500,
    CAR_REPAIR_COST: 200,
  },

  // ---- Missions (names only; logic lives in missions.js) ---------------------
  MISSIONS: [
    { id: 1, name: 'First Wheels', brief: 'Steal a car and drive it to Mara\u2019s garage.' },
    { id: 2, name: 'Courier Run', brief: 'Deliver 3 packages before the timer runs out.' },
    { id: 3, name: 'Getaway', brief: 'Lose a 2-star wanted level for 60 seconds.' },
    { id: 4, name: 'Rival Rumble', brief: 'Clear the Kroll gang off the pier.' },
    { id: 5, name: 'Midnight Race', brief: 'Win the street race: 3 laps, 6 checkpoints.' },
    { id: 6, name: 'The Pickup', brief: 'Drive Mara to the harbor. Expect an ambush.' },
    { id: 7, name: 'Harbor Heist', brief: 'Steal the shipment truck and lose 4 stars.' },
    { id: 8, name: 'King of Meridian', brief: 'Race, chase and shootout at Meridian Tower.' },
  ],

  // ---- World / ambience ---------------------------------------------------------
  WORLD: {
    DAY_LENGTH: 600, // real seconds for a full 24h cycle
    START_DAY_TIME: 10.5, // 10:30 in the morning
    SUNRISE: 6,
    SUNSET: 19.5,
    NIGHT_START: 20,
    TRAFFIC_COUNT: 26,
    PED_COUNT: 40,
    PACKAGE_COUNT: 20,
    WATER_LEVEL: -0.5,
    FOG_DAY: 420,
    FOG_NIGHT: 260,
  },

  // ---- Radio -----------------------------------------------------------------------
  RADIO: [
    { name: 'MERIDIAN FM', genre: 'synthwave', tempo: 112 },
    { name: 'NEON NIGHTS', genre: 'electro', tempo: 126 },
    { name: 'HARBOR TALK', genre: 'talk', tempo: 0 },
    { name: 'OLD TOWN GOLD', genre: 'funk', tempo: 98 },
  ],

  // ---- Controls -----------------------------------------------------------------------
  KEYS: {
    FORWARD: 'KeyW',
    BACK: 'KeyS',
    LEFT: 'KeyA',
    RIGHT: 'KeyD',
    RUN: 'ShiftLeft',
    JUMP: 'Space',
    ENTER_CAR: 'KeyE',
    ATTACK: 'Mouse0',
    RELOAD: 'KeyR',
    WEAPON_NEXT: 'KeyQ',
    PAUSE: 'Escape',
    RADIO_NEXT: 'KeyC',
    HORN: 'KeyH',
    CAMERA: 'KeyV',
    MISSION_MENU: 'KeyM',
    SPRINT_CAR: 'ShiftLeft',
  },

  // ---- UI ------------------------------------------------------------------------------
  UI: {
    MINIMAP_SIZE: 180,
    MINIMAP_RANGE: 320, // metres shown across the minimap
    MESSAGE_TIME: 4, // seconds a banner stays up
  },

  SAVE_KEY: 'meridian-heat-save-v1',
  DEFAULT_SEED: 7,
};

export default CFG;
