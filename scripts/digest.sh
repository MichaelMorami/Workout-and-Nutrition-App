#!/usr/bin/env bash
# Build the client's end-of-sprint digest from what actually merged.
#   scripts/digest.sh "Sprint 1"
. "$(dirname "$0")/lib.sh"
need gh; need jq

MS="${1:?usage: digest.sh \"Sprint N\"}"

prs="$(gh pr list --repo "$REPO" --state merged --limit 100 \
        --json number,title,mergedAt,labels,closingIssuesReferences)"
open_issues="$(gh issue list --repo "$REPO" --milestone "$MS" --state open \
        --json number,title --jq '.[] | "- #\(.number) \(.title)"')"
closed_issues="$(gh issue list --repo "$REPO" --milestone "$MS" --state closed \
        --json number,title --jq '.[] | "- #\(.number) \(.title)"')"

cat <<DIGEST
# $MS — digest
_$(date +%Y-%m-%d)_

## Shipped
${closed_issues:-_nothing closed yet_}

## Merged pull requests
$(jq -r '.[] | "- #\(.number) \(.title)"' <<<"$prs" | head -40)

## Still open in this sprint
${open_issues:-_none — sprint is clear_}

## Test health
$(cd "$ROOT" && npx jest --silent 2>&1 | grep -E 'Tests:|Suites:' || echo '_test run unavailable_')

## Needs your decision
_(filled in by tech-lead)_
DIGEST
