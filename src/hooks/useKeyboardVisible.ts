import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// iOS fires the `Will` pair ahead of the keyboard's own animation — the frame a form's footer
// needs to repaint on, rather than a beat behind the keyboard that has already moved. Android has
// no `Will` pair at all (`Keyboard.addListener('keyboardWillShow', …)` silently never fires there),
// so `Did` is the only signal available on that platform.
const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/**
 * Whether the on-screen keyboard is currently up. Issue #207's pinned form footer is the first
 * consumer: `formFooterPaddingBottom(keyboardVisible, insets.bottom)` (`src/theme/tokens.ts`) and a
 * footer's keyboard-down-only note row both need this signal, and every subsequent form reuses the
 * same footer shape (`<FormFrame>`, `src/components/form/FormFrame.tsx`) — so this lives in
 * `src/hooks` rather than inside any one form.
 *
 * Deliberately not the footer's own travel: the footer's lift rides `KeyboardAvoidingView`'s own
 * animation, driven straight by the OS (decision 13, `docs/decisions.md`) — this hook only reports
 * the boolean state a form's *layout* (padding, which rows show) branches on, never a height or a
 * duration to animate against.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(SHOW_EVENT, () => setVisible(true));
    const hideSubscription = Keyboard.addListener(HIDE_EVENT, () => setVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return visible;
}
