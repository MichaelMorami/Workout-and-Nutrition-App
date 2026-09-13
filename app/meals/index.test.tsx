/**
 * `/meals` — issue #43's saved-meals screen. Behaviour only: it renders `listMeals`, tapping a
 * meal logs it in one tap (`<MealList>`'s own doctrine, unchanged here) with the shared
 * `<UndoToast>` mounted so that tap's undo is reachable from this screen, "+ New meal" navigates to
 * `/meals/new`, and it refetches `listMeals` on every focus.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { listMeals, logMeal, type MealSummary } from '../../src/db';
import { themes } from '../../src/theme/tokens';
import MealsScreen from './index';

jest.mock('react-native-reanimated', () => jest.requireActual('../../src/components/today/test-support/reanimated-mock'));
jest.mock('../../src/db', () => ({
  ...jest.requireActual<typeof import('../../src/db')>('../../src/db'),
  listMeals: jest.fn(),
  logMeal: jest.fn(),
}));

const mockPush = jest.fn();
let focusCallback: (() => void) | undefined;
jest.mock('expo-router', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (cb: () => void) => {
      focusCallback = cb;
      react.useEffect(() => {
        cb();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
  };
});

const mockListMeals = jest.mocked(listMeals);
const mockLogMeal = jest.mocked(logMeal);

const breakfast: MealSummary = { id: 'meal-1', name: 'Breakfast bowl', itemCount: 3, kcal: 420, protein: 30 };

afterEach(() => {
  mockPush.mockClear();
  focusCallback = undefined;
});

const renderScreen = () =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <MealsScreen />
      </ThemeContext.Provider>
    </DbProvider>,
  );

describe('MealsScreen', () => {
  it('renders every saved meal from listMeals', async () => {
    mockListMeals.mockReturnValue([breakfast]);
    await renderScreen();

    expect(screen.getByTestId('meals-screen-list-row-meal-1-name')).toHaveTextContent('Breakfast bowl');
  });

  it('tapping a meal logs it via logMeal and shows the undo toast', async () => {
    mockListMeals.mockReturnValue([breakfast]);
    mockLogMeal.mockReturnValue({
      target: { kind: 'meal', id: 'meal-1' },
      entries: [],
      portions: 1,
      undo: { kind: 'unlog', logIds: ['log-1'] },
    });
    await renderScreen();

    await fireEvent.press(screen.getByTestId('meals-screen-list-row-meal-1'));

    expect(mockLogMeal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mealId: 'meal-1' }));
    expect(screen.getByTestId('meals-screen-undo-toast')).toBeTruthy();
  });

  it('"+ New meal" navigates to the new-meal screen', async () => {
    mockListMeals.mockReturnValue([]);
    await renderScreen();

    await fireEvent.press(screen.getByTestId('meals-screen-list-add'));

    expect(mockPush).toHaveBeenCalledWith('/meals/new');
  });

  it('refetches the list when the screen regains focus', async () => {
    mockListMeals.mockReturnValue([breakfast]);
    await renderScreen();
    const callsAfterMount = mockListMeals.mock.calls.length;

    mockListMeals.mockReturnValue([]);
    await act(async () => {
      focusCallback?.();
    });

    expect(mockListMeals.mock.calls.length).toBe(callsAfterMount + 1);
    expect(screen.getByTestId('meals-screen-list-empty')).toBeTruthy();
  });
});
