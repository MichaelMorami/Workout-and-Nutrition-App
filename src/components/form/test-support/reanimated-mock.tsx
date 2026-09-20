/**
 * A local stand-in for `react-native-reanimated`, used only by `src/components/form/**` tests.
 *
 * WHY THIS EXISTS. Reanimated 4 loads `react-native-worklets`, which reaches for a native module at
 * import time and throws under `jest-expo/ios`. The supported fix is worklets' own jest resolver,
 * which is qa-engineer's file (tracked as #45). Until then this factory mock keeps `<FormFrame>`'s
 * footer-divider fade testable without reaching outside this folder.
 *
 * (`src/components/food-form/test-support/reanimated-mock.tsx` solves the identical problem for
 * `<FoodForm>`'s own `customReveal`. Not reused here for the same reason that file gives for not
 * reusing `src/components/quick-add/test-support/reanimated-mock.tsx`: a copy this small is cheaper
 * than a shared dependency across a folder boundary. Delete all three when #45 lands.)
 *
 * `useSharedValue` returns one value per component instance and re-renders on write, so a test sees
 * the geometry the component actually lands on after a state change — not a value frozen at mount.
 * `withTiming` resolves to its end value immediately (what lets a test assert on rendered output
 * rather than a tween in progress) and also records every call in `__timingCalls`, so a test can
 * assert *which* duration a transition actually asked for.
 */
import { createElement, useReducer, useState, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

type SharedValue<T> = { value: T };

export type MockEasing = { readonly factory: () => (t: number) => number; readonly points: readonly number[] };
export type TimingConfig = { readonly duration?: number; readonly easing?: MockEasing };

let reducedMotion = false;

/** Every `withTiming` call this test has made, in order. Cleared by `__resetAnimations()`. */
export const __timingCalls: { toValue: unknown; config: TimingConfig | undefined }[] = [];

/** Flip "reduce motion" for one test. Reset with `__resetAnimations()`. */
export function __setReducedMotion(value: boolean): void {
  reducedMotion = value;
}

/** Put reduce-motion back to off and clear the call log. Call in `afterEach`. */
export function __resetAnimations(): void {
  reducedMotion = false;
  __timingCalls.length = 0;
}

export const useReducedMotion = (): boolean => reducedMotion;

export function useSharedValue<T>(initial: T): SharedValue<T> {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
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

/** Resolves to the end state immediately — see the module note above. */
export function withTiming<T>(toValue: T, config?: TimingConfig): T {
  __timingCalls.push({ toValue, config });
  return toValue;
}

export const useAnimatedStyle = <T,>(updater: () => T): T => updater();

export const Easing = {
  bezier: (x1: number, y1: number, x2: number, y2: number): MockEasing => ({
    factory: () => (t: number) => t,
    points: [x1, y1, x2, y2],
  }),
};

function AnimatedView(props: ViewProps & { children?: ReactNode }) {
  return createElement(View, props);
}

export default { View: AnimatedView };
