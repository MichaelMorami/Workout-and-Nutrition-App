/**
 * `<Stepper>` — the generic − / + control behind issue #43's "steppers over keyboards wherever a
 * stepper will do", updated by issue #87: tap the value to type it exactly; hold +/- to
 * auto-repeat and accelerate.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { interaction, themes } from '../../theme/tokens';
import { Stepper } from './Stepper';

const theme = themes.dark;

describe('Stepper', () => {
  it('renders the label, the current value and the unit', async () => {
    await render(<Stepper label="Kcal per serving" value={120} step={5} unit="kcal" theme={theme} onChange={jest.fn()} testID="stepper" />);

    expect(screen.getByText('Kcal per serving')).toBeTruthy();
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('120');
    expect(screen.getByTestId('stepper-unit')).toHaveTextContent('kcal');
  });

  it('tapping + increases the value by one step', async () => {
    const onChange = jest.fn();
    await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={onChange} testID="stepper" />);

    await fireEvent.press(screen.getByTestId('stepper-increase'));

    expect(onChange).toHaveBeenCalledWith(125);
  });

  it('tapping − decreases the value by one step', async () => {
    const onChange = jest.fn();
    await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={onChange} testID="stepper" />);

    await fireEvent.press(screen.getByTestId('stepper-decrease'));

    expect(onChange).toHaveBeenCalledWith(115);
  });

  it('never decreases past min (default 0)', async () => {
    const onChange = jest.fn();
    await render(<Stepper label="Kcal" value={0} step={5} theme={theme} onChange={onChange} testID="stepper" />);

    await fireEvent.press(screen.getByTestId('stepper-decrease'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('never increases past an explicit max', async () => {
    const onChange = jest.fn();
    await render(<Stepper label="Servings" value={10} step={1} max={10} theme={theme} onChange={onChange} testID="stepper" />);

    await fireEvent.press(screen.getByTestId('stepper-increase'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('every button carries an accessibility label and role', async () => {
    await render(<Stepper label="Kcal per serving" value={120} step={5} theme={theme} onChange={jest.fn()} testID="stepper" />);

    const decrease = screen.getByTestId('stepper-decrease');
    const increase = screen.getByTestId('stepper-increase');
    expect(decrease.props.accessibilityRole).toBe('button');
    expect(decrease.props.accessibilityLabel).toBe('Decrease Kcal per serving');
    expect(increase.props.accessibilityRole).toBe('button');
    expect(increase.props.accessibilityLabel).toBe('Increase Kcal per serving');
  });

  describe('tap the value to type it exactly (issue #87)', () => {
    it('tapping the value well opens a decimal-pad input seeded with the current value, selected', async () => {
      await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={jest.fn()} testID="stepper" />);

      await fireEvent.press(screen.getByTestId('stepper-value-well'));

      const input = screen.getByTestId('stepper-input');
      expect(input.props.value).toBe('120');
      expect(input.props.keyboardType).toBe('decimal-pad');
      expect(input.props.selectTextOnFocus).toBe(true);
      expect(screen.queryByTestId('stepper-value')).toBeNull();
    });

    it('typing an exact value and committing calls onChange with the exact number, no step rounding', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Serving amount" value={100} step={5} theme={theme} onChange={onChange} testID="stepper" />);
      await fireEvent.press(screen.getByTestId('stepper-value-well'));

      await fireEvent.changeText(screen.getByTestId('stepper-input'), '33.5');
      await fireEvent(screen.getByTestId('stepper-input'), 'blur');

      expect(onChange).toHaveBeenCalledWith(33.5);
    });

    it('an empty entry reverts to the previous value — onChange is not called', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={onChange} testID="stepper" />);
      await fireEvent.press(screen.getByTestId('stepper-value-well'));

      await fireEvent.changeText(screen.getByTestId('stepper-input'), '');
      await fireEvent(screen.getByTestId('stepper-input'), 'blur');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('stepper-value')).toHaveTextContent('120');
    });

    it('an invalid entry reverts to the previous value — onChange is not called', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={onChange} testID="stepper" />);
      await fireEvent.press(screen.getByTestId('stepper-value-well'));

      await fireEvent.changeText(screen.getByTestId('stepper-input'), 'abc');
      await fireEvent(screen.getByTestId('stepper-input'), 'blur');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('stepper-value')).toHaveTextContent('120');
    });

    it('a typed value above max clamps to max', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Servings" value={1} step={0.5} max={10} theme={theme} onChange={onChange} testID="stepper" />);
      await fireEvent.press(screen.getByTestId('stepper-value-well'));

      await fireEvent.changeText(screen.getByTestId('stepper-input'), '999');
      await fireEvent(screen.getByTestId('stepper-input'), 'blur');

      expect(onChange).toHaveBeenCalledWith(10);
    });

    it('a typed value below min clamps to min', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={onChange} testID="stepper" />);
      await fireEvent.press(screen.getByTestId('stepper-value-well'));

      await fireEvent.changeText(screen.getByTestId('stepper-input'), '-50');
      await fireEvent(screen.getByTestId('stepper-input'), 'blur');

      expect(onChange).toHaveBeenCalledWith(0);
    });

    it('submitting from the keyboard commits, same as blur', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={onChange} testID="stepper" />);
      await fireEvent.press(screen.getByTestId('stepper-value-well'));

      await fireEvent.changeText(screen.getByTestId('stepper-input'), '140');
      await fireEvent(screen.getByTestId('stepper-input'), 'submitEditing');

      expect(onChange).toHaveBeenCalledWith(140);
    });
  });

  describe('hold +/- to auto-repeat and accelerate (issue #87)', () => {
    it('a quick tap (pressIn then pressOut well inside the hold delay) steps exactly once', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={onChange} testID="stepper" />);
      const button = screen.getByTestId('stepper-increase');

      await fireEvent(button, 'pressIn');
      await fireEvent(button, 'pressOut');
      await fireEvent.press(button);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(125);
    });

    it('holding past the repeat delay auto-repeats without a further tap, and releasing adds no extra step', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={onChange} testID="stepper" />);
      const button = screen.getByTestId('stepper-increase');

      await fireEvent(button, 'pressIn');
      await act(async () => {
        jest.advanceTimersByTime(interaction.stepperRepeatDelayMs);
      });

      // The hold delay elapsing fires the first repeat tick on its own, with no `onPress` yet.
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith(125);

      // Exactly two more ticks at the 125 ms steady-state cadence — a tight `toBe`, not a floor, so
      // a faster interval (a regression this exact test caught in review, #184: mutating the 125 ms
      // constant down to 5 ms) still produces the wrong count here and fails loudly, rather than
      // merely clearing a `>=` floor unnoticed.
      await act(async () => {
        jest.advanceTimersByTime(250);
      });
      expect(onChange.mock.calls.length).toBe(3);

      // The release's own trailing `onPress` must add nothing on top of what the hold already
      // applied — compared against a snapshot taken *before* the release, not against itself (a
      // self-comparison a previous version of this test made, which cannot ever fail; caught in
      // review, #184).
      const callsBeforeRelease = onChange.mock.calls.length;
      await fireEvent(button, 'pressOut');
      await fireEvent.press(button);
      expect(onChange.mock.calls.length).toBe(callsBeforeRelease);
    });

    it('a long hold accelerates to a bigger step after about 1.4 s held in total', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={0} step={5} max={100000} theme={theme} onChange={onChange} testID="stepper" />);
      const button = screen.getByTestId('stepper-increase');

      await fireEvent(button, 'pressIn');
      await act(async () => {
        jest.advanceTimersByTime(interaction.stepperRepeatDelayMs + 1500);
      });
      await fireEvent(button, 'pressOut');

      // Every call before acceleration steps by `step` (5); at least one call after ~1.4 s of
      // holding steps by the accelerated multiplier (10 x 5 = 50).
      const deltas = onChange.mock.calls.map(([value]) => value as number);
      const steps = deltas.map((value, i) => value - (i === 0 ? 0 : deltas[i - 1]!));
      expect(steps.some((delta) => delta === 50)).toBe(true);
    });

    it('does not accelerate before ~1.4 s of holding — every step so far is still the plain one', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={0} step={5} max={100000} theme={theme} onChange={onChange} testID="stepper" />);
      const button = screen.getByTestId('stepper-increase');

      await fireEvent(button, 'pressIn');
      // 900 ms total: past the 400 ms repeat delay, but well short of the ~1.4 s acceleration point
      // (400 ms delay + 1000 ms `REPEAT_ACCELERATE_AFTER_MS`). This is what catches a mutated
      // acceleration threshold (review, #184: 1000 ms -> 50 ms) — the "accelerates" test above alone
      // does not, since a 50-delta shows up either way once the hold runs long enough.
      await act(async () => {
        jest.advanceTimersByTime(interaction.stepperRepeatDelayMs + 500);
      });
      await fireEvent(button, 'pressOut');

      const deltas = onChange.mock.calls.map(([value]) => value as number);
      const steps = deltas.map((value, i) => value - (i === 0 ? 0 : deltas[i - 1]!));
      expect(steps.every((delta) => delta === 5)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
    });

    it('a hold released off the button still clears — it does not swallow the next, unrelated tap', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={onChange} testID="stepper" />);
      const button = screen.getByTestId('stepper-increase');

      await fireEvent(button, 'pressIn');
      await act(async () => {
        jest.advanceTimersByTime(interaction.stepperRepeatDelayMs);
      });
      onChange.mockClear();

      // A drag-off-target release: `pressOut` fires, but — unlike the on-target release above —
      // this gesture's own `onPress` never does (Pressability only calls it when the release lands
      // back inside the hit rect). Nothing else would ever clear `isHolding` in that case (review,
      // #184), so the very next, wholly separate tap would silently do nothing.
      await fireEvent(button, 'pressOut');
      await act(async () => {
        jest.advanceTimersByTime(0); // let the deferred clear `onPressOut` scheduled actually run
      });

      await fireEvent.press(button);

      // One more plain step from 125 (where the single repeat tick above already left it, tracked
      // internally — this uncontrolled test never re-renders `value` from the `onChange` calls it
      // captures) — the point here is only that this fires at all, not what figure it lands on.
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(130);
    });

    it('releasing before the hold delay elapses cancels the pending repeat entirely', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={120} step={5} theme={theme} onChange={onChange} testID="stepper" />);
      const button = screen.getByTestId('stepper-increase');

      await fireEvent(button, 'pressIn');
      await fireEvent(button, 'pressOut');
      await act(async () => {
        jest.advanceTimersByTime(interaction.stepperRepeatDelayMs + 500);
      });

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
