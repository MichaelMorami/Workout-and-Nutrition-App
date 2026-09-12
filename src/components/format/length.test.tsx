/**
 * `formatLengthCm` is the only seam a screen may render a length through (CLAUDE.md, "units are
 * canonical"). Today it only appends the unit; a future inch switch changes this one function's
 * body instead of every call site.
 *
 * `.test.tsx`, not `.test.ts`: jest.config.js's "data" project only matches `src/{db,sync,lib}`,
 * and "components" only matches `src/**\/*.test.tsx` — a `.ts` test under `src/components` would
 * silently match neither project and never run (see PR #31's hand-off on `tokens.test.tsx`).
 */
import { formatLengthCm } from './length';

describe('formatLengthCm', () => {
  it('appends " cm" to a whole number', () => {
    expect(formatLengthCm(180)).toBe('180 cm');
  });

  it('appends " cm" to a decimal value, unrounded', () => {
    expect(formatLengthCm(179.5)).toBe('179.5 cm');
  });

  it('formats zero', () => {
    expect(formatLengthCm(0)).toBe('0 cm');
  });
});
