/**
 * `candidateForMeal` — the pure adapter behind issue #43's "saved meals log as one tap". A
 * `MealSummary` (`listMeals`) has everything a log needs except the two `CandidateBase` fields
 * `logTracker`/`addPortion`'s repeat-window bookkeeping wants, which the saved-meals list has no use
 * for on its own (there is no ranking here) — `0`/`null` are honest placeholders, the same choice
 * `candidateForEntry` (`../day-log/entry-candidate.ts`) makes for the day log's own edit adapter.
 */
import type { MealCandidate, MealSummary } from '../../db';

export function candidateForMeal(meal: MealSummary): MealCandidate {
  return {
    kind: 'meal',
    id: meal.id,
    name: meal.name,
    kcal: meal.kcal,
    protein: meal.protein,
    itemCount: meal.itemCount,
    useCount: 0,
    lastUsedAt: null,
  };
}
