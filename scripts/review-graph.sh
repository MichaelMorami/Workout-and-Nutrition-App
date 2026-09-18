#!/usr/bin/env bash
# Blast radius of a PR: which exported symbols the diff changes, and every module that imports them.
# The reviewer reads the diff plus this — cheaper than skimming the repo, and misses less.
#   scripts/review-graph.sh <pr>
#   scripts/review-graph.sh --branch                     compare the current branch against main
#   scripts/review-graph.sh --refs <base> <head> <label>  internal — diff two arbitrary refs (used
#                                                          by scripts/review-graph.test.sh)
#
# PR mode never checks anything out and never touches the caller's working tree or HEAD. A
# reviewer may be sitting in a worktree on an unrelated branch, and the PR's own branch may
# already be checked out in a *different* worktree — a branch checked out in one worktree cannot
# be checked out again in another (see #129). So instead of `gh pr checkout`, this fetches the
# PR's head commit straight into a private, throwaway ref: `refs/pull/<N>/head`, which GitHub
# serves for every PR — same-repo or fork, open or merged, even once the source branch has been
# deleted — and diffs it against the PR's base branch with plain read-only git plumbing. The
# private ref never touches refs/heads/*, so it can never collide with a branch anyone already has
# checked out, and it is deleted again before this script exits.
. "$(dirname "$0")/lib.sh"
need jq
cd "$ROOT"

blast_radius() {
  local BASE="$1" HEADREF="$2" LABEL="$3"

  CHANGED="$(git diff --name-only "$BASE...$HEADREF" -- 'app/**' 'src/**' | grep -E '\.tsx?$' || true)"
  [ -n "$CHANGED" ] || { say "$LABEL touches no TypeScript source"; return 0; }

  GRAPH="docs/graph/symbols.json"
  [ -f "$GRAPH" ] || die "no project graph — run scripts/graph.sh"

  printf '\n%s%s — blast radius%s\n\n' "$BOLD" "$LABEL" "$OFF"
  printf '%sChanged modules%s\n' "$BOLD" "$OFF"
  echo "$CHANGED" | sed 's/^/  /'

  printf '\n%sExports of the changed modules%s\n' "$BOLD" "$OFF"
  while IFS= read -r f; do
    jq -r --arg f "$f" '.modules[$f].exports[]? | "  \($f)  ::  \(.)"' "$GRAPH" 2>/dev/null || true
  done <<<"$CHANGED"

  printf '\n%sDownstream — modules importing the above (review these too)%s\n' "$BOLD" "$OFF"
  {
    while IFS= read -r f; do
      jq -r --arg f "$f" '.modules[$f].importedBy[]?' "$GRAPH" 2>/dev/null || true
    done <<<"$CHANGED"
  } | sort -u | grep -vxF -f <(echo "$CHANGED") 2>/dev/null | sed 's/^/  /' || echo "  (none)"

  printf '\n%sDiff size%s  %s\n\n' "$BOLD" "$OFF" "$(git diff --shortstat "$BASE...$HEADREF")"
}

if [ "${1:-}" = "--refs" ]; then
  blast_radius "${2:?usage: review-graph.sh --refs <base> <head> <label>}" \
    "${3:?usage: review-graph.sh --refs <base> <head> <label>}" \
    "${4:?usage: review-graph.sh --refs <base> <head> <label>}"
  exit 0
fi

if [ "${1:-}" = "--branch" ]; then
  git fetch --quiet origin main \
    || die "cannot fetch origin/main — check your network, or the 'origin' remote"
  blast_radius "origin/main" "HEAD" "$(git rev-parse --abbrev-ref HEAD)"
  exit 0
fi

PR="${1:?usage: review-graph.sh <pr> | --branch}"
need gh

INFO="$(gh pr view "$PR" --repo "$REPO" --json baseRefName 2>/dev/null)" \
  || die "cannot resolve PR #$PR — check the number, and that 'gh' is authenticated for $REPO (try: gh pr view $PR --repo $REPO)"
BASE_BRANCH="$(jq -r '.baseRefName' <<<"$INFO")"
[ -n "$BASE_BRANCH" ] && [ "$BASE_BRANCH" != "null" ] \
  || die "cannot resolve PR #$PR — 'gh pr view' returned no base branch"

# Private, throwaway refs (never refs/heads/*) so this can never collide with a branch already
# checked out somewhere — in this worktree or another — and cleaned up on any exit.
HEAD_REF="refs/review-graph/pr-$PR-head"
BASE_REF="refs/review-graph/pr-$PR-base"
cleanup() {
  git update-ref -d "$HEAD_REF" >/dev/null 2>&1 || true
  git update-ref -d "$BASE_REF" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git fetch --quiet origin "+refs/pull/$PR/head:$HEAD_REF" \
  || die "cannot fetch PR #$PR's head commit — check your network, or that PR #$PR exists on $REPO"
git fetch --quiet origin "+refs/heads/$BASE_BRANCH:$BASE_REF" \
  || die "cannot fetch base branch '$BASE_BRANCH' for PR #$PR — check your network"

blast_radius "$BASE_REF" "$HEAD_REF" "PR #$PR"
