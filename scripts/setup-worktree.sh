#!/usr/bin/env bash
# Create an isolated worktree for an agent, sharing the main node_modules instead of reinstalling.
#   scripts/setup-worktree.sh <branch> [base]
. "$(dirname "$0")/lib.sh"

BRANCH="${1:?usage: setup-worktree.sh <branch> [base]}"
BASE="${2:-main}"
DIR="$ROOT/.worktrees/${BRANCH//\//-}"

if [ -d "$DIR" ]; then
  say "worktree already exists"; echo "$DIR"; exit 0
fi

git -C "$ROOT" fetch --quiet origin "$BASE" 2>/dev/null || true
if git -C "$ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git -C "$ROOT" worktree add "$DIR" "$BRANCH" >/dev/null
else
  git -C "$ROOT" worktree add -b "$BRANCH" "$DIR" "$BASE" >/dev/null
fi
ok "worktree $BRANCH"

# Share dependencies rather than reinstalling (an Expo install is heavy and identical per branch).
if [ -d "$ROOT/node_modules" ]; then
  ln -s "$ROOT/node_modules" "$DIR/node_modules"
  ok "linked node_modules"
else
  warn "no node_modules in the main checkout — run 'npm install' there first"
fi

echo "$DIR"
