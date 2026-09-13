/**
 * `candidateForEntry` — the pure adapter that lets issue #42's row-edit flow reuse #21's
 * `<PortionSheet>`, which only knows how to log against a `Candidate`'s per-serving figures.
 */
import type { DayLogEntry, MealDetail } from '../../db';
import { candidateForEntry } from './entry-candidate';

const foodEntry: DayLogEntry = {
  id: 'log-1',
  updatedAt: 0,
  deleted: 0,
  loggedAt: 0,
  localDate: '2025-03-10',
  localMinute: 480,
  foodId: 'food-1',
  mealId: null,
  qty: 2,
  grams: 340,
  kcal: 240,
  protein: 40,
  slot: 'breakfast',
  foodName: 'Greek yoghurt',
  brand: 'Fage',
  servingLabel: '1 pot',
  mealName: null,
};

const mealEntry: DayLogEntry = {
  id: 'log-2',
  updatedAt: 0,
  deleted: 0,
  loggedAt: 0,
  localDate: '2025-03-10',
  localMinute: 500,
  foodId: null,
  mealId: 'meal-1',
  qty: 1.5,
  grams: null,
  kcal: 615,
  protein: 57,
  slot: 'lunch',
  foodName: null,
  brand: null,
  servingLabel: null,
  mealName: 'Post-workout shake',
};

const mealDetail: MealDetail = {
  id: 'meal-1',
  name: 'Post-workout shake',
  itemCount: 3,
  kcal: 410,
  protein: 38,
  items: [],
};

describe('candidateForEntry', () => {
  it('derives a food candidate at the entry\'s own per-serving figures, not the catalogue\'s current ones', () => {
    const candidate = candidateForEntry(foodEntry, null);

    expect(candidate).toMatchObject({
      kind: 'food',
      id: 'food-1',
      name: 'Greek yoghurt',
      brand: 'Fage',
      servingLabel: '1 pot',
      servingGrams: 170, // 340g / qty 2
      kcal: 120, // 240 kcal / qty 2
      protein: 20, // 40g / qty 2
    });
  });

  it('a food with no grams (servings-only) carries servingGrams: null through', () => {
    const candidate = candidateForEntry({ ...foodEntry, grams: null }, null);
    expect(candidate.kind).toBe('food');
    expect((candidate as { servingGrams: number | null }).servingGrams).toBeNull();
  });

  it('derives a meal candidate at its per-portion figures, using the live itemCount when available', () => {
    const candidate = candidateForEntry(mealEntry, mealDetail);

    expect(candidate).toMatchObject({
      kind: 'meal',
      id: 'meal-1',
      name: 'Post-workout shake',
      itemCount: 3,
      kcal: 410, // 615 / 1.5
      protein: 38, // 57 / 1.5
    });
  });

  it('falls back to a single item when the meal itself is gone from the catalogue', () => {
    const candidate = candidateForEntry(mealEntry, null);
    expect(candidate).toMatchObject({ kind: 'meal', itemCount: 1 });
  });

  it('falls back to an honest placeholder name when the food/meal name is missing', () => {
    const candidate = candidateForEntry({ ...foodEntry, foodName: null }, null);
    expect(candidate.name).toBeTruthy();
  });
});
