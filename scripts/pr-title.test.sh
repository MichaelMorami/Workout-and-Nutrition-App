#!/usr/bin/env bash
# Self-contained test for the PR-title rule in `pr_title_for_branch()` (scripts/lib.sh).
#
# Not a jest test: jest's `testMatch` only looks at `test/**` and `src/**`, which are
# qa-engineer's and other agents' paths, and this behaviour belongs to a `scripts/**` script this
# agent owns. Instead this builds a throwaway git repo in a temp dir, exercises the function
# directly (no GitHub, no network) and asserts on its output. Run it directly, or via
# `scripts/check.sh` / CI, which both call it as a step.
#
#   scripts/pr-title.test.sh
set -euo pipefail

. "$(dirname "$0")/lib.sh"

pass=0
fail=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    ok "$desc"
    pass=$((pass + 1))
  else
    warn "$desc"
    printf '     expected: %s\n     actual:   %s\n' "$expected" "$actual"
    fail=$((fail + 1))
  fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

repo() {
  # Build a fresh throwaway repo at $WORK/repo with a `main` at one commit, every time, so each
  # scenario below starts from the same clean state.
  rm -rf "$WORK/repo"
  git init --quiet -b main "$WORK/repo"
  git -C "$WORK/repo" config user.email "test@example.com"
  git -C "$WORK/repo" config user.name "Test"
  git -C "$WORK/repo" commit --quiet --allow-empty -m "chore: repo init"
  # `pr_title_for_branch` reads `origin/main`, not `main` — mimic that without a real remote.
  git -C "$WORK/repo" update-ref refs/remotes/origin/main refs/heads/main
}

commit() {
  git -C "$WORK/repo" commit --quiet --allow-empty -m "$1"
}

# Scenario 1: a normal branch — one feature commit, then the refresh commit `pr.sh` adds. The
# title must be the feature commit's subject, never the refresh commit's.
repo
git -C "$WORK/repo" checkout --quiet -b fix/25-search-and-log
commit "docs: record the search-and-log decisions"
commit "docs: refresh PROGRESS.md"
assert_eq \
  "title skips the trailing refresh commit" \
  "docs: record the search-and-log decisions" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main fix/25-search-and-log)"

# Scenario 2: no refresh commit at all — title is still the branch's own (only) commit.
repo
git -C "$WORK/repo" checkout --quiet -b feat/30-widget
commit "feat: add the widget"
assert_eq \
  "title is unchanged when there is no refresh commit" \
  "feat: add the widget" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main feat/30-widget)"

# Scenario 3: several real commits plus a refresh commit — title is the oldest real commit (the
# one the issue was opened for), not the newest.
repo
git -C "$WORK/repo" checkout --quiet -b feat/31-widget
commit "feat: add the widget"
commit "fix: widget edge case"
commit "docs: refresh PROGRESS.md"
assert_eq \
  "title is the oldest non-refresh commit, not the newest" \
  "feat: add the widget" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main feat/31-widget)"

# Scenario 4: the only commit on the branch is a refresh commit — there is no real work to title
# the PR with, so the function must say so by returning empty, and `pr.sh` must refuse rather than
# open a PR titled "docs: refresh PROGRESS.md".
repo
git -C "$WORK/repo" checkout --quiet -b chore/32-refresh-only
commit "docs: refresh PROGRESS.md"
assert_eq \
  "an all-refresh branch yields no title (caller must refuse)" \
  "" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main chore/32-refresh-only)"

# Scenario 5: TDD's own shape — a red `test:` commit, then the `feat:` commit that makes it pass,
# then the refresh commit. TDD is mandatory here (CLAUDE.md), so this is the *common* case, not an
# edge case: the title must be the `feat:` commit, never the red commit that came before it.
repo
git -C "$WORK/repo" checkout --quiet -b feat/33-widget
commit "test: red for the widget"
commit "feat: add the widget"
commit "docs: refresh PROGRESS.md"
assert_eq \
  "title skips a leading test: commit in favour of the feat: commit" \
  "feat: add the widget" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main feat/33-widget)"

# Scenario 6: a test-only branch (e.g. a pure test-harness change) — no commit survives the
# `test:` filter, so the rule falls back to the oldest non-refresh commit rather than printing
# nothing for a branch that plainly does have real, describable work on it.
repo
git -C "$WORK/repo" checkout --quiet -b test/34-harness
commit "test: first pass at the harness"
commit "test: second pass at the harness"
commit "docs: refresh PROGRESS.md"
assert_eq \
  "a test-only branch falls back to its oldest test: commit" \
  "test: first pass at the harness" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main test/34-harness)"

# Scenario 7: BASE does not exist locally (e.g. `origin/main` was never fetched). This must fail
# loudly and distinctly — not be swallowed into the same empty output as "only a refresh commit",
# which would send the caller into a misleading die() about a refresh-only branch.
repo
status=0
if (cd "$WORK/repo" && pr_title_for_branch origin/does-not-exist main >/dev/null 2>&1); then
  status=0
else
  status=$?
fi
if [ "$status" -ne 0 ]; then
  ok "a missing base ref fails distinctly, not as an empty title"
  pass=$((pass + 1))
else
  warn "a missing base ref fails distinctly, not as an empty title"
  printf '     expected: non-zero exit\n     actual:   0 (git log failure was swallowed)\n'
  fail=$((fail + 1))
fi

# Scenario 8: the branch merged the base in before the PR was opened (CLAUDE.md's own documented
# workflow: "Before opening a PR, merge the base branch in"). The merge commit sorts ahead of the
# real work commit and must not win the title — see issue #151 / PR #150, which had to be
# retitled by hand.
repo
git -C "$WORK/repo" checkout --quiet -b fix/40-example
commit "feat: add the thing"
git -C "$WORK/repo" checkout --quiet main
commit "chore: unrelated main work"
git -C "$WORK/repo" update-ref refs/remotes/origin/main refs/heads/main
git -C "$WORK/repo" checkout --quiet fix/40-example
git -C "$WORK/repo" -c user.email=test@example.com -c user.name=Test \
  merge --quiet --no-edit origin/main
commit "docs: refresh PROGRESS.md"
assert_eq \
  "a branch that merged base in first titles from its own commit, not the merge" \
  "feat: add the thing" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main fix/40-example)"

# Scenario 9: the worst case from #151 — a test-only branch (every real commit is `test:`, so the
# `test:` filter would otherwise leave nothing but the merge commit standing) that also merged
# base in first. The fallback must land on the branch's own oldest `test:` commit, never the merge
# commit.
repo
git -C "$WORK/repo" checkout --quiet -b test/41-harness
commit "test: first pass at the harness"
git -C "$WORK/repo" checkout --quiet main
commit "chore: unrelated main work"
git -C "$WORK/repo" update-ref refs/remotes/origin/main refs/heads/main
git -C "$WORK/repo" checkout --quiet test/41-harness
git -C "$WORK/repo" -c user.email=test@example.com -c user.name=Test \
  merge --quiet --no-edit origin/main
commit "docs: refresh PROGRESS.md"
assert_eq \
  "a test-only branch that merged base in first still falls back to its own test: commit" \
  "test: first pass at the harness" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main test/41-harness)"

# Scenario 10: ranking (issue #168) — a `docs:` commit lands before the `feat:` commit that the
# PR actually exists for (plus a leading `test:` commit, TDD's own shape). `pr_title_for_branch`
# used to take the *oldest* survivor with no regard for type, so `docs:` won and shipped as the
# changelog entry for a feature PR (PR #166 on issue #101). It must rank by type instead:
# feat: > fix: > refactor:/perf: > chore:/docs:/ci: > test:.
repo
git -C "$WORK/repo" checkout --quiet -b feat/50-widget
commit "test: red for the widget"
commit "docs: evidence for the widget"
commit "feat: add the widget"
assert_eq \
  "a docs: commit before the feat: commit does not win the title" \
  "feat: add the widget" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main feat/50-widget)"

# Scenario 11: same as above, reversed order — feat: lands before docs:. Ranking must not depend
# on commit order, only on type (with oldest-within-rank as the tiebreak).
repo
git -C "$WORK/repo" checkout --quiet -b feat/51-widget
commit "test: red for the widget"
commit "feat: add the widget"
commit "docs: evidence for the widget"
assert_eq \
  "a docs: commit after the feat: commit still does not win the title" \
  "feat: add the widget" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main feat/51-widget)"

# Scenario 12: full ranking order in one branch — fix: must beat refactor:, which must beat
# chore:, which must beat test:, and feat: must beat all of them regardless of commit order.
repo
git -C "$WORK/repo" checkout --quiet -b feat/52-widget
commit "test: harness for the widget"
commit "chore: tidy up widget config"
commit "refactor: simplify widget internals"
commit "fix: widget edge case"
commit "feat: add the widget"
assert_eq \
  "feat: outranks fix:, refactor:, chore: and test: regardless of order" \
  "feat: add the widget" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main feat/52-widget)"

# Scenario 13: with no feat: commit present, fix: outranks refactor:/perf:/chore:/docs:/ci:/test:.
repo
git -C "$WORK/repo" checkout --quiet -b fix/53-widget
commit "test: harness for the widget"
commit "chore: tidy up widget config"
commit "refactor: simplify widget internals"
commit "fix: widget edge case"
assert_eq \
  "fix: outranks refactor:, chore: and test: when there is no feat:" \
  "fix: widget edge case" \
  "$(cd "$WORK/repo" && pr_title_for_branch origin/main fix/53-widget)"

say "pr-title.test.sh: $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  die "pr_title_for_branch is titling PRs after the refresh commit — see scripts/lib.sh"
fi
