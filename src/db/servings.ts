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

/**
 * A preset's stable identity (issue #185). The closed set of keys: adding a preset adds a key here
 * and a row to `SERVING_PRESETS` below, and `serving-presets.test.ts` fails if the two disagree.
 *
 * These are the strings the UI already chips on (`servingPresetKeys` in `src/theme/tokens.ts`),
 * deliberately: the same key on both sides is why picking a chip and resolving a saved food's chip
 * are the same operation. `src/theme` is a dependency-free leaf and may not import the data layer,
 * so the two lists sit side by side rather than one importing the other.
 *
 * A key is not a label and never becomes one: it is never rendered, so it is free of spacing,
 * capitalisation and translation, and stays identical when the label or the amount beside it is
 * corrected. That is the whole point of it.
 */
export type ServingPresetKey = '100g' | '100ml' | 'cup' | 'tbsp' | 'tsp';

export interface ServingPreset {
  /**
   * The identity. A food re-selects its chip by this, never by label + basis + amount: that match
   * lost the food the moment a preset was renamed or a cup was corrected from 250 to 240 ml, and
   * silently picked the wrong chip whenever two presets agreed on all three.
   */
  readonly key: ServingPresetKey;
  /** What the serving is called. Rendered through `src/components/format/`, never concatenated raw. */
  readonly label: string;
  /** The basis this preset implies — picking the preset picks the basis (ruling 2). */
  readonly basis: FoodBasis;
  /** The serving amount in the canonical unit of `basis`. */
  readonly amount: number;
}

/**
 * The preset servings the food form offers, in chip order. One constant table (ruling 5), metric
 * only: a future US-units switch changes this table and one formatter, and migrates no historical
 * row — because a food is identified by `key`, that switch keeps every saved food on its chip
 * while the label and the amount under it change.
 *
 * A weight food measured by the cup — flour, say — is a Custom serving ("1 cup", weight, 80 g); a
 * custom serving belongs to its food and is never added here (ruling 4).
 */
export const SERVING_PRESETS = [
  { key: '100g', label: '100 g', basis: 'weight', amount: 100 },
  { key: '100ml', label: '100 ml', basis: 'volume', amount: 100 },
  { key: 'cup', label: '1 cup', basis: 'volume', amount: 250 },
  { key: 'tbsp', label: '1 tbsp', basis: 'volume', amount: 15 },
  { key: 'tsp', label: '1 tsp', basis: 'volume', amount: 5 },
] as const satisfies readonly ServingPreset[];

/** Every preset key, in chip order. Derived from the table, so it cannot drift from it. */
export const SERVING_PRESET_KEYS: readonly ServingPresetKey[] = SERVING_PRESETS.map((preset) => preset.key);

/**
 * The preset a key names, in an arbitrary table — `servingPresetByKey` is this over the constant
 * one. Takes the table rather than closing over it so that "this preset was removed in a later
 * release" and "a US-units table" are both answerable, and both testable.
 *
 * `key` is a plain `string` on purpose: a key arriving from a screen, a saved food or a future
 * stored column is an unknown string until this resolves it. A miss returns `undefined` and never
 * throws — the caller falls back to the food's own Custom serving, which is always a valid answer.
 */
export function servingPresetIn(table: readonly ServingPreset[], key: string): ServingPreset | undefined {
  return table.find((preset) => preset.key === key);
}

/**
 * The preset a key names. `undefined` for a key no preset carries — an unknown string, or one
 * whose preset has since been removed from the table.
 *
 * This is the lookup that replaces matching on label + basis + amount. Removing a preset is the
 * case worth spelling out: by key, a removed preset is a clean miss and every other preset is
 * untouched. The index zip it replaces would have slid every later preset up one, so a food saved
 * as a cup came back as a tablespoon.
 */
export function servingPresetByKey(key: string): ServingPreset | undefined {
  return servingPresetIn(SERVING_PRESETS, key);
}

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
