/**
 * A local stand-in for `react-native-reanimated`, used only by this folder's tests.
 *
 * WHY THIS EXISTS. Reanimated 4 loads `react-native-worklets`, which reaches for a native module at
 * import time and throws `Cannot read properties of undefined (reading 'loadUnpackers')` under
 * `jest-expo/ios`. The library's own `react-native-reanimated/mock` re-imports the real index, so it
 * fails the same way. The supported fix is worklets' own resolver
 * (`resolver: 'react-native-worklets/jest/resolver'` in `jest.config.js`), which is qa-engineer's
 * file — raised on #19. Until then this factory mock keeps animated components testable without
 * reaching outside `src/components/charts/**`.
 *
 * WHAT IT GUARANTEES. Animations resolve to their END STATE immediately: `withTiming(x)` returns `x`
 * and `useAnimatedProps(fn)` calls `fn()` on every render. So a test asserts the geometry the arc
 * settles on, which is exactly the thing that must be correct — the tween in between is reanimated's
 * job, not this component's.
 */
import { createElement, type ComponentType } from 'react';

type SharedValue<T> = { value: T };

let reducedMotion = false;

/** Flip "reduce motion" for one test. Call `__setReducedMotion(false)` in `afterEach`. */
export function __setReducedMotion(value: boolean): void {
  reducedMotion = value;
}

export const useReducedMotion = (): boolean => reducedMotion;

export const useSharedValue = <T,>(initial: T): SharedValue<T> => ({ value: initial });

/** The end state, immediately — see the note above. */
export const withTiming = <T,>(toValue: T): T => toValue;

export const useAnimatedProps = <T,>(updater: () => T): T => updater();

export const Easing = {
  bezier: (x1: number, y1: number, x2: number, y2: number) => ({
    factory: () => (t: number) => t,
    points: [x1, y1, x2, y2],
  }),
};

type WithAnimatedProps<P> = P & { animatedProps?: Partial<P> };

/**
 * Merges `animatedProps` into the rendered element, so a test reads the resolved value off the node
 * exactly where the real library would have written it.
 */
export function createAnimatedComponent<P extends object>(Component: ComponentType<P>) {
  return function AnimatedComponent(props: WithAnimatedProps<P>) {
    const { animatedProps, ...rest } = props;
    return createElement(Component, { ...(rest as P), ...(animatedProps ?? {}) });
  };
}

export default { createAnimatedComponent };
