/**
 * Issue #164: `mealsContainingFood` and its `MealRef` type must be reachable from the `src/db`
 * barrel, matching how every sibling query and type is exported. PR #163 (issue #100) needed
 * both and landed a temporary deep import as a stopgap — this closes that gap.
 */
import { mealsContainingFood } from './index';
import type { MealRef } from './index';

describe('src/db barrel', () => {
  it('re-exports mealsContainingFood as a function', () => {
    expect(typeof mealsContainingFood).toBe('function');
  });

  it('re-exports the MealRef type (compiles when assigned)', () => {
    const ref: MealRef = { id: 'meal-1', name: 'Breakfast' };
    expect(ref.id).toBe('meal-1');
    expect(ref.name).toBe('Breakfast');
  });
});
