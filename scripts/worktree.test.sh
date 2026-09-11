#!/usr/bin/env bash
# Self-contained test for the worktree node_modules protections (#38):
#   - guard-worktree-install.sh refuses npm/expo install run inside a worktree
#   - setup-worktree.sh repairs a worktree whose node_modules became a real directory
#
# Not a jest test, same reasoning as pr-title.test.sh: this is scripts/**-owned behaviour, not
# app code. Builds a throwaway git repo with a real linked worktree — no actual npm install (see
# CLAUDE.md: heavy, and neither behaviour needs one; verified separately against a temp dir).
#   scripts/worktree.test.sh
set -euo pipefail

. "$(dirname "$0")/lib.sh"
GUARD="$ROOT/scripts/guard-worktree-install.sh"
SETUP="$ROOT/scripts/setup-worktree.sh"

pass=0
fail=0
assert() {
  local desc="$1" want="$2" got="$3"
  if [ "$want" = "$got" ]; then
    ok "$desc"; pass=$((pass + 1))
  else
    warn "$desc"
    printf '     expected: %s\n     actual:   %s\n' "$want" "$got"
    fail=$((fail + 1))
  fi
}

WORK="$(mktemp -d)"
WORK="$(cd "$WORK" && pwd -P)"  # resolve symlinks (e.g. macOS /tmp) so path comparisons match
trap 'rm -rf "$WORK"' EXIT

git init --quiet -b main "$WORK/main"
git -C "$WORK/main" config user.email "test@example.com"
git -C "$WORK/main" config user.name "Test"
git -C "$WORK/main" commit --quiet --allow-empty -m "chore: repo init"
mkdir -p "$WORK/main/node_modules"
touch "$WORK/main/node_modules/.placeholder"

# --- guard-worktree-install.sh: refuses installs inside a worktree, allows them in main --------
git -C "$WORK/main" worktree add --quiet -b feat/1-x "$WORK/main/.worktrees/feat-1-x" main
ln -s "$WORK/main/node_modules" "$WORK/main/.worktrees/feat-1-x/node_modules"

status=0; (cd "$WORK/main" && "$GUARD") >/dev/null 2>&1 || status=$?
assert "guard passes in the main checkout" "0" "$status"

status=0; (cd "$WORK/main/.worktrees/feat-1-x" && "$GUARD") >/dev/null 2>&1 || status=$?
assert "guard refuses inside a linked worktree" "1" "$status"

# --- setup-worktree.sh: repairs a worktree whose node_modules became a real directory -----------
# Simulate the exact breakage from #38 (npm/expo install ran despite the guard, or the worktree
# predates this fix): node_modules is a real, separate directory instead of the shared symlink.
rm -rf "$WORK/main/.worktrees/feat-1-x/node_modules"
mkdir "$WORK/main/.worktrees/feat-1-x/node_modules"

(cd "$WORK/main" && "$SETUP" feat/1-x main >/dev/null)

if [ -L "$WORK/main/.worktrees/feat-1-x/node_modules" ]; then
  got="$(readlink "$WORK/main/.worktrees/feat-1-x/node_modules")"
else
  got="not-a-symlink"
fi
assert "setup-worktree.sh repairs a real directory back to a symlink" "$WORK/main/node_modules" "$got"

say "worktree.test.sh: $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  die "worktree node_modules protection regressed — see scripts/guard-worktree-install.sh / scripts/setup-worktree.sh"
fi
