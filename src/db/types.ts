/**
 * The domain types from the issue #17 contract §2 that #35's and #36's functions take and return.
 * Row types (`FoodRow`, `FoodLogRow`, `MealItemRow`, …) live in `./schema`; `HourHistogram` lives in
 * `./usage`, next to the code that encodes and decodes it. `MealSlot` is `./schema`'s — re-exported
 * from `./index`, not duplicated here. `LocalDate` is `./local-time`'s, for the same reason.
 */
import type { FoodBasis, FoodLogRow, FoodTableRow, MealItemRow, MealSlot } from './schema';
import type { FoodServing } from './servings';
import type { LocalDate } from './local-time';

/**
 * A catalogue food as every query hands it out: the stored row plus the per-serving values derived
 * from its per-100 nutrition (issue #86). The derived half is recomputed on every read and is never
 * written back — `NewFoodRow` is the type the table takes, and it has no per-serving field to fill.
 */
export type FoodRow = FoodTableRow & FoodServing;

/**
 * An amount to log or update to: servings, grams or millilitres, always > 0. The unit has to match
 * the food's `basis` — `{ grams }` against a volume food, or `{ ml }` against a weight food, throws
 * `invalid_input` rather than quietly recording a number in the wrong unit.
 */
export type Amount = { servings: number } | { grams: number } | { ml: number };

interface CandidateBase {
  id: string;
  name: string;
  /** One serving (food) or one portion (meal), from current catalogue values — display only. */
  kcal: number;
  protein: number;
  useCount: number;
  lastUsedAt: number | null;
}

export interface FoodCandidate extends CandidateBase {
  kind: 'food';
  brand: string | null;
  /** Which canonical unit this food is measured in — the portion sheet's unit comes from it. */
  basis: FoodBasis;
  servingLabel: string;
  /** One serving in the canonical unit of `basis`. */
  servingAmount: number;
  /** `servingAmount` for a weight food, `null` for a volume one. */
  servingGrams: number | null;
  /** `servingAmount` for a volume food, `null` for a weight one. */
  servingMl: number | null;
}

export interface MealCandidate extends CandidateBase {
  kind: 'meal';
  itemCount: number;
}

/** One tile in the grid, one row in search or recents. Same type everywhere. */
export type Candidate = FoodCandidate | MealCandidate;
export type CandidateRef = Pick<Candidate, 'kind' | 'id'>;

/** The row fields `revert` needs to write back exactly. */
export type LogAmount = Pick<FoodLogRow, 'id' | 'qty' | 'grams' | 'ml' | 'kcal' | 'protein' | 'slot'>;

/** What undo needs. Plain JSON: safe to hold in a zustand store. */
export type UndoToken =
  | { kind: 'unlog'; logIds: readonly string[] } // undoes logFood / logMeal / createFoodAndLog
  | { kind: 'restore'; logIds: readonly string[] } // undoes softDeleteLogEntries
  | { kind: 'revert'; previous: readonly LogAmount[] }; // undoes updateLogEntry / addPortion

export interface LogReceipt {
  target: CandidateRef;
  /** As stored: one row for a food, one per item for a meal. */
  entries: readonly FoodLogRow[];
  /** Portions those rows hold now (1 after a tap). */
  portions: number;
  undo: UndoToken;
}

export interface DayTotals {
  localDate: string;
  kcal: number;
  protein: number;
  kcalTarget: number;
  proteinTarget: number;
  entryCount: number;
}

/** Amounts and nutrition are the row's literal values; names are current catalogue labels, display only. */
export interface DayLogEntry extends FoodLogRow {
  foodName: string | null;
  brand: string | null;
  servingLabel: string | null;
  mealName: string | null;
}

export interface SettingsInput {
  kcalTarget: number;
  proteinTarget: number;
  /** 0 = Sunday, 1 = Monday. */
  weekStart: number;
}

/** `isDefault: true` means no settings row has been written yet — the UI shows "Set". */
export interface SettingsView extends SettingsInput {
  isDefault: boolean;
}

/**
 * What `createFood`/`updateFood` take. The sync and usage-cache fields are never caller-set, and
 * neither are the per-serving values — those are derived from what is here (issue #86).
 *
 * The form picks `basis` and `servingAmount` from `SERVING_PRESETS`, or the user gives a Custom
 * serving; nutrition is always entered per 100 g or per 100 ml, following the basis.
 */
export interface FoodInput {
  name: string;
  brand?: string | null;
  /** Grams or millilitres. Chosen by the serving preset (ruling 2). */
  basis: FoodBasis;
  /** What one serving is called: "1 scoop", "1 pot", "100 g". */
  servingLabel: string;
  /** One serving in the canonical unit of `basis`. Must be > 0. */
  servingAmount: number;
  /** kcal per 100 g or per 100 ml, following `basis`. */
  kcalPer100: number;
  /** Protein (g) per 100 g or per 100 ml, following `basis`. */
  proteinPer100: number;
}

/** One food in a new meal. `qty` is servings of that food per portion of the meal. */
export interface MealItemInput {
  foodId: string;
  qty: number;
}

/** One portion's worth, aggregated from *live* items over *live* foods — tombstoned foods excluded. */
export interface MealSummary {
  id: string;
  name: string;
  itemCount: number;
  kcal: number;
  protein: number;
}

export interface MealDetail extends MealSummary {
  items: readonly { item: MealItemRow; food: FoodRow }[];
}

/** Enough to name a saved meal in a notice — `mealsContainingFood`'s element (issue #153). */
export interface MealRef {
  id: string;
  name: string;
}

/**
 * What `updateMeal` takes (issue #154). Either field can be omitted to leave it untouched.
 * `items`, when given, fully replaces the live item set in one write — add, remove and
 * change-qty are all "give me the new list": every currently-live item is tombstoned and every
 * item here is inserted fresh. Rejects an empty array the same way `createMeal` rejects an empty
 * `items` — a meal always needs at least one item while it is live.
 */
export interface MealPatch {
  name?: string;
  items?: readonly MealItemInput[];
}

/**
 * What `deleteMeal` tombstoned (issue #154) — the item ids `restoreMeal` needs to bring back
 * exactly those items, not any item already dead before the delete (say, one `updateMeal`
 * removed earlier on purpose).
 */
export interface MealDeleteReceipt {
  mealId: string;
  itemIds: readonly string[];
}

/** One weigh-in, as `weightSummary` reports it. Weight in kg. */
export interface WeighIn {
  localDate: LocalDate;
  weight: number;
  measuredAt: number;
}

/**
 * The Today weight chip (issue #17 contract amendment, 2026-09-11): the current weight plus the
 * change in the 7-day running average since the week before. Windows are calendar days by
 * `local_date`; the mean is over the weigh-ins actually present, with no interpolation.
 */
export interface WeightSummary {
  /** Latest live weigh-in with `local_date <= localDate` — the big number. */
  latest: WeighIn | null;
  /** Mean weight (kg) of live weigh-ins with `local_date` in `[localDate - 6, localDate]`. */
  avg7: number | null;
  /** Mean weight (kg) of live weigh-ins with `local_date` in `[localDate - 13, localDate - 7]`. */
  avg7PrevWeek: number | null;
  /** `avg7 - avg7PrevWeek`, in kg. `null` when either window is empty. */
  weeklyDelta: number | null;
}

export type { FoodBasis, MealSlot };
