/**
 * `<DayLogRow>` — one row of the Today log (issue #42): its own figures, tap to edit, and the
 * swipe-revealed Delete action. Behaviour only — the swipe gesture itself is `PanResponder`-driven
 * (`PortionSheet.tsx`'s own precedent for "no new native dependency"), and its Delete action is a
 * plain `Pressable` always present underneath the row, so a behaviour test exercises it directly by
 * testID rather than simulating a real 60fps drag (the same shortcut `PortionSheet.test.tsx` takes
 * with its slider's nudge buttons instead of a drag).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DayLogEntry } from '../../db';
import { themes } from '../../theme/tokens';
import { DayLogRow, timeLabel } from './DayLogRow';

const foodEntry: DayLogEntry = {
  id: 'log-1',
  updatedAt: 0,
  deleted: 0,
  loggedAt: 0,
  localDate: '2025-03-10',
  localMinute: 480, // 08:00
  foodId: 'food-1',
  mealId: null,
  qty: 1,
  grams: 170,
  kcal: 120,
  protein: 20,
  slot: 'breakfast',
  foodName: 'Greek yoghurt',
  brand: 'Fage',
  servingLabel: '1 pot',
  mealName: null,
};

const renderRow = (props: Partial<React.ComponentProps<typeof DayLogRow>> = {}) =>
  render(
    <DayLogRow entry={foodEntry} theme={themes.dark} onPress={jest.fn()} onDelete={jest.fn()} testID="row" {...props} />,
  );

describe('timeLabel', () => {
  it('formats minutes-after-midnight as HH:MM', () => {
    expect(timeLabel(0)).toBe('00:00');
    expect(timeLabel(480)).toBe('08:00');
    expect(timeLabel(1439)).toBe('23:59');
    expect(timeLabel(65)).toBe('01:05');
  });
});

describe('DayLogRow', () => {
  it('shows the time, name, kcal and protein', async () => {
    await renderRow();
    expect(screen.getByTestId('row-time')).toHaveTextContent('08:00');
    expect(screen.getByTestId('row-name')).toHaveTextContent('Greek yoghurt');
    expect(screen.getByTestId('row-kcal')).toHaveTextContent('120 kcal');
    expect(screen.getByTestId('row-protein')).toHaveTextContent('20 g protein');
  });

  it('falls back to the meal name for a meal row', async () => {
    await renderRow({
      entry: { ...foodEntry, foodId: null, mealId: 'meal-1', mealName: 'Post-workout shake', foodName: null },
    });
    expect(screen.getByTestId('row-name')).toHaveTextContent('Post-workout shake');
  });

  it('tapping the row calls onPress with the entry', async () => {
    const onPress = jest.fn();
    await renderRow({ onPress });

    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).toHaveBeenCalledWith(foodEntry);
  });

  it('tapping the revealed Delete action calls onDelete, never a confirmation dialog', async () => {
    const onDelete = jest.fn();
    const onPress = jest.fn();
    await renderRow({ onDelete, onPress });

    await fireEvent.press(screen.getByTestId('row-delete'));

    expect(onDelete).toHaveBeenCalledWith(foodEntry);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('exposes an accessibility delete action for screen readers, equivalent to a physical swipe', async () => {
    const onDelete = jest.fn();
    await renderRow({ onDelete });

    const row = screen.getByTestId('row');
    expect(row.props.accessibilityActions).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'delete' })]));

    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(onDelete).toHaveBeenCalledWith(foodEntry);
  });

  it('has accessibility labels and a >=44pt target on the row and the delete action', async () => {
    await renderRow();

    const row = screen.getByTestId('row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Greek yoghurt, 120 kcal, 20 g protein, logged at 08:00. Double tap to edit.');

    const del = screen.getByTestId('row-delete');
    expect(del.props.accessibilityRole).toBe('button');
    expect(del.props.accessibilityLabel).toBe('Delete Greek yoghurt');
  });
});
