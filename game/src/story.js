// story.js — dialogue, briefings and ending text for Meridian Heat.
//
// All story text lives here, in English. Nothing in this module touches the
// DOM or THREE; missions.js reads the briefings through G.story at runtime
// (with short fallbacks when story has not been initialised yet), so the
// two modules never import each other. Pure data + tiny accessors: safe to
// import in Node with no browser globals at all.

export const INTRO_LINES = [
  'PORT MERIDIAN — 2:14 AM',
  'Rook, a freelance driver with a fast car and faster debts, is back in town.',
  'Mara Voss runs the jobs. Dante Kroll runs the streets.',
  'Tonight, Rook takes his first job. The city is watching.',
];

export const ENDING_LINES = [
  'Dante Kroll is finished. The tower belongs to no one now.',
  'Mara looks at the skyline and smiles for the first time in years.',
  'ROOK — KING OF MERIDIAN.',
  'Thanks for playing Meridian Heat.',
];

// One briefing per story mission. `objective` is the one-line HUD text,
// `lines` are the briefing shown on the mission card.
export const BRIEFINGS = {
  'first-wheels': {
    title: 'First Wheels',
    reward: 500,
    objective: 'Steal a car and drive it to Mara\u2019s garage',
    lines: [
      'MARA: "Rook. You need wheels before you need anything else."',
      'MARA: "Take any car on the street. Bring it to my garage in Old Town."',
      'MARA: "Don\u2019t get caught. Cops notice a stolen car."',
    ],
  },
  'courier-run': {
    title: 'Courier Run',
    reward: 800,
    objective: 'Deliver 3 packages before the timer runs out',
    lines: [
      'MARA: "Three packages, three corners of the city. No questions."',
      'MARA: "You\u2019ve got four minutes. The buyers don\u2019t wait."',
      'ROOK: "Four minutes? I\u2019ll do it in three."',
    ],
  },
  getaway: {
    title: 'Getaway',
    reward: 1000,
    objective: 'Lose a 2-star wanted level — survive 60 seconds',
    lines: [
      'MARA: "Kroll\u2019s boys tipped off the cops. You\u2019re hot, Rook."',
      'MARA: "Two stars. Stay out of sight for a minute and they\u2019ll lose you."',
      'ROOK: "A minute? I can hide for a minute."',
    ],
  },
  'rival-rumble': {
    title: 'Rival Rumble',
    reward: 1500,
    objective: 'Take down 6 Kroll gang members at the docks',
    lines: [
      'MARA: "Kroll\u2019s crew is moving product through the Harbor docks."',
      'MARA: "Hit them hard. Six of them. Make it loud — I want Kroll to hear it."',
      'ROOK: "Loud is my favourite volume."',
    ],
  },
  'midnight-race': {
    title: 'Midnight Race',
    reward: 2000,
    objective: 'Win the street race — 3 laps, 4 checkpoints',
    lines: [
      'MARA: "Midnight race, Beachfront circuit. Winner takes two grand."',
      'MARA: "Kroll entered his best driver. Beat him, and the streets talk."',
      'ROOK: "Then let\u2019s give them something to talk about."',
    ],
  },
  'the-pickup': {
    title: 'The Pickup',
    reward: 2500,
    objective: 'Drive Mara to the Harbor — survive the ambush',
    lines: [
      'MARA: "I need a ride to the Harbor. Kroll knows I\u2019m moving tonight."',
      'MARA: "If they jump us, you drive. I shoot. Don\u2019t stop for anything."',
      'ROOK: "Seatbelt on, Mara. This is going to be loud."',
    ],
  },
  'harbor-heist': {
    title: 'Harbor Heist',
    reward: 4000,
    objective: 'Steal the delivery truck, deliver it to the warehouse',
    lines: [
      'MARA: "Kroll\u2019s delivery truck is parked at the Harbor depot."',
      'MARA: "Take it. Bring it to the warehouse in the Hills. Four stars, easy."',
      'MARA: "Easy? Rook — the whole port police will be on you."',
      'ROOK: "Then they\u2019d better bring a fast car."',
    ],
  },
  'king-of-meridian': {
    title: 'King of Meridian',
    reward: 10000,
    objective: 'Win the race, escape the chase, clear the tower',
    lines: [
      'MARA: "This is it, Rook. Kroll himself, at the Meridian Tower."',
      'MARA: "Race his crew, lose the cops, then go up that tower and end it."',
      'ROOK: "One city. One king. Let\u2019s finish this."',
    ],
  },
};

// Short barks the world says back: pickups, busts, wins and losses.
export const BARKS = {
  steal: ['That\u2019s my car!', 'Hey! That\u2019s mine!', 'Somebody stop him!'],
  busted: ['On the ground! Now!', 'You\u2019re done, Rook.', 'Hands where I can see them!'],
  wasted: ['Man down!', 'Get a medic over here!', 'He\u2019s not moving.'],
  package: ['Package secured.', 'One down.', 'Delivery confirmed.'],
  taxiPickup: ['Downtown, please.', 'Harbor, and step on it!', 'Old Town, if you don\u2019t mind.'],
  taxiDone: ['Keep the change.', 'Fastest ride in town!', 'Five stars, driver.'],
};

export function briefing(id) {
  return BRIEFINGS[id] ?? null;
}

export function briefingLines(id) {
  const b = BRIEFINGS[id];
  return b ? b.lines.slice() : [];
}

export function objectiveText(id) {
  const b = BRIEFINGS[id];
  return b ? b.objective : '';
}

export function missionTitle(id) {
  const b = BRIEFINGS[id];
  return b ? b.title : id;
}

export function missionReward(id) {
  const b = BRIEFINGS[id];
  return b ? b.reward : 0;
}

export function missionIds() {
  return Object.keys(BRIEFINGS);
}

export function bark(kind, rng) {
  const list = BARKS[kind];
  if (!list || list.length === 0) return '';
  const pick = rng && typeof rng.int === 'function'
    ? rng.int(0, list.length - 1)
    : rng && typeof rng.nextInt === 'function'
      ? rng.nextInt(0, list.length)
      : Math.floor(Math.random() * list.length);
  return list[pick % list.length];
}

export function init(G) {
  G.story = {
    intro: INTRO_LINES.slice(),
    ending: ENDING_LINES.slice(),
    briefings: BRIEFINGS,
    barks: BARKS,
    briefing,
    briefingLines,
    objectiveText,
    missionTitle,
    missionReward,
    missionIds,
    bark: (kind) => bark(kind, G.rng),
  };
  return G.story;
}

export function update(G, dt) {
  // Story is data-only: no per-frame work. Kept for the uniform module
  // contract (main.js calls init/update on every module).
  void G;
  void dt;
}
