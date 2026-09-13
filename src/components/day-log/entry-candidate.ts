/**
 * `candidateForEntry` — the pure adapter behind issue #42's "tap a row to edit its amount": #21's
 * `<PortionSheet>` only knows how to log against a `Candidate`'s per-serving `kcal`/`protein`/
 * serving size, so editing derives that per-serving baseline from the row's own frozen totals
 * divided by its own `qty` — history is immutable (`CLAUDE.md`), so this reads only what was
 * actually logged, never the food's current catalogue values, which may have since changed.
 *
 * A meal's `itemCount` is display-only (`servingUnitLabel` in `PortionSheet.tsx`) and isn't a
 * column on `food_log`, so the caller passes the live `MealDetail` when it has one (a cheap,
 * on-demand `getMeal` at edit-open time, not a join `dayLog` carries for every row). `null` — the
 * meal itself was later deleted — falls back to a single item; it changes nothing about the
 * actual edit math, only that decorative label.
 */
import type { Candidate, DayLogEntry, MealDetail } from '../../db';

export function candidateForEntry(entry: DayLogEntry, meal: MealDetail | null): Candidate {
  const perServingKcal = entry.kcal / entry.qty;
  const perServingProtein = entry.protein / entry.qty;

  if (entry.mealId) {
    return {
      kind: 'meal',
      id: entry.mealId,
      name: entry.mealName ?? 'Meal',
      kcal: perServingKcal,
      protein: perServingProtein,
      itemCount: meal?.itemCount ?? 1,
      useCount: 0,
      lastUsedAt: null,
    };
  }

  return {
    kind: 'food',
    id: entry.foodId ?? entry.id,
    name: entry.foodName ?? 'Food',
    brand: entry.brand,
    servingLabel: entry.servingLabel ?? '1 serving',
    servingGrams: entry.grams === null ? null : entry.grams / entry.qty,
    kcal: perServingKcal,
    protein: perServingProtein,
    useCount: 0,
    lastUsedAt: null,
  };
}
