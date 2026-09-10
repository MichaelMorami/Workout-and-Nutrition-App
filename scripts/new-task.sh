#!/usr/bin/env bash
# Open an issue, branch and worktree for one subtask, in a single step.
#   scripts/new-task.sh <area> <slug> "<title>" [milestone]
# Body is read from stdin (the acceptance-criteria checklist).
. "$(dirname "$0")/lib.sh"
need gh

AREA="${1:?usage: new-task.sh <area> <slug> \"<title>\" [milestone]}"
SLUG="${2:?slug required}"
TITLE="${3:?title required}"
MILESTONE="${4:-}"

BODY="$(cat)"
[ -n "$BODY" ] || die "issue body (acceptance criteria) must be provided on stdin"

args=(--repo "$REPO" --title "$TITLE" --body "$BODY" --label "area:$AREA")
[ -n "$MILESTONE" ] && args+=(--milestone "$MILESTONE")

URL="$(gh issue create "${args[@]}")"
NUM="${URL##*/}"
ok "issue #$NUM  $URL"

DIR="$("$ROOT/scripts/setup-worktree.sh" "feat/$NUM-$SLUG")"
ok "worktree $DIR"
printf '\n%sissue%s #%s\n%sbranch%s feat/%s-%s\n%sdir%s %s\n' \
  "$BOLD" "$OFF" "$NUM" "$BOLD" "$OFF" "$NUM" "$SLUG" "$BOLD" "$OFF" "$DIR"
