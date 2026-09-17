/**
 * `<DayLogList>` — issue #42's day log: renders `dayLog()`, tap a row to edit its amount through
 * #21's `<PortionSheet>` (`updateLogEntry`), swipe to delete (`softDeleteLogEntries`) with undo
 * (`undo`) — never a confirmation dialog — and an empty state for a day with nothing logged yet.
 * Behaviour only, against the real `useUndoToastStore` (the same store `<UndoToast>` reads), not a
 * mock of it — this is what proves the list actually plugs into the shared undo machinery rather
 * than inventing its own.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DayLogEntry, MealDetail } from '../../db';
import { dayLog, getMeal, softDeleteLogEntries, updateLogEntry, VitalsDbError } from '../../db';
import { DbProvider } from '../db/DbProvider';
import { useUndoToastStore } from '../../store/undoToast';
import { ThemeContext } from '../theme/theme-context';
import { themes } from '../../theme/tokens';
import { DayLogList } from './DayLogList';

jest.mock('../../db', () => {
  const actual = jest.requireActual<typeof import('../../db')>('../../db');
  return {
    ...actual,
    dayLog: jest.fn(),
    getMeal: jest.fn(),
    updateLogEntry: jest.fn(),
    softDeleteLogEntries: jest.fn(),
  };
});

const mockDayLog = jest.mocked(dayLog);
const mockGetMeal = jest.mocked(getMeal);
const mockUpdateLogEntry = jest.mocked(updateLogEntry);
const mockSoftDelete = jest.mocked(softDeleteLogEntries);

const yoghurt: DayLogEntry = {
  id: 'log-1',
  updatedAt: 0,
  deleted: 0,
  loggedAt: 0,
  localDate: '2025-03-10',
  localMinute: 480,
  foodId: 'food-1',
  mealId: null,
  qty: 1,
  grams: 170,
  ml: null,
  kcal: 120,
  protein: 20,
  slot: 'breakfast',
  foodName: 'Greek yoghurt',
  brand: 'Fage',
  servingLabel: '1 pot',
  mealName: null,
};

const shake: DayLogEntry = {
  id: 'log-2',
  updatedAt: 0,
  deleted: 0,
  loggedAt: 60_000,
  localDate: '2025-03-10',
  localMinute: 600,
  foodId: null,
  mealId: 'meal-1',
  qty: 1,
  grams: null,
  ml: null,
  kcal: 410,
  protein: 38,
  slot: 'lunch',
  foodName: null,
  brand: null,
  servingLabel: null,
  mealName: 'Post-workout shake',
};

const mealDetail: MealDetail = {
  id: 'meal-1',
  name: 'Post-workout shake',
  itemCount: 3,
  kcal: 410,
  protein: 38,
  items: [],
};

const renderList = (props: Partial<React.ComponentProps<typeof DayLogList>> = {}) =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <DayLogList testID="log" {...props} />
      </ThemeContext.Provider>
    </DbProvider>,
  );

beforeEach(() => {
  mockDayLog.mockReturnValue([yoghurt, shake]);
  mockGetMeal.mockReturnValue(mealDetail);
  useUndoToastStore.getState().dismiss();
});

describe('DayLogList', () => {
  it('renders every entry dayLog returns', async () => {
    await renderList();
    expect(screen.getByTestId('log-row-log-1-name')).toHaveTextContent('Greek yoghurt');
    expect(screen.getByTestId('log-row-log-2-name')).toHaveTextContent('Post-workout shake');
  });

  it('shows an empty state when the day has nothing logged yet', async () => {
    mockDayLog.mockReturnValue([]);
    await renderList();
    expect(screen.getByTestId('log-empty')).toBeTruthy();
    expect(screen.queryByTestId('log-row-log-1-name')).toBeNull();
  });

  it('tapping a food row opens the portion sheet pre-filled at its logged amount', async () => {
    await renderList();

    await fireEvent.press(screen.getByTestId('log-row-log-1'));

    expect(screen.getByTestId('log-portion-sheet-title')).toHaveTextContent('Greek yoghurt');
    expect(screen.getByTestId('log-portion-sheet-exact-readout')).toHaveTextContent('170 g');
  });

  it('tapping a meal row reads the live meal for its item count and opens the sheet', async () => {
    await renderList();

    await fireEvent.press(screen.getByTestId('log-row-log-2'));

    expect(mockGetMeal).toHaveBeenCalledWith(expect.anything(), 'meal-1');
    expect(screen.getByTestId('log-portion-sheet-title')).toHaveTextContent('Post-workout shake');
    expect(screen.getByTestId('log-portion-sheet-exact-readout')).toHaveTextContent('×1');
  });

  it("confirming an edit calls updateLogEntry, updates the row, and shows the undo toast", async () => {
    const onChanged = jest.fn();
    mockUpdateLogEntry.mockReturnValue({
      entry: { ...yoghurt, qty: 2, grams: 340, ml: null, kcal: 240, protein: 40 },
      undo: { kind: 'revert', previous: [{ id: 'log-1', qty: 1, grams: 170, ml: null, kcal: 120, protein: 20, slot: 'breakfast' }] },
    });
    await renderList({ onChanged });

    await fireEvent.press(screen.getByTestId('log-row-log-1'));
    await fireEvent.press(screen.getByTestId('log-portion-sheet-exact-nudge-up'));
    await fireEvent.press(screen.getByTestId('log-portion-sheet-exact-log'));

    expect(mockUpdateLogEntry).toHaveBeenCalledTimes(1);
    expect(mockUpdateLogEntry.mock.calls[0]?.[1]).toMatchObject({ id: 'log-1' });
    expect(screen.getByTestId('log-row-log-1-kcal')).toHaveTextContent('240 kcal');
    expect(onChanged).toHaveBeenCalledWith({ kcal: 120, protein: 20, entryCountDelta: 0 });
    expect(useUndoToastStore.getState().toast?.token).toEqual({
      kind: 'revert',
      previous: [{ id: 'log-1', qty: 1, grams: 170, ml: null, kcal: 120, protein: 20, slot: 'breakfast' }],
    });
    // Issue #124: the toast's meta line renders its protein figure through the shared
    // `formatGrams`, not a hand-built `` `${n} g` ``.
    expect(useUndoToastStore.getState().toast?.meta).toBe('240 kcal · 40 g protein');
    expect(screen.queryByTestId('log-portion-sheet-title')).toBeNull();
  });

  it('a failed edit is swallowed, never a crash or a dialog', async () => {
    mockUpdateLogEntry.mockImplementation(() => {
      throw new VitalsDbError('not_found', 'gone');
    });
    await renderList();

    await fireEvent.press(screen.getByTestId('log-row-log-1'));
    await expect(fireEvent.press(screen.getByTestId('log-portion-sheet-exact-log'))).resolves.not.toThrow();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('swiping delete removes the row, calls softDeleteLogEntries, and shows undo — no confirmation', async () => {
    const onChanged = jest.fn();
    mockSoftDelete.mockReturnValue({ undo: { kind: 'restore', logIds: ['log-1'] } });
    await renderList({ onChanged });

    await fireEvent.press(screen.getByTestId('log-row-log-1-delete'));

    expect(mockSoftDelete).toHaveBeenCalledWith(expect.anything(), { at: expect.any(Number), ids: ['log-1'] });
    expect(screen.queryByTestId('log-row-log-1')).toBeNull();
    expect(screen.getByTestId('log-row-log-2')).toBeTruthy();
    expect(onChanged).toHaveBeenCalledWith({ kcal: -120, protein: -20, entryCountDelta: -1 });
    expect(useUndoToastStore.getState().toast?.token).toEqual({ kind: 'restore', logIds: ['log-1'] });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a failed delete is swallowed and leaves the row in place', async () => {
    mockSoftDelete.mockImplementation(() => {
      throw new VitalsDbError('not_found', 'gone');
    });
    await renderList();

    await expect(fireEvent.press(screen.getByTestId('log-row-log-1-delete'))).resolves.not.toThrow();
    expect(screen.getByTestId('log-row-log-1')).toBeTruthy();
  });

  it('refetches when refreshToken changes, but not on the first mount', async () => {
    const { rerender } = await renderList({ refreshToken: 0 });
    expect(mockDayLog).toHaveBeenCalledTimes(1);

    await rerender(
      <DbProvider db={{} as never}>
        <ThemeContext.Provider value={themes.dark}>
          <DayLogList testID="log" refreshToken={1} />
        </ThemeContext.Provider>
      </DbProvider>,
    );

    expect(mockDayLog).toHaveBeenCalledTimes(2);
  });
});
