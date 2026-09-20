#!/usr/bin/env bash
# Open a PR for the current branch, with test evidence filled in.
#   scripts/pr.sh [--no-close] [issue]   issue defaults to the number in the branch name
#
# --no-close: for a PR that must NOT close its issue on merge (e.g. step 1 of a multi-step issue).
# GitHub parses closing keywords ("Closes #N", "Fixes #N", ...) anywhere in the body, and negating
# them in prose ("does not close #N") or striking them through does not stop the link — GitHub
# still closes the issue. So --no-close omits the closing-keyword line entirely and references the
# issue with a plain, non-keyword mention ("Part of #N") instead. Verify with:
#   gh pr view <n> --json closingIssuesReferences -q .closingIssuesReferences
# which must print `[]`. Grepping the body for the absence of "Closes" only proves the string is
# gone, not that GitHub isn't still linking the issue some other way — it is not proof.
. "$(dirname "$0")/lib.sh"
need gh

NO_CLOSE=0
ISSUE=""
for arg in "$@"; do
  case "$arg" in
    --no-close) NO_CLOSE=1 ;;
    *) ISSUE="$arg" ;;
  esac
done
ISSUE="${ISSUE:-$(issue_from_branch)}"
[ -n "$ISSUE" ] || die "cannot infer issue number from branch — pass it: scripts/pr.sh 12"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" != "main" ] || die "refusing to open a PR from main"

# PROGRESS.md is derived from GitHub and tech-lead's exclusive path (CLAUDE.md). pr.sh used to
# regenerate and commit it onto every branch here, which forced a disclosed ownership crossing on
# every single PR and made any two branches cut in parallel conflict on that commit the moment one
# merged (issue #211). merge.sh cannot push a refresh straight to `main` either — `main` requires a
# PR — so PROGRESS.md is left alone on the branch and simply rides the next PR that touches it, same
# as any other change to a file this script doesn't own.

say "running checks before opening the PR"
TEST_OUT="$(mktemp)"
if ! "$ROOT/scripts/check.sh" >"$TEST_OUT" 2>&1; then
  tail -40 "$TEST_OUT"
  die "checks failed — not opening a PR"
fi
ok "checks green"

git push -u origin "$BRANCH" --quiet

# The PR title is the branch's own work. pr.sh no longer commits `docs: refresh PROGRESS.md` onto
# the branch itself (issue #211), but pr_title_for_branch() still knows to skip that commit message
# for the rare branch that carries one some other way — see lib.sh and scripts/pr-title.test.sh.
TITLE="$(pr_title_for_branch origin/main "$BRANCH")"
[ -n "$TITLE" ] || die "no describable commit found between origin/main and $BRANCH — commit your work first, or check you branched from an up-to-date origin/main."

if [ "$NO_CLOSE" -eq 1 ]; then
  ISSUE_LINE="Part of #$ISSUE"
else
  ISSUE_LINE="Closes #$ISSUE"
fi

BODY="$(cat <<PRBODY
$ISSUE_LINE

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
