/**
 * `<FormFrame>` — issue #207's shared form-frame mechanism (decision 13, `docs/decisions.md`): one
 * scrolling body and one action footer that never scrolls and rides the keyboard's own OS curve.
 * `<FoodForm>` is the first adopter; the design spec's own note (`design/keyboard-footer/canvas`)
 * expects the next two forms to reuse this unchanged rather than each hand-rolling the
 * `KeyboardAvoidingView` / `ScrollView` / footer shape again.
 *
 * OWNERSHIP OF THE KEYBOARD AVOIDER (decision 13) — exactly one `KeyboardAvoidingView` per
 * presentation. A pushed screen owns its own avoider: `avoidsKeyboard` defaults `true`, and this
 * frame supplies it. A sheet is already inside its host's own avoider (`CreateFoodSheet`, this same
 * issue) — nested a second one inside fights the first over how much to lift, so a sheet passes
 * `avoidsKeyboard={false}` and this frame renders a plain `View` in its place.
 *
 * `behavior: 'padding'` ON BOTH PLATFORMS. Expo SDK 57 is edge-to-edge on Android as well as iOS,
 * so the historical Android convention (no `behavior`, letting the OS resize the window) no longer
 * applies — `padding` is what actually lifts the footer clear of the keyboard on both.
 *
 * THE FOOTER NEVER COLLAPSES (decision 13): `footer` renders exactly as the caller builds it — this
 * frame never decides which of its rows show. `FoodForm`'s own footer keeps its preview strip and
 * action row present with the keyboard up either way; only its keyboard-down-only history note is
 * the caller's own branch.
 *
 * THE DIVIDER (spec section 6): shown while the body can scroll and has not been scrolled to its
 * end, hidden the instant it fits or reaches the bottom — recomputed on every `onScroll`,
 * `onContentSizeChange` and body `onLayout`. Fades over `motion.events.footerDividerFade` (120ms,
 * opacity-only; unchanged under reduce motion — the token's own `reduced.kind: 'same'`), the same
 * mount-guarded `useEffect`-keyed-`withTiming` shape `<FoodForm>`'s own `CustomReveal` and every
 * other `motion.events.*` consumer in this codebase already uses.
 *
 * THE GUTTER (spec section 5): this frame owns the side gutter — `layout.gutter` — on both the body
 * and the footer. A host screen must not add its own `paddingHorizontal` around a `<FormFrame>`.
 *
 * TESTING (spec section 5's own instruction): `useSafeAreaInsets()` throws with no ancestor
 * provider — a test wraps in a real `<SafeAreaProvider initialMetrics={…}>`, never a mocked module,
 * so the footer's bottom-padding math runs against a real (if fixed) inset.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { formFooterPaddingBottom, layout, motion, type Theme } from '../../theme/tokens';

export type FormFrameProps = {
  readonly theme: Theme;
  /** The footer's own background — a sheet's ground vs. a screen's canvas, `FoodForm`'s own two
   * `foodForm.footerBg`/`footerBgScreen` tokens being the first example. */
  readonly footerBg: string;
  /** `true` (default): this frame owns a `KeyboardAvoidingView`. `false`: the host already has one
   * (a sheet) — see the module note above. */
  readonly avoidsKeyboard?: boolean;
  /** Extra `keyboardVerticalOffset` for the avoider — a pushed screen under a header that sits
   * outside this frame. Ignored when `avoidsKeyboard` is `false`. */
  readonly headerOffset?: number;
  readonly footer: ReactNode;
  readonly children: ReactNode;
  readonly testID?: string;
};

export function FormFrame({
  theme,
  footerBg,
  avoidsKeyboard = true,
  headerOffset = 0,
  footer,
  children,
  testID = 'form-frame',
}: FormFrameProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const reducedMotion = useReducedMotion();

  const layoutHeight = useRef(0);
  const contentHeight = useRef(0);
  const offsetY = useRef(0);
  const [canScroll, setCanScroll] = useState(false);
  const mountedRef = useRef(false);

  const recompute = (): void => {
    // A pixel or two of float slop is normal at rest — without the `-1`, the divider can flicker at
    // the exact bottom of a long form on some devices.
    const atEnd = offsetY.current + layoutHeight.current >= contentHeight.current - 1;
    const scrollable = contentHeight.current > layoutHeight.current + 1;
    setCanScroll(scrollable && !atEnd);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    offsetY.current = e.nativeEvent.contentOffset.y;
    recompute();
  };

  const handleContentSizeChange = (_width: number, height: number): void => {
    contentHeight.current = height;
    recompute();
  };

  const handleBodyLayout = (e: LayoutChangeEvent): void => {
    layoutHeight.current = e.nativeEvent.layout.height;
    recompute();
  };

  const dividerEvent = motion.events.footerDividerFade;
  const duration = reducedMotion ? dividerEvent.reduced.duration : dividerEvent.duration;
  const curve = motion.easing[dividerEvent.easing];
  const opacity = useSharedValue(canScroll ? 1 : 0);

  useEffect(() => {
    // First run only: land directly on whatever `canScroll` starts as — a form long enough to need
    // the divider on mount should not fade it in from nothing.
    if (!mountedRef.current) {
      mountedRef.current = true;
      opacity.value = canScroll ? 1 : 0;
      return;
    }
    opacity.value = withTiming(canScroll ? 1 : 0, { duration, easing: Easing.bezier(...curve) });
  }, [canScroll, duration, curve, opacity]);

  const dividerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const frame = (
    <View testID={`${testID}-frame`} style={styles.frame}>
      <ScrollView
        testID={`${testID}-body`}
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingHorizontal: layout.gutter, paddingBottom: layout.formBodyPadBottom }]}
        // `handled`: with a field's keyboard up, a tap on a chip, a stepper or Save must land on
        // the first try — the default (`'never'`) spends that tap dismissing the keyboard.
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleBodyLayout}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
      <Animated.View
        testID={`${testID}-footer-divider`}
        style={[styles.divider, { backgroundColor: theme.color.line.hairline }, dividerStyle]}
        pointerEvents="none"
      />
      <View
        testID={`${testID}-footer`}
        style={[
          styles.footer,
          {
            backgroundColor: footerBg,
            paddingHorizontal: layout.gutter,
            paddingTop: layout.formFooterPadTop,
            paddingBottom: formFooterPaddingBottom(keyboardVisible, insets.bottom),
            gap: layout.formFooterRowGap,
          },
        ]}
      >
        {footer}
      </View>
    </View>
  );

  if (!avoidsKeyboard) return frame;

  return (
    <KeyboardAvoidingView testID={`${testID}-avoider`} style={styles.avoider} behavior="padding" keyboardVerticalOffset={headerOffset}>
      {frame}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  avoider: {
    flex: 1,
  },
  frame: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyContent: {
    flexGrow: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  footer: {
    flexShrink: 0,
  },
});
