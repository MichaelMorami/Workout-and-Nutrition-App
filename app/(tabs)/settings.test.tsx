/**
 * The Settings tab — issue #43's entry point for the food catalogue and saved meals, per
 * `<MealList>`'s own module note ("via Settings, not the Today screen's main loop"), plus issue
 * #44's "TARGETS" group above it (`<TargetsGroup>` carries its own behavioural tests — this file
 * only checks the screen renders it and that the two groups do not collide). Behaviour only:
 * tapping "Foods" navigates to `/foods`, tapping "Meals" navigates to `/meals`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { getSettings, type SettingsView } from '../../src/db';
import { themes } from '../../src/theme/tokens';
import SettingsScreen from './settings';

jest.mock('../../src/db', () => ({
  ...jest.requireActual<typeof import('../../src/db')>('../../src/db'),
  getSettings: jest.fn(),
}));

const mockGetSettings = jest.mocked(getSettings);

const DEFAULT_VIEW: SettingsView = { kcalTarget: 2000, proteinTarget: 150, weekStart: 1, isDefault: true };

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockGetSettings.mockReturnValue(DEFAULT_VIEW);
});

afterEach(() => {
  mockPush.mockClear();
  mockGetSettings.mockReset();
});

const renderScreen = () =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <SettingsScreen />
      </ThemeContext.Provider>
    </DbProvider>,
  );

describe('SettingsScreen', () => {
  it('renders the Targets group above the Library group', async () => {
    await renderScreen();

    expect(screen.getByTestId('settings-targets')).toBeTruthy();
    expect(screen.getByTestId('settings-foods')).toBeTruthy();
  });

  it('tapping Foods navigates to the food catalogue', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('settings-foods'));

    expect(mockPush).toHaveBeenCalledWith('/foods');
  });

  it('tapping Meals navigates to saved meals', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('settings-meals'));

    expect(mockPush).toHaveBeenCalledWith('/meals');
  });

  it('every row is an accessible, labelled button with a real target', async () => {
    await renderScreen();

    const foods = screen.getByTestId('settings-foods');
    expect(foods.props.accessibilityRole).toBe('button');
    expect(foods.props.accessibilityLabel).toBe('Foods');

    const meals = screen.getByTestId('settings-meals');
    expect(meals.props.accessibilityRole).toBe('button');
    expect(meals.props.accessibilityLabel).toBe('Meals');
  });
});
