/**
 * Which preset a serving matches — shared by `<FoodForm>` (pre-selecting an edited food's chip) and
 * `<PortionSheet>` (issue #93: picking which per-preset step strip a candidate gets). One place, so
 * the label/basis/amount matching rule — and its one deliberate exception, below — is never
 * duplicated or drifts between the two call sites the way PR #188's review caught it starting to.
 *
 * Issue #185 put a stable `key` on every preset in `src/db/servings.ts`; issue #198 is this file's
 * half of consuming it. A saved food still carries only its own `servingLabel`/`basis`/
 * `servingAmount` — no stored key (docs/decisions.md ruling 12) — so resolving which chip a food
 * matches is still a value comparison against the *current* table. What changes is what a match
 * reads off: the preset's own `.key` field, not a second array (`servingPresetKeys` in
 * `src/theme/tokens.ts`) zipped against the table by position (the old `PRESET_BY_KEY`/
 * `matchingPresetKey`, retired here). That zip broke the moment the table was reordered or a preset
 * was removed — "a food saved as a cup came back as a tablespoon" (ruling 12) — even though no
 * food's own label, basis or amount had changed. `resolvePresetKey` takes the table as an optional
 * parameter, exactly as `servingPresetIn` does, so that robustness is directly testable.
 */
import { SERVING_PRESETS, type FoodBasis, type ServingPreset, type ServingPresetKey } from '../db';

/** Finds the preset whose label + basis + amount all match a food exactly, and returns its `key` —
 * issue #89's unblock comment, carry-over #2, now answered by issue #185's stable key instead of a
 * derived index. The label matters as much as the numbers: "1 bottle"/volume/250 and "1 cup"/
 * volume/250 share a preset's basis+amount but are not the same serving, and a basis+amount-only
 * match silently renamed the former to the latter on save (PR #188 review, B1) — a real data-loss
 * bug on the edit path. Matching all three means a food whose amount happens to land on a preset
 * but whose label does not falls to Custom instead, with its own label preserved rather than
 * overwritten.
 *
 * `label === ''` is the one exception, and it is not a real food: `catalog.ts`'s own `createFood`
 * throws on a blank `servingLabel` (`invalid_input`), so no row ever reaches this form with one — a
 * blank label only ever means `CreateFoodSheet`'s synthetic "nothing chosen yet" `initial`, which
 * wants the 100 g preset's own label, not Custom. Basis+amount alone still resolves that case.
 *
 * `table` defaults to the live `SERVING_PRESETS`, and takes any table for the same reason
 * `servingPresetIn` does: a future US-units table, and a test that proves this never assumes a
 * preset's position. */
export function resolvePresetKey(
  label: string,
  basis: FoodBasis,
  amount: number,
  table: readonly ServingPreset[] = SERVING_PRESETS,
): ServingPresetKey | null {
  const preset = table.find((p) => p.basis === basis && p.amount === amount && (label === '' || p.label === label));
  return preset?.key ?? null;
}
