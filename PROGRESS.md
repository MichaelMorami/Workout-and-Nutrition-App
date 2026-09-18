# Progress

Always current. Every merged pull request appends a line here automatically via `scripts/merge.sh`.
For the sprint-by-sprint plan see [`README.md`](README.md); for open work see the
[issues](../../issues) and milestones.

## Current sprint

**Sprint 2 — Body metrics and the Charts tab.** 0/0 issues closed. Ends at
**Checkpoint 3** (Judge the charts against a year of data).

## Checkpoints

| # | When | What the client does | State |
| --- | --- | --- | --- |
| 1 | end of Sprint 0 | Review the design canvas of all four screens | signed off |
| 2 | end of Sprint 1 | Log real food for 2–3 days on their own phone | signed off |
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
- 2026-09-13  feat: SearchSheet — search bar, sheet shell, recent/results rendering (issue #69)  (PR #73 closes #69)
- 2026-09-14  feat: search row tap-to-log and long-press portion sheet (#70)  (PR #74 closes #70)
- 2026-09-14  feat: create-from-search — pre-filled add-food form, save creates and logs in one action (issue #71)  (PR #75 closes #71)
- 2026-09-14  test: search-and-log tap budgets — recent, known, and brand-new via Create (issue #23)  (PR #76 closes #23)
- 2026-09-14  feat: exclude colocated test files from Metro's bundle (issue #77)  (PR #78 closes #77)
- 2026-09-15  feat: dayLog sorts newest first (issue #84)  (PR #104 closes #84)
- 2026-09-16  fix: apply the components project's 20s timeout via jest.setTimeout (issue #108)  (PR #111 closes #108)
- 2026-09-16  fix: one native Modal for search, taps land with the keyboard up, focus on show (issue #79)  (PR #105 closes #79)
- 2026-09-16  feat: exact-slider thumb dot, no-jump drag, no hard cap (issue #92)  (PR #106 closes #92)
- 2026-09-16  fix: sliderNudgeG 5 → 1, slider doc strings describe the growing range (issue #107)  (PR #112 closes #107)
- 2026-09-16  docs: Recent includes grid items; food has weight and volume bases (issues #95, #86)  (PR #113)
- 2026-09-16  feat: Servings strip — value-only steps, scrollable past 3 (issue #91)  (PR #115 closes #91)
- 2026-09-16  fix: recentFoods no longer excludes quick-add grid items (issue #95)  (PR #116)
- 2026-09-16  fix: SearchSheet reads Recent fresh, no grid exclusion (issue #95)  (PR #117)
- 2026-09-16  test: mock expo-router in tap-budget suite, preempting PR #118's useFocusEffect  (PR #119)
- 2026-09-16  chore: remove dead excludeIds param from recentFoods (issue #95)  (PR #120)
- 2026-09-16  fix: quick-add tiles re-rank when Today is returned to (issue #103)  (PR #118 closes #103)
- 2026-09-16  feat: pin a blank-query "+ Create new food" row first (issue #97)  (PR #121)
- 2026-09-16  docs: record the pinned blank-query create row in the search rules (issue #97)  (PR #122 closes #97)
- 2026-09-16  feat: foods get a weight/volume basis and nutrition per 100 g/ml  (PR #123 closes #86)
- 2026-09-17  feat: add searchFoodsOnly, a foods-only search for the meal-ingredient picker (issue #98)  (PR #126 closes #98)
- 2026-09-17  feat: the Supabase foods/food_log contract and the pure sync row mapping (issue #114)  (PR #128 closes #114)
- 2026-09-17  fix: RLS contract check folds identifier case and sees grants to public or with granted by (issues #130, #131)  (PR #134 closes #130 #131)
- 2026-09-17  fix: render food amounts through a shared g/ml formatter, not a hand-built string (issue #124)  (PR #137 closes #124)
- 2026-09-17  feat: Ionicons tab and trash glyph names, delete-pane icon size, and the tab-icons canvas (issue #80)  (PR #136 closes #80)
- 2026-09-17  fix: migration reader accepts add column, comment on, and security-neutral functions and extensions; dollar-quote tags follow the Postgres rule (issues #132, #133)  (PR #138 closes #132 #133)
- 2026-09-17  chore: add @expo/vector-icons dependency  (PR #139 closes #81)
- 2026-09-17  feat: swipe-to-delete is a square trash button, and the row hides it at rest (issue #85)  (PR #140 closes #85)
- 2026-09-17  feat: libraryByUsage query — never-blank library fallback (issue #96)  (PR #142 closes #96)
- 2026-09-17  fix: revoke grant option for is not a revoke, and column/check names fold (issue #135)  (PR #144 closes #135)
- 2026-09-18  feat: extract <SwipeToDelete> — DayLogRow becomes its first consumer (issue #141)  (PR #145 closes #141)
- 2026-09-18  fix: review-graph.sh diffs a PR without checking it out (issue #129)  (PR #149 closes #129)
- 2026-09-18  test: prove the volume-food edit-save round-trip is lossless (#125)  (PR #150 closes #125)
- 2026-09-18  docs: grant a narrow mock carve-out to the ownership rule (issue #143)  (PR #152 closes #143)
- 2026-09-18  feat: mealsContainingFood — which saved meals still log an archived food (issue #153)  (PR #156 closes #153)
- 2026-09-18  fix: revoke TRUNCATE and assert it, on every synced table (issue #147)  (PR #155 closes #147)
