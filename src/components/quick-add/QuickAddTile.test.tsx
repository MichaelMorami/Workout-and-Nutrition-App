/**
 * `<QuickAddTile>` — one tap logs, with haptic confirm, no dialog, no save button, no navigation.
 * The actual database write is the caller's job (`onLog`); this file asserts the tile's own
 * contract: what it shows, what it calls, and how long the "Logged" confirmation holds.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import type { ComponentProps } from 'react';
import type { FoodCandidate, MealCandidate } from '../../db';
import { interaction, themes } from '../../theme/tokens';
import { QuickAddTile } from './QuickAddTile';

jest.mock('react-native-reanimated', () => jest.requireActual('./test-support/reanimated-mock'));
jest.mock('expo-haptics', () => {
  const actual = jest.requireActual<typeof import('expo-haptics')>('expo-haptics');
  return { ...actual, impactAsync: jest.fn<typeof actual.impactAsync>().mockResolvedValue(undefined) };
});

const mockImpact = jest.mocked(Haptics.impactAsync);

const food: FoodCandidate = {
  kind: 'food',
  id: 'food-1',
  name: 'Greek yoghurt',
  brand: null,
  servingLabel: '1 pot',
  servingGrams: 170,
  kcal: 120,
  protein: 20,
  useCount: 4,
  lastUsedAt: null,
};

const meal: MealCandidate = {
  kind: 'meal',
  id: 'meal-1',
  name: 'Post-workout shake',
  kcal: 410,
  protein: 38,
  itemCount: 3,
  useCount: 2,
  lastUsedAt: null,
};

const renderTile = (props: Partial<ComponentProps<typeof QuickAddTile>> = {}) =>
  render(<QuickAddTile candidate={food} onLog={jest.fn()} theme={themes.dark} testID="tile" {...props} />);

describe('QuickAddTile', () => {
  it('renders the name, kcal and protein figures, and the serving label', async () => {
    await renderTile();
    expect(screen.getByTestId('tile-name')).toHaveTextContent('Greek yoghurt');
    expect(screen.getByTestId('tile-kcal')).toHaveTextContent('120');
    expect(screen.getByTestId('tile-protein')).toHaveTextContent('20');
    expect(screen.getByTestId('tile-serving')).toHaveTextContent('1 pot');
    expect(screen.queryByTestId('tile-meal-icon')).toBeNull();
  });

  it('shows the meal glyph and item count for a saved meal', async () => {
    await renderTile({ candidate: meal });
    expect(screen.getByTestId('tile-meal-icon')).toBeTruthy();
    expect(screen.getByTestId('tile-serving')).toHaveTextContent('3 items');
  });

  it('has an accessibility label naming the food and its nutrition, and a real button role', async () => {
    await renderTile();
    const tile = screen.getByTestId('tile');
    expect(tile.props.accessibilityRole).toBe('button');
    expect(tile.props.accessibilityLabel).toContain('Greek yoghurt');
    expect(tile.props.accessibilityLabel).toContain('120');
    expect(tile.props.accessibilityLabel).toContain('20');
  });

  it('meets the 44pt minimum touch target', async () => {
    await renderTile();
    const tile = screen.getByTestId('tile');
    const flatStyle = Array.isArray(tile.props.style) ? Object.assign({}, ...tile.props.style) : tile.props.style;
    expect(flatStyle.height).toBeGreaterThanOrEqual(44);
  });

  it('tapping logs the candidate exactly once, with a haptic', async () => {
    const onLog = jest.fn();
    await renderTile({ onLog });

    await fireEvent.press(screen.getByTestId('tile'));

    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalledWith(food);
    expect(mockImpact).toHaveBeenCalledTimes(1);
  });

  it('shows no dialog, no save button — the tile switches straight to its Logged state', async () => {
    await renderTile();
    await fireEvent.press(screen.getByTestId('tile'));
    expect(screen.getByTestId('tile-logged')).toHaveTextContent('Logged', { exact: false });
    expect(screen.queryByTestId('tile-kcal')).toBeNull();
  });

  it('reverts to the resting figures after the logged hold, and can be tapped again', async () => {
    const onLog = jest.fn();
    await renderTile({ onLog });

    await fireEvent.press(screen.getByTestId('tile'));
    expect(screen.getByTestId('tile-logged')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(interaction.tileLoggedHoldMs);
    });

    expect(screen.queryByTestId('tile-logged')).toBeNull();
    expect(screen.getByTestId('tile-kcal')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tile'));
    expect(onLog).toHaveBeenCalledTimes(2);
  });

  it('ignores a second tap while the Logged state is still holding', async () => {
    const onLog = jest.fn();
    await renderTile({ onLog });

    await fireEvent.press(screen.getByTestId('tile'));
    await fireEvent.press(screen.getByTestId('tile'));
    await fireEvent.press(screen.getByTestId('tile'));

    expect(onLog).toHaveBeenCalledTimes(1);
  });
});
