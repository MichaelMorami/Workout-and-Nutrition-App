# Vitals — agent operating manual

A workout + nutrition tracker for iPhone and Android. Expo (React Native) + SQLite + Supabase.
Read this before doing anything. It is auto-loaded, so it is never repeated in prompts.

## The three product priorities, in order

1. **Slick look** — the app must feel good to open.
2. **Minimal taps** — logging a food or a set takes ~1 second. Every added tap needs justification.
3. **Efficient history** — years of data, instant graphs, nothing ever lost.

When a trade-off appears, resolve it in that order.

## Find things with the graph, not with `cat`

**Do not read whole files to find out what something is.** The repo carries a generated, always-fresh
map:

| File | Use it for |
| --- | --- |
| `docs/graph/symbols.json` | every module's exported symbols **with full type signatures**, plus its imports |
| `docs/graph/MAP.md` | readable module tree — what each module exports, who depends on it |
| `docs/graph/deps.svg` | visual dependency graph |

Look up a signature: `jq -r '.modules["src/db/queries/nutrition.ts"].exports[]' docs/graph/symbols.json`

Open a source file only to **edit** it, or when the graph shows you genuinely need the body.
Otherwise use `grep`, or `sed -n 'START,ENDp'` for a ranged read. Regenerate with `scripts/graph.sh`;
CI fails if the committed copy is stale.

## Ownership — never write outside your paths

Each agent has **exclusive write access** to its paths and read-only access to everything else. Two
agents never hold a write claim on the same file. `dependency-cruiser` enforces the import
boundaries in CI, so a violation is a build failure, not a style note.

| Agent | Writes (exclusive) |
| --- | --- |
| `tech-lead` | GitHub issues/labels/milestones/board, `PROGRESS.md`, merges, `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.gitignore`, `.claude/**` |
| `design-lead` | `design/**`, `src/theme/tokens.ts` |
| `db-engineer` | `src/db/**`, `drizzle.config.ts` |
| `ui-engineer` | `app/**` (not `app/(auth)/**`), `src/components/**` (not `charts/`), `src/hooks/**`, `src/store/**` |
| `charts-engineer` | `src/components/charts/**` |
| `sync-engineer` | `src/sync/**`, `supabase/**`, `app/(auth)/**` |
| `qa-engineer` | `jest.config.js`, `test/**`, `e2e/**` |
| `release-engineer` | `.github/**`, `scripts/**`, `app.json`, `eas.json`, `package.json` scripts |
| `code-reviewer` | nothing — reviews only |

Need a change outside your paths? Say so in the PR or issue. Do not reach across.
**Do not message other agents.** All coordination goes through `tech-lead` and the GitHub issue.

### The one carve-out: a mock for your own new export

Adding a new export routinely breaks a test file someone else owns, because that file mocks the
module and the suite throws on the missing key. Handing a one-line, functionally inert change to
another agent costs a second issue, a second PR and a block on the first — so it is allowed:

> You may add or update the mock entry for **your own new export** in another agent's test file,
> and nothing else in that file.

It stops there. Changing an assertion, a fixture, a render, or an existing mock's behaviour is not
covered — that is the owner's change, as `qa-engineer` made for `test/tap-budget.test.tsx` in
PR #142. If you cannot make the suite pass by adding your own key alone, you have outgrown the
carve-out: say so in the PR or issue and let the owner do it.

**Every crossing is disclosed in the PR body** — the file, the export, and the line added. Silence
is the violation, not the edit.

`dependency-cruiser` cannot catch any of this: it enforces *import* boundaries, not file ownership,
so an ownership crossing is green in CI. It is a **review-time check** — reviewers read the diff for
files outside the author's paths and confirm the PR body declares each one.

## Use the scripts — never retype a long command

| Script | Does |
| --- | --- |
| `scripts/check.sh` | lint + typecheck + test. **The gate. Run before every PR.** |
| `scripts/new-task.sh <area> <slug>` | issue + branch + worktree in one step |
| `scripts/setup-worktree.sh <branch>` | worktree with linked `node_modules` |
| `scripts/worktree.test.sh` | tests the worktree install guard and the `node_modules` re-link (run by `check.sh`) |
| `scripts/pr.sh <issue>` | open PR with `Closes #n`, test output, screenshots |
| `scripts/pr-title.test.sh` | tests the PR-title rule (run by `check.sh`) |
| `scripts/merge.sh <pr>` | squash-merge, delete branch, close issue, refresh `PROGRESS.md` |
| `scripts/progress.sh` | regenerate `PROGRESS.md` from GitHub milestones and merged PRs (it is derived, never hand-edited) |
| `scripts/boundaries.sh` | dependency-cruiser ownership-boundary check |
| `scripts/graph.sh` | regenerate the project graph |
| `scripts/review-graph.sh <pr>` | blast radius of a PR — changed exports + who imports them |
| `scripts/seed.sh <days>` | realistic demo data |
| `scripts/demo.sh` | start Expo, print the QR code |
| `scripts/digest.sh <milestone>` | sprint digest for the client |
| `scripts/labels.sh` · `scripts/board.sh` | idempotent GitHub setup |

If you run a command twice, it belongs in a script. Add it.

## `main` is protected — you cannot push to it

A ruleset on `main` requires a pull request and a green CI run, and blocks force-push and deletion.
There are **no bypass actors**, so this applies to every agent and to the repo owner alike: a direct
push is rejected with `GH013: Repository rule violations found`.

That is not an obstacle to route around — it is the guarantee that `main` is always releasable. Work
on a branch, open a PR, let CI go green. `PROGRESS.md` follows the same rule: it is regenerated from
GitHub by `scripts/progress.sh` and rides the next PR like any other change.

## TDD is mandatory

Per subtask, in this order:

1. **Red** — write failing tests straight from the issue's acceptance criteria. Commit `test: ...`.
2. **Green** — minimum code to pass. Commit `feat: ...`.
3. **Refactor** — clean up; `scripts/check.sh` must be green.
4. `scripts/pr.sh <issue>` — PR body carries the test output.

An issue is done when its acceptance checklist is **fully ticked** and CI is green — not when the
code exists.

Data-layer tests run in Node against real SQLite via `better-sqlite3`, using the *same* Drizzle
schema and migrations the phone runs. They are milliseconds fast — there is no excuse to skip them.

## Conventions

- **TypeScript strict.** No `any`, no non-null `!` without a comment saying why.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`).
- **Branches:** `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<issue>-<slug>`.
- **Dates:** every row stores `local_date` (`YYYY-MM-DD`, user's timezone) next to its UTC timestamp.
  A 23:30 meal must land on the correct day. Never derive a calendar day from a UTC timestamp.
- **History is immutable:** `food_log` stores `kcal`/`protein` directly. Correcting a food must never
  rewrite past logs.
- **Sync fields:** every table has `id` (uuid), `updated_at` (ms epoch), `deleted` (0/1 tombstone).
- **Units are canonical:** store weight in **kg**, lengths in **cm**, food in **grams** — always.
  Never store the number as typed plus a unit tag. And render every weight and length through a
  formatter from the first screen, even while that formatter only appends `" kg"`. This is what keeps
  lb/in a one-function change later instead of a migration over every historical row. See
  `docs/decisions.md`.
- **Styling:** only tokens from `src/theme/tokens.ts`. No hard-coded colours, spacing or font sizes.
- **The app never blocks on the network.** Local write first; sync is best-effort and retried.

## Stack (pinned majors)

Expo SDK 57 · React Native 0.86.3 · expo-router 57 · expo-sqlite 57 · Drizzle ORM 0.45 ·
@supabase/supabase-js 2 · react-native-gifted-charts + react-native-svg 15 · reanimated 4 ·
zustand 5 · jest 29 + jest-expo 57 + @testing-library/react-native 14 + better-sqlite3 13

The SDK pins the versions, not the latest release on npm: `expo install` resolves RN and jest for
you (jest 29 comes in transitively via `jest-expo`). Do not "upgrade" past the SDK.

Charts must work inside **Expo Go** — that rules out Skia-based chart libraries. Do not add a
dependency with a native module without raising it in the issue first.
