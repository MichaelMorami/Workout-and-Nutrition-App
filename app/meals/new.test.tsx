/**
 * `/meals/new` — issue #43's "saved meals: create from foods". Issue #98: `<MealForm>` searches the
 * live food library (`searchFoodsOnly`) instead of listing it whole; `listFoods` here only decides
 * whether the empty state shows. Saving calls `createMeal` with the entered name and items, then
 * returns to `/meals`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { createMeal, listFoods, searchFoodsOnly, type FoodCandidate, type FoodRow, type MealDetail } from '../../src/db';
import { themes } from '../../src/theme/tokens';
import NewMealScreen from './new';

// This screen renders `<MealForm>`, which imports `Stepper` from the `food-form` barrel — that
// barrel also re-exports `<FoodForm>`, which now drives its Custom reveal through
// `react-native-reanimated` (issue #191). Reanimated 4 loads `react-native-worklets`, which reaches
// for a native module at import time and throws under `jest-expo/ios` (qa-engineer's #45 is the
// real fix) — `../../src/components/food-form/test-support/reanimated-mock` is the local stand-in
// `FoodForm.test.tsx` itself uses.
jest.mock('react-native-reanimated', () => jest.requireActual('../../src/components/food-form/test-support/reanimated-mock'));

jest.mock('../../src/db', () => ({
  ...jest.requireActual<typeof import('../../src/db')>('../../src/db'),
  listFoods: jest.fn(),
  searchFoodsOnly: jest.fn(),
  createMeal: jest.fn(),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  Stack: { Screen: () => null },
}));

const mockListFoods = jest.mocked(listFoods);
const mockSearch = jest.mocked(searchFoodsOnly);
const mockCreateMeal = jest.mocked(createMeal);

const yoghurt: FoodCandidate = {
  kind: 'food',
  id: 'food-1',
  name: 'Greek yoghurt',
  brand: null,
  servingLabel: '1 pot',
  basis: 'weight',
  servingAmount: 170,
  servingGrams: 170,
  servingMl: null,
  kcal: 120,
  protein: 20,
  useCount: 0,
  lastUsedAt: null,
};

afterEach(() => {
  mockBack.mockClear();
  mockListFoods.mockReset();
  mockSearch.mockReset();
});

const renderScreen = () =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <NewMealScreen />
      </ThemeContext.Provider>
    </DbProvider>,
  );

describe('NewMealScreen', () => {
  it('searching, adding a match, and saving creates the meal and returns to the list', async () => {
    mockListFoods.mockReturnValue([{ id: 'food-1' } as FoodRow]);
    mockSearch.mockReturnValue([yoghurt]);
    mockCreateMeal.mockReturnValue({ id: 'meal-1' } as MealDetail);
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId('meal-form-search'), 'yog');
    await fireEvent.press(screen.getByTestId('meal-form-match-food-1'));
    await fireEvent.changeText(screen.getByTestId('meal-form-name'), 'Breakfast bowl');
    await fireEvent.press(screen.getByTestId('meal-form-save'));

    expect(mockCreateMeal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Breakfast bowl', items: [{ foodId: 'food-1', qty: 1 }] }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('cancelling writes nothing and returns', async () => {
    mockListFoods.mockReturnValue([{ id: 'food-1' } as FoodRow]);
    await renderScreen();

    await fireEvent.press(screen.getByTestId('meal-form-cancel'));

    expect(mockCreateMeal).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the teaching empty state with no foods yet to build a meal from', async () => {
    mockListFoods.mockReturnValue([]);
    await renderScreen();

    expect(screen.getByTestId('meal-form-empty')).toBeTruthy();
  });
});
