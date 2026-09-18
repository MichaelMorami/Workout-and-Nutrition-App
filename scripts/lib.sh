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
# Merge commits (e.g. "Merge remote-tracking branch 'origin/main' into ...") are excluded from the
# log up front, via `--no-merges`, before any of the above filtering runs. CLAUDE.md instructs
# every agent to merge the base branch in before opening a PR, so a merge commit is present on
# almost every branch by the time pr.sh runs — it carries no description of the work and must
# never be a title candidate, at any stage of the filter. Left in, it is merely a second
# "docs: refresh PROGRESS.md" waiting to happen: harmless most of the time because a real work
# commit usually still sorts oldest, but the one branch where every real commit is `test:` (so the
# `test:` filter would otherwise leave nothing else standing) hits it and titles the PR after the
# merge instead — see issue #151 / PR #150, retitled by hand.
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
  local log non_refresh

  log="$(git log --no-merges --pretty=%s "$base..$branch")" || {
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

  # Rank the survivors by commit type — feat: > fix: > refactor:/perf: > chore:/docs:/ci: >
  # test: (anything unconventional ranks with chore:/docs:/ci:) — rather than just taking the
  # oldest regardless of type. Otherwise an early docs:/chore:/refactor: commit beats the
  # feat:/fix: commit the PR exists for (issue #168; PR #166 shipped as a "docs:" title for a
  # feature). `git log` prints newest-first; scanning in that order and overwriting the best
  # match on `<=` (not `<`) means later — i.e. older — commits at the same rank replace earlier
  # ones, so the final result is the oldest commit at the best rank found.
  local best_rank=6 best_title="" line rank
  while IFS= read -r line; do
    case "$line" in
      feat:*) rank=1 ;;
      fix:*) rank=2 ;;
      refactor:*|perf:*) rank=3 ;;
      test:*) rank=5 ;;
      *) rank=4 ;;  # chore:/docs:/ci: and anything unconventional
    esac
    if [ "$rank" -le "$best_rank" ]; then
      best_rank="$rank"
      best_title="$line"
    fi
  done <<<"$non_refresh"

  printf '%s\n' "$best_title"
}
