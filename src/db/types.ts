/**
 * The domain types from the issue #17 contract §2 that #35's functions take and return. Row types
 * (`FoodRow`, `FoodLogRow`, …) live in `./schema`; `HourHistogram` lives in `./usage`, next to the
 * code that encodes and decodes it. `MealSlot` is `./schema`'s — re-exported from `./index`, not
 * duplicated here.
 */
import type { FoodLogRow, MealSlot } from './schema';

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

export type { MealSlot };
