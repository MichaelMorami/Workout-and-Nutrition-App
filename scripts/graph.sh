#!/usr/bin/env bash
# Regenerate the project graph agents read instead of opening files.
#   scripts/graph.sh           regenerate in place
#   scripts/graph.sh --check   exit non-zero if the committed copy is stale (used by CI)
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

[ -f tsconfig.json ] || { warn "no tsconfig.json yet — skipping graph"; exit 0; }
[ -d node_modules/ts-morph ] || { warn "ts-morph not installed — skipping graph"; exit 0; }

if [ "${1:-}" = "--check" ]; then
  # A check must never mutate the working tree: regenerating in place and leaving the result behind
  # turns a read-only verification into a surprise edit. Stash the committed copy, regenerate,
  # compare, then always put the committed copy back.
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  cp -R docs/graph "$tmp/committed" 2>/dev/null || mkdir -p "$tmp/committed"

  node scripts/graph-gen.mjs "$ROOT" >/dev/null
  rc=0
  diff -rq "$tmp/committed" docs/graph >/dev/null 2>&1 || rc=1

  rm -rf docs/graph
  cp -R "$tmp/committed" docs/graph
  exit "$rc"
fi

node scripts/graph-gen.mjs "$ROOT"
ok "graph regenerated — commit docs/graph/"
