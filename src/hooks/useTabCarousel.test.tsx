/**
 * `useTabCarousel` (issue #82) — the `PanResponder` + reanimated wiring behind the swipe-between-tabs
 * carousel. Drives the same real `onResponder*` handlers `SwipeToDelete.test.tsx` drives (that file's
 * own comment explains why this harness shape is duplicated rather than shared — qa-engineer's call,
 * left on the issue), so these tests prove actual gesture behaviour, not a reimplementation of it.
 *
 * `react-native-reanimated` is mocked with the navigation folder's own test-support mock (issue #82);
 * reused here by direct relative import rather than copied again, because this hook and that mock are
 * both ui-engineer's own files — no cross-agent dependency, just one fewer near-identical copy.
 */
import { act, renderHook } from '@testing-library/react-native';
import { Dimensions, type GestureResponderEvent } from 'react-native';
import * as ReanimatedMock from '../components/navigation/test-support/reanimated-mock';
import { haptics, motion } from '../theme/tokens';
import { TAB_PATHS, useTabCarousel, type UseTabCarouselResult } from './useTabCarousel';

jest.mock('react-native-reanimated', () => jest.requireActual('../components/navigation/test-support/reanimated-mock'));

const mockNavigate = jest.fn();
let mockPathname = '/';
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  usePathname: () => mockPathname,
}));

const mockFireHaptic = jest.fn();
jest.mock('./useHapticFeedback', () => ({ useHapticFeedback: () => mockFireHaptic }));

/**
 * `useWindowDimensions` is deliberately not mocked: jest-expo's own `ios` preset fixes
 * `Dimensions.get('window')` to one deterministic device size for every test in this project
 * (750×1334, scale 2) with no setup of this file's own, so reading it here keeps the thresholds
 * below correct however that preset default ever changes, instead of risking drift against a
 * second, hand-picked number.
 */
const PAGE_WIDTH_PT = Dimensions.get('window').width;

afterEach(() => {
  mockNavigate.mockClear();
  mockFireHaptic.mockClear();
  mockPathname = '/';
  ReanimatedMock.__resetAnimations();
});

type ResponderEvent = GestureResponderEvent & { readonly touchHistory: unknown };

let clock = 0;
const touchEvent = (fromX: number, toX: number, fromY = 0, toY = 0): ResponderEvent => {
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
  } as unknown as ResponderEvent;
};

/**
 * Drives grant → move → release exactly like a committed drag — same shape as
 * `SwipeToDelete.test.tsx`'s `swipeBy`.
 *
 * `act()` always returns a thenable, sync callback or not — React warns ("You called
 * act(async () => ...) without await") whenever that thenable is dropped and the callback left
 * passive effects (the reanimated mock's `useReducer`-backed `forceRender`) unflushed. Left
 * un-awaited here, that leftover flush bled into the *next* test's fresh `renderHook` call, racing
 * its `result.current` assignment (`render-hook.js` sets it inside a `useEffect`) and producing an
 * intermittent `result.current === null` — hence `async`/`await` on every call below.
 */
async function drag(result: { current: UseTabCarouselResult }, dx: number, dy = 0): Promise<void> {
  const handlers = result.current.panHandlers as unknown as {
    onResponderGrant: (e: ResponderEvent) => void;
    onResponderMove: (e: ResponderEvent) => void;
    onResponderRelease: (e: ResponderEvent) => void;
  };
  await act(() => {
    handlers.onResponderGrant(touchEvent(200, 200));
    handlers.onResponderMove(touchEvent(200, 200 + dx, 0, dy));
    handlers.onResponderRelease(touchEvent(200, 200 + dx, 0, dy));
  });
}

describe('useTabCarousel', () => {
  it('starts at dragX 0', async () => {
    const { result } = await renderHook(() => useTabCarousel());
    expect(result.current.dragX.value).toBe(0);
  });

  it('a leftward drag past commitFraction, from the middle of the tab order, navigates to the next tab', async () => {
    mockPathname = TAB_PATHS[1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    const dx = -(PAGE_WIDTH_PT * motion.carousel.commitFraction + 10);
    await drag(result, dx);

    expect(mockNavigate).toHaveBeenCalledWith(TAB_PATHS[2]);
  });

  it('a rightward drag past commitFraction navigates to the previous tab', async () => {
    mockPathname = TAB_PATHS[2] as string;
    const { result } = await renderHook(() => useTabCarousel());

    const dx = PAGE_WIDTH_PT * motion.carousel.commitFraction + 10;
    await drag(result, dx);

    expect(mockNavigate).toHaveBeenCalledWith(TAB_PATHS[1]);
  });

  it('a drag short of commitFraction, with no lift-off speed, does not navigate and springs back to 0', async () => {
    mockPathname = TAB_PATHS[1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    const dx = -(PAGE_WIDTH_PT * motion.carousel.commitFraction - 20);
    await drag(result, dx);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.dragX.value).toBe(0);
  });

  it('never commits past the last tab, however far the drag — wrapAround is false', async () => {
    mockPathname = TAB_PATHS[TAB_PATHS.length - 1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    await drag(result, -(PAGE_WIDTH_PT * motion.carousel.commitFraction + 50));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('never commits before the first tab, however far the drag', async () => {
    mockPathname = TAB_PATHS[0] as string;
    const { result } = await renderHook(() => useTabCarousel());

    await drag(result, PAGE_WIDTH_PT * motion.carousel.commitFraction + 50);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('a successful commit fires no haptic — motion.carousel.commitHaptic is null by design', async () => {
    mockPathname = TAB_PATHS[1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    await drag(result, -(PAGE_WIDTH_PT * motion.carousel.commitFraction + 10));

    expect(mockFireHaptic).not.toHaveBeenCalled();
  });

  it('reaching the edge stop past the last tab fires the edge haptic once', async () => {
    mockPathname = TAB_PATHS[TAB_PATHS.length - 1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    const handlers = result.current.panHandlers as unknown as {
      onResponderGrant: (e: ResponderEvent) => void;
      onResponderMove: (e: ResponderEvent) => void;
      onResponderRelease: (e: ResponderEvent) => void;
    };
    await act(() => {
      handlers.onResponderGrant(touchEvent(200, 200));
      // Past the edge stop at edgeResistance 0.3 / edgeMaxTravelFraction 0.1: a big finger travel is
      // needed to reach the (small) content stop. 1000pt of finger travel is comfortably past it.
      handlers.onResponderMove(touchEvent(200, 200 - 1000));
      handlers.onResponderMove(touchEvent(200, 200 - 1010));
      handlers.onResponderRelease(touchEvent(200, 200 - 1010));
    });

    expect(mockFireHaptic).toHaveBeenCalledTimes(1);
    expect(mockFireHaptic).toHaveBeenCalledWith(haptics.carouselEdge);
  });

  it('a committed release uses the real withSpring release, not an instant jump', async () => {
    const withSpring = jest.spyOn(ReanimatedMock, 'withSpring');
    mockPathname = TAB_PATHS[1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    await drag(result, -(PAGE_WIDTH_PT * motion.carousel.commitFraction + 10));

    expect(withSpring).toHaveBeenCalled();
  });

  it('under reduce motion, release is instant (withTiming at reduced.release.duration), not a spring', async () => {
    ReanimatedMock.__setReducedMotion(true);
    const withTiming = jest.spyOn(ReanimatedMock, 'withTiming');
    mockPathname = TAB_PATHS[1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    await drag(result, -(PAGE_WIDTH_PT * motion.carousel.commitFraction + 10));

    expect(withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: motion.carousel.reduced.release.duration }));
  });

  it('claims a drag past activation.distancePt, inside the axisRatio cone', async () => {
    const { result } = await renderHook(() => useTabCarousel());
    const front = result.current.panHandlers as unknown as {
      onMoveShouldSetResponderCapture: (e: ResponderEvent) => boolean;
      onMoveShouldSetResponder: (e: ResponderEvent) => boolean;
    };
    const event = touchEvent(200, 200 - (motion.carousel.activation.distancePt + 1));
    front.onMoveShouldSetResponderCapture(event);
    expect(front.onMoveShouldSetResponder(event)).toBe(true);
  });

  it('does not claim a drag at or under activation.distancePt', async () => {
    const { result } = await renderHook(() => useTabCarousel());
    const front = result.current.panHandlers as unknown as {
      onMoveShouldSetResponderCapture: (e: ResponderEvent) => boolean;
      onMoveShouldSetResponder: (e: ResponderEvent) => boolean;
    };
    const event = touchEvent(200, 200 - motion.carousel.activation.distancePt);
    front.onMoveShouldSetResponderCapture(event);
    expect(front.onMoveShouldSetResponder(event)).toBe(false);
  });
});

describe('TAB_PATHS', () => {
  it('is the tab order in the bar, Today first and Settings last', () => {
    expect(TAB_PATHS).toEqual(['/', '/workout', '/charts', '/settings']);
  });
});
