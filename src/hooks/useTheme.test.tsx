/**
 * `useTheme` is the only way a screen reads the resolved theme. Outside a `ThemeProvider` it
 * throws rather than silently falling back — a screen with no theme is a bug, not a default.
 */
import { render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { ThemeProvider } from '../components/theme/ThemeProvider';
import { useTheme } from './useTheme';

function Consumer(): React.JSX.Element {
  const theme = useTheme();
  return <Text>{theme.name}</Text>;
}

describe('useTheme', () => {
  it('throws when used outside a ThemeProvider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Consumer />)).rejects.toThrow(/ThemeProvider/);
    spy.mockRestore();
  });

  it('returns the theme provided by ThemeProvider', async () => {
    const view = await render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(view.getByText(/dark|light/)).toBeTruthy();
  });
});
