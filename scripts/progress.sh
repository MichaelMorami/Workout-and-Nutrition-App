#!/usr/bin/env bash
# Regenerate the "## Merged" section of PROGRESS.md from what GitHub actually recorded.
#
# PROGRESS.md is derived, not hand-kept: GitHub (issues, milestones, merged PRs) is the authoritative
# progress record, and this file is a readable snapshot of it committed alongside the code. Because
# `main` requires a pull request, nothing pushes this straight to main — run it, and the change rides
# the next PR.
#
#   scripts/progress.sh           rewrite the Merged section in place
#   scripts/progress.sh --check   exit 1 if the committed file is out of date (no changes made)
. "$(dirname "$0")/lib.sh"
need gh; need jq
cd "$ROOT"

FILE="PROGRESS.md"
[ -f "$FILE" ] || die "$FILE not found"

merged="$(gh pr list --repo "$REPO" --state merged --limit 200 \
  --json number,title,mergedAt,closingIssuesReferences \
  --jq 'sort_by(.mergedAt) | .[] |
        "- \(.mergedAt[0:10])  \(.title)  (PR #\(.number)\(
           if (.closingIssuesReferences|length) > 0
           then " closes " + ([.closingIssuesReferences[].number] | map("#"+tostring) | join(" "))
           else "" end))"')"

new="$(mktemp)"
# Keep everything above the marker verbatim; regenerate everything below it.
awk '/^## Merged$/{print; exit} {print}' "$FILE" > "$new"
printf '\n%s\n' "${merged:-_nothing merged yet_}" >> "$new"

if [ "${1:-}" = "--check" ]; then
  if diff -q "$FILE" "$new" >/dev/null; then rm -f "$new"; exit 0; fi
  printf '%s\n' "--- committed PROGRESS.md vs regenerated ---"
  diff -u "$FILE" "$new" | head -40
  rm -f "$new"
  exit 1
fi

mv "$new" "$FILE"
ok "PROGRESS.md refreshed from GitHub — commit it on a branch, main requires a PR"
