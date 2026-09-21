/**
 * `/foods/new` — issue #43's add-food screen. Behaviour only: saving a valid `<FoodForm>` calls
 * `createFood` with the entered fields and returns to the list; Cancel returns without writing
 * anything.
 */
import { fireEvent, render as testingLibraryRender, screen } from '@testing-library/react-native';
import React, { type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { createFood, type FoodRow } from '../../src/db';
import { layout, themes } from '../../src/theme/tokens';
import NewFoodScreen from './new';

// `<FoodForm>` now renders through `<FormFrame>` (issue #207), which calls `useSafeAreaInsets()` —
// a real `<SafeAreaProvider>` ancestor is required, not a mocked module (`FormFrame`'s own module
// doc). This shadows the `render` call inside `renderScreen` below with no further changes needed.
const metrics = { ...initialWindowMetrics, insets: { top: 0, left: 0, right: 0, bottom: 34 } } as typeof initialWindowMetrics;

function render(ui: ReactElement) {
  return testingLibraryRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
}

// This screen renders `<FoodForm>`, which drives its Custom reveal through
// `react-native-reanimated` (issue #191). Reanimated 4 loads `react-native-worklets`, which
// reaches for a native module at import time and throws under `jest-expo/ios` (qa-engineer's #45
// is the real fix) — `../../src/components/food-form/test-support/reanimated-mock` is the local
// stand-in `FoodForm.test.tsx` itself uses.
jest.mock('react-native-reanimated', () => jest.requireActual('../../src/components/food-form/test-support/reanimated-mock'));

jest.mock('../../src/db', () => ({
  ...jest.requireActual<typeof import('../../src/db')>('../../src/db'),
  createFood: jest.fn(),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  Stack: { Screen: () => null },
}));

const mockCreateFood = jest.mocked(createFood);

afterEach(() => {
  mockBack.mockClear();
});

const renderScreen = () =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <NewFoodScreen />
      </ThemeContext.Provider>
    </DbProvider>,
  );

describe('NewFoodScreen', () => {
  it('creates the food from the form and returns to the list', async () => {
    mockCreateFood.mockReturnValue({ id: 'food-1' } as FoodRow);
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Boiled eggs');
    await fireEvent.press(screen.getByTestId('food-form-kcal-increase'));
    await fireEvent.press(screen.getByTestId('food-form-protein-increase'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(mockCreateFood).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        food: expect.objectContaining({ name: 'Boiled eggs', servingLabel: '100 g', basis: 'weight', servingAmount: 100, kcalPer100: 1, proteinPer100: 0.1 }),
      }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // PR #220 review, B1.4 — the double-gutter fix this branch is named for. `<FormFrame>` (inside
  // `<FoodForm>`) owns the side gutter on both its body and its footer, so a `paddingHorizontal`
  // here would indent the form twice; and the footer owns the bottom inset (decision 13), so a
  // `paddingBottom` here would stack a second band under Save. Three source comments warn a future
  // author off exactly this — this is the test that stops them.
  it('adds no side gutter and no bottom pad of its own — the form frame owns both', async () => {
    await renderScreen();

    const screenStyle = StyleSheet.flatten(screen.getByTestId('new-food-screen').props.style) as {
      paddingHorizontal?: number;
      paddingBottom?: number;
      padding?: number;
    };
    expect(screenStyle.paddingHorizontal).toBeUndefined();
    expect(screenStyle.paddingBottom).toBeUndefined();
    expect(screenStyle.padding).toBeUndefined();

    // …and the one gutter that does apply is the frame's own, so "no gutter here" did not leave the
    // form flush against the edge.
    const body = screen.getByTestId('food-form-body');
    const bodyPadding = [body.props.contentContainerStyle].flat().reduce((acc, style) => ({ ...acc, ...style }), {}) as {
      paddingHorizontal?: number;
    };
    expect(bodyPadding.paddingHorizontal).toBe(layout.gutter);
  });

  it('cancelling writes nothing and returns', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('food-form-cancel'));

    expect(mockCreateFood).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
