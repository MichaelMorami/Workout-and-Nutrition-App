/**
 * `<UndoToast>` — the only safety net for the quick-add grid's three logging paths (issue #21).
 * Asserts what the code review on PR #60 flagged as missing: the toast actually renders, and
 * tapping Undo actually reverses the write (`undo(db, { token })`) rather than only flipping store
 * state — plus the `logTracker` forget the store's own doc comment requires so the next tap on the
 * same tile logs fresh instead of throwing on a tombstoned row.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import type { UndoToken } from '../../db';
import { undo, VitalsDbError } from '../../db';
import { DbProvider } from '../db/DbProvider';
import { forgetLog } from '../../store/logTracker';
import { useUndoToastStore, type UndoToastPayload } from '../../store/undoToast';
import { ThemeContext } from '../theme/theme-context';
import { themes } from '../../theme/tokens';
import { UndoToast } from './UndoToast';

jest.mock('react-native-reanimated', () => jest.requireActual('./test-support/reanimated-mock'));
jest.mock('../../db', () => {
  const actual = jest.requireActual<typeof import('../../db')>('../../db');
  return { ...actual, undo: jest.fn() };
});
jest.mock('../../store/logTracker', () => {
  const actual = jest.requireActual<typeof import('../../store/logTracker')>('../../store/logTracker');
  return { ...actual, forgetLog: jest.fn() };
});
jest.mock('expo-haptics', () => {
  const actual = jest.requireActual<typeof import('expo-haptics')>('expo-haptics');
  return { ...actual, impactAsync: jest.fn<typeof actual.impactAsync>().mockResolvedValue(undefined) };
});

const mockUndo = jest.mocked(undo);
const mockForgetLog = jest.mocked(forgetLog);
const mockImpact = jest.mocked(Haptics.impactAsync);

const token: UndoToken = { kind: 'unlog', logIds: ['log-1'] };

const payload = (overrides: Partial<UndoToastPayload> = {}): UndoToastPayload => ({
  token,
  candidateKey: 'food-food-1',
  title: 'Greek yoghurt',
  meta: '120 kcal · 20 g protein',
  delta: { kcal: 120, protein: 20, entryCountDelta: 1 },
  ...overrides,
});

const renderToast = (props: Partial<React.ComponentProps<typeof UndoToast>> = {}) =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <UndoToast testID="toast" {...props} />
      </ThemeContext.Provider>
    </DbProvider>,
  );

beforeEach(() => {
  useUndoToastStore.getState().dismiss();
});

describe('<UndoToast>', () => {
  it('renders nothing when there is no toast to show', async () => {
    await renderToast();
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('shows the title and meta once a toast is up', async () => {
    useUndoToastStore.getState().show(payload());
    await renderToast();

    expect(screen.getByTestId('toast-title')).toHaveTextContent('Greek yoghurt');
    expect(screen.getByTestId('toast-meta')).toHaveTextContent('120 kcal · 20 g protein');
  });

  it('the Undo button is a ≥44pt-labelled button naming what it undoes', async () => {
    useUndoToastStore.getState().show(payload());
    await renderToast();

    const button = screen.getByTestId('toast-undo');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Undo logging Greek yoghurt');
  });

  it('tapping Undo calls undo() with the toast token, forgets the candidate, and clears the toast', async () => {
    useUndoToastStore.getState().show(payload());
    await renderToast();

    await fireEvent.press(screen.getByTestId('toast-undo'));

    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo.mock.calls[0]?.[1]).toMatchObject({ token });
    expect(mockForgetLog).toHaveBeenCalledWith('food-food-1');
    expect(useUndoToastStore.getState().toast).toBeNull();
    expect(mockImpact).toHaveBeenCalledTimes(1);
  });

  it('reports the delta it undid to onUndo, so a running total can subtract it', async () => {
    const onUndo = jest.fn();
    useUndoToastStore.getState().show(payload());
    await renderToast({ onUndo });

    await fireEvent.press(screen.getByTestId('toast-undo'));

    expect(onUndo).toHaveBeenCalledWith({ kcal: 120, protein: 20, entryCountDelta: 1 });
  });

  it('a failed undo is swallowed, not thrown, and does not forget the candidate or dismiss', async () => {
    mockUndo.mockImplementation(() => {
      throw new VitalsDbError('not_found', 'already gone');
    });
    const onUndo = jest.fn();
    useUndoToastStore.getState().show(payload());
    await renderToast({ onUndo });

    await expect(fireEvent.press(screen.getByTestId('toast-undo'))).resolves.not.toThrow();

    expect(mockForgetLog).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });

  // Issue #100: a food-archive delete's undo is `action`, not `undo(db, { token })` — see
  // `undoToast.ts`'s own doc comment for why the payload allows this.
  describe('a payload carrying action instead of token (issue #100)', () => {
    const archivePayload = (overrides: Partial<UndoToastPayload> = {}): UndoToastPayload => ({
      title: 'Greek yoghurt',
      meta: 'Removed',
      verb: 'deleting',
      action: jest.fn(),
      ...overrides,
    });

    it('reads verb into the Undo button label instead of the default "logging"', async () => {
      useUndoToastStore.getState().show(archivePayload());
      await renderToast();

      expect(screen.getByTestId('toast-undo').props.accessibilityLabel).toBe('Undo deleting Greek yoghurt');
    });

    it('tapping Undo calls action instead of undo(), never forgets a candidate, and still dismisses', async () => {
      const action = jest.fn();
      useUndoToastStore.getState().show(archivePayload({ action }));
      await renderToast();

      await fireEvent.press(screen.getByTestId('toast-undo'));

      expect(action).toHaveBeenCalledTimes(1);
      expect(mockUndo).not.toHaveBeenCalled();
      expect(mockForgetLog).not.toHaveBeenCalled();
      expect(useUndoToastStore.getState().toast).toBeNull();
      expect(mockImpact).toHaveBeenCalledTimes(1);
    });

    it('a thrown action is swallowed the same way a failed undo() is: the toast stays up', async () => {
      const action = jest.fn(() => {
        throw new VitalsDbError('not_found', 'already gone');
      });
      useUndoToastStore.getState().show(archivePayload({ action }));
      await renderToast();

      await expect(fireEvent.press(screen.getByTestId('toast-undo'))).resolves.not.toThrow();

      expect(useUndoToastStore.getState().toast).not.toBeNull();
    });

    it('never calls onUndo — there is no delta to subtract from a running total', async () => {
      const onUndo = jest.fn();
      useUndoToastStore.getState().show(archivePayload());
      await renderToast({ onUndo });

      await fireEvent.press(screen.getByTestId('toast-undo'));

      expect(onUndo).not.toHaveBeenCalled();
    });
  });
});
