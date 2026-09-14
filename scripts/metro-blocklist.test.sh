#!/usr/bin/env bash
# Self-contained test for metro.config.js's resolver.blockList (#77):
#   - every real `app/**/*.test.tsx` / `app/**/*.test.ts` file is blocked, so expo-router's
#     require.context (which sweeps every .ts(x) under app/, not just routes) never bundles
#     @testing-library/react-native or the test harness (test/db.ts et al.) into the shipped app
#   - real routes are never blocked — a broad pattern that also matched `[id].tsx` or `_layout.tsx`
#     would silently delete screens from the app instead of fixing anything
#   - metro-config's own default blockList entries (__tests__/, .expo/ caches, native build output)
#     survive — metro.config.js must concatenate onto them, never replace them
#
# Not a jest test: jest doesn't read metro.config.js (confirmed separately — see #77's acceptance
# criteria — `npx jest --selectProjects components` is unaffected by this file), and this is
# scripts/**-owned, release-engineer behaviour, not app code.
#
#   scripts/metro-blocklist.test.sh
set -euo pipefail

. "$(dirname "$0")/lib.sh"
cd "$ROOT"

pass=0
fail=0

# True (exit 0) iff at least one pattern in metro.config.js's resolver.blockList matches $1,
# using the same RegExp#test() metro itself uses to decide whether to exclude a module path.
blocked() {
  node -e "
    const path = require('path');
    const config = require(path.join(process.cwd(), 'metro.config.js'));
    const list = Array.isArray(config.resolver.blockList) ? config.resolver.blockList : [config.resolver.blockList];
    process.exit(list.some((re) => re.test(process.argv[1])) ? 0 : 1);
  " "$1"
}

assert_blocked() {
  local desc="$1" path="$2"
  if blocked "$path"; then
    ok "$desc"; pass=$((pass + 1))
  else
    warn "$desc"
    printf '     %s should be blocked by resolver.blockList, but no pattern matched it\n' "$path"
    fail=$((fail + 1))
  fi
}

assert_not_blocked() {
  local desc="$1" path="$2"
  if blocked "$path"; then
    warn "$desc"
    printf '     %s should NOT be blocked — it is a real route, not a test file\n' "$path"
    fail=$((fail + 1))
  else
    ok "$desc"; pass=$((pass + 1))
  fi
}

# --- every real colocated test file under app/ must be blocked --------------------------------
# `while read` + process substitution rather than `mapfile`: this box's default /bin/bash is 3.2
# (macOS ships no newer GPLv3 bash), which has no `mapfile` builtin.
found_any=0
while IFS= read -r f; do
  found_any=1
  assert_blocked "blocks real fixture $f" "$f"
done < <(find app -type f \( -iname '*.test.tsx' -o -iname '*.test.ts' \) | sort)
if [ "$found_any" -eq 0 ]; then
  die "no app/**/*.test.tsx files found — this test needs real fixtures to prove the exclusion against (see jest.config.js's components project)"
fi

# --- synthetic edge cases: extensions the acceptance criteria names explicitly -----------------
assert_blocked  "blocks a .test.ts file (not just .test.tsx)"        "app/foods/helpers.test.ts"
assert_blocked  "blocks a dynamic-segment test file"                  "app/foods/[id].test.tsx"
assert_blocked  "blocks a nested group-route test file"               "app/(tabs)/settings.test.tsx"
assert_blocked  "blocks an absolute-path test file"                   "$ROOT/app/meals/new.test.tsx"

# --- real routes must survive — the fix must not eat the app it is supposed to ship ------------
assert_not_blocked "does not block the real _layout.tsx route"        "app/_layout.tsx"
assert_not_blocked "does not block a real dynamic-segment route"      "app/foods/[id].tsx"
assert_not_blocked "does not block a real group-route index"          "app/(tabs)/index.tsx"
assert_not_blocked "does not block a file that merely contains 'test'" "app/foods/latest.tsx"

# --- metro-config's own defaults must survive the concatenation, not get overwritten -----------
assert_blocked "still blocks metro's built-in __tests__/ convention (default preserved)" \
  "app/__tests__/whatever.ts"

say "metro-blocklist.test.sh: $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  die "metro.config.js's resolver.blockList regressed — see metro.config.js"
fi
