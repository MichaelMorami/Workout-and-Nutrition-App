/**
 * Issue #204 — the one assertion that ties the two declarations of the serving-preset key set
 * together.
 *
 * The closed set of preset keys is declared twice, deliberately (`src/db/servings.ts:18-30`):
 * `src/theme/tokens.ts`'s `servingPresetKeys` and `src/db/servings.ts`'s `SERVING_PRESETS`.
 * `src/theme` is a dependency-free leaf and may not import the data layer — collapsing the two
 * would drag SQLite into the token file — so the lists sit side by side rather than one importing
 * the other. That ruling stands; this file does not touch it.
 *
 * But each side's own suite only pins its own literal against itself:
 * `src/theme/tokens.test.tsx:399` checks `servingPresetKeys` against a hard-coded array, and
 * `src/db/serving-presets.test.ts:23` checks `SERVING_PRESETS`'s keys against the *same* literal,
 * independently. Neither imports the other, so the ordinary way to add a preset — edit one file
 * and its own test's literal — leaves the other side's list untouched and every existing suite
 * green, with the two definitions silently out of step.
 *
 * `src/db/servings.ts`'s suite runs in plain Node and cannot import `src/theme` (and should not,
 * for the same leaf-purity reason); `src/theme`'s suite has no reason to import the data layer
 * either. Neither owning suite can hold this guard without breaking a boundary that is correct on
 * its own terms. This suite is qa-owned (`test/**`) and already has read access to both leaves, so
 * the parity check — and only the parity check — lives here instead.
 */
import { SERVING_PRESETS } from '../src/db';
import { servingPresetKeys } from '../src/theme/tokens';

describe('serving-preset key parity (issue #204)', () => {
  it('keeps src/db/servings.ts and src/theme/tokens.ts declaring the same keys, in the same order', () => {
    // Order matters as well as membership: chip order is table order, and `servingPresetKeys` is
    // read positionally by consumers on the theme side.
    expect(SERVING_PRESETS.map((p) => p.key)).toEqual([...servingPresetKeys]);
  });
});
