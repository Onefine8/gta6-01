# Meridian Heat

An open-world crime game set in the fictional port city of Port Meridian.
You are Rook, a freelance driver. Your fixer is Mara Voss; your rival is
Dante Kroll and the Kroll crew. Steal cars, outrun the police, run jobs
across Downtown, Harbor, Old Town, Beachfront and the Hills — and take back
the city, one mission at a time.

## Play

Open `game/index.html` in a desktop browser (or serve `game/` with any
static server). No network request is made while the game runs; three.js is
vendored under `game/vendor/`.

- **W A S D** — move / drive, **Shift** — run, **Space** — jump
- **E** — enter / exit a car (nearby cars can be stolen)
- **Mouse** — aim, **Click** — shoot (pistol / SMG, keys **1** / **2**)
- **R** — radio, **Esc** — pause, **M** — mission list

## Features

- Procedural city: 8x8 block grid, districts, bridge, harbor, day/night cycle
- On-foot and driving, arcade car physics with drift
- Traffic AI and pedestrians that flee danger
- Wanted system (0–5 stars), police pursuit, bust and cooldown
- 8 story missions with briefings, waypoints, timers and cash rewards
- Combat: pistol and SMG, armed Kroll enemies
- Side activities: taxi fares, 3 street-race circuits, 20 hidden packages
- HUD with health, cash, wanted stars, speed, minimap and mission tracker
- Save / continue via localStorage, synthesized WebAudio sound and radio

## Screenshot presets

`game/index.html?shot=chase&seed=7` — police chase
`game/index.html?shot=walk&seed=7` — walking the city
`game/index.html?shot=mission&seed=7` — a mission in progress
`game/index.html?shot=night&seed=7` — the city at night

## Build the entry

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored make.fun library.

## Tests

```
node --test tests/
```

## License

MIT — see `LICENSE`.
