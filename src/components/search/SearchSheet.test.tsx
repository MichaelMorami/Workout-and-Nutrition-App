/**
 * `<SearchSheet>` — issue #69: the search sheet shell, the search bar, and list rendering only.
 * Row *behaviour* (tap-to-log, long-press, create) is #70/#71 — this file only asserts the bar,
 * the sheet opening with the field focused, Recent vs. Results rendering, saved-meal labelling, and
 * the two empty states.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { FoodCandidate, MealCandidate } from '../../db';
import { quickAddCandidates, recentFoods, searchFoods } from '../../db';
import { interaction, themes } from '../../theme/tokens';
import { SearchSheet } from './SearchSheet';

jest.mock('../../db', () => ({
  ...jest.requireActual<typeof import('../../db')>('../../db'),
  quickAddCandidates: jest.fn(),
  recentFoods: jest.fn(),
  searchFoods: jest.fn(),
}));

const mockQuickAdd = jest.mocked(quickAddCandidates);
const mockRecent = jest.mocked(recentFoods);
const mockSearch = jest.mocked(searchFoods);

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

beforeEach(() => {
  mockQuickAdd.mockReturnValue(sixOnGrid);
  mockRecent.mockReturnValue([]);
  mockSearch.mockReturnValue([]);
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
  it('opens the sheet with the query field already focused, keyboard up', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    const input = screen.getByTestId('search-sheet-input');
    expect(input).toBeTruthy();
    expect(input.props.autoFocus).toBe(true);
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

describe('SearchSheet — row selection and create (wiring only; behaviour is #70/#71)', () => {
  it('tapping a result calls onSelect with that candidate', async () => {
    mockRecent.mockReturnValue([eggs]);
    const onSelect = jest.fn();
    await renderSheet({ onSelect });
    await fireEvent.press(screen.getByTestId('search-sheet-bar'));

    await fireEvent.press(screen.getByTestId('search-sheet-row-food-food-2'));

    expect(onSelect).toHaveBeenCalledWith(eggs);
  });

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
