/**
 * Issue #79 — "iPhone: app stops responding after opening search". Two mechanisms, each proven
 * here against React Native's own code rather than a stand-in:
 *
 * 1. THE KEYBOARD EATS THE TAP. `<SearchSheet>`'s `Modal` is a React descendant of the Today
 *    `ScrollView`, and the JS responder system walks React ancestry, not native windows. While a
 *    text input is focused and the soft keyboard is up, a `ScrollView` whose
 *    `keyboardShouldPersistTaps` is left at its default (`'never'`) claims every touch on a
 *    non-input target in the *capture* phase — root first — so Cancel, a row and Create never see
 *    the tap at all. The sheet opens focused, so the keyboard is always up. This file unmocks
 *    `ScrollView` so the real `_handleStartShouldSetResponderCapture` runs, and replays the capture
 *    phase over each target's ancestors.
 *
 * 2. ONLY ONE NATIVE MODAL. iOS presents a `Modal` from the nearest view controller; a second
 *    `Modal` mounted beside an already-presented one asks a controller that is already presenting,
 *    and UIKit silently refuses — Create and long-press "do nothing". Android's dialogs stack, which
 *    is why the report is iPhone-only. So the portion and create sheets must render inside the one
 *    presented search `Modal`, never as a second one.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DeviceEventEmitter } from 'react-native';
import type { TestInstance } from 'test-renderer';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import {
  createFoodAndLog,
  dayLog,
  getSettings,
  logFood,
  quickAddCandidates,
  recentFoods,
  todayTotals,
  weightSummary,
  type FoodCandidate,
  type LogReceipt,
} from '../../src/db';
import { __resetLogTracker } from '../../src/store/logTracker';
import { useUndoToastStore } from '../../src/store/undoToast';
import { themes } from '../../src/theme/tokens';
import TodayScreen from './index';

jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () =>
  jest.requireActual('react-native/Libraries/Components/ScrollView/ScrollView'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('../../src/components/today/test-support/reanimated-mock'));
// `useFocusEffect` (issue #103's grid refocus) just needs to not throw here — the focus/AppState
// refresh points themselves are asserted at `<QuickAddGrid>`'s own level
// (`src/components/quick-add/QuickAddGrid.test.tsx`).
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    const react = jest.requireActual<typeof import('react')>('react');
    react.useEffect(() => {
      cb();
    }, []);
  },
}));
jest.mock('../../src/db', () => ({
  ...jest.requireActual<typeof import('../../src/db')>('../../src/db'),
  quickAddCandidates: jest.fn().mockReturnValue([]),
  recentFoods: jest.fn().mockReturnValue([]),
  searchFoods: jest.fn().mockReturnValue([]),
  getSettings: jest.fn(),
  todayTotals: jest.fn(),
  weightSummary: jest.fn(),
  logFood: jest.fn(),
  dayLog: jest.fn().mockReturnValue([]),
  createFoodAndLog: jest.fn(),
}));

/** React Native's own focus registry — Flow source with no TypeScript types, so typed here. */
type TextInputStateModule = {
  default: {
    registerInput: (input: unknown) => void;
    unregisterInput: (input: unknown) => void;
    focusInput: (input: unknown) => void;
    blurInput: (input: unknown) => void;
  };
};
const TextInputState = jest.requireActual<TextInputStateModule>('react-native/Libraries/Components/TextInput/TextInputState').default;

const oats: FoodCandidate = {
  kind: 'food',
  id: 'food-7',
  name: 'Oats',
  brand: null,
  servingLabel: '40 g',
  servingGrams: 40,
  kcal: 150,
  protein: 5,
  useCount: 2,
  lastUsedAt: 0,
};

const receiptFor = (id: string, kcal: number, protein: number): LogReceipt => ({
  target: { kind: 'food', id },
  entries: [
    {
      id: `log-${id}`,
      updatedAt: 0,
      deleted: 0,
      loggedAt: 0,
      localDate: '2025-03-10',
      localMinute: 415,
      foodId: id,
      mealId: null,
      qty: 1,
      grams: null,
      kcal,
      protein,
      slot: 'breakfast',
    },
  ],
  portions: 1,
  undo: { kind: 'unlog', logIds: [`log-${id}`] },
});

const renderScreen = () =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <TodayScreen />
      </ThemeContext.Provider>
    </DbProvider>,
  );

/** Every host `Modal` currently in the tree — each one is a separate native presentation on iOS. */
const presentedModals = (): TestInstance[] => screen.container.queryAll((node) => node.type === 'Modal');

/**
 * Replays the responder system's capture phase for a touch that starts on `target`: every ancestor,
 * root first, is asked `onStartShouldSetResponderCapture`. Returns the testID (or host type) of the
 * first ancestor that steals the touch, or `null` when the touch reaches its target.
 */
function ancestorThatStealsTap(target: TestInstance): string | null {
  const ancestors: TestInstance[] = [];
  for (let node = target.parent; node; node = node.parent) ancestors.unshift(node);
  const event = { target, currentTarget: target, nativeEvent: { touches: [], changedTouches: [], target: 0 } };
  for (const node of ancestors) {
    const capture: unknown = node.props.onStartShouldSetResponderCapture;
    if (typeof capture === 'function' && capture(event) === true) {
      return String(node.props.testID ?? node.type);
    }
  }
  return null;
}

let focusedInput: TestInstance | null = null;

/** What the phone does the moment the sheet's field takes focus: the input is registered as
 * focused, and the soft keyboard announces itself. */
async function keyboardUpOn(input: TestInstance): Promise<void> {
  focusedInput = input;
  TextInputState.registerInput(input);
  TextInputState.focusInput(input);
  await act(async () => {
    DeviceEventEmitter.emit('keyboardWillShow', { endCoordinates: { screenX: 0, screenY: 508, width: 390, height: 336 } });
    DeviceEventEmitter.emit('keyboardDidShow', { endCoordinates: { screenX: 0, screenY: 508, width: 390, height: 336 } });
  });
}

async function openSearch(): Promise<void> {
  await fireEvent.press(screen.getByTestId('today-search-sheet-bar'));
  await fireEvent(screen.getByTestId('today-search-sheet-modal'), 'show');
}

beforeEach(() => {
  jest.mocked(getSettings).mockReturnValue({ kcalTarget: 2400, proteinTarget: 180, weekStart: 1, isDefault: false });
  jest.mocked(todayTotals).mockReturnValue({ localDate: '2025-03-10', kcal: 1240, protein: 96, kcalTarget: 2400, proteinTarget: 180, entryCount: 3 });
  jest.mocked(weightSummary).mockReturnValue({ latest: null, avg7: null, avg7PrevWeek: null, weeklyDelta: null });
  jest.mocked(dayLog).mockReturnValue([]);
  // One saved food on the grid, so the sheet shows Recent rather than the day-one empty state.
  jest.mocked(quickAddCandidates).mockReturnValue([{ ...oats, id: 'food-1', name: 'Greek yoghurt' }]);
  jest.mocked(recentFoods).mockReturnValue([oats]);
  __resetLogTracker();
  useUndoToastStore.getState().dismiss();
});

afterEach(async () => {
  if (focusedInput) {
    TextInputState.blurInput(focusedInput);
    TextInputState.unregisterInput(focusedInput);
    focusedInput = null;
  }
  await act(async () => {
    DeviceEventEmitter.emit('keyboardWillHide', { endCoordinates: { screenX: 0, screenY: 844, width: 390, height: 0 } });
    DeviceEventEmitter.emit('keyboardDidHide', { endCoordinates: { screenX: 0, screenY: 844, width: 390, height: 0 } });
  });
});

describe('Today search on iPhone (issue #79) — taps reach their target while the keyboard is up', () => {
  it('Cancel, the scrim and a Recent row each receive the first tap — no ScrollView above them steals it', async () => {
    await renderScreen();
    await openSearch();
    await keyboardUpOn(screen.getByTestId('today-search-sheet-input'));

    expect(ancestorThatStealsTap(screen.getByTestId('today-search-sheet-cancel'))).toBeNull();
    expect(ancestorThatStealsTap(screen.getByTestId('today-search-sheet-scrim'))).toBeNull();
    expect(ancestorThatStealsTap(screen.getByTestId('today-search-sheet-row-food-food-7'))).toBeNull();
  });

  it('the Create row receives the first tap while typing', async () => {
    await renderScreen();
    await openSearch();
    await fireEvent.changeText(screen.getByTestId('today-search-sheet-input'), 'Protein bar');
    await keyboardUpOn(screen.getByTestId('today-search-sheet-input'));

    expect(ancestorThatStealsTap(screen.getByTestId('today-search-sheet-create'))).toBeNull();
  });

  it("the create form's Save receives the first tap while its name field has the keyboard up", async () => {
    await renderScreen();
    await openSearch();
    await fireEvent.changeText(screen.getByTestId('today-search-sheet-input'), 'Protein bar');
    await fireEvent.press(screen.getByTestId('today-search-sheet-create'));
    await keyboardUpOn(screen.getByTestId('today-create-food-sheet-form-name'));

    expect(ancestorThatStealsTap(screen.getByTestId('today-create-food-sheet-form-save'))).toBeNull();
  });
});

describe('Today search on iPhone (issue #79) — one native Modal at a time', () => {
  it('opening search presents exactly one Modal', async () => {
    await renderScreen();
    await openSearch();

    expect(presentedModals()).toHaveLength(1);
  });

  it('long-press → portion sheet opens inside the search Modal, and confirming logs and leaves no Modal behind', async () => {
    jest.mocked(logFood).mockReturnValue(receiptFor('food-7', 150, 5));
    await renderScreen();
    await openSearch();

    await fireEvent(screen.getByTestId('today-search-sheet-row-food-food-7'), 'longPress');

    expect(screen.getByTestId('today-search-sheet-portion-sheet-title')).toBeTruthy();
    expect(presentedModals()).toHaveLength(1);

    await fireEvent.press(screen.getByTestId('today-search-sheet-portion-sheet-step-1'));

    expect(logFood).toHaveBeenCalledTimes(1);
    expect(presentedModals()).toHaveLength(0);
  });

  it('Create → the create sheet opens inside the search Modal, and Save logs and returns to Today with no Modal left', async () => {
    jest.mocked(createFoodAndLog).mockReturnValue({
      food: {
        id: 'food-9',
        updatedAt: 0,
        deleted: 0,
        name: 'Protein bar',
        brand: null,
        servingLabel: '1 bar',
        servingGrams: null,
        kcalPerServing: 200,
        proteinPerServing: 20,
        archived: 0,
        useCount: 0,
        lastUsedAt: null,
        hourHistogram: null,
        searchText: '',
      },
      receipt: receiptFor('food-9', 200, 20),
    });
    await renderScreen();
    await openSearch();
    await fireEvent.changeText(screen.getByTestId('today-search-sheet-input'), 'Protein bar');

    await fireEvent.press(screen.getByTestId('today-search-sheet-create'));

    expect(screen.getByTestId('today-create-food-sheet-form-name').props.value).toBe('Protein bar');
    expect(presentedModals()).toHaveLength(1);

    await fireEvent.changeText(screen.getByTestId('today-create-food-sheet-form-serving-label'), '1 bar');
    await fireEvent.press(screen.getByTestId('today-create-food-sheet-form-save'));

    expect(createFoodAndLog).toHaveBeenCalledTimes(1);
    expect(presentedModals()).toHaveLength(0);
    expect(screen.getByTestId('today-screen')).toBeTruthy();
  });

  it("Cancel on the create sheet goes back to search, still showing the query — it never closes both", async () => {
    await renderScreen();
    await openSearch();
    await fireEvent.changeText(screen.getByTestId('today-search-sheet-input'), 'Protein bar');
    await fireEvent.press(screen.getByTestId('today-search-sheet-create'));

    await fireEvent.press(screen.getByTestId('today-create-food-sheet-form-cancel'));

    expect(screen.queryByTestId('today-create-food-sheet')).toBeNull();
    expect(screen.getByTestId('today-search-sheet-input').props.value).toBe('Protein bar');
    expect(presentedModals()).toHaveLength(1);
  });
});
