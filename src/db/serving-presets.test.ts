/**
 * Issue #185 — the stable `key` is a preset's identity, not its label.
 *
 * Before this, the only way to say "which preset is this?" was to match label + basis + amount
 * together (`src/components/serving-preset.ts`), or to zip the table against
 * `src/theme/tokens.ts`'s `servingPresetKeys` by array index. Both break on an edit to the
 * constant: renaming "1 cup" or correcting a cup to 240 ml loses every food that was saved with it,
 * and removing a preset shifts every index after it onto the wrong row. The key is what survives
 * both.
 *
 * These tests pin the identity contract, not the table's current contents — the table's contents
 * are pinned once, in `foods-basis.test.ts`'s "SERVING_PRESETS" block (ruling 5).
 */
import { SERVING_PRESET_KEYS, SERVING_PRESETS, servingPresetByKey, servingPresetIn, type ServingPreset } from './servings';

describe('serving preset keys', () => {
  it('gives every preset a key', () => {
    for (const preset of SERVING_PRESETS) expect(typeof preset.key).toBe('string');
    expect(SERVING_PRESETS.every((p) => p.key.length > 0)).toBe(true);
  });

  it('uses the keys the UI already chips on, in chip order', () => {
    // `src/theme/tokens.ts`'s `servingPresetKeys` — same strings, same order, so `interaction`
    // rules keyed on '100g'/'cup' keep resolving. Not imported here: `src/theme` is a leaf that
    // the data layer does not depend on, and this suite runs in plain Node.
    expect(SERVING_PRESETS.map((p) => p.key)).toEqual(['100g', '100ml', 'cup', 'tbsp', 'tsp']);
  });

  it('keeps the keys unique — a key names exactly one preset', () => {
    expect(new Set(SERVING_PRESETS.map((p) => p.key)).size).toBe(SERVING_PRESETS.length);
  });

  it('never uses "custom", which the form spends on a food\'s own serving', () => {
    expect(SERVING_PRESETS.map((p) => p.key)).not.toContain('custom');
  });

  it('exports the keys in table order', () => {
    expect(SERVING_PRESET_KEYS).toEqual(SERVING_PRESETS.map((p) => p.key));
  });
});

describe('servingPresetByKey', () => {
  it('resolves a key to its preset', () => {
    expect(servingPresetByKey('cup')).toEqual({ key: 'cup', label: '1 cup', basis: 'volume', amount: 250 });
    expect(servingPresetByKey('100g')).toMatchObject({ basis: 'weight', amount: 100 });
  });

  it('resolves every key in the table', () => {
    for (const preset of SERVING_PRESETS) expect(servingPresetByKey(preset.key)).toBe(preset);
  });

  it('misses on an unknown key, and returns rather than throws', () => {
    expect(servingPresetByKey('quart')).toBeUndefined();
    expect(servingPresetByKey('')).toBeUndefined();
  });

  it('misses on a label — the label is not the identity', () => {
    // The old matcher took '1 cup'; this one takes 'cup'. A label handed to the lookup is a bug at
    // the call site, and must not quietly resolve to the preset it names.
    expect(servingPresetByKey('1 cup')).toBeUndefined();
    expect(servingPresetByKey('100 g')).toBeUndefined();
  });

  it('is not case- or space-insensitive: only the exact key hits', () => {
    expect(servingPresetByKey('Cup')).toBeUndefined();
    expect(servingPresetByKey(' cup')).toBeUndefined();
    expect(servingPresetByKey('100 ml')).toBeUndefined();
  });
});

describe('servingPresetIn — the identity survives an edit to the table', () => {
  const cup = (over: Partial<ServingPreset> = {}): ServingPreset => ({
    key: 'cup',
    label: '1 cup',
    basis: 'volume',
    amount: 250,
    ...over,
  });

  it('still resolves a preset whose label changed', () => {
    const renamed = [cup({ label: '1 mug' })];
    expect(servingPresetIn(renamed, 'cup')).toMatchObject({ label: '1 mug', amount: 250 });
  });

  it('still resolves a preset whose amount was corrected', () => {
    const corrected = [cup({ amount: 240 })];
    expect(servingPresetIn(corrected, 'cup')).toMatchObject({ label: '1 cup', amount: 240 });
  });

  it('still resolves a preset whose basis changed', () => {
    const rebased = [cup({ basis: 'weight', amount: 128 })];
    expect(servingPresetIn(rebased, 'cup')).toMatchObject({ basis: 'weight', amount: 128 });
  });

  it('misses a removed preset instead of resolving the row that took its place', () => {
    // The index zip's failure mode: drop '100ml' and every later key slides up one, so a food
    // saved as a cup comes back as a tablespoon. By key, the removed preset is simply a miss —
    // the caller falls back to the food's own Custom serving — and its neighbours are untouched.
    const without100ml = SERVING_PRESETS.filter((p) => p.key !== '100ml');
    expect(servingPresetIn(without100ml, '100ml')).toBeUndefined();
    expect(servingPresetIn(without100ml, 'cup')).toMatchObject({ label: '1 cup', amount: 250 });
    expect(servingPresetIn(without100ml, 'tsp')).toMatchObject({ label: '1 tsp', amount: 5 });
  });

  it('misses every key in an empty table', () => {
    expect(servingPresetIn([], 'cup')).toBeUndefined();
  });

  it('resolves against a table that is not the module constant (a future US table)', () => {
    const us: readonly ServingPreset[] = [{ key: 'cup', label: '1 cup', basis: 'volume', amount: 236.588 }];
    expect(servingPresetIn(us, 'cup')).toMatchObject({ amount: 236.588 });
    expect(servingPresetByKey('cup')).toMatchObject({ amount: 250 });
  });

  it('returns the first match when a table repeats a key, and never throws', () => {
    const dupes: readonly ServingPreset[] = [cup(), cup({ label: '1 mug' })];
    expect(servingPresetIn(dupes, 'cup')).toMatchObject({ label: '1 cup' });
  });
});
