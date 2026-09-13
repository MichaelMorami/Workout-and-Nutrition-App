/**
 * The tap-count budget (issue #23) — priority #2 of `CLAUDE.md` ("minimal taps") as a test that can
 * fail in CI, not a hope.
 *
 * The client's real acceptance test is a phone one: unlock -> open -> tap, food logged, in <=3 taps
 * and under 5 seconds. Unlocking and opening the app are outside anything Jest can drive; the one
 * tap that *is* this harness's business is the tap on the Today screen itself. So the budget this
 * file enforces is:
 *
 *   - one-tap (fast) path  : exactly one `fireEvent.press`
 *   - double-tap path      : exactly two `fireEvent.press` calls on the same tile, the second one
 *                            adding a portion rather than a second entry
 *   - long-press path      : one `longPress` gesture, then exactly one `fireEvent.press` on a
 *                            portion-sheet preset
 *
 * HOW THIS FAILS LOUDLY. Every test below performs *only* the taps its budget allows, then queries
 * for "food logged" with `getByTestId` (which throws if the node is not there) rather than
 * `queryByTestId` (which would just return null and let a broken assertion go quiet). If a future
 * change to the fast path required a second tap to confirm the log — a dialog, a save button, an
 * extra confirmation step — the one-tap test presses once, `getByTestId('...-logged')` finds
 * nothing, and the test fails. There is no code path in this file that tolerates "logged after one
 * more tap than the budget allows".
 *
 * WHY THIS LIVES IN `test/`, NOT NEXT TO THE COMPONENTS. `src/components/quick-add/*.test.tsx` and
 * `app/(tabs)/index.test.tsx` (ui-engineer's files) already prove the mechanics — that a second tap
 * calls `addPortion`, that a long-press opens the sheet, and so on — in detail. This file is
 * deliberately not a copy of that: it is qa-engineer's standing enforcement of the tap *budget*
 * itself, kept in the one path this agent owns, so it survives independently of whoever next
 * touches the Today screen or the quick-add grid.
 *
 * The search-and-log tap budgets from the issue's 2026-09-11 update (recent <=2, known <=2 + query,
 * new <=3 + name/numbers) are not covered here: the "Search foods" bar (#24) has not shipped yet —
 * `app/(tabs)/index.tsx` still carries a `TODO(#24)` where it will mount. There is nothing to press
 * yet. Add that budget here once #24 lands.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import TodayScreen from '../app/(tabs)/index';
import { DbProvider } from '../src/components/db/DbProvider';
import { ThemeContext } from '../src/components/theme/theme-context';
import {
  addPortion,
  getSettings,
  logFood,
  quickAddCandidates,
  todayTotals,
  weightSummary,
  type FoodCandidate,
  type LogReceipt,
} from '../src/db';
import { __resetLogTracker } from '../src/store/logTracker';
import { useUndoToastStore } from '../src/store/undoToast';
import { themes } from '../src/theme/tokens';

jest.mock('react-native-reanimated', () => jest.requireActual('../src/components/today/test-support/reanimated-mock'));
jest.mock('../src/db', () => ({
  ...jest.requireActual<typeof import('../src/db')>('../src/db'),
  quickAddCandidates: jest.fn(),
  getSettings: jest.fn(),
  todayTotals: jest.fn(),
  weightSummary: jest.fn(),
  logFood: jest.fn(),
  addPortion: jest.fn(),
}));

const mockCandidates = jest.mocked(quickAddCandidates);
const mockGetSettings = jest.mocked(getSettings);
const mockTodayTotals = jest.mocked(todayTotals);
const mockWeightSummary = jest.mocked(weightSummary);
const mockLogFood = jest.mocked(logFood);
const mockAddPortion = jest.mocked(addPortion);

/** The one candidate every test taps — a saved food already in the top six, exactly the case the
 * client described ("log a saved food"). */
const yoghurt: FoodCandidate = {
  kind: 'food',
  id: 'food-1',
  name: 'Greek yoghurt',
  brand: null,
  servingLabel: '1 pot',
  servingGrams: 170,
  kcal: 120,
  protein: 20,
  useCount: 4,
  lastUsedAt: null,
};

const freshReceipt: LogReceipt = {
  target: { kind: 'food', id: 'food-1' },
  entries: [
    {
      id: 'log-1',
      updatedAt: 0,
      deleted: 0,
      loggedAt: 0,
      localDate: '2025-03-10',
      localMinute: 415,
      foodId: 'food-1',
      mealId: null,
      qty: 1,
      grams: null,
      kcal: 120,
      protein: 20,
      slot: 'breakfast',
    },
  ],
  portions: 1,
  undo: { kind: 'unlog', logIds: ['log-1'] },
};

/** What a second tap's `addPortion` reports: the same row, doubled — issue #21's contract. */
const doubledReceipt: LogReceipt = {
  ...freshReceipt,
  entries: [{ ...freshReceipt.entries[0]!, kcal: 240, protein: 40 }],
  portions: 2,
  undo: { kind: 'revert', previous: [freshReceipt.entries[0]!] },
};

beforeEach(() => {
  mockCandidates.mockReturnValue([yoghurt]);
  mockGetSettings.mockReturnValue({ kcalTarget: 2400, proteinTarget: 180, weekStart: 1, isDefault: false });
  mockTodayTotals.mockReturnValue({
    localDate: '2025-03-10',
    kcal: 1000,
    protein: 80,
    kcalTarget: 2400,
    proteinTarget: 180,
    entryCount: 2,
  });
  mockWeightSummary.mockReturnValue({ latest: null, avg7: null, avg7PrevWeek: null, weeklyDelta: null });
  mockLogFood.mockReturnValue(freshReceipt);
  mockAddPortion.mockReturnValue(doubledReceipt);
  // Same reasoning as `app/(tabs)/index.test.tsx`: every test's frozen clock lands on the same
  // instant, so a tile logged by an earlier test in this file never looks like a stale double-tap.
  __resetLogTracker();
  // Without this, a toast one test raised is still up for the next one — the toast store is a
  // module-level zustand singleton, not something `render`'s auto-cleanup touches.
  useUndoToastStore.getState().dismiss();
});

const renderToday = () =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <TodayScreen />
      </ThemeContext.Provider>
    </DbProvider>,
  );

describe('tap-count budget — the Today screen', () => {
  it('the one-tap path: a single tap on a saved food is enough to reach "food logged"', async () => {
    await renderToday();

    await fireEvent.press(screen.getByTestId('quick-add-grid-tile-food-1'));

    // Not `queryByTestId` — this must throw, not report `null`, if one tap stopped being enough.
    expect(screen.getByTestId('quick-add-grid-tile-food-1-logged')).toBeTruthy();
    expect(screen.getByTestId('today-undo-toast-title')).toHaveTextContent('Greek yoghurt');
    expect(mockLogFood).toHaveBeenCalledTimes(1);

    // The ring moved off one tap alone — the client's "in under 5 seconds" is a claim about a
    // synchronous local write, which this is: no second `todayTotals` read after the tap.
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,120');
    expect(mockTodayTotals).toHaveBeenCalledTimes(1);
  });

  it('a failed write from that same one tap never raises the undo toast or moves the ring — a swallowed error is not "food logged"', async () => {
    // The negative case for the assertion above: this suite's "logged" signal is the undo toast and
    // the ring, not the tile's own wash (`QuickAddTile` shows that wash optimistically the instant a
    // tap fires, by design — see `QuickAddGrid`'s module note on why a failed write is swallowed,
    // not surfaced). If a tap ever reached the toast/ring without the write actually landing, this
    // budget test would be trivially satisfiable by a tap that logs nothing.
    const { VitalsDbError } = jest.requireActual<typeof import('../src/db')>('../src/db');
    mockLogFood.mockImplementation(() => {
      throw new VitalsDbError('not_found', 'food gone');
    });
    await renderToday();

    await fireEvent.press(screen.getByTestId('quick-add-grid-tile-food-1'));

    expect(screen.queryByTestId('today-undo-toast-title')).toBeNull();
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,000');
  });

  it('the double-tap path: two taps on the same tile add a second portion, not a second entry', async () => {
    await renderToday();

    await fireEvent.press(screen.getByTestId('quick-add-grid-tile-food-1'));
    await fireEvent.press(screen.getByTestId('quick-add-grid-tile-food-1'));

    expect(mockLogFood).toHaveBeenCalledTimes(1);
    expect(mockAddPortion).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('quick-add-grid-tile-food-1-repeat-badge')).toHaveTextContent('×2');
    expect(screen.getByTestId('today-undo-toast-title')).toHaveTextContent('Greek yoghurt ×2');

    // 120 (first tap) + 120 (the delta the second tap added) — never the doubled receipt's total
    // added on top of the first tap's total, which would silently double-count the portion.
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,240');
  });

  it('the long-press path: a long-press plus one tap on a preset reaches "food logged"', async () => {
    await renderToday();

    await fireEvent(screen.getByTestId('quick-add-grid-tile-food-1'), 'longPress');
    expect(screen.getByTestId('quick-add-grid-portion-sheet-title')).toHaveTextContent('Greek yoghurt');

    await fireEvent.press(screen.getByTestId('quick-add-grid-portion-sheet-step-2'));

    expect(mockLogFood).toHaveBeenCalledTimes(1);
    expect(mockLogFood.mock.calls[0]?.[1]).toMatchObject({ foodId: 'food-1', amount: { servings: 2 } });
    expect(screen.queryByTestId('quick-add-grid-portion-sheet-title')).toBeNull();
    expect(screen.getByTestId('today-undo-toast-title')).toHaveTextContent('Greek yoghurt');

    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,120');
  });

  it('the long-press path never logs from the long-press gesture alone — the sheet is not a fourth way to skip the tap', async () => {
    await renderToday();

    await fireEvent(screen.getByTestId('quick-add-grid-tile-food-1'), 'longPress');

    expect(mockLogFood).not.toHaveBeenCalled();
    expect(mockAddPortion).not.toHaveBeenCalled();
    expect(screen.queryByTestId('today-undo-toast-title')).toBeNull();
  });
});
