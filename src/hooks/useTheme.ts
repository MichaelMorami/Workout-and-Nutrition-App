import { useContext } from 'react';
import { ThemeContext } from '../components/theme/theme-context';
import type { Theme } from '../theme/tokens';

/** The single way any screen reads the resolved theme. Throws outside a `ThemeProvider` instead of
 * falling back to a default — a screen rendered with no theme is a bug to fix, not a look to ship. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return theme;
}
