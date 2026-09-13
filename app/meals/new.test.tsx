/**
 * `/meals/new` — issue #43's "saved meals: create from foods". Behaviour only: `<MealForm>` lists
 * every live food (`listFoods`), and saving it calls `createMeal` with the entered name and items,
 * then returns to `/meals`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { createMeal, listFoods, type FoodRow, type MealDetail } from '../../src/db';
import { themes } from '../../src/theme/tokens';
import NewMealScreen from './new';

jest.mock('../../src/db', () => ({
  ...jest.requireActual<typeof import('../../src/db')>('../../src/db'),
  listFoods: jest.fn(),
  createMeal: jest.fn(),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  Stack: { Screen: () => null },
}));

const mockListFoods = jest.mocked(listFoods);
const mockCreateMeal = jest.mocked(createMeal);

const yoghurt: FoodRow = {
  id: 'food-1',
  updatedAt: 0,
  deleted: 0,
  name: 'Greek yoghurt',
  brand: null,
  servingLabel: '1 pot',
  servingGrams: 170,
  kcalPerServing: 120,
  proteinPerServing: 20,
  archived: 0,
  useCount: 0,
  lastUsedAt: null,
  hourHistogram: null,
  searchText: 'greek yoghurt',
};

afterEach(() => {
  mockBack.mockClear();
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
  it('builds the form from every live food', async () => {
    mockListFoods.mockReturnValue([yoghurt]);
    await renderScreen();

    expect(screen.getByTestId('meal-form-item-food-1-value')).toBeTruthy();
  });

  it('saving creates the meal and returns to the list', async () => {
    mockListFoods.mockReturnValue([yoghurt]);
    mockCreateMeal.mockReturnValue({ id: 'meal-1' } as MealDetail);
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId('meal-form-name'), 'Breakfast bowl');
    await fireEvent.press(screen.getByTestId('meal-form-item-food-1-increase'));
    await fireEvent.press(screen.getByTestId('meal-form-save'));

    expect(mockCreateMeal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Breakfast bowl', items: [{ foodId: 'food-1', qty: 0.5 }] }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('cancelling writes nothing and returns', async () => {
    mockListFoods.mockReturnValue([yoghurt]);
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
