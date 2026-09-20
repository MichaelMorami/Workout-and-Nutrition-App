/**
 * `formatGrams` / `formatMl` are the only seam a screen may render a food amount through (CLAUDE.md,
 * "units are canonical"; issue #124). Food is stored in grams (weight) or millilitres (volume) —
 * these round and localise a raw number the way every call site already did by hand, so the hand-built
 * `` `${n} g` ``/`` `${n} ml` `` string this issue found (`FoodForm.tsx`, `FoodList.tsx`,
 * `PortionSheet.tsx`) has exactly one place to change if the unit ever does.
 *
 * `.test.tsx`, not `.test.ts`: see `weight.test.tsx`'s note — a `.ts` test under `src/components`
 * matches neither jest project and silently never runs.
 */
import { formatGrams, formatMl, formatPreviewProtein } from './food';

describe('formatGrams', () => {
  it('rounds to the nearest whole gram and appends " g"', () => {
    expect(formatGrams(99.6)).toBe('100 g');
  });

  it('formats a whole number', () => {
    expect(formatGrams(170)).toBe('170 g');
  });

  it('formats zero', () => {
    expect(formatGrams(0)).toBe('0 g');
  });

  it('localises thousands separators when a locale is given', () => {
    expect(formatGrams(1234, 'en-US')).toBe('1,234 g');
  });
});

describe('formatMl', () => {
  it('rounds to the nearest whole millilitre and appends " ml"', () => {
    expect(formatMl(99.6)).toBe('100 ml');
  });

  it('formats a whole number', () => {
    expect(formatMl(250)).toBe('250 ml');
  });

  it('formats zero', () => {
    expect(formatMl(0)).toBe('0 ml');
  });

  it('localises thousands separators when a locale is given', () => {
    expect(formatMl(1234, 'en-US')).toBe('1,234 ml');
  });
});

describe('formatPreviewProtein', () => {
  // issue #89's live preview strip: "one decimal under 10 g, whole above, trailing .0 dropped" —
  // grams below the tens threshold read close enough to matter (2.5 g vs 3 g protein is a real
  // difference at breakfast); at and above it, a decimal adds noise without adding accuracy.
  it('rounds to one decimal place under 10 g', () => {
    expect(formatPreviewProtein(2.53)).toBe('2.5');
  });

  it('drops a trailing .0 under 10 g', () => {
    expect(formatPreviewProtein(9)).toBe('9');
  });

  it('rounds to a whole number at 10 g and above', () => {
    expect(formatPreviewProtein(24.6)).toBe('25');
  });

  it('rounds to a whole number exactly at the 10 g threshold', () => {
    expect(formatPreviewProtein(10.4)).toBe('10');
  });

  it('formats zero', () => {
    expect(formatPreviewProtein(0)).toBe('0');
  });

  it('localises thousands separators when a locale is given', () => {
    expect(formatPreviewProtein(1234, 'en-US')).toBe('1,234');
  });
});
