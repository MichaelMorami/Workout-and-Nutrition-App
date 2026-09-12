/**
 * The theme reaches every screen through one provider: `themes[resolveThemeName(preference,
 * useColorScheme())]`, per the tech-lead hand-off on #20. `useColorScheme` is mocked so a test
 * controls the system scheme without a real device.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { themes } from '../../theme/tokens';
import { useThemePreferenceStore } from '../../store/theme-preference';
import { useTheme } from '../../hooks/useTheme';
import { ThemeProvider } from './ThemeProvider';

jest.mock('react-native/Libraries/Utilities/useColorScheme');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockUseColorScheme = require('react-native/Libraries/Utilities/useColorScheme').default as jest.Mock;

function Consumer(): React.JSX.Element {
  const theme = useTheme();
  return <Text>{theme.name}</Text>;
}

describe('ThemeProvider', () => {
  afterEach(() => {
    useThemePreferenceStore.setState({ preference: 'auto' });
  });

  it('renders its children', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    await render(
      <ThemeProvider>
        <Text>hello</Text>
      </ThemeProvider>,
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('resolves the dark theme when the preference is "auto" and the system is dark', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    await render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByText(themes.dark.name)).toBeTruthy();
  });

  it('resolves the light theme when the preference is "auto" and the system is light', async () => {
    mockUseColorScheme.mockReturnValue('light');
    await render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByText(themes.light.name)).toBeTruthy();
  });

  it('an explicit preference overrides the system scheme', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    useThemePreferenceStore.getState().setPreference('light');
    await render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByText(themes.light.name)).toBeTruthy();
  });
});
