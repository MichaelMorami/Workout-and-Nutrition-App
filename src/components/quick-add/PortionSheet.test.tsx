/**
 * `<PortionSheet>` — the long-press sheet (issue #21). Presets logs the instant a step is tapped;
 * Exact is the one mode with its own Log button (a drag must not commit on release by accident).
 * Behaviour only: what each control calls, not pixel layout.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import type { FoodCandidate, MealCandidate } from '../../db';
import { interaction, themes } from '../../theme/tokens';
import { PortionSheet } from './PortionSheet';

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

const renderSheet = (props: Partial<ComponentProps<typeof PortionSheet>> = {}) =>
  render(<PortionSheet candidate={food} theme={themes.dark} onLog={jest.fn()} onClose={jest.fn()} testID="sheet" {...props} />);

describe('PortionSheet', () => {
  it('renders nothing when candidate is null', async () => {
    await renderSheet({ candidate: null });
    expect(screen.queryByTestId('sheet')).toBeNull();
  });

  it('shows the food name and its per-serving figures', async () => {
    await renderSheet();
    expect(screen.getByTestId('sheet-title')).toHaveTextContent('Greek yoghurt');
  });

  it('renders five preset steps, the usual (×1) one visually marked', async () => {
    await renderSheet();
    expect(screen.getByTestId('sheet-step-0.5')).toHaveTextContent('60 kcal', { exact: false });
    expect(screen.getByTestId('sheet-step-1')).toHaveTextContent('120 kcal', { exact: false });
    expect(screen.getByTestId('sheet-step-1.5')).toHaveTextContent('180 kcal', { exact: false });
    expect(screen.getByTestId('sheet-step-2')).toHaveTextContent('240 kcal', { exact: false });
    expect(screen.getByTestId('sheet-step-3')).toHaveTextContent('360 kcal', { exact: false });
  });

  it('tapping a preset step logs that multiple and closes the sheet', async () => {
    const onLog = jest.fn();
    const onClose = jest.fn();
    await renderSheet({ onLog, onClose });

    await fireEvent.press(screen.getByTestId('sheet-step-2'));

    expect(onLog).toHaveBeenCalledWith(food, 2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('tapping the scrim closes the sheet without logging', async () => {
    const onLog = jest.fn();
    const onClose = jest.fn();
    await renderSheet({ onLog, onClose });

    await fireEvent.press(screen.getByTestId('sheet-scrim'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onLog).not.toHaveBeenCalled();
  });

  it('switching to Exact mode shows the slider control instead of the preset steps', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    expect(screen.queryByTestId('sheet-step-1')).toBeNull();
    expect(screen.getByTestId('sheet-exact')).toBeTruthy();
  });

  it('Exact mode for a food starts its readout at the serving size in grams', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('170 g');
  });

  it('the + nudge increases the readout by sliderNudgeG, clamped to the max', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    await fireEvent.press(screen.getByTestId('sheet-exact-nudge-up'));

    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent(`${170 + interaction.sliderNudgeG} g`);
  });

  it('the − nudge decreases the readout, never below zero', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    for (let i = 0; i < 40; i += 1) {
      await fireEvent.press(screen.getByTestId('sheet-exact-nudge-down'));
    }

    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('0 g');
  });

  it('the nudge cannot push the amount above sliderMaxServings worth of grams', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    const pressesToOverflow = Math.ceil((170 * interaction.sliderMaxServings) / interaction.sliderNudgeG) + 5;
    for (let i = 0; i < pressesToOverflow; i += 1) {
      await fireEvent.press(screen.getByTestId('sheet-exact-nudge-up'));
    }

    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent(`${170 * interaction.sliderMaxServings} g`);
  });

  it("Exact mode's Log button logs the grams converted back to a servings multiple, and closes", async () => {
    const onLog = jest.fn();
    const onClose = jest.fn();
    await renderSheet({ onLog, onClose });
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    await fireEvent.press(screen.getByTestId('sheet-exact-nudge-up'));
    await fireEvent.press(screen.getByTestId('sheet-exact-log'));

    expect(onLog).toHaveBeenCalledWith(food, (170 + interaction.sliderNudgeG) / 170);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('for a meal, Exact mode is a 0.5-servings stepper starting at ×1, no grams', async () => {
    await renderSheet({ candidate: meal });
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('×1');

    await fireEvent.press(screen.getByTestId('sheet-exact-nudge-up'));
    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('×1.5');
  });

  it("a meal's Exact Log button logs the servings multiple directly", async () => {
    const onLog = jest.fn();
    await renderSheet({ candidate: meal, onLog });
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
    await fireEvent.press(screen.getByTestId('sheet-exact-nudge-up'));

    await fireEvent.press(screen.getByTestId('sheet-exact-log'));

    expect(onLog).toHaveBeenCalledWith(meal, 1.5);
  });

  it('resets to Presets mode when a different candidate opens the sheet', async () => {
    const { rerender } = await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
    expect(screen.getByTestId('sheet-exact')).toBeTruthy();

    await rerender(<PortionSheet candidate={meal} theme={themes.dark} onLog={jest.fn()} onClose={jest.fn()} testID="sheet" />);

    expect(screen.queryByTestId('sheet-exact')).toBeNull();
    expect(screen.getByTestId('sheet-step-1')).toBeTruthy();
  });

  it('has accessibility roles and labels on every interactive control', async () => {
    await renderSheet();
    const step = screen.getByTestId('sheet-step-1');
    expect(step.props.accessibilityRole).toBe('button');
    expect(step.props.accessibilityLabel).toBeTruthy();

    const presetsOption = screen.getByTestId('sheet-mode-presets');
    expect(presetsOption.props.accessibilityRole).toBe('button');
    const exactOption = screen.getByTestId('sheet-mode-exact');
    expect(exactOption.props.accessibilityRole).toBe('button');

    const scrim = screen.getByTestId('sheet-scrim');
    expect(scrim.props.accessibilityRole).toBe('button');
    expect(scrim.props.accessibilityLabel).toBe('Close');
  });
});
