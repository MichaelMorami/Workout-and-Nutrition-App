#!/usr/bin/env bash
# Self-contained test for scripts/review-graph.sh's PR mode (#129):
#   - succeeds for a PR whose branch is already checked out in a worktree elsewhere
#   - succeeds for a PR branch not present locally at all (mirrors a merged PR whose branch was
#     deleted, or a fork branch that was never fetched)
#   - fails loudly with an actionable message when the PR genuinely cannot be resolved
#   - never mutates the caller's checkout: HEAD and the current branch are unchanged, and no
#     detached HEAD or leftover private ref is left behind
#
# Same reasoning as scripts/worktree.test.sh: this is scripts/**-owned behaviour, not app code, so
# it is not a jest test. Builds a throwaway "origin" repo plus a clone (no real network, no real
# GitHub) and stubs `gh` on PATH with canned answers — `review-graph.sh`'s PR mode only ever calls
# `gh pr view` for the base branch name; everything else is plain git plumbing against the fake
# origin's file:// remote.
#   scripts/review-graph.test.sh
set -euo pipefail

. "$(dirname "$0")/lib.sh"
SCRIPT="$ROOT/scripts/review-graph.sh"

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
assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if printf '%s' "$haystack" | grep -qF "$needle"; then
    ok "$desc"; pass=$((pass + 1))
  else
    warn "$desc"
    printf '     expected to contain: %s\n     actual:              %s\n' "$needle" "$haystack"
    fail=$((fail + 1))
  fi
}

WORK="$(mktemp -d)"
WORK="$(cd "$WORK" && pwd -P)"  # resolve symlinks (e.g. macOS /tmp) so path comparisons match
trap 'rm -rf "$WORK"' EXIT

# --- fake `gh`: no network, canned answers only ---------------------------------------------
mkdir -p "$WORK/bin"
cat >"$WORK/bin/gh" <<'FAKE_GH'
#!/usr/bin/env bash
set -euo pipefail
if [ "$1 $2" = "pr view" ]; then
  pr="$3"
  if [ "$pr" = "999" ]; then
    echo "gh: no pull request found for #999" >&2
    exit 1
  fi
  echo '{"baseRefName":"main"}'
  exit 0
fi
echo "review-graph.test.sh: unstubbed gh invocation: $*" >&2
exit 1
FAKE_GH
chmod +x "$WORK/bin/gh"
export PATH="$WORK/bin:$PATH"

# --- fake origin: main + two PR branches, with the refs/pull/<N>/head GitHub itself serves ------
git init --quiet -b main "$WORK/origin"
git -C "$WORK/origin" config user.email "test@example.com"
git -C "$WORK/origin" config user.name "Test"
mkdir -p "$WORK/origin/src"
echo "export const a = 1;" >"$WORK/origin/src/foo.ts"
git -C "$WORK/origin" add src/foo.ts
git -C "$WORK/origin" commit --quiet -m "chore: repo init"

git -C "$WORK/origin" checkout --quiet -b pr-7
echo "export const a = 2;" >"$WORK/origin/src/foo.ts"
git -C "$WORK/origin" commit --quiet -am "feat: bump a"
git -C "$WORK/origin" update-ref refs/pull/7/head refs/heads/pr-7

git -C "$WORK/origin" checkout --quiet main
git -C "$WORK/origin" checkout --quiet -b pr-8
echo "export const a = 3;" >"$WORK/origin/src/foo.ts"
git -C "$WORK/origin" commit --quiet -am "feat: bump a again"
git -C "$WORK/origin" update-ref refs/pull/8/head refs/heads/pr-8
git -C "$WORK/origin" checkout --quiet main
git -C "$WORK/origin" branch -D pr-8 >/dev/null  # PR #8's branch is deleted — refs/pull/8/head survives

git clone --quiet "$WORK/origin" "$WORK/repo"
git -C "$WORK/repo" config user.email "test@example.com"
git -C "$WORK/repo" config user.name "Test"
mkdir -p "$WORK/repo/docs/graph"
echo '{"modules": {}}' >"$WORK/repo/docs/graph/symbols.json"

run_script() {
  # Run the real review-graph.sh from inside $WORK/repo, capturing stdout+stderr and exit status
  # without letting `set -e` here abort the test on the (sometimes expected) non-zero exit.
  local status=0
  OUT="$(cd "$WORK/repo" && "$SCRIPT" "$@" 2>&1)" || status=$?
  STATUS=$status
}

head_before="$(git -C "$WORK/repo" rev-parse HEAD)"
branch_before="$(git -C "$WORK/repo" rev-parse --abbrev-ref HEAD)"

# --- Scenario 1: PR branch already checked out in a worktree elsewhere --------------------------
git -C "$WORK/repo" fetch --quiet origin pr-7:pr-7
git -C "$WORK/repo" worktree add --quiet "$WORK/repo/.worktrees/pr-7" pr-7

run_script 7
assert "PR #7 (branch checked out in a worktree) succeeds" "0" "$STATUS"
assert_contains "PR #7 output reports the blast radius" "$OUT" "PR #7 — blast radius"
assert_contains "PR #7 output lists the changed module" "$OUT" "src/foo.ts"

# --- Scenario 2: PR branch not present locally at all --------------------------------------------
assert "pr-8 has no local ref before the run" "" "$(git -C "$WORK/repo" branch --list pr-8)"

run_script 8
assert "PR #8 (branch never fetched locally) succeeds" "0" "$STATUS"
assert_contains "PR #8 output reports the blast radius" "$OUT" "PR #8 — blast radius"

assert "pr-8 still has no local branch after the run (nothing leaked into refs/heads)" \
  "" "$(git -C "$WORK/repo" branch --list pr-8)"
assert "no leftover scripts/review-graph private refs" \
  "" "$(git -C "$WORK/repo" for-each-ref refs/review-graph)"

# --- Scenario 3: genuinely unresolvable PR fails loudly with an actionable message --------------
run_script 999
assert "unresolvable PR #999 fails" "1" "$STATUS"
assert_contains "failure names the PR" "$OUT" "cannot resolve PR #999"
assert_contains "failure gives a concrete next step" "$OUT" "gh pr view 999"

# --- Never mutates the caller's checkout ---------------------------------------------------------
assert "HEAD is unchanged after all runs" "$head_before" "$(git -C "$WORK/repo" rev-parse HEAD)"
assert "current branch is unchanged after all runs" "$branch_before" "$(git -C "$WORK/repo" rev-parse --abbrev-ref HEAD)"
assert "HEAD is not detached" "true" "$(git -C "$WORK/repo" symbolic-ref -q HEAD >/dev/null && echo true || echo false)"

say "review-graph.test.sh: $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  die "review-graph.sh PR-mode checkout handling regressed — see scripts/review-graph.sh"
fi
