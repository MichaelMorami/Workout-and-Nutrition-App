/**
 * A local stand-in for `react-native-reanimated`, used only by `src/components/navigation/**` and
 * `src/hooks/useTabCarousel` tests.
 *
 * WHY THIS EXISTS. Reanimated 4 loads `react-native-worklets`, which reaches for a native module at
 * import time and throws under `jest-expo/ios`. The supported fix is worklets' own jest resolver
 * (qa-engineer's file, tracked as #45). Until then this factory mock keeps the carousel testable
 * without reaching outside this folder — same reasoning, and the same local-duplicate convention
 * (not a shared module) as `src/components/quick-add/test-support/reanimated-mock.tsx` and
 * `src/components/today/test-support/reanimated-mock.tsx`.
 *
 * TWO ADDITIONS NEITHER OF THOSE NEEDS. `useTabCarousel` is the first consumer of `withSpring` (the
 * carousel's release) and `runOnJS` (nothing calls it yet, but reanimated's own `withSpring`/
 * `withTiming` callbacks run on the UI thread for real and must be bounced back with `runOnJS` to
 * touch JS state — kept here so a future callback has it without a second mock edit).
 *
 * `withSpring` resolves to `toValue` immediately, exactly like this file's own `withTiming` — every
 * test here asserts on the settled value, never mid-tween, so neither needs to simulate motion.
 */
import { createElement, useReducer, useState, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

type SharedValue<T> = { value: T };

export type MockEasing = { readonly factory: () => (t: number) => number; readonly points: readonly number[] };
export type TimingConfig = { readonly duration?: number; readonly easing?: MockEasing };
export type SpringConfig = { readonly dampingRatio?: number; readonly duration?: number; readonly velocity?: number };

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
export function withTiming<T>(toValue: T, _config?: TimingConfig, callback?: (finished: boolean) => void): T {
  callback?.(true);
  return toValue;
}

/** Resolves to the end state immediately — see the module note above. */
export function withSpring<T>(toValue: T, _config?: SpringConfig, callback?: (finished: boolean) => void): T {
  callback?.(true);
  return toValue;
}

/** Calls straight through — there is no UI/JS thread split in this mock. */
export function runOnJS<Args extends readonly unknown[], Return>(fn: (...args: Args) => Return): (...args: Args) => Return {
  return fn;
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
