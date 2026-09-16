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
 * SEARCH-AND-LOG BUDGETS (issue #23's 2026-09-11 update, added once #69-#71 shipped):
 *
 *   - recent (not one of the six)  : bar tap + row tap = 2 taps, zero `fireEvent.changeText` calls
 *   - known food via search        : bar tap + row tap = 2 taps, plus the query text
 *   - brand-new via Create "‹q›"   : bar tap + Create tap + Save tap = 3 fixed taps, plus whatever
 *                                    text/steppers fill in the name and the numbers (the query
 *                                    pre-fills the name field, so only the numbers need setting) —
 *                                    and it must end on `createFoodAndLog` (logged), never the plain
 *                                    `createFood` a "just saved" path would call instead.
 *
 * Same throw-not-null discipline as the grid budgets above: every assertion below is `getByTestId`,
 * never `queryByTestId`, so a future tap added anywhere in this chain — a confirmation step before
 * the row logs, a second screen between Create and the form, a Save that stops short of logging —
 * fails the test that owns that step, not a silent pass.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import TodayScreen from '../app/(tabs)/index';
import { DbProvider } from '../src/components/db/DbProvider';
import { ThemeContext } from '../src/components/theme/theme-context';
import {
  addPortion,
  createFoodAndLog,
  dayLog,
  getSettings,
  logFood,
  quickAddCandidates,
  recentFoods,
  searchFoods,
  todayTotals,
  weightSummary,
  type FoodCandidate,
  type FoodRow,
  type LogReceipt,
} from '../src/db';
import { __resetLogTracker } from '../src/store/logTracker';
import { useUndoToastStore } from '../src/store/undoToast';
import { themes } from '../src/theme/tokens';

jest.mock('react-native-reanimated', () => jest.requireActual('../src/components/today/test-support/reanimated-mock'));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    const react = jest.requireActual<typeof import('react')>('react');
    react.useEffect(() => {
      cb();
    }, []);
  },
}));
jest.mock('../src/db', () => ({
  ...jest.requireActual<typeof import('../src/db')>('../src/db'),
  quickAddCandidates: jest.fn(),
  getSettings: jest.fn(),
  todayTotals: jest.fn(),
  weightSummary: jest.fn(),
  logFood: jest.fn(),
  addPortion: jest.fn(),
  dayLog: jest.fn(),
  getMeal: jest.fn(),
  recentFoods: jest.fn(),
  searchFoods: jest.fn(),
  createFoodAndLog: jest.fn(),
}));

const mockCandidates = jest.mocked(quickAddCandidates);
const mockGetSettings = jest.mocked(getSettings);
const mockTodayTotals = jest.mocked(todayTotals);
const mockWeightSummary = jest.mocked(weightSummary);
const mockLogFood = jest.mocked(logFood);
const mockAddPortion = jest.mocked(addPortion);
const mockDayLog = jest.mocked(dayLog);
const mockRecentFoods = jest.mocked(recentFoods);
const mockSearchFoods = jest.mocked(searchFoods);
const mockCreateFoodAndLog = jest.mocked(createFoodAndLog);

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

/** A food that is *not* one of the six on the grid — every search-and-log budget below taps this
 * one, exactly the case the issue's 2026-09-11 update describes ("recent food, not in the six"). */
const eggs: FoodCandidate = {
  kind: 'food',
  id: 'food-2',
  name: 'Boiled eggs',
  brand: null,
  servingLabel: '2 eggs',
  servingGrams: 100,
  kcal: 140,
  protein: 12,
  useCount: 1,
  lastUsedAt: null,
};

const eggsReceipt: LogReceipt = {
  target: { kind: 'food', id: 'food-2' },
  entries: [
    {
      id: 'log-2',
      updatedAt: 0,
      deleted: 0,
      loggedAt: 0,
      localDate: '2025-03-10',
      localMinute: 415,
      foodId: 'food-2',
      mealId: null,
      qty: 1,
      grams: null,
      kcal: 140,
      protein: 12,
      slot: 'breakfast',
    },
  ],
  portions: 1,
  undo: { kind: 'unlog', logIds: ['log-2'] },
};

function eggsFoodRow(overrides: Partial<FoodRow> = {}): FoodRow {
  return {
    id: 'food-2',
    updatedAt: 0,
    deleted: 0,
    name: 'Boiled eggs',
    brand: null,
    servingLabel: '2 eggs',
    servingGrams: 100,
    kcalPerServing: 140,
    proteinPerServing: 12,
    archived: 0,
    useCount: 0,
    lastUsedAt: null,
    hourHistogram: null,
    searchText: '',
    ...overrides,
  };
}

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
  // Neutral defaults for the search-and-log budgets below — each test overrides what it needs.
  mockRecentFoods.mockReturnValue([]);
  mockSearchFoods.mockReturnValue([]);
  // TodayScreen renders the real `<DayLogList>` (issue #61); the tap-budget assertions don't care
  // about day-log content, so an empty day is a neutral default. `getMeal` is mocked in the module
  // factory too, but a row is never present here to trigger it.
  mockDayLog.mockReturnValue([]);
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

describe('tap-count budget — search and create (issue #23, 2026-09-11 update)', () => {
  it('recent food, not one of the six: two taps, zero typing, reaches "food logged"', async () => {
    mockRecentFoods.mockReturnValue([eggs]);
    mockLogFood.mockReturnValue(eggsReceipt);
    await renderToday();

    // Tap 1 — open the sheet. `recentFoods` is read the instant it opens, before any query exists.
    await fireEvent.press(screen.getByTestId('today-search-sheet-bar'));
    // No `fireEvent.changeText` anywhere in this test — the budget is "no typing", not "little
    // typing", and a `search-sheet-input` that ever gated this row would make this assertion fail
    // (the row lives under Recent, never under Results, for an empty query).
    expect(screen.getByTestId('today-search-sheet-row-food-food-2-name')).toHaveTextContent('Boiled eggs');

    // Tap 2 — the row itself.
    await fireEvent.press(screen.getByTestId('today-search-sheet-row-food-food-2'));

    expect(mockLogFood).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('today-undo-toast-title')).toHaveTextContent('Boiled eggs');
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,140');
  });

  it('a recent tap that fails to write never raises the toast — no free pass through the 2-tap budget', async () => {
    mockRecentFoods.mockReturnValue([eggs]);
    const { VitalsDbError } = jest.requireActual<typeof import('../src/db')>('../src/db');
    mockLogFood.mockImplementation(() => {
      throw new VitalsDbError('not_found', 'food gone');
    });
    await renderToday();

    await fireEvent.press(screen.getByTestId('today-search-sheet-bar'));
    await fireEvent.press(screen.getByTestId('today-search-sheet-row-food-food-2'));

    expect(screen.queryByTestId('today-undo-toast-title')).toBeNull();
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,000');
  });

  it('a known food via search: two taps plus the query text reaches "food logged"', async () => {
    mockSearchFoods.mockReturnValue([eggs]);
    mockLogFood.mockReturnValue(eggsReceipt);
    await renderToday();

    // Tap 1 — open the sheet.
    await fireEvent.press(screen.getByTestId('today-search-sheet-bar'));
    // The query text the budget explicitly allows on top of the two taps — not a tap itself.
    await fireEvent.changeText(screen.getByTestId('today-search-sheet-input'), 'egg');
    expect(mockSearchFoods).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ query: 'egg' }));
    expect(screen.getByTestId('today-search-sheet-section-results')).toBeTruthy();

    // Tap 2 — the matched row.
    await fireEvent.press(screen.getByTestId('today-search-sheet-row-food-food-2'));

    expect(mockLogFood).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('today-undo-toast-title')).toHaveTextContent('Boiled eggs');
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,140');
  });

  it('a brand-new food via Create: three fixed taps plus name/numbers, and it ends logged — not merely saved', async () => {
    // No results for this query — the trailing Create row is the only way forward, exactly the case
    // the issue describes ("brand-new food").
    mockSearchFoods.mockReturnValue([]);
    const newFoodReceipt: LogReceipt = {
      target: { kind: 'food', id: 'food-3' },
      entries: [
        {
          id: 'log-3',
          updatedAt: 0,
          deleted: 0,
          loggedAt: 0,
          localDate: '2025-03-10',
          localMinute: 415,
          foodId: 'food-3',
          mealId: null,
          qty: 1,
          grams: null,
          kcal: 210,
          protein: 25,
          slot: 'breakfast',
        },
      ],
      portions: 1,
      undo: { kind: 'unlog', logIds: ['log-3'] },
    };
    mockCreateFoodAndLog.mockReturnValue({ food: eggsFoodRow({ id: 'food-3', name: 'Protein bar' }), receipt: newFoodReceipt });
    await renderToday();

    // Tap 1 — open the sheet.
    await fireEvent.press(screen.getByTestId('today-search-sheet-bar'));
    // Query text, not a tap — and it is what pre-fills the create sheet's name field below.
    await fireEvent.changeText(screen.getByTestId('today-search-sheet-input'), 'Protein bar');

    // Tap 2 — the trailing Create row.
    await fireEvent.press(screen.getByTestId('today-search-sheet-create'));

    expect(screen.getByTestId('today-create-food-sheet-form-name').props.value).toBe('Protein bar');

    // Filling in the numbers: steppers and a serving-label field, never a keyboard number field
    // (`FoodForm`'s own tap doctrine) — none of this counts against the 3 *fixed* taps the issue's
    // budget allows on top of "name and numbers".
    await fireEvent.changeText(screen.getByTestId('today-create-food-sheet-form-serving-label'), '1 bar');
    await fireEvent.press(screen.getByTestId('today-create-food-sheet-form-kcal-increase'));
    await fireEvent.press(screen.getByTestId('today-create-food-sheet-form-protein-increase'));

    // Tap 3 — Save.
    await fireEvent.press(screen.getByTestId('today-create-food-sheet-form-save'));

    // "Ends logged, not merely saved": `createFoodAndLog`, the one write that both creates the food
    // and logs a serving in the same transaction — never a plain `createFood` a "just saved" path
    // would call instead (there is nothing else mocked here that could satisfy this assertion).
    expect(mockCreateFoodAndLog).toHaveBeenCalledTimes(1);
    expect(mockCreateFoodAndLog.mock.calls[0]?.[1]).toMatchObject({ food: expect.objectContaining({ name: 'Protein bar' }) });
    expect(screen.getByTestId('today-undo-toast-title')).toHaveTextContent('Protein bar');
    expect(screen.queryByTestId('today-create-food-sheet')).toBeNull();

    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,210');
  });

  it('a failed Save on the Create path never closes the sheet or raises the toast — "merely saved" never happens either', async () => {
    mockSearchFoods.mockReturnValue([]);
    const { VitalsDbError } = jest.requireActual<typeof import('../src/db')>('../src/db');
    mockCreateFoodAndLog.mockImplementation(() => {
      throw new VitalsDbError('invalid_input', 'nope');
    });
    await renderToday();

    await fireEvent.press(screen.getByTestId('today-search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('today-search-sheet-input'), 'Protein bar');
    await fireEvent.press(screen.getByTestId('today-search-sheet-create'));
    await fireEvent.changeText(screen.getByTestId('today-create-food-sheet-form-serving-label'), '1 bar');
    await fireEvent.press(screen.getByTestId('today-create-food-sheet-form-save'));

    expect(screen.queryByTestId('today-undo-toast-title')).toBeNull();
    expect(screen.getByTestId('today-create-food-sheet')).toBeTruthy();
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,000');
  });

  it('a brand-new food from the pinned blank-sheet row: three fixed taps and no throwaway query, and it ends logged', async () => {
    // Issue #97: before this, the Create row only existed while typing, so reaching a blank form
    // meant inventing throwaway letters just to make the row appear at all. The budget this proves
    // is that the pinned "+ Create new food" row removes exactly that — zero `fireEvent.changeText`
    // calls on `today-search-sheet-input`, the search bar itself, anywhere in this test. It is
    // *not* a claim that the form needs no typing at all: `FoodForm` requires a non-empty name and
    // serving label regardless of entry point (`FoodForm.tsx`'s own `firstError`), and unlike the
    // query-seeded Create row, a blank query pre-fills nothing, so the name field starts empty too.
    // That data entry is the same "plus whatever text/steppers fill in the name and the numbers"
    // the query-seeded Create case above already spends on top of its 3 fixed taps — here it is
    // just one field more, because there is no query left to pre-fill it.
    mockRecentFoods.mockReturnValue([]);
    const blankFoodReceipt: LogReceipt = {
      target: { kind: 'food', id: 'food-4' },
      entries: [
        {
          id: 'log-4',
          updatedAt: 0,
          deleted: 0,
          loggedAt: 0,
          localDate: '2025-03-10',
          localMinute: 415,
          foodId: 'food-4',
          mealId: null,
          qty: 1,
          grams: null,
          kcal: 90,
          protein: 15,
          slot: 'breakfast',
        },
      ],
      portions: 1,
      undo: { kind: 'unlog', logIds: ['log-4'] },
    };
    mockCreateFoodAndLog.mockReturnValue({ food: eggsFoodRow({ id: 'food-4', name: 'Rice cake' }), receipt: blankFoodReceipt });
    await renderToday();

    // Tap 1 — open the sheet. The pinned row is there immediately, before any query exists and
    // with zero `recentFoods`/library items to fall back on — nothing to type to make it appear.
    await fireEvent.press(screen.getByTestId('today-search-sheet-bar'));
    expect(screen.getByTestId('today-search-sheet-create-new')).toBeTruthy();

    // Tap 2 — the pinned row itself, never the trailing `Create "‹query›"` row (there is no query).
    await fireEvent.press(screen.getByTestId('today-search-sheet-create-new'));

    // Blank, not pre-filled — the whole point of #97 is a genuinely blank form, not a query in
    // disguise.
    expect(screen.getByTestId('today-create-food-sheet-form-name').props.value).toBe('');

    await fireEvent.changeText(screen.getByTestId('today-create-food-sheet-form-name'), 'Rice cake');
    await fireEvent.changeText(screen.getByTestId('today-create-food-sheet-form-serving-label'), '1 cake');
    await fireEvent.press(screen.getByTestId('today-create-food-sheet-form-kcal-increase'));
    await fireEvent.press(screen.getByTestId('today-create-food-sheet-form-protein-increase'));

    // Tap 3 — Save.
    await fireEvent.press(screen.getByTestId('today-create-food-sheet-form-save'));

    // Ends logged — `createFoodAndLog`, never a plain `createFood` a "just saved" path would call.
    expect(mockCreateFoodAndLog).toHaveBeenCalledTimes(1);
    expect(mockCreateFoodAndLog.mock.calls[0]?.[1]).toMatchObject({ food: expect.objectContaining({ name: 'Rice cake' }) });
    expect(screen.getByTestId('today-undo-toast-title')).toHaveTextContent('Rice cake');
    expect(screen.queryByTestId('today-create-food-sheet')).toBeNull();

    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,090');

    // No `fireEvent.changeText` on the search bar anywhere above — confirmed by never touching
    // `mockSearchFoods` with a query, which a typed character would have triggered via `SearchSheet`'s
    // own `results` memo.
    expect(mockSearchFoods).not.toHaveBeenCalled();
  });

  // No separate failed-Save companion for the blank-sheet route: `CreateFoodSheet.handleSave`'s
  // catch block (asserted above for the query-seeded Create row) does not branch on how `query`
  // was seeded — `''` and `'Protein bar'` both just sit in the same `createQuery` state and the
  // same try/catch. A second copy here would execute the identical code path under a different
  // label, not prove anything the existing negative test does not already cover.
});
