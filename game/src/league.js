// The Palmetto Bay Street Racing League: a season of five rounds, one
// per circuit, with the same four rivals Rico already races — Vex,
// Marisol, Turbo Tommy and Ghost — plus Rico himself. Every round pays
// championship points by finishing place, the standings carry across
// the season, and the season champion takes a $5,000 purse on top of
// the $800 a single race win already pays.
//
// A season is five rounds because there are five circuits: Marina Loop,
// Downtown Dash, Beachfront Sprint, Bay Perimeter Run and Park Slalom,
// in that order. Rico enters a league round by winning (or finishing) a
// normal race on the next circuit in the rotation — the main loop calls
// recordLeagueRace when a race finishes, and the league works out the
// rest: points, standings, the season end, and the champion's purse.
//
// Points by place (five cars on the grid):
//   1st 10, 2nd 8, 3rd 6, 4th 4, 5th 2 — so even a last place scores,
//   but a win is worth five times a wooden spoon. Ties on points are
//   broken by wins, then by best finish time.
import { RACE_CIRCUITS, RACE_RIVALS } from './races.js';

export const LEAGUE_ROUNDS_PER_SEASON = 5;
export const LEAGUE_POINTS = [10, 8, 6, 4, 2];
export const LEAGUE_CHAMPION_PRIZE = 5000;
export const LEAGUE_PLAYER_NAME = 'Rico';

export function leagueRacerNames() {
  return [LEAGUE_PLAYER_NAME, ...RACE_RIVALS.map((r) => r.name)];
}

// Points for a finishing place (1-based). Places past the table score 1.
export function pointsForPlace(place) {
  if (place >= 1 && place <= LEAGUE_POINTS.length) return LEAGUE_POINTS[place - 1];
  return 1;
}

export function createLeagueState() {
  const points = {};
  const wins = {};
  const best = {};
  for (const name of leagueRacerNames()) {
    points[name] = 0;
    wins[name] = 0;
    best[name] = null;
  }
  return {
    season: 1, // seasons count up; a new season starts after round 5
    round: 0, // rounds finished in this season, 0..5
    points, // name -> championship points this season
    wins, // name -> round wins this season
    best, // name -> best finish time this season, seconds or null
    // Every round on record: { season, round, circuit, results } with
    // results in finishing order [{ name, time }].
    rounds: [],
    // Season champions so far: [{ season, champion, points }].
    champions: [],
    seasonsWon: 0, // seasons Rico has won
    totalPoints: 0, // championship points Rico has scored, all seasons
    races: 0, // league rounds Rico has finished, all seasons
  };
}

// The circuit for the next league round: the rotation runs the five
// circuits in order, one per round.
export function nextLeagueCircuit(league) {
  return RACE_CIRCUITS[league.round % RACE_CIRCUITS.length];
}

export function nextLeagueCircuitIndex(league) {
  return league.round % RACE_CIRCUITS.length;
}

export function leagueRoundName(league) {
  const circuit = nextLeagueCircuit(league);
  return `Season ${league.season}, Round ${league.round + 1} — ${circuit.name}`;
}

// Is this circuit the next league round? A race only counts for the
// league when it is run on the circuit the rotation is waiting for.
export function isLeagueRound(league, circuitIndex) {
  return circuitIndex === nextLeagueCircuitIndex(league);
}

// The standings right now, best first: points, then wins, then best time.
export function leagueStandings(league) {
  const rows = leagueRacerNames().map((name) => ({
    name,
    points: league.points[name] || 0,
    wins: league.wins[name] || 0,
    best: league.best[name],
  }));
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.best === null && b.best === null) return 0;
    if (a.best === null) return 1;
    if (b.best === null) return -1;
    return a.best - b.best;
  });
  return rows;
}

export function leagueLeader(league) {
  const standings = leagueStandings(league);
  return standings[0] || null;
}

export function playerLeaguePoints(league) {
  return league.points[LEAGUE_PLAYER_NAME] || 0;
}

export function playerLeagueWins(league) {
  return league.wins[LEAGUE_PLAYER_NAME] || 0;
}

// Rico's place in the standings right now, 1-based.
export function playerLeagueRank(league) {
  const standings = leagueStandings(league);
  const at = standings.findIndex((row) => row.name === LEAGUE_PLAYER_NAME);
  return at < 0 ? standings.length : at + 1;
}

// How many points Rico trails the leader by — 0 when he leads.
export function pointsBehindLeader(league) {
  const leader = leagueLeader(league);
  if (!leader) return 0;
  return Math.max(0, leader.points - playerLeaguePoints(league));
}

// Record a finished league round. results is the finishing order:
// [{ name, time }] with Rico in it as 'Rico'. Returns a report:
// { season, round, circuit, playerPlace, playerPoints, champion } —
// champion is the season champion's name when this round ended the
// season, otherwise null.
export function recordLeagueRace(league, circuitIndex, results, state) {
  const circuit = RACE_CIRCUITS[circuitIndex];
  if (!circuit || !Array.isArray(results) || results.length === 0) return null;
  const season = league.season;
  const round = league.round + 1;
  const seen = new Set();
  let playerPlace = 0;
  let playerPoints = 0;
  results.forEach((entry, i) => {
    const place = i + 1;
    const points = pointsForPlace(place);
    if (!seen.has(entry.name)) {
      seen.add(entry.name);
      league.points[entry.name] = (league.points[entry.name] || 0) + points;
      if (place === 1) league.wins[entry.name] = (league.wins[entry.name] || 0) + 1;
      if (typeof entry.time === 'number') {
        const best = league.best[entry.name];
        if (best === null || entry.time < best) league.best[entry.name] = entry.time;
      }
    }
    if (entry.name === LEAGUE_PLAYER_NAME) {
      playerPlace = place;
      playerPoints = points;
    }
  });
  league.totalPoints += playerPoints;
  league.races += 1;
  league.round = round;
  league.rounds.push({
    season, round, circuit: circuit.name,
    results: results.map((r) => ({ name: r.name, time: r.time ?? null })),
  });
  let champion = null;
  if (league.round >= LEAGUE_ROUNDS_PER_SEASON) {
    champion = endLeagueSeason(league, state);
  }
  return { season, round, circuit: circuit.name, playerPlace, playerPoints, champion };
}

// End the season: crown the champion, pay the purse, and start the next
// season with a clean points table. Returns the champion's name.
function endLeagueSeason(league, state) {
  const standings = leagueStandings(league);
  const champion = standings[0];
  league.champions.push({ season: league.season, champion: champion.name, points: champion.points });
  if (champion.name === LEAGUE_PLAYER_NAME) {
    league.seasonsWon += 1;
    if (state && state.player) {
      state.player.money += LEAGUE_CHAMPION_PRIZE;
      if (state.stats) state.stats.earned = (state.stats.earned || 0) + LEAGUE_CHAMPION_PRIZE;
    }
    if (state && state.missions) {
      state.missions.message = `SEASON CHAMPION! Rico wins Season ${league.season} — +$${LEAGUE_CHAMPION_PRIZE}!`;
      state.missions.messageTimer = 8;
    }
  }
  // Next season: fresh points, wins and best times, same racers.
  for (const name of leagueRacerNames()) {
    league.points[name] = 0;
    league.wins[name] = 0;
    league.best[name] = null;
  }
  league.season += 1;
  league.round = 0;
  return champion.name;
}

// Build a finishing order from a race result: the player plus the rivals
// that finished, in the order they crossed the line. Rivals that never
// finished sort after the ones that did, slowest first.
export function buildLeagueResults(race, playerTime) {
  const entries = [{ name: LEAGUE_PLAYER_NAME, time: playerTime }];
  for (const rival of race.rivals || []) {
    entries.push({ name: rival.name, time: rival.finished ? rival.finishTime : null });
  }
  // Finished cars sort by time; unfinished cars sort after them, in the
  // order they were running (checkpoint, then name).
  const finished = entries.filter((e) => e.time !== null).sort((a, b) => a.time - b.time);
  const unfinished = entries.filter((e) => e.time === null);
  return [...finished, ...unfinished];
}

// A rival's season so far: points, wins, best time, and rank.
export function rivalSeason(league, name) {
  const standings = leagueStandings(league);
  const at = standings.findIndex((row) => row.name === name);
  if (at < 0) return null;
  return { ...standings[at], rank: at + 1 };
}

// The closest title fight: the gap between first and second.
export function titleGap(league) {
  const standings = leagueStandings(league);
  if (standings.length < 2) return 0;
  return standings[0].points - standings[1].points;
}

// Is the title still mathematically open for Rico? He can still win
// while the leader's lead is no bigger than the points left on the table.
export function titleStillOpen(league) {
  const roundsLeft = LEAGUE_ROUNDS_PER_SEASON - league.round;
  const maxLeft = roundsLeft * LEAGUE_POINTS[0];
  return pointsBehindLeader(league) <= maxLeft;
}

// One line per racer for the standings screen.
export function leagueSummaryLines(league) {
  const lines = [`Season ${league.season} — Round ${league.round + 1} of ${LEAGUE_ROUNDS_PER_SEASON} next: ${nextLeagueCircuit(league).name}`];
  const standings = leagueStandings(league);
  standings.forEach((row, i) => {
    const best = row.best === null ? '—' : `${row.best.toFixed(1)}s`;
    lines.push(`${i + 1}. ${row.name} — ${row.points} pts, ${row.wins} win${row.wins === 1 ? '' : 's'}, best ${best}`);
  });
  if (league.champions.length > 0) {
    const last = league.champions[league.champions.length - 1];
    lines.push(`Last champion: Season ${last.season} — ${last.champion} (${last.points} pts)`);
  }
  return lines;
}

// One line for the HUD: Rico's place and points, and the next circuit.
export function leagueHudLine(league) {
  if (league.rounds.length === 0 && league.round === 0) {
    return `League S${league.season}: first round — ${nextLeagueCircuit(league).name}`;
  }
  return `League S${league.season}: ${playerLeagueRank(league)}${ordinalSuffix(playerLeagueRank(league))} (${playerLeaguePoints(league)} pts) — next ${nextLeagueCircuit(league).name}`;
}

function ordinalSuffix(n) {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}

// The last season's final table, or null when no season has finished yet.
export function lastSeasonTable(league) {
  if (league.champions.length === 0) return null;
  const last = league.champions[league.champions.length - 1];
  const rounds = league.rounds.filter((r) => r.season === last.season);
  return { ...last, rounds };
}

export function serializeLeague(league) {
  return {
    season: league.season,
    round: league.round,
    points: { ...league.points },
    wins: { ...league.wins },
    best: { ...league.best },
    rounds: league.rounds.map((r) => ({ ...r, results: r.results.map((x) => ({ ...x })) })),
    champions: league.champions.map((c) => ({ ...c })),
    seasonsWon: league.seasonsWon,
    totalPoints: league.totalPoints,
    races: league.races,
  };
}

export function deserializeLeague(data) {
  const l = createLeagueState();
  if (!data || typeof data !== 'object') return l;
  if (typeof data.season === 'number') l.season = Math.max(1, data.season);
  if (typeof data.round === 'number') l.round = Math.max(0, Math.min(LEAGUE_ROUNDS_PER_SEASON, data.round));
  if (data.points) Object.assign(l.points, data.points);
  if (data.wins) Object.assign(l.wins, data.wins);
  if (data.best) Object.assign(l.best, data.best);
  if (Array.isArray(data.rounds)) l.rounds = data.rounds;
  if (Array.isArray(data.champions)) l.champions = data.champions;
  if (typeof data.seasonsWon === 'number') l.seasonsWon = data.seasonsWon;
  if (typeof data.totalPoints === 'number') l.totalPoints = data.totalPoints;
  if (typeof data.races === 'number') l.races = data.races;
  return l;
}
