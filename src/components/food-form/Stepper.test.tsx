/**
 * `<Stepper>` — the generic − / + control behind issue #43's "steppers over keyboards wherever a
 * stepper will do": serving grams, kcal and protein on the add/edit food form never make the user
 * type a number, only nudge one with a thumb.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { themes } from '../../theme/tokens';
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
});
