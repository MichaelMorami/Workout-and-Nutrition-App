/**
 * `formatWeightKg` is the only seam a screen may render a weight through (CLAUDE.md, "units are
 * canonical"). Today it only appends the unit; a future lb switch changes this one function's body
 * instead of every call site.
 *
 * `.test.tsx`, not `.test.ts`: jest.config.js's "data" project only matches `src/{db,sync,lib}`,
 * and "components" only matches `src/**\/*.test.tsx` — a `.ts` test under `src/components` would
 * silently match neither project and never run (see PR #31's hand-off on `tokens.test.tsx`).
 */
import { formatWeightKg } from './weight';

describe('formatWeightKg', () => {
  it('appends " kg" to a whole number', () => {
    expect(formatWeightKg(83)).toBe('83 kg');
  });

  it('appends " kg" to a decimal value, unrounded', () => {
    expect(formatWeightKg(83.4)).toBe('83.4 kg');
  });

  it('formats zero', () => {
    expect(formatWeightKg(0)).toBe('0 kg');
  });
});
