import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as missions from '../game/src/missions.js';
import * as vehicles from '../game/src/vehicles.js';
import * as player from '../game/src/player.js';
import * as police from '../game/src/police.js';
import * as combat from '../game/src/combat.js';
import * as story from '../game/src/story.js';
import { makeG, wireMainEffects } from './helpers.mjs';

function bootedG() {
  const G = makeG();
  wireMainEffects(G);
  vehicles.init(G);
  player.init(G);
  police.init(G);
  combat.init(G);
  story.init(G);
  missions.init(G);
  // Minimal hud stand-in so notify() has somewhere to go.
  G.hud = { showMessage: () => {} };
  return G;
}

describe('mission id mapping', () => {
  it('maps numbers 1..8 to slugs and back', () => {
    for (let n = 1; n <= 8; n++) {
      const slug = missions.missionSlug(n);
      assert.ok(slug);
      assert.equal(missions.missionNum(slug), n);
    }
  });
  it('rejects bad ids', () => {
    assert.equal(missions.missionSlug(0), null);
    assert.equal(missions.missionSlug(9), null);
    assert.equal(missions.missionSlug('nope'), null);
    assert.equal(missions.missionNum('nope'), null);
  });
  it('missionReward prefers G.cfg.ECONOMY.MISSION_REWARDS', () => {
    const G = makeG();
    assert.equal(missions.missionReward(G, 1), 800);
    assert.equal(missions.missionReward(G, 8), 10000);
    assert.equal(missions.missionReward(G, 'king-of-meridian'), 10000);
  });
  it('missionReward falls back without cfg', () => {
    assert.equal(missions.missionReward({}, 1), 800);
    assert.equal(missions.missionReward({}, 'harbor-heist'), 5000);
  });
});

describe('landmark', () => {
  it('maps mission names to the real world landmarks', () => {
    const G = makeG();
    assert.deepEqual(
      { x: missions.landmark(G, 'garage').x, z: missions.landmark(G, 'garage').z },
      { x: -134, z: 120 },
    );
    assert.deepEqual(
      { x: missions.landmark(G, 'docks').x, z: missions.landmark(G, 'docks').z },
      { x: -60, z: 334 },
    );
    assert.deepEqual(
      { x: missions.landmark(G, 'tower').x, z: missions.landmark(G, 'tower').z },
      { x: 38, z: -120 },
    );
  });
  it('falls back when the world has no landmarks', () => {
    const G = makeG({ world: {} });
    const g = missions.landmark(G, 'garage');
    assert.equal(g.x, -134);
    assert.equal(g.label, 'Mara’s Garage');
  });
});

describe('waypointReached and advanceCheckpoint', () => {
  it('detects arrival inside the radius', () => {
    assert.equal(missions.waypointReached({ x: 0, z: 0 }, { x: 10, z: 0 }, 14), true);
    assert.equal(missions.waypointReached({ x: 0, z: 0 }, { x: 15, z: 0 }, 14), false);
    assert.equal(missions.waypointReached({ x: 0, z: 0 }, null), false);
  });
  it('advances checkpoints and laps', () => {
    const m = { data: { cp: 0, lap: 1 } };
    let r = missions.advanceCheckpoint(m, 4, 3);
    assert.deepEqual(r, { lap: 1, cp: 1, done: false });
    m.data.cp = 3;
    r = missions.advanceCheckpoint(m, 4, 3);
    assert.deepEqual(r, { lap: 2, cp: 0, done: false });
    m.data.cp = 3;
    m.data.lap = 3;
    r = missions.advanceCheckpoint(m, 4, 3);
    assert.equal(r.done, true);
  });
});

describe('startMission', () => {
  it('starts mission 1 by number and by slug', () => {
    const G = bootedG();
    const m = missions.startMission(G, 1);
    assert.ok(m);
    assert.equal(G.missions.current, 1);
    assert.equal(G.missions.active, m);
    assert.equal(m.id, 'first-wheels');
    assert.ok(m.data.waypoint);
  });
  it('refuses a second mission while one is active', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    assert.equal(missions.startMission(G, 2), null);
  });
  it('locks later missions until earlier ones are done', () => {
    const G = bootedG();
    assert.equal(missions.startMission(G, 3), null);
    assert.equal(missions.startMission(G, 2), null);
    missions.startMission(G, 1);
    missions.completeMission(G);
    assert.ok(missions.startMission(G, 2));
  });
  it('refuses an already completed mission', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    missions.completeMission(G);
    assert.equal(missions.startMission(G, 1), null);
  });
  it('refuses unknown ids', () => {
    const G = bootedG();
    assert.equal(missions.startMission(G, 99), null);
    assert.equal(missions.startMission(G, 'nope'), null);
  });
  it('emits mission-start', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    assert.ok(G.events.emitted.some((e) => e.type === 'mission-start' && e.data.id === 1));
  });
});

describe('completeMission and failMission', () => {
  it('marks done, clears current, and emits (money is added by main.js)', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    const moneyBefore = G.money;
    const reward = missions.completeMission(G);
    assert.equal(reward, 800);
    assert.ok(G.missions.done.has(1));
    assert.equal(G.missions.current, 0);
    assert.equal(G.missions.active, null);
    assert.equal(G.money, moneyBefore + 800); // wired main.js effect
    assert.ok(G.events.emitted.some((e) => e.type === 'mission-complete'));
  });
  it('completeMission with no active mission returns 0', () => {
    const G = bootedG();
    assert.equal(missions.completeMission(G), 0);
  });
  it('failMission clears the mission and emits', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    missions.failMission(G, 'test');
    assert.equal(G.missions.current, 0);
    assert.equal(G.missions.active, null);
    assert.ok(!G.missions.done.has(1));
    assert.ok(G.events.emitted.some((e) => e.type === 'mission-failed'));
  });
  it('availableMissions lists the next unlock only', () => {
    const G = bootedG();
    assert.deepEqual(missions.availableMissions(G), [1]);
    missions.startMission(G, 1);
    missions.completeMission(G);
    assert.deepEqual(missions.availableMissions(G), [2]);
  });
});

describe('currentObjective', () => {
  it('points at the next job when idle', () => {
    const G = bootedG();
    assert.match(missions.currentObjective(G), /First Wheels/);
  });
  it('shows the active mission objective', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    assert.match(missions.currentObjective(G), /Steal a car/);
  });
  it('celebrates when all 8 are done', () => {
    const G = bootedG();
    for (let n = 1; n <= 8; n++) G.missions.done.add(n);
    assert.match(missions.currentObjective(G), /King of Meridian/);
  });
});

describe('mission 1 flow', () => {
  it('stage 0 waits for a stolen car, stage 1 drives to the garage', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    // On foot: still stage 0.
    missions.update(G, 0.1);
    assert.equal(G.missions.active.stage, 0);
    // Steal a car.
    const car = G.vehicles.list[0];
    G.player.pos.x = car.pos.x + 1;
    G.player.pos.z = car.pos.z;
    player.tryEnterExitVehicle(G);
    missions.update(G, 0.1);
    assert.equal(G.missions.active.stage, 1);
    // Drive to the garage.
    const g = missions.landmark(G, 'garage');
    G.player.pos.x = g.x;
    G.player.pos.z = g.z;
    missions.update(G, 0.1);
    assert.ok(G.missions.done.has(1));
    assert.equal(G.money, 500 + 800);
  });
});

describe('mission 2 courier timer', () => {
  it('fails when the timer runs out', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    missions.completeMission(G);
    missions.startMission(G, 2);
    for (let i = 0; i < 300; i++) missions.update(G, 1);
    assert.equal(G.missions.active, null);
    assert.ok(!G.missions.done.has(2));
    assert.ok(G.events.emitted.some((e) => e.type === 'mission-failed'));
  });
  it('delivers packages by reaching waypoints', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    missions.completeMission(G);
    missions.startMission(G, 2);
    for (let k = 0; k < 3; k++) {
      const wp = G.missions.active.data.waypoint;
      G.player.pos.x = wp.x;
      G.player.pos.z = wp.z;
      missions.update(G, 0.1);
    }
    assert.ok(G.missions.done.has(2));
  });
});

describe('mission 3 getaway', () => {
  it('completes as soon as the wanted level clears', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    missions.completeMission(G);
    missions.startMission(G, 2);
    missions.completeMission(G);
    missions.startMission(G, 3);
    assert.equal(G.police.wanted, 2);
    police.clearWanted(G);
    missions.update(G, 0.1);
    assert.ok(G.missions.done.has(3));
  });
});

describe('mission 5 midnight race checkpoints', () => {
  it('runs 3 laps over 6 checkpoints', () => {
    const G = bootedG();
    for (const n of [1, 2, 3, 4]) {
      missions.startMission(G, n);
      missions.completeMission(G);
    }
    const m = missions.startMission(G, 5);
    assert.equal(m.data.cps.length, 6);
    assert.equal(m.data.laps, 3);
    for (let lap = 0; lap < 3; lap++) {
      for (let cp = 0; cp < 6; cp++) {
        const point = m.data.cps[m.data.cp];
        G.player.pos.x = point.x;
        G.player.pos.z = point.z;
        missions.update(G, 0.1);
      }
    }
    assert.ok(G.missions.done.has(5));
  });
  it('fails when the rival finishes first', () => {
    const G = bootedG();
    for (const n of [1, 2, 3, 4]) {
      missions.startMission(G, n);
      missions.completeMission(G);
    }
    missions.startMission(G, 5);
    for (let i = 0; i < 500; i++) missions.update(G, 1);
    assert.ok(!G.missions.done.has(5));
  });
});

describe('mission 8 king of meridian', () => {
  it('runs race, chase and tower stages', () => {
    const G = bootedG();
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      missions.startMission(G, n);
      missions.completeMission(G);
    }
    const m = missions.startMission(G, 8);
    assert.equal(m.stage, 0);
    // Win the race: 2 laps x 4 checkpoints.
    for (let i = 0; i < 8; i++) {
      const point = m.data.cps[m.data.cp];
      G.player.pos.x = point.x;
      G.player.pos.z = point.z;
      missions.update(G, 0.1);
    }
    assert.equal(m.stage, 1);
    assert.equal(G.police.wanted, 4);
    // Lose the cops.
    police.clearWanted(G);
    missions.update(G, 0.1);
    assert.equal(m.stage, 2);
    assert.equal(G.combat.enemies.length, 8);
    // Clear the tower and reach the marker.
    for (const e of [...G.combat.enemies]) combat.damageEnemy(G, e, 999);
    const t = missions.landmark(G, 'tower');
    G.player.pos.x = t.x;
    G.player.pos.z = t.z;
    missions.update(G, 0.1);
    assert.ok(G.missions.done.has(8));
    assert.ok(G.events.emitted.some((e) => e.type === 'game-complete'));
  });
});

describe('mission resume from save', () => {
  it('restarts the saved current mission on the first update', () => {
    const G = bootedG();
    G.missions.done.add(1);
    G.missions.current = 2; // as loadGame() would set it
    G.missions.active = null;
    missions.update(G, 0.1);
    assert.equal(G.missions.current, 2);
    assert.ok(G.missions.active);
  });
  it('does not resume a mission that is already done', () => {
    const G = bootedG();
    G.missions.done.add(1);
    G.missions.done.add(2);
    G.missions.current = 2;
    missions.update(G, 0.1);
    assert.equal(G.missions.current, 0);
    assert.equal(G.missions.active, null);
  });
});

describe('setActiveWaypoint', () => {
  it('sets the active mission waypoint (shots.js API)', () => {
    const G = bootedG();
    assert.equal(missions.setActiveWaypoint(G, 1, 2, 'Test'), false);
    missions.startMission(G, 1);
    assert.equal(missions.setActiveWaypoint(G, 5, 6, 'Garage'), true);
    assert.deepEqual(
      { x: G.missions.active.data.waypoint.x, z: G.missions.active.data.waypoint.z },
      { x: 5, z: 6 },
    );
  });
});

describe('mission update guards', () => {
  it('fails the mission when busted mid-mission', () => {
    const G = bootedG();
    missions.startMission(G, 1);
    G.state = 'busted';
    missions.update(G, 0.1);
    assert.equal(G.missions.active, null);
  });
  it('does nothing when the game is not playing and no mission runs', () => {
    const G = bootedG();
    G.state = 'menu';
    missions.update(G, 0.1);
    assert.equal(G.missions.active, null);
  });
});
