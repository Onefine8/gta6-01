[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Onefine8/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Onefine8/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Meridian Heat

An open-world crime game in the fictional port city of **Port Meridian**,
built for the make.fun `gta6-01` bounty. You are **Rook**, a freelance
driver with fast hands and faster debts. **Mara Voss** runs the jobs.
**Dante Kroll** runs the streets. Take the jobs, take the city.

## Play

Open `game/index.html` in a desktop browser (or serve `game/` with any
static server). No network is needed while playing: three.js is vendored
under `game/vendor/`, all audio is synthesized with WebAudio.

- **Move:** WASD to walk, Shift to run, Space to jump
- **Drive:** walk up to any car and press **E** to get in (stealing one
  attracts the police); **W/S** throttle and brake, **A/D** steer,
  **Space** handbrake
- **Fight:** mouse click or **F** to shoot, **1/2** or **Q** to switch
  weapon, **R** to reload
- **Jobs:** **Esc** opens the menu — start story missions, drive a taxi
  (**T**), or race the three street circuits
- **Pause:** **Esc** · **Save:** from the pause menu

## The city

Port Meridian is a procedural 8×8-block port city: Downtown, Harbor, Old
Town, Beachfront and the Hills, with a pier, a bridge, neon at night and a
full day/night cycle. Traffic follows the road grid, pedestrians stroll
the sidewalks (and run when shots are fired), and the Meridian PD
escalates from one to five wanted stars.

## Story — 8 missions

1. **First Wheels** — steal a car, deliver it to Mara's garage
2. **Courier Run** — three packages, four minutes
3. **Getaway** — lose a 2-star wanted level for 60 seconds
4. **Rival Rumble** — clear the Kroll gang off the docks
5. **Midnight Race** — three laps, six checkpoints, beat Kroll's driver
6. **The Pickup** — drive Mara to the Harbor through an ambush
7. **Harbor Heist** — steal the shipment truck, lose four stars
8. **King of Meridian** — race, chase and a tower shootout

Side work pays too: taxi fares, three race circuits with best times, and
20 hidden packages scattered across the city. Progress, money, missions
and packages are saved to localStorage.

## Screenshots

`?shot=chase&seed=7` — police pursuit · `?shot=walk&seed=7` — on foot
downtown · `?shot=mission&seed=7` — mission 1 in progress ·
`?shot=night&seed=7` — the neon tower district at night.

## Develop

```sh
node --check game/src/*.js   # syntax check every module
node --test tests/           # unit + 600-tick boot test
```

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library.

## License

MIT — see `LICENSE`.
