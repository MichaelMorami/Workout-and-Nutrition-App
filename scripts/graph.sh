#!/usr/bin/env bash
# Regenerate the project graph agents read instead of opening files.
#   scripts/graph.sh           regenerate in place
#   scripts/graph.sh --check   exit non-zero if the committed copy is stale (used by CI)
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

[ -f tsconfig.json ] || { warn "no tsconfig.json yet — skipping graph"; exit 0; }
[ -d node_modules/ts-morph ] || { warn "ts-morph not installed — skipping graph"; exit 0; }

if [ "${1:-}" = "--check" ]; then
  tmp="$(mktemp -d)"
  cp -R docs/graph "$tmp/before" 2>/dev/null || mkdir -p "$tmp/before"
  node scripts/graph-gen.mjs "$ROOT" >/dev/null
  if diff -rq "$tmp/before" docs/graph >/dev/null 2>&1; then
    rm -rf "$tmp"; exit 0
  fi
  rm -rf "$tmp"
  exit 1
fi

node scripts/graph-gen.mjs "$ROOT"
ok "graph regenerated — commit docs/graph/"
