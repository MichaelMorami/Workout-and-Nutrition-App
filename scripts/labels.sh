#!/usr/bin/env bash
# Idempotent: creates or updates every label and milestone. Safe to run repeatedly.
. "$(dirname "$0")/lib.sh"
need gh

label() { # name colour description
  if gh label create "$1" --repo "$REPO" --color "$2" --description "$3" >/dev/null 2>&1; then
    ok "label $1"
  else
    gh label edit "$1" --repo "$REPO" --color "$2" --description "$3" >/dev/null 2>&1 \
      && ok "label $1 (updated)" || warn "label $1 failed"
  fi
}

say "labels — area (one per owning agent)"
label "area:design"  "C2185B" "Visual design, design canvas, theme tokens — design-lead"
label "area:db"      "0E8A16" "Schema, migrations, queries — db-engineer"
label "area:ui"      "1D76DB" "Screens, components, interactions — ui-engineer"
label "area:charts"  "5319E7" "Charts and data visualisation — charts-engineer"
label "area:sync"    "006B75" "Supabase, sync engine, auth — sync-engineer"
label "area:qa"      "FBCA04" "Test harness, factories, E2E — qa-engineer"
label "area:devops"  "B60205" "CI, builds, releases, repo config — release-engineer"

say "labels — type"
label "type:feat"    "0052CC" "New capability"
label "type:fix"     "D93F0B" "Bug fix"
label "type:test"    "BFD4F2" "Tests only"
label "type:chore"   "CFD3D7" "Maintenance, config, tooling"
label "type:docs"    "D4C5F9" "Documentation"

say "labels — state"
label "needs-user-review" "E99695" "Waiting on the client at a sprint checkpoint"
label "blocked"           "000000" "Blocked on another issue or a decision"
label "contract"          "FEF2C0" "Publishes a type contract other agents build against"

say "milestones"
for m in \
  "Sprint 0|Foundation, CI, project graph, and the design canvas — through Checkpoint 1" \
  "Sprint 1|Nutrition core: the Today screen and one-tap food logging" \
  "Sprint 2|Body metrics and the Charts tab" \
  "Sprint 3|Workouts: sessions, sets, and strength progress" \
  "Sprint 4|Cloud sync, auth, and data safety" \
  "Sprint 5|Standalone installable apps, export, and polish"
do
  title="${m%%|*}"; desc="${m#*|}"
  if gh api "repos/$REPO/milestones" -f title="$title" -f description="$desc" >/dev/null 2>&1; then
    ok "milestone $title"
  else
    ok "milestone $title (exists)"
  fi
done

printf '\n%s✓ repository metadata is in place%s\n' "$GRN" "$OFF"
