// Save: localStorage round-trip through the real save module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { init, update } from '../game/src/save.js';
import { CONFIG } from '../game/src/config.js';
import { installDomStub, makeG } from './helpers.mjs';

installDomStub();

test('save: save() then load() restores money, health and progress', () => {
  const G = makeG();
  G.player.money = 4321;
  G.player.health = 55;
  G.player.x = 100;
  G.player.z = -80;
  G.player.heading = 1.2;
  G.missions = { completed: [1, 2], currentIndex: 2 };
  G.activities = { packagesFound: 7, racesWon: 1, taxiDone: 3 };
  G.time.dayTime = 15.5;
  const save = init(G);
  assert.equal(save.save(), true);
  // Wipe the in-memory state and load it back.
  G.player.money = 0;
  G.player.health = 100;
  G.missions.completed = [];
  G.activities.packagesFound = 0;
  const data = save.load();
  assert.ok(data);
  assert.equal(G.player.money, 4321);
  assert.equal(G.player.health, 55);
  assert.equal(G.player.x, 100);
  assert.equal(G.player.z, -80);
  assert.equal(G.player.heading, 1.2);
  assert.deepEqual(G.missions.completed, [1, 2]);
  assert.equal(G.missions.currentIndex, 2);
  assert.equal(G.activities.packagesFound, 7);
  assert.equal(G.activities.racesWon, 1);
  assert.equal(G.activities.taxiDone, 3);
  assert.equal(G.time.dayTime, 15.5);
});

test('save: hasSave is false on a fresh profile, true after saving', () => {
  const G = makeG();
  window.localStorage.removeItem(CONFIG.SAVE_KEY);
  const save = init(G);
  assert.equal(save.hasSave(), false);
  save.save();
  assert.equal(save.hasSave(), true);
  save.clear();
  assert.equal(save.hasSave(), false);
});

test('save: corrupt JSON loads as no save, never throws', () => {
  window.localStorage.setItem(CONFIG.SAVE_KEY, '{not json');
  const G = makeG();
  const save = init(G);
  assert.equal(save.load(), null);
  assert.equal(save.hasSave(), false);
  window.localStorage.removeItem(CONFIG.SAVE_KEY);
});

test('save: update autosaves once a minute while playing', () => {
  const G = makeG();
  window.localStorage.removeItem(CONFIG.SAVE_KEY);
  const save = init(G);
  G.player.money = 999;
  for (let i = 0; i < 61; i++) update(G, 1);
  assert.equal(save.hasSave(), true);
  const data = save.load();
  assert.equal(data.money, 999);
  window.localStorage.removeItem(CONFIG.SAVE_KEY);
});

test('save: update does not autosave in the menu', () => {
  const G = makeG();
  window.localStorage.removeItem(CONFIG.SAVE_KEY);
  init(G);
  G.state = 'menu';
  for (let i = 0; i < 61; i++) update(G, 1);
  assert.equal(window.localStorage.getItem(CONFIG.SAVE_KEY), null);
});
