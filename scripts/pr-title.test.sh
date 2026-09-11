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

say "pr-title.test.sh: $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  die "pr_title_for_branch is titling PRs after the refresh commit — see scripts/lib.sh"
fi
