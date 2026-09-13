/**
 * `<FoodList>` — issue #43's food management list: every live food in the catalogue, tap one to
 * edit it, "+ Add food" to create one. An empty catalogue teaches the user what to do next
 * (`CLAUDE.md`) instead of showing a blank screen.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { FoodRow } from '../../db';
import { themes } from '../../theme/tokens';
import { FoodList } from './FoodList';

const theme = themes.dark;

const yoghurt: FoodRow = {
  id: 'food-1',
  updatedAt: 0,
  deleted: 0,
  name: 'Greek yoghurt',
  brand: 'Fage',
  servingLabel: '1 pot',
  servingGrams: 170,
  kcalPerServing: 120,
  proteinPerServing: 20,
  archived: 0,
  useCount: 4,
  lastUsedAt: null,
  hourHistogram: null,
  searchText: 'greek yoghurt fage',
};

const eggs: FoodRow = {
  ...yoghurt,
  id: 'food-2',
  name: 'Boiled eggs',
  brand: null,
  servingLabel: '2 eggs',
  servingGrams: null,
  kcalPerServing: 140,
  proteinPerServing: 12,
};

describe('FoodList', () => {
  it('renders every food with its name, brand, serving and figures', async () => {
    await render(<FoodList foods={[yoghurt, eggs]} onSelect={jest.fn()} onAdd={jest.fn()} theme={theme} testID="food-list" />);

    expect(screen.getByTestId('food-list-row-food-1-name')).toHaveTextContent('Greek yoghurt');
    expect(screen.getByTestId('food-list-row-food-1-serving')).toHaveTextContent('Fage · 1 pot');
    expect(screen.getByTestId('food-list-row-food-2-serving')).toHaveTextContent('2 eggs');
  });

  it('tapping a row calls onSelect with that food', async () => {
    const onSelect = jest.fn();
    await render(<FoodList foods={[yoghurt]} onSelect={onSelect} onAdd={jest.fn()} theme={theme} testID="food-list" />);

    await fireEvent.press(screen.getByTestId('food-list-row-food-1'));

    expect(onSelect).toHaveBeenCalledWith(yoghurt);
  });

  it('tapping "Add food" calls onAdd', async () => {
    const onAdd = jest.fn();
    await render(<FoodList foods={[yoghurt]} onSelect={jest.fn()} onAdd={onAdd} theme={theme} testID="food-list" />);

    await fireEvent.press(screen.getByTestId('food-list-add'));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows a teaching empty state, and still offers Add food, when the catalogue is empty', async () => {
    await render(<FoodList foods={[]} onSelect={jest.fn()} onAdd={jest.fn()} theme={theme} testID="food-list" />);

    expect(screen.getByTestId('food-list-empty')).toBeTruthy();
    expect(screen.getByTestId('food-list-empty').props.accessibilityLabel).toMatch(/no foods yet/i);
    expect(screen.getByTestId('food-list-add')).toBeTruthy();
  });

  it('every row and the Add button carry an accessibility label and role', async () => {
    await render(<FoodList foods={[yoghurt]} onSelect={jest.fn()} onAdd={jest.fn()} theme={theme} testID="food-list" />);

    const row = screen.getByTestId('food-list-row-food-1');
    const add = screen.getByTestId('food-list-add');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Edit Greek yoghurt');
    expect(add.props.accessibilityRole).toBe('button');
    expect(add.props.accessibilityLabel).toBe('Add food');
  });
});
