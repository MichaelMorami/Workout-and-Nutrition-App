/**
 * `useTabCarousel` (issue #82) — the `PanResponder` + reanimated wiring behind the swipe-between-tabs
 * carousel. Drives the same real `onResponder*` handlers `SwipeToDelete.test.tsx` drives (that file's
 * own comment explains why this harness shape is duplicated rather than shared — qa-engineer's call,
 * left on the issue), so these tests prove actual gesture behaviour, not a reimplementation of it.
 *
 * `react-native-reanimated` is mocked with the navigation folder's own test-support mock (issue #82);
 * reused here by direct relative import rather than copied again, because this hook and that mock are
 * both ui-engineer's own files — no cross-agent dependency, just one fewer near-identical copy.
 *
 * EXPLICIT VELOCITY (PR #261 review, B5). `PanResponderGestureState.vx` is not an input this harness
 * sets directly — real `PanResponder` derives it from touch *timestamps* (`_updateGestureStateOnMove`:
 * `vx = (nextDX - dx) / dt`, `dt` the move event's own `touchHistory.mostRecentTimeStamp`, because
 * `onResponderGrant` never advances the gesture's `_accountsForMovesUpTo` baseline off 0). The
 * previous harness built those timestamps off one shared, never-reset `clock` counter, so `vx` for a
 * given `dx` drifted depending on how many touch events every earlier test in the file had already
 * sent through it — reviewed and confirmed accidental, not deliberate (probed at −437.5 … −32.4 pt/s
 * for the same nominal "fast flick" at different points in the file). `drag()` below resets `clock`
 * to 0 at the start of every call (so no test's velocity depends on execution order) and takes an
 * explicit, optional `vxPtPerS` that `dtMsFor` solves for exactly, so a test that cares about velocity
 * states the number it means, and a test that does not can omit it and get a steady, reproducible
 * default instead of an emergent one.
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

const springToken = motion.spring[motion.carousel.releaseSpring];

afterEach(() => {
  mockNavigate.mockClear();
  mockFireHaptic.mockClear();
  mockPathname = '/';
  ReanimatedMock.__resetAnimations();
});

type ResponderEvent = GestureResponderEvent & { readonly touchHistory: unknown };

let clock = 0;
const touchEvent = (fromX: number, toX: number, fromY = 0, toY = 0, tickMs = 100): ResponderEvent => {
  const previousTimeStamp = (clock += tickMs);
  const currentTimeStamp = (clock += tickMs);
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
 * The tick size (ms) that makes `PanResponder`'s derived `vx` equal exactly `vxPtPerS` for a given
 * `dx`. With `clock` reset to 0 for the gesture, the move event's `mostRecentTimeStamp` — the only
 * timestamp `_updateGestureStateOnMove` measures `dt` against, since `onResponderGrant` never moves
 * the baseline off 0 — lands at `4 × tickMs` (two ticks consumed by the grant touch event, two more
 * by the move touch event, built the same way `drag()` below sends them). So
 * `vxPtPerS = (dx / (4 × tickMs)) × 1000` (the hook's own `× 1000`, ms→s) rearranges to this.
 *
 * `vxPtPerS` omitted or 0 means "no lift-off speed": there is no tick size that produces an exact
 * zero velocity for a non-zero `dx` without dividing by zero, so this returns a tick large enough
 * that the resulting `vx` is negligible against every threshold this file tests against (420 pt/s).
 */
function dtMsFor(dx: number, vxPtPerS: number | undefined): number {
  if (!vxPtPerS) return 250_000;
  return (dx * 1000) / (4 * vxPtPerS);
}

/**
 * Drives grant → move → release exactly like a committed drag — same shape as
 * `SwipeToDelete.test.tsx`'s `swipeBy`. `clock` resets to 0 here (not just at module load) so this
 * gesture's own `vxPtPerS` never depends on how many gestures ran in earlier tests — see this file's
 * own module note (B5).
 *
 * `act()` always returns a thenable, sync callback or not — React warns ("You called
 * act(async () => ...) without await") whenever that thenable is dropped and the callback left
 * passive effects (the reanimated mock's `useReducer`-backed `forceRender`) unflushed. Left
 * un-awaited here, that leftover flush bled into the *next* test's fresh `renderHook` call, racing
 * its `result.current` assignment (`render-hook.js` sets it inside a `useEffect`) and producing an
 * intermittent `result.current === null` — hence `async`/`await` on every call below.
 */
async function drag(result: { current: UseTabCarouselResult }, dx: number, dy = 0, vxPtPerS?: number): Promise<void> {
  clock = 0;
  const tickMs = dtMsFor(dx, vxPtPerS);
  const handlers = result.current.panHandlers as unknown as {
    onResponderGrant: (e: ResponderEvent) => void;
    onResponderMove: (e: ResponderEvent) => void;
    onResponderRelease: (e: ResponderEvent) => void;
  };
  await act(() => {
    handlers.onResponderGrant(touchEvent(200, 200, 0, 0, tickMs));
    handlers.onResponderMove(touchEvent(200, 200 + dx, 0, dy, tickMs));
    handlers.onResponderRelease(touchEvent(200, 200 + dx, 0, dy, tickMs));
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
    await drag(result, dx, 0, 0); // distance alone, deliberately no lift-off speed — see B5 note above.

    expect(mockNavigate).toHaveBeenCalledWith(TAB_PATHS[2]);
  });

  it('a rightward drag past commitFraction navigates to the previous tab', async () => {
    mockPathname = TAB_PATHS[2] as string;
    const { result } = await renderHook(() => useTabCarousel());

    const dx = PAGE_WIDTH_PT * motion.carousel.commitFraction + 10;
    await drag(result, dx, 0, 0); // distance alone, deliberately no lift-off speed.

    expect(mockNavigate).toHaveBeenCalledWith(TAB_PATHS[1]);
  });

  it('a drag short of commitFraction, with no deliberate lift-off speed, does not navigate and springs back to 0', async () => {
    mockPathname = TAB_PATHS[1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    const dx = -(PAGE_WIDTH_PT * motion.carousel.commitFraction - 20);
    await drag(result, dx, 0, 0);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.dragX.value).toBe(0);
  });

  it('commits via velocity alone, short of commitFraction, on a deliberate fast flick (hook-level mirror of carouselCommit\'s own test)', async () => {
    mockPathname = TAB_PATHS[1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    const dx = -5; // nowhere near commitFraction*pageWidthPt on its own.
    const vxPtPerS = -(motion.carousel.commitVelocityPtPerS + 200); // a deliberate fast leftward flick.
    await drag(result, dx, 0, vxPtPerS);

    expect(mockNavigate).toHaveBeenCalledWith(TAB_PATHS[2]);
  });

  it('never commits past the last tab, however far the drag — wrapAround is false', async () => {
    mockPathname = TAB_PATHS[TAB_PATHS.length - 1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    await drag(result, -(PAGE_WIDTH_PT * motion.carousel.commitFraction + 50), 0, 0);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('never commits before the first tab, however far the drag', async () => {
    mockPathname = TAB_PATHS[0] as string;
    const { result } = await renderHook(() => useTabCarousel());

    await drag(result, PAGE_WIDTH_PT * motion.carousel.commitFraction + 50, 0, 0);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('a successful commit fires no haptic — motion.carousel.commitHaptic is null by design', async () => {
    mockPathname = TAB_PATHS[1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    await drag(result, -(PAGE_WIDTH_PT * motion.carousel.commitFraction + 10), 0, 0);

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

    await drag(result, -(PAGE_WIDTH_PT * motion.carousel.commitFraction + 10), 0, 0);

    expect(withSpring).toHaveBeenCalled();
  });

  it('under reduce motion, release is instant (withTiming at reduced.release.duration), not a spring', async () => {
    ReanimatedMock.__setReducedMotion(true);
    const withTiming = jest.spyOn(ReanimatedMock, 'withTiming');
    mockPathname = TAB_PATHS[1] as string;
    const { result } = await renderHook(() => useTabCarousel());

    await drag(result, -(PAGE_WIDTH_PT * motion.carousel.commitFraction + 10), 0, 0);

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

  // --- B3 (PR #261 review): nothing previously proved the screen actually follows the finger. ---
  describe('the screen tracks the finger during the drag (B3)', () => {
    it('moves dragX 1:1 with the finger in the middle of the tab order, before any release', async () => {
      mockPathname = TAB_PATHS[1] as string;
      const { result } = await renderHook(() => useTabCarousel());
      const handlers = result.current.panHandlers as unknown as { onResponderGrant: (e: ResponderEvent) => void; onResponderMove: (e: ResponderEvent) => void };

      await act(() => {
        handlers.onResponderGrant(touchEvent(200, 200));
        handlers.onResponderMove(touchEvent(200, 200 - 50));
      });

      expect(result.current.dragX.value).toBe(-50);
    });

    it('resists and clamps dragX at the edge stop, not the raw finger travel', async () => {
      mockPathname = TAB_PATHS[TAB_PATHS.length - 1] as string; // no next tab — every leftward drag is an edge.
      const { result } = await renderHook(() => useTabCarousel());
      const handlers = result.current.panHandlers as unknown as { onResponderGrant: (e: ResponderEvent) => void; onResponderMove: (e: ResponderEvent) => void };

      await act(() => {
        handlers.onResponderGrant(touchEvent(200, 200));
        handlers.onResponderMove(touchEvent(200, 200 - 1000)); // far past the stop — must clamp, not track raw.
      });

      expect(result.current.dragX.value).toBe(-(PAGE_WIDTH_PT * motion.carousel.edgeMaxTravelFraction));
    });
  });

  // --- B1/B2/B4 (PR #261 review): the camera hand-off's sign, and the release spring it feeds. ---
  describe('the committed camera hand-off (B1/B2/B4)', () => {
    it('hands a "next" commit off from the right (+pageWidthPt), carrying a toward-destination flick into the spring config read straight from the token', async () => {
      mockPathname = TAB_PATHS[1] as string;
      const { result } = await renderHook(() => useTabCarousel());

      const handoffs: { dragXAtCall: number; config: { dampingRatio?: number; duration?: number; velocity?: number } }[] = [];
      jest.spyOn(ReanimatedMock, 'withSpring').mockImplementation((toValue, config, callback) => {
        handoffs.push({ dragXAtCall: result.current.dragX.value, config: (config ?? {}) as { dampingRatio?: number; duration?: number; velocity?: number } });
        callback?.(true);
        return toValue as number;
      });

      const dx = -(PAGE_WIDTH_PT * motion.carousel.commitFraction + 10); // -175 at this project's fixed 750pt width.
      const vxPtPerS = -1200; // a deliberate, fast leftward flick — same direction as dx.
      await drag(result, dx, 0, vxPtPerS);

      expect(mockNavigate).toHaveBeenCalledWith(TAB_PATHS[2]);
      expect(handoffs).toHaveLength(1);
      // dx + pageWidthPt, never dx - pageWidthPt (the B1 bug: this hook once shipped -925 here, not
      // +575) — the destination enters from the right, which is where "next" sits in TAB_PATHS order.
      expect(handoffs[0]?.dragXAtCall).toBe(dx + PAGE_WIDTH_PT);
      // With the hand-off sign fixed, a flick in the same direction as the commit is toward the
      // destination, not away from it — carouselHandoffVelocity must not drop it to 0 (the B1 bug's
      // second half: every commit silently lost releaseVelocity.carry).
      expect(handoffs[0]?.config.velocity).not.toBe(0);
      expect(handoffs[0]?.config.velocity as number).toBeLessThan(0);
      // B4: the spring's own config, not a stand-in — a hard-coded damping/duration stays invisible
      // without this.
      expect(handoffs[0]?.config.dampingRatio).toBe(springToken.dampingRatio);
      expect(handoffs[0]?.config.duration).toBe(springToken.duration);
    });

    it('hands a "previous" commit off from the left (-pageWidthPt), carrying a toward-destination flick the same way, mirrored', async () => {
      mockPathname = TAB_PATHS[2] as string;
      const { result } = await renderHook(() => useTabCarousel());

      const handoffs: { dragXAtCall: number; config: { dampingRatio?: number; duration?: number; velocity?: number } }[] = [];
      jest.spyOn(ReanimatedMock, 'withSpring').mockImplementation((toValue, config, callback) => {
        handoffs.push({ dragXAtCall: result.current.dragX.value, config: (config ?? {}) as { dampingRatio?: number; duration?: number; velocity?: number } });
        callback?.(true);
        return toValue as number;
      });

      const dx = PAGE_WIDTH_PT * motion.carousel.commitFraction + 10; // +175.
      const vxPtPerS = 1200; // a deliberate, fast rightward flick — same direction as dx.
      await drag(result, dx, 0, vxPtPerS);

      expect(mockNavigate).toHaveBeenCalledWith(TAB_PATHS[1]);
      expect(handoffs).toHaveLength(1);
      expect(handoffs[0]?.dragXAtCall).toBe(dx - PAGE_WIDTH_PT);
      expect(handoffs[0]?.config.velocity).not.toBe(0);
      expect(handoffs[0]?.config.velocity as number).toBeGreaterThan(0);
      expect(handoffs[0]?.config.dampingRatio).toBe(springToken.dampingRatio);
      expect(handoffs[0]?.config.duration).toBe(springToken.duration);
    });
  });
});

describe('TAB_PATHS', () => {
  it('is the tab order in the bar, Today first and Settings last', () => {
    expect(TAB_PATHS).toEqual(['/', '/workout', '/charts', '/settings']);
  });
});
