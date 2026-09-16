/**
 * `<PortionSheet>` — the long-press sheet (issue #21). Presets logs the instant a step is tapped;
 * Exact is the one mode with its own Log button (a drag must not commit on release by accident).
 * Behaviour only: what each control calls, not pixel layout.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import type { FoodCandidate, MealCandidate } from '../../db';
import { interaction, size, themes } from '../../theme/tokens';
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

/**
 * `PanResponder`'s `onResponderMove`/`onResponderRelease` read `event.touchHistory` (a sibling of
 * `nativeEvent`, not nested inside it) purely to gate duplicate dispatches and feed `gestureState` —
 * `SliderTrack` reads neither, only `event.nativeEvent.locationX`, so `numberActiveTouches: 0` (an
 * empty touch bank RN's own centroid maths tolerates) is enough to satisfy it without modelling a
 * real touch.
 */
const responderEvent = (locationX: number, timeStamp: number) => ({
  touchHistory: { indexOfSingleActiveTouch: 0, mostRecentTimeStamp: timeStamp, numberActiveTouches: 0, touchBank: [] },
  nativeEvent: { locationX },
});

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

  it('issue #92: Exact mode renders a thumb dot with a >=44pt hit area, positioned by the current value', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    expect(size.slider.thumbHit).toBeGreaterThanOrEqual(44);
    const track = screen.getByTestId('sheet-exact-track');
    expect(StyleSheet.flatten(track.props.style).minHeight).toBe(size.slider.thumbHit);

    await fireEvent(track, 'layout', { nativeEvent: { layout: { width: 400, height: 44, x: 0, y: 0 } } });
    const thumb = screen.getByTestId('sheet-exact-track-thumb');
    const leftBefore = StyleSheet.flatten(thumb.props.style).left as number;

    await fireEvent.press(screen.getByTestId('sheet-exact-nudge-up'));

    const leftAfter = StyleSheet.flatten(screen.getByTestId('sheet-exact-track-thumb').props.style).left as number;
    expect(leftAfter).toBeGreaterThan(leftBefore);
  });

  it('issue #92: the slider track is an accessible adjustable control', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    const track = screen.getByTestId('sheet-exact-track');
    expect(track.props.accessibilityRole).toBe('adjustable');
    expect(track.props.accessibilityLabel).toBeTruthy();
  });

  it('the + nudge increases the readout by sliderNudgeG', async () => {
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

  it('issue #92: the + nudge keeps increasing past the initial range — no hard cap', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    const initialRange = 170 * interaction.sliderMaxServings;
    const pressesPastInitialRange = Math.ceil(initialRange / interaction.sliderNudgeG) + 5;
    for (let i = 0; i < pressesPastInitialRange; i += 1) {
      await fireEvent.press(screen.getByTestId('sheet-exact-nudge-up'));
    }

    const expected = 170 + pressesPastInitialRange * interaction.sliderNudgeG;
    expect(expected).toBeGreaterThan(initialRange);
    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent(`${expected} g`);
  });

  it('issue #92: once the value has grown past the initial range, dragging to the far end of the track reaches the grown range, not the old max', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    const initialRange = 170 * interaction.sliderMaxServings;
    const pressesPastInitialRange = Math.ceil(initialRange / interaction.sliderNudgeG) + 5;
    for (let i = 0; i < pressesPastInitialRange; i += 1) {
      await fireEvent.press(screen.getByTestId('sheet-exact-nudge-up'));
    }

    const track = screen.getByTestId('sheet-exact-track');
    await fireEvent(track, 'layout', { nativeEvent: { layout: { width: 300, height: 44, x: 0, y: 0 } } });
    await fireEvent(track, 'responderMove', responderEvent(300, 1));

    // A drag to the far right always lands on the *current* range's ceiling. If touching the track
    // still reset the value to the old 680 g cap, this would read 680 g instead.
    const readoutText = screen.getByTestId('sheet-exact-readout').props.children as string;
    const grownValue = Number(readoutText.replace(/\D/g, ''));
    expect(grownValue).toBeGreaterThan(initialRange);
  });

  it('issue #92: a move sequence produces monotonically increasing values as the finger moves right, with no backward jump', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    const track = screen.getByTestId('sheet-exact-track');
    await fireEvent(track, 'layout', { nativeEvent: { layout: { width: 400, height: 44, x: 0, y: 0 } } });

    // `SliderTrack` reads `locationX` off this same outer view for the whole gesture — `trackFill`
    // and the thumb are both `pointerEvents="none"` precisely so neither can ever become the touch
    // target and shift `locationX` into a different child's frame mid-drag (the reported jump).
    // `fireEvent` dispatches straight to the element we name, so it cannot reproduce the native
    // hit-test itself; this asserts the handler's own mapping is a pure, monotonic function of
    // `locationX`, which is what that fix guarantees holds for every event RN ever delivers here.
    const readoutValue = (): number => Number((screen.getByTestId('sheet-exact-readout').props.children as string).replace(/\D/g, ''));

    const values: number[] = [];
    let timeStamp = 1;
    for (const locationX of [40, 90, 160, 250, 360]) {
      await fireEvent(track, 'responderMove', responderEvent(locationX, timeStamp));
      timeStamp += 1;
      values.push(readoutValue());
    }

    for (let i = 1; i < values.length; i += 1) {
      const previous = values[i - 1] ?? 0;
      const current = values[i] ?? 0;
      expect(current).toBeGreaterThanOrEqual(previous);
    }
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

  it('issue #42: initialMode="exact" with initialPortions opens straight into Exact, pre-filled at that amount', async () => {
    await renderSheet({ initialMode: 'exact', initialPortions: 2 });

    expect(screen.queryByTestId('sheet-step-1')).toBeNull();
    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent(`${170 * 2} g`);
  });

  it('issue #42: a meal edit pre-fills Exact with its current servings multiple', async () => {
    await renderSheet({ candidate: meal, initialMode: 'exact', initialPortions: 2.5 });

    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('×2.5');
  });

  it('resets to initialMode, not a hardcoded Presets, when a different candidate opens the sheet', async () => {
    const { rerender } = await renderSheet({ initialMode: 'exact', initialPortions: 1 });
    expect(screen.getByTestId('sheet-exact')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('sheet-mode-presets'));
    expect(screen.getByTestId('sheet-step-1')).toBeTruthy();

    await rerender(
      <PortionSheet
        candidate={meal}
        theme={themes.dark}
        onLog={jest.fn()}
        onClose={jest.fn()}
        initialMode="exact"
        initialPortions={1}
        testID="sheet"
      />,
    );

    expect(screen.getByTestId('sheet-exact')).toBeTruthy();
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

  it("presentation='overlay' draws the same sheet without a native Modal of its own — for use inside another Modal (issue #79)", async () => {
    const onClose = jest.fn();
    await renderSheet({ presentation: 'overlay', onClose });

    expect(screen.container.queryAll((node) => node.type === 'Modal')).toHaveLength(0);
    expect(screen.getByTestId('sheet-title')).toHaveTextContent('Greek yoghurt');

    await fireEvent.press(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
