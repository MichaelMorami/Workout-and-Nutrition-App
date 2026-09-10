# Architecture

## Shape

```
        ┌──────────────────────────────────────────┐
        │  app/**            screens (expo-router) │
        │  src/components/** UI + charts           │
        └────────────────┬─────────────────────────┘
                         │ typed query functions
        ┌────────────────▼─────────────────────────┐
        │  src/db/**   SQLite — the source of truth │
        └────────────────┬─────────────────────────┘
                         │ push / pull on updated_at
        ┌────────────────▼─────────────────────────┐
        │  src/sync/** ──► Supabase (Postgres+RLS)  │
        └──────────────────────────────────────────┘
```

**Local SQLite is the source of truth.** Supabase is a replica for backup and multi-device. Every
write lands locally and returns immediately; sync is best-effort, queued and retried. No UI path ever
waits on the network.

## Why these choices

**Expo / React Native.** One codebase for iPhone and Android, and it runs on a real phone through
Expo Go during development — no Xcode, no Apple Developer account until the standalone builds in
Sprint 5. Native SwiftUI would be marginally slicker on iPhone but is iPhone-only.

**SQLite + Drizzle.** Instant reads, fully offline, and it handles a decade of rows without effort.
Drizzle gives typed queries and versioned migrations.

**The `better-sqlite3` test path.** Drizzle's `sqlite-core` schema runs on both the `expo-sqlite`
driver (phone) and `better-sqlite3` (Node). Data-layer tests therefore run against the *same schema*
and the *same migrations* the phone runs, in milliseconds, with no simulator. This is what makes real
TDD affordable here.

**Charts must work in Expo Go**, which rules out Skia-based chart libraries — hence
`react-native-gifted-charts` over `react-native-svg`.

## Layer rules

Queries are plain functions taking a `db` handle — never a global singleton, or they stop being
testable. Chart maths lives in pure exported functions (`scale`, `domain`, `smooth`, `path`) so it
can be tested without rendering. Sync merge logic is pure: `(local, remote) => plan`.

These boundaries are enforced by `dependency-cruiser` in CI, not by convention: a forbidden import
across a layer fails the build.

## Performance

Charts read `GROUP BY local_date` over an index. Ten years is roughly 50k rows and a few megabytes —
SQLite returns this in milliseconds, so there is deliberately **no aggregate cache**. One gets added
only if a chart measurably becomes slow. A guard test keeps 400 days of seeded data under 200ms.

## The project graph

`docs/graph/` holds a generated map of every module, its exported symbols with full type signatures,
and its dependents. Agents read it instead of opening source files. CI fails if the committed copy is
stale. See `scripts/graph-gen.mjs`.
