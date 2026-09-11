#!/usr/bin/env bash
# preinstall guard — refuses `npm install` / `npx expo install` run inside a worktree, because it
# would silently replace the symlinked node_modules (scripts/setup-worktree.sh) with a full,
# separate copy. Wired as the `preinstall` script in package.json, so npm runs this before it
# touches node_modules at all — see #38.
set -euo pipefail

GIT_DIR="$(git rev-parse --git-dir 2>/dev/null || echo .git)"
COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || echo .git)"

# A linked worktree's git-dir (.git/worktrees/<name>) differs from the shared git-common-dir (the
# main checkout's .git). They are equal in the main checkout, and in a plain non-worktree clone —
# so this only fires inside a worktree, and fails open (no-op) if git is unavailable.
if [ "$GIT_DIR" != "$COMMON_DIR" ]; then
  cat >&2 <<'EOF'
✗ install refused: this is a worktree, and its node_modules is a symlink to the main checkout's.
  Installing here replaces that symlink with a full, separate copy — silently, and forever.

  Instead:
    1. cd into the main checkout
    2. npm install (or npx expo install <package>) there
    3. scripts/setup-worktree.sh <branch>   # re-links this worktree's node_modules
EOF
  exit 1
fi
