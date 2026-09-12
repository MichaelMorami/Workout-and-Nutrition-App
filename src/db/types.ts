/**
 * The domain types from the issue #17 contract §2 that #35's and #36's functions take and return.
 * Row types (`FoodRow`, `FoodLogRow`, `MealItemRow`, …) live in `./schema`; `HourHistogram` lives in
 * `./usage`, next to the code that encodes and decodes it. `MealSlot` is `./schema`'s — re-exported
 * from `./index`, not duplicated here. `LocalDate` is `./local-time`'s, for the same reason.
 */
import type { FoodLogRow, FoodRow, MealItemRow, MealSlot } from './schema';
import type { LocalDate } from './local-time';

/** An amount to log or update to: exactly one of servings or grams, always > 0. Logging by
 * `{ grams }` a food with no `serving_grams` throws `invalid_input`. */
export type Amount = { servings: number } | { grams: number };

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
  servingLabel: string;
  servingGrams: number | null;
}

export interface MealCandidate extends CandidateBase {
  kind: 'meal';
  itemCount: number;
}

/** One tile in the grid, one row in search or recents. Same type everywhere. */
export type Candidate = FoodCandidate | MealCandidate;
export type CandidateRef = Pick<Candidate, 'kind' | 'id'>;

/** The row fields `revert` needs to write back exactly. */
export type LogAmount = Pick<FoodLogRow, 'id' | 'qty' | 'grams' | 'kcal' | 'protein' | 'slot'>;

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

/** What `createFood`/`updateFood` take. `FoodRow`'s sync and usage-cache fields are never caller-set. */
export interface FoodInput {
  name: string;
  brand?: string | null;
  servingLabel: string;
  servingGrams?: number | null;
  kcalPerServing: number;
  proteinPerServing: number;
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

export type { MealSlot };
