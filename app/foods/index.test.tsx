/**
 * `/foods` — issue #43's food-management list, reached from Settings (`MealList`'s own module
 * note: "via Settings, not the Today screen's main loop" applies to the food list too). Behaviour
 * only: it renders `listFoods`, a tap navigates to `/foods/[id]` to edit, "+ Add food" navigates to
 * `/foods/new`, and it refetches on every focus so an edit made on either of those screens shows up
 * the moment this screen is back on top.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { listFoods, withServing, type FoodRow } from '../../src/db';
import { themes } from '../../src/theme/tokens';
import FoodsScreen from './index';

jest.mock('../../src/db', () => ({
  ...jest.requireActual<typeof import('../../src/db')>('../../src/db'),
  listFoods: jest.fn(),
}));

const mockPush = jest.fn();
let focusCallback: (() => void) | undefined;
jest.mock('expo-router', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush }),
    // A minimal stand-in for react-navigation's `useFocusEffect`: runs the callback once on
    // mount (real "focus on first appearance" behaviour) and exposes it so a test can call it
    // again to simulate a later refocus, without pulling in a full navigation container.
    useFocusEffect: (cb: () => void) => {
      focusCallback = cb;
      react.useEffect(() => {
        cb();
      }, []);
    },
  };
});

const mockListFoods = jest.mocked(listFoods);

const yoghurt: FoodRow = {
  id: 'food-1',
  updatedAt: 0,
  deleted: 0,
  name: 'Greek yoghurt',
  brand: 'Fage',
  servingLabel: '1 pot',
  archived: 0,
  useCount: 4,
  lastUsedAt: null,
  hourHistogram: null,
  searchText: 'greek yoghurt fage',
  ...withServing({ basis: 'weight', servingAmount: 170, kcalPer100: (120 * 100) / 170, proteinPer100: (20 * 100) / 170 }),
};

afterEach(() => {
  mockPush.mockClear();
  focusCallback = undefined;
});

const renderScreen = () =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <FoodsScreen />
      </ThemeContext.Provider>
    </DbProvider>,
  );

describe('FoodsScreen', () => {
  it('renders every food from listFoods', async () => {
    mockListFoods.mockReturnValue([yoghurt]);
    await renderScreen();

    expect(screen.getByTestId('foods-screen-list-row-food-1-name')).toHaveTextContent('Greek yoghurt');
  });

  it('tapping a food navigates to its edit screen', async () => {
    mockListFoods.mockReturnValue([yoghurt]);
    await renderScreen();

    await fireEvent.press(screen.getByTestId('foods-screen-list-row-food-1'));

    expect(mockPush).toHaveBeenCalledWith('/foods/food-1');
  });

  it('"+ Add food" navigates to the new-food screen', async () => {
    mockListFoods.mockReturnValue([]);
    await renderScreen();

    await fireEvent.press(screen.getByTestId('foods-screen-list-add'));

    expect(mockPush).toHaveBeenCalledWith('/foods/new');
  });

  it('refetches the list when the screen regains focus', async () => {
    mockListFoods.mockReturnValue([yoghurt]);
    await renderScreen();
    const callsAfterMount = mockListFoods.mock.calls.length;

    mockListFoods.mockReturnValue([]);
    await act(async () => {
      focusCallback?.();
    });

    expect(mockListFoods.mock.calls.length).toBe(callsAfterMount + 1);
    expect(screen.getByTestId('foods-screen-list-empty')).toBeTruthy();
  });

  it('shows the teaching empty state with no foods yet', async () => {
    mockListFoods.mockReturnValue([]);
    await renderScreen();

    expect(screen.getByTestId('foods-screen-list-empty')).toBeTruthy();
  });
});
