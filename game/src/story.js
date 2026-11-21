// story.js — the words of Meridian Heat: mission briefings and dialogue.
// All text is original fiction (Port Meridian, Rook, Mara Voss, Dante Kroll).
// Owns G.story. Dialogue is shown through the HUD banner; missions.js asks
// for lines by mission id and stage.

export const CHARACTERS = {
  rook: { name: 'Rook', color: '#7ec8ff' },
  mara: { name: 'Mara Voss', color: '#ffb347' },
  dante: { name: 'Dante Kroll', color: '#ff6b6b' },
  dispatch: { name: 'Dispatch', color: '#9dff9d' },
  kroll: { name: 'Kroll Gunman', color: '#ff6b6b' },
};

/** Briefing text per mission id (1-8). Pure data, tested. */
export const BRIEFINGS = {
  1: {
    title: 'First Wheels',
    giver: 'mara',
    text: 'You need wheels before you can work, Rook. There is a sedan parked near the Harbor garage — take it. Any car will do, but do not get spotted lifting it. Bring it to my garage in Old Town and we will talk business.',
  },
  2: {
    title: 'Courier Run',
    giver: 'mara',
    text: 'Three packages, three drop-offs, one clock. The buyers do not wait, and neither do the Kroll boys. Hit every marker before the timer runs out and the money is yours. Drive like the city owes you.',
  },
  3: {
    title: 'Getaway',
    giver: 'mara',
    text: 'The Harbor job went loud and the precinct has your plate. Two stars, Rook. Stay out of their hands for sixty seconds — lose them in the alleys, break line of sight, do not get boxed in. Survive and the heat dies down.',
  },
  4: {
    title: 'Rival Rumble',
    giver: 'mara',
    text: 'Dante Kroll thinks the docks are his. His crew is holding Pier 9 tonight. Go down there and make it clear Port Meridian has a new driver in town. They shoot first — so shoot better.',
  },
  5: {
    title: 'Midnight Race',
    giver: 'mara',
    text: 'Street race, midnight, three laps around the Harbor loop. Kroll entered his best driver to humiliate us. Beat him through every checkpoint and take the purse. The whole city will be watching.',
  },
  6: {
    title: 'The Pickup',
    giver: 'mara',
    text: 'I need a ride to the port, and I need it quiet. Pick me up at the garage. Word is Kroll has a welcoming party waiting — if it goes loud, get me out with three stars on our tail and do not stop for anything.',
  },
  7: {
    title: 'Harbor Heist',
    giver: 'mara',
    text: 'A Kroll courier truck is sitting at the Harbor depot, full of product. Take it, drive it to the warehouse in the Hills, and do it with four stars breathing down your neck. This is the big one, Rook.',
  },
  8: {
    title: 'King of Meridian',
    giver: 'mara',
    text: 'Dante is done hiding. He wants a race, a chase, and a fight at the Meridian Tower — all in one night. Beat him on the road, lose the cops, then finish it on the tower roof. Win this, and the city is ours.',
  },
};

/** Dialogue lines per mission id, keyed by stage. Pure data, tested. */
export const DIALOGUE = {
  1: {
    start: [
      { who: 'mara', line: 'Rook. You are late, you are broke, and you are on foot. Let us fix the last one first.' },
      { who: 'rook', line: 'You always know how to make a guy feel welcome, Mara.' },
      { who: 'mara', line: 'Take the sedan by the Harbor garage. Bring it to my place in Old Town. Try not to scratch it. Actually — scratch it all you want. It is not yours yet.' },
    ],
    done: [
      { who: 'mara', line: 'Not bad. You drive like you mean it. I have work for you, if you want it.' },
    ],
  },
  2: {
    start: [
      { who: 'mara', line: 'Three drops. Clock is running. Do not stop to admire the view.' },
      { who: 'rook', line: 'Three drops, one Rook. Let us go.' },
    ],
    done: [
      { who: 'mara', line: 'All three delivered, on time. The buyers are happy. Happy buyers pay.' },
    ],
  },
  3: {
    start: [
      { who: 'dispatch', line: 'All units: suspect vehicle fleeing the Harbor district. Two stars, approach with caution.' },
      { who: 'rook', line: 'Sixty seconds. I can do sixty seconds standing on my head.' },
    ],
    done: [
      { who: 'mara', line: 'They lost you. Nice driving. The heat will forget — eventually.' },
    ],
  },
  4: {
    start: [
      { who: 'dante', line: 'Pier 9 belongs to Kroll. Walk away, driver, before this gets expensive.' },
      { who: 'rook', line: 'Funny. Mara said the same thing about your ego.' },
    ],
    done: [
      { who: 'mara', line: 'Pier 9 is quiet tonight. Kroll will remember this.' },
    ],
  },
  5: {
    start: [
      { who: 'dante', line: 'Midnight race, pretty boy. My driver eats rookies for breakfast.' },
      { who: 'rook', line: 'Then he is about to starve.' },
    ],
    done: [
      { who: 'mara', line: 'Three laps, first across the line. The city saw it, Rook. The city saw it.' },
    ],
  },
  6: {
    start: [
      { who: 'mara', line: 'Pick me up at the garage. And Rook — bring something fast. Tonight will not be quiet.' },
      { who: 'rook', line: 'When is it ever quiet with you?' },
    ],
    pickup: [
      { who: 'mara', line: 'Drive! Kroll boys on the corner — go, go, go!' },
    ],
    done: [
      { who: 'mara', line: 'We made it. You drive like a ghost, Rook. A very loud ghost.' },
    ],
  },
  7: {
    start: [
      { who: 'mara', line: 'The truck is at the Harbor depot. Take it, bring it to the Hills warehouse. Four stars will follow. Smile for the cameras.' },
      { who: 'rook', line: 'Four stars. You really know how to treat a guy.' },
    ],
    done: [
      { who: 'mara', line: 'The product is ours. Kroll just funded our whole month.' },
    ],
  },
  8: {
    start: [
      { who: 'dante', line: 'Meridian Tower. Tonight. Race me, outrun the law, and then we settle it on the roof. No more hiding, Rook.' },
      { who: 'rook', line: 'You finally grew a spine, Dante. See you at the top.' },
      { who: 'mara', line: 'Careful, Rook. This is the whole city, one night. Make it count.' },
    ],
    raceDone: [
      { who: 'dante', line: 'Lucky lap. The roof, Rook. Now!' },
    ],
    done: [
      { who: 'mara', line: 'King of Meridian. It has a nice ring to it, does it not?' },
      { who: 'rook', line: 'Port Meridian is ours now, Mara. All of it.' },
    ],
  },
};

/** Briefing for a mission id, or null. Pure. */
export function briefingFor(id) {
  return BRIEFINGS[id] ?? null;
}

/** Dialogue lines for a mission id and stage key, or []. Pure. */
export function linesFor(id, stage) {
  const m = DIALOGUE[id];
  if (!m) return [];
  return m[stage] ?? [];
}

/** One-line objective summary for the HUD tracker. Pure. */
export function objectiveSummary(id, stage) {
  const map = {
    1: ['Steal a car', 'Drive it to Mara\'s garage'],
    2: ['Deliver the packages (0/3)', 'Beat the clock'],
    3: ['Survive the police for 60 seconds', 'Do not get busted'],
    4: ['Clear Pier 9 of Kroll gunmen', 'Stay alive'],
    5: ['Win the midnight race (3 laps)', 'Hit every checkpoint'],
    6: ['Pick up Mara', 'Reach the port — escape the ambush'],
    7: ['Steal the courier truck', 'Deliver it to the Hills warehouse'],
    8: ['Beat Dante in the race', 'Lose the cops', 'Face Dante on the tower roof'],
  };
  return map[id] ?? ['Complete the mission'];
}

export function init(G) {
  G.story = {
    /** Show a line of dialogue through the HUD banner. */
    say(who, line, holdSeconds) {
      const c = CHARACTERS[who] ?? { name: who, color: '#ffffff' };
      const text = `${c.name}: ${line}`;
      try {
        G.hud?.banner?.(text, holdSeconds ?? 4);
      } catch (e) { /* best-effort */ }
      try {
        G.events?.emit?.('dialogue', { who, line });
      } catch (e) { /* best-effort */ }
    },

    /** Play a stage's lines in order, spaced out. Queued on G.story. */
    playLines(id, stage) {
      const lines = linesFor(id, stage);
      G.story._queue = lines.map((l) => ({ ...l }));
      G.story._lineTimer = 0.1;
    },

    /** The briefing object for a mission id. */
    briefing(id) {
      return briefingFor(id);
    },

    /** Objective summary lines for the HUD tracker. */
    objectives(id, stage) {
      return objectiveSummary(id, stage);
    },

    _queue: [],
    _lineTimer: 0,
  };
  return G.story;
}

export function update(G, dt) {
  const s = G.story;
  if (!s || G.state !== 'playing') return;
  if (s._queue.length > 0) {
    s._lineTimer -= dt;
    if (s._lineTimer <= 0) {
      const next = s._queue.shift();
      s.say(next.who, next.line, 4.5);
      s._lineTimer = 4.5;
    }
  }
}
