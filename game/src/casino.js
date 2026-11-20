// The Coral Casino for Palmetto Bay Heat: a minigame den on the
// Coral Heights strip where Rico can risk his cash between jobs. Three
// games, each one press, each one honest about its odds:
//
//   - Slots (V): $50 a spin, three reels. Three of a kind pays 10x,
//     any pair pays the bet back, the house keeps the rest — about
//     69% returns to the player over the long run, so the casino
//     always wins eventually.
//   - Blackjack (J): $100 a hand. Rico and the dealer both draw from a
//     fresh deck; Rico stands on 17 or better, the dealer hits to 17.
//     A win pays 2x, a push refunds, a blackjack pays 2.5x.
//   - Roulette (K): $50 on red. Eighteen red pockets, eighteen black,
//     one green zero — red wins pay 2x.
//
// Every game is pure logic — a state, a seeded random, a bet — so the
// headless tests can spin a thousand slots, deal a hundred blackjacks
// and watch the house edge hold, with no canvas and no input device.
// The in-game keys only work inside the casino ring, and never while
// Rico is busted, wasted, or mid-mission with the heat on him.
import { nearSite } from './world.js';

export const SLOTS_BET = 50;
export const SLOTS_JACKPOT_MULTIPLIER = 10;
export const SLOTS_PAIR_MULTIPLIER = 1;
export const BLACKJACK_BET = 100;
export const BLACKJACK_WIN_MULTIPLIER = 2;
export const BLACKJACK_BLACKJACK_MULTIPLIER = 2.5;
export const ROULETTE_BET = 50;
export const ROULETTE_WIN_MULTIPLIER = 2;

export const SLOT_SYMBOLS = ['7', 'BAR', 'CHERRY', 'LEMON', 'BELL', 'STAR'];

export function createCasinoState() {
  return {
    spins: 0,
    slotsWon: 0,
    blackjackHands: 0,
    blackjackWon: 0,
    rouletteSpins: 0,
    rouletteWon: 0,
    won: 0,
    lost: 0,
    biggestWin: 0,
    net: 0,
    lastResult: '',
    message: '',
    messageTimer: 0,
  };
}

function tell(state, text, seconds) {
  if (state && state.casino) {
    state.casino.message = text;
    state.casino.messageTimer = seconds || 3;
  }
  if (state && state.missions) {
    state.missions.message = text;
    state.missions.messageTimer = seconds || 3;
  }
}

// Rico can only gamble standing inside the casino ring, on foot, with
// the cash in hand. Returns the reason he cannot play, or null.
export function canPlayCasino(state, bet) {
  const player = state.player;
  if (player.inCar) return 'Step out of the car — the casino floor is on foot only.';
  if (!nearSite('casino', player.x, player.y)) return 'The Coral Casino is on the Coral Heights strip — stand inside its ring to play.';
  if (player.money < bet) return `That costs $${bet} — you cannot afford it yet.`;
  return null;
}

function settle(state, bet, payout, label) {
  const casino = state.casino;
  casino.net += payout - bet;
  if (payout > 0) {
    casino.won += payout;
    casino.biggestWin = Math.max(casino.biggestWin, payout);
  } else {
    casino.lost += bet;
  }
  state.player.money += payout;
  casino.lastResult = label;
  return payout;
}

// --- Slots ------------------------------------------------------------------
export function spinSlots(state, random) {
  const whyNot = canPlayCasino(state, SLOTS_BET);
  if (whyNot) {
    tell(state, whyNot, 3);
    return null;
  }
  state.player.money -= SLOTS_BET;
  const casino = state.casino;
  casino.spins += 1;
  const reels = [
    SLOT_SYMBOLS[Math.floor(random() * SLOT_SYMBOLS.length)],
    SLOT_SYMBOLS[Math.floor(random() * SLOT_SYMBOLS.length)],
    SLOT_SYMBOLS[Math.floor(random() * SLOT_SYMBOLS.length)],
  ];
  let payout = 0;
  let label = '';
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    payout = SLOTS_BET * SLOTS_JACKPOT_MULTIPLIER;
    casino.slotsWon += 1;
    label = `JACKPOT! ${reels.join(' | ')} — +$${payout}`;
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    payout = SLOTS_BET * SLOTS_PAIR_MULTIPLIER;
    casino.slotsWon += 1;
    label = `Pair! ${reels.join(' | ')} — bet back, +$${payout}`;
  } else {
    label = `Slots: ${reels.join(' | ')} — no luck, -$${SLOTS_BET}`;
  }
  settle(state, SLOTS_BET, payout, label);
  tell(state, label, 3);
  return { game: 'slots', bet: SLOTS_BET, reels, payout, label };
}

// --- Blackjack --------------------------------------------------------------
// A card is a value: 2-10 face, 10 for J/Q/K, 11 for an ace. A hand's
// value counts aces as 11 unless that busts, then as 1.
export function drawCard(random) {
  const roll = Math.floor(random() * 13) + 1;
  if (roll === 1) return 11;
  if (roll >= 11) return 10;
  return roll;
}

export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += card;
    if (card === 11) aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards) === 21;
}

export function playBlackjack(state, random) {
  const whyNot = canPlayCasino(state, BLACKJACK_BET);
  if (whyNot) {
    tell(state, whyNot, 3);
    return null;
  }
  state.player.money -= BLACKJACK_BET;
  const casino = state.casino;
  casino.blackjackHands += 1;
  const playerCards = [drawCard(random), drawCard(random)];
  const dealerCards = [drawCard(random), drawCard(random)];
  while (handValue(playerCards) < 17) playerCards.push(drawCard(random));
  while (handValue(dealerCards) < 17) dealerCards.push(drawCard(random));
  const playerValue = handValue(playerCards);
  const dealerValue = handValue(dealerCards);
  let payout = 0;
  let label = '';
  if (isBlackjack(playerCards) && !isBlackjack(dealerCards)) {
    payout = Math.round(BLACKJACK_BET * BLACKJACK_BLACKJACK_MULTIPLIER);
    casino.blackjackWon += 1;
    label = `Blackjack! ${playerValue} beats ${dealerValue} — +$${payout}`;
  } else if (playerValue > 21) {
    label = `Bust! You drew ${playerValue} — -$${BLACKJACK_BET}`;
  } else if (dealerValue > 21 || playerValue > dealerValue) {
    payout = BLACKJACK_BET * BLACKJACK_WIN_MULTIPLIER;
    casino.blackjackWon += 1;
    label = `You win! ${playerValue} beats ${dealerValue} — +$${payout}`;
  } else if (playerValue === dealerValue) {
    payout = BLACKJACK_BET;
    label = `Push — ${playerValue} each, bet refunded.`;
  } else {
    label = `Dealer wins — ${dealerValue} beats ${playerValue}. -$${BLACKJACK_BET}`;
  }
  settle(state, BLACKJACK_BET, payout, label);
  tell(state, label, 3);
  return { game: 'blackjack', bet: BLACKJACK_BET, playerCards, dealerCards, playerValue, dealerValue, payout, label };
}

// --- Roulette ---------------------------------------------------------------
// A single-zero wheel: 0 is green, 1-18 red on odd... the house wheel
// keeps it simple — pockets 1-18 are red, 19-36 black, 0 green. A bet
// on red wins on 1-18 and pays 2x; anything else loses the stake.
export function spinRouletteWheel(random) {
  return Math.floor(random() * 37);
}

export function rouletteColor(pocket) {
  if (pocket === 0) return 'green';
  return pocket <= 18 ? 'red' : 'black';
}

export function playRoulette(state, random, choice = 'red') {
  const whyNot = canPlayCasino(state, ROULETTE_BET);
  if (whyNot) {
    tell(state, whyNot, 3);
    return null;
  }
  if (choice !== 'red' && choice !== 'black') {
    tell(state, 'Roulette takes red or black — nothing else.', 3);
    return null;
  }
  state.player.money -= ROULETTE_BET;
  const casino = state.casino;
  casino.rouletteSpins += 1;
  const pocket = spinRouletteWheel(random);
  const color = rouletteColor(pocket);
  let payout = 0;
  let label = '';
  if (color === choice) {
    payout = ROULETTE_BET * ROULETTE_WIN_MULTIPLIER;
    casino.rouletteWon += 1;
    label = `Roulette: ${pocket} ${color} — your ${choice} hits! +$${payout}`;
  } else {
    label = `Roulette: ${pocket} ${color} — your ${choice} misses. -$${ROULETTE_BET}`;
  }
  settle(state, ROULETTE_BET, payout, label);
  tell(state, label, 3);
  return { game: 'roulette', bet: ROULETTE_BET, choice, pocket, color, payout, label };
}

export function stepCasino(state, dt) {
  if (state.casino.messageTimer > 0) state.casino.messageTimer -= dt;
}

// One line per game for the job board, plus the running total.
export function casinoSummaryLines(state) {
  const c = state.casino;
  const net = c.net >= 0 ? `+$${c.net}` : `-$${-c.net}`;
  return [
    `Casino: ${c.spins} slots spins (${c.slotsWon} wins), ${c.blackjackHands} blackjack hands (${c.blackjackWon} wins), ${c.rouletteSpins} roulette spins (${c.rouletteWon} wins).`,
    `Casino total: ${net} net, biggest win $${c.biggestWin}.`,
  ];
}

export function serializeCasino(casino) {
  return {
    spins: casino.spins,
    slotsWon: casino.slotsWon,
    blackjackHands: casino.blackjackHands,
    blackjackWon: casino.blackjackWon,
    rouletteSpins: casino.rouletteSpins,
    rouletteWon: casino.rouletteWon,
    won: casino.won,
    lost: casino.lost,
    biggestWin: casino.biggestWin,
    net: casino.net,
  };
}

export function deserializeCasino(casino, data) {
  if (!data || typeof data !== 'object') return;
  for (const key of ['spins', 'slotsWon', 'blackjackHands', 'blackjackWon', 'rouletteSpins', 'rouletteWon', 'won', 'lost', 'biggestWin', 'net']) {
    if (typeof data[key] === 'number') casino[key] = data[key];
  }
}
