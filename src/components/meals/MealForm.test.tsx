/**
 * `<MealForm>` — issue #43's "saved meals: create from foods", reworked by issue #98: ingredients
 * are added through a search dropdown over the whole food library (`searchFoodsOnly`), never the
 * old long all-foods scroll. Tapping a match adds it as an ingredient row below, pre-filled at one
 * serving — its own `<Stepper>` (unchanged; #99's job, not this one's) still lets that amount move.
 * An added ingredient can be removed. `createMeal`'s `empty_meal` guard is unchanged: a name and at
 * least one ingredient are both still required to save.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { FoodCandidate, FoodRow } from '../../db';
import { listFoods, searchFoodsOnly } from '../../db';
import { themes } from '../../theme/tokens';
import { MealForm } from './MealForm';

jest.mock('../../db', () => ({
  ...jest.requireActual<typeof import('../../db')>('../../db'),
  listFoods: jest.fn(),
  searchFoodsOnly: jest.fn(),
}));

const mockListFoods = jest.mocked(listFoods);
const mockSearch = jest.mocked(searchFoodsOnly);

const theme = themes.dark;

const yoghurt: FoodCandidate = {
  kind: 'food',
  id: 'food-1',
  name: 'Greek yoghurt',
  brand: 'Fage',
  servingLabel: '1 pot',
  basis: 'weight',
  servingAmount: 170,
  servingGrams: 170,
  servingMl: null,
  kcal: 120,
  protein: 20,
  useCount: 4,
  lastUsedAt: 1000,
};

const granola: FoodCandidate = {
  ...yoghurt,
  id: 'food-2',
  name: 'Granola',
  brand: null,
  kcal: 200,
  protein: 5,
};

beforeEach(() => {
  mockListFoods.mockReset();
  mockSearch.mockReset();
  mockListFoods.mockReturnValue([{ id: 'food-1' } as FoodRow]);
  mockSearch.mockReturnValue([]);
});

const renderForm = (props: Partial<React.ComponentProps<typeof MealForm>> = {}) =>
  render(<MealForm db={{} as never} onSave={jest.fn()} onCancel={jest.fn()} theme={theme} testID="meal-form" {...props} />);

describe('MealForm', () => {
  it('starts with an empty name and no ingredients', async () => {
    await renderForm();

    expect(screen.getByTestId('meal-form-name').props.value).toBe('');
    expect(screen.queryByTestId('meal-form-item-food-1')).toBeNull();
  });

  it('shows no dropdown for an empty query', async () => {
    await renderForm();

    expect(screen.queryByTestId('meal-form-dropdown')).toBeNull();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('type shows a match, tapping it adds an ingredient row, and save creates the meal with that item', async () => {
    mockSearch.mockReturnValue([yoghurt]);
    const onSave = jest.fn();
    await renderForm({ onSave });

    await fireEvent.changeText(screen.getByTestId('meal-form-search'), 'yog');
    expect(screen.getByTestId('meal-form-match-food-1')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('meal-form-match-food-1'));
    expect(screen.getByTestId('meal-form-item-food-1-value')).toHaveTextContent('1');
    // Adding closes the dropdown and clears the query, ready for the next search.
    expect(screen.queryByTestId('meal-form-dropdown')).toBeNull();
    expect(screen.getByTestId('meal-form-search').props.value).toBe('');

    await fireEvent.changeText(screen.getByTestId('meal-form-name'), 'Breakfast bowl');
    await fireEvent.press(screen.getByTestId('meal-form-save'));

    expect(onSave).toHaveBeenCalledWith({ name: 'Breakfast bowl', items: [{ foodId: 'food-1', qty: 1 }] });
  });

  it('does not offer an already-added food again', async () => {
    mockSearch.mockReturnValue([yoghurt, granola]);
    await renderForm();

    await fireEvent.changeText(screen.getByTestId('meal-form-search'), 'g');
    await fireEvent.press(screen.getByTestId('meal-form-match-food-1'));

    await fireEvent.changeText(screen.getByTestId('meal-form-search'), 'g');
    expect(screen.queryByTestId('meal-form-match-food-1')).toBeNull();
    expect(screen.getByTestId('meal-form-match-food-2')).toBeTruthy();
  });

  it('removes an added ingredient', async () => {
    mockSearch.mockReturnValue([yoghurt]);
    await renderForm();

    await fireEvent.changeText(screen.getByTestId('meal-form-search'), 'yog');
    await fireEvent.press(screen.getByTestId('meal-form-match-food-1'));
    expect(screen.getByTestId('meal-form-item-food-1')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('meal-form-item-food-1-remove'));
    expect(screen.queryByTestId('meal-form-item-food-1')).toBeNull();
  });

  it('does not save, and shows an inline error, with an empty name', async () => {
    mockSearch.mockReturnValue([yoghurt]);
    const onSave = jest.fn();
    await renderForm({ onSave });

    await fireEvent.changeText(screen.getByTestId('meal-form-search'), 'yog');
    await fireEvent.press(screen.getByTestId('meal-form-match-food-1'));
    await fireEvent.press(screen.getByTestId('meal-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('meal-form-error')).toBeTruthy();
  });

  it('does not save, and shows an inline error, with no ingredient added', async () => {
    const onSave = jest.fn();
    await renderForm({ onSave });

    await fireEvent.changeText(screen.getByTestId('meal-form-name'), 'Breakfast bowl');
    await fireEvent.press(screen.getByTestId('meal-form-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('meal-form-error')).toHaveTextContent(/food/i);
  });

  it('calls onCancel from the Cancel button', async () => {
    const onCancel = jest.fn();
    await renderForm({ onCancel });

    await fireEvent.press(screen.getByTestId('meal-form-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows a teaching empty state when the food library has nothing yet, with no search field', async () => {
    mockListFoods.mockReturnValue([]);
    await renderForm();

    expect(screen.getByTestId('meal-form-empty')).toBeTruthy();
    expect(screen.getByTestId('meal-form-empty').props.accessibilityLabel).toMatch(/add a food first/i);
    expect(screen.queryByTestId('meal-form-search')).toBeNull();
    expect(screen.queryByTestId('meal-form-save')).toBeNull();
  });
});
