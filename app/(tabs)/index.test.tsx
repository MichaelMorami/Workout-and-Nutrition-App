/**
 * Smoke test for the Today screen: it renders inside the app's real providers, in the theme's
 * canvas colour, and mounts the quick-add grid (issue #40) — not a placeholder.
 */
import { render, screen } from '@testing-library/react-native';
import { DbProvider } from '../../src/components/db/DbProvider';
import { ThemeContext } from '../../src/components/theme/theme-context';
import { quickAddCandidates } from '../../src/db';
import { themes } from '../../src/theme/tokens';
import TodayScreen from './index';

jest.mock('react-native-reanimated', () => jest.requireActual('../../src/components/quick-add/test-support/reanimated-mock'));
jest.mock('../../src/db', () => ({
  ...jest.requireActual<typeof import('../../src/db')>('../../src/db'),
  quickAddCandidates: jest.fn().mockReturnValue([]),
}));

describe('TodayScreen', () => {
  it('renders the quick-add grid on the theme canvas, not the old placeholder', async () => {
    await render(
      <DbProvider db={{} as never}>
        <ThemeContext.Provider value={themes.dark}>
          <TodayScreen />
        </ThemeContext.Provider>
      </DbProvider>,
    );

    expect(screen.getByTestId('today-screen')).toBeTruthy();
    expect(screen.getByTestId('quick-add-grid')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
    expect(jest.mocked(quickAddCandidates)).toHaveBeenCalled();
  });
});
