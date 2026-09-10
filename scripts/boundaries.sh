#!/usr/bin/env bash
# Enforce the ownership boundaries from CONTRIBUTING.md via dependency-cruiser.
#   scripts/boundaries.sh
# `src/` does not exist until Sprint 1 — only pass directories that are actually there so a
# fresh checkout doesn't fail on a missing path.
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

dirs=(app)
[ -d src ] && dirs+=(src)

npx depcruise "${dirs[@]}" --config .dependency-cruiser.cjs --output-type err
