/**
 * `<MealList>` — issue #43's "saved meals: log as one tap". Tap a meal to log one portion of it
 * immediately, haptic and undo toast, no dialog, no navigation — the same tap doctrine the quick-add
 * grid follows for a food. "+ New meal" is the only way in to `<MealForm>`; a catalogue with no
 * saved meals yet teaches the user that.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { MealSummary } from '../../db';
import { logMeal, VitalsDbError } from '../../db';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { useUndoToastStore } from '../../store/undoToast';
import { haptics, themes } from '../../theme/tokens';
import { MealList } from './MealList';

jest.mock('../../db', () => ({
  ...jest.requireActual<typeof import('../../db')>('../../db'),
  logMeal: jest.fn(),
}));
jest.mock('../../hooks/useHapticFeedback');

const mockLogMeal = jest.mocked(logMeal);
const mockFireHaptic = jest.fn();
jest.mocked(useHapticFeedback).mockReturnValue(mockFireHaptic);

const theme = themes.dark;

const breakfast: MealSummary = { id: 'meal-1', name: 'Breakfast bowl', itemCount: 3, kcal: 420, protein: 30 };

beforeEach(() => {
  useUndoToastStore.getState().dismiss();
});

describe('MealList', () => {
  it('renders every saved meal with its figures and item count', async () => {
    await render(<MealList db={{} as never} meals={[breakfast]} onLogged={jest.fn()} onCreate={jest.fn()} theme={theme} testID="meal-list" />);

    expect(screen.getByTestId('meal-list-row-meal-1-name')).toHaveTextContent('Breakfast bowl');
    expect(screen.getByTestId('meal-list-row-meal-1-meta')).toHaveTextContent('3 items');
    // Issue #124: the protein figure renders through the shared `formatGrams`, not a hand-built
    // `` `${n} g` ``.
    expect(screen.getByTestId('meal-list-row-meal-1-protein')).toHaveTextContent('30 g');
  });

  it('tapping a meal logs one portion, fires the log haptic, and shows the undo toast', async () => {
    mockLogMeal.mockReturnValue({
      target: { kind: 'meal', id: 'meal-1' },
      entries: [],
      portions: 1,
      undo: { kind: 'unlog', logIds: ['log-1'] },
    });
    const onLogged = jest.fn();
    await render(<MealList db={{} as never} meals={[breakfast]} onLogged={onLogged} onCreate={jest.fn()} theme={theme} testID="meal-list" />);

    await fireEvent.press(screen.getByTestId('meal-list-row-meal-1'));

    expect(mockLogMeal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mealId: 'meal-1' }));
    expect(mockFireHaptic).toHaveBeenCalledWith(haptics.foodLogged);
    expect(useUndoToastStore.getState().toast?.title).toBe('Breakfast bowl');
    expect(onLogged).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed log without crashing or showing a toast', async () => {
    mockLogMeal.mockImplementation(() => {
      throw new VitalsDbError('not_found', 'meal gone');
    });
    await render(<MealList db={{} as never} meals={[breakfast]} onLogged={jest.fn()} onCreate={jest.fn()} theme={theme} testID="meal-list" />);

    await fireEvent.press(screen.getByTestId('meal-list-row-meal-1'));

    expect(useUndoToastStore.getState().toast).toBeNull();
  });

  it('tapping "New meal" calls onCreate', async () => {
    const onCreate = jest.fn();
    await render(<MealList db={{} as never} meals={[breakfast]} onLogged={jest.fn()} onCreate={onCreate} theme={theme} testID="meal-list" />);

    await fireEvent.press(screen.getByTestId('meal-list-add'));

    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('shows a teaching empty state, and still offers New meal, with no saved meals', async () => {
    await render(<MealList db={{} as never} meals={[]} onLogged={jest.fn()} onCreate={jest.fn()} theme={theme} testID="meal-list" />);

    expect(screen.getByTestId('meal-list-empty')).toBeTruthy();
    expect(screen.getByTestId('meal-list-empty').props.accessibilityLabel).toMatch(/no saved meals yet/i);
    expect(screen.getByTestId('meal-list-add')).toBeTruthy();
  });

  it('every row and New meal carry an accessibility label and role', async () => {
    await render(<MealList db={{} as never} meals={[breakfast]} onLogged={jest.fn()} onCreate={jest.fn()} theme={theme} testID="meal-list" />);

    const row = screen.getByTestId('meal-list-row-meal-1');
    const add = screen.getByTestId('meal-list-add');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toMatch(/log breakfast bowl/i);
    expect(add.props.accessibilityRole).toBe('button');
    expect(add.props.accessibilityLabel).toBe('New meal');
  });
});
