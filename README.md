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

- **Story missions (3):** "Wheels Up" (steal the Sunset Coupe for Marina),
  "Bayfront Dash" (three timed drops across the city) and "Heat Wave" (lose
  the police, then meet Dante at the park). Each has an intro, a fail
  condition and a cash reward.
- **Open world:** driveable stolen cars with handling, collisions and
  damage; traffic and pedestrians; 12 hidden packages to collect; a
  timed street race (Palmetto GP) with checkpoints and a best lap.
- **Wanted system:** 0–5 stars. Steal a car, hit a pedestrian or punch
  someone and the PBPD sends cruisers that chase and ram you. Break line
  of sight and the heat cools off — or get busted and pay bail.
- **Living city:** day/night cycle, rain, a minimap with the mission
  objective, cash, health, speed and a full HUD.
- **Sound:** synthesized WebAudio engine hum, sirens, a bassline loop and
  effects — no audio files.
- **Controls:** WASD/arrows to move and drive, E to enter/exit a car,
  Q to punch, M for missions, R for the race, P to pause, N to mute.
  Touch buttons appear on mobile. Progress saves to localStorage.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no
network: the game is plain static files under `game/`.

Screenshots are staged from the game itself with `?shot=chase|walk|mission|night`
(see `shots.json`).

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards
