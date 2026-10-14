/**
 * `useTabCarousel` (issue #82) — the `PanResponder` + reanimated wiring behind the swipe-between-tabs
 * carousel, mounted once by `app/(tabs)/_layout.tsx` and shared with every tab root through
 * `CarouselContext` (`src/components/navigation/CarouselPage.tsx`).
 *
 * MECHANISM CHOICE: `PanResponder`, not a new dependency. The issue's own acceptance requires
 * approval before adding a gesture library or replacing the expo-router `Tabs` navigator.
 * `react-native-gesture-handler` is present only transitively (no `GestureHandlerRootView` is
 * mounted anywhere in the app, per #79) and `react-native-pager-view` is not a dependency at all —
 * adding either is a new native module and a new issue, not this one. `PanResponder` is also what
 * `SwipeToDelete.tsx` already uses for the exact same job one layer in, which is *why* the
 * arbitration in `motion.carousel`'s own doc (issue #249) works for free: RN polls non-capture
 * `*ShouldSetPanResponder` handlers bubble-phase, innermost first, so `SwipeToDelete`'s 6pt claim
 * (`motion.carousel.activation.innerClaimPt`) always gets first refusal over this hook's 12pt
 * (`activation.distancePt`) with no arbitration code of this hook's own.
 *
 * THE SIMPLIFICATION THIS HOOK SHIPS, DISCLOSED: only the *focused* screen's position is live during
 * the drag. A literal "two screens, one drag" carousel needs the outgoing *and* incoming screen
 * mounted and un-frozen at once; `expo-router`'s `Tabs` (vendored `@react-navigation/bottom-tabs`,
 * `BottomTabView.js`) stacks every tab screen absolutely-filled and relies on `react-native-screens`'
 * `detachInactiveScreens`/`shouldFreeze` to keep every *unfocused* tab frozen or detached for
 * performance — there is no documented, stable way to ask it to keep tomorrow's tab live and
 * tracking a finger today without reaching into those internals, which the issue's own guard (no
 * navigator replacement without sign-off) rules out here. So during the drag the current screen
 * slides with the finger over a bare `color.bg.canvas` (`_layout.tsx`'s own background;
 * `onlyAtNavigationRoot` keeps this to the four tab roots, which already share that canvas) —
 * nothing of the destination tab is visible until it is focused. At commit, `router.navigate` makes
 * the destination the focused screen in the same tick `dragX` is shifted by exactly one page width,
 * signed toward the side the destination tab lives on in `TAB_PATHS` order — `next` is to the right,
 * so its hand-off position is `dx + pageWidthPt` (translateX positive = still entering from the
 * right), `previous` is `dx - pageWidthPt` (entering from the left). Getting either sign backward
 * makes the destination fly in from the wrong side across more than a full page width *and* flips
 * `carouselHandoffVelocity`'s toward/away test, silently dropping `releaseVelocity.carry` on every
 * commit — this hook shipped that exact bug once; see the review history on issue #82's PR for the
 * probe that caught it. Getting it right is what keeps the release spring's travel bounded and the
 * flick's own velocity actually carried into it, rather than a jump the spring has to undo. This
 * hand-off is still a real, visible difference from a true side-by-side peek (nothing of the
 * destination is visible until the swap, per the simplification above) and is called out here for
 * design-lead's/the issue's review — not silently shipped as if it were the full thing
 * `motion.carousel`'s prose describes. `router.navigate` also focuses the destination asynchronously
 * while the spring starts on `dragX` in the same tick, so the destination may render mid-flight or
 * already settled depending on timing — a device-check question, not something this hook controls.
 *
 * `gesture.vx`/`vy` from `PanResponderGestureState` are points **per millisecond**
 * (`PanResponder.js`'s own `(nextDX - dx) / dt`, `dt` a millisecond delta); `motion.carousel`'s
 * velocity numbers are points per **second**, hence the `× 1000` below.
 */
import { useMemo, useRef } from 'react';
import { PanResponder, useWindowDimensions, type GestureResponderEvent, type PanResponderGestureState } from 'react-native';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import {
  carouselCommit,
  carouselHandoffVelocity,
  carouselOffset,
  reachedCarouselEdgeStop,
  shouldActivateCarousel,
} from '../components/navigation/carousel';
import { useHapticFeedback } from './useHapticFeedback';
import { haptics, motion } from '../theme/tokens';

/** The four tab roots, in the tab bar's own left-to-right order — Today first, Settings last. */
export const TAB_PATHS = ['/', '/workout', '/charts', '/settings'] as const satisfies readonly Href[];

export type UseTabCarouselResult = {
  /** How far the focused tab root has travelled from rest — `<CarouselPage>`'s own `translateX`. */
  readonly dragX: SharedValue<number>;
  readonly panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
};

/**
 * One `PanResponder` per mount (`app/(tabs)/_layout.tsx` mounts this once for all four tab roots),
 * driving the single shared `dragX` every `<CarouselPage>` reads through `CarouselContext`.
 */
export function useTabCarousel(): UseTabCarouselResult {
  const dragX = useSharedValue(0);
  const router = useRouter();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const fireHaptic = useHapticFeedback();
  const { width: pageWidthPt } = useWindowDimensions();
  const firedEdgeHaptic = useRef(false);

  const {
    activation,
    commitFraction,
    commitVelocityPtPerS,
    edgeHaptic,
    edgeMaxTravelFraction,
    edgeResistance,
    reduced,
    releaseVelocity,
    trackingGain,
  } = motion.carousel;
  const springToken = motion.spring[motion.carousel.releaseSpring];

  // Not a ref: `pathname` is in this `useMemo`'s own dependency list below, so the whole responder
  // (and the `index` closure captured here) is rebuilt whenever the focused tab changes — cheap,
  // and only ever happens between gestures (the user has already released to get a new `pathname`),
  // never mid-drag.
  const index = TAB_PATHS.indexOf(pathname as (typeof TAB_PATHS)[number]);

  const panResponder = useMemo(
    () =>
      /* eslint-disable react-hooks/refs, react-hooks/immutability --
       * Both rules (eslint-config-expo's React-Compiler-readiness additions) flag the pattern this
       * hook depends on by design: `firedEdgeHaptic` (a ref) and `dragX.value` (reanimated's own
       * mutable `SharedValue`) are read and written from inside these handlers. The plugin treats
       * that as happening "during render" because the object literal is built inside this `useMemo`
       * factory — but these handlers themselves only ever run later, when `PanResponder` calls them
       * for an actual gesture event (the same timing class as an event handler or an effect), never
       * synchronously as part of this component's render. `SwipeToDelete.tsx` sidesteps the same
       * warning by using `useState` instead of a ref/`SharedValue`, which would force a React
       * re-render on every pixel of drag — exactly what `useSharedValue` exists to avoid (CLAUDE.md:
       * animations run on the UI thread at 60fps). Raised as a candidate for a narrower,
       * reanimated-aware `eslint.config.js` exemption instead of this per-file disable — not this
       * hook's file to change (release-engineer's).
       */
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) =>
          shouldActivateCarousel(gesture.dx, gesture.dy, activation.distancePt, activation.axisRatio),
        onPanResponderGrant: () => {
          firedEdgeHaptic.current = false;
        },
        onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
          const hasPrevious = index > 0;
          const hasNext = index >= 0 && index < TAB_PATHS.length - 1;
          const offset = carouselOffset(gesture.dx, hasPrevious, hasNext, pageWidthPt, edgeResistance, edgeMaxTravelFraction, trackingGain);
          dragX.value = offset;

          // reachedCarouselEdgeStop reads the resisted offset's *magnitude*, which a legitimate deep
          // swipe toward a real neighbour (unresisted, so equal to raw finger travel) can exceed long
          // before `commitFraction` — this must only ever ask the question at an actual edge, where
          // `carouselOffset` really is the resisted one and "reached the stop" means something.
          const atEdge = (gesture.dx < 0 && !hasNext) || (gesture.dx > 0 && !hasPrevious);
          if (atEdge && !firedEdgeHaptic.current && reachedCarouselEdgeStop(offset, pageWidthPt, edgeMaxTravelFraction)) {
            firedEdgeHaptic.current = true;
            if (edgeHaptic) fireHaptic(haptics[edgeHaptic]);
          }
        },
        onPanResponderRelease: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
          const hasPrevious = index > 0;
          const hasNext = index >= 0 && index < TAB_PATHS.length - 1;
          // PanResponderGestureState.vx/vy are pt/ms; motion.carousel's velocities are pt/s.
          const vxPtPerS = gesture.vx * 1000;
          const commit = carouselCommit(gesture.dx, vxPtPerS, pageWidthPt, hasPrevious, hasNext, commitFraction, commitVelocityPtPerS);

          if (commit === 'next') {
            // The next tab is to the right in TAB_PATHS order, so its camera hand-off position is
            // dx + pageWidthPt (translateX positive = further right, i.e. "still entering from the
            // right"), not dx - pageWidthPt. See this function's own review history (#82's PR) for
            // the probe that caught the signs swapped: a committed-next flick at dx=-175,
            // pageWidthPt=750 must hand off at +575, not -925.
            router.navigate(TAB_PATHS[index + 1] as Href);
            dragX.value += pageWidthPt;
          } else if (commit === 'previous') {
            router.navigate(TAB_PATHS[index - 1] as Href);
            dragX.value -= pageWidthPt;
          }

          const remainingPt = 0 - dragX.value;
          const velocity = carouselHandoffVelocity(
            vxPtPerS,
            remainingPt,
            springToken.duration,
            releaseVelocity.carry,
            releaseVelocity.capSpringSpeeds,
            releaseVelocity.awayFromDestination,
          );

          dragX.value = reducedMotion
            ? withTiming(0, { duration: reduced.release.duration })
            : withSpring(0, { dampingRatio: springToken.dampingRatio, duration: springToken.duration, velocity });
        },
        onPanResponderTerminate: () => {
          dragX.value = withTiming(0, { duration: 0 });
        },
      }),
      /* eslint-enable react-hooks/refs, react-hooks/immutability */
    [
      activation.axisRatio,
      activation.distancePt,
      commitFraction,
      commitVelocityPtPerS,
      dragX,
      edgeHaptic,
      edgeMaxTravelFraction,
      edgeResistance,
      fireHaptic,
      index,
      pageWidthPt,
      reduced.release.duration,
      reducedMotion,
      releaseVelocity.awayFromDestination,
      releaseVelocity.capSpringSpeeds,
      releaseVelocity.carry,
      router,
      springToken.dampingRatio,
      springToken.duration,
      trackingGain,
    ],
  );

  return { dragX, panHandlers: panResponder.panHandlers };
}
