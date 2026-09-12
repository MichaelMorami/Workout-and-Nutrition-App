/**
 * The usage cache on `foods` and `meals` (issue #17 contract §1.4): `use_count`, `last_used_at`
 * and `hour_histogram`, derived from live `food_log` rows and recomputed — never incrementally
 * patched — by whichever write changed the set of live rows. Recomputing from scratch is what
 * makes undo exact in any order, not only LIFO.
 *
 * These recomputes never set `updated_at`: bumping it would let a tap on one device beat a
 * nutrition correction made on another under last-write-wins (§0).
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { VitalsDb } from './db';
import { foodLog, foods, meals } from './schema';

/** 24 counts, one per local wall-clock hour. Always length 24. */
export type HourHistogram = readonly number[];

const HOURS = 24;

/**
 * Decode `foods.hour_histogram` / `meals.hour_histogram`. `NULL` (a food never logged) decodes to
 * 24 zeros, never a special case a caller has to branch on.
 */
export function parseHourHistogram(text: string | null): HourHistogram {
  if (text === null) return Array.from({ length: HOURS }, () => 0);
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || parsed.length !== HOURS || parsed.some((n) => typeof n !== 'number')) {
    throw new Error(`hour_histogram must decode to ${HOURS} numbers, got ${text}`);
  }
  return parsed as number[];
}

/** The canonical encoding: `NULL` when the count is 0, never `[0, 0, …, 0]` (§1.4). */
function encodeHourHistogram(hist: readonly number[]): string | null {
  return hist.some((n) => n > 0) ? JSON.stringify(hist) : null;
}

function bucketOf(localMinute: number): number {
  return Math.floor(localMinute / 60);
}

/**
 * Recompute one food's cache over its live *direct* logs — `food_id = id AND meal_id IS NULL`.
 * Logging via a saved meal is not "tapping this food", so it never counts here (§1.4).
 */
export function recomputeFoodUsage(db: VitalsDb, foodId: string): void {
  const rows = db
    .select({ loggedAt: foodLog.loggedAt, localMinute: foodLog.localMinute })
    .from(foodLog)
    .where(and(eq(foodLog.foodId, foodId), isNull(foodLog.mealId), eq(foodLog.deleted, 0)))
    .all();

  const hist = Array.from({ length: HOURS }, () => 0);
  let lastUsedAt: number | null = null;
  for (const row of rows) {
    hist[bucketOf(row.localMinute)] = (hist[bucketOf(row.localMinute)] ?? 0) + 1;
    if (lastUsedAt === null || row.loggedAt > lastUsedAt) lastUsedAt = row.loggedAt;
  }

  db.update(foods)
    .set({ useCount: rows.length, lastUsedAt, hourHistogram: encodeHourHistogram(hist) })
    .where(eq(foods.id, foodId))
    .run();
}

/**
 * Recompute one meal's cache over live *logging actions* — distinct `(meal_id, logged_at)`
 * groups, since one tap on a meal writes several `food_log` rows that all share `logged_at` (§1.4).
 */
export function recomputeMealUsage(db: VitalsDb, mealId: string): void {
  const rows = db
    .select({ loggedAt: foodLog.loggedAt, localMinute: foodLog.localMinute })
    .from(foodLog)
    .where(and(eq(foodLog.mealId, mealId), eq(foodLog.deleted, 0)))
    .all();

  // One local_minute per distinct logged_at — the rows in one logging action share it by construction.
  const groups = new Map<number, number>();
  for (const row of rows) {
    if (!groups.has(row.loggedAt)) groups.set(row.loggedAt, row.localMinute);
  }

  const hist = Array.from({ length: HOURS }, () => 0);
  let lastUsedAt: number | null = null;
  for (const [loggedAt, localMinute] of groups) {
    hist[bucketOf(localMinute)] = (hist[bucketOf(localMinute)] ?? 0) + 1;
    if (lastUsedAt === null || loggedAt > lastUsedAt) lastUsedAt = loggedAt;
  }

  db.update(meals)
    .set({ useCount: groups.size, lastUsedAt, hourHistogram: encodeHourHistogram(hist) })
    .where(eq(meals.id, mealId))
    .run();
}
