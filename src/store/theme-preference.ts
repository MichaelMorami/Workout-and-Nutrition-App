import { create } from 'zustand';
import type { ThemePreference } from '../theme/tokens';

interface ThemePreferenceState {
  /** The user's Settings -> Appearance -> Theme choice. Defaults to `auto` (follow the system)
   * until a future Settings screen writes to it. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

/**
 * Held in a store, not component state, so a future Settings screen can change it from anywhere
 * in the tree without threading a prop through every layout. `ThemeProvider` is the only reader.
 */
export const useThemePreferenceStore = create<ThemePreferenceState>((set) => ({
  preference: 'auto',
  setPreference: (preference) => set({ preference }),
}));
