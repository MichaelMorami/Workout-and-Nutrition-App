#!/usr/bin/env bash
# Open a PR for the current branch, with test evidence filled in.
#   scripts/pr.sh [issue]        issue defaults to the number in the branch name
. "$(dirname "$0")/lib.sh"
need gh

ISSUE="${1:-$(issue_from_branch)}"
[ -n "$ISSUE" ] || die "cannot infer issue number from branch — pass it: scripts/pr.sh 12"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" != "main" ] || die "refusing to open a PR from main"

say "running checks before opening the PR"
TEST_OUT="$(mktemp)"
if ! "$ROOT/scripts/check.sh" >"$TEST_OUT" 2>&1; then
  tail -40 "$TEST_OUT"
  die "checks failed — not opening a PR"
fi
ok "checks green"

git push -u origin "$BRANCH" --quiet
TITLE="$(git log -1 --pretty=%s)"

BODY="$(cat <<PRBODY
Closes #$ISSUE

## What changed

$(git log --pretty='- %s' origin/main.."$BRANCH")

## Test evidence

\`\`\`
$(grep -E 'Tests:|Suites:|ok |✓|✗' "$TEST_OUT" | tail -20)
\`\`\`

## Checklist

- [ ] Every acceptance criterion on #$ISSUE has a named test
- [ ] \`scripts/check.sh\` green
- [ ] No writes outside my owned paths
- [ ] Screenshots attached (UI changes, both themes)
PRBODY
)"

URL="$(gh pr create --repo "$REPO" --base main --head "$BRANCH" --title "$TITLE" --body "$BODY")"
rm -f "$TEST_OUT"
ok "PR opened  $URL"
echo "$URL"
