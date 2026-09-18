/**
 * `<FoodList>` — issue #43's food management list, plus issue #100's swipe-left delete with undo:
 * tap edits, swipe reveals the trash button (`<SwipeToDelete>`, issue #85/#141), Delete archives
 * (`setFoodArchived`) and shows an undo toast — no confirmation dialog. Behaviour only, against the
 * real `useUndoToastStore` (the same store `<UndoToast>` reads), the same discipline
 * `DayLogList.test.tsx` uses for its own delete path.
 */
import { act, configure, fireEvent, render, screen } from '@testing-library/react-native';
import { mealsContainingFood } from '../../db/queries/catalog';
import { setFoodArchived, VitalsDbError, withServing, type FoodRow } from '../../db';
import { useUndoToastStore } from '../../store/undoToast';
import { themes } from '../../theme/tokens';
import { FoodList } from './FoodList';

jest.mock('../../db', () => {
  const actual = jest.requireActual<typeof import('../../db')>('../../db');
  return { ...actual, setFoodArchived: jest.fn() };
});
jest.mock('../../db/queries/catalog', () => {
  const actual = jest.requireActual<typeof import('../../db/queries/catalog')>('../../db/queries/catalog');
  return { ...actual, mealsContainingFood: jest.fn() };
});

// `<SwipeToDelete>`'s delete control leaves the accessibility tree at rest until the row has moved
// (issue #141) — RNTL 14 filters every query, `getByTestId` included, against that same "hidden
// from accessibility" definition by default. The tests below that press a row's `-delete` control
// still need to reach it while it is legitimately hidden, to prove the tap itself still lands (the
// exact reasoning `DayLogRow.test.tsx` and `DayLogList.test.tsx` give for the identical opt-in).
configure({ defaultIncludeHiddenElements: true });

const mockSetFoodArchived = jest.mocked(setFoodArchived);
const mockMealsContainingFood = jest.mocked(mealsContainingFood);

const theme = themes.dark;
const db = {} as never;

const yoghurt: FoodRow = {
  id: 'food-1',
  updatedAt: 0,
  deleted: 0,
  name: 'Greek yoghurt',
  brand: 'Fage',
  servingLabel: '1 pot',
  archived: 0,
  useCount: 4,
  lastUsedAt: null,
  hourHistogram: null,
  searchText: 'greek yoghurt fage',
  ...withServing({ basis: 'weight', servingAmount: 170, kcalPer100: (120 * 100) / 170, proteinPer100: (20 * 100) / 170 }),
};

const eggs: FoodRow = {
  ...yoghurt,
  id: 'food-2',
  name: 'Boiled eggs',
  brand: null,
  servingLabel: '2 eggs',
  ...withServing({ basis: 'volume', servingAmount: 90, kcalPer100: (140 * 100) / 90, proteinPer100: (12 * 100) / 90 }),
};

beforeEach(() => {
  mockMealsContainingFood.mockReturnValue([]);
  mockSetFoodArchived.mockReturnValue(yoghurt);
  useUndoToastStore.getState().dismiss();
});

const renderList = (props: Partial<React.ComponentProps<typeof FoodList>> = {}) =>
  render(<FoodList db={db} foods={[yoghurt, eggs]} onSelect={jest.fn()} onAdd={jest.fn()} theme={theme} testID="food-list" {...props} />);

describe('FoodList', () => {
  it('renders every food with its name, brand, serving and figures', async () => {
    await renderList();

    expect(screen.getByTestId('food-list-row-food-1-name')).toHaveTextContent('Greek yoghurt');
    expect(screen.getByTestId('food-list-row-food-1-serving')).toHaveTextContent('Fage · 1 pot');
    expect(screen.getByTestId('food-list-row-food-2-serving')).toHaveTextContent('2 eggs');
  });

  // Issue #124: the protein figure renders through `formatGrams`, not a hand-built `` `${n} g` ``.
  it('renders the protein figure in grams, through the shared formatter', async () => {
    await renderList({ foods: [yoghurt] });

    expect(screen.getByTestId('food-list-row-food-1-protein')).toHaveTextContent('20 g');
  });

  it('tapping a row calls onSelect with that food', async () => {
    const onSelect = jest.fn();
    await renderList({ foods: [yoghurt], onSelect });

    await fireEvent.press(screen.getByTestId('food-list-row-food-1'));

    expect(onSelect).toHaveBeenCalledWith(yoghurt);
  });

  it('tapping "Add food" calls onAdd', async () => {
    const onAdd = jest.fn();
    await renderList({ foods: [], onAdd });

    await fireEvent.press(screen.getByTestId('food-list-add'));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows a teaching empty state, and still offers Add food, when the catalogue is empty', async () => {
    await renderList({ foods: [] });

    expect(screen.getByTestId('food-list-empty')).toBeTruthy();
    expect(screen.getByTestId('food-list-empty').props.accessibilityLabel).toMatch(/no foods yet/i);
    expect(screen.getByTestId('food-list-add')).toBeTruthy();
  });

  it('every row and the Add button carry an accessibility label and role', async () => {
    await renderList({ foods: [yoghurt] });

    const row = screen.getByTestId('food-list-row-food-1');
    const add = screen.getByTestId('food-list-add');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Edit Greek yoghurt');
    expect(add.props.accessibilityRole).toBe('button');
    expect(add.props.accessibilityLabel).toBe('Add food');
  });
});

describe('FoodList swipe-to-delete (issue #100)', () => {
  it('swiping delete archives the food, removes the row, and shows undo — no confirmation', async () => {
    await renderList();

    await fireEvent.press(screen.getByTestId('food-list-row-food-1-delete'));

    expect(mockMealsContainingFood).toHaveBeenCalledWith(db, 'food-1');
    expect(mockSetFoodArchived).toHaveBeenCalledWith(db, { at: expect.any(Number), id: 'food-1', archived: true });
    expect(screen.queryByTestId('food-list-row-food-1')).toBeNull();
    expect(screen.getByTestId('food-list-row-food-2')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("the toast names the food and its figures, with no meals clause when it is in none", async () => {
    mockMealsContainingFood.mockReturnValue([]);
    await renderList();

    await fireEvent.press(screen.getByTestId('food-list-row-food-1-delete'));

    expect(useUndoToastStore.getState().toast?.title).toBe('Greek yoghurt');
    expect(useUndoToastStore.getState().toast?.meta).toBe('120 kcal · 20 g protein');
  });

  it('names every saved meal that still contains the food, so the user is told, not blocked', async () => {
    mockMealsContainingFood.mockReturnValue([
      { id: 'meal-1', name: 'Breakfast' },
      { id: 'meal-2', name: 'Post-workout' },
    ]);
    await renderList();

    await fireEvent.press(screen.getByTestId('food-list-row-food-1-delete'));

    expect(useUndoToastStore.getState().toast?.meta).toBe('120 kcal · 20 g protein · Still in Breakfast, Post-workout');
  });

  it('the toast carries action, not token — an archive has no UndoToken', async () => {
    await renderList();

    await fireEvent.press(screen.getByTestId('food-list-row-food-1-delete'));

    const toast = useUndoToastStore.getState().toast;
    expect(toast?.token).toBeUndefined();
    expect(typeof toast?.action).toBe('function');
    expect(toast?.verb).toBe('deleting');
  });

  it('undo (the toast action) un-archives the food and restores the row', async () => {
    await renderList();

    await fireEvent.press(screen.getByTestId('food-list-row-food-1-delete'));
    await act(async () => {
      useUndoToastStore.getState().toast?.action?.();
    });

    expect(mockSetFoodArchived).toHaveBeenLastCalledWith(db, { at: expect.any(Number), id: 'food-1', archived: false });
    expect(screen.getByTestId('food-list-row-food-1')).toBeTruthy();
  });

  it('a failed delete is swallowed, leaves the row in place, and shows no toast', async () => {
    mockSetFoodArchived.mockImplementation(() => {
      throw new VitalsDbError('not_found', 'gone');
    });
    await renderList();

    await expect(fireEvent.press(screen.getByTestId('food-list-row-food-1-delete'))).resolves.not.toThrow();

    expect(screen.getByTestId('food-list-row-food-1')).toBeTruthy();
    expect(useUndoToastStore.getState().toast).toBeNull();
  });

  it('exposes an accessibility delete action, equivalent to a physical swipe', async () => {
    await renderList({ foods: [yoghurt] });

    const row = screen.getByTestId('food-list-row-food-1');
    expect(row.props.accessibilityActions).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'delete' })]));

    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });

    expect(mockSetFoodArchived).toHaveBeenCalledWith(db, { at: expect.any(Number), id: 'food-1', archived: true });
  });
});
