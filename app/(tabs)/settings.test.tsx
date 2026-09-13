/**
 * The Settings tab — issue #43's entry point for the food catalogue and saved meals, per
 * `<MealList>`'s own module note ("via Settings, not the Today screen's main loop"). Behaviour
 * only: tapping "Foods" navigates to `/foods`, tapping "Meals" navigates to `/meals`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { themes } from '../../src/theme/tokens';
import SettingsScreen from './settings';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

afterEach(() => {
  mockPush.mockClear();
});

const renderScreen = () =>
  render(
    <ThemeContext.Provider value={themes.dark}>
      <SettingsScreen />
    </ThemeContext.Provider>,
  );

describe('SettingsScreen', () => {
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
