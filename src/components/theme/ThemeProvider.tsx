import React, { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { resolveThemeName, themes } from '../../theme/tokens';
import { useThemePreferenceStore } from '../../store/theme-preference';
import { ThemeContext } from './theme-context';

/**
 * Resolves `themes[resolveThemeName(preference, useColorScheme())]` once per render and makes it
 * available to every screen via `useTheme` (src/hooks/useTheme.ts). Wraps the whole app in
 * `app/_layout.tsx`, above the router, so no screen renders without a theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const system = useColorScheme();
  const preference = useThemePreferenceStore((state) => state.preference);
  const theme = useMemo(() => themes[resolveThemeName(preference, system)], [preference, system]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
