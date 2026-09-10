#!/usr/bin/env bash
# Generate realistic demo data so charts and checkpoints can be judged properly.
#   scripts/seed.sh [days]   default 400
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

DAYS="${1:-400}"
[ -f test/seed.ts ] || die "test/seed.ts does not exist yet — qa-engineer owns it (Sprint 0)"

say "seeding $DAYS days of realistic data"
npx tsx test/seed.ts --days "$DAYS"
ok "seeded — run scripts/demo.sh to view it on your phone"
