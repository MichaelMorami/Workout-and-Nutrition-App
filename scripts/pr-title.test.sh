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

say "pr-title.test.sh: $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  die "pr_title_for_branch is titling PRs after the refresh commit — see scripts/lib.sh"
fi
