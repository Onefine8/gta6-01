// Bay Auto Mall: the car dealership. Rico can buy a car off the lot,
// sell the car he is driving, or trade it in against the featured car.
// The lot holds four cars at a time — three regular stock and one rare
// car at a premium — and the rare slot changes every in-game day, so a
// Kingpin Limo on the lot today is gone tomorrow. Buying happens on foot
// at the showroom; selling and trading in happen from the driver's seat.
import { VEHICLE_MODELS } from './config.js';

export const DEALERSHIP = {
  x: 1500, y: 1900, radius: 150, name: 'Bay Auto Mall',
};

// What each model costs new on the lot. A used car sells for 60% of this.
export const DEALERSHIP_PRICES = {
  'Sunset Coupe': 2500,
  'Bay Runner': 2200,
  'Palm Taxi': 1800,
  'Coral Pickup': 2400,
  'Harbor Van': 2000,
  'Neon GT': 6000,
  'Sunset Roadster': 7500,
  'Harbor Tow': 1600,
  'Container Hauler': 3500,
  'Kingpin Limo': 9000,
};

// The rare slot: one of these sits on the lot at a premium, and which one
// it is changes every in-game day.
export const RARE_MODELS = ['Kingpin Limo', 'Neon GT', 'Sunset Roadster'];
export const RARE_MARKUP = 1.2;
export const SELL_FRACTION = 0.6;
export const STOCK_SIZE = 4;

export function modelPrice(model) {
  return DEALERSHIP_PRICES[model] || 2000;
}

export function rarePrice(model) {
  return Math.round(modelPrice(model) * RARE_MARKUP);
}

// What Rico's car is worth on the lot: 60% of its new price, rounded
// down to the nearest $10 — the mall takes its cut.
export function carValue(car) {
  if (!car || !car.model) return 0;
  const base = modelPrice(car.model);
  return Math.floor((base * SELL_FRACTION) / 10) * 10;
}

function modelByName(name) {
  return VEHICLE_MODELS.find((m) => m.name === name) || null;
}

// Build a fresh lot for a given day: three regular cars drawn from the
// models that are not rare, plus the day's rare car at its premium price.
// The draw uses the passed random so a seeded run stocks the same lot.
export function buildDealershipStock(day, random) {
  const pick = random || Math.random;
  const regular = VEHICLE_MODELS
    .map((m) => m.name)
    .filter((name) => !RARE_MODELS.includes(name));
  const stock = [];
  const pool = regular.slice();
  while (stock.length < STOCK_SIZE - 1 && pool.length > 0) {
    const at = Math.floor(pick() * pool.length);
    const name = pool.splice(at, 1)[0];
    const model = modelByName(name);
    stock.push({
      id: `stock-${stock.length}`,
      model: name,
      price: modelPrice(name),
      color: model ? model.color : '#b8bcc4',
      topSpeed: model ? model.top : 500,
      rare: false,
    });
  }
  const rareName = RARE_MODELS[((day % RARE_MODELS.length) + RARE_MODELS.length) % RARE_MODELS.length];
  const rareModel = modelByName(rareName);
  stock.push({
    id: `stock-${stock.length}`,
    model: rareName,
    price: rarePrice(rareName),
    color: rareModel ? rareModel.color : '#1f2937',
    topSpeed: rareModel ? rareModel.top : 600,
    rare: true,
  });
  return stock;
}

export function createDealershipState(random) {
  return {
    stock: buildDealershipStock(0, random),
    featuredIndex: STOCK_SIZE - 1, // the rare car is the featured one
    day: 0,
    carsBought: 0,
    carsSold: 0,
    spent: 0,
    earned: 0,
    message: '',
    messageTimer: 0,
  };
}

function tell(dealership, state, text, seconds) {
  dealership.message = text;
  dealership.messageTimer = seconds || 3;
  if (state && state.missions) {
    state.missions.message = text;
    state.missions.messageTimer = seconds || 3;
  }
}

// The featured car: the rare one on the lot, the car the O key buys.
export function featuredCar(dealership) {
  return dealership.stock[dealership.featuredIndex] || dealership.stock[0] || null;
}

export function stockById(dealership, id) {
  return dealership.stock.find((c) => c.id === id) || null;
}

// A bought car needs a parking spot: the lot's forecourt, just outside
// the showroom ring.
function spawnBoughtCar(state, entry) {
  const car = {
    id: state.parkedCars.length,
    x: DEALERSHIP.x + 90,
    y: DEALERSHIP.y + 40,
    angle: 0,
    speed: 0,
    model: entry.model,
    color: entry.color,
    topSpeed: entry.topSpeed,
    health: 100,
    parked: true,
    driver: null,
    stolen: false,
  };
  state.parkedCars.push(car);
  return car;
}

// Rotate the lot when the in-game day rolls over: the rare car changes,
// and so does the regular stock. Called once per step from the main loop.
export function stepDealership(dealership, state, dt, random) {
  if (dealership.messageTimer > 0) dealership.messageTimer -= dt;
  const day = state && state.weather ? state.weather.day || 0 : 0;
  if (day !== dealership.day) {
    dealership.day = day;
    dealership.stock = buildDealershipStock(day, random);
    dealership.featuredIndex = STOCK_SIZE - 1;
    const rare = featuredCar(dealership);
    if (rare) tell(dealership, state, `New day at Bay Auto Mall — today's rare car is the ${rare.model} for $${rare.price}.`, 5);
  }
}

// Why Rico cannot buy this stock car right now, or null when he can.
export function canBuyDealershipCar(state, stockId) {
  const d = state.dealership;
  const entry = stockById(d, stockId);
  if (!entry) return 'That car is not on the lot anymore.';
  if (state.player.inCar) return 'Step out of the car — buying happens on foot at the showroom.';
  const px = state.player.x;
  const py = state.player.y;
  if (Math.hypot(DEALERSHIP.x - px, DEALERSHIP.y - py) > DEALERSHIP.radius) {
    return 'Bay Auto Mall is on the Harbor road — stand at the showroom to buy.';
  }
  if (state.player.money < entry.price) {
    return `The ${entry.model} costs $${entry.price} — you only have $${state.player.money}.`;
  }
  return null;
}

// Buy a stock car: pay, park it on the forecourt, and restock the slot
// with a fresh regular car so the lot never runs dry.
export function buyDealershipCar(state, stockId, random) {
  const whyNot = canBuyDealershipCar(state, stockId);
  if (whyNot) {
    tell(state.dealership, state, whyNot, 4);
    return null;
  }
  const d = state.dealership;
  const entry = stockById(d, stockId);
  state.player.money -= entry.price;
  d.spent += entry.price;
  d.carsBought += 1;
  const car = spawnBoughtCar(state, entry);
  // Restock the slot: a rare car is replaced by a fresh regular one, so
  // the rare slot only comes back with the next day's rotation.
  const pick = random || Math.random;
  const regular = VEHICLE_MODELS
    .map((m) => m.name)
    .filter((name) => !RARE_MODELS.includes(name)
      && !d.stock.some((c) => c.model === name));
  if (regular.length > 0) {
    const name = regular[Math.floor(pick() * regular.length)];
    const model = modelByName(name);
    entry.model = name;
    entry.price = modelPrice(name);
    entry.color = model ? model.color : '#b8bcc4';
    entry.topSpeed = model ? model.top : 500;
    entry.rare = false;
    if (d.featuredIndex >= d.stock.length) d.featuredIndex = 0;
  } else {
    d.stock = d.stock.filter((c) => c.id !== stockId);
    if (d.featuredIndex >= d.stock.length) d.featuredIndex = 0;
  }
  tell(d, state, `Bought the ${car.model} — it is parked on the forecourt. Press E to drive it away.`, 4);
  return car;
}

// Why Rico cannot sell the car he is driving right now, or null.
export function canSellCar(state) {
  const car = state.player.inCar;
  if (!car) return 'You are not driving anything to sell.';
  if (car.model === 'PBPD Cruiser') return 'The mall does not buy police cruisers — park it somewhere quiet.';
  const px = car.x;
  const py = car.y;
  if (Math.hypot(DEALERSHIP.x - px, DEALERSHIP.y - py) > DEALERSHIP.radius) {
    return 'Sell at Bay Auto Mall — drive the car to the showroom.';
  }
  return null;
}

// Sell the car Rico is driving: it leaves the world, he steps out on
// foot at the showroom, and the mall pays 60% of the new price.
export function sellCar(state) {
  const whyNot = canSellCar(state);
  if (whyNot) {
    tell(state.dealership, state, whyNot, 4);
    return 0;
  }
  const car = state.player.inCar;
  const value = carValue(car);
  state.parkedCars = state.parkedCars.filter((c) => c !== car);
  if (state.traffic) state.traffic = state.traffic.filter((c) => c !== car);
  state.player.inCar = null;
  state.player.x = DEALERSHIP.x;
  state.player.y = DEALERSHIP.y + 60;
  state.player.money += value;
  state.dealership.carsSold += 1;
  state.dealership.earned += value;
  if (state.stats) state.stats.earned = (state.stats.earned || 0) + value;
  tell(state.dealership, state, `Sold the ${car.model} for $${value}.`, 4);
  return value;
}

// Trade the car Rico is driving in against a stock car: the old car's
// value comes off the new car's price, and Rico drives the new one away
// straight from the forecourt. Returns the deal, or null when it cannot
// be done.
export function tradeInCar(state, stockId, random) {
  const d = state.dealership;
  const entry = stockById(d, stockId);
  if (!entry) {
    tell(d, state, 'That car is not on the lot anymore.', 4);
    return null;
  }
  const car = state.player.inCar;
  if (!car) {
    tell(d, state, 'Trade-in needs a car to trade — drive one to the showroom.', 4);
    return null;
  }
  if (car.model === 'PBPD Cruiser') {
    tell(d, state, 'The mall does not take police cruisers in trade.', 4);
    return null;
  }
  if (Math.hypot(DEALERSHIP.x - car.x, DEALERSHIP.y - car.y) > DEALERSHIP.radius) {
    tell(d, state, 'Trade in at Bay Auto Mall — drive the car to the showroom.', 4);
    return null;
  }
  const value = carValue(car);
  const owed = entry.price - value;
  if (owed > state.player.money) {
    tell(d, state, `Trade-in needs $${owed} on top of your ${car.model} — you only have $${state.player.money}.`, 4);
    return null;
  }
  const oldModel = car.model;
  state.parkedCars = state.parkedCars.filter((c) => c !== car);
  if (state.traffic) state.traffic = state.traffic.filter((c) => c !== car);
  state.player.inCar = null;
  // Paying the difference: a negative `owed` is a trade down, so
  // subtracting it pays Rico back — exactly once.
  state.player.money -= owed;
  d.spent += Math.max(0, owed);
  d.earned += Math.max(0, -owed);
  d.carsSold += 1;
  d.carsBought += 1;
  const bought = spawnBoughtCar(state, entry);
  // Restock the traded-for slot the same way a purchase does.
  const pick = random || Math.random;
  const regular = VEHICLE_MODELS
    .map((m) => m.name)
    .filter((name) => !RARE_MODELS.includes(name)
      && !d.stock.some((c) => c.model === name));
  if (regular.length > 0) {
    const name = regular[Math.floor(pick() * regular.length)];
    const model = modelByName(name);
    entry.model = name;
    entry.price = modelPrice(name);
    entry.color = model ? model.color : '#b8bcc4';
    entry.topSpeed = model ? model.top : 500;
    entry.rare = false;
  }
  // Rico drives the new car away: put him straight in the driver's seat.
  state.player.x = bought.x;
  state.player.y = bought.y;
  state.player.inCar = bought;
  bought.parked = false;
  bought.driver = 'player';
  const report = { sold: oldModel, soldValue: value, bought: bought.model, paid: owed };
  if (owed >= 0) {
    tell(d, state, `Traded the ${oldModel} in for the ${bought.model} — $${owed} on top.`, 4);
  } else {
    tell(d, state, `Traded the ${oldModel} down for the ${bought.model} — $${-owed} back in your pocket.`, 4);
  }
  return report;
}

// One line per stock car for the title screen: model, price, rare flag.
export function dealershipSummaryLines(dealership) {
  return dealership.stock.map((c) => {
    const tag = c.rare ? ' (RARE)' : '';
    return `${c.model}${tag}: $${c.price}`;
  });
}

export function serializeDealership(dealership) {
  return {
    day: dealership.day,
    carsBought: dealership.carsBought,
    carsSold: dealership.carsSold,
    spent: dealership.spent,
    earned: dealership.earned,
  };
}

export function deserializeDealership(dealership, data) {
  if (!data || typeof data !== 'object') return;
  if (typeof data.day === 'number') dealership.day = Math.max(0, data.day);
  if (typeof data.carsBought === 'number') dealership.carsBought = Math.max(0, data.carsBought);
  if (typeof data.carsSold === 'number') dealership.carsSold = Math.max(0, data.carsSold);
  if (typeof data.spent === 'number') dealership.spent = Math.max(0, data.spent);
  if (typeof data.earned === 'number') dealership.earned = Math.max(0, data.earned);
}
