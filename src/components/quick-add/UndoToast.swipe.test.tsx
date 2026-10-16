/**
 * `<UndoToast>` swipe-to-dismiss (issue #271). Every assertion reads an observable: the store the
 * rest of the app reads, the callbacks a caller passes, the toast's rendered transform, and what a
 * screen reader is handed. None recompute the handler's own threshold arithmetic: the distances
 * below are written against `size.toast.height`, the token the contract names.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { StyleSheet } from 'react-native';
import { undo } from '../../db';
import { DbProvider } from '../db/DbProvider';
import { forgetLog } from '../../store/logTracker';
import { useUndoToastStore, type UndoToastPayload } from '../../store/undoToast';
import { ThemeContext } from '../theme/theme-context';
import { motion, size, themes } from '../../theme/tokens';
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

const payload = (overrides: Partial<UndoToastPayload> = {}): UndoToastPayload => ({
  token: { kind: 'unlog', logIds: ['log-1'] },
  candidateKey: 'food-food-1',
  title: 'Greek yoghurt',
  meta: '120 kcal · 20 g protein',
  delta: { kcal: 120, protein: 20, entryCountDelta: 1 },
  ...overrides,
});

const renderToast = (onUndo?: jest.Mock) =>
  render(
    <DbProvider db={{} as never}>
      <ThemeContext.Provider value={themes.dark}>
        <UndoToast testID="toast" onUndo={onUndo} />
      </ThemeContext.Provider>
    </DbProvider>,
  );

let clock = 0;
const touchEvent = (fromX: number, toX: number, fromY = 0, toY = 0) => {
  const previousTimeStamp = (clock += 100);
  const currentTimeStamp = (clock += 100);
  return {
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: currentTimeStamp,
      numberActiveTouches: 1,
      touchBank: [
        {
          touchActive: true,
          startPageX: fromX,
          startPageY: fromY,
          startTimeStamp: previousTimeStamp,
          currentPageX: toX,
          currentPageY: toY,
          currentTimeStamp,
          previousPageX: fromX,
          previousPageY: fromY,
          previousTimeStamp,
        },
      ],
    },
    nativeEvent: { pageX: toX, pageY: toY, touches: [], changedTouches: [] },
  };
};

type ResponderEvent = ReturnType<typeof touchEvent>;
type ResponderProps = {
  readonly onMoveShouldSetResponder: (event: ResponderEvent) => boolean;
  readonly onResponderGrant: (event: ResponderEvent) => void;
  readonly onResponderMove: (event: ResponderEvent) => void;
  readonly onResponderRelease: (event: ResponderEvent) => void;
  readonly onResponderTerminate: (event: ResponderEvent) => void;
};
const toastProps = (): ResponderProps => screen.getByTestId('toast').props as ResponderProps;

/** Whether the toast would take this drag, asked the way the responder system asks. */
const claims = (dx: number, dy = 0): boolean => toastProps().onMoveShouldSetResponder(touchEvent(200, 200 + dx, 400, 400 + dy));

const swipeBy = async (dx: number): Promise<void> => {
  const t = toastProps();
  await act(() => {
    t.onResponderGrant(touchEvent(200, 200));
    t.onResponderMove(touchEvent(200, 200 + dx));
    t.onResponderRelease(touchEvent(200, 200 + dx));
  });
};

const toastOffset = (): number => {
  const style = StyleSheet.flatten(screen.getByTestId('toast').props.style) as {
    readonly transform: readonly Record<string, number>[];
  };
  const slide = style.transform.find((t) => 'translateX' in t);
  return slide?.translateX ?? 0;
};

const FAR = size.toast.height * 2;
const SHORT = motion.carousel.activation.innerClaimPt + 1;

beforeEach(() => {
  jest.clearAllMocks();
  useUndoToastStore.getState().dismiss();
});

describe('<UndoToast> swipe to dismiss (issue #271)', () => {
  it.each([
    ['left', -FAR],
    ['right', FAR],
  ])('a long swipe %s dismisses the toast', async (_name, dx) => {
    useUndoToastStore.getState().show(payload());
    await renderToast();

    await swipeBy(dx);

    expect(useUndoToastStore.getState().toast).toBeNull();
  });

  it.each([
    ['left', -FAR],
    ['right', FAR],
  ])('a swipe %s does NOT undo: no reversal, no forget, no running-total callback, no undo haptic', async (_name, dx) => {
    const onUndo = jest.fn();
    const action = jest.fn();
    useUndoToastStore.getState().show(payload({ action }));
    await renderToast(onUndo);

    await swipeBy(dx);

    expect(mockUndo).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(mockForgetLog).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it('a token payload swiped away is not reversed either', async () => {
    useUndoToastStore.getState().show(payload());
    await renderToast();

    await swipeBy(-FAR);

    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('the toast follows the finger while dragging, in both directions', async () => {
    useUndoToastStore.getState().show(payload());
    await renderToast();
    const t = toastProps();

    await act(() => {
      t.onResponderGrant(touchEvent(200, 200));
      t.onResponderMove(touchEvent(200, 200 - 20));
    });
    expect(toastOffset()).toBe(-20);

    await act(() => {
      t.onResponderMove(touchEvent(200, 200 + 30));
    });
    expect(toastOffset()).toBe(30);
  });

  it('a short drag springs back to rest and leaves the toast up', async () => {
    useUndoToastStore.getState().show(payload());
    await renderToast();

    await swipeBy(-SHORT);

    expect(toastOffset()).toBe(0);
    expect(useUndoToastStore.getState().toast).not.toBeNull();
    expect(screen.getByTestId('toast-title')).toHaveTextContent('Greek yoghurt');
  });

  it('a cancelled drag (another responder took over) springs back and keeps the toast', async () => {
    useUndoToastStore.getState().show(payload());
    await renderToast();
    const t = toastProps();
    await act(() => {
      t.onResponderGrant(touchEvent(200, 200));
      t.onResponderMove(touchEvent(200, 200 - FAR));
      t.onResponderTerminate(touchEvent(200, 200 - FAR));
    });

    expect(toastOffset()).toBe(0);
    expect(useUndoToastStore.getState().toast).not.toBeNull();
  });

  it('a toast shown after a swipe-dismiss starts at rest, not where the last one was thrown', async () => {
    useUndoToastStore.getState().show(payload());
    await renderToast();
    await swipeBy(-FAR);

    await act(() => {
      useUndoToastStore.getState().show(payload({ title: 'Oats' }));
    });

    expect(screen.getByTestId('toast-title')).toHaveTextContent('Oats');
    expect(toastOffset()).toBe(0);
  });

  describe('what the toast claims', () => {
    beforeEach(async () => {
      useUndoToastStore.getState().show(payload());
      await renderToast();
    });

    it('claims a clearly horizontal drag, either way', () => {
      expect(claims(-FAR)).toBe(true);
      expect(claims(FAR)).toBe(true);
    });

    it('leaves vertical scrolling beneath alone', () => {
      expect(claims(0, FAR)).toBe(false);
      expect(claims(0, -FAR)).toBe(false);
    });

    it('leaves a mostly-vertical diagonal to the scroll', () => {
      expect(claims(SHORT + 2, FAR)).toBe(false);
    });

    it('does not claim a wobble under the inner-claim distance, so a tap on Undo stays a tap', () => {
      expect(claims(SHORT - 1)).toBe(false);
    });

    it('never claims the touch at its start, so a press on Undo reaches the button', () => {
      const props = toastProps() as ResponderProps & { onStartShouldSetResponder?: (event: ResponderEvent) => boolean };
      expect(props.onStartShouldSetResponder?.(touchEvent(200, 200)) ?? false).toBe(false);
    });
  });

  it('tapping Undo still reverses the write (swipe support did not break the button)', async () => {
    const onUndo = jest.fn();
    useUndoToastStore.getState().show(payload());
    await renderToast(onUndo);

    await fireEvent.press(screen.getByTestId('toast-undo'));

    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledWith({ kcal: 120, protein: 20, entryCountDelta: 1 });
  });

  describe('screen reader', () => {
    it('is still one announced live region, and offers a dismiss action', async () => {
      useUndoToastStore.getState().show(payload());
      await renderToast();
      const t = screen.getByTestId('toast');

      expect(t.props.accessibilityLiveRegion).toBe('polite');
      expect(t.props.accessible).toBe(true);
      expect(t.props.accessibilityActions).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'dismiss' })]));
    });

    it('the dismiss action closes the toast without undoing anything', async () => {
      const onUndo = jest.fn();
      useUndoToastStore.getState().show(payload());
      await renderToast(onUndo);

      await act(() => {
        screen.getByTestId('toast').props.onAccessibilityAction({ nativeEvent: { actionName: 'dismiss' } });
      });

      expect(useUndoToastStore.getState().toast).toBeNull();
      expect(mockUndo).not.toHaveBeenCalled();
      expect(onUndo).not.toHaveBeenCalled();
      expect(mockForgetLog).not.toHaveBeenCalled();
    });
  });
});
