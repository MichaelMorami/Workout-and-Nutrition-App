#!/usr/bin/env bash
# Create an isolated worktree for an agent, sharing the main node_modules instead of reinstalling.
#   scripts/setup-worktree.sh <branch> [base]
. "$(dirname "$0")/lib.sh"

BRANCH="${1:?usage: setup-worktree.sh <branch> [base]}"
BASE="${2:-main}"
DIR="$ROOT/.worktrees/${BRANCH//\//-}"

# Share dependencies rather than reinstalling (an Expo install is heavy and identical per
# branch). Also repairs the breakage in #38: if an install ran inside the worktree despite the
# `preinstall` guard (scripts/guard-worktree-install.sh), or the worktree predates this fix,
# node_modules there is a real directory instead of the shared symlink — put the symlink back.
relink_node_modules() {
  if [ -e "$DIR/node_modules" ] && [ ! -L "$DIR/node_modules" ]; then
    warn "node_modules in $DIR is a real directory, not a symlink — repairing"
    rm -rf "$DIR/node_modules"
  fi
  if [ ! -e "$DIR/node_modules" ]; then
    if [ -d "$ROOT/node_modules" ]; then
      ln -s "$ROOT/node_modules" "$DIR/node_modules"
      ok "linked node_modules"
    else
      warn "no node_modules in the main checkout — run 'npm install' there first"
    fi
  fi
}

if [ -d "$DIR" ]; then
  say "worktree already exists"
  relink_node_modules
  echo "$DIR"; exit 0
fi

git -C "$ROOT" fetch --quiet origin "$BASE" 2>/dev/null || true
if git -C "$ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git -C "$ROOT" worktree add "$DIR" "$BRANCH" >/dev/null
else
  git -C "$ROOT" worktree add -b "$BRANCH" "$DIR" "$BASE" >/dev/null
fi
ok "worktree $BRANCH"

relink_node_modules

echo "$DIR"
