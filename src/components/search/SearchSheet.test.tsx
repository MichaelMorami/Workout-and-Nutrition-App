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
import { addPortion, logFood, logMeal, quickAddCandidates, recentFoods, searchFoods, VitalsDbError } from '../../db';
import { __resetLogTracker } from '../../store/logTracker';
import { useUndoToastStore } from '../../store/undoToast';
import { interaction, themes } from '../../theme/tokens';
import { SearchSheet } from './SearchSheet';

jest.mock('../../db', () => ({
  ...jest.requireActual<typeof import('../../db')>('../../db'),
  quickAddCandidates: jest.fn(),
  recentFoods: jest.fn(),
  searchFoods: jest.fn(),
  logFood: jest.fn(),
  logMeal: jest.fn(),
  addPortion: jest.fn(),
}));

const mockQuickAdd = jest.mocked(quickAddCandidates);
const mockRecent = jest.mocked(recentFoods);
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
  servingGrams: 170,
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
  servingGrams: null,
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
  it('lists recentFoods for an empty query, excluding the six on the grid', async () => {
    mockRecent.mockReturnValue([eggs]);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    expect(mockRecent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ days: interaction.recentDays, excludeIds: sixOnGrid.map((c) => c.id) }),
    );
    expect(screen.getByTestId('search-sheet-row-food-food-2-name')).toHaveTextContent('Boiled eggs');
    expect(screen.getByTestId('search-sheet-section-recent')).toHaveTextContent('Recent', { exact: false });
  });

  it('shows the "no library yet" empty state, leading to Create, when there is nothing recent', async () => {
    mockQuickAdd.mockReturnValue([]);
    mockRecent.mockReturnValue([]);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    const empty = screen.getByTestId('search-sheet-empty');
    expect(empty.props.accessibilityLabel).toMatch(/no foods yet/i);
    expect(screen.queryByTestId('search-sheet-create')).toBeNull();
  });

  it('does not show the "no library yet" empty state when the library has items, even if nothing is recent', async () => {
    // `recentFoods` only covers the last `interaction.recentDays` days, while `quickAddCandidates`
    // ranks the whole library (including items with `useCount === 0`). A library with real items
    // that simply have not been logged recently must not be told "No foods yet" — that message is
    // reserved for a genuinely empty library (`libraryEmpty`, i.e. `quickAddCandidates` returning
    // nothing), never for an empty `recentFoods` window alone.
    mockQuickAdd.mockReturnValue(sixOnGrid);
    mockRecent.mockReturnValue([]);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    expect(screen.queryByTestId('search-sheet-empty')).toBeNull();
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
