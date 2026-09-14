/**
 * The Today screen (issue #41 composes #40's quick-add grid with the date header, the two rings
 * and the weight chip): it renders inside the app's real providers, in the theme's canvas colour,
 * with every section mounted — not a placeholder — and a tile tap moves the rings without a
 * second database read.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import {
  createFoodAndLog,
  dayLog,
  getSettings,
  logFood,
  quickAddCandidates,
  softDeleteLogEntries,
  todayTotals,
  undo,
  updateLogEntry,
  weightSummary,
  type DayLogEntry,
  type FoodCandidate,
  type LogReceipt,
} from '../../src/db';
import { __resetLogTracker } from '../../src/store/logTracker';
import { motion, themes } from '../../src/theme/tokens';
import TodayScreen from './index';

jest.mock('react-native-reanimated', () => jest.requireActual('../../src/components/today/test-support/reanimated-mock'));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../src/db', () => ({
  ...jest.requireActual<typeof import('../../src/db')>('../../src/db'),
  quickAddCandidates: jest.fn().mockReturnValue([]),
  recentFoods: jest.fn().mockReturnValue([]),
  searchFoods: jest.fn().mockReturnValue([]),
  getSettings: jest.fn(),
  todayTotals: jest.fn(),
  weightSummary: jest.fn(),
  logFood: jest.fn(),
  undo: jest.fn(),
  dayLog: jest.fn().mockReturnValue([]),
  updateLogEntry: jest.fn(),
  softDeleteLogEntries: jest.fn(),
  createFoodAndLog: jest.fn(),
}));

const mockGetSettings = jest.mocked(getSettings);
const mockTodayTotals = jest.mocked(todayTotals);
const mockWeightSummary = jest.mocked(weightSummary);
const mockLogFood = jest.mocked(logFood);
const mockUndo = jest.mocked(undo);
const mockDayLog = jest.mocked(dayLog);
const mockUpdateLogEntry = jest.mocked(updateLogEntry);
const mockSoftDelete = jest.mocked(softDeleteLogEntries);
const mockCreateFoodAndLog = jest.mocked(createFoodAndLog);

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

const loggedYoghurt: DayLogEntry = {
  id: 'log-1',
  updatedAt: 0,
  deleted: 0,
  loggedAt: 0,
  localDate: '2025-03-10',
  localMinute: 415,
  foodId: 'food-1',
  mealId: null,
  qty: 1,
  grams: 170,
  kcal: 120,
  protein: 20,
  slot: 'breakfast',
  foodName: 'Greek yoghurt',
  brand: null,
  servingLabel: '1 pot',
  mealName: null,
};

const receipt: LogReceipt = {
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

beforeEach(() => {
  mockGetSettings.mockReturnValue({ kcalTarget: 2400, proteinTarget: 180, weekStart: 1, isDefault: false });
  mockTodayTotals.mockReturnValue({
    localDate: '2025-03-10',
    kcal: 1240,
    protein: 96,
    kcalTarget: 2400,
    proteinTarget: 180,
    entryCount: 3,
  });
  mockWeightSummary.mockReturnValue({ latest: null, avg7: null, avg7PrevWeek: null, weeklyDelta: null });
  // Every test's frozen clock lands on the same instant — without this, a tile "logged" by an
  // earlier test in this file still looks like a double-tap to `logTracker`'s repeat window.
  __resetLogTracker();
});

const renderScreen = () =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <TodayScreen />
      </ThemeContext.Provider>
    </DbProvider>,
  );

describe('TodayScreen', () => {
  it('mounts the date header, both rings, the quick-add grid and the weight chip — no placeholder', async () => {
    await renderScreen();

    expect(screen.getByTestId('today-screen')).toBeTruthy();
    expect(screen.getByTestId('today-header')).toBeTruthy();
    expect(screen.getByTestId('today-header-kcal-arc')).toBeTruthy();
    expect(screen.getByTestId('today-header-protein-arc')).toBeTruthy();
    expect(screen.getByTestId('quick-add-grid')).toBeTruthy();
    expect(screen.getByTestId('weight-chip')).toBeTruthy();
    // No workout chip, no placeholder for it (issue #41's acceptance criteria).
    expect(screen.queryByTestId('workout-chip')).toBeNull();
  });

  it('mounts the "Search foods" bar directly under the quick-add grid — no header search button (issue #69)', async () => {
    await renderScreen();

    expect(screen.getByTestId('today-search-sheet-bar')).toBeTruthy();
    expect(screen.getByTestId('today-search-sheet-bar').props.accessibilityRole).toBe('button');
  });

  it('feeds the rings from todayTotals against the getSettings targets', async () => {
    await renderScreen();
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,240');
    expect(ring.getByTestId('arc-target-text').props.children).toBe('of 2,400');
  });

  it('a quick-add tap moves the kcal ring immediately, with no second database read', async () => {
    jest.mocked(quickAddCandidates).mockReturnValue([yoghurt]);
    mockLogFood.mockReturnValue(receipt);
    await renderScreen();

    await fireEvent.press(screen.getByTestId('quick-add-grid-tile-food-1'));

    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,360');
    expect(mockTodayTotals).toHaveBeenCalledTimes(1);
  });

  it('renders the undo toast, and undoing a fresh log calls undo() and moves the ring back', async () => {
    jest.mocked(quickAddCandidates).mockReturnValue([yoghurt]);
    mockLogFood.mockReturnValue(receipt);
    await renderScreen();

    await fireEvent.press(screen.getByTestId('quick-add-grid-tile-food-1'));
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,360');

    expect(screen.getByTestId('today-undo-toast-title')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('today-undo-toast-undo'));

    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo.mock.calls[0]?.[1]).toMatchObject({ token: receipt.undo });
    expect(ring.getByTestId('arc-value').props.children).toBe('1,240');

    // The toast fades out (`toastOut`) rather than vanishing mid-tween — it is gone once that
    // finishes, not before.
    await act(async () => {
      jest.advanceTimersByTime(motion.events.toastOut.duration);
    });
    expect(screen.queryByTestId('today-undo-toast-title')).toBeNull();
  });

  it("mounts today's log below the grid, reading dayLog once up front (issue #42)", async () => {
    mockDayLog.mockReturnValue([loggedYoghurt]);
    await renderScreen();

    expect(screen.getByTestId('day-log-list')).toBeTruthy();
    expect(screen.getByTestId('day-log-list-row-log-1-name')).toHaveTextContent('Greek yoghurt');
    expect(mockDayLog).toHaveBeenCalledTimes(1);
  });

  it('a quick-add tap tells the day log to refetch, on top of moving the ring', async () => {
    jest.mocked(quickAddCandidates).mockReturnValue([yoghurt]);
    mockLogFood.mockReturnValue(receipt);
    mockDayLog.mockReturnValue([]);
    await renderScreen();
    expect(mockDayLog).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('quick-add-grid-tile-food-1'));

    expect(mockDayLog).toHaveBeenCalledTimes(2);
  });

  it('deleting a row from the day log moves the ring back down, through the same shared handler', async () => {
    // The first read (mount) still has the row; the day log's own refetch, woken by the same
    // `dayLogVersion` bump that moves the ring, reflects the delete already committed to SQLite —
    // exactly what the mock is standing in for here.
    mockDayLog.mockReturnValueOnce([loggedYoghurt]).mockReturnValue([]);
    mockSoftDelete.mockReturnValue({ undo: { kind: 'restore', logIds: ['log-1'] } });
    await renderScreen();
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,240');

    await fireEvent.press(screen.getByTestId('day-log-list-row-log-1-delete'));

    expect(mockSoftDelete).toHaveBeenCalledWith(expect.anything(), { at: expect.any(Number), ids: ['log-1'] });
    expect(screen.queryByTestId('day-log-list-row-log-1')).toBeNull();
    expect(ring.getByTestId('arc-value').props.children).toBe('1,120');
  });

  it('editing a row from the day log moves the ring by the difference, through the same shared handler', async () => {
    const editedYoghurt: DayLogEntry = { ...loggedYoghurt, qty: 2, grams: 340, kcal: 240, protein: 40 };
    // See the delete test above: the day log's post-edit refetch stands in for SQLite already
    // reflecting the write by the time it runs.
    mockDayLog.mockReturnValueOnce([loggedYoghurt]).mockReturnValue([editedYoghurt]);
    mockUpdateLogEntry.mockReturnValue({
      entry: editedYoghurt,
      undo: { kind: 'revert', previous: [{ id: 'log-1', qty: 1, grams: 170, kcal: 120, protein: 20, slot: 'breakfast' }] },
    });
    await renderScreen();
    const ring = within(screen.getByTestId('today-header-kcal-arc'));
    expect(ring.getByTestId('arc-value').props.children).toBe('1,240');

    await fireEvent.press(screen.getByTestId('day-log-list-row-log-1'));
    await fireEvent.press(screen.getByTestId('day-log-list-portion-sheet-exact-nudge-up'));
    await fireEvent.press(screen.getByTestId('day-log-list-portion-sheet-exact-log'));

    expect(mockUpdateLogEntry).toHaveBeenCalledTimes(1);
    expect(ring.getByTestId('arc-value').props.children).toBe('1,360');
  });

  it('creating a food from search pre-fills the name, logs one serving on save, and moves the ring (issue #71)', async () => {
    mockDayLog.mockReturnValue([]);
    mockCreateFoodAndLog.mockReturnValue({
      food: {
        id: 'food-9',
        updatedAt: 0,
        deleted: 0,
        name: 'Boiled eggs',
        brand: null,
        servingLabel: '2 eggs',
        servingGrams: null,
        kcalPerServing: 140,
        proteinPerServing: 12,
        archived: 0,
        useCount: 0,
        lastUsedAt: null,
        hourHistogram: null,
        searchText: '',
      },
      receipt: {
        target: { kind: 'food', id: 'food-9' },
        entries: [
          {
            id: 'log-9',
            updatedAt: 0,
            deleted: 0,
            loggedAt: 0,
            localDate: '2025-03-10',
            localMinute: 415,
            foodId: 'food-9',
            mealId: null,
            qty: 1,
            grams: null,
            kcal: 140,
            protein: 12,
            slot: 'breakfast',
          },
        ],
        portions: 1,
        undo: { kind: 'unlog', logIds: ['log-9'] },
      },
    });
    await renderScreen();
    const ring = within(screen.getByTestId('today-header-kcal-arc'));

    await fireEvent.press(screen.getByTestId('today-search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('today-search-sheet-input'), 'Boiled eggs');
    await fireEvent.press(screen.getByTestId('today-search-sheet-create'));

    expect(screen.getByTestId('today-create-food-sheet-form-name').props.value).toBe('Boiled eggs');

    await fireEvent.changeText(screen.getByTestId('today-create-food-sheet-form-serving-label'), '2 eggs');
    await fireEvent.press(screen.getByTestId('today-create-food-sheet-form-save'));

    expect(mockCreateFoodAndLog).toHaveBeenCalledTimes(1);
    expect(mockCreateFoodAndLog.mock.calls[0]?.[1]).toMatchObject({ food: expect.objectContaining({ name: 'Boiled eggs' }) });
    expect(ring.getByTestId('arc-value').props.children).toBe('1,380');
    expect(screen.queryByTestId('today-create-food-sheet')).toBeNull();
  });
});
