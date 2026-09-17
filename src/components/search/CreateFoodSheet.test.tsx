/**
 * `<CreateFoodSheet>` — issue #71's three acceptance criteria, each its own test: pre-filled from
 * the query, Save logs exactly once (`createFoodAndLog`, not a second write path), and undoing that
 * one write removes the log while keeping the food (`receipt.undo` is `'unlog'`, wired straight
 * into the same generic `<UndoToast>`/`undo()` every other write uses).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import type { FoodLogRow, FoodRow, LogReceipt } from '../../db';
import { createFoodAndLog, VitalsDbError, withServing } from '../../db';
import { DbProvider } from '../db/DbProvider';
import { useUndoToastStore } from '../../store/undoToast';
import { ThemeContext } from '../theme/theme-context';
import { themes } from '../../theme/tokens';
import { UndoToast } from '../quick-add/UndoToast';
import { CreateFoodSheet } from './CreateFoodSheet';

jest.mock('react-native-reanimated', () => jest.requireActual('../quick-add/test-support/reanimated-mock'));
jest.mock('../../db', () => ({
  ...jest.requireActual<typeof import('../../db')>('../../db'),
  createFoodAndLog: jest.fn(),
  undo: jest.fn(),
}));

const mockCreateFoodAndLog = jest.mocked(createFoodAndLog);
const mockUndo = jest.mocked((jest.requireMock('../../db') as typeof import('../../db')).undo);

const theme = themes.dark;

function entry(overrides: Partial<FoodLogRow> = {}): FoodLogRow {
  return {
    id: 'log-1',
    updatedAt: 1000,
    deleted: 0,
    loggedAt: 1000,
    localDate: '2026-09-14',
    localMinute: 480,
    foodId: 'food-9',
    mealId: null,
    qty: 1,
    grams: null,
    ml: null,
    kcal: 180,
    protein: 22,
    slot: 'breakfast',
    ...overrides,
  };
}

function foodRow(overrides: Partial<FoodRow> = {}): FoodRow {
  return {
    id: 'food-9',
    updatedAt: 1000,
    deleted: 0,
    name: 'Boiled eggs',
    brand: null,
    servingLabel: '2 eggs',
    archived: 0,
    useCount: 0,
    lastUsedAt: null,
    hourHistogram: null,
    searchText: '',
    ...withServing({ basis: 'weight', servingAmount: 100, kcalPer100: 180, proteinPer100: 22 }),
    ...overrides,
  };
}

function receipt(overrides: Partial<LogReceipt> = {}): LogReceipt {
  return {
    target: { kind: 'food', id: 'food-9' },
    entries: [entry()],
    portions: 1,
    undo: { kind: 'unlog', logIds: ['log-1'] },
    ...overrides,
  };
}

const renderSheet = (props: Partial<ComponentProps<typeof CreateFoodSheet>> = {}) =>
  render(<CreateFoodSheet db={{} as never} query="boiled eggs" onClose={jest.fn()} theme={theme} testID="create-sheet" {...props} />);

beforeEach(() => {
  useUndoToastStore.getState().dismiss();
});

describe('<CreateFoodSheet>', () => {
  it('renders nothing when query is null', async () => {
    await renderSheet({ query: null });
    expect(screen.queryByTestId('create-sheet')).toBeNull();
  });

  it("pre-fills the form's name field from the query", async () => {
    await renderSheet({ query: 'boiled eggs' });
    expect(screen.getByTestId('create-sheet-form-name').props.value).toBe('boiled eggs');
    expect(screen.getByTestId('create-sheet-title')).toHaveTextContent('Create "boiled eggs"');
  });

  it('opens on an empty string, not only a non-empty query, with a blank name (issue #97)', async () => {
    await renderSheet({ query: '' });

    expect(screen.getByTestId('create-sheet')).toBeTruthy();
    expect(screen.getByTestId('create-sheet-form-name').props.value).toBe('');
    // No dangling `Create ""` — the blank-query sheet gets its own plain title.
    expect(screen.getByTestId('create-sheet-title')).toHaveTextContent('Create new food');
  });

  it('Save calls createFoodAndLog exactly once with the query as name and logs one serving', async () => {
    mockCreateFoodAndLog.mockReturnValue({ food: foodRow({ name: 'Boiled eggs' }), receipt: receipt() });
    await renderSheet({ query: 'Boiled eggs' });

    await fireEvent.changeText(screen.getByTestId('create-sheet-form-serving-label'), '2 eggs');
    await fireEvent.press(screen.getByTestId('create-sheet-form-save'));

    expect(mockCreateFoodAndLog).toHaveBeenCalledTimes(1);
    expect(mockCreateFoodAndLog.mock.calls[0]?.[1]).toMatchObject({
      food: expect.objectContaining({ name: 'Boiled eggs', servingLabel: '2 eggs' }),
    });
  });

  it('Save calls onLogged with the receipt and closes the sheet', async () => {
    mockCreateFoodAndLog.mockReturnValue({ food: foodRow(), receipt: receipt() });
    const onLogged = jest.fn();
    const onClose = jest.fn();
    await renderSheet({ query: 'boiled eggs', onLogged, onClose });

    await fireEvent.changeText(screen.getByTestId('create-sheet-form-serving-label'), '2 eggs');
    await fireEvent.press(screen.getByTestId('create-sheet-form-save'));

    expect(onLogged).toHaveBeenCalledWith(receipt());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a failed save leaves the sheet open and never calls onLogged', async () => {
    mockCreateFoodAndLog.mockImplementation(() => {
      throw new VitalsDbError('invalid_input', 'nope');
    });
    const onLogged = jest.fn();
    const onClose = jest.fn();
    await renderSheet({ query: 'boiled eggs', onLogged, onClose });

    await fireEvent.changeText(screen.getByTestId('create-sheet-form-serving-label'), '2 eggs');
    await fireEvent.press(screen.getByTestId('create-sheet-form-save'));

    expect(onLogged).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('create-sheet')).toBeTruthy();
  });

  it('Cancel closes the sheet without writing', async () => {
    const onClose = jest.fn();
    await renderSheet({ query: 'boiled eggs', onClose });

    await fireEvent.press(screen.getByTestId('create-sheet-form-cancel'));

    expect(mockCreateFoodAndLog).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('undo after create-and-log removes the log and keeps the food (an "unlog" token, not a delete)', async () => {
    mockCreateFoodAndLog.mockReturnValue({ food: foodRow({ name: 'Boiled eggs' }), receipt: receipt() });

    await render(
      <DbProvider db={{} as never}>
        <ThemeContext.Provider value={theme}>
          <CreateFoodSheet db={{} as never} query="boiled eggs" onClose={jest.fn()} theme={theme} testID="create-sheet" />
          <UndoToast testID="toast" />
        </ThemeContext.Provider>
      </DbProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('create-sheet-form-serving-label'), '2 eggs');
    await fireEvent.press(screen.getByTestId('create-sheet-form-save'));

    expect(screen.getByTestId('toast-title')).toHaveTextContent('Boiled eggs');
    // Issue #124: the toast's meta line renders its protein figure through the shared
    // `formatGrams`, not a hand-built `` `${n} g` ``.
    expect(screen.getByTestId('toast-meta')).toHaveTextContent('180 kcal · 22 g protein');

    await fireEvent.press(screen.getByTestId('toast-undo'));

    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo.mock.calls[0]?.[1]).toMatchObject({ token: { kind: 'unlog', logIds: ['log-1'] } });
  });

  it("presentation='overlay' draws the same form without a native Modal of its own — for use inside the search Modal (issue #79)", async () => {
    const onClose = jest.fn();
    await renderSheet({ presentation: 'overlay', onClose });

    expect(screen.container.queryAll((node) => node.type === 'Modal')).toHaveLength(0);
    expect(screen.getByTestId('create-sheet-form-name').props.value).toBe('boiled eggs');

    await fireEvent.press(screen.getByTestId('create-sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
