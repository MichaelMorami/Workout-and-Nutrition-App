/**
 * The theme reaches every screen through one provider: `themes[resolveThemeName(preference,
 * useColorScheme())]`, per the tech-lead hand-off on #20. `useColorScheme` is mocked so a test
 * controls the system scheme without a real device.
 */
import { render } from '@testing-library/react-native';
import React from 'react';
import { Text, useColorScheme } from 'react-native';
import { themes } from '../../theme/tokens';
import { useThemePreferenceStore } from '../../store/theme-preference';
import { useTheme } from '../../hooks/useTheme';
import { ThemeProvider } from './ThemeProvider';

jest.mock('react-native/Libraries/Utilities/useColorScheme');
const mockUseColorScheme = jest.mocked(useColorScheme);

function Consumer(): React.JSX.Element {
  const theme = useTheme();
  return <Text>{theme.name}</Text>;
}

describe('ThemeProvider', () => {
  // Reset *before* each test, not after: an `afterEach` reset would fire while the previous
  // test's tree is still mounted (RTL's own cleanup runs after this describe's hooks), updating
  // a live subscriber outside `act` and leaving the next render in an inconsistent state.
  beforeEach(() => {
    useThemePreferenceStore.setState({ preference: 'auto' });
  });

  it('renders its children', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    const view = await render(
      <ThemeProvider>
        <Text>hello</Text>
      </ThemeProvider>,
    );
    expect(view.getByText('hello')).toBeTruthy();
  });

  it('resolves the dark theme when the preference is "auto" and the system is dark', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    const view = await render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(view.getByText(themes.dark.name)).toBeTruthy();
  });

  it('resolves the light theme when the preference is "auto" and the system is light', async () => {
    mockUseColorScheme.mockReturnValue('light');
    const view = await render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(view.getByText(themes.light.name)).toBeTruthy();
  });

  it('an explicit preference overrides the system scheme', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    useThemePreferenceStore.setState({ preference: 'light' });
    const view = await render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(view.getByText(themes.light.name)).toBeTruthy();
  });
});
