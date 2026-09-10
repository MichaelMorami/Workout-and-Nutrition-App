#!/usr/bin/env bash
# Merge a reviewed PR and close out its issue.
#   scripts/merge.sh <pr>
. "$(dirname "$0")/lib.sh"
need gh; need jq

PR="${1:?usage: merge.sh <pr-number>}"

info="$(gh pr view "$PR" --repo "$REPO" --json title,state,mergeable,statusCheckRollup,reviewDecision,closingIssuesReferences)"
state="$(jq -r .state <<<"$info")"
[ "$state" = "OPEN" ] || die "PR #$PR is $state"

checks="$(jq -r '[.statusCheckRollup[]?.conclusion] | join(",")' <<<"$info")"
case "$checks" in
  *FAILURE*|*CANCELLED*|*TIMED_OUT*) die "CI is not green on #$PR ($checks)" ;;
esac

review="$(jq -r '.reviewDecision // "NONE"' <<<"$info")"
[ "$review" = "APPROVED" ] || warn "review decision is $review — merging anyway only if you meant to"

title="$(jq -r .title <<<"$info")"
gh pr merge "$PR" --repo "$REPO" --squash --delete-branch
ok "merged #$PR  $title"

# Record progress. PROGRESS.md is owned by tech-lead and is the client's always-current view.
issues="$(jq -r '[.closingIssuesReferences[]?.number] | map("#"+tostring) | join(" ")' <<<"$info")"
printf -- '- %s  %s  (PR #%s %s)\n' "$(date +%Y-%m-%d)" "$title" "$PR" "$issues" >> "$ROOT/PROGRESS.md"

# Commit it straight away. Left uncommitted, PROGRESS.md silently drifts out of date and the
# client's always-current view stops being current — which is the one thing it exists to be.
cur="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
if [ "$cur" = "main" ]; then
  git -C "$ROOT" pull --quiet --ff-only origin main
  git -C "$ROOT" add PROGRESS.md
  git -C "$ROOT" commit --quiet -m "docs: record $title (#$PR) in PROGRESS.md" \
    -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  git -C "$ROOT" push --quiet origin main
  ok "PROGRESS.md updated and pushed"
else
  warn "not on main ($cur) — PROGRESS.md updated locally but NOT committed; commit it from main"
fi
printf '%s✓%s %s %s\n' "$GRN" "$OFF" "$title" "$issues"
