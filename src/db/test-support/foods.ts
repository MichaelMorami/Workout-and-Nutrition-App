/**
 * A `foods` row factory in the per-100 format (issue #86).
 *
 * `test/factories.ts` is qa-engineer's and still builds the pre-#86 shape (`serving_grams`,
 * `kcal_per_serving`, `protein_per_serving`) — columns this branch drops. That file cannot be
 * edited from here, so the data-layer suites get their food rows from this module instead. It is
 * test support, never imported by app code: nothing in `src/db/index.ts` re-exports it.
 *
 * Overrides are expressed **per serving**, because that is how a human describes a food — "a 170 g
 * pot, 133 kcal" — and how every existing data test reads. The per-100 numbers the table actually
 * stores are derived here, exactly as the form will derive them in reverse. A test that cares about
 * the stored numbers passes `kcalPer100` / `proteinPer100` directly.
 *
 *   makeFood()                                        // 1 pot, 170 g, 133 kcal, 17 g protein
 *   makeFood({ name: 'Whey', servingMl: 25 })         // a volume food
 *   makeFood({ kcalPer100: 380, servingAmount: 60 })  // per-100 numbers as stored
 */
import { testId } from '../../../test/factories';
import type { FoodBasis, NewFoodRow } from '../schema';

/**
 * Everything `foods` stores, with the serving described either way round. `basis` follows whichever
 * of `servingGrams` / `servingMl` is given, so a volume food is one word of override.
 */
export interface FoodOverrides {
  id?: string;
  updatedAt?: number;
  deleted?: number;
  name?: string;
  brand?: string | null;
  archived?: number;
  useCount?: number;
  lastUsedAt?: number | null;
  hourHistogram?: string | null;
  basis?: FoodBasis;
  servingLabel?: string;
  /** One serving in the canonical unit of `basis`. */
  servingAmount?: number;
  /** Sugar for `{ basis: 'weight', servingAmount }`. */
  servingGrams?: number;
  /** Sugar for `{ basis: 'volume', servingAmount }`. */
  servingMl?: number;
  /** Nutrition per serving — converted to per-100 against the resolved serving amount. */
  kcalPerServing?: number;
  proteinPerServing?: number;
  /** Nutrition as stored. Wins over the per-serving form. */
  kcalPer100?: number;
  proteinPer100?: number;
}

const DEFAULT_SERVING_GRAMS = 170;
const DEFAULT_KCAL_PER_SERVING = 133;
const DEFAULT_PROTEIN_PER_SERVING = 17;

/** A whole insertable `foods` row. Deterministic: ids come from the harness counter. */
export function makeFood(overrides: FoodOverrides = {}): NewFoodRow {
  const basis: FoodBasis =
    overrides.basis ?? (overrides.servingMl !== undefined ? 'volume' : 'weight');
  const servingAmount =
    overrides.servingAmount ??
    overrides.servingGrams ??
    overrides.servingMl ??
    DEFAULT_SERVING_GRAMS;
  const per100 = (perServing: number): number => (perServing * 100) / servingAmount;

  return {
    id: overrides.id ?? testId('food'),
    updatedAt: overrides.updatedAt ?? Date.now(),
    deleted: overrides.deleted ?? 0,
    name: overrides.name ?? 'Greek yoghurt',
    brand: overrides.brand ?? null,
    basis,
    servingLabel: overrides.servingLabel ?? '1 pot',
    servingAmount,
    kcalPer100: overrides.kcalPer100 ?? per100(overrides.kcalPerServing ?? DEFAULT_KCAL_PER_SERVING),
    proteinPer100:
      overrides.proteinPer100 ?? per100(overrides.proteinPerServing ?? DEFAULT_PROTEIN_PER_SERVING),
    archived: overrides.archived ?? 0,
    useCount: overrides.useCount ?? 0,
    lastUsedAt: overrides.lastUsedAt ?? null,
    hourHistogram: overrides.hourHistogram ?? null,
  };
}
