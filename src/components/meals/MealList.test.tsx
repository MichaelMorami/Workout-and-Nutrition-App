/**
 * `<MealList>` — issue #101's "Meals (Settings): tap to edit, swipe to delete". Tap opens the meal
 * for editing (`onSelect`); swipe reveals the trash button (`<SwipeToDelete>`, issue #85/#141),
 * Delete tombstones the meal (`deleteMeal`) and shows an undo toast — no confirmation dialog.
 * Behaviour only, against the real `useUndoToastStore` (the same store `<UndoToast>` reads), the
 * same discipline `FoodList.test.tsx` uses for its own delete path (issue #100).
 */
import { act, configure, fireEvent, render, screen } from '@testing-library/react-native';
import type { MealSummary } from '../../db';
import { deleteMeal, restoreMeal, VitalsDbError } from '../../db';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { useUndoToastStore } from '../../store/undoToast';
import { haptics, themes } from '../../theme/tokens';
import { MealList } from './MealList';

jest.mock('../../db', () => ({
  ...jest.requireActual<typeof import('../../db')>('../../db'),
  deleteMeal: jest.fn(),
  restoreMeal: jest.fn(),
}));
jest.mock('../../hooks/useHapticFeedback');

// `<SwipeToDelete>`'s delete control leaves the accessibility tree at rest until the row has moved
// (issue #141) — RNTL 14 filters every query, `getByTestId` included, against that same "hidden
// from accessibility" definition by default. The tests below that press a row's `-delete` control
// still need to reach it while it is legitimately hidden, the same opt-in `FoodList.test.tsx` uses.
configure({ defaultIncludeHiddenElements: true });

const mockDeleteMeal = jest.mocked(deleteMeal);
const mockRestoreMeal = jest.mocked(restoreMeal);
const mockFireHaptic = jest.fn();
jest.mocked(useHapticFeedback).mockReturnValue(mockFireHaptic);

const theme = themes.dark;
const db = {} as never;

const breakfast: MealSummary = { id: 'meal-1', name: 'Breakfast bowl', itemCount: 3, kcal: 420, protein: 30 };
const lunch: MealSummary = { id: 'meal-2', name: 'Lunch bowl', itemCount: 2, kcal: 300, protein: 25 };

beforeEach(() => {
  mockDeleteMeal.mockReset();
  mockRestoreMeal.mockReset();
  mockDeleteMeal.mockReturnValue({ mealId: 'meal-1', itemIds: ['item-1', 'item-2'] });
  useUndoToastStore.getState().dismiss();
});

const renderList = (props: Partial<React.ComponentProps<typeof MealList>> = {}) =>
  render(<MealList db={db} meals={[breakfast]} onSelect={jest.fn()} onCreate={jest.fn()} theme={theme} testID="meal-list" {...props} />);

describe('MealList', () => {
  it('renders every saved meal with its figures and item count', async () => {
    await renderList();

    expect(screen.getByTestId('meal-list-row-meal-1-name')).toHaveTextContent('Breakfast bowl');
    expect(screen.getByTestId('meal-list-row-meal-1-meta')).toHaveTextContent('3 items');
    // Issue #124: the protein figure renders through the shared `formatGrams`, not a hand-built
    // `` `${n} g` ``.
    expect(screen.getByTestId('meal-list-row-meal-1-protein')).toHaveTextContent('30 g');
  });

  it('tapping a meal calls onSelect with that meal, to edit it', async () => {
    const onSelect = jest.fn();
    await renderList({ onSelect });

    await fireEvent.press(screen.getByTestId('meal-list-row-meal-1'));

    expect(onSelect).toHaveBeenCalledWith(breakfast);
    expect(mockDeleteMeal).not.toHaveBeenCalled();
  });

  it('tapping "New meal" calls onCreate', async () => {
    const onCreate = jest.fn();
    await renderList({ onCreate });

    await fireEvent.press(screen.getByTestId('meal-list-add'));

    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('shows a teaching empty state, and still offers New meal, with no saved meals', async () => {
    await renderList({ meals: [] });

    expect(screen.getByTestId('meal-list-empty')).toBeTruthy();
    expect(screen.getByTestId('meal-list-empty').props.accessibilityLabel).toMatch(/no saved meals yet/i);
    expect(screen.getByTestId('meal-list-add')).toBeTruthy();
  });

  it('every row and New meal carry an accessibility label and role', async () => {
    await renderList();

    const row = screen.getByTestId('meal-list-row-meal-1');
    const add = screen.getByTestId('meal-list-add');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Edit Breakfast bowl');
    expect(add.props.accessibilityRole).toBe('button');
    expect(add.props.accessibilityLabel).toBe('New meal');
  });
});

describe('MealList swipe-to-delete (issue #101)', () => {
  it('swiping delete tombstones the meal, removes the row, and shows undo — no confirmation', async () => {
    await renderList({ meals: [breakfast, lunch] });

    await fireEvent.press(screen.getByTestId('meal-list-row-meal-1-delete'));

    expect(mockDeleteMeal).toHaveBeenCalledWith(db, { at: expect.any(Number), id: 'meal-1' });
    expect(screen.queryByTestId('meal-list-row-meal-1')).toBeNull();
    expect(screen.getByTestId('meal-list-row-meal-2')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the toast names the meal and its figures, fires the destructive haptic', async () => {
    await renderList();

    await fireEvent.press(screen.getByTestId('meal-list-row-meal-1-delete'));

    expect(mockFireHaptic).toHaveBeenCalledWith(haptics.destructiveConfirm);
    expect(useUndoToastStore.getState().toast?.title).toBe('Breakfast bowl');
    expect(useUndoToastStore.getState().toast?.meta).toBe('420 kcal · 30 g protein');
  });

  it('the toast carries action, not token — a meal tombstone has no UndoToken', async () => {
    await renderList();

    await fireEvent.press(screen.getByTestId('meal-list-row-meal-1-delete'));

    const toast = useUndoToastStore.getState().toast;
    expect(toast?.token).toBeUndefined();
    expect(typeof toast?.action).toBe('function');
    expect(toast?.verb).toBe('deleting');
  });

  it('undo (the toast action) calls restoreMeal with the delete receipt and restores the row', async () => {
    mockDeleteMeal.mockReturnValue({ mealId: 'meal-1', itemIds: ['item-1', 'item-2'] });
    await renderList();

    await fireEvent.press(screen.getByTestId('meal-list-row-meal-1-delete'));
    await act(async () => {
      useUndoToastStore.getState().toast?.action?.();
    });

    expect(mockRestoreMeal).toHaveBeenCalledWith(db, { at: expect.any(Number), mealId: 'meal-1', itemIds: ['item-1', 'item-2'] });
    expect(screen.getByTestId('meal-list-row-meal-1')).toBeTruthy();
  });

  it('a failed delete is swallowed, leaves the row in place, and shows no toast', async () => {
    mockDeleteMeal.mockImplementation(() => {
      throw new VitalsDbError('not_found', 'gone');
    });
    await renderList();

    await expect(fireEvent.press(screen.getByTestId('meal-list-row-meal-1-delete'))).resolves.not.toThrow();

    expect(screen.getByTestId('meal-list-row-meal-1')).toBeTruthy();
    expect(useUndoToastStore.getState().toast).toBeNull();
  });

  it('exposes an accessibility delete action, equivalent to a physical swipe', async () => {
    await renderList();

    const row = screen.getByTestId('meal-list-row-meal-1');
    expect(row.props.accessibilityActions).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'delete' })]));

    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });

    expect(mockDeleteMeal).toHaveBeenCalledWith(db, { at: expect.any(Number), id: 'meal-1' });
  });
});
