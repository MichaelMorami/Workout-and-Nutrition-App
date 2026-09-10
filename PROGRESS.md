# Progress

Always current. Every merged pull request appends a line here automatically via `scripts/merge.sh`.
For the sprint-by-sprint plan see [`README.md`](README.md); for open work see the
[issues](../../issues) and milestones.

## Current sprint

**Sprint 0 — Foundation and look.** Repo scaffolding, CI, the project graph, the test harness, and
the design canvas. Ends at **Checkpoint 1**, where the client signs off the visual design before any
screen is coded.

## Checkpoints

| # | When | What the client does | State |
| --- | --- | --- | --- |
| 1 | end of Sprint 0 | Review the design canvas of all four screens | pending |
| 2 | end of Sprint 1 | Log real food for 2–3 days on their own phone | pending |
| 3 | end of Sprint 2 | Judge the charts against a year of data | pending |
| 4 | end of Sprint 3 | Log real gym sessions | pending |
| 5 | end of Sprint 4 | Verify sync and data safety across two phones | pending |
| 6 | end of Sprint 5 | Accept v1.0 as installed apps | pending |

## Merged

- 2026-09-10  chore: scaffold the Expo app, TypeScript, and lint  (PR #6 closes #1)
- 2026-09-10  chore: CI pipeline, ownership-boundary enforcement, and repo templates  (PR #7 closes #2 #5)
- 2026-09-10  fix: merge.sh no longer exits 1 after a successful merge  (PR #9 closes #8)
- 2026-09-10  chore: refresh PROGRESS.md when a PR opens, not after a merge  (PR #12 closes #11)
- 2026-09-10  test: in-memory SQLite harness, factories, seeder and domain matchers  (PR #10 closes #3)
- 2026-09-10  Design canvas: all four screens — CHECKPOINT 1  (PR #13 closes #4)
