#!/usr/bin/env bash
# The gate. Every agent runs this before opening a PR. CI runs the same thing.
#   scripts/check.sh          full run
#   scripts/check.sh --fast   skip coverage and the graph freshness check
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

fail=0
step() {
  local name="$1"; shift
  say "$name"
  if "$@"; then ok "$name"; else warn "$name failed"; fail=1; fi
}

step "lint"      npx eslint . --max-warnings 0
step "typecheck" npx tsc --noEmit

if [ "$FAST" = 1 ]; then
  step "test" npx jest --silent
else
  step "test" npx jest --silent --coverage
  say "graph freshness"
  ./scripts/graph.sh --check \
    && ok "graph is current" \
    || { warn "project graph is stale — run scripts/graph.sh and commit the result"; fail=1; }
fi

if [ "$fail" = 0 ]; then
  printf '\n%s✓ all checks passed%s\n' "$GRN" "$OFF"
else
  printf '\n%s✗ checks failed — fix the above before opening a PR%s\n' "$RED" "$OFF"
  exit 1
fi
