#!/usr/bin/env bash
# Self-contained test for scripts/pr.sh (#211):
#   - pr.sh no longer regenerates/commits PROGRESS.md onto the branch (that was the forced
#     ownership crossing on every PR, and the cause of the concurrent-PR conflict class)
#   - `--no-close` omits the closing-keyword line (`Closes #N`) and references the issue as
#     `Part of #N` instead
#   - the regression this issue exists to fix: two branches cut from the same commit, neither
#     touching PROGRESS.md, both merge into main with no conflict
#
# Not a jest test, same reasoning as pr-title.test.sh: this is scripts/**-owned behaviour, not app
# code. Builds a throwaway "origin" + clone (no real network, no real GitHub) and stubs `gh` on
# PATH with a canned `pr create` response, plus a throwaway scripts/check.sh so the real pr.sh can
# run against the fake repo without touching this actual project.
#
# GitHub's `closingIssuesReferences` is computed server-side from the live PR body — it cannot be
# reproduced against a local repo, so it is not asserted here. It is proven separately, against a
# real PR, with `gh pr view <n> --json closingIssuesReferences -q .closingIssuesReferences` — see
# the PR body for issue #211 for that transcript. What this test *can* and does prove locally is
# the input to that behaviour: the body pr.sh writes contains no closing keyword under --no-close.
#   scripts/pr.test.sh
set -euo pipefail

. "$(dirname "$0")/lib.sh"
PR_SCRIPT="$ROOT/scripts/pr.sh"

pass=0
fail=0
assert() {
  local desc="$1" want="$2" got="$3"
  if [ "$want" = "$got" ]; then
    ok "$desc"; pass=$((pass + 1))
  else
    warn "$desc"
    printf '     expected: %s\n     actual:   %s\n' "$want" "$got"
    fail=$((fail + 1))
  fi
}
assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if printf '%s' "$haystack" | grep -qF "$needle"; then
    ok "$desc"; pass=$((pass + 1))
  else
    warn "$desc"
    printf '     expected to contain: %s\n     actual:              %s\n' "$needle" "$haystack"
    fail=$((fail + 1))
  fi
}
assert_not_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if printf '%s' "$haystack" | grep -qF "$needle"; then
    warn "$desc"
    printf '     expected NOT to contain: %s\n     actual:                  %s\n' "$needle" "$haystack"
    fail=$((fail + 1))
  else
    ok "$desc"; pass=$((pass + 1))
  fi
}

WORK="$(mktemp -d)"
WORK="$(cd "$WORK" && pwd -P)"  # resolve symlinks (e.g. macOS /tmp) so path comparisons match
trap 'rm -rf "$WORK"' EXIT

# --- fake `gh`: no network, canned `pr create` answer, args captured to $GH_ARGS_FILE ------------
mkdir -p "$WORK/bin"
cat >"$WORK/bin/gh" <<'FAKE_GH'
#!/usr/bin/env bash
set -euo pipefail
if [ "$1 $2" = "pr create" ]; then
  shift 2
  printf '%s\n' "$@" >"$GH_ARGS_FILE"
  echo "https://github.com/example/fake/pull/999"
  exit 0
fi
echo "pr.test.sh: unstubbed gh invocation: $*" >&2
exit 1
FAKE_GH
chmod +x "$WORK/bin/gh"
export PATH="$WORK/bin:$PATH"

# --- fake origin + clone: a repo pr.sh can run against without touching the real project ---------
git init --quiet --bare -b main "$WORK/origin.git"

git clone --quiet "$WORK/origin.git" "$WORK/repo" 2>/dev/null  # the "empty repository" warning is expected
git -C "$WORK/repo" config user.email "test@example.com"
git -C "$WORK/repo" config user.name "Test"

# A throwaway scripts/check.sh — pr.sh runs "$ROOT/scripts/check.sh" before pushing, and $ROOT
# inside pr.sh (via lib.sh) resolves to whatever repo it is run from, i.e. this fake one.
mkdir -p "$WORK/repo/scripts"
cat >"$WORK/repo/scripts/check.sh" <<'FAKE_CHECK'
#!/usr/bin/env bash
echo "Tests: 1 passed, 1 total"
exit 0
FAKE_CHECK
chmod +x "$WORK/repo/scripts/check.sh"

# A throwaway scripts/progress.sh that genuinely mutates PROGRESS.md every time it runs (no `gh`
# calls — the real one shells out to `gh api`, which this fake `gh` doesn't answer). This is the
# piece a prior version of this test was missing: without a `progress.sh` that actually produces a
# diff, the *old* pr.sh's guard `if "$ROOT/scripts/progress.sh" >/dev/null 2>&1; then` fails
# ("not found") and silently no-ops, making old and new pr.sh indistinguishable to every assertion
# below. With a real mutation here, the old code's `git diff --quiet -- PROGRESS.md` genuinely goes
# false and it genuinely commits — so these assertions can actually fail against the bug.
cat >"$WORK/repo/scripts/progress.sh" <<'FAKE_PROGRESS'
#!/usr/bin/env bash
set -euo pipefail
echo "refreshed $(date +%s%N)-$$" >>"$(dirname "$0")/../PROGRESS.md"
FAKE_PROGRESS
chmod +x "$WORK/repo/scripts/progress.sh"

echo "# Progress" >"$WORK/repo/PROGRESS.md"
echo "placeholder" >"$WORK/repo/widget-a.txt"
echo "placeholder" >"$WORK/repo/widget-b.txt"
git -C "$WORK/repo" add PROGRESS.md scripts/check.sh scripts/progress.sh widget-a.txt widget-b.txt
git -C "$WORK/repo" commit --quiet -m "chore: repo init"
git -C "$WORK/repo" push --quiet origin main
BASE_PROGRESS="$(cat "$WORK/repo/PROGRESS.md")"

run_pr_script() {
  # Run the real pr.sh from inside $WORK/repo, capturing stdout+stderr and exit status without
  # letting `set -e` here abort the test on a (sometimes expected) non-zero exit.
  local status=0
  export GH_ARGS_FILE="$WORK/gh-args.txt"
  rm -f "$GH_ARGS_FILE"
  OUT="$(cd "$WORK/repo" && "$PR_SCRIPT" "$@" 2>&1)" || status=$?
  STATUS=$status
}

# --- Scenario 1: default run — no PROGRESS.md commit, body closes its issue ----------------------
git -C "$WORK/repo" checkout --quiet main
git -C "$WORK/repo" checkout --quiet -b chore/77-widget-a
echo "v1" >"$WORK/repo/widget-a.txt"
git -C "$WORK/repo" commit --quiet -am "feat: bump widget a"

run_pr_script
assert "default run succeeds" "0" "$STATUS"

log_a="$(git -C "$WORK/repo" log --pretty=%s origin/main..chore/77-widget-a)"
assert_not_contains "branch A carries no PROGRESS.md refresh commit" "$log_a" "docs: refresh PROGRESS.md"
assert "PROGRESS.md is byte-identical to before the run" "$BASE_PROGRESS" "$(cat "$WORK/repo/PROGRESS.md")"

body_a="$(cat "$WORK/gh-args.txt")"
assert_contains "default run's PR body closes its issue" "$body_a" "Closes #77"

# --- Scenario 2: --no-close omits the closing keyword, references the issue plainly --------------
git -C "$WORK/repo" checkout --quiet main
git -C "$WORK/repo" checkout --quiet -b chore/78-widget-b
echo "v1" >"$WORK/repo/widget-b.txt"
git -C "$WORK/repo" commit --quiet -am "feat: bump widget b"

run_pr_script --no-close
assert "--no-close run succeeds" "0" "$STATUS"

body_b="$(cat "$WORK/gh-args.txt")"
assert_contains "--no-close body references the issue without a closing keyword" "$body_b" "Part of #78"
assert_not_contains "--no-close body has no Closes line" "$body_b" "Closes #78"
assert_not_contains "--no-close body has no bare Closes keyword at all" "$body_b" "Closes #"

# --no-close before the issue number, and as an explicit arg — same result either order.
git -C "$WORK/repo" checkout --quiet main
git -C "$WORK/repo" checkout --quiet -b chore/79-widget-c
echo "v1" >"$WORK/repo/widget-a.txt"
git -C "$WORK/repo" commit --quiet -am "feat: another widget c tweak"

run_pr_script 79 --no-close
assert "--no-close after an explicit issue number still succeeds" "0" "$STATUS"
body_c="$(cat "$WORK/gh-args.txt")"
assert_contains "issue-then-flag body references the issue without closing it" "$body_c" "Part of #79"
assert_not_contains "issue-then-flag body has no Closes line" "$body_c" "Closes #79"

# --- Scenario 3: the regression test — two branches from the same commit, neither touching
# PROGRESS.md, both merge into main with no conflict. This is #211's whole reason to exist: the
# old pr.sh committed `docs: refresh PROGRESS.md` onto every branch, so any two branches cut in
# parallel collided on that commit the moment one of them merged.
git -C "$WORK/repo" checkout --quiet main
git -C "$WORK/repo" pull --quiet origin main
base_main="$(git -C "$WORK/repo" rev-parse main)"

git -C "$WORK/repo" checkout --quiet -b feat/80-parallel-x main
echo "x" >"$WORK/repo/widget-a.txt"
git -C "$WORK/repo" commit --quiet -am "feat: parallel branch x"
run_pr_script
assert "parallel branch x's PR opens cleanly" "0" "$STATUS"

git -C "$WORK/repo" checkout --quiet -b feat/81-parallel-y "$base_main"
echo "y" >"$WORK/repo/widget-b.txt"
git -C "$WORK/repo" commit --quiet -am "feat: parallel branch y"
run_pr_script
assert "parallel branch y's PR opens cleanly" "0" "$STATUS"

assert "branch x carries no PROGRESS.md refresh commit" "" \
  "$(git -C "$WORK/repo" log --pretty=%s origin/main..feat/80-parallel-x | grep -F 'docs: refresh PROGRESS.md' || true)"
assert "branch y carries no PROGRESS.md refresh commit" "" \
  "$(git -C "$WORK/repo" log --pretty=%s "$base_main"..feat/81-parallel-y | grep -F 'docs: refresh PROGRESS.md' || true)"

# Merge x into main and push (simulates scripts/merge.sh landing PR x).
git -C "$WORK/repo" checkout --quiet main
git -C "$WORK/repo" merge --squash feat/80-parallel-x >/dev/null
git -C "$WORK/repo" commit --quiet -m "feat: parallel branch x (squash)"
git -C "$WORK/repo" push --quiet origin main

# Merge y into the now-updated main and push (simulates scripts/merge.sh landing PR y next).
merge_y_status=0
git -C "$WORK/repo" merge --squash feat/81-parallel-y >/dev/null 2>&1 || merge_y_status=$?
assert "merging branch y after branch x hits no conflict" "0" "$merge_y_status"
git -C "$WORK/repo" commit --quiet -m "feat: parallel branch y (squash)"
git -C "$WORK/repo" push --quiet origin main

assert "no leftover conflict markers in widget-a.txt" "0" \
  "$(grep -c '<<<<<<<' "$WORK/repo/widget-a.txt" || true)"
assert "no leftover conflict markers in widget-b.txt" "0" \
  "$(grep -c '<<<<<<<' "$WORK/repo/widget-b.txt" || true)"
assert "PROGRESS.md is still exactly what it was before either branch" "$BASE_PROGRESS" \
  "$(cat "$WORK/repo/PROGRESS.md")"

say "pr.test.sh: $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  die "pr.sh's PROGRESS.md / --no-close behaviour regressed — see scripts/pr.sh"
fi
