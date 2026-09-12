import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import type { Haptic } from '../theme/tokens';

const IMPACT: Record<string, Haptics.ImpactFeedbackStyle> = {
  impactLight: Haptics.ImpactFeedbackStyle.Light,
  impactMedium: Haptics.ImpactFeedbackStyle.Medium,
  impactHeavy: Haptics.ImpactFeedbackStyle.Heavy,
};

const NOTIFICATION: Record<string, Haptics.NotificationFeedbackType> = {
  notificationSuccess: Haptics.NotificationFeedbackType.Success,
  notificationWarning: Haptics.NotificationFeedbackType.Warning,
  notificationError: Haptics.NotificationFeedbackType.Error,
};

/**
 * Fires a `haptics.*` token (`src/theme/tokens.ts`) through `expo-haptics`. Reads the token's `ios`
 * field — those names already line up with `Haptics.ImpactFeedbackStyle`, `NotificationFeedbackType`
 * or a plain selection tick.
 *
 * The token's `android` field names a native `VibrationEffect` constant (e.g. `EFFECT_HEAVY_CLICK`)
 * that has no `expo-haptics` equivalent — wiring the exact effect needs a native haptics module,
 * which is a new dependency to raise on its own issue (`CLAUDE.md`). Until then this still fires
 * `expo-haptics`'s own cross-platform implementation on Android rather than doing nothing.
 */
function resolve(haptic: Haptic): () => Promise<void> {
  if (haptic.ios === 'selection') return Haptics.selectionAsync;
  const notification = NOTIFICATION[haptic.ios];
  if (notification) return () => Haptics.notificationAsync(notification);
  const impact = IMPACT[haptic.ios] ?? Haptics.ImpactFeedbackStyle.Medium;
  return () => Haptics.impactAsync(impact);
}

/**
 * Returns a stable function that fires a haptic and swallows any failure — haptics can throw on a
 * simulator or a device with no haptics engine, and a missed buzz is never worth crashing a food
 * log over. Never awaited by a caller: the tap it confirms must never wait on it.
 */
export function useHapticFeedback(): (haptic: Haptic) => void {
  return useCallback((haptic: Haptic) => {
    try {
      void Promise.resolve(resolve(haptic)()).catch(() => {});
    } catch {
      // Same reasoning: a haptics failure is never user-visible.
    }
  }, []);
}
