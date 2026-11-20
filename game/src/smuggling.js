// Dockside smuggling: a repeatable side job at the Harbor docks, separate
// from the story missions. Rico picks up a crate on foot at the dock, then
// drives it to a drop point somewhere in the city. Each delivery in a row
// pays more than the last — a streak — but the heat grows with it: once
// the streak is rolling, the drop is watched and the law takes notice.
// A run has a clock on it, and getting busted, wasted, or letting the
// clock run out breaks the streak back to zero.
import { addWanted } from './police.js';

export const SMUGGLING = {
  pickup: { x: 300, y: 2050, radius: 130, name: 'Dockside Pier' },
  basePay: 300,
  streakBonus: 100,
  maxStreakBonus: 500,
  runSeconds: 120,
  // From this streak on, the drop is watched: delivering pays the streak
  // but draws a star. From one higher, the pickup itself is watched too.
  watchedStreak: 2,
  hotPickupStreak: 3,
};

// The drop points rotate: one run in three goes to each of them, so the
// drive is never the same twice in a row.
export const SMUGGLING_DROPS = [
  { x: 2200, y: 2050, radius: 110, name: 'Lighthouse Warehouse' },
  { x: 460, y: 1940, radius: 110, name: 'Harbor Warehouse' },
  { x: 1500, y: 1900, radius: 110, name: 'Bay Auto Mall' },
];

export function createSmugglingState() {
  return {
    active: false,
    phase: 'pickup', // 'pickup' — get the crate at the dock; 'deliver' — run it to the drop
    dropIndex: 0,
    timer: 0,
    streak: 0, // deliveries in a row without a break
    runs: 0, // deliveries completed, all time
    earned: 0, // dollars earned smuggling, all time
    heat: 0, // stars drawn by the current streak
    message: '',
    messageTimer: 0,
  };
}

function tell(smuggling, state, text, seconds) {
  smuggling.message = text;
  smuggling.messageTimer = seconds || 3;
  if (state && state.missions) {
    state.missions.message = text;
    state.missions.messageTimer = seconds || 3;
  }
}

// The drop point for the current run.
export function currentDrop(smuggling) {
  return SMUGGLING_DROPS[smuggling.dropIndex % SMUGGLING_DROPS.length];
}

// What the next delivery pays at the current streak, before the streak
// itself moves: the base plus a bonus per delivery in a row, capped so
// the job never pays more than the story missions.
export function nextSmugglingPay(smuggling) {
  const bonus = Math.min(SMUGGLING.maxStreakBonus, smuggling.streak * SMUGGLING.streakBonus);
  return SMUGGLING.basePay + bonus;
}

// The objective position for the minimap arrow: the dock while picking
// up, the drop point while delivering, null when no run is live.
export function smugglingObjective(smuggling) {
  if (!smuggling.active) return null;
  if (smuggling.phase === 'pickup') return { x: SMUGGLING.pickup.x, y: SMUGGLING.pickup.y };
  const drop = currentDrop(smuggling);
  return { x: drop.x, y: drop.y };
}

export function smugglingObjectiveText(smuggling) {
  if (!smuggling.active) return 'Press Z at the Dockside Pier to run a crate.';
  if (smuggling.phase === 'pickup') return 'Pick up the crate at the Dockside Pier';
  const drop = currentDrop(smuggling);
  return `Deliver the crate to the ${drop.name} — ${Math.ceil(smuggling.timer)}s left`;
}

// Why Rico cannot start a smuggling run right now, or null when he can.
// The job is a free-roam side hustle: no run while a story mission, a
// race, or another run is live, and the pickup happens on foot at the dock.
export function canStartSmuggling(state) {
  const s = state.smuggling;
  if (!s) return 'Smuggling is not set up yet.';
  if (s.active) return 'You already have a crate to run — finish it first.';
  if (state.missions && state.missions.active) return 'Finish the story mission first — the dock crew will not wait.';
  if (state.missions2 && state.missions2.active) return 'Finish the current second-arc mission first.';
  if (state.missions3 && state.missions3.active) return 'Finish the current third-arc mission first.';
  if (state.missions4 && state.missions4.active) return 'Finish the current fourth-arc mission first.';
  if (state.race && state.race.active) return 'Finish the race first — the crate will not wait.';
  if (state.player.inCar) return 'Step out of the car — the crate is handed over on foot.';
  const px = state.player.x;
  const py = state.player.y;
  const d = Math.hypot(SMUGGLING.pickup.x - px, SMUGGLING.pickup.y - py);
  if (d > SMUGGLING.pickup.radius) {
    return 'Smuggling runs start at the Dockside Pier — stand on the dock and press Z.';
  }
  return null;
}

// Start a run: pick the next drop point in the rotation and start the
// clock. The streak survives from the last run — that is the whole point.
export function startSmugglingRun(state, random) {
  const whyNot = canStartSmuggling(state);
  if (whyNot) {
    tell(state.smuggling, state, whyNot, 4);
    return null;
  }
  const s = state.smuggling;
  const pick = random || Math.random;
  s.dropIndex = Math.floor(pick() * SMUGGLING_DROPS.length);
  s.active = true;
  s.phase = 'pickup';
  s.timer = SMUGGLING.runSeconds;
  const drop = currentDrop(s);
  tell(s, state, `Crate job: pick it up here, run it to the ${drop.name}. ${SMUGGLING.runSeconds}s on the clock.`, 4);
  return drop;
}

// Walk away from a live run: the crate goes back on the pile and the
// streak breaks. The dock crew does not pay for half a job.
export function abandonSmuggling(state) {
  const s = state.smuggling;
  if (!s || !s.active) return false;
  s.active = false;
  s.phase = 'pickup';
  s.timer = 0;
  s.streak = 0;
  s.heat = 0;
  tell(s, state, 'Run abandoned — the streak is broken.', 3);
  return true;
}

// A bust or a trip to the hospital ends the run the same way: the crate
// is gone and the streak with it.
export function breakSmugglingStreak(state, reason) {
  const s = state.smuggling;
  if (!s) return;
  if (s.active) {
    s.active = false;
    s.phase = 'pickup';
    s.timer = 0;
  }
  s.streak = 0;
  s.heat = 0;
  if (reason) tell(s, state, reason, 4);
}

export function stepSmuggling(smuggling, state, dt) {
  if (smuggling.messageTimer > 0) smuggling.messageTimer -= dt;
  if (!smuggling.active) return;
  smuggling.timer -= dt;
  if (smuggling.timer <= 0) {
    // The clock ran out with the crate still in Rico's hands: the buyer
    // walks, and the streak walks with him.
    smuggling.active = false;
    smuggling.phase = 'pickup';
    smuggling.timer = 0;
    smuggling.streak = 0;
    smuggling.heat = 0;
    tell(smuggling, state, 'Too slow — the buyer walked. The streak is broken.', 4);
    return;
  }
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  if (smuggling.phase === 'pickup') {
    // The crate changes hands on foot, at the dock.
    if (state.player.inCar) return;
    const d = Math.hypot(SMUGGLING.pickup.x - px, SMUGGLING.pickup.y - py);
    if (d < SMUGGLING.pickup.radius) {
      smuggling.phase = 'deliver';
      const drop = currentDrop(smuggling);
      if (smuggling.streak >= SMUGGLING.hotPickupStreak) {
        // The dock is watched now: picking up with a hot streak draws
        // the law before Rico even leaves the pier.
        addWanted(state, 1);
        smuggling.heat += 1;
        tell(smuggling, state, `Crate secured — the dock is watched! Run it to the ${drop.name}.`, 4);
      } else {
        tell(smuggling, state, `Crate secured — run it to the ${drop.name}.`, 3);
      }
    }
  } else if (smuggling.phase === 'deliver') {
    const drop = currentDrop(smuggling);
    const d = Math.hypot(drop.x - px, drop.y - py);
    if (d < drop.radius) {
      const pay = nextSmugglingPay(smuggling);
      smuggling.streak += 1;
      smuggling.runs += 1;
      smuggling.earned += pay;
      state.player.money += pay;
      if (state.stats) state.stats.earned = (state.stats.earned || 0) + pay;
      smuggling.active = false;
      smuggling.phase = 'pickup';
      smuggling.timer = 0;
      if (smuggling.streak >= SMUGGLING.watchedStreak) {
        // The drop was watched: the streak pays, but the law noticed.
        addWanted(state, 1);
        smuggling.heat += 1;
        tell(smuggling, state, `Delivered! +$${pay} (streak ${smuggling.streak}) — the drop was watched, the law is on you.`, 4);
      } else {
        tell(smuggling, state, `Delivered! +$${pay} (streak ${smuggling.streak}) — next run pays $${nextSmugglingPay(smuggling)}.`, 4);
      }
    }
  }
}

// One line for the title screen: runs done, streak, best pay so far.
export function smugglingSummaryLines(smuggling) {
  const next = nextSmugglingPay(smuggling);
  if (smuggling.runs === 0) {
    return ['Smuggling: no runs yet — press Z at the Dockside Pier, next run pays $300'];
  }
  return [`Smuggling: ${smuggling.runs} runs, streak ${smuggling.streak}, earned $${smuggling.earned}, next run pays $${next}`];
}

export function serializeSmuggling(smuggling) {
  return {
    streak: smuggling.streak,
    runs: smuggling.runs,
    earned: smuggling.earned,
    heat: smuggling.heat,
    dropIndex: smuggling.dropIndex,
  };
}

export function deserializeSmuggling(smuggling, data) {
  if (!data || typeof data !== 'object') return;
  if (typeof data.streak === 'number') smuggling.streak = Math.max(0, data.streak);
  if (typeof data.runs === 'number') smuggling.runs = Math.max(0, data.runs);
  if (typeof data.earned === 'number') smuggling.earned = Math.max(0, data.earned);
  if (typeof data.heat === 'number') smuggling.heat = Math.max(0, data.heat);
  if (typeof data.dropIndex === 'number') smuggling.dropIndex = Math.max(0, data.dropIndex);
}
