/**
 * `<PortionSheet>` — the long-press sheet (issue #21). Presets logs the instant a step is tapped;
 * Exact is the one mode with its own Log button (a drag must not commit on release by accident).
 * Behaviour only: what each control calls, not pixel layout.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import type { FoodCandidate, MealCandidate } from '../../db';
import { interaction, size, space, themes } from '../../theme/tokens';
import { PortionSheet, servingSteps } from './PortionSheet';

const food: FoodCandidate = {
  kind: 'food',
  id: 'food-1',
  name: 'Greek yoghurt',
  brand: null,
  servingLabel: '1 pot',
  basis: 'weight',
  servingAmount: 170,
  servingGrams: 170,
  servingMl: null,
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

  it('issue #90: the subtitle names the serving, "120 kcal · 20 g protein per 1 pot serving"', async () => {
    await renderSheet();
    expect(screen.getByTestId('sheet-subtitle')).toHaveTextContent('120 kcal · 20 g protein per 1 pot serving');
  });

  it('issue #90: a meal reads "per meal", not an item count', async () => {
    await renderSheet({ candidate: meal });
    expect(screen.getByTestId('sheet-subtitle')).toHaveTextContent('410 kcal · 38 g protein per meal');
  });

  it('issue #90: a serving label that already ends in "serving" is not doubled', async () => {
    await renderSheet({ candidate: { ...food, servingLabel: '1 serving' } });
    expect(screen.getByTestId('sheet-subtitle')).toHaveTextContent('120 kcal · 20 g protein per 1 serving');
    expect(screen.getByTestId('sheet-subtitle')).not.toHaveTextContent('serving serving');
  });

  it('issue #91: the section is labelled "Servings", not "Presets"', async () => {
    await renderSheet();
    const option = screen.getByTestId('sheet-mode-presets');
    expect(option).toHaveTextContent('Servings');
    expect(option.props.accessibilityLabel).toBe('Servings');
  });

  it('issue #91: servingSteps() returns half-servings from ½ to 8, for a food and a meal', async () => {
    expect(servingSteps(food)).toEqual([
      0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
    ]);
    expect(servingSteps(meal)).toEqual(servingSteps(food));
  });

  describe('issue #93: per-preset serving steps', () => {
    // "1 pot" (`food`, above) matches no `SERVING_PRESETS` row, so it falls to `custom` — the
    // ½-to-8 list above is the `custom` preset's own steps, not a generic default.
    const tbspFood: FoodCandidate = {
      ...food,
      servingLabel: '1 tbsp',
      basis: 'volume',
      servingAmount: 15,
      servingGrams: null,
      servingMl: 15,
    };
    const g100Food: FoodCandidate = {
      ...food,
      servingLabel: '100 g',
      basis: 'weight',
      servingAmount: 100,
      servingGrams: 100,
      servingMl: null,
    };

    it("a tbsp food's strip steps in quarters up to the tbsp preset's max (4)", () => {
      expect(servingSteps(tbspFood)).toEqual([
        0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4,
      ]);
      expect(interaction.servingSteps.tbsp).toEqual({ increment: 0.25, max: 4 });
    });

    it('a custom food (no matching preset) still steps in halves up to 8', () => {
      expect(servingSteps(food)).toEqual([
        0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
      ]);
    });

    it('fraction labels render as ¼ ½ ¾ 1 1¼ …', async () => {
      await renderSheet({ candidate: tbspFood });
      expect(screen.getByTestId('sheet-step-0.25')).toHaveTextContent('¼');
      expect(screen.getByTestId('sheet-step-0.5')).toHaveTextContent('½');
      expect(screen.getByTestId('sheet-step-0.75')).toHaveTextContent('¾');
      expect(screen.getByTestId('sheet-step-1')).toHaveTextContent('1');
      expect(screen.getByTestId('sheet-step-1.25')).toHaveTextContent('1¼');
    });

    it("the Exact slider's initial range opens at the preset's own max, not the old sliderMaxServings", async () => {
      await renderSheet({ candidate: g100Food });
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

      const track = screen.getByTestId('sheet-exact-track');
      // 100 g serving × the `100g` preset's max (5) = 500 — not 100 × the old flat `sliderMaxServings` (4) = 400.
      expect(track.props.accessibilityValue.max).toBe(100 * interaction.servingSteps['100g'].max);
    });
  });

  it('issue #91: serving steps show only the value — no kcal text on the buttons', async () => {
    await renderSheet();
    expect(screen.getByTestId('sheet-step-0.5')).toHaveTextContent('½');
    expect(screen.getByTestId('sheet-step-0.5')).not.toHaveTextContent('kcal');
    expect(screen.getByTestId('sheet-step-1')).toHaveTextContent('1');
    expect(screen.getByTestId('sheet-step-1')).not.toHaveTextContent('kcal');
    expect(screen.getByTestId('sheet-step-1.5')).toHaveTextContent('1½');
    expect(screen.getByTestId('sheet-step-8')).toHaveTextContent('8');
    // the accessibility label is still allowed to carry the calories
    expect(screen.getByTestId('sheet-step-1').props.accessibilityLabel).toContain('kilocalories');
  });

  it('issue #91: a step past the old cap of 3 still logs immediately, no extra tap', async () => {
    const onLog = jest.fn();
    const onClose = jest.fn();
    await renderSheet({ onLog, onClose });

    await fireEvent.press(screen.getByTestId('sheet-step-5'));

    expect(onLog).toHaveBeenCalledWith(food, 5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('issue #91: the steps render in a horizontal scroll strip, not a wrapping grid', async () => {
    await renderSheet();
    const strip = screen.getByTestId('sheet-steps');
    expect(strip.props.horizontal).toBe(true);
  });

  it('issue #91: opens with the "1" step in view — the strip is scrolled so it sits at the leading edge', async () => {
    await renderSheet();
    const strip = screen.getByTestId('sheet-steps');
    const steps = servingSteps(food);
    const pitch = size.portionSheet.stepWidth + space[2];
    const anchorIndex = steps.indexOf(1);
    expect(strip.props.contentOffset).toEqual({ x: anchorIndex * pitch, y: 0 });
  });

  it('issue #91: editing pre-fills the strip scrolled to the currently logged amount, not always "1"', async () => {
    await renderSheet({ initialPortions: 2.5 });
    const strip = screen.getByTestId('sheet-steps');
    const steps = servingSteps(food);
    const pitch = size.portionSheet.stepWidth + space[2];
    const anchorIndex = steps.indexOf(2.5);
    expect(strip.props.contentOffset).toEqual({ x: anchorIndex * pitch, y: 0 });
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

  // Issue #124: `formatGrams` groups thousands (`toLocaleString`), which this readout did not do
  // before this issue's formatter routed through it — an amount of 1000+ g now shows "1,000 g",
  // not "1000 g". Intentional, not a regression: the same grouping every other kcal/protein figure
  // on this sheet already applies via `.toLocaleString(locale)`.
  it('groups thousands in the Exact readout for an amount of 1000 g or more', async () => {
    const largeFood: FoodCandidate = { ...food, servingGrams: 1000, servingAmount: 1000 };
    await renderSheet({ candidate: largeFood, locale: 'en-US' });
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('1,000 g');
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

    // Enough presses to cross 170 g at whatever `sliderNudgeG` currently is, plus a few more to
    // prove the floor holds rather than going negative. Never a literal press count: the step is a
    // token (#107 moved it 5 → 1) and this test asserts the floor, not the step size.
    const pressesPastZero = Math.ceil(170 / interaction.sliderNudgeG) + 5;
    for (let i = 0; i < pressesPastZero; i += 1) {
      await fireEvent.press(screen.getByTestId('sheet-exact-nudge-down'));
    }

    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('0 g');
  });

  it('issue #92: the + nudge keeps increasing past the initial range — no hard cap', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    const initialRange = 170 * interaction.servingSteps.custom.max;
    const pressesPastInitialRange = Math.ceil(initialRange / interaction.sliderNudgeG) + 5;
    for (let i = 0; i < pressesPastInitialRange; i += 1) {
      await fireEvent.press(screen.getByTestId('sheet-exact-nudge-up'));
    }

    const expected = 170 + pressesPastInitialRange * interaction.sliderNudgeG;
    expect(expected).toBeGreaterThan(initialRange);
    // `formatGrams` groups thousands (issue #124) — the preset's own max pushes this well past 1,000.
    expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent(`${expected.toLocaleString()} g`);

    // Pins `baseRange` itself, not just the readout: `growRangeTo` grows the range in whole
    // `baseRange`-sized chunks, so a wrong `baseRange` (e.g. the old flat `sliderMaxServings`, 4)
    // would land the track's max on a different figure than this one derived from the preset's own
    // max (`custom.max`, 8) — 680-sized chunks instead of 1360-sized ones.
    const track = screen.getByTestId('sheet-exact-track');
    const grownRange = Math.ceil(expected / initialRange) * initialRange;
    expect(track.props.accessibilityValue.max).toBe(grownRange);
  });

  it('issue #92: once the value has grown past the initial range, dragging to the far end of the track reaches the grown range, not the old max', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

    const initialRange = 170 * interaction.servingSteps.custom.max;
    const pressesPastInitialRange = Math.ceil(initialRange / interaction.sliderNudgeG) + 5;
    for (let i = 0; i < pressesPastInitialRange; i += 1) {
      await fireEvent.press(screen.getByTestId('sheet-exact-nudge-up'));
    }
    const grownBeforeDrag = 170 + pressesPastInitialRange * interaction.sliderNudgeG;
    // `growRangeTo` grows in whole `baseRange`-sized chunks, so this pins the exact figure a correct
    // `baseRange` (170 × `custom.max`, 8) lands on, not just "greater than the initial range" — the
    // old flat `sliderMaxServings` (4, i.e. 680 g chunks) would land on a different one.
    const grownRange = Math.ceil(grownBeforeDrag / initialRange) * initialRange;

    const track = screen.getByTestId('sheet-exact-track');
    await fireEvent(track, 'layout', { nativeEvent: { layout: { width: 300, height: 44, x: 0, y: 0 } } });
    await fireEvent(track, 'responderMove', responderEvent(300, 1));

    // A drag to the far right always lands on the *current* range's ceiling. If touching the track
    // still reset the value to the old 680 g cap, this would read 680 g instead.
    const readoutText = screen.getByTestId('sheet-exact-readout-value').props.children as string;
    const grownValue = Number(readoutText.replace(/\D/g, ''));
    expect(grownValue).toBeGreaterThan(initialRange);
    expect(track.props.accessibilityValue.max).toBe(grownRange);
    expect(grownValue).toBe(grownRange);
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
    const readoutValue = (): number => Number((screen.getByTestId('sheet-exact-readout-value').props.children as string).replace(/\D/g, ''));

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

  describe('issue #94: tap the readout to type an amount', () => {
    it('tapping the readout opens a decimal-pad input seeded with the current value, selected', async () => {
      await renderSheet();
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      const input = screen.getByTestId('sheet-exact-readout-input');
      expect(input.props.value).toBe('170');
      expect(input.props.keyboardType).toBe('decimal-pad');
      expect(input.props.selectTextOnFocus).toBe(true);
    });

    it('typing a food amount and committing updates the readout, figures and Log button — whole grams', async () => {
      const onLog = jest.fn();
      await renderSheet({ onLog });
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      await fireEvent.changeText(screen.getByTestId('sheet-exact-readout-input'), '650');
      await fireEvent(screen.getByTestId('sheet-exact-readout-input'), 'blur');

      expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('650 g');
      expect(screen.queryByTestId('sheet-exact-readout-input')).toBeNull();

      await fireEvent.press(screen.getByTestId('sheet-exact-log'));
      expect(onLog).toHaveBeenCalledWith(food, 650 / 170);
    });

    it('a value above the slider\'s initial range is kept, not clamped back down — the range grows to fit it', async () => {
      await renderSheet();
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      // baseRange is 170 * interaction.servingSteps.custom.max (8) = 1360 — comfortably below 2000.
      await fireEvent.changeText(screen.getByTestId('sheet-exact-readout-input'), '2000');
      await fireEvent(screen.getByTestId('sheet-exact-readout-input'), 'blur');

      expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('2,000 g');
      const track = screen.getByTestId('sheet-exact-track');
      expect(track.props.accessibilityValue.max).toBeGreaterThanOrEqual(2000);
      expect(track.props.accessibilityValue.now).toBe(2000);
    });

    it('an empty entry reverts to the previous value — nothing is committed', async () => {
      const onLog = jest.fn();
      await renderSheet({ onLog });
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      await fireEvent.changeText(screen.getByTestId('sheet-exact-readout-input'), '');
      await fireEvent(screen.getByTestId('sheet-exact-readout-input'), 'blur');

      expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('170 g');
      await fireEvent.press(screen.getByTestId('sheet-exact-log'));
      expect(onLog).toHaveBeenCalledWith(food, 1);
    });

    it('an invalid entry reverts to the previous value — nothing is committed', async () => {
      await renderSheet();
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      await fireEvent.changeText(screen.getByTestId('sheet-exact-readout-input'), 'abc');
      await fireEvent(screen.getByTestId('sheet-exact-readout-input'), 'blur');

      expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('170 g');
    });

    it('a typed food amount is rounded to the nearest whole gram — the rounded value is what gets logged, not just displayed', async () => {
      const onLog = jest.fn();
      await renderSheet({ onLog });
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      await fireEvent.changeText(screen.getByTestId('sheet-exact-readout-input'), '133.7');
      await fireEvent(screen.getByTestId('sheet-exact-readout-input'), 'blur');

      expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('134 g');

      await fireEvent.press(screen.getByTestId('sheet-exact-log'));
      // `formatGrams` itself rounds for display, so the readout-text assertion above cannot tell
      // "the committed amount was rounded" from "only the display rounds" — this closes that gap.
      expect(onLog).toHaveBeenCalledWith(food, 134 / 170);
    });

    it('typing 0 reverts to the previous value, not a zero-portion log — zero is invalid input, not a clamp target', async () => {
      const onLog = jest.fn();
      await renderSheet({ onLog });
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      await fireEvent.changeText(screen.getByTestId('sheet-exact-readout-input'), '0');
      await fireEvent(screen.getByTestId('sheet-exact-readout-input'), 'blur');

      expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('170 g');
      await fireEvent.press(screen.getByTestId('sheet-exact-log'));
      expect(onLog).toHaveBeenCalledWith(food, 1);
    });

    it('typing a negative amount reverts to the previous value, not a zero-clamped log', async () => {
      const onLog = jest.fn();
      await renderSheet({ onLog });
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      await fireEvent.changeText(screen.getByTestId('sheet-exact-readout-input'), '-5');
      await fireEvent(screen.getByTestId('sheet-exact-readout-input'), 'blur');

      expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('170 g');
      await fireEvent.press(screen.getByTestId('sheet-exact-log'));
      expect(onLog).toHaveBeenCalledWith(food, 1);
    });

    it("typing 0 for a meal's servings also reverts, not a ×0 log", async () => {
      const onLog = jest.fn();
      await renderSheet({ candidate: meal, onLog });
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      await fireEvent.changeText(screen.getByTestId('sheet-exact-readout-input'), '0');
      await fireEvent(screen.getByTestId('sheet-exact-readout-input'), 'blur');

      expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('×1');
      await fireEvent.press(screen.getByTestId('sheet-exact-log'));
      expect(onLog).toHaveBeenCalledWith(meal, 1);
    });

    it('submitting from the keyboard commits, same as blur', async () => {
      await renderSheet();
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      await fireEvent.changeText(screen.getByTestId('sheet-exact-readout-input'), '300');
      await fireEvent(screen.getByTestId('sheet-exact-readout-input'), 'submitEditing');

      expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('300 g');
    });

    it("a meal's typed value rounds to the nearest 0.5 servings, per docs/decisions.md ruling 11", async () => {
      const onLog = jest.fn();
      await renderSheet({ candidate: meal, onLog });
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));
      await fireEvent.press(screen.getByTestId('sheet-exact-readout'));

      await fireEvent.changeText(screen.getByTestId('sheet-exact-readout-input'), '2.3');
      await fireEvent(screen.getByTestId('sheet-exact-readout-input'), 'blur');

      // 2.3 rounds to the nearest 0.5 → 2.5, never a typed way around the 0.5 step.
      expect(screen.getByTestId('sheet-exact-readout')).toHaveTextContent('×2.5');

      await fireEvent.press(screen.getByTestId('sheet-exact-log'));
      expect(onLog).toHaveBeenCalledWith(meal, 2.5);
    });

    it('the readout is an accessible control that names the current amount', async () => {
      await renderSheet();
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

      const readout = screen.getByTestId('sheet-exact-readout');
      expect(readout.props.accessibilityRole).toBe('button');
      expect(readout.props.accessibilityLabel).toContain('170 g');
    });

    it('the Exact control stays inside a keyboard-avoiding wrapper so the Log button is not covered', async () => {
      await renderSheet();
      await fireEvent.press(screen.getByTestId('sheet-mode-exact'));

      expect(screen.getByTestId('sheet-keyboard-avoider')).toBeTruthy();
      // The Log button is a descendant of the avoider, so it lifts with the same keyboard inset —
      // never left behind under the keyboard. Real keyboard-frame animation is not something RNTL
      // can assert; issue #94's acceptance checklist marks that an iPhone follow-up, not a gate.
      const avoider = screen.getByTestId('sheet-keyboard-avoider');
      expect(within(avoider).getByTestId('sheet-exact-log')).toBeTruthy();
    });
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
