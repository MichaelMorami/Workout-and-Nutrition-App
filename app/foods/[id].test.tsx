/**
 * `/foods/[id]` — issue #43's edit-food screen. Two things matter:
 *
 *   - `<FoodForm>` pre-fills at exactly what the food currently holds, and Save patches it via
 *     `updateFood`.
 *   - **Editing a food never changes a past log entry** (`CLAUDE.md`'s immutability rule,
 *     `food_log` stores `kcal`/`protein` directly). This is a real-database test, not a mocked
 *     one — `makeTestDb` runs the same schema and migrations the phone runs, so it proves the
 *     screen's own save path (not just `updateFood` in isolation, already covered by
 *     `src/db/queries/catalog.test.ts`) leaves an already-logged entry's stored figures untouched.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';
import React from 'react';
import { makeTestDb } from '../../test/db';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { createFood, logFood } from '../../src/db';
import * as schema from '../../src/db/schema';
import { themes } from '../../src/theme/tokens';
import EditFoodScreen from './[id]';

// This screen renders `<FoodForm>`, which drives its Custom reveal through
// `react-native-reanimated` (issue #191). Reanimated 4 loads `react-native-worklets`, which
// reaches for a native module at import time and throws under `jest-expo/ios` (qa-engineer's #45
// is the real fix) — `../../src/components/food-form/test-support/reanimated-mock` is the local
// stand-in `FoodForm.test.tsx` itself uses.
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
// / `logFood` would otherwise fail on a null id. A deterministic counter is all a test needs.
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
  const food = createFood(db, {
    at: 1_000,
    // 100 g so per-100 and per-serving read the same numbers — keeps this fixture's figures the
    // ones the original per-serving test was written against (issue #86).
    food: { name: 'Skyr', brand: null, servingLabel: '100 g', basis: 'weight', servingAmount: 100, kcalPer100: 100, proteinPer100: 10 },
  });
  return { db, food };
}

const renderScreen = (db: ReturnType<typeof setup>['db']) =>
  render(
    <DbProvider db={db as never}>
      <ThemeContext.Provider value={themes.dark}>
        <EditFoodScreen />
      </ThemeContext.Provider>
    </DbProvider>,
  );

describe('EditFoodScreen', () => {
  it('pre-fills the form from the existing food', async () => {
    const { db, food } = setup();
    mockParams = { id: food.id };
    await renderScreen(db);

    expect(screen.getByTestId('food-form-name').props.value).toBe('Skyr');
    expect(screen.getByTestId('food-form-kcal-value')).toHaveTextContent('100');
  });

  it('saving patches the food and returns to the list', async () => {
    const { db, food } = setup();
    mockParams = { id: food.id };
    await renderScreen(db);

    await fireEvent.press(screen.getByTestId('food-form-kcal-increase'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    const updated = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(updated?.kcalPer100).toBe(101);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('editing a food does not change a past log entry — history is immutable', async () => {
    const { db, food } = setup();
    const receipt = logFood(db, { at: 2_000, timeZone: 'America/Los_Angeles', foodId: food.id });
    const loggedEntry = receipt.entries[0]!;

    mockParams = { id: food.id };
    await renderScreen(db);

    // Push the kcal and protein steppers well away from what was logged.
    for (let i = 0; i < 20; i += 1) {
      await fireEvent.press(screen.getByTestId('food-form-kcal-increase'));
      await fireEvent.press(screen.getByTestId('food-form-protein-increase'));
    }
    await fireEvent.press(screen.getByTestId('food-form-save'));

    const updatedFood = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(updatedFood?.kcalPer100).not.toBe(loggedEntry.kcal);

    const logRow = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, loggedEntry.id)).get();
    expect(logRow).toMatchObject({ kcal: loggedEntry.kcal, protein: loggedEntry.protein });
    expect(logRow?.kcal).toBe(100);
    expect(logRow?.protein).toBe(10);
  });

  it('shows a not-found state for an id with no matching food', async () => {
    const { db } = setup();
    mockParams = { id: 'no-such-food' };
    await renderScreen(db);

    expect(screen.getByTestId('food-form-not-found')).toBeTruthy();
  });
});
