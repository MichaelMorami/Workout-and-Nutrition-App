/**
 * `resolvePresetKey` — issue #198's retirement of the derived, index-zipped `matchingPresetKey`
 * (and the `PRESET_BY_KEY` it was built from).
 *
 * A saved food still carries only its own `servingLabel`/`basis`/`servingAmount` — no stored key
 * (docs/decisions.md ruling 12) — so resolving which chip a food matches is still a value
 * comparison against the *current* preset table. What issue #185 changes is what a match reads off:
 * the preset's own `.key` field, not a second, independently-ordered array zipped against it by
 * position. That zip was the real bug: reordering or removing a preset silently slid every later
 * key onto the wrong preset — "a food saved as a cup came back as a tablespoon" (ruling 12) — even
 * though no food's own label, basis or amount ever changed. `resolvePresetKey` takes the table as a
 * parameter, exactly as `servingPresetIn` does, so this is provable without touching the real
 * `SERVING_PRESETS` export.
 */
import { SERVING_PRESETS, type ServingPreset } from '../db';
import { resolvePresetKey } from './serving-preset';

describe('resolvePresetKey', () => {
  it('matches a preset on basis, amount and label', () => {
    expect(resolvePresetKey('1 cup', 'volume', 250)).toBe('cup');
    expect(resolvePresetKey('100 g', 'weight', 100)).toBe('100g');
  });

  it('treats a blank label as a wildcard — the synthetic "nothing chosen yet" case', () => {
    expect(resolvePresetKey('', 'weight', 100)).toBe('100g');
  });

  it('misses when the label does not match — a custom serving is never silently promoted to a preset', () => {
    // PR #188 review, B1: "1 bottle" shares volume/250 with the cup preset but is not a cup — the
    // label check is what keeps a custom serving's own label from being overwritten on save.
    expect(resolvePresetKey('1 bottle', 'volume', 250)).toBeNull();
  });

  it('misses when nothing in the table matches basis + amount', () => {
    expect(resolvePresetKey('1 jug', 'volume', 1000)).toBeNull();
  });

  it('still resolves the right key when the table is reordered — no index is involved', () => {
    const reordered: readonly ServingPreset[] = [...SERVING_PRESETS].reverse();
    for (const preset of SERVING_PRESETS) {
      expect(resolvePresetKey(preset.label, preset.basis, preset.amount, reordered)).toBe(preset.key);
    }
  });

  it('still resolves an unrelated preset after another one is removed — the old index zip lost this', () => {
    // Ruling 12: "dropping one preset slid every later one up a place and a food saved as a cup
    // came back as a tablespoon." `resolvePresetKey` never zips by position, so removing '100ml'
    // leaves 'cup' resolving to 'cup', not 'tbsp'.
    const without100ml = SERVING_PRESETS.filter((p) => p.key !== '100ml');
    expect(resolvePresetKey('1 cup', 'volume', 250, without100ml)).toBe('cup');
    expect(resolvePresetKey('1 tbsp', 'volume', 15, without100ml)).toBe('tbsp');
  });

  it('resolves by key against a table with a preset corrected in place', () => {
    // A food created *after* the correction carries the corrected values and still resolves —
    // identity travels on `.key`, not on whichever label/amount happened to be current at save time.
    const corrected = SERVING_PRESETS.map((p) => (p.key === 'cup' ? { ...p, label: '1 mug', amount: 240 } : p));
    expect(resolvePresetKey('1 mug', 'volume', 240, corrected)).toBe('cup');
  });
});
