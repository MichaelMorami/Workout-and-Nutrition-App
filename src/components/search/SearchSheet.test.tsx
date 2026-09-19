/**
 * `<SearchSheet>` — issue #69 built the shell, the bar, and list rendering (Recent vs. Results,
 * saved-meal labelling, the two empty states — asserted below, unchanged). Issue #70 adds row
 * *behaviour*: a tap logs one serving (fresh, or `addPortion` on a repeat tap within
 * `interaction.repeatWindowMs` — the same `logTracker` bookkeeping `QuickAddGrid` uses, shared
 * across tile and row on purpose) with a haptic and an undo toast, then the sheet closes; a
 * long-press opens `<PortionSheet>` (#21) instead. Create's own behaviour is #71.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Pressable, Text, TextInput } from 'react-native';
import type { FoodCandidate, LogReceipt, MealCandidate } from '../../db';
import { addPortion, libraryByUsage, logFood, logMeal, quickAddCandidates, recentFoods, searchFoods, VitalsDbError } from '../../db';
import { __resetLogTracker } from '../../store/logTracker';
import { useUndoToastStore } from '../../store/undoToast';
import { interaction, themes } from '../../theme/tokens';
import { SearchSheet } from './SearchSheet';

jest.mock('../../db', () => ({
  ...jest.requireActual<typeof import('../../db')>('../../db'),
  quickAddCandidates: jest.fn(),
  recentFoods: jest.fn(),
  libraryByUsage: jest.fn(),
  searchFoods: jest.fn(),
  logFood: jest.fn(),
  logMeal: jest.fn(),
  addPortion: jest.fn(),
}));

const mockQuickAdd = jest.mocked(quickAddCandidates);
const mockRecent = jest.mocked(recentFoods);
const mockLibrary = jest.mocked(libraryByUsage);
const mockSearch = jest.mocked(searchFoods);
const mockLogFood = jest.mocked(logFood);
const mockLogMeal = jest.mocked(logMeal);
const mockAddPortion = jest.mocked(addPortion);

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

const eggs: FoodCandidate = {
  kind: 'food',
  id: 'food-2',
  name: 'Boiled eggs',
  brand: null,
  servingLabel: '2 eggs',
  basis: 'volume',
  servingAmount: 90,
  servingGrams: null,
  servingMl: 90,
  kcal: 140,
  protein: 12,
  useCount: 1,
  lastUsedAt: 500,
};

const shake: MealCandidate = {
  kind: 'meal',
  id: 'meal-1',
  name: 'Post-workout shake',
  kcal: 410,
  protein: 38,
  itemCount: 3,
  useCount: 2,
  lastUsedAt: 800,
};

const sixOnGrid = [
  yoghurt,
  shake,
  { ...yoghurt, id: 'food-3', name: 'Oats' },
  { ...yoghurt, id: 'food-4', name: 'Chicken breast' },
  { ...yoghurt, id: 'food-5', name: 'Banana' },
  { ...yoghurt, id: 'food-6', name: 'Almonds' },
];

const renderSheet = (props: Partial<React.ComponentProps<typeof SearchSheet>> = {}) =>
  render(<SearchSheet db={{} as never} theme={theme} testID="search-sheet" {...props} />);

/** Mirrors `QuickAddGrid.test.tsx`'s own `receiptFor` — the two components share the exact write
 * contract (`logFood`/`logMeal`/`addPortion`), so the same fixture shape proves it out here. */
const receiptFor = (candidate: FoodCandidate | MealCandidate): LogReceipt => ({
  target: { kind: candidate.kind, id: candidate.id },
  entries: [
    {
      id: 'log-1',
      updatedAt: 0,
      deleted: 0,
      loggedAt: 0,
      localDate: '2025-03-10',
      localMinute: 415,
      foodId: candidate.kind === 'food' ? candidate.id : null,
      mealId: candidate.kind === 'meal' ? candidate.id : null,
      qty: 1,
      grams: null,
      ml: null,
      kcal: candidate.kcal,
      protein: candidate.protein,
      slot: 'breakfast',
    },
  ],
  portions: 1,
  undo: { kind: 'unlog', logIds: ['log-1'] },
});

beforeEach(() => {
  mockQuickAdd.mockReturnValue(sixOnGrid);
  mockRecent.mockReturnValue([]);
  mockLibrary.mockReturnValue([]);
  mockSearch.mockReturnValue([]);
  __resetLogTracker();
  useUndoToastStore.getState().dismiss();
});

describe('SearchSheet — the bar', () => {
  it('renders a full-width "Search foods" bar with an accessible label and no header search button', async () => {
    await renderSheet();

    const bar = screen.getByTestId('search-sheet-bar');
    expect(bar.props.accessibilityRole).toBe('button');
    expect(bar.props.accessibilityLabel).toMatch(/search foods/i);
  });

  it('shows the day-one emphasis label when the grid has nothing ranked yet', async () => {
    mockQuickAdd.mockReturnValue([]);
    await renderSheet();

    expect(screen.getByTestId('search-sheet-bar').props.accessibilityLabel).toMatch(/add your first food/i);
  });
});

describe('SearchSheet — opening', () => {
  it('opens the sheet with the query field focused, keyboard up, the moment the sheet is shown', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent(screen.getByTestId('search-sheet-modal'), 'show');

    expect(screen.getByTestId('search-sheet-input')).toBeTruthy();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('Cancel closes the sheet', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    expect(screen.getByTestId('search-sheet-input')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('search-sheet-cancel'));

    expect(screen.queryByTestId('search-sheet-input')).toBeNull();
  });
});

describe('SearchSheet — recent', () => {
  it('lists recentFoods for an empty query, without excluding the six on the grid (issue #95)', async () => {
    mockRecent.mockReturnValue([eggs]);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    expect(mockRecent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ days: interaction.recentDays }));
    expect(mockRecent.mock.calls[0]?.[1]).not.toHaveProperty('excludeIds');
    expect(screen.getByTestId('search-sheet-row-food-food-2-name')).toHaveTextContent('Boiled eggs');
    expect(screen.getByTestId('search-sheet-section-recent')).toHaveTextContent('Recent', { exact: false });
    // Issue #124: the row's protein figure renders through the shared `formatGrams`, not a
    // hand-built `` `${n} g` ``.
    expect(screen.getByTestId('search-sheet-row-food-food-2-protein')).toHaveTextContent('12 g');
  });

  it('reads Recent fresh each time the sheet opens: a food logged a moment ago appears at the top on reopen, no reload needed (issue #95)', async () => {
    // First open: nothing recent yet.
    mockRecent.mockReturnValue([]);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    expect(screen.queryByTestId('search-sheet-row-food-food-1-name')).toBeNull();

    // Close the sheet, log yoghurt (as if via the grid), then the very next call to `recentFoods`
    // reflects it — simulated here by changing the mock's return value between opens.
    await fireEvent.press(screen.getByTestId('search-sheet-cancel'));
    mockRecent.mockReturnValue([yoghurt]);

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    expect(screen.getByTestId('search-sheet-row-food-food-1-name')).toHaveTextContent('Greek yoghurt');
  });

  it('still lists a food logged before an app reload (component remount), first in Recent (issue #95)', async () => {
    mockRecent.mockReturnValue([yoghurt, eggs]);
    const first = await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    expect(screen.getByTestId('search-sheet-row-food-food-1-name')).toHaveTextContent('Greek yoghurt');
    await act(async () => {
      first.unmount();
    });

    // Simulated reload: a fresh mount, exactly like Today being reopened after `gear -> reload`.
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    const rows = screen.getAllByText(/Greek yoghurt|Boiled eggs/);
    expect(rows[0]).toHaveTextContent('Greek yoghurt');
    expect(screen.getByTestId('search-sheet-row-food-food-2-name')).toHaveTextContent('Boiled eggs');
  });

  it('shows the "no library yet" empty state, leading to Create, when there is nothing recent — with the pinned create row still above it (issue #97)', async () => {
    mockQuickAdd.mockReturnValue([]);
    mockRecent.mockReturnValue([]);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    const empty = screen.getByTestId('search-sheet-empty');
    expect(empty.props.accessibilityLabel).toMatch(/no foods yet/i);
    expect(screen.queryByTestId('search-sheet-create')).toBeNull();

    expect(screen.getByTestId('search-sheet-create-new')).toBeTruthy();
    const order = screen.getAllByTestId(/^search-sheet-(create-new|empty)$/);
    expect(order.map((el) => el.props.testID)).toEqual(['search-sheet-create-new', 'search-sheet-empty']);
  });

  it('does not show the "no library yet" empty state when the library has items, even if nothing is recent', async () => {
    // `recentFoods` only covers the last `interaction.recentDays` days, while `quickAddCandidates`
    // ranks the whole library (including items with `useCount === 0`). A library with real items
    // that simply have not been logged recently must not be told "No foods yet" — that message is
    // reserved for a genuinely empty library (`libraryEmpty`, i.e. `quickAddCandidates` returning
    // nothing), never for an empty `recentFoods` window alone.
    mockQuickAdd.mockReturnValue(sixOnGrid);
    mockRecent.mockReturnValue([]);
    mockLibrary.mockReturnValue([yoghurt]);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    expect(screen.queryByTestId('search-sheet-empty')).toBeNull();
  });
});

describe('SearchSheet — library fallback (issue #96)', () => {
  it('falls back to libraryByUsage, labelled "Your foods", when Recent is genuinely empty but the library has foods', async () => {
    // Issue #96 acceptance: a library with foods logged only more than `interaction.recentDays`
    // days ago must render those rows, not go blank and not show "No foods yet".
    mockRecent.mockReturnValue([]);
    mockLibrary.mockReturnValue([yoghurt, shake]);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    expect(mockLibrary).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('search-sheet-row-food-food-1-name')).toHaveTextContent('Greek yoghurt');
    expect(screen.getByTestId('search-sheet-row-meal-meal-1')).toBeTruthy();
    expect(screen.getByTestId('search-sheet-section-library')).toHaveTextContent('Your foods', { exact: false });
    expect(screen.queryByTestId('search-sheet-empty')).toBeNull();
  });

  it('never shows both sections at once: Recent wins over the library fallback when Recent has anything', async () => {
    mockRecent.mockReturnValue([eggs]);
    mockLibrary.mockReturnValue([yoghurt]);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    expect(screen.getByTestId('search-sheet-section-recent')).toBeTruthy();
    expect(screen.queryByTestId('search-sheet-section-library')).toBeNull();
    expect(screen.getByTestId('search-sheet-row-food-food-2-name')).toHaveTextContent('Boiled eggs');
    expect(screen.queryByTestId('search-sheet-row-food-food-1-name')).toBeNull();
  });

  it('still shows "No foods yet" when Recent and the library fallback are both empty', async () => {
    mockQuickAdd.mockReturnValue([]);
    mockRecent.mockReturnValue([]);
    mockLibrary.mockReturnValue([]);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    expect(screen.getByTestId('search-sheet-empty')).toBeTruthy();
    expect(screen.queryByTestId('search-sheet-section-library')).toBeNull();
  });

  it('re-evaluates libraryEmpty when the sheet opens, not once per mount: logging the first food and reopening lists it with no remount', async () => {
    // The sub-case tech-lead added to this issue while reviewing #117: `libraryEmpty` used to come
    // from a lazy `useState` initialiser (once per mount), and Today never unmounts, so a day-one
    // user who creates and logs their very first food still saw "No foods yet" until a reload.
    mockQuickAdd.mockReturnValue([]);
    mockRecent.mockReturnValue([]);
    mockLibrary.mockReturnValue([]);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    expect(screen.getByTestId('search-sheet-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('search-sheet-cancel'));

    // The first food was created and logged while the sheet was closed — simulated by the next
    // reads reflecting it, exactly like the "Recent reads fresh on reopen" test above.
    mockQuickAdd.mockReturnValue([yoghurt]);
    mockRecent.mockReturnValue([yoghurt]);

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    expect(screen.queryByTestId('search-sheet-empty')).toBeNull();
    expect(screen.getByTestId('search-sheet-row-food-food-1-name')).toHaveTextContent('Greek yoghurt');
  });
});

describe('SearchSheet — blank-query create row (issue #97)', () => {
  it('pins a "+ Create new food" row first, above Recent, for a blank query', async () => {
    mockRecent.mockReturnValue([eggs]);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    const createNew = screen.getByTestId('search-sheet-create-new');
    expect(createNew).toHaveTextContent(/create new food/i);
    expect(createNew.props.accessibilityRole).toBe('button');
    expect(createNew.props.accessibilityLabel).toMatch(/create new food/i);

    const order = screen.getAllByTestId(/^search-sheet-(create-new|section-recent)$/);
    expect(order.map((el) => el.props.testID)).toEqual(['search-sheet-create-new', 'search-sheet-section-recent']);
  });

  it('tapping the pinned row calls onCreate with an empty string', async () => {
    const onCreate = jest.fn();
    await renderSheet({ onCreate });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    await fireEvent.press(screen.getByTestId('search-sheet-create-new'));

    expect(onCreate).toHaveBeenCalledWith('');
  });

  it('opens the blank create form (renderCreate) on a tap, with an empty query', async () => {
    await renderSheet({ renderCreate: ({ query }) => <Text testID="create-query">{query}</Text> });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    await fireEvent.press(screen.getByTestId('search-sheet-create-new'));

    expect(screen.getByTestId('create-query').props.children).toBe('');
  });

  it('drops the pinned row once the user types; the trailing Create "‹query›" row is last instead', async () => {
    mockSearch.mockReturnValue([eggs]);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');

    expect(screen.queryByTestId('search-sheet-create-new')).toBeNull();
    expect(screen.getByTestId('search-sheet-create')).toHaveTextContent('Create "egg"', { exact: false });
  });
});

describe('SearchSheet — typing', () => {
  it('filters through searchFoods as the user types, labelling a saved meal', async () => {
    mockSearch.mockReturnValue([shake]);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'shake');

    expect(mockSearch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ query: 'shake' }));
    const row = screen.getByTestId('search-sheet-row-meal-meal-1');
    expect(within(row).getByTestId('search-sheet-row-meal-meal-1-meal-tag')).toHaveTextContent('Meal');
    expect(screen.getByTestId('search-sheet-section-results')).toHaveTextContent('Results', { exact: false });
  });

  it('always trails a Create "‹query›" row for a non-empty query', async () => {
    mockSearch.mockReturnValue([eggs]);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');

    const create = screen.getByTestId('search-sheet-create');
    expect(create).toHaveTextContent('Create "egg"', { exact: false });
  });

  it('shows only the Create row when nothing matches', async () => {
    mockSearch.mockReturnValue([]);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'boiled eggs');

    expect(screen.getByTestId('search-sheet-create')).toHaveTextContent('Create "boiled eggs"', { exact: false });
    expect(screen.queryByTestId('search-sheet-section-results')).toBeNull();
    expect(screen.queryByTestId(/search-sheet-row-/)).toBeNull();
  });
});

describe('SearchSheet — row tap-to-log', () => {
  it('tapping a food result calls logFood, reports the receipt, and closes the sheet after the logged beat', async () => {
    mockSearch.mockReturnValue([eggs]);
    const onLogged = jest.fn();
    const receipt = receiptFor(eggs);
    mockLogFood.mockReturnValue(receipt);
    await renderSheet({ onLogged });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');

    await fireEvent.press(screen.getByTestId('search-sheet-row-food-food-2'));

    expect(mockLogFood).toHaveBeenCalledTimes(1);
    expect(mockLogFood.mock.calls[0]?.[1]).toMatchObject({ foodId: 'food-2' });
    expect(onLogged).toHaveBeenCalledWith(receipt);
    expect(receipt.entries[0]?.kcal).toBe(140);
    expect(receipt.entries[0]?.protein).toBe(12);
    // The row's own "Logged" beat, still visible — the sheet has not closed yet.
    expect(screen.getByTestId('search-sheet-input')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(interaction.rowLoggedHoldMs);
    });

    expect(screen.queryByTestId('search-sheet-input')).toBeNull();
  });

  it('tapping a meal result calls logMeal', async () => {
    mockSearch.mockReturnValue([shake]);
    const receipt = receiptFor(shake);
    mockLogMeal.mockReturnValue(receipt);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'shake');

    await fireEvent.press(screen.getByTestId('search-sheet-row-meal-meal-1'));

    expect(mockLogMeal).toHaveBeenCalledTimes(1);
    expect(mockLogMeal.mock.calls[0]?.[1]).toMatchObject({ mealId: 'meal-1' });
  });

  it('shows the undo toast, keyed to the candidate, carrying the write token', async () => {
    mockSearch.mockReturnValue([eggs]);
    const receipt = receiptFor(eggs);
    mockLogFood.mockReturnValue(receipt);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');

    await fireEvent.press(screen.getByTestId('search-sheet-row-food-food-2'));

    const toast = useUndoToastStore.getState().toast;
    expect(toast?.token).toEqual(receipt.undo);
    expect(toast?.candidateKey).toBe('food-food-2');
    expect(toast?.title).toBe('Boiled eggs');
    expect(toast?.meta).toBe('140 kcal · 12 g protein');
  });

  it('a repeat tap on the same candidate within the repeat window calls addPortion, not a second logFood', async () => {
    mockSearch.mockReturnValue([eggs]);
    const onLogged = jest.fn();
    const onPortionAdded = jest.fn();
    const first = receiptFor(eggs);
    mockLogFood.mockReturnValue(first);
    const second = {
      ...first,
      entries: [{ ...first.entries[0]!, kcal: 280, protein: 24 }],
      portions: 2,
      undo: { kind: 'revert' as const, previous: [first.entries[0]!] },
    };
    mockAddPortion.mockReturnValue(second);
    await renderSheet({ onLogged, onPortionAdded });

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');
    await fireEvent.press(screen.getByTestId('search-sheet-row-food-food-2'));
    await act(async () => {
      jest.advanceTimersByTime(interaction.rowLoggedHoldMs);
    });

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');
    await fireEvent.press(screen.getByTestId('search-sheet-row-food-food-2'));

    expect(mockLogFood).toHaveBeenCalledTimes(1);
    expect(mockAddPortion).toHaveBeenCalledTimes(1);
    expect(mockAddPortion.mock.calls[0]?.[1]).toMatchObject({ receipt: first });
    expect(onLogged).toHaveBeenCalledTimes(1);
    expect(onPortionAdded).toHaveBeenCalledWith({ kcal: 140, protein: 12, entryCountDelta: 0 });
  });

  it('swallows a failed write instead of throwing past the tap, and leaves the sheet open', async () => {
    mockSearch.mockReturnValue([eggs]);
    mockLogFood.mockImplementation(() => {
      throw new VitalsDbError('not_found', 'food gone');
    });
    const onLogged = jest.fn();
    await renderSheet({ onLogged });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');

    await expect(fireEvent.press(screen.getByTestId('search-sheet-row-food-food-2'))).resolves.not.toThrow();

    expect(onLogged).not.toHaveBeenCalled();
    expect(screen.getByTestId('search-sheet-input')).toBeTruthy();
  });

  it('long-pressing a result row opens the portion sheet and dismisses any toast already showing', async () => {
    mockSearch.mockReturnValue([eggs]);
    const receipt = receiptFor(eggs);
    mockLogFood.mockReturnValue(receipt);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');
    await fireEvent.press(screen.getByTestId('search-sheet-row-food-food-2'));
    expect(useUndoToastStore.getState().toast).not.toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(interaction.rowLoggedHoldMs);
    });

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');
    await fireEvent(screen.getByTestId('search-sheet-row-food-food-2'), 'longPress');

    expect(useUndoToastStore.getState().toast).toBeNull();
    expect(screen.getByTestId('search-sheet-portion-sheet-title')).toHaveTextContent('Boiled eggs');
  });

  it("the portion sheet's preset logs fresh (not addPortion) with the chosen multiple, and closes both sheets", async () => {
    mockSearch.mockReturnValue([eggs]);
    const onLogged = jest.fn();
    const receipt = receiptFor(eggs);
    mockLogFood.mockReturnValue(receipt);
    await renderSheet({ onLogged });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');

    await fireEvent(screen.getByTestId('search-sheet-row-food-food-2'), 'longPress');
    await fireEvent.press(screen.getByTestId('search-sheet-portion-sheet-step-2'));

    expect(mockLogFood).toHaveBeenCalledTimes(1);
    expect(mockLogFood.mock.calls[0]?.[1]).toMatchObject({ foodId: 'food-2', amount: { servings: 2 } });
    expect(mockAddPortion).not.toHaveBeenCalled();
    expect(onLogged).toHaveBeenCalledWith(receipt);
    expect(screen.queryByTestId('search-sheet-portion-sheet-title')).toBeNull();
    expect(screen.queryByTestId('search-sheet-input')).toBeNull();
  });
});

describe('SearchSheet — create', () => {
  it('tapping Create calls onCreate with the trimmed query', async () => {
    mockSearch.mockReturnValue([]);
    const onCreate = jest.fn();
    await renderSheet({ onCreate });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), '  boiled eggs  ');

    await fireEvent.press(screen.getByTestId('search-sheet-create'));

    expect(onCreate).toHaveBeenCalledWith('boiled eggs');
  });
});

describe('SearchSheet — iPhone presentation (issue #79)', () => {
  it('never asks for focus while the Modal is still presenting — the field is focused once onShow reports it is up', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    expect(screen.getByTestId('search-sheet-input').props.autoFocus).toBeFalsy();
    expect(focus).not.toHaveBeenCalled();

    await fireEvent(screen.getByTestId('search-sheet-modal'), 'show');

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('the portion sheet renders inside the search Modal, not as a second Modal', async () => {
    mockRecent.mockReturnValue([eggs]);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    await fireEvent(screen.getByTestId('search-sheet-row-food-food-2'), 'longPress');

    const modal = screen.getByTestId('search-sheet-modal');
    expect(within(modal).getByTestId('search-sheet-portion-sheet-title')).toBeTruthy();
    expect(screen.container.queryAll((node) => node.type === 'Modal')).toHaveLength(1);
  });

  it('long-press drops the keyboard before the portion sheet opens — the sheet sits at the bottom, where the keyboard was', async () => {
    mockRecent.mockReturnValue([eggs]);
    const blur = jest.spyOn(TextInput.prototype, 'blur');
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent(screen.getByTestId('search-sheet-modal'), 'show');

    await fireEvent(screen.getByTestId('search-sheet-row-food-food-2'), 'longPress');

    expect(blur).toHaveBeenCalled();
    expect(screen.getByTestId('search-sheet-portion-sheet-title')).toBeTruthy();
  });

  it('Create drops the keyboard before the create form opens, so its Save is never behind it', async () => {
    const blur = jest.spyOn(TextInput.prototype, 'blur');
    await renderSheet({ renderCreate: ({ query }) => <Text testID="create-query">{query}</Text> });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent(screen.getByTestId('search-sheet-modal'), 'show');
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'Protein bar');

    await fireEvent.press(screen.getByTestId('search-sheet-create'));

    expect(blur).toHaveBeenCalled();
    expect(screen.getByTestId('create-query')).toBeTruthy();
  });

  it('Android back with the create form up closes only the create form', async () => {
    await renderSheet({ renderCreate: ({ query }) => <Text testID="create-query">{query}</Text> });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'Protein bar');
    await fireEvent.press(screen.getByTestId('search-sheet-create'));

    await fireEvent(screen.getByTestId('search-sheet-modal'), 'requestClose');

    expect(screen.queryByTestId('create-query')).toBeNull();
    expect(screen.getByTestId('search-sheet-input').props.value).toBe('Protein bar');
  });

  it('Android back with the portion sheet up closes only the portion sheet', async () => {
    mockRecent.mockReturnValue([eggs]);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent(screen.getByTestId('search-sheet-row-food-food-2'), 'longPress');

    await fireEvent(screen.getByTestId('search-sheet-modal'), 'requestClose');

    expect(screen.queryByTestId('search-sheet-portion-sheet-title')).toBeNull();
    expect(screen.getByTestId('search-sheet-input')).toBeTruthy();
  });

  it('renderCreate draws the create form inside the search Modal; its onLogged forwards the receipt and closes everything', async () => {
    mockSearch.mockReturnValue([]);
    const onLogged = jest.fn();
    const receipt = receiptFor(eggs);
    await renderSheet({
      onLogged,
      renderCreate: ({ query, onLogged: logged, onClose }) => (
        <>
          <Text testID="create-query">{query}</Text>
          <Pressable testID="create-save" onPress={() => logged(receipt)} />
          <Pressable testID="create-cancel" onPress={onClose} />
        </>
      ),
    });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), ' boiled eggs ');
    await fireEvent.press(screen.getByTestId('search-sheet-create'));

    expect(within(screen.getByTestId('search-sheet-modal')).getByTestId('create-query').props.children).toBe('boiled eggs');

    await fireEvent.press(screen.getByTestId('create-cancel'));
    expect(screen.queryByTestId('create-query')).toBeNull();
    expect(screen.getByTestId('search-sheet-input').props.value).toBe(' boiled eggs ');

    await fireEvent.press(screen.getByTestId('search-sheet-create'));
    await fireEvent.press(screen.getByTestId('create-save'));

    expect(onLogged).toHaveBeenCalledWith(receipt);
    expect(screen.queryByTestId('search-sheet-modal')).toBeNull();
  });
});

describe('SearchSheet — refocus after closing an overlay (issue #110)', () => {
  it('closing the portion sheet without logging (tap the scrim) restores focus to the search field', async () => {
    mockRecent.mockReturnValue([eggs]);
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent(screen.getByTestId('search-sheet-modal'), 'show');
    await fireEvent(screen.getByTestId('search-sheet-row-food-food-2'), 'longPress');
    focus.mockClear();

    await fireEvent.press(screen.getByTestId('search-sheet-portion-sheet-scrim'));

    expect(screen.queryByTestId('search-sheet-portion-sheet-title')).toBeNull();
    expect(screen.getByTestId('search-sheet-input')).toBeTruthy();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('closing the create form without saving restores focus to the search field', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderSheet({ renderCreate: ({ onClose }) => <Pressable testID="create-cancel" onPress={onClose} /> });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent(screen.getByTestId('search-sheet-modal'), 'show');
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'Protein bar');
    await fireEvent.press(screen.getByTestId('search-sheet-create'));
    focus.mockClear();

    await fireEvent.press(screen.getByTestId('create-cancel'));

    expect(screen.queryByTestId('create-cancel')).toBeNull();
    expect(screen.getByTestId('search-sheet-input')).toBeTruthy();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('Android back closing the portion sheet also restores focus', async () => {
    mockRecent.mockReturnValue([eggs]);
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent(screen.getByTestId('search-sheet-modal'), 'show');
    await fireEvent(screen.getByTestId('search-sheet-row-food-food-2'), 'longPress');
    focus.mockClear();

    await fireEvent(screen.getByTestId('search-sheet-modal'), 'requestClose');

    expect(screen.queryByTestId('search-sheet-portion-sheet-title')).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('Android back closing the create form also restores focus', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderSheet({ renderCreate: () => <Text testID="create-query">shown</Text> });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent(screen.getByTestId('search-sheet-modal'), 'show');
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'Protein bar');
    await fireEvent.press(screen.getByTestId('search-sheet-create'));
    focus.mockClear();

    await fireEvent(screen.getByTestId('search-sheet-modal'), 'requestClose');

    expect(screen.queryByTestId('create-query')).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('logging from the portion sheet closes search entirely and never fires a stray refocus', async () => {
    mockRecent.mockReturnValue([eggs]);
    const receipt = receiptFor(eggs);
    mockLogFood.mockReturnValue(receipt);
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent(screen.getByTestId('search-sheet-modal'), 'show');
    await fireEvent(screen.getByTestId('search-sheet-row-food-food-2'), 'longPress');
    focus.mockClear();

    await fireEvent.press(screen.getByTestId('search-sheet-portion-sheet-step-2'));

    expect(screen.queryByTestId('search-sheet-modal')).toBeNull();
    expect(focus).not.toHaveBeenCalled();
  });

  it('logging from the create form closes search entirely and never fires a stray refocus', async () => {
    const receipt = receiptFor(eggs);
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderSheet({
      renderCreate: ({ onLogged: logged }) => <Pressable testID="create-save" onPress={() => logged(receipt)} />,
    });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent(screen.getByTestId('search-sheet-modal'), 'show');
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'Protein bar');
    await fireEvent.press(screen.getByTestId('search-sheet-create'));
    focus.mockClear();

    await fireEvent.press(screen.getByTestId('create-save'));

    expect(screen.queryByTestId('search-sheet-modal')).toBeNull();
    expect(focus).not.toHaveBeenCalled();
  });
});

describe('SearchSheet — accessibility', () => {
  it('every row and the Create row carry an accessibility label and role', async () => {
    mockSearch.mockReturnValue([eggs]);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'egg');

    const row = screen.getByTestId('search-sheet-row-food-food-2');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBeTruthy();

    const create = screen.getByTestId('search-sheet-create');
    expect(create.props.accessibilityRole).toBe('button');
    expect(create.props.accessibilityLabel).toBe('Create "egg"');
  });
});
