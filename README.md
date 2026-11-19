# gta6-01
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Onefine8/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Onefine8/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

## Palmetto Bay Heat

An open-world crime game in the browser. You are Rico Vega, a driver back in
Palmetto Bay — a sun-soaked coastal city of your own, with a grid of streets,
a park, a beach and a harbour. Explore on foot or steal any parked car and
drive it: traffic, pedestrians, police cruisers and a wanted level that
follows you everywhere.

- **Story missions (5):** "Wheels Up" (steal the Sunset Coupe for Marina),
  "Bayfront Dash" (three timed drops across the city), "Heat Wave" (lose
  the police, then meet Dante at the park), "Harbor Heist" (steal the
  Harbor Van, deliver it to Lighthouse Point, then vanish) and "Downtown
  Heist" (reach the Downtown bank, crack the vault by standing in the gold
  ring while the alarm climbs, grab the cash and lose the heat — $3,500,
  plus a $500 bonus for a quiet job). Each has an intro, a fail condition
  and a cash reward; a clean delivery in mission 1 pays a $100 bonus.
- **Street racing:** three circuits — Marina Loop ($100 entry), Downtown
  Dash ($200) and Beachfront Sprint ($300) — each with its own checkered
  start flag and a best time. Press R at a flag to enter: three AI rivals
  (Vex, Marisol, Turbo Tommy) line up behind you and drive the same
  checkpoints. Win the race for $800; the entry fee is lost if you quit,
  wreck or get busted.
- **Open world:** driveable stolen cars with handling, collisions and
  damage; traffic and pedestrians; 12 hidden packages to collect; a
  repeatable taxi job (pick up fares, get paid by distance); near-miss
  bonuses for flashing past traffic at speed.
- **Wanted system:** 0–5 stars. Steal a car, hit a pedestrian or punch
  someone and the PBPD sends cruisers that chase, ram and PIT you. At 3+
  stars they set roadblocks ahead of you; at 4+ a helicopter circles
  overhead and never loses sight of you. Break line of sight and the heat
  cools off — or get busted and pay bail.
- **Living city:** day/night cycle, rain that makes the roads slick, a
  minimap with the mission objective, cash, health, stamina, speed and a
  full HUD. Marina Garage repairs cars ($50), Bay General heals Rico
  ($30). Sprinting drains stamina; health creeps back out of trouble.
- **Sound:** synthesized WebAudio engine hum, sirens, a helicopter rotor,
  a bassline loop with a second phrase, horn, skid and repair sounds, and
  effects — no audio files.
- **Controls:** WASD/arrows to move and drive, E to enter/exit a car,
  Q to punch, C to honk, M for missions, R for the race, T for a taxi fare,
  G to repair/heal, H for help, mouse wheel to zoom the camera, P to
  pause, N to mute. Touch buttons appear on mobile. Progress saves to
  localStorage.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no
network: the game is plain static files under `game/`.

Screenshots are staged from the game itself with `?shot=chase|walk|mission|night`
(see `shots.json`).

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards
