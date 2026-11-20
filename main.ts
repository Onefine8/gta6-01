// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. The game is Palmetto Bay Heat, a 2D top-down
// open-world crime game: a 3200x2400 coastal city, stealable cars, traffic and pedestrians, a
// 5-star wanted level with chasing police, roadblocks and a helicopter, twenty story missions
// in five arcs, dockside smuggling runs with a paying streak, a car dealership with a daily
// rare car,
// five street-race circuits with four AI rivals, a business empire with passive income, taxi
// fares, hidden packages, a day/night cycle with rain, a full HUD with minimap,
// synthesized WebAudio sound, touch controls and localStorage saves — all in game/src, one job per file. Build your own open-world
// crime game in its place (three.js or any library you vendor under game/), put your 3 or 4 PNG
// or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Palmetto Bay Heat, round 7: twenty story missions in five arcs — the Bay
// Heist chain (missions 17-20) with a recruitable crew and a cased vault —
// plus a property empire with rent and renovations, a five-round racing
// league with standings and a champion's purse, NPC traffic AI with rush
// hour, jams and road rage, a day/night cycle with dynamic weather events,
// and a district heat map with cool-down spots and bribes.
const VERSION = '0.7.0-round7';
const versionStamp = `Palmetto Bay Heat ${VERSION} — 20 story missions, heist chain, properties, league, traffic AI, day/night events, heat map — built ${new Date().toISOString()}`;
console.log(versionStamp);

// Round 7 boot checks: the starter kit used to copy blindly, so a
// missing game file only surfaced as a broken dossier in the grader.
// Validate first, fail fast with a clear message, then report what is
// being handed in. The round-6 systems are required files, and so are
// the six round-7 systems — a handoff without the Bay Heist chain, the
// property empire, the racing league, traffic AI, day/night events or
// the heat map is not this game anymore.
const REQUIRED_GAME_FILES = [
  'game/index.html',
  'game/src/main.js',
  'game/src/missions4.js',
  'game/src/smuggling.js',
  'game/src/dealership.js',
  'game/src/missions5.js',
  'game/src/properties.js',
  'game/src/league.js',
  'game/src/traffic.js',
  'game/src/daynight.js',
  'game/src/heat.js',
];
for (const rel of REQUIRED_GAME_FILES) {
  if (!existsSync(join(here, rel))) {
    throw new Error(`Palmetto Bay Heat: required game file missing: ${rel} — the game cannot run without it.`);
  }
}

// The page must load the entry script it ships with: a renamed or
// unlinked main.js would leave the grader staring at a blank canvas
// while every file check above still passes.
const entryHtml = readFileSync(join(here, 'game/index.html'), 'utf8');
if (!entryHtml.includes('./src/main.js')) {
  throw new Error('Palmetto Bay Heat: game/index.html does not reference ./src/main.js — the page would open with no game.');
}

function countGameFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countGameFiles(join(dir, entry.name));
    else total += 1;
  }
  return total;
}

const gameFileCount = countGameFiles(join(here, 'game'));
console.log(`Palmetto Bay Heat: ${gameFileCount} game files, 20 story missions, heist chain, properties, league, traffic AI, day/night events, heat map — copying to ${out}.`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });

// The dossier's cover is the first screenshot by name: prove the
// screenshots folder accepts a file before the dossier is built, or the
// entry ships with a cover the grader cannot see. The probe file is
// removed again straight away — it is a check, not a screenshot.
const screenshotProbe = join(out, 'screenshots', '.write-probe');
try {
  writeFileSync(screenshotProbe, 'ok');
  rmSync(screenshotProbe);
} catch {
  throw new Error(`Palmetto Bay Heat: screenshots directory is not writable: ${join(out, 'screenshots')} — the dossier cover cannot be written.`);
}
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
