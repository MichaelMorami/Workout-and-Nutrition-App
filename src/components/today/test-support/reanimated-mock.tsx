/**
 * A local stand-in for `react-native-reanimated`, used only by `src/components/today/**` tests.
 *
 * WHY THIS EXISTS. Reanimated 4 loads `react-native-worklets`, which reaches for a native module at
 * import time and throws under `jest-expo/ios`. The supported fix is worklets' own jest resolver
 * (qa-engineer's file, tracked as #45). Until then this factory mock keeps `<TodayHeader>` — which
 * renders the real `<ProgressArc>` from `src/components/charts` — testable without reaching outside
 * this folder.
 *
 * (`src/components/charts/test-support/reanimated-mock.tsx` solves the identical problem for the
 * arcs in isolation. Not reused here: `src/components/charts/**` is charts-engineer's exclusive-write
 * path, and a copy this small is cheaper to own than a cross-agent dependency on another agent's test
 * fixture — same reasoning as `src/components/quick-add/test-support/reanimated-mock.tsx`.)
 *
 * The default export carries both `View` (what `QuickAddTile`'s `Animated.View` needs) and
 * `createAnimatedComponent` (what `ProgressArc`'s `Animated.createAnimatedComponent(Circle)` needs):
 * `app/(tabs)/index.tsx` mounts `<TodayHeader>` and `<QuickAddGrid>` together, so a test that renders
 * the whole Today screen needs one mock module that satisfies both.
 */
import { createElement, useReducer, useState, type ComponentType, type ReactNode } from 'react';
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

/** Resolves to the end state immediately, like reanimated's real behaviour once the tween settles. */
export function withTiming<T>(toValue: T, _config?: TimingConfig): T {
  return toValue;
}

export const useAnimatedProps = <T,>(updater: () => T): T => updater();
export const useAnimatedStyle = <T,>(updater: () => T): T => updater();

export const Easing = {
  bezier: (x1: number, y1: number, x2: number, y2: number): MockEasing => ({
    factory: () => (t: number) => t,
    points: [x1, y1, x2, y2],
  }),
};

type WithAnimatedProps<P> = P & { animatedProps?: Partial<P> };

/** Merges `animatedProps` into the rendered element, matching where the real library writes them. */
export function createAnimatedComponent<P extends object>(Component: ComponentType<P>) {
  return function AnimatedComponent(props: WithAnimatedProps<P>) {
    const { animatedProps, ...rest } = props;
    return createElement(Component, { ...(rest as P), ...(animatedProps ?? {}) });
  };
}

function AnimatedView(props: ViewProps & { children?: ReactNode }) {
  return createElement(View, props);
}

export default { View: AnimatedView, createAnimatedComponent };
