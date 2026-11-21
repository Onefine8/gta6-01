import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as story from '../game/src/story.js';
import { makeG, makeRng } from './helpers.mjs';

describe('briefings', () => {
  it('has a briefing for all 8 missions', () => {
    assert.equal(story.missionIds().length, 8);
    for (const id of story.missionIds()) {
      const b = story.briefing(id);
      assert.ok(b.title);
      assert.ok(b.objective);
      assert.ok(Array.isArray(b.lines) && b.lines.length > 0);
      assert.ok(typeof b.reward === 'number' && b.reward > 0);
    }
  });
  it('briefing returns null for an unknown id', () => {
    assert.equal(story.briefing('nope'), null);
    assert.deepEqual(story.briefingLines('nope'), []);
    assert.equal(story.objectiveText('nope'), '');
  });
  it('mission titles and rewards match the story', () => {
    assert.equal(story.missionTitle('first-wheels'), 'First Wheels');
    assert.equal(story.missionTitle('king-of-meridian'), 'King of Meridian');
    assert.equal(story.missionReward('king-of-meridian'), 10000);
    assert.equal(story.missionReward('nope'), 0);
  });
  it('objective text is the HUD line', () => {
    assert.match(story.objectiveText('courier-run'), /3 packages/);
    assert.match(story.objectiveText('harbor-heist'), /truck/);
  });
  it('briefing lines mention Mara, Rook and Kroll', () => {
    const all = story.missionIds().flatMap((id) => story.briefingLines(id)).join(' ');
    assert.ok(all.includes('MARA'));
    assert.ok(all.includes('ROOK'));
    assert.ok(all.includes('Kroll'));
  });
  it('rewards rise through the story', () => {
    const rewards = story.missionIds().map((id) => story.missionReward(id));
    for (let i = 1; i < rewards.length; i++) {
      assert.ok(rewards[i] >= rewards[i - 1]);
    }
  });
});

describe('intro and ending', () => {
  it('intro sets the scene in Port Meridian', () => {
    assert.ok(story.INTRO_LINES.length >= 3);
    assert.ok(story.INTRO_LINES.join(' ').includes('PORT MERIDIAN'));
    assert.ok(story.INTRO_LINES.join(' ').includes('Rook'));
  });
  it('ending names Rook king of the city', () => {
    assert.ok(story.ENDING_LINES.join(' ').includes('KING OF MERIDIAN'));
  });
});

describe('bark', () => {
  it('returns a line from the right set', () => {
    const line = story.bark('steal', makeRng(1));
    assert.ok(story.BARKS.steal.includes(line));
  });
  it('returns empty for an unknown kind', () => {
    assert.equal(story.bark('nope', makeRng(1)), '');
  });
  it('varies with the rng', () => {
    const seen = new Set();
    for (let i = 0; i < 20; i++) seen.add(story.bark('taxiDone', makeRng(i + 1)));
    assert.ok(seen.size > 1);
  });
});

describe('story init', () => {
  it('attaches briefings and accessors to G.story', () => {
    const G = makeG();
    const s = story.init(G);
    assert.equal(G.story, s);
    assert.equal(s.briefings['first-wheels'].title, 'First Wheels');
    assert.equal(typeof s.briefing, 'function');
    assert.equal(typeof s.bark, 'function');
    assert.equal(s.briefing('getaway').title, 'Getaway');
  });
  it('update is a harmless no-op', () => {
    const G = makeG();
    story.init(G);
    assert.doesNotThrow(() => story.update(G, 0.1));
  });
});
