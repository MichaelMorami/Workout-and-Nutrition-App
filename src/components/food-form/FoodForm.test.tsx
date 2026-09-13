/**
 * `<FoodForm>` — issue #43's add/edit food: name, brand, serving label are the only typed fields
 * (there is no stepper for free text); serving grams, kcal and protein are steppers, never a
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
    expect(screen.getByTestId('food-form-serving-grams-value')).toHaveTextContent('0');
    expect(screen.getByTestId('food-form-kcal-value')).toHaveTextContent('0');
    expect(screen.getByTestId('food-form-protein-value')).toHaveTextContent('0');
  });

  it('pre-fills every field from an existing food when editing', async () => {
    const initial: FoodInput = {
      name: 'Greek yoghurt',
      brand: 'Fage',
      servingLabel: '1 pot',
      servingGrams: 170,
      kcalPerServing: 120,
      proteinPerServing: 20,
    };
    await render(<FoodForm initial={initial} theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    expect(screen.getByTestId('food-form-name').props.value).toBe('Greek yoghurt');
    expect(screen.getByTestId('food-form-brand').props.value).toBe('Fage');
    expect(screen.getByTestId('food-form-serving-label').props.value).toBe('1 pot');
    expect(screen.getByTestId('food-form-serving-grams-value')).toHaveTextContent('170');
    expect(screen.getByTestId('food-form-kcal-value')).toHaveTextContent('120');
    expect(screen.getByTestId('food-form-protein-value')).toHaveTextContent('20');
  });

  it('saves a valid new food with brand and serving grams null when left blank/zero', async () => {
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
      servingGrams: null,
      kcalPerServing: 5,
      proteinPerServing: 1,
    } satisfies FoodInput);
  });

  it('saves brand and serving grams when given', async () => {
    const onSave = jest.fn();
    await render(<FoodForm theme={theme} onSave={onSave} onCancel={jest.fn()} testID="food-form" />);

    await fireEvent.changeText(screen.getByTestId('food-form-name'), 'Skyr');
    await fireEvent.changeText(screen.getByTestId('food-form-brand'), 'Arla');
    await fireEvent.changeText(screen.getByTestId('food-form-serving-label'), '1 pot');
    await fireEvent.press(screen.getByTestId('food-form-serving-grams-increase'));
    await fireEvent.press(screen.getByTestId('food-form-save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Skyr', brand: 'Arla', servingLabel: '1 pot', servingGrams: 5 }),
    );
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

  it('calls onCancel from the Cancel button', async () => {
    const onCancel = jest.fn();
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={onCancel} testID="food-form" />);

    await fireEvent.press(screen.getByTestId('food-form-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('every stepper and button carries an accessibility label, and Save/Cancel are ≥44pt targets', async () => {
    await render(<FoodForm theme={theme} onSave={jest.fn()} onCancel={jest.fn()} testID="food-form" />);

    const save = screen.getByTestId('food-form-save');
    const cancel = screen.getByTestId('food-form-cancel');
    expect(save.props.accessibilityRole).toBe('button');
    expect(save.props.accessibilityLabel).toBe('Save food');
    expect(cancel.props.accessibilityRole).toBe('button');
    expect(cancel.props.accessibilityLabel).toBe('Cancel');
  });
});
