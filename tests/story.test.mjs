// Story: briefings, dialogue lines and objective summaries for all 8 missions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTERS, BRIEFINGS, DIALOGUE, briefingFor, linesFor,
  objectiveSummary, init, update,
} from '../game/src/story.js';
import { installDomStub, makeG } from './helpers.mjs';

installDomStub();

test('story: every mission has a briefing', () => {
  for (let id = 1; id <= 8; id++) {
    const b = briefingFor(id);
    assert.ok(b, `mission ${id}`);
    assert.ok(b.title.length > 0);
    assert.ok(b.text.length > 40, `briefing ${id} is substantive`);
    assert.ok(b.giver, `briefing ${id} names a giver`);
  }
  assert.equal(briefingFor(99), null);
});

test('story: briefing titles match the mission names', () => {
  assert.equal(briefingFor(1).title, 'First Wheels');
  assert.equal(briefingFor(8).title, 'King of Meridian');
});

test('story: dialogue exists for start and done of every mission', () => {
  for (let id = 1; id <= 8; id++) {
    assert.ok((DIALOGUE[id]?.start ?? []).length >= 2, `mission ${id} start lines`);
    assert.ok((DIALOGUE[id]?.done ?? []).length >= 1, `mission ${id} done lines`);
  }
  assert.equal(linesFor(1, 'start')[0].who, 'mara');
  assert.equal(linesFor(99, 'start').length, 0);
});

test('story: dialogue names only known characters', () => {
  for (const lines of Object.values(DIALOGUE)) {
    for (const stage of Object.values(lines)) {
      for (const line of stage) {
        assert.ok(CHARACTERS[line.who], `unknown character ${line.who}`);
        assert.ok(line.line.length > 0);
      }
    }
  }
});

test('story: objective summaries exist for all missions', () => {
  for (let id = 1; id <= 8; id++) {
    const lines = objectiveSummary(id, 0);
    assert.ok(lines.length >= 1, `mission ${id}`);
    assert.ok(lines[0].length > 0);
  }
  assert.deepEqual(objectiveSummary(99, 0), ['Complete the mission']);
});

test('story: playLines queues dialogue and update speaks it', () => {
  const G = makeG();
  const s = init(G);
  const said = [];
  G.hud = { banner: (text) => said.push(text) };
  s.playLines(1, 'start');
  for (let i = 0; i < 60 * 20; i++) update(G, 1 / 60);
  assert.ok(said.length >= 2, `said ${said.length} lines`);
  assert.ok(said[0].includes('Mara Voss'), 'speaker named');
});
