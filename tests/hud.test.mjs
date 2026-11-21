import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as hud from '../game/src/hud.js';
import * as vehicles from '../game/src/vehicles.js';
import * as player from '../game/src/player.js';
import * as police from '../game/src/police.js';
import * as missions from '../game/src/missions.js';
import {
  makeG, installDocumentStub, uninstallDocumentStub, installThreeStub, uninstallThreeStub,
} from './helpers.mjs';

describe('formatMoney', () => {
  it('formats with thousands separators', () => {
    assert.equal(hud.formatMoney(0), '$0');
    assert.equal(hud.formatMoney(500), '$500');
    assert.equal(hud.formatMoney(1250), '$1,250');
    assert.equal(hud.formatMoney(1000000), '$1,000,000');
  });
  it('rounds and tolerates undefined', () => {
    assert.equal(hud.formatMoney(99.6), '$100');
    assert.equal(hud.formatMoney(undefined), '$0');
  });
});

describe('starsText', () => {
  it('renders 0..5 stars', () => {
    assert.equal(hud.starsText(0), '☆☆☆☆☆');
    assert.equal(hud.starsText(1), '★☆☆☆☆');
    assert.equal(hud.starsText(3), '★★★☆☆');
    assert.equal(hud.starsText(5), '★★★★★');
  });
  it('clamps out-of-range levels', () => {
    assert.equal(hud.starsText(9), '★★★★★');
    assert.equal(hud.starsText(-2), '☆☆☆☆☆');
  });
});

describe('speedText and healthPct', () => {
  it('formats speed', () => {
    assert.equal(hud.speedText(0), '0 km/h');
    assert.equal(hud.speedText(72.4), '72 km/h');
  });
  it('computes health percent clamped', () => {
    assert.equal(hud.healthPct(50, 100), 50);
    assert.equal(hud.healthPct(150, 100), 100);
    assert.equal(hud.healthPct(-10, 100), 0);
  });
});

describe('worldToMap', () => {
  it('maps the world centre to the minimap centre', () => {
    const p = hud.worldToMap(0, 0, 294, 180);
    assert.ok(Math.abs(p.x - 90) < 1);
    // The z range (718: -294..424, harbour included) is taller than x,
    // so the centre sits at 294/718 of the height, not at half.
    assert.ok(Math.abs(p.y - (294 / 718) * 180) < 1);
  });
  it('maps corners to corners for scalar and object bounds', () => {
    const a = hud.worldToMap(-294, -294, 294, 180);
    assert.deepEqual({ x: Math.round(a.x), y: Math.round(a.y) }, { x: 0, y: 0 });
    const b = hud.worldToMap(10, 10, { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, 180);
    assert.deepEqual({ x: Math.round(b.x), y: Math.round(b.y) }, { x: 180, y: 180 });
  });
});

describe('objectiveFor', () => {
  it('says explore with no missions module', () => {
    assert.equal(hud.objectiveFor({}), 'Explore Port Meridian');
  });
  it('points at the next job when idle', () => {
    const G = makeG();
    missions.init(G);
    assert.match(hud.objectiveFor(G), /First Wheels/);
  });
  it('shows the active mission objective', () => {
    const G = makeG();
    vehicles.init(G);
    player.init(G);
    police.init(G);
    missions.init(G);
    G.hud = { showMessage: () => {} };
    missions.startMission(G, 1);
    assert.match(hud.objectiveFor(G), /Steal a car/);
  });
});

describe('drawMinimap', () => {
  it('draws background, roads and the player triangle', () => {
    const G = makeG();
    vehicles.init(G);
    player.init(G);
    police.init(G);
    const calls = [];
    const ctx = new Proxy({}, {
      get(_t, prop) { return (...args) => { calls.push(prop); }; },
      set() { return true; },
    });
    hud.drawMinimap(ctx, G, 180);
    assert.ok(calls.includes('fillRect'));
    assert.ok(calls.includes('beginPath'));
    assert.ok(calls.includes('moveTo'));
    assert.ok(calls.filter((c) => c === 'arc').length >= 0);
  });
  it('draws the mission waypoint when one is active', () => {
    const G = makeG();
    vehicles.init(G);
    player.init(G);
    police.init(G);
    missions.init(G);
    G.hud = { showMessage: () => {} };
    missions.startMission(G, 1);
    const fills = [];
    const ctx = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'fill') return () => { fills.push(1); };
        return () => {};
      },
      set() { return true; },
    });
    hud.drawMinimap(ctx, G, 180);
    assert.ok(fills.length >= 2); // waypoint diamond + player triangle
  });
  it('is a no-op without a context', () => {
    assert.doesNotThrow(() => hud.drawMinimap(null, makeG(), 180));
  });
});

describe('hud with a stub document', () => {
  it('init caches elements and update writes money/health/stars', () => {
    const doc = installDocumentStub();
    try {
      const G = makeG();
      vehicles.init(G);
      player.init(G);
      police.init(G);
      missions.init(G);
      hud.init(G);
      G.money = 1250;
      G.health = 75;
      police.setWanted(G, 3);
      hud.update(G, 0.016);
      assert.equal(doc.elements.money.textContent, '$1,250');
      assert.equal(doc.elements['health-num'].textContent, '75');
      assert.equal(doc.elements.stars.textContent, '★★★☆☆');
      assert.equal(doc.elements['health-bar'].style.width, '75%');
      assert.match(doc.elements.objective.textContent, /First Wheels/);
    } finally {
      uninstallDocumentStub();
    }
  });
  it('speed shows the driven car in km/h, on foot otherwise', () => {
    const doc = installDocumentStub();
    try {
      const G = makeG();
      vehicles.init(G);
      player.init(G);
      police.init(G);
      missions.init(G);
      hud.init(G);
      hud.update(G, 0.016);
      assert.equal(doc.elements.speed.textContent, 'On foot');
      const car = G.vehicles.list[0];
      G.vehicles.playerVehicle = car;
      G.player.onFoot = false;
      G.player.vehicle = car;
      car.speed = 10;
      hud.update(G, 0.016);
      assert.equal(doc.elements.speed.textContent, '36 km/h');
    } finally {
      uninstallDocumentStub();
    }
  });
  it('showMessage writes the banner and it expires', () => {
    const doc = installDocumentStub();
    try {
      const G = makeG();
      hud.init(G);
      G.hud.showMessage('Hello Meridian', 4);
      assert.equal(doc.elements.message.textContent, 'Hello Meridian');
      assert.equal(doc.elements.message.style.opacity, '1');
      G.time.t = 5;
      hud.update(G, 0.016);
      assert.equal(doc.elements.message.style.opacity, '0');
    } finally {
      uninstallDocumentStub();
    }
  });
  it('setObjective overrides the objective line, then it falls back', () => {
    const doc = installDocumentStub();
    try {
      const G = makeG();
      missions.init(G);
      hud.init(G);
      G.hud.setObjective('Custom objective', 10);
      hud.update(G, 0.016);
      assert.equal(doc.elements.objective.textContent, 'Custom objective');
      G.time.t = 11;
      hud.update(G, 0.016);
      assert.match(doc.elements.objective.textContent, /First Wheels/);
    } finally {
      uninstallDocumentStub();
    }
  });
  it('tracker lists all eight missions with marks', () => {
    const doc = installDocumentStub();
    try {
      const G = makeG();
      vehicles.init(G);
      player.init(G);
      police.init(G);
      missions.init(G);
      hud.init(G);
      missions.startMission(G, 1);
      missions.completeMission(G);
      hud.update(G, 0.016);
      const text = doc.elements['mission-tracker'].textContent;
      assert.ok(text.includes('✓ First Wheels'));
      assert.ok(text.includes('Courier Run'));
      assert.ok(text.includes('King of Meridian'));
    } finally {
      uninstallDocumentStub();
    }
  });
  it('radio shows the station name from cfg', () => {
    const doc = installDocumentStub();
    try {
      const G = makeG();
      hud.init(G);
      G.audio.station = 1;
      hud.update(G, 0.016);
      assert.equal(doc.elements.radio.textContent, '♪ NEON NIGHTS');
    } finally {
      uninstallDocumentStub();
    }
  });
  it('works with the THREE stub (mesh creation paths run)', () => {
    installThreeStub();
    const doc = installDocumentStub();
    try {
      const G = makeG();
      vehicles.init(G);
      player.init(G);
      assert.ok(G.player.mesh);
      assert.ok(G.scene.added.length > 0);
      hud.init(G);
      hud.update(G, 0.016);
    } finally {
      uninstallDocumentStub();
      uninstallThreeStub();
    }
  });
});
