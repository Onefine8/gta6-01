// HUD: formatting and minimap projection (pure), plus the live HUD update
// against the DOM stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMoney, formatTimer, kmh, worldToMap, starsString, healthColor,
  init, update,
} from '../game/src/hud.js';
import { init as initPlayer } from '../game/src/player.js';
import { init as initPolice } from '../game/src/police.js';
import { init as initVehicles } from '../game/src/vehicles.js';
import { installThreeStub, installDomStub, makeG } from './helpers.mjs';

installThreeStub();
installDomStub();

test('hud: formatMoney adds commas and a dollar sign', () => {
  assert.equal(formatMoney(0), '$0');
  assert.equal(formatMoney(250), '$250');
  assert.equal(formatMoney(1234567), '$1,234,567');
  assert.equal(formatMoney(-5), '$0');
});

test('hud: formatTimer renders M:SS', () => {
  assert.equal(formatTimer(0), '0:00');
  assert.equal(formatTimer(65), '1:05');
  assert.equal(formatTimer(240), '4:00');
  assert.equal(formatTimer(59.2), '1:00', 'rounds up');
});

test('hud: kmh converts m/s to km/h', () => {
  assert.equal(kmh(0), 0);
  assert.equal(kmh(10), 36);
  assert.equal(kmh(42), 151);
});

test('hud: worldToMap centres the city and puts north up', () => {
  const c = worldToMap(0, 0, 180, 288);
  assert.deepEqual(c, { x: 90, y: 90 });
  const east = worldToMap(288, 0, 180, 288);
  assert.ok(east.x > 170 && east.y === 90);
  const north = worldToMap(0, -288, 180, 288);
  assert.ok(north.y < 10, 'negative z (north) maps to the top');
});

test('hud: starsString matches the police module', () => {
  assert.equal(starsString(2), '★★☆☆☆');
});

test('hud: healthColor goes green -> amber -> red', () => {
  assert.equal(healthColor(0.9), '#4fc94f');
  assert.equal(healthColor(0.4), '#ffb347');
  assert.equal(healthColor(0.1), '#ff4f4f');
});

test('hud: init binds every spec element id', () => {
  const G = makeG();
  const h = init(G);
  for (const id of ['hud', 'health-bar', 'health-num', 'money', 'stars', 'speed',
    'objective', 'message', 'radio', 'minimap', 'menu', 'pause-menu',
    'end-screen', 'mission-tracker', 'wanted-flash']) {
    assert.ok(h.els[id], `bound #${id}`);
  }
});

test('hud: update writes health, money, stars and speed', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  initPolice(G);
  const h = init(G);
  G.player.health = 40;
  G.player.money = 1234;
  G.police.setWanted(3);
  update(G, 1 / 60);
  assert.equal(h.els['health-num'].textContent, '40');
  assert.equal(h.els.money.textContent, '$1,234');
  assert.equal(h.els.stars.textContent, '★★★☆☆');
  assert.equal(h.els['health-bar'].style.width, '40%');
});

test('hud: banner shows a message and clears it after the timer', () => {
  const G = makeG();
  const h = init(G);
  h.banner('Hello Meridian', 0.1);
  assert.equal(h.els.message.textContent, 'Hello Meridian');
  assert.equal(h.els.message.classList.contains('hidden'), false);
  for (let i = 0; i < 30; i++) update(G, 1 / 60);
  assert.equal(h.els.message.textContent, '');
});

test('hud: showMessage is the alias main.js and shots.js call', () => {
  const G = makeG();
  const h = init(G);
  h.showMessage('Radio: MERIDIAN FM');
  assert.equal(h.els.message.textContent, 'Radio: MERIDIAN FM');
});

test('hud: showEnd writes the victory title without wiping buttons', () => {
  const G = makeG();
  initPlayer(G);
  const h = init(G);
  G.missions = { completed: [1, 2, 3, 4, 5, 6, 7, 8] };
  h.showEnd(true);
  const title = document.getElementById('end-title');
  assert.equal(title.textContent, 'KING OF MERIDIAN');
  assert.equal(h.els['end-screen'].classList.contains('hidden'), false);
  h.showEnd(false);
  assert.equal(h.els['end-screen'].classList.contains('hidden'), true);
});

test('hud: objective line follows the active mission', () => {
  const G = makeG();
  initPlayer(G);
  initVehicles(G);
  initPolice(G);
  const h = init(G);
  G.missions = {
    current: { name: 'Courier Run', timer: 65, timerMax: 240, objectives: ['Deliver (1/3)'] },
    nextAvailable: () => 2,
    defs: [{ id: 2, name: 'Courier Run' }],
  };
  update(G, 1 / 60);
  assert.ok(h.els.objective.textContent.includes('Courier Run'));
  assert.ok(h.els.objective.textContent.includes('1:05'), 'timer shown');
});

test('hud: update tolerates a player without a position', () => {
  const G = makeG(); // player object exists, but initPlayer never ran: no pos
  init(G);
  assert.doesNotThrow(() => update(G, 1 / 60), 'minimap must not crash on a missing pos');
});
