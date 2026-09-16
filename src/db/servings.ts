/**
 * Servings — the one place per-serving nutrition is computed, and the one table of metric presets
 * (issue #86, client rulings 2 and 5).
 *
 * `foods` stores nutrition per 100 g or per 100 ml and one serving's amount in the same unit.
 * Everything a screen shows per serving is computed from those three numbers here, at read time.
 * Nothing persists a per-serving number: that is the value that silently drifts from its source the
 * moment a food is corrected, and a stored copy would also have to be migrated on every edit.
 *
 * `food_log` is the exception and always was — a log row holds literal `kcal`, `protein` and its
 * amount, because it is a fact about the past, not a view of the catalogue.
 */
import type { FoodBasis, FoodTableRow } from './schema';

/** The canonical unit of each basis. Grams and millilitres; metric only, like kg and cm. */
export const UNIT_OF_BASIS: Readonly<Record<FoodBasis, 'g' | 'ml'>> = { weight: 'g', volume: 'ml' };

export interface ServingPreset {
  /** What the serving is called. Rendered through `src/components/format/`, never concatenated raw. */
  label: string;
  /** The basis this preset implies — picking the preset picks the basis (ruling 2). */
  basis: FoodBasis;
  /** The serving amount in the canonical unit of `basis`. */
  amount: number;
}

/**
 * The preset servings the food form offers. One constant table (ruling 5), metric only: a future
 * US-units switch changes this table and one formatter, and migrates no historical row.
 *
 * A weight food measured by the cup — flour, say — is a Custom serving ("1 cup", weight, 80 g); a
 * custom serving belongs to its food and is never added here (ruling 4).
 */
export const SERVING_PRESETS: readonly ServingPreset[] = [
  { label: '100 g', basis: 'weight', amount: 100 },
  { label: '100 ml', basis: 'volume', amount: 100 },
  { label: '1 cup', basis: 'volume', amount: 250 },
  { label: '1 tbsp', basis: 'volume', amount: 15 },
  { label: '1 tsp', basis: 'volume', amount: 5 },
];

/** The per-serving values a food's per-100 nutrition implies. Derived, never stored. */
export interface FoodServing {
  /** `kcal_per_100 × serving_amount / 100`. */
  kcalPerServing: number;
  /** `protein_per_100 × serving_amount / 100`. */
  proteinPerServing: number;
  /** Grams in one serving: `serving_amount` for a weight food, `null` for a volume food. */
  servingGrams: number | null;
  /** Millilitres in one serving: `serving_amount` for a volume food, `null` for a weight food. */
  servingMl: number | null;
}

/**
 * Binary floating point does not round-trip `x × 100 / a × a / 100`: a 105 kcal serving over 170 g
 * stores 61.764705882352935 per 100 g and comes back as 104.99999999999999. Snapping to 1e-6 —
 * six decimal places of a kilocalorie, far below anything a screen or a sum can show — makes the
 * derived value the number the user actually typed, and is stable across every caller because they
 * all come through here.
 */
const PRECISION = 1e6;
const snap = (value: number): number => Math.round(value * PRECISION) / PRECISION;

/** The food fields a serving is computed from — a whole row is never needed. */
export type ServingSource = Pick<FoodTableRow, 'basis' | 'servingAmount' | 'kcalPer100' | 'proteinPer100'>;

/** Per-serving values for one food. The only implementation; every read path calls it. */
export function servingOf(food: ServingSource): FoodServing {
  return {
    kcalPerServing: snap((food.kcalPer100 * food.servingAmount) / 100),
    proteinPerServing: snap((food.proteinPer100 * food.servingAmount) / 100),
    servingGrams: food.basis === 'weight' ? food.servingAmount : null,
    servingMl: food.basis === 'volume' ? food.servingAmount : null,
  };
}

/** A stored row plus its derived serving — what every query hands out. */
export function withServing<T extends ServingSource>(food: T): T & FoodServing {
  return { ...food, ...servingOf(food) };
}

/** `qty` servings of a food, in its canonical unit: grams for weight, millilitres for volume. */
export function amountOf(food: Pick<ServingSource, 'basis' | 'servingAmount'>, qty: number): { grams: number | null; ml: number | null } {
  const amount = snap(qty * food.servingAmount);
  return food.basis === 'weight' ? { grams: amount, ml: null } : { grams: null, ml: amount };
}
