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
 *
 * `basis` isn't a `food_log` column (issue #86) — it's implied by which of the row's own `grams`/
 * `ml` is set, the same mutual-exclusion invariant `resolveAmount` writes by. A row with neither
 * (pre-#86 history, or a food logged by servings alone) has no canonical amount to derive a serving
 * from; it falls back to `basis: 'weight'` with a zero serving, same spirit as `servingGrams: null`
 * before it — display-only, and `PortionSheet`'s own Exact control already treats a null serving
 * as "no grams to slide".
 */
import type { Candidate, DayLogEntry, FoodBasis, MealDetail } from '../../db';

/** The candidate's `basis`/`servingAmount`/`servingGrams`/`servingMl` from whichever of the entry's
 * own `grams`/`ml` was actually logged — never the food's current catalogue value, which may have
 * since changed basis entirely. */
function servingOfEntry(entry: DayLogEntry): { basis: FoodBasis; servingAmount: number; servingGrams: number | null; servingMl: number | null } {
  if (entry.ml !== null) {
    const amount = entry.ml / entry.qty;
    return { basis: 'volume', servingAmount: amount, servingGrams: null, servingMl: amount };
  }
  if (entry.grams !== null) {
    const amount = entry.grams / entry.qty;
    return { basis: 'weight', servingAmount: amount, servingGrams: amount, servingMl: null };
  }
  return { basis: 'weight', servingAmount: 0, servingGrams: null, servingMl: null };
}

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
    ...servingOfEntry(entry),
    kcal: perServingKcal,
    protein: perServingProtein,
    useCount: 0,
    lastUsedAt: null,
  };
}
