/**
 * A local stand-in for `react-native-reanimated`, used only by `src/components/quick-add/**`
 * tests.
 *
 * WHY THIS EXISTS. Reanimated 4 loads `react-native-worklets`, which reaches for a native module at
 * import time and throws under `jest-expo/ios`. The supported fix is worklets' own jest resolver,
 * which is qa-engineer's file (tracked as #45). Until then this factory mock keeps animated tiles
 * testable without reaching outside this folder. Delete it when #45 lands.
 *
 * (`src/components/charts/test-support/reanimated-mock.tsx` solves the identical problem for the
 * arcs. It is not reused here — `src/components/charts/**` is charts-engineer's exclusive-write
 * path, and a copy small enough to fit what a tile actually needs is cheaper to own than a shared
 * dependency on another agent's test fixture.)
 *
 * `useSharedValue` returns one value per component instance and re-renders on write, so a test sees
 * the geometry the component actually lands on after a state change — not a value frozen at mount.
 * `withTiming` resolves to its end value immediately, which is what lets every test here assert on
 * rendered output rather than a tween in progress.
 */
import { createElement, useReducer, useState, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

type SharedValue<T> = { value: T };

export type MockEasing = { readonly factory: () => (t: number) => number; readonly points: readonly number[] };
export type TimingConfig = { readonly duration?: number; readonly easing?: MockEasing };

let reducedMotion = false;

/** Flip "reduce motion" for one test. Reset with `__resetAnimations()`. */
export function __setReducedMotion(value: boolean): void {
  reducedMotion = value;
}

/** Put reduce-motion back to off. Call in `afterEach`. */
export function __resetAnimations(): void {
  reducedMotion = false;
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
export function withTiming<T>(toValue: T, _config?: TimingConfig): T {
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
