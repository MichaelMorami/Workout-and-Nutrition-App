# Vitals

A workout and nutrition tracker for iPhone and Android, built for one thing: **logging your day in
as few taps as possible**, and showing you what the data actually means.

Most tracking apps fail not because they lack features, but because logging a meal takes thirty
seconds and eleven taps. Vitals puts your own foods on the home screen, ranked by how often you eat
them and by the time of day, so logging is a single tap.

## What it does

- **Nutrition** — calories and protein, logged in one tap from your own saved foods and meals.
- **Workouts** — sets, reps and weight, with last session's numbers pre-filled. "Repeat last session"
  logs a whole workout in one tap.
- **Body** — weight and measurements, entered in one tap.
- **Charts** — weight trend, calories and protein with rolling averages, per-exercise strength
  progress, and weight trend overlaid on calorie intake — the graph that tells you whether what
  you're eating is actually working.
- **Offline first** — everything is local SQLite. Cloud sync keeps two phones in step, but the app
  never waits on the network.

## Status

In development. See [`PROGRESS.md`](PROGRESS.md) for what has shipped, and the
[project board](../../projects) for what is in flight.

| Sprint | Scope | State |
| --- | --- | --- |
| 0 | Foundation, CI, design | in progress |
| 1 | Nutrition core | planned |
| 2 | Body + charts | planned |
| 3 | Workouts | planned |
| 4 | Cloud sync | planned |
| 5 | Standalone builds + polish | planned |

## Stack

Expo (React Native) · TypeScript · expo-router · SQLite via expo-sqlite + Drizzle ORM ·
Supabase for sync · Jest + React Native Testing Library

Runs on both platforms from one codebase, and on a real phone through Expo Go during development.

## Development

```bash
npm install
scripts/demo.sh      # start Expo, scan the QR with Expo Go
scripts/check.sh     # lint + typecheck + test
```

Architecture notes are in [`docs/architecture.md`](docs/architecture.md); the data model is in
[`docs/data-model.md`](docs/data-model.md). A generated map of every module and its exports lives in
[`docs/graph/MAP.md`](docs/graph/MAP.md).

## How this repo is built

Vitals is developed by a team of specialist AI agents — a designer, a data engineer, a mobile
engineer, a data-visualisation engineer, a sync engineer, QA, DevOps and a reviewer — each with
exclusive ownership of a set of paths, working in isolated git worktrees, coordinating through
GitHub issues and pull requests, under test-driven development.

The rules they work by are in [`CLAUDE.md`](CLAUDE.md) and
[`CONTRIBUTING.md`](CONTRIBUTING.md); the role definitions are in [`.claude/agents/`](.claude/agents).

## License

GNU General Public License v3.0 — see [`LICENSE`](LICENSE).

Vitals is free software: you can redistribute it and/or modify it under the terms of the GNU General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at
your option) any later version. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
