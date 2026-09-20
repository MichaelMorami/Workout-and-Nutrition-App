/**
 * `/meals/[id]` — issue #101's edit-meal screen. Two things matter:
 *
 *   - `<MealForm initial={...}>` pre-fills at exactly what the meal currently holds, and Save
 *     patches it via `updateMeal`.
 *   - **Editing a meal never changes a past log entry** (`CLAUDE.md`'s immutability rule, `food_log`
 *     stores `kcal`/`protein` directly). This is a real-database test, not a mocked one — `makeTestDb`
 *     runs the same schema and migrations the phone runs, so it proves the screen's own save path
 *     (not just `updateMeal` in isolation, already covered by `src/db/queries/catalog.test.ts`)
 *     leaves an already-logged entry's stored figures untouched.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';
import React from 'react';
import { makeTestDb } from '../../test/db';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { createFood, createMeal, logMeal } from '../../src/db';
import * as schema from '../../src/db/schema';
import { themes } from '../../src/theme/tokens';
import EditMealScreen from './[id]';

// This screen renders `<MealForm>`, which imports `Stepper` from the `food-form` barrel — that
// barrel also re-exports `<FoodForm>`, which now drives its Custom reveal through
// `react-native-reanimated` (issue #191). Reanimated 4 loads `react-native-worklets`, which reaches
// for a native module at import time and throws under `jest-expo/ios` (qa-engineer's #45 is the
// real fix) — `../../src/components/food-form/test-support/reanimated-mock` is the local stand-in
// `FoodForm.test.tsx` itself uses.
jest.mock('react-native-reanimated', () => jest.requireActual('../../src/components/food-form/test-support/reanimated-mock'));

const mockBack = jest.fn();
let mockParams: { id: string } = { id: '' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));

// `src/db/ids.ts` calls `expo-crypto`'s `randomUUID()` — real on device, but this test project's
// native mocks (`jest-expo/ios`) have no implementation for it, so every insert through `createFood`
// / `createMeal` / `logMeal` would otherwise fail on a null id. A deterministic counter is all a test
// needs, the same fixture `app/foods/[id].test.tsx` uses.
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => {
    mockUuidCounter += 1;
    return `00000000-0000-4000-8000-00000000000${mockUuidCounter}`;
  },
}));

afterEach(() => {
  mockBack.mockClear();
});

function setup() {
  const { db } = makeTestDb({ schema });
  const yoghurt = createFood(db, {
    at: 1_000,
    food: { name: 'Greek yoghurt', brand: 'Fage', servingLabel: '1 pot', basis: 'weight', servingAmount: 170, kcalPer100: (120 * 100) / 170, proteinPer100: (20 * 100) / 170 },
  });
  const granola = createFood(db, {
    at: 1_000,
    food: { name: 'Granola', brand: null, servingLabel: '50 g', basis: 'weight', servingAmount: 50, kcalPer100: 400, proteinPer100: 10 },
  });
  const meal = createMeal(db, { at: 1_000, name: 'Breakfast bowl', items: [{ foodId: yoghurt.id, qty: 1 }] });
  return { db, meal, yoghurt, granola };
}

const renderScreen = (db: ReturnType<typeof setup>['db']) =>
  render(
    <DbProvider db={db as never}>
      <ThemeContext.Provider value={themes.dark}>
        <EditMealScreen />
      </ThemeContext.Provider>
    </DbProvider>,
  );

describe('EditMealScreen', () => {
  it('pre-fills the form from the existing meal', async () => {
    const { db, meal, yoghurt } = setup();
    mockParams = { id: meal.id };
    await renderScreen(db);

    expect(screen.getByTestId('meal-form-name').props.value).toBe('Breakfast bowl');
    expect(screen.getByTestId(`meal-form-item-${yoghurt.id}`)).toBeTruthy();
    expect(screen.getByTestId(`meal-form-item-${yoghurt.id}-value`)).toHaveTextContent('1');
  });

  it('saving renames the meal, replaces its items, and returns to the list', async () => {
    const { db, meal, yoghurt, granola } = setup();
    mockParams = { id: meal.id };
    await renderScreen(db);

    await fireEvent.changeText(screen.getByTestId('meal-form-name'), 'Breakfast bowl v2');
    await fireEvent.press(screen.getByTestId(`meal-form-item-${yoghurt.id}-remove`));
    await fireEvent.changeText(screen.getByTestId('meal-form-search'), 'gran');
    await fireEvent.press(screen.getByTestId(`meal-form-match-${granola.id}`));
    await fireEvent.press(screen.getByTestId('meal-form-save'));

    const updated = db.select().from(schema.meals).where(eq(schema.meals.id, meal.id)).get();
    expect(updated?.name).toBe('Breakfast bowl v2');
    const liveItems = db
      .select()
      .from(schema.mealItems)
      .where(eq(schema.mealItems.mealId, meal.id))
      .all()
      .filter((row) => row.deleted === 0);
    expect(liveItems).toHaveLength(1);
    expect(liveItems[0]?.foodId).toBe(granola.id);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('editing a meal does not change a past log entry — history is immutable', async () => {
    const { db, meal } = setup();
    const receipt = logMeal(db, { at: 2_000, timeZone: 'America/Los_Angeles', mealId: meal.id });
    const loggedEntry = receipt.entries[0]!;

    mockParams = { id: meal.id };
    await renderScreen(db);

    await fireEvent.changeText(screen.getByTestId('meal-form-name'), 'Renamed bowl');
    await fireEvent.press(screen.getByTestId('meal-form-save'));

    const logRow = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, loggedEntry.id)).get();
    expect(logRow).toMatchObject({ kcal: loggedEntry.kcal, protein: loggedEntry.protein });
  });

  it('shows a not-found state for an id with no matching meal', async () => {
    const { db } = setup();
    mockParams = { id: 'no-such-meal' };
    await renderScreen(db);

    expect(screen.getByTestId('meal-form-not-found')).toBeTruthy();
  });
});
