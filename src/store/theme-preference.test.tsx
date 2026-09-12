/**
 * `.test.tsx`, not `.test.ts`: jest.config.js's "data" project doesn't match `src/store/**`, and
 * "components" only picks up `src/**\/*.test.tsx` (see the same note on `format/weight.test.tsx`).
 */
import { useThemePreferenceStore } from './theme-preference';

describe('useThemePreferenceStore', () => {
  afterEach(() => {
    useThemePreferenceStore.setState({ preference: 'auto' });
  });

  it('defaults to "auto" — follow the system until Settings says otherwise', () => {
    expect(useThemePreferenceStore.getState().preference).toBe('auto');
  });

  it('setPreference updates the stored preference', () => {
    useThemePreferenceStore.getState().setPreference('light');
    expect(useThemePreferenceStore.getState().preference).toBe('light');
  });
});
