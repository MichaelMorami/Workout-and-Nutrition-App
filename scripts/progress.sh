#!/usr/bin/env bash
# Regenerate PROGRESS.md from what GitHub actually recorded.
#
# PROGRESS.md is derived, not hand-kept: GitHub (milestones and merged PRs) is the authoritative
# progress record, and this file is a readable snapshot of it committed alongside the code. Because
# `main` requires a pull request, nothing pushes this straight to main — run it, and the change rides
# the next PR.
#
# Three pieces are derived, each from a different part of GitHub:
#   - "## Current sprint"  — the first milestone (lowest number) with open issues. Title and scope
#                            prose come straight from the milestone's own title/description.
#   - "## Checkpoints"     — the State column, one row per milestone: "planned" while a milestone has
#                            no issues yet, "in progress" while any are open, "signed off" once every
#                            issue in it is closed. The When/What columns are hand-kept prose (why a
#                            checkpoint exists, not a GitHub fact) and are left untouched.
#   - "## Merged"          — one line per merged PR, exactly as before.
#
#   scripts/progress.sh           rewrite PROGRESS.md in place
#   scripts/progress.sh --check   exit 1 if the committed file is out of date (no changes made)
. "$(dirname "$0")/lib.sh"
need gh; need jq
cd "$ROOT"

FILE="PROGRESS.md"
[ -f "$FILE" ] || die "$FILE not found"

milestones="$(gh api "repos/:owner/:repo/milestones?state=all" --paginate \
  --jq 'map({number, title, description, open: .open_issues, closed: .closed_issues})' \
  | jq -s 'add | sort_by(.number)')"

# The current sprint is the first (lowest-numbered) milestone with open issues — the one the team
# is actually working. If none has open issues, fall back to the first one with no issues filed
# yet ("up next"). If every milestone is fully closed, there is no current sprint.
current="$(jq -c '[.[] | select(.open > 0)] | first // empty' <<<"$milestones")"
[ -n "$current" ] || current="$(jq -c '[.[] | select(.open == 0 and .closed == 0)] | first // empty' <<<"$milestones")"

# The "What the client does" text for a checkpoint is hand-kept prose, not a GitHub fact — pull it
# from the file's own committed table (checkpoint number == milestone number) rather than
# duplicating it in this script.
checkpoint_what() {
  awk -F'|' -v n="$1" '
    { gsub(/^ +| +$/, "", $2) }
    $2 == n { gsub(/^ +| +$/, "", $4); print $4; exit }
  ' "$FILE"
}

if [ -n "$current" ]; then
  num="$(jq -r '.number' <<<"$current")"
  what="$(checkpoint_what "$num")"
  sprint_block="$(jq -r --arg what "$what" '
    "**\(.title) — \(.description).** \(.closed)/\(.closed + .open) issues closed. Ends at\n" +
    "**Checkpoint \(.number)** (\($what))." ' <<<"$current")"
else
  sprint_block="All sprints complete. See the [project board](../../projects) for what ships next."
fi

# planned: no issues filed yet · in progress: some still open · signed off: milestone fully closed
checkpoint_state() {
  jq -r --arg n "$1" '
    (.[] | select(.number == ($n | tonumber))) as $m
    | if ($m.closed == 0 and $m.open == 0) then "planned"
      elif $m.open > 0 then "in progress"
      else "signed off" end
  ' <<<"$milestones"
}

new="$(mktemp)"
trap 'rm -f "$new"' EXIT

# Preamble, verbatim through the "## Current sprint" heading.
awk '1; /^## Current sprint$/{exit}' "$FILE" > "$new"
printf '\n%s\n' "$sprint_block" >> "$new"

# "## Checkpoints" heading, blank line, header row and separator: verbatim. Data rows: regenerate
# only the State column (the last `|`-delimited field), keep When/What as committed.
{
  printf '\n## Checkpoints\n\n'
  awk '/^\| # \| When \|/{print; found=1; next} found && /^\| --- \|/{print; exit}' "$FILE"
  while IFS='|' read -r _ num when what _state _; do
    n="$(printf '%s' "$num" | tr -d ' ')"
    [ -n "$n" ] || continue
    state="$(checkpoint_state "$n")"
    printf '|%s|%s|%s| %s |\n' "$num" "$when" "$what" "$state"
  done < <(grep -E '^\| [0-9]+ \|' "$FILE")
} >> "$new"

# Merged section, unchanged logic: one line per merged PR.
merged="$(gh pr list --repo "$REPO" --state merged --limit 200 \
  --json number,title,mergedAt,closingIssuesReferences \
  --jq 'sort_by(.mergedAt) | .[] |
        "- \(.mergedAt[0:10])  \(.title)  (PR #\(.number)\(
           if (.closingIssuesReferences|length) > 0
           then " closes " + ([.closingIssuesReferences[].number] | map("#"+tostring) | join(" "))
           else "" end))"')"

printf '\n## Merged\n\n%s\n' "${merged:-_nothing merged yet_}" >> "$new"

if [ "${1:-}" = "--check" ]; then
  if diff -q "$FILE" "$new" >/dev/null; then exit 0; fi
  printf '%s\n' "--- committed PROGRESS.md vs regenerated ---"
  diff -u "$FILE" "$new" | head -60
  printf '\n%s\n' "PROGRESS.md is stale — run scripts/progress.sh and commit the result."
  exit 1
fi

trap - EXIT
mv "$new" "$FILE"
ok "PROGRESS.md refreshed from GitHub — commit it on a branch, main requires a PR"
