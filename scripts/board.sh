#!/usr/bin/env bash
# Create the project board. Needs the 'project' token scope.
. "$(dirname "$0")/lib.sh"
need gh

OWNER="${REPO%%/*}"
TITLE="Vitals"

if ! gh project list --owner "$OWNER" >/dev/null 2>&1; then
  warn "the gh token has no 'project' scope, so the board cannot be created from here."
  warn "run this once, then re-run scripts/board.sh:"
  printf '\n    gh auth refresh -s project -s read:project\n\n'
  warn "until then, the milestones and PROGRESS.md carry progress — nothing is blocked."
  exit 0
fi

if gh project list --owner "$OWNER" --format json | jq -e --arg t "$TITLE" \
     '.projects[] | select(.title==$t)' >/dev/null 2>&1; then
  ok "project '$TITLE' already exists"
else
  gh project create --owner "$OWNER" --title "$TITLE" >/dev/null
  ok "created project '$TITLE'"
fi

NUM="$(gh project list --owner "$OWNER" --format json \
        | jq -r --arg t "$TITLE" '.projects[] | select(.title==$t) | .number')"
gh project link "$NUM" --owner "$OWNER" --repo "$REPO" >/dev/null 2>&1 \
  && ok "linked to $REPO" || warn "could not link the project to the repo"

printf '\n%sBoard:%s https://github.com/users/%s/projects/%s\n' "$BOLD" "$OFF" "$OWNER" "$NUM"
printf '%sAdd the columns by hand once: Todo · In progress · In review · Needs your review · Done%s\n' "$DIM" "$OFF"
