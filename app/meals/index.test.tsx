/**
 * `/meals` — issue #101's saved-meals management screen. Behaviour only: it renders `listMeals`,
 * tapping a meal navigates to `/meals/[id]` to edit it (the #101 ruling — tap no longer logs here),
 * "+ New meal" navigates to `/meals/new`, and it refetches `listMeals` on every focus. Swipe-to-
 * delete and its undo toast are `<MealList>`'s own behaviour, covered in `MealList.test.tsx`; this
 * screen only proves `<UndoToast>` is mounted so that delete's undo is reachable here.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { listMeals, type MealSummary } from '../../src/db';
import { themes } from '../../src/theme/tokens';
import MealsScreen from './index';

jest.mock('react-native-reanimated', () => jest.requireActual('../../src/components/today/test-support/reanimated-mock'));
jest.mock('../../src/db', () => ({
  ...jest.requireActual<typeof import('../../src/db')>('../../src/db'),
  listMeals: jest.fn(),
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
      }, []);
    },
  };
});

const mockListMeals = jest.mocked(listMeals);

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

  it('tapping a meal navigates to its edit screen', async () => {
    mockListMeals.mockReturnValue([breakfast]);
    await renderScreen();

    await fireEvent.press(screen.getByTestId('meals-screen-list-row-meal-1'));

    expect(mockPush).toHaveBeenCalledWith('/meals/meal-1');
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
