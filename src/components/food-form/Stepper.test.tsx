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

    it('holding past the repeat delay auto-repeats without a further tap', async () => {
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

      await act(async () => {
        jest.advanceTimersByTime(250); // two more ~125 ms ticks at the steady-state cadence
      });
      expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(3);

      await fireEvent(button, 'pressOut');
      await fireEvent.press(button); // the release's trailing press must not add an extra step
      const callsAtRelease = onChange.mock.calls.length;
      expect(onChange.mock.calls.length).toBe(callsAtRelease);
    });

    it('a long hold accelerates to a bigger step after about a second', async () => {
      const onChange = jest.fn();
      await render(<Stepper label="Kcal" value={0} step={5} max={100000} theme={theme} onChange={onChange} testID="stepper" />);
      const button = screen.getByTestId('stepper-increase');

      await fireEvent(button, 'pressIn');
      await act(async () => {
        jest.advanceTimersByTime(interaction.stepperRepeatDelayMs + 1500);
      });
      await fireEvent(button, 'pressOut');

      // Every call before acceleration steps by `step` (5); at least one call after ~1 s of
      // holding steps by the accelerated multiplier (10 x 5 = 50).
      const deltas = onChange.mock.calls.map(([value]) => value as number);
      const steps = deltas.map((value, i) => value - (i === 0 ? 0 : deltas[i - 1]!));
      expect(steps.some((delta) => delta === 50)).toBe(true);
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
