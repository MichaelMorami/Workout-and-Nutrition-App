/**
 * `<MealForm>` — issue #43's "saved meals: create from foods". Every food's amount in the meal is a
 * `<Stepper>` (servings of that food per portion of the meal) starting at 0 — nudging it above 0 is
 * what includes the food, so there is no separate checkbox to keep in sync with the quantity.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { FoodRow } from '../../db';
import { themes } from '../../theme/tokens';
import { MealForm } from './MealForm';

const theme = themes.dark;

const yoghurt: FoodRow = {
  id: 'food-1',
  updatedAt: 0,
  deleted: 0,
  name: 'Greek yoghurt',
  brand: null,
  servingLabel: '1 pot',
  servingGrams: 170,
  kcalPerServing: 120,
  proteinPerServing: 20,
  archived: 0,
  useCount: 0,
  lastUsedAt: null,
  hourHistogram: null,
  searchText: 'greek yoghurt',
};

const granola: FoodRow = { ...yoghurt, id: 'food-2', name: 'Granola', kcalPerServing: 200, proteinPerServing: 5 };

describe('MealForm', () => {
  it('starts with the name empty and every food at zero servings', async () => {
    await render(<MealForm foods={[yoghurt, granola]} onSave={jest.fn()} onCancel={jest.fn()} theme={theme} testID="meal-form" />);

    expect(screen.getByTestId('meal-form-name').props.value).toBe('');
    expect(screen.getByTestId('meal-form-item-food-1-value')).toHaveTextContent('0');
    expect(screen.getByTestId('meal-form-item-food-2-value')).toHaveTextContent('0');
  });

  it('saves a meal with only the foods given a nonzero amount', async () => {
    const onSave = jest.fn();
    await render(<MealForm foods={[yoghurt, granola]} onSave={onSave} onCancel={jest.fn()} theme={theme} testID="meal-form" />);

    await fireEvent.changeText(screen.getByTestId('meal-form-name'), 'Breakfast bowl');
    await fireEvent.press(screen.getByTestId('meal-form-item-food-1-increase'));
    await fireEvent.press(screen.getByTestId('meal-form-item-food-1-increase'));
    await fireEvent.press(screen.getByTestId('meal-form-save'));

    expect(onSave).toHaveBeenCalledWith({ name: 'Breakfast bowl', items: [{ foodId: 'food-1', qty: 1 }] });
  });

  it('does not save, and shows an inline error, with an empty name', async () => {
    const onSave = jest.fn();
    await render(<MealForm foods={[yoghurt]} onSave={onSave} onCancel={jest.fn()} theme={theme} testID="meal-form" />);

    await fireEvent.press(screen.getByTestId('meal-form-item-food-1-increase'));
    await fireEvent.press(screen.getByTestId('meal-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('meal-form-error')).toBeTruthy();
  });

  it('does not save, and shows an inline error, with no food selected', async () => {
    const onSave = jest.fn();
    await render(<MealForm foods={[yoghurt]} onSave={onSave} onCancel={jest.fn()} theme={theme} testID="meal-form" />);

    await fireEvent.changeText(screen.getByTestId('meal-form-name'), 'Breakfast bowl');
    await fireEvent.press(screen.getByTestId('meal-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('meal-form-error')).toHaveTextContent(/food/i);
  });

  it('calls onCancel from the Cancel button', async () => {
    const onCancel = jest.fn();
    await render(<MealForm foods={[yoghurt]} onSave={jest.fn()} onCancel={onCancel} theme={theme} testID="meal-form" />);

    await fireEvent.press(screen.getByTestId('meal-form-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows a teaching empty state when there are no foods yet to build a meal from', async () => {
    await render(<MealForm foods={[]} onSave={jest.fn()} onCancel={jest.fn()} theme={theme} testID="meal-form" />);

    expect(screen.getByTestId('meal-form-empty')).toBeTruthy();
    expect(screen.getByTestId('meal-form-empty').props.accessibilityLabel).toMatch(/add a food first/i);
    expect(screen.queryByTestId('meal-form-save')).toBeNull();
  });
});
