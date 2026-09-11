#!/usr/bin/env bash
# Regenerate Drizzle SQL migrations from src/db/schema.ts, then bundle them for the phone.
# Two steps, always together, so the bundle can never go stale relative to the migrations:
#   scripts/db-generate.sh
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

BUNDLE_SCRIPT="src/db/tools/bundle-migrations.mjs"

[ -f drizzle.config.ts ] || die "drizzle.config.ts does not exist yet — db-engineer owns it"

say "generating migrations (drizzle-kit)"
npx drizzle-kit generate \
  || die "drizzle-kit generate failed — see the error above, fix the schema, then rerun scripts/db-generate.sh"
ok "migrations generated"

[ -f "$BUNDLE_SCRIPT" ] \
  || die "$BUNDLE_SCRIPT does not exist yet — db-engineer owns it (lands on #17); rerun this script once it's on main"

say "bundling migrations for the phone"
node "$BUNDLE_SCRIPT" \
  || die "bundle-migrations.mjs failed — see the error above; migrations were regenerated but not bundled, so the phone would run stale ones. Fix and rerun scripts/db-generate.sh"
ok "migrations bundled"
