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
