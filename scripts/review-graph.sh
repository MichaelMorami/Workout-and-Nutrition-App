#!/usr/bin/env bash
# Blast radius of a PR: which exported symbols the diff changes, and every module that imports them.
# The reviewer reads the diff plus this — cheaper than skimming the repo, and misses less.
#   scripts/review-graph.sh <pr>
#   scripts/review-graph.sh --branch     compare the current branch against main
. "$(dirname "$0")/lib.sh"
need jq
cd "$ROOT"

if [ "${1:-}" = "--branch" ]; then
  BASE="origin/main"; HEADREF="HEAD"; LABEL="$(git rev-parse --abbrev-ref HEAD)"
else
  PR="${1:?usage: review-graph.sh <pr> | --branch}"
  need gh
  gh pr checkout "$PR" --repo "$REPO" >/dev/null 2>&1 || die "cannot check out PR #$PR"
  BASE="origin/main"; HEADREF="HEAD"; LABEL="PR #$PR"
fi

CHANGED="$(git diff --name-only "$BASE...$HEADREF" -- 'app/**' 'src/**' | grep -E '\.tsx?$' || true)"
[ -n "$CHANGED" ] || { say "$LABEL touches no TypeScript source"; exit 0; }

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
