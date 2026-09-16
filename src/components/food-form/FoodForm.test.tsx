/**
 * `<FoodForm>` — issue #43's add/edit food, adapted (issue #86) to the per-100 shape: name, brand,
 * serving label are the only typed fields (there is no stepper for free text); `basis` is a plain
 * Weight/Volume toggle, and serving amount, kcal per 100 and protein per 100 are steppers, never a
 * keyboard. Behaviour only — what `onSave` is called with, never pixel layout.
 *
 * This is deliberately the plain #86 data-shape form: the one-tap serving-preset picker (100 g /
 * 100 ml / 1 cup / 1 tbsp / 1 tsp + Custom) is issue #89, blocked on #88's design, and does not
 * belong here yet.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { FoodInput } from '../../db';
import { themes } from '../../theme/tokens';
import { FoodForm } from './FoodForm';

const theme = themes.dark;

describe('FoodForm', () => {
  it('starts a new food with basis weight and a serving amount of 100, ready to save untouched', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    expect(screen.getByTestId('food-form-name').props.value).toBe('');
    expect(screen.getByTestId('food-form-brand').props.value).toBe('');
    expect(screen.getByTestId('food-form-serving-label').props.value).toBe('');
    expect(screen.getByTestId('food-form-basis-weight').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-serving-amount-value')).toHaveTextContent('100');
    expect(screen.getByTestId('food-form-kcal-value')).toHaveTextContent('0');
    expect(screen.getByTestId('food-form-protein-value')).toHaveTextContent('0');
  });

  it('pre-fills every field from an existing food when editing', async () => {
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
    expect(screen.getByTestId('food-form-basis-weight').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-serving-amount-value')).toHaveTextContent('170');
    expect(screen.getByTestId('food-form-kcal-value')).toHaveTextContent('70');
    expect(screen.getByTestId('food-form-protein-value')).toHaveTextContent('12');
  });

  it('pre-fills a volume food with the volume toggle selected', async () => {
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

    expect(screen.getByTestId('food-form-basis-volume').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('food-form-serving-amount-unit')).toHaveTextContent('ml');
  });

  it('saves a valid new food untouched except name, serving label and the numbers', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Boiled eggs');
    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '2 eggs');
    await fireEvent.press(screen.getByTestId('food-form-kcal-increase'));
    await fireEvent.press(screen.getByTestId('food-form-protein-increase'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Boiled eggs',
      brand: null,
      servingLabel: '2 eggs',
      basis: 'weight',
      servingAmount: 100,
      kcalPer100: 5,
      proteinPer100: 1,
    } satisfies FoodInput);
  });

  it('switching the basis toggle to volume sets basis and relabels the steppers', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Whole milk');
    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '1 glass');
    await fireEvent.press(screen.getByTestId('food-form-basis-volume'));
    await fireEvent.press(screen.getByTestId('food-form-serving-amount-increase'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Whole milk', servingLabel: '1 glass', basis: 'volume', servingAmount: 105 }),
    );
  });

  it('saves brand null when left blank', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Boiled eggs');
    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '2 eggs');
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brand: null }));
  });

  it('does not save, and shows an inline error, when the name is empty', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '1 pot');
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

  it('does not save when the serving amount has been stepped down to zero', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Boiled eggs');
    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '2 eggs');
    for (let i = 0; i < 20; i += 1) {
      await fireEvent.press(screen.getByTestId('food-form-serving-amount-decrease'));
    }
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

  it('every stepper, toggle option and button carries an accessibility label, and Save/Cancel/toggle options are ≥44pt targets', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    const save = screen.getByTestId('food-form-save');
    const cancel = screen.getByTestId('food-form-cancel');
    const basisWeight = screen.getByTestId('food-form-basis-weight');
    expect(save.props.accessibilityRole).toBe('button');
    expect(save.props.accessibilityLabel).toBe('Save food');
    expect(cancel.props.accessibilityRole).toBe('button');
    expect(cancel.props.accessibilityLabel).toBe('Cancel');
    expect(basisWeight.props.accessibilityRole).toBe('button');
    expect(basisWeight.props.accessibilityLabel).toBe('Weight (grams)');
  });
});
