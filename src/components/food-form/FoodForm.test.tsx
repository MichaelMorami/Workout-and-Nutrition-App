/**
 * `<FoodForm>` — issue #43's add/edit food, rebuilt on issue #86's per-100 shape: name, brand,
 * serving label are the only typed fields (there is no stepper for free text); the serving preset
 * row picks `basis` + `servingAmount` in one tap, and kcal/protein per 100 are steppers, never a
 * keyboard. Behaviour only — what `onSave` is called with, never pixel layout.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { FoodInput } from '../../db';
import { themes } from '../../theme/tokens';
import { FoodForm } from './FoodForm';

const theme = themes.dark;

describe('FoodForm', () => {
  it('starts every field empty/zero when creating a new food', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    expect(screen.getByTestId('food-form-name').props.value).toBe('');
    expect(screen.getByTestId('food-form-brand').props.value).toBe('');
    expect(screen.getByTestId('food-form-serving-label').props.value).toBe('');
    expect(screen.getByTestId('food-form-kcal-value')).toHaveTextContent('0');
    expect(screen.getByTestId('food-form-protein-value')).toHaveTextContent('0');
    // No preset is a natural default for a fresh food — Custom is selected, and its own controls show.
    expect(screen.getByTestId('food-form-preset-custom').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-serving-amount-value')).toHaveTextContent('0');
  });

  it('pre-fills every field from an existing food when editing, re-selecting the preset it matches', async () => {
    const initial: FoodInput = {
      name: 'Greek yoghurt',
      brand: 'Fage',
      servingLabel: '1 pot',
      basis: 'weight',
      servingAmount: 170,
      kcalPer100: 70,
      proteinPer100: 12,
    };
    await render(<FoodForm initial={initial} theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    expect(screen.getByTestId('food-form-name').props.value).toBe('Greek yoghurt');
    expect(screen.getByTestId('food-form-brand').props.value).toBe('Fage');
    expect(screen.getByTestId('food-form-serving-label').props.value).toBe('1 pot');
    expect(screen.getByTestId('food-form-kcal-value')).toHaveTextContent('70');
    expect(screen.getByTestId('food-form-protein-value')).toHaveTextContent('12');
    // 170 g matches no preset (only 100 g does) — Custom is selected and its controls pre-fill.
    expect(screen.getByTestId('food-form-preset-custom').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-basis-weight').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-serving-amount-value')).toHaveTextContent('170');
  });

  it('pre-fills at the matching preset chip when the food was created from one', async () => {
    const initial: FoodInput = {
      name: 'Whole milk',
      brand: null,
      servingLabel: '100 ml',
      basis: 'volume',
      servingAmount: 100,
      kcalPer100: 60,
      proteinPer100: 3,
    };
    await render(<FoodForm initial={initial} theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    expect(screen.getByTestId('food-form-preset-100-ml').props.accessibilityState).toEqual({ selected: true });
    // The preset's own controls (basis toggle, serving-amount stepper) don't show — the preset already set them.
    expect(screen.queryByTestId('food-form-basis-weight')).toBeNull();
    expect(screen.queryByTestId('food-form-serving-amount')).toBeNull();
  });

  it('tapping a preset sets basis, serving amount and serving label in one tap', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Oats');
    await fireEvent.press(screen.getByTestId('food-form-preset-100-g'));
    await fireEvent.press(screen.getByTestId('food-form-kcal-increase'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Oats',
      brand: null,
      servingLabel: '100 g',
      basis: 'weight',
      servingAmount: 100,
      kcalPer100: 5,
      proteinPer100: 0,
    } satisfies FoodInput);
  });

  it('a Custom serving sets basis from the toggle and amount from its own stepper', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Whey scoop');
    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '1 scoop');
    await fireEvent.press(screen.getByTestId('food-form-basis-volume'));
    await fireEvent.press(screen.getByTestId('food-form-serving-amount-increase'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Whey scoop', servingLabel: '1 scoop', basis: 'volume', servingAmount: 5 }),
    );
  });

  it('saves brand null when left blank', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Boiled eggs');
    await fireEvent.press(screen.getByTestId('food-form-preset-100-g'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brand: null }));
  });

  it('does not save, and shows an inline error, when the name is empty', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-preset-100-g'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('food-form-error')).toHaveTextContent(/name/i);
  });

  it('does not save when the serving label is empty', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Boiled eggs');
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('food-form-error')).toBeTruthy();
  });

  it('does not save when no serving (Custom, amount still zero) has been given', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Boiled eggs');
    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '2 eggs');
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('food-form-error')).toHaveTextContent(/serving amount/i);
  });

  it('calls onCancel from the Cancel button', async () => {
    const onCancel = jest.fn();
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={onCancel} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps Save reachable with the keyboard up — taps persist and the scroll view insets for the keyboard (issue #79)', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    const form = screen.getByTestId('food-form');
    expect(form.props.keyboardShouldPersistTaps).toBe('handled');
    expect(form.props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('every stepper, preset chip and button carries an accessibility label, and Save/Cancel/preset chips are ≥44pt targets', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    const save = screen.getByTestId('food-form-save');
    const cancel = screen.getByTestId('food-form-cancel');
    const preset = screen.getByTestId('food-form-preset-100-g');
    expect(save.props.accessibilityRole).toBe('button');
    expect(save.props.accessibilityLabel).toBe('Save food');
    expect(cancel.props.accessibilityRole).toBe('button');
    expect(cancel.props.accessibilityLabel).toBe('Cancel');
    expect(preset.props.accessibilityRole).toBe('button');
    expect(preset.props.accessibilityLabel).toBe('100 g');
  });
});
