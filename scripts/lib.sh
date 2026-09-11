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
# Rule: the OLDEST commit on the branch that is not the `docs: refresh PROGRESS.md` commit
# pr.sh may itself add. "Oldest", not "newest non-refresh", because the first commit is the one
# the issue was actually opened for — everything after it, refresh commit included, is a fixup
# on top of that same piece of work. `git log` lists newest-first, so that is the *last* line
# once refresh commits are filtered out.
#
# Prints nothing if every commit on the branch is a refresh commit — there is no real subject to
# title the PR with, and the caller (pr.sh) must refuse rather than fall back to it.
pr_title_for_branch() {
  local base="$1" branch="$2"
  # `|| true`: under `set -o pipefail` (every caller has it, via this file), `grep -v` finding
  # nothing to keep — the all-refresh case — exits 1 and would otherwise abort the caller under
  # `set -e` before it ever sees the empty string it needs to check for.
  git log --pretty=%s "$base..$branch" \
    | grep -v -x -F "docs: refresh PROGRESS.md" \
    | tail -n 1 || true
}
