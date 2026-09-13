# Progress

Always current. Every merged pull request appends a line here automatically via `scripts/merge.sh`.
For the sprint-by-sprint plan see [`README.md`](README.md); for open work see the
[issues](../../issues) and milestones.

## Current sprint

**Sprint 1 — Nutrition core: the Today screen and one-tap food logging.** 21/26 issues closed. Ends at
**Checkpoint 2** (Log real food for 2–3 days on their own phone).

## Checkpoints

| # | When | What the client does | State |
| --- | --- | --- | --- |
| 1 | end of Sprint 0 | Review the design canvas of all four screens | signed off |
| 2 | end of Sprint 1 | Log real food for 2–3 days on their own phone | in progress |
| 3 | end of Sprint 2 | Judge the charts against a year of data | planned |
| 4 | end of Sprint 3 | Log real gym sessions | planned |
| 5 | end of Sprint 4 | Verify sync and data safety across two phones | planned |
| 6 | end of Sprint 5 | Accept v1.0 as installed apps | planned |

## Merged

- 2026-09-10  chore: scaffold the Expo app, TypeScript, and lint  (PR #6 closes #1)
- 2026-09-10  chore: CI pipeline, ownership-boundary enforcement, and repo templates  (PR #7 closes #2 #5)
- 2026-09-10  fix: merge.sh no longer exits 1 after a successful merge  (PR #9 closes #8)
- 2026-09-10  chore: refresh PROGRESS.md when a PR opens, not after a merge  (PR #12 closes #11)
- 2026-09-10  test: in-memory SQLite harness, factories, seeder and domain matchers  (PR #10 closes #3)
- 2026-09-10  Design canvas: all four screens — CHECKPOINT 1  (PR #13 closes #4)
- 2026-09-10  docs: record Checkpoint 1 decisions and the canonical-units invariant  (PR #15 closes #14)
- 2026-09-11  docs: record the search-and-log decisions  (PR #26 closes #25)
- 2026-09-11  fix: pr.sh titles PRs after the branch's own work, not the refresh commit  (PR #28 closes #27)
- 2026-09-11  feat: src/theme/tokens.ts — typed colour, type, space, radius, size, motion and haptics for both themes (#16)  (PR #31 closes #16)
- 2026-09-11  docs: record the Today status row decisions (#33)  (PR #34 closes #33)
- 2026-09-11  chore: add expo-crypto for SDK-57-safe UUIDs  (PR #32 closes #29)
- 2026-09-11  feat: nutrition schema, migrations and on-device migration bundle (#17)  (PR #30 closes #17)
- 2026-09-11  feat: guard worktree installs and repair the node_modules symlink (#38)  (PR #47 closes #38)
- 2026-09-12  docs: list the two self-test scripts in the CLAUDE.md scripts table  (PR #49 closes #48)
- 2026-09-12  feat: nutrition queries, usage cache, local-time and settings read — issue #35 (green)  (PR #51 closes #35)
- 2026-09-12  feat: ProgressArc — animated calorie and protein rings (#19)  (PR #50 closes #19)
- 2026-09-12  feat: weight/length formatters — kg/cm today, one seam for later (#39)  (PR #53 closes #39)
- 2026-09-12  feat: catalogue CRUD, meals, updateSettings, weightSummary — issue #36 (green)  (PR #55 closes #36)
- 2026-09-12  feat: deviceWhen — the When every write and every "today" read needs  (PR #56 closes #40)
- 2026-09-12  feat: searchFoods, recentFoods, createFoodAndLog (green) — issue #37  (PR #57 closes #37)
- 2026-09-12  feat: date header, arcs and weight chip for Today (issue #41)  (PR #58 closes #41)
- 2026-09-12  test: drop dead fixture fallback and unused unit types, cover localMinute in seed test  (PR #59 closes #45)
- 2026-09-13  feat: logTracker and undoToast store — the double-tap window and toast state (issue #21)  (PR #60 closes #21)
- 2026-09-13  test: tap-count budget for the Today screen — one-tap, double-tap and long-press (issue #23)  (PR #62)
- 2026-09-13  feat: PortionSheet initialMode/initialPortions — pre-fill an edit at its logged amount (issue #42)  (PR #61 closes #42)
- 2026-09-13  fix: mock dayLog/getMeal in tap-budget test (issue #63)  (PR #64 closes #63)
- 2026-09-13  feat: add/edit food and saved meals (issue #43)  (PR #65 closes #43)
- 2026-09-13  chore: check in .claude/settings.json — allowlist scripts/merge.sh (issue #52)  (PR #66 closes #52)
- 2026-09-13  feat: TargetsGroup — kcal/protein targets through getSettings/updateSettings (issue #44)  (PR #67 closes #44)
- 2026-09-13  feat: cut the 8 static Archivo fonts font-assets.ts requires  (PR #68 closes #54)
- 2026-09-13  docs: ruling 8 — body_metrics sync resolves on local_date (issue #46)  (PR #72 closes #46)
