/**
 * `<UndoToast>` — the safety net for issue #21's three logging paths. There is no save button
 * anywhere in the quick-add flow (the tap doctrine: haptic confirms, undo reverses), so this is the
 * only way a fumbled double-tap, a mis-tapped tile, or a wrong portion sheet step ever gets fixed.
 *
 * A SIBLING, NOT A CHILD OF `<QuickAddGrid>`. It reads `useUndoToastStore` directly rather than
 * taking the payload as a prop, because it has to float above the tab bar clear of the grid's own
 * `ScrollView` (`docs/decisions.md`) — the Today screen mounts it once, outside that scroll, and
 * every logging path (a tap, a double-tap, the portion sheet's Log) reaches it through the same
 * store instead of threading a callback through three call sites.
 *
 * UNDO IS A REAL REVERSAL, NOT A DISMISS. Tapping Undo calls `undo(db, { token })`
 * (`src/db/queries/nutrition.ts`) — which tombstones or reverts exactly the rows the write touched
 * and recomputes the candidate's `use_count`/`hour_histogram` in the same transaction — then
 * `forgetLog(candidateKey)` so the next tap on that tile logs fresh instead of trying `addPortion`
 * on a row `undo()` just tombstoned (`logTracker.ts`'s own doc comment). `onUndo` hands the toast's
 * `delta` back up so a caller keeping a running total (the Today rings) can subtract exactly what
 * undo just reversed, the same way `onLogged`/`onPortionAdded` hand up what a write just added.
 *
 * NOT EVERY REVERSAL IS A TOKEN. `UndoToastPayload.action`, when a caller sets it (issue #100's
 * food-list delete: an archive/un-archive pair, not a logged row), replaces the `undo(db, {token})`
 * call outright — see `undoToast.ts`'s own doc comment for why `token`/`candidateKey`/`delta` are
 * therefore optional. `verb` swaps the accessibility label's "Undo **logging** X" for whatever the
 * action actually reverses ("Undo **deleting** X").
 *
 * STAYS MOUNTED THROUGH ITS OWN EXIT. The store's `toast` field is either a payload or `null` —
 * there is no third "leaving" state — so this component keeps the last payload in local state
 * until `toastOut` finishes, the same hold-then-clear shape `QuickAddTile` uses for its own
 * "Logged" wash, rather than vanishing mid-animation the instant `dismiss()` fires.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { undo, VitalsDbError } from '../../db';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useDb } from '../../hooks/useDb';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { useTheme } from '../../hooks/useTheme';
import { forgetLog } from '../../store/logTracker';
import { useUndoToastStore, type LogDelta, type UndoToastPayload } from '../../store/undoToast';
import { haptics, layout, motion, radius, size, space, type, type TypeStyle } from '../../theme/tokens';

export type UndoToastProps = {
  /** Called after a successful undo with the delta the reversed write had added — the caller's cue
   * to subtract it from a running total (Today's rings). Never called if the write had already
   * failed (there is nothing to subtract) or if the toast has already auto-dismissed
   * (`interaction.undoAutoDismissMs` ran out). */
  readonly onUndo?: (delta: LogDelta) => void;
  readonly testID?: string;
};

function textStyle(token: TypeStyle, color: string): TextStyle {
  return {
    fontFamily: token.fontFamily,
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    textTransform: token.textTransform,
    color,
  };
}

export function UndoToast({ onUndo, testID = 'undo-toast' }: UndoToastProps) {
  const db = useDb();
  const theme = useTheme();
  const fireHaptic = useHapticFeedback();
  const reducedMotion = useReducedMotion();
  const toast = useUndoToastStore((state) => state.toast);
  const dismiss = useUndoToastStore((state) => state.dismiss);
  const shown = toast !== null;

  // Kept alive through its own exit animation — see the module note above.
  const [rendered, setRendered] = useState<UndoToastPayload | null>(toast);
  const removalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new (or replacing) payload is adopted the instant it arrives — derived state computed
  // during render, the same escape hatch `PortionSheet.tsx` already uses to reset its mode on a
  // new candidate, not a `setState` called from inside an effect body.
  if (toast && rendered !== toast) {
    setRendered(toast);
  }

  useEffect(() => {
    if (toast) {
      // A fresh or replacing payload arrived before the previous one finished fading — cancel
      // that exit, it is showing again.
      if (removalTimer.current) {
        clearTimeout(removalTimer.current);
        removalTimer.current = null;
      }
      return;
    }
    if (!rendered) return;
    const event = motion.events.toastOut;
    const duration = reducedMotion ? event.reduced.duration : event.duration;
    removalTimer.current = setTimeout(() => setRendered(null), duration);
    return () => {
      if (removalTimer.current) clearTimeout(removalTimer.current);
    };
  }, [toast, rendered, reducedMotion]);

  const opacity = useSharedValue(0);
  // `motion.events.toastIn`'s own doc comment: "rising 16 pt" — `space[6]` is exactly that step on
  // the spacing scale, not a value borrowed from an unrelated component's token.
  const translateY = useSharedValue<number>(space[6]);

  useEffect(() => {
    const event = shown ? motion.events.toastIn : motion.events.toastOut;
    const duration = reducedMotion ? event.reduced.duration : event.duration;
    const curve = motion.easing[event.easing];
    opacity.value = withTiming(shown ? 1 : 0, { duration, easing: Easing.bezier(...curve) });
    // `reduced.kind: 'fade'` (tokens.ts) — reduce motion drops the slide, opacity carries the whole
    // transition on its own.
    translateY.value = reducedMotion ? 0 : withTiming(shown ? 0 : space[6], { duration, easing: Easing.bezier(...curve) });
  }, [shown, reducedMotion, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }));

  if (!rendered) return null;

  const handleUndo = (): void => {
    // Mid fade-out (auto-dismiss firing, another log, a sheet opening) the store has already moved on —
    // a tap landing during that beat must not resurrect or double-reverse a log.
    if (!shown) return;
    const payload = rendered;
    try {
      // `action` (issue #100's food-archive delete, or any future non-token reversal) stands in
      // for `undo(db, { token })` entirely — the two are mutually exclusive per payload.
      if (payload.action) {
        payload.action();
      } else if (payload.token) {
        undo(db, { at: deviceWhen().at, token: payload.token });
      }
    } catch (err) {
      // Same doctrine as every write in `QuickAddGrid`: no dialog, no crash for a failed undo.
      if (!(err instanceof VitalsDbError)) throw err;
      return;
    }
    if (payload.candidateKey) forgetLog(payload.candidateKey);
    fireHaptic(haptics.undo);
    dismiss();
    if (payload.delta) onUndo?.(payload.delta);
  };

  const { toast: toastColor } = theme.color;

  return (
    <Animated.View
      testID={testID}
      accessible
      accessibilityLiveRegion="polite"
      pointerEvents={shown ? 'box-none' : 'none'}
      style={[
        styles.root,
        animatedStyle,
        {
          bottom: size.tabBar.height + layout.floatAboveTabBar,
          left: layout.gutterToday,
          right: layout.gutterToday,
          height: size.toast.height,
          borderRadius: radius.xl,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: toastColor.border,
          backgroundColor: toastColor.bg,
          boxShadow: theme.shadow.floating,
        },
      ]}
    >
      <View style={styles.body}>
        <Text testID={`${testID}-check`} style={{ color: toastColor.checkIcon, fontSize: size.icon.md }}>
          {'✓'}
        </Text>
        <View style={styles.textCol}>
          <Text testID={`${testID}-title`} numberOfLines={1} style={textStyle(type.body, toastColor.titleText)}>
            {rendered.title}
          </Text>
          <Text testID={`${testID}-meta`} numberOfLines={1} style={textStyle(type.label, toastColor.metaText)}>
            {rendered.meta}
          </Text>
        </View>
      </View>

      <Pressable
        testID={`${testID}-undo`}
        onPress={handleUndo}
        disabled={!shown}
        accessibilityRole="button"
        accessibilityLabel={`Undo ${rendered.verb ?? 'logging'} ${rendered.title}`}
        style={({ pressed }) => [
          styles.undoButton,
          {
            minWidth: size.toast.undoMinWidth,
            minHeight: size.toast.undoHit,
            borderRadius: radius.md,
            backgroundColor: pressed ? toastColor.undoBgPress : toastColor.undoBg,
          },
        ]}
      >
        <Text style={textStyle(type.button, toastColor.undoText)}>Undo</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[5],
    gap: space[3],
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  textCol: {
    flexShrink: 1,
  },
  undoButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[4],
  },
});
