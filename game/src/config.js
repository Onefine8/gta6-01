// Palmetto Bay Heat — every tuning number, colour and name in one place.
// The city is a fixed 3200 x 2400 world; the camera shows a 1280 x 720 window of it.
// All names, characters, vehicles and places are original inventions.
export const FIELD = { width: 1280, height: 720 };
export const WORLD = { width: 3200, height: 2400 };
export const STEP = 1 / 60;
export const SAVE_KEY = 'palmetto-bay-heat.save.v1';

export const CITY = {
  name: 'Palmetto Bay',
  roadEvery: 400,
  roadWidth: 96,
  blockPad: 26,
  beachY: 2220,
  waterY: 2320,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  runSpeed: 330,
  health: 100,
  punchRange: 34,
  punchDamage: 34,
  punchCooldown: 0.45,
  stamina: 100,
  staminaDrain: 24,
  staminaRegen: 16,
  healthRegenDelay: 8,
  healthRegenRate: 3,
};

// Places that do something: the garage repairs cars, the hospital heals Rico,
// the precinct is where busted players wake up, the bank is Dante's big job.
export const SITES = {
  garage: { x: 400, y: 360, radius: 130, name: 'Marina Garage' },
  hospital: { x: 2400, y: 1960, radius: 130, name: 'Bay General Hospital' },
  precinct: { x: 1200, y: 360, radius: 110, name: 'PBPD Precinct 2' },
  bank: { x: 2800, y: 1200, radius: 110, name: 'Downtown Bank' },
};
export const REPAIR_COST = 50;
export const HEAL_COST = 30;

// Downtown Heist tuning: how long the vault takes to crack, how fast the
// crack progress fades when Rico steps out of the ring, how fast the alarm
// climbs once he is inside, and what counts as a quiet job for the bonus.
// The Kingpin Takedown (mission 7) reuses the same vault rig with its own
// crack time and a bigger quiet bonus.
export const HEIST = {
  crackSeconds: 8,
  crackDecaySeconds: 4,
  alarmPerSecond: 2.4,
  alarmFirstStar: 50,
  alarmSecondStar: 85,
  quietBonusAlarm: 60,
  quietBonus: 500,
  kingpinCrackSeconds: 12,
  kingpinQuietBonus: 1000,
};

// Container Heist tuning (mission 6): how long the container lock takes to
// crack while Rico stays in the yard, how fast the crack slips when he steps
// out, how close a patrolling guard has to be to spot him, and how fast the
// spotted meter fills and cools.
export const CONTAINER = {
  sneakSeconds: 12,
  sneakDecaySeconds: 6,
  guardSpotRange: 280,
  spotPerSecond: 25,
  spotCooldownPerSecond: 12,
  guardSpeed: 130,
};

// Kingpin Takedown tuning (mission 7): how many bodyguards hold the
// compound, how much health each one has, and how hard they hit Rico up
// close.
export const KINGPIN = {
  fightCount: 4,
  bodyguardHealth: 100,
  bodyguardSpeed: 60,
  bodyguardRange: 280,
  bodyguardDamage: 6,
};

// Business Empire tuning: each owned business pays its income into its till
// once per tick; the till caps at a few ticks so Rico has to come and collect
// (B) instead of letting it pile up forever.
export const EMPIRE = {
  tickSeconds: 60,
  maxTicks: 4,
  collectRange: 150,
  businesses: [
    { id: 'safehouse', name: 'Bayview Safehouse', price: 1500, income: 45, x: 700, y: 340 },
    { id: 'workshop', name: 'Palm Auto Workshop', price: 3000, income: 100, x: 1300, y: 740 },
    { id: 'bar', name: 'Neon Bar', price: 5000, income: 180, x: 2100, y: 340 },
    { id: 'warehouse', name: 'Harbor Warehouse', price: 9000, income: 320, x: 460, y: 1940 },
  ],
};

// Named districts, shown in the HUD as Rico crosses the city.
export const DISTRICTS = [
  { name: 'Marina District', x0: 0, y0: 0, x1: 1200, y1: 800 },
  { name: 'Coral Heights', x0: 2400, y0: 0, x1: 3200, y1: 800 },
  { name: 'Old Town', x0: 0, y0: 800, x1: 1200, y1: 1600 },
  { name: 'Palmetto Park', x0: 1200, y0: 800, x1: 2000, y1: 1200 },
  { name: 'Downtown', x0: 2000, y0: 800, x1: 3200, y1: 1600 },
  { name: 'Harbor Market', x0: 0, y0: 1600, x1: 1200, y1: 2220 },
  { name: 'Lighthouse Point', x0: 2400, y0: 1600, x1: 3200, y1: 2220 },
  { name: 'Beachfront', x0: 0, y0: 2220, x1: 3200, y1: 2400 },
];

// Taxi side job: a fare pays a base amount plus distance.
export const TAXI = {
  baseFare: 60,
  perUnit: 0.055,
  waitSeconds: 30,
  nearMissBonus: 25,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  turnRate: 2.6,
  drag: 0.55,
  health: 100,
  driftTurn: 1.7,
  slickGrip: 0.75,
};

export const WANTED = {
  max: 5,
  decaySeconds: 26,
  stealStars: 1,
  hitPedStars: 2,
  maxPolice: [0, 2, 3, 4, 5, 6],
  policeSpeed: [0, 300, 330, 360, 390, 420],
  roadblockStars: 3,
  maxRoadblocks: 2,
  roadblockCooldown: 25,
  heliStars: 4,
};

export const TIME = {
  startHour: 9.5,
  dayLengthSeconds: 360,
  nightStart: 19.5,
  nightEnd: 6.5,
};

export const PACKAGES_TOTAL = 12;

export const VEHICLE_MODELS = [
  { name: 'Sunset Coupe', color: '#e8533f', top: 580 },
  { name: 'Bay Runner', color: '#3f8fe8', top: 540 },
  { name: 'Palm Taxi', color: '#f2c94c', top: 500 },
  { name: 'Coral Pickup', color: '#7ec850', top: 520 },
  { name: 'Harbor Van', color: '#b8bcc4', top: 470 },
  { name: 'Neon GT', color: '#c65df0', top: 620 },
  { name: 'Sunset Roadster', color: '#ff8c42', top: 640 },
  { name: 'Harbor Tow', color: '#8a9a5b', top: 450 },
  // Round 4: the hauler Rico jacks in the Container Heist, and the kingpin's
  // own limousine — rare, black, and the second-fastest car on the streets.
  { name: 'Container Hauler', color: '#d97706', top: 480 },
  { name: 'Kingpin Limo', color: '#1f2937', top: 600 },
];

export const PALETTE = {
  grass: '#5da24a',
  grassDark: '#4c8a3e',
  sand: '#e8d39a',
  water: '#2f7fb8',
  waterDeep: '#256a9e',
  road: '#3a3f47',
  roadEdge: '#2c3038',
  lane: '#f2d54c',
  sidewalk: '#9aa0a8',
  building: ['#d97b5f', '#e8a34c', '#7fb3d5', '#c9a0c9', '#8fc7a1', '#e5d8a8', '#f08080', '#6fa8a0'],
  roof: ['#8a4a3a', '#a8742c', '#4a6a8a', '#7a5a8a', '#4a7a55', '#a89a5a'],
  park: '#3f8a3a',
  tree: '#2e7a2e',
  treeLight: '#4da34d',
  player: '#f2c94c',
  playerShirt: '#e8533f',
  police: '#1d4ed8',
  policeLight: '#ff3b30',
  heli: '#dc2626',
  roadblock: '#f97316',
  garage: '#4ade80',
  hospital: '#f8fafc',
  taxi: '#22d3ee',
  skid: 'rgba(20,20,24,0.55)',
  text: '#ffffff',
  darkText: '#10141b',
  panel: 'rgba(12,16,24,0.88)',
  panelEdge: '#f2c94c',
  gold: '#f2c94c',
  health: '#4ade80',
  healthLow: '#ef4444',
  rain: 'rgba(174,194,224,0.55)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const TITLE_FONT = '"Trebuchet MS", system-ui, sans-serif';
