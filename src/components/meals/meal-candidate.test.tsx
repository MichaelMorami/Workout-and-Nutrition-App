import type { MealSummary } from '../../db';
import { candidateForMeal } from './meal-candidate';

describe('candidateForMeal', () => {
  it('adapts a MealSummary into a loggable MealCandidate', () => {
    const meal: MealSummary = { id: 'meal-1', name: 'Breakfast bowl', itemCount: 3, kcal: 420, protein: 30 };

    expect(candidateForMeal(meal)).toEqual({
      kind: 'meal',
      id: 'meal-1',
      name: 'Breakfast bowl',
      kcal: 420,
      protein: 30,
      itemCount: 3,
      useCount: 0,
      lastUsedAt: null,
    });
  });
});
