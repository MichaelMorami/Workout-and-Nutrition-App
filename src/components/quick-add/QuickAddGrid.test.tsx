/**
 * `<QuickAddGrid>` — asserts the whole tap-to-log contract at the section level: the six ranked
 * tiles render in the order `quickAddCandidates` returns them, tapping a food tile calls `logFood`
 * and a meal tile calls `logMeal`, the receipt reaches `onLogged` with the right kcal/protein, a
 * failed write never throws past the tap, and an empty catalogue shows the teaching empty state
 * instead of six blank tiles.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { FoodCandidate, LogReceipt, MealCandidate } from '../../db';
import { addPortion, logFood, logMeal, quickAddCandidates, VitalsDbError } from '../../db';
import { DbProvider } from '../db/DbProvider';
import { __resetLogTracker } from '../../store/logTracker';
import { useUndoToastStore } from '../../store/undoToast';
import { ThemeContext } from '../theme/theme-context';
import { themes } from '../../theme/tokens';
import { QuickAddGrid } from './QuickAddGrid';

jest.mock('react-native-reanimated', () => jest.requireActual('./test-support/reanimated-mock'));
jest.mock('../../db', () => {
  const actual = jest.requireActual<typeof import('../../db')>('../../db');
  return {
    ...actual,
    quickAddCandidates: jest.fn(),
    logFood: jest.fn(),
    logMeal: jest.fn(),
    addPortion: jest.fn(),
  };
});

const mockCandidates = jest.mocked(quickAddCandidates);
const mockLogFood = jest.mocked(logFood);
const mockLogMeal = jest.mocked(logMeal);
const mockAddPortion = jest.mocked(addPortion);

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

const shake: MealCandidate = {
  kind: 'meal',
  id: 'meal-1',
  name: 'Post-workout shake',
  kcal: 410,
  protein: 38,
  itemCount: 3,
  useCount: 2,
  lastUsedAt: null,
};

const six = [
  yoghurt,
  shake,
  { ...yoghurt, id: 'food-2', name: 'Oats' },
  { ...yoghurt, id: 'food-3', name: 'Chicken breast' },
  { ...yoghurt, id: 'food-4', name: 'Banana' },
  { ...yoghurt, id: 'food-5', name: 'Almonds' },
];

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

const renderGrid = (props: Partial<React.ComponentProps<typeof QuickAddGrid>> = {}) =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <QuickAddGrid testID="grid" {...props} />
      </ThemeContext.Provider>
    </DbProvider>,
  );

beforeEach(() => {
  mockCandidates.mockReturnValue(six);
  __resetLogTracker();
  useUndoToastStore.getState().dismiss();
});

describe('QuickAddGrid', () => {
  it('renders six tiles in the order quickAddCandidates returns them', async () => {
    await renderGrid();
    const names = six.map((c) => screen.getByTestId(`grid-tile-${c.id}-name`).props.children);
    expect(names).toEqual(six.map((c) => c.name));
  });

  it('shows the ranked-for-the-hour meta line', async () => {
    await renderGrid();
    expect(screen.getByTestId('grid-ranked-for')).toBeTruthy();
  });

  it('tapping a food tile calls logFood with that food and reports the receipt', async () => {
    const onLogged = jest.fn();
    const receipt = receiptFor(yoghurt);
    mockLogFood.mockReturnValue(receipt);
    await renderGrid({ onLogged });

    await fireEvent.press(screen.getByTestId('grid-tile-food-1'));

    expect(mockLogFood).toHaveBeenCalledTimes(1);
    expect(mockLogFood.mock.calls[0]?.[1]).toMatchObject({ foodId: 'food-1' });
    expect(onLogged).toHaveBeenCalledWith(receipt);
    expect(receipt.entries[0]?.kcal).toBe(120);
    expect(receipt.entries[0]?.protein).toBe(20);
  });

  it('tapping a meal tile calls logMeal with that meal', async () => {
    const onLogged = jest.fn();
    const receipt = receiptFor(shake);
    mockLogMeal.mockReturnValue(receipt);
    await renderGrid({ onLogged });

    await fireEvent.press(screen.getByTestId('grid-tile-meal-1'));

    expect(mockLogMeal).toHaveBeenCalledTimes(1);
    expect(mockLogMeal.mock.calls[0]?.[1]).toMatchObject({ mealId: 'meal-1' });
    expect(onLogged).toHaveBeenCalledWith(receipt);
  });

  it('swallows a failed write instead of throwing past the tap', async () => {
    mockLogFood.mockImplementation(() => {
      throw new VitalsDbError('not_found', 'food gone');
    });
    const onLogged = jest.fn();
    await renderGrid({ onLogged });

    await expect(fireEvent.press(screen.getByTestId('grid-tile-food-1'))).resolves.not.toThrow();
    expect(onLogged).not.toHaveBeenCalled();
  });

  it('shows the teaching empty state when the catalogue has nothing to rank yet', async () => {
    mockCandidates.mockReturnValue([]);
    await renderGrid();
    expect(screen.getByTestId('grid-empty')).toBeTruthy();
    expect(screen.queryByTestId(`grid-tile-${yoghurt.id}`)).toBeNull();
    expect(screen.queryByTestId('grid-ranked-for')).toBeNull();
  });

  it('a second tap within the repeat window calls addPortion, not a second logFood, and reports the delta', async () => {
    const onLogged = jest.fn();
    const onPortionAdded = jest.fn();
    const first = receiptFor(yoghurt);
    mockLogFood.mockReturnValue(first);
    const second = { ...first, entries: [{ ...first.entries[0]!, kcal: 240, protein: 40 }], portions: 2, undo: { kind: 'revert' as const, previous: [first.entries[0]!] } };
    mockAddPortion.mockReturnValue(second);
    await renderGrid({ onLogged, onPortionAdded });

    await fireEvent.press(screen.getByTestId('grid-tile-food-1'));
    await fireEvent.press(screen.getByTestId('grid-tile-food-1'));

    expect(mockLogFood).toHaveBeenCalledTimes(1);
    expect(mockAddPortion).toHaveBeenCalledTimes(1);
    expect(mockAddPortion.mock.calls[0]?.[1]).toMatchObject({ receipt: first });
    expect(onLogged).toHaveBeenCalledTimes(1);
    expect(onPortionAdded).toHaveBeenCalledWith({ kcal: 120, protein: 20, entryCountDelta: 0 });
  });

  it('shows the undo toast after a fresh log, keyed to the candidate and carrying the write token', async () => {
    const receipt = receiptFor(yoghurt);
    mockLogFood.mockReturnValue(receipt);
    await renderGrid();

    await fireEvent.press(screen.getByTestId('grid-tile-food-1'));

    const toast = useUndoToastStore.getState().toast;
    expect(toast?.token).toEqual(receipt.undo);
    expect(toast?.candidateKey).toBe('food-food-1');
    expect(toast?.title).toBe('Greek yoghurt');
    expect(toast?.meta).toBe('120 kcal · 20 g protein');
  });

  it('long-pressing a tile opens the portion sheet and dismisses any toast already showing', async () => {
    const receipt = receiptFor(yoghurt);
    mockLogFood.mockReturnValue(receipt);
    await renderGrid();
    await fireEvent.press(screen.getByTestId('grid-tile-food-1'));
    expect(useUndoToastStore.getState().toast).not.toBeNull();

    await fireEvent(screen.getByTestId('grid-tile-food-1'), 'longPress');

    expect(useUndoToastStore.getState().toast).toBeNull();
    expect(screen.getByTestId('grid-portion-sheet-title')).toHaveTextContent('Greek yoghurt');
  });

  it("the portion sheet's preset logs fresh (not addPortion) with the chosen multiple and closes", async () => {
    const onLogged = jest.fn();
    const receipt = receiptFor(yoghurt);
    mockLogFood.mockReturnValue(receipt);
    await renderGrid({ onLogged });

    await fireEvent(screen.getByTestId('grid-tile-food-1'), 'longPress');
    await fireEvent.press(screen.getByTestId('grid-portion-sheet-step-2'));

    expect(mockLogFood).toHaveBeenCalledTimes(1);
    expect(mockLogFood.mock.calls[0]?.[1]).toMatchObject({ foodId: 'food-1', amount: { servings: 2 } });
    expect(mockAddPortion).not.toHaveBeenCalled();
    expect(onLogged).toHaveBeenCalledWith(receipt);
    expect(screen.queryByTestId('grid-portion-sheet-title')).toBeNull();
  });
});
