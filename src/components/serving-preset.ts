/**
 * Which preset a serving matches — shared by `<FoodForm>` (pre-selecting an edited food's chip) and
 * `<PortionSheet>` (issue #93: picking which per-preset step strip a candidate gets). One place, so
 * the label/basis/amount matching rule — and its one deliberate exception, below — is never
 * duplicated or drifts between the two call sites the way PR #188's review caught it starting to.
 *
 * `SERVING_PRESETS` in `src/db/servings.ts` has no stable `key` field yet (issue #185), so
 * `PRESET_BY_KEY` zips it by array index with `servingPresetKeys` (`src/theme/tokens.ts`) — the two
 * arrays are the same order. Until #185 lands, this is the documented fallback.
 */
import { SERVING_PRESETS, type FoodBasis, type ServingPreset } from '../db';
import { servingPresetKeys, type ServingPresetKey } from '../theme/tokens';

/** `servingPresetKeys[i]` names `SERVING_PRESETS[i]` — see the module note on why this is a zip, not
 * a lookup into a stable key `SERVING_PRESETS` does not have yet (issue #185). */
export const PRESET_BY_KEY: Readonly<Record<ServingPresetKey, ServingPreset>> = Object.fromEntries(
  servingPresetKeys.map((key, i) => [key, SERVING_PRESETS[i]]),
) as Record<ServingPresetKey, ServingPreset>;

/** Finds the preset key whose label + basis + amount all match a food exactly — issue #89's
 * unblock comment, carry-over #2: a stable `key` does not exist on `SERVING_PRESETS` yet (#185), so
 * an edit falls back to matching on label+basis+amount together. The label matters as much as the
 * numbers: "1 bottle"/volume/250 and "1 cup"/volume/250 share a preset's basis+amount but are not
 * the same serving, and a basis+amount-only match silently renamed the former to the latter on
 * save (PR #188 review, B1) — a real data-loss bug on the edit path. Matching all three means a food
 * whose amount happens to land on a preset but whose label does not falls to Custom instead, with
 * its own label preserved rather than overwritten.
 *
 * `label === ''` is the one exception, and it is not a real food: `catalog.ts`'s own `createFood`
 * throws on a blank `servingLabel` (`invalid_input`), so no row ever reaches this form with one — a
 * blank label only ever means `CreateFoodSheet`'s synthetic "nothing chosen yet" `initial`, which
 * wants the 100 g preset's own label, not Custom. Basis+amount alone still resolves that case. */
export function matchingPresetKey(label: string, basis: FoodBasis, amount: number): ServingPresetKey | null {
  for (const key of servingPresetKeys) {
    const preset = PRESET_BY_KEY[key];
    if (preset.basis === basis && preset.amount === amount && (label === '' || preset.label === label)) return key;
  }
  return null;
}
