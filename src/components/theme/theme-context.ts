import { createContext } from 'react';
import type { Theme } from '../../theme/tokens';

/** `null` outside a `ThemeProvider` — `useTheme` (src/hooks) turns that into a thrown error rather
 * than a silent default, because a screen with no theme is a bug. */
export const ThemeContext = createContext<Theme | null>(null);
