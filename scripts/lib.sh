#!/usr/bin/env bash
# Shared helpers. Source this at the top of every script:  . "$(dirname "$0")/lib.sh"
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
REPO="MichaelMorami/Workout-and-Nutrition-App"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
else
  BOLD=''; RED=''; GRN=''; YLW=''; DIM=''; OFF=''
fi

say()  { printf '%s==>%s %s\n' "$BOLD" "$OFF" "$*"; }
ok()   { printf '%s  ok%s %s\n' "$GRN" "$OFF" "$*"; }
warn() { printf '%s warn%s %s\n' "$YLW" "$OFF" "$*" >&2; }
die()  { printf '%s fail%s %s\n' "$RED" "$OFF" "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }

# current issue number, inferred from the branch name  feat/12-slug -> 12
issue_from_branch() {
  git rev-parse --abbrev-ref HEAD | sed -n 's|^[a-z]*/\([0-9][0-9]*\)-.*|\1|p'
}

# The subject to title a PR with, for BRANCH relative to BASE (usually origin/main).
#
# Rule: the OLDEST commit on the branch that is neither the `docs: refresh PROGRESS.md` commit
# pr.sh may itself add, nor a `test:` commit. "Oldest", not "newest", because the first qualifying
# commit is the one the issue was actually opened for — everything after it is a fixup on top of
# that same piece of work. `test:` is excluded on top of the refresh commit because TDD is
# mandatory here (CLAUDE.md): almost every branch starts with a failing-test commit before the
# commit that actually does the work, and titling the PR after that red commit is just the
# refresh-commit bug again in a different shape (see PR #28, which had to be retitled by hand).
# A branch that is *only* `test:` commits (e.g. a pure test-harness change) still has real,
# describable work on it, so it falls back to the oldest non-refresh commit rather than losing its
# title entirely. `git log` lists newest-first, so "oldest" is the *last* surviving line.
#
# Prints nothing if every commit on the branch is a refresh commit — there is no real subject to
# title the PR with, and the caller (pr.sh) must refuse rather than fall back to it.
#
# A `git log` failure (e.g. BASE is not a valid, fetched ref) is a different problem from "no
# title" and must not be swallowed the same way: it is reported here and the function returns
# non-zero, so a caller under `set -e` (every caller, via this file) stops for that reason instead
# of continuing on to the misleading "every commit on this branch is a refresh" message.
pr_title_for_branch() {
  local base="$1" branch="$2"
  local log non_refresh non_test

  log="$(git log --pretty=%s "$base..$branch")" || {
    warn "pr_title_for_branch: 'git log $base..$branch' failed — is '$base' a valid, fetched ref?"
    return 1
  }
  [ -n "$log" ] || return 0

  # `|| true` below: under `set -o pipefail` (every caller has it, via this file), `grep -v`
  # finding nothing to keep exits 1. That is expected here — it just means "none survived this
  # filter" — and must not abort the caller before it gets to check the (legitimately empty)
  # result, the way an actual `git log` failure above still does.
  non_refresh="$(printf '%s\n' "$log" | grep -v -x -F "docs: refresh PROGRESS.md")" || true
  [ -n "$non_refresh" ] || return 0

  non_test="$(printf '%s\n' "$non_refresh" | grep -v -E '^test:')" || true
  if [ -n "$non_test" ]; then
    printf '%s\n' "$non_test" | tail -n 1
  else
    printf '%s\n' "$non_refresh" | tail -n 1
  fi
}
