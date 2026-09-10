# Contributing

This repo is built by a team of specialist agents plus a human client. These are the working rules.
`CLAUDE.md` is the short operational version, auto-loaded by every agent; this file is the reasoning
behind it.

## Roles and ownership

Each role has **exclusive write access** to a set of paths. Nobody writes outside their paths. This
is what lets several agents work at the same time without conflicts.

| Role | Profession | Writes (exclusive) |
| --- | --- | --- |
| `tech-lead` | Engineering manager | issues, labels, milestones, board, `PROGRESS.md`, merges |
| `design-lead` | Product designer | `design/**`, `src/theme/tokens.ts` |
| `db-engineer` | Data engineer | `src/db/**`, `drizzle.config.ts` |
| `ui-engineer` | Mobile app engineer | `app/**` (not `app/(auth)/**`), `src/components/**` (not `charts/`), `src/hooks/**`, `src/store/**` |
| `charts-engineer` | Data-visualisation engineer | `src/components/charts/**` |
| `sync-engineer` | Backend / platform engineer | `src/sync/**`, `supabase/**`, `app/(auth)/**` |
| `qa-engineer` | QA / test engineer | `jest.config.js`, `test/**`, `e2e/**` |
| `release-engineer` | DevOps / release | `.github/**`, `scripts/**`, `app.json`, `eas.json`, `package.json` scripts |
| `code-reviewer` | Senior reviewer | nothing — reviews only |

Ownership is **enforced, not trusted**: `dependency-cruiser` rules in CI reject forbidden imports
across layer boundaries, so a violation fails the build.

## Coordination

- **Hub and spoke.** Agents do not talk to each other. Everything goes through `tech-lead` and the
  GitHub issue thread, so the whole record is on GitHub where the client can read it.
- **Contracts before code.** At the start of a sprint, `db-engineer` publishes the TypeScript
  signatures of the query functions in the issue. `ui-engineer` and `charts-engineer` then build
  against those signatures in parallel, mocking them until the implementation lands.
- **Isolated worktrees.** Every agent works in its own git worktree on its own branch, so two agents
  cannot touch the same working file.

## The loop, per subtask

One issue → one branch → one PR.

1. `tech-lead` opens an issue with a user story, an **acceptance-criteria checklist**, and the type
   contract.
2. `scripts/new-task.sh <area> <slug>` creates the branch and worktree.
3. **Red** — failing tests written directly from the acceptance criteria. `test: ...`
4. **Green** — the minimum code that passes. `feat: ...`
5. **Refactor** — `scripts/check.sh` green.
6. `scripts/pr.sh <issue>` — PR with `Closes #n`, test output, and screenshots for UI work.
7. CI runs · `code-reviewer` reviews · `qa-engineer` audits the tests whenever behaviour was added —
   confirming the tests actually assert the acceptance criteria rather than merely passing.
8. `tech-lead` squash-merges, deletes the branch, closes the issue, updates the board.

**Definition of done:** acceptance checklist fully ticked **and** CI green. Existing code is not
done.

## Testing

| Layer | How |
| --- | --- |
| Data | Real SQLite in Node via `better-sqlite3`, running the same Drizzle schema and migrations as the phone. Milliseconds per test. |
| Components | `@testing-library/react-native` — behaviour and accessibility, not pixels. |
| Charts | Assertions on computed scales, domains and path data. Test the maths; screenshot diffing is brittle. |
| Sync | Pure merge functions over fixtures. Every conflict case is a table-driven test. |
| Tap budget | An automated test asserting the Today screen reaches "logged" within the tap budget. Priority #2 is a test that can fail, not a hope. |
| E2E | Maestro flows (Sprint 5). |
| Client | The human, on a real phone, at every sprint checkpoint. |

## Token discipline

Reading files to find things is the biggest avoidable cost here.

- Look things up in `docs/graph/symbols.json` and `docs/graph/MAP.md`, not by reading source.
- Open a file only to edit it; otherwise `grep` or a ranged `sed -n`.
- Anything run twice becomes a script in `scripts/`.
- Repeated prompts become `.claude/commands/*.md`.

Model choice follows one rule: **quality first, cost second — trade at most ~5% of expected quality,
and only for an order-of-magnitude token saving.** In practice, because TDD makes the test suite the
quality floor, the strongest model writes the *judgment* (schema, sync logic, design language, review,
the first of each kind of screen or chart) and a cheaper one writes the *verified* (implementations
against an agreed signature and failing tests). The trade is refused outright for schema, sync,
review and design language, where a defect propagates into every later sprint.

## Client checkpoints

The client reviews and signs off at the end of every sprint, on a real build running on their own
phone. Checkpoint 1 — the visual design — happens **before any screen is coded**. Routine PRs merge
on green CI and reviewer approval; sprint boundaries are the client's gate.

## Commits and branches

- Conventional Commits: `feat:` `fix:` `test:` `chore:` `docs:` `refactor:`
- Branches: `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<issue>-<slug>`
- Squash-merge only. `main` is always releasable and always green.
