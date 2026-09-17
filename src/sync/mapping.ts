/**
 * The row mapping between the local Drizzle schema and the remote contract in
 * `supabase/migrations/**`. Issue #114.
 *
 * Pure: `(row, userId) => row`. No client, no network, no clock, no I/O. That is not tidiness — it
 * is the reason the app can never block on the network to write a log, and the reason every conflict
 * case below is a table-driven unit test that runs in microseconds.
 *
 * Three rules it enforces, all of them about not losing data:
 *
 *   1. **`updated_at` is carried verbatim, in both directions.** It is a ms epoch written by the
 *      device that made the edit. Nothing here restamps it. Ordering across a clock skew is the
 *      planner's decision, on values this module faithfully preserves; a mapping that "helpfully"
 *      refreshed the timestamp would make every pushed row look newer than the remote copy and win
 *      conflicts it should lose.
 *   2. **`local_date` and `local_minute` are carried, never derived.** A 23:30 meal in Los Angeles
 *      is tomorrow in UTC. This module has no timezone and no clock precisely so that re-deriving
 *      the calendar day is impossible here.
 *   3. **Tombstones are rows.** `deleted = 1` travels with the full row body. An absent row means
 *      "not arrived yet", never "deleted".
 *
 * The device-local usage cache (`use_count`, `last_used_at`, `hour_histogram`, `search_text`) is
 * deliberately outside the mapped type. It is derived from `food_log`, recomputed by the data layer
 * on every write, and never a reason to bump `updated_at` — syncing it would mean one device's
 * ranking overwriting another's for no gain.
 */
import type { FoodLogRow, FoodTableRow } from '@/src/db';
import { SyncMappingError } from './errors';
import type { SyncTable } from './errors';
import type { RemoteFoodLogRow, RemoteFoodRow } from './remote-rows';

/** The `foods` columns that travel. Everything else on the local row is derived, device-local state. */
export const FOOD_SYNC_COLUMNS = [
  'id',
  'updatedAt',
  'deleted',
  'name',
  'brand',
  'basis',
  'servingLabel',
  'servingAmount',
  'kcalPer100',
  'proteinPer100',
  'archived',
] as const;

/** A local `foods` row reduced to what syncs. */
export type LocalFoodSync = Pick<FoodTableRow, (typeof FOOD_SYNC_COLUMNS)[number]>;

/** Every `food_log` column is history, so every one of them syncs. */
export type LocalFoodLogSync = FoodLogRow;

const BASES = new Set(['weight', 'volume']);
const LOCAL_DATE = /^\d{4}-[0-1]\d-[0-3]\d$/;

interface Where {
  readonly table: SyncTable;
  readonly rowId: string;
  readonly column: string;
}

const reject = (where: Where, detail: string): never => {
  throw new SyncMappingError('invalid-value', where.table, where.rowId, where.column, detail);
};

/** A finite number. Rejects `null`, `undefined`, `NaN`, `Infinity` and a numeric-looking string. */
function num(value: unknown, where: Where): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    reject(where, `expected a finite number, got ${JSON.stringify(value)}`);
  }
  return value as number;
}

function nullableNum(value: unknown, where: Where): number | null {
  if (value === null || value === undefined) return null;
  return num(value, where);
}

/** 0 or 1. Anything else would fail the CHECK on both sides, so it is caught here by name. */
function flag(value: unknown, where: Where): number {
  if (value !== 0 && value !== 1) reject(where, `expected 0 or 1, got ${JSON.stringify(value)}`);
  return value as number;
}

function str(value: unknown, where: Where): string {
  if (typeof value !== 'string') reject(where, `expected a string, got ${JSON.stringify(value)}`);
  return value as string;
}

function nullableStr(value: unknown, where: Where): string | null {
  if (value === null || value === undefined) return null;
  return str(value, where);
}

function basis(value: unknown, where: Where): 'weight' | 'volume' {
  if (typeof value !== 'string' || !BASES.has(value)) {
    reject(where, `expected 'weight' or 'volume', got ${JSON.stringify(value)}`);
  }
  return value as 'weight' | 'volume';
}

/** A user id must be present before a row goes up: RLS would reject an unattributed insert. */
function owner(userId: string, table: SyncTable, rowId: string): string {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new SyncMappingError('missing-user', table, rowId, 'user_id', 'no signed-in user');
  }
  return userId;
}

/**
 * `grams` and `ml` are mutually exclusive — a row records one canonical amount, following the food's
 * basis at log time. Both null is legal (rows predating #86). Both set is not, and letting one
 * through would make the remote CHECK reject the entire upsert batch, not just this row.
 */
function amounts(
  grams: unknown,
  ml: unknown,
  rowId: string,
): { grams: number | null; ml: number | null } {
  const where = (column: string): Where => ({ table: 'food_log', rowId, column });
  const g = nullableNum(grams, where('grams'));
  const m = nullableNum(ml, where('ml'));
  if (g !== null && m !== null) {
    reject(where('grams'), 'a log records grams or ml, never both');
  }
  return { grams: g, ml: m };
}

function localDay(value: unknown, rowId: string): string {
  const where: Where = { table: 'food_log', rowId, column: 'local_date' };
  const day = str(value, where);
  if (!LOCAL_DATE.test(day)) {
    // An ISO timestamp here is the tell-tale of a calendar day derived from a UTC instant.
    reject(where, `expected YYYY-MM-DD, got ${JSON.stringify(day)}`);
  }
  return day;
}

function localMinute(value: unknown, rowId: string): number {
  const where: Where = { table: 'food_log', rowId, column: 'local_minute' };
  const minute = num(value, where);
  if (!Number.isInteger(minute) || minute < 0 || minute > 1439) {
    reject(where, `expected 0..1439, got ${minute}`);
  }
  return minute;
}

/** Narrow a full local row to the columns that sync. The usage cache stays on the device. */
export function foodSyncFields(row: FoodTableRow): LocalFoodSync {
  return {
    id: row.id,
    updatedAt: row.updatedAt,
    deleted: row.deleted,
    name: row.name,
    brand: row.brand,
    basis: row.basis,
    servingLabel: row.servingLabel,
    servingAmount: row.servingAmount,
    kcalPer100: row.kcalPer100,
    proteinPer100: row.proteinPer100,
    archived: row.archived,
  };
}

export function toRemoteFood(row: LocalFoodSync, userId: string): RemoteFoodRow {
  const id = row.id;
  const at = (column: string): Where => ({ table: 'foods', rowId: id, column });
  return {
    id,
    user_id: owner(userId, 'foods', id),
    updated_at: num(row.updatedAt, at('updated_at')),
    deleted: flag(row.deleted, at('deleted')),
    name: str(row.name, at('name')),
    brand: nullableStr(row.brand, at('brand')),
    basis: basis(row.basis, at('basis')),
    serving_label: str(row.servingLabel, at('serving_label')),
    serving_amount: num(row.servingAmount, at('serving_amount')),
    kcal_per_100: num(row.kcalPer100, at('kcal_per_100')),
    protein_per_100: num(row.proteinPer100, at('protein_per_100')),
    archived: flag(row.archived, at('archived')),
  };
}

export function fromRemoteFood(row: RemoteFoodRow): LocalFoodSync {
  const id = row.id;
  const at = (column: string): Where => ({ table: 'foods', rowId: id, column });
  return {
    id,
    updatedAt: num(row.updated_at, at('updated_at')),
    deleted: flag(row.deleted, at('deleted')),
    name: str(row.name, at('name')),
    brand: nullableStr(row.brand, at('brand')),
    basis: basis(row.basis, at('basis')),
    servingLabel: str(row.serving_label, at('serving_label')),
    servingAmount: num(row.serving_amount, at('serving_amount')),
    kcalPer100: num(row.kcal_per_100, at('kcal_per_100')),
    proteinPer100: num(row.protein_per_100, at('protein_per_100')),
    archived: flag(row.archived, at('archived')),
  };
}

export function toRemoteFoodLog(row: LocalFoodLogSync, userId: string): RemoteFoodLogRow {
  const id = row.id;
  const at = (column: string): Where => ({ table: 'food_log', rowId: id, column });
  const amount = amounts(row.grams, row.ml, id);
  return {
    id,
    user_id: owner(userId, 'food_log', id),
    updated_at: num(row.updatedAt, at('updated_at')),
    deleted: flag(row.deleted, at('deleted')),
    logged_at: num(row.loggedAt, at('logged_at')),
    local_date: localDay(row.localDate, id),
    local_minute: localMinute(row.localMinute, id),
    food_id: nullableStr(row.foodId, at('food_id')),
    meal_id: nullableStr(row.mealId, at('meal_id')),
    qty: num(row.qty, at('qty')),
    grams: amount.grams,
    ml: amount.ml,
    kcal: num(row.kcal, at('kcal')),
    protein: num(row.protein, at('protein')),
    slot: str(row.slot, at('slot')),
  };
}

export function fromRemoteFoodLog(row: RemoteFoodLogRow): LocalFoodLogSync {
  const id = row.id;
  const at = (column: string): Where => ({ table: 'food_log', rowId: id, column });
  const amount = amounts(row.grams, row.ml, id);
  return {
    id,
    updatedAt: num(row.updated_at, at('updated_at')),
    deleted: flag(row.deleted, at('deleted')),
    loggedAt: num(row.logged_at, at('logged_at')),
    localDate: localDay(row.local_date, id),
    localMinute: localMinute(row.local_minute, id),
    foodId: nullableStr(row.food_id, at('food_id')),
    mealId: nullableStr(row.meal_id, at('meal_id')),
    qty: num(row.qty, at('qty')),
    grams: amount.grams,
    ml: amount.ml,
    kcal: num(row.kcal, at('kcal')),
    protein: num(row.protein, at('protein')),
    // Slots are typed locally but deliberately not constrained by a CHECK: a future version may add
    // one, and rejecting an unknown slot would drop that device's history rather than show it.
    slot: str(row.slot, at('slot')) as LocalFoodLogSync['slot'],
  };
}
