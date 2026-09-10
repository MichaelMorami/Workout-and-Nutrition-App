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

# Record progress. PROGRESS.md is DERIVED from GitHub, not hand-kept — see scripts/progress.sh.
# `main` requires a pull request, so nothing here pushes to it; the refreshed file rides the next PR.
if "$ROOT/scripts/progress.sh" >/dev/null 2>&1; then
  if ! git -C "$ROOT" diff --quiet -- PROGRESS.md 2>/dev/null; then
    warn "PROGRESS.md refreshed locally — commit it on a branch (main requires a PR)"
  fi
fi

printf '%s✓%s %s %s\n' "$GRN" "$OFF" "$title" "$issues"
