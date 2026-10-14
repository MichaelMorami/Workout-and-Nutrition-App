/**
 * `<CarouselPage>` (issue #82) — wraps a tab root's own content so `useTabCarousel`'s shared `dragX`
 * value moves the whole screen 1:1 with the finger (`motion.carousel.trackingGain`). The four tab
 * roots (`app/(tabs)/index.tsx`, `workout.tsx`, `charts.tsx`, `settings.tsx`) each wrap their root
 * JSX in one of these; `app/(tabs)/_layout.tsx` is the single `CarouselContext.Provider`, so all four
 * screens read the one gesture `useTabCarousel` drives, and the stacked screens behind/ahead of the
 * focused one ride the same value by construction (see that hook's own module note for why only the
 * focused screen's position is actually live during the drag).
 *
 * THE FALLBACK IS NOT A GUARD AGAINST MISUSE, IT IS THE DEFAULT. A screen rendered outside a
 * `CarouselContext.Provider` — any component test for `index.tsx`/`workout.tsx`/`charts.tsx`/
 * `settings.tsx` that does not also mount `_layout.tsx`, and any future screen that is not a tab
 * root — gets its own static `SharedValue` at 0 and renders exactly as it did before this issue. No
 * consumer has to know the carousel exists to keep passing.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

export type CarouselContextValue = { readonly dragX: SharedValue<number> };

export const CarouselContext = createContext<CarouselContextValue | null>(null);

export type CarouselPageProps = {
  readonly children: ReactNode;
  readonly testID?: string;
};

export function CarouselPage({ children, testID = 'carousel-page' }: CarouselPageProps) {
  const ctx = useContext(CarouselContext);
  // Called unconditionally (no rules-of-hooks risk) even though it is only *used* without a
  // provider: the fallback must be a real reanimated SharedValue, not a plain `{ value: 0 }`, so
  // useAnimatedStyle below can read either branch identically.
  const fallback = useSharedValue(0);
  const dragX = ctx?.dragX ?? fallback;

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value }] }));

  return (
    <Animated.View testID={testID} style={[styles.page, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
