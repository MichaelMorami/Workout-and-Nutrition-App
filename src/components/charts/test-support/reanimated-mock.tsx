/**
 * A local stand-in for `react-native-reanimated`, used only by this folder's tests.
 *
 * WHY THIS EXISTS. Reanimated 4 loads `react-native-worklets`, which reaches for a native module at
 * import time and throws `Cannot read properties of undefined (reading 'loadUnpackers')` under
 * `jest-expo/ios`. The library's own `react-native-reanimated/mock` re-imports the real index, so it
 * fails the same way. The supported fix is worklets' own resolver
 * (`resolver: 'react-native-worklets/jest/resolver'` in `jest.config.js`), which is qa-engineer's
 * file — raised on #19 and tracked as #45. Until then this factory mock keeps animated components
 * testable without reaching outside `src/components/charts/**`. Delete it when #45 lands.
 *
 * WHAT IT GUARANTEES — and why it is not a rubber stamp. The first version of this mock resolved
 * every animation to its end state and threw the call away, so deleting the component's animation
 * driver outright left the whole suite green. Two things make it falsifiable now:
 *
 *   1. `withTiming` RECORDS every call in `timings` before returning its end value, so a test can
 *      assert the animation was started at all, with which duration and which easing.
 *   2. `useSharedValue` returns ONE value per component instance (not a fresh one per render) and
 *      re-renders on write. So the rendered geometry follows the driver: if nothing ever assigns
 *      `laps.value`, the node keeps the value it mounted with and a re-target test fails.
 *
 * The tween in between is still reanimated's job, not this component's — what is asserted here is
 * that the component starts the right animation and lands on the right geometry.
 */
import { createElement, useReducer, useState, type ComponentType } from 'react';

type SharedValue<T> = { value: T };

/** The shape this mock's `Easing.bezier` returns — enough to assert which curve was asked for. */
export type MockEasing = {
  readonly factory: () => (t: number) => number;
  readonly points: readonly number[];
};

export type TimingConfig = {
  readonly duration?: number;
  readonly easing?: MockEasing;
};

export type RecordedTiming = {
  readonly toValue: unknown;
  readonly config?: TimingConfig;
};

/** Every `withTiming` call made since the last reset, oldest first. */
export const timings: RecordedTiming[] = [];

let reducedMotion = false;

/** Flip "reduce motion" for one test. Reset with `__resetAnimations()`. */
export function __setReducedMotion(value: boolean): void {
  reducedMotion = value;
}

/** Clear recorded animations and put reduce-motion back to off. Call in `afterEach`. */
export function __resetAnimations(): void {
  timings.length = 0;
  reducedMotion = false;
}

export const useReducedMotion = (): boolean => reducedMotion;

/**
 * One shared value per component instance, held across re-renders like the real one, and writing to
 * it re-renders so `useAnimatedProps` recomputes. That is what lets a test see a stale driver.
 */
export function useSharedValue<T>(initial: T): SharedValue<T> {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  // `useState`'s lazy initialiser runs exactly once per instance. A `useRef` filled in on the first
  // render would do the same job, but it is a write to a ref during render — `react-hooks` rejects
  // it, and under a concurrent root it is genuinely unsafe.
  const [shared] = useState<SharedValue<T>>(() => {
    let current = initial;
    return {
      get value(): T {
        return current;
      },
      set value(next: T) {
        if (Object.is(current, next)) return;
        current = next;
        forceRender();
      },
    };
  });
  return shared;
}

/** Records the call, then resolves to the end state immediately — see the note above. */
export function withTiming<T>(toValue: T, config?: TimingConfig): T {
  timings.push({ toValue, config });
  return toValue;
}

export const useAnimatedProps = <T,>(updater: () => T): T => updater();

export const Easing = {
  bezier: (x1: number, y1: number, x2: number, y2: number): MockEasing => ({
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
