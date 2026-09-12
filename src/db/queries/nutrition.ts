/**
 * The nutrition read side, logging, portions and undo — issue #35, against the binding contract
 * on issue #17 §3 ("#20 Today and #18: read side" and "#18 and #21: logging, portions, undo").
 *
 * Catalogue CRUD, meals CRUD, `updateSettings` and `weightSummary` are issue #36; search, recents
 * and create-and-log are issue #37. Neither is imported here.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { VitalsDb } from '../db';
import { VitalsDbError } from '../errors';
import { newId } from '../ids';
import { inferSlot, localStamp, type LocalDate, type Stamp, type When } from '../local-time';
import { foodLog, foods, mealItems, meals, type FoodLogRow } from '../schema';
import type {
  Amount,
  Candidate,
  DayLogEntry,
  DayTotals,
  FoodCandidate,
  LogAmount,
  LogReceipt,
  MealCandidate,
  MealSlot,
  UndoToken,
} from '../types';
import { parseHourHistogram, recomputeFoodUsage, recomputeMealUsage } from '../usage';
import { getSettings } from './settings';

// ---------------------------------------------------------------------------------------------
// Ranking — quickAddCandidates, and the secondary order search will use in issue #37.
// ---------------------------------------------------------------------------------------------

/**
 * Weights for the ranking score. "The exact weights belong to #18 [now #35] and are pinned by its
 * tests" (contract §3) — what the contract *guarantees* is deterministic order, never-used rows
 * ranked below used ones, ties broken by name then id, and the exclusions below. Those are what
 * `quickAddCandidates`'s tests pin; the weights are free to retune without breaking the contract.
 */
const HOUR_WEIGHT = 100;
const USE_WEIGHT = 10;
const RECENCY_WEIGHT = 5;
const RECENCY_HALF_LIFE_DAYS = 14;
const MS_PER_DAY = 86_400_000;

/**
 * Hour affinity (the histogram's share at `hour` and its neighbours, weighted most) + log-scaled
 * `use_count` + a recency decay on `last_used_at`. `0` for a never-used row, which is what keeps
 * every used row ranked above every unused one: the smallest possible score from one use,
 * `log1p(1) * USE_WEIGHT`, is strictly positive.
 */
function rankingScore(useCount: number, lastUsedAt: number | null, hourHistogram: string | null, hour: number, at: number): number {
  if (useCount === 0) return 0;

  const hist = parseHourHistogram(hourHistogram);
  const before = hist[(hour + 23) % 24] ?? 0;
  const here = hist[hour] ?? 0;
  const after = hist[(hour + 1) % 24] ?? 0;
  const affinity = (before + here + after) / useCount;

  const ageDays = lastUsedAt === null ? null : Math.max(0, (at - lastUsedAt) / MS_PER_DAY);
  const recency = ageDays === null ? 0 : Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);

  return affinity * HOUR_WEIGHT + Math.log1p(useCount) * USE_WEIGHT + recency * RECENCY_WEIGHT;
}

function compareCandidates(a: { c: Candidate; s: number }, b: { c: Candidate; s: number }): number {
  return b.s - a.s || a.c.name.localeCompare(b.c.name) || a.c.id.localeCompare(b.c.id);
}

interface MealAggregate {
  itemCount: number;
  kcal: number;
  protein: number;
}

/**
 * One portion of every meal with at least one live item: a live `meal_item` (not tombstoned)
 * whose food is not tombstoned. Archived foods still count — archived only hides a *food* from the
 * grid, search and recents, and does not stop it appearing inside a meal (contract, #36 section).
 */
function liveMealAggregates(db: VitalsDb): Map<string, MealAggregate> {
  const rows = db
    .select({
      mealId: mealItems.mealId,
      qty: mealItems.qty,
      kcalPerServing: foods.kcalPerServing,
      proteinPerServing: foods.proteinPerServing,
    })
    .from(mealItems)
    .innerJoin(foods, eq(mealItems.foodId, foods.id))
    .where(and(eq(mealItems.deleted, 0), eq(foods.deleted, 0)))
    .all();

  const agg = new Map<string, MealAggregate>();
  for (const row of rows) {
    const prev = agg.get(row.mealId) ?? { itemCount: 0, kcal: 0, protein: 0 };
    agg.set(row.mealId, {
      itemCount: prev.itemCount + 1,
      kcal: prev.kcal + row.qty * row.kcalPerServing,
      protein: prev.protein + row.qty * row.proteinPerServing,
    });
  }
  return agg;
}

/**
 * The six (by default) tiles on the quick-add grid. Ranked by usage, hour-of-day match and
 * recency; archived or tombstoned foods, tombstoned meals and meals with no live item never
 * appear. An empty database returns `[]`.
 */
export function quickAddCandidates(db: VitalsDb, opts: When & { limit?: number }): Candidate[] {
  const limit = opts.limit ?? 6;
  const { localMinute } = localStamp(opts.at, opts.timeZone);
  const hour = Math.floor(localMinute / 60);

  const foodScored = db
    .select()
    .from(foods)
    .where(and(eq(foods.deleted, 0), eq(foods.archived, 0)))
    .all()
    .map((f) => ({
      c: {
        kind: 'food' as const,
        id: f.id,
        name: f.name,
        brand: f.brand,
        servingLabel: f.servingLabel,
        servingGrams: f.servingGrams,
        kcal: f.kcalPerServing,
        protein: f.proteinPerServing,
        useCount: f.useCount,
        lastUsedAt: f.lastUsedAt,
      } satisfies FoodCandidate,
      s: rankingScore(f.useCount, f.lastUsedAt, f.hourHistogram, hour, opts.at),
    }));

  const mealAgg = liveMealAggregates(db);
  const mealScored = db
    .select()
    .from(meals)
    .where(eq(meals.deleted, 0))
    .all()
    .flatMap((m) => {
      const agg = mealAgg.get(m.id);
      if (!agg) return [];
      return [
        {
          c: {
            kind: 'meal' as const,
            id: m.id,
            name: m.name,
            kcal: agg.kcal,
            protein: agg.protein,
            itemCount: agg.itemCount,
            useCount: m.useCount,
            lastUsedAt: m.lastUsedAt,
          } satisfies MealCandidate,
          s: rankingScore(m.useCount, m.lastUsedAt, m.hourHistogram, hour, opts.at),
        },
      ];
    });

  return [...foodScored, ...mealScored]
    .sort(compareCandidates)
    .slice(0, limit)
    .map((x) => x.c);
}

// ---------------------------------------------------------------------------------------------
// Day reads — todayTotals, dayLog.
// ---------------------------------------------------------------------------------------------

/** Live rows for `localDate`, summed, against the targets from `getSettings`. */
export function todayTotals(db: VitalsDb, localDate: LocalDate): DayTotals {
  const settingsView = getSettings(db);
  const rows = db
    .select({ kcal: foodLog.kcal, protein: foodLog.protein })
    .from(foodLog)
    .where(and(eq(foodLog.localDate, localDate), eq(foodLog.deleted, 0)))
    .all();

  let kcal = 0;
  let protein = 0;
  for (const row of rows) {
    kcal += row.kcal;
    protein += row.protein;
  }

  return {
    localDate,
    kcal,
    protein,
    kcalTarget: settingsView.kcalTarget,
    proteinTarget: settingsView.proteinTarget,
    entryCount: rows.length,
  };
}

/** Live rows for `localDate`, `logged_at` ascending then `id`, with current catalogue labels for display. */
export function dayLog(db: VitalsDb, localDate: LocalDate): DayLogEntry[] {
  const rows = db
    .select()
    .from(foodLog)
    .where(and(eq(foodLog.localDate, localDate), eq(foodLog.deleted, 0)))
    .orderBy(asc(foodLog.loggedAt), asc(foodLog.id))
    .all();

  if (rows.length === 0) return [];

  const foodIds = [...new Set(rows.map((r) => r.foodId).filter((id): id is string => id !== null))];
  const mealIds = [...new Set(rows.map((r) => r.mealId).filter((id): id is string => id !== null))];

  // No `deleted` filter here on purpose: a tombstoned food's name is still what the row said at
  // log time was called, and history keeps showing it (contract, "still shows in the day log").
  const foodMap = new Map(
    (foodIds.length > 0 ? db.select().from(foods).where(inArray(foods.id, foodIds)).all() : []).map((f) => [f.id, f]),
  );
  const mealMap = new Map(
    (mealIds.length > 0 ? db.select().from(meals).where(inArray(meals.id, mealIds)).all() : []).map((m) => [m.id, m]),
  );

  return rows.map((row) => {
    const food = row.foodId ? foodMap.get(row.foodId) : undefined;
    const meal = row.mealId ? mealMap.get(row.mealId) : undefined;
    return {
      ...row,
      foodName: food?.name ?? null,
      brand: food?.brand ?? null,
      servingLabel: food?.servingLabel ?? null,
      mealName: meal?.name ?? null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Amounts — shared by logFood and updateLogEntry.
// ---------------------------------------------------------------------------------------------

/** `qty` (servings) and canonical `grams` for an `Amount` against one serving's `servingGrams`. */
function resolveAmount(amount: Amount, servingGrams: number | null): { qty: number; grams: number | null } {
  if ('grams' in amount) {
    if (amount.grams <= 0) throw new VitalsDbError('invalid_input', 'grams must be > 0');
    if (servingGrams === null) {
      throw new VitalsDbError('invalid_input', 'this food has no serving_grams; log it by servings');
    }
    return { qty: amount.grams / servingGrams, grams: amount.grams };
  }
  if (amount.servings <= 0) throw new VitalsDbError('invalid_input', 'servings must be > 0');
  return { qty: amount.servings, grams: servingGrams === null ? null : amount.servings * servingGrams };
}

// ---------------------------------------------------------------------------------------------
// Logging — logFood, logMeal.
// ---------------------------------------------------------------------------------------------

/** Logs one serving (or `amount`) of a food. Writes one row with literal `kcal`/`protein`/`grams`. */
export function logFood(db: VitalsDb, opts: When & { foodId: string; amount?: Amount; slot?: MealSlot }): LogReceipt {
  return db.transaction((tx) => {
    const food = tx.select().from(foods).where(eq(foods.id, opts.foodId)).get();
    if (!food || food.deleted === 1) throw new VitalsDbError('not_found', `food ${opts.foodId} not found`);

    const { qty, grams } = resolveAmount(opts.amount ?? { servings: 1 }, food.servingGrams);
    const { localDate, localMinute } = localStamp(opts.at, opts.timeZone);
    const slot = opts.slot ?? inferSlot(localMinute);

    const row: FoodLogRow = {
      id: newId(),
      updatedAt: opts.at,
      deleted: 0,
      loggedAt: opts.at,
      localDate,
      localMinute,
      foodId: food.id,
      mealId: null,
      qty,
      grams,
      kcal: qty * food.kcalPerServing,
      protein: qty * food.proteinPerServing,
      slot,
    };

    tx.insert(foodLog).values(row).run();
    recomputeFoodUsage(tx, food.id);

    return {
      target: { kind: 'food', id: food.id },
      entries: [row],
      portions: 1,
      undo: { kind: 'unlog', logIds: [row.id] },
    };
  });
}

/** Logs `portions` (default 1) of a saved meal: one row per live item whose food is not tombstoned. */
export function logMeal(db: VitalsDb, opts: When & { mealId: string; portions?: number; slot?: MealSlot }): LogReceipt {
  const portions = opts.portions ?? 1;
  if (portions <= 0) throw new VitalsDbError('invalid_input', 'portions must be > 0');

  return db.transaction((tx) => {
    const meal = tx.select().from(meals).where(eq(meals.id, opts.mealId)).get();
    if (!meal || meal.deleted === 1) throw new VitalsDbError('not_found', `meal ${opts.mealId} not found`);

    const items = tx
      .select({
        foodId: mealItems.foodId,
        qty: mealItems.qty,
        servingGrams: foods.servingGrams,
        kcalPerServing: foods.kcalPerServing,
        proteinPerServing: foods.proteinPerServing,
      })
      .from(mealItems)
      .innerJoin(foods, eq(mealItems.foodId, foods.id))
      .where(and(eq(mealItems.mealId, opts.mealId), eq(mealItems.deleted, 0), eq(foods.deleted, 0)))
      .all();

    if (items.length === 0) throw new VitalsDbError('empty_meal', `meal ${opts.mealId} has no live items`);

    const { localDate, localMinute } = localStamp(opts.at, opts.timeZone);
    const slot = opts.slot ?? inferSlot(localMinute);

    const rows: FoodLogRow[] = items.map((item) => {
      const qty = item.qty * portions;
      return {
        id: newId(),
        updatedAt: opts.at,
        deleted: 0,
        loggedAt: opts.at,
        localDate,
        localMinute,
        foodId: item.foodId,
        mealId: opts.mealId,
        qty,
        grams: item.servingGrams === null ? null : qty * item.servingGrams,
        kcal: qty * item.kcalPerServing,
        protein: qty * item.proteinPerServing,
        slot,
      };
    });

    for (const row of rows) tx.insert(foodLog).values(row).run();
    recomputeMealUsage(tx, opts.mealId);

    return {
      target: { kind: 'meal', id: opts.mealId },
      entries: rows,
      portions,
      undo: { kind: 'unlog', logIds: rows.map((r) => r.id) },
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Portions, edits and delete — addPortion, updateLogEntry, softDeleteLogEntries.
// ---------------------------------------------------------------------------------------------

function toLogAmount(row: FoodLogRow): LogAmount {
  return { id: row.id, qty: row.qty, grams: row.grams, kcal: row.kcal, protein: row.protein, slot: row.slot };
}

/** Double-tap: another full portion of exactly what `receipt` logged. The usage cache is unchanged. */
export function addPortion(db: VitalsDb, opts: Stamp & { receipt: LogReceipt }): LogReceipt {
  const { receipt } = opts;
  const factor = (receipt.portions + 1) / receipt.portions;

  return db.transaction((tx) => {
    const previous: LogAmount[] = [];
    const entries: FoodLogRow[] = [];

    for (const entry of receipt.entries) {
      const current = tx.select().from(foodLog).where(eq(foodLog.id, entry.id)).get();
      if (!current || current.deleted === 1) throw new VitalsDbError('not_found', `log entry ${entry.id} not found`);

      previous.push(toLogAmount(current));
      const next = {
        qty: current.qty * factor,
        grams: current.grams === null ? null : current.grams * factor,
        kcal: current.kcal * factor,
        protein: current.protein * factor,
      };
      tx.update(foodLog).set({ ...next, updatedAt: opts.at }).where(eq(foodLog.id, current.id)).run();
      entries.push({ ...current, ...next, updatedAt: opts.at });
    }

    return {
      target: receipt.target,
      entries,
      portions: receipt.portions + 1,
      undo: { kind: 'revert', previous },
    };
  });
}

/** The exact slider on an existing row. Rescales from the row's own ratios — never reads `foods`. */
export function updateLogEntry(
  db: VitalsDb,
  opts: Stamp & { id: string; amount?: Amount; slot?: MealSlot },
): { entry: FoodLogRow; undo: UndoToken } {
  return db.transaction((tx) => {
    const current = tx.select().from(foodLog).where(eq(foodLog.id, opts.id)).get();
    if (!current || current.deleted === 1) throw new VitalsDbError('not_found', `log entry ${opts.id} not found`);

    const previous = toLogAmount(current);
    let { qty, grams, kcal, protein } = current;

    if (opts.amount) {
      const kcalPerServing = current.kcal / current.qty;
      const proteinPerServing = current.protein / current.qty;
      const gramsPerServing = current.grams === null ? null : current.grams / current.qty;

      if ('grams' in opts.amount) {
        if (opts.amount.grams <= 0) throw new VitalsDbError('invalid_input', 'grams must be > 0');
        if (gramsPerServing === null) {
          throw new VitalsDbError('invalid_input', 'this entry has no grams ratio; update it by servings');
        }
        grams = opts.amount.grams;
        qty = opts.amount.grams / gramsPerServing;
      } else {
        if (opts.amount.servings <= 0) throw new VitalsDbError('invalid_input', 'servings must be > 0');
        qty = opts.amount.servings;
        grams = gramsPerServing === null ? null : qty * gramsPerServing;
      }
      kcal = qty * kcalPerServing;
      protein = qty * proteinPerServing;
    }

    const slot = opts.slot ?? current.slot;

    tx.update(foodLog).set({ qty, grams, kcal, protein, slot, updatedAt: opts.at }).where(eq(foodLog.id, opts.id)).run();

    return {
      entry: { ...current, qty, grams, kcal, protein, slot, updatedAt: opts.at },
      undo: { kind: 'revert', previous: [previous] } satisfies UndoToken,
    };
  });
}

/** Tombstones rows — never a physical delete. Throws `not_found` for a missing or already-deleted id. */
export function softDeleteLogEntries(db: VitalsDb, opts: Stamp & { ids: readonly string[] }): { undo: UndoToken } {
  db.transaction((tx) => {
    const touchedFoodIds = new Set<string>();
    const touchedMealIds = new Set<string>();

    for (const id of opts.ids) {
      const current = tx.select().from(foodLog).where(eq(foodLog.id, id)).get();
      if (!current || current.deleted === 1) throw new VitalsDbError('not_found', `log entry ${id} not found`);

      tx.update(foodLog).set({ deleted: 1, updatedAt: opts.at }).where(eq(foodLog.id, id)).run();
      if (current.mealId) touchedMealIds.add(current.mealId);
      else if (current.foodId) touchedFoodIds.add(current.foodId);
    }

    for (const foodId of touchedFoodIds) recomputeFoodUsage(tx, foodId);
    for (const mealId of touchedMealIds) recomputeMealUsage(tx, mealId);
  });

  return { undo: { kind: 'restore', logIds: opts.ids } };
}

// ---------------------------------------------------------------------------------------------
// Undo — the single entry point for all three token kinds.
// ---------------------------------------------------------------------------------------------

/**
 * Idempotent: a row already in the target state is left untouched, so a second call bumps
 * nothing. Recomputes the usage cache of every food and meal a touched row belongs to, which is
 * what keeps `use_count`/`last_used_at`/`hour_histogram` exact — including undoing a meal log.
 */
export function undo(db: VitalsDb, opts: Stamp & { token: UndoToken }): void {
  db.transaction((tx) => {
    const touchedFoodIds = new Set<string>();
    const touchedMealIds = new Set<string>();
    const touch = (row: Pick<FoodLogRow, 'foodId' | 'mealId'>): void => {
      if (row.mealId) touchedMealIds.add(row.mealId);
      else if (row.foodId) touchedFoodIds.add(row.foodId);
    };

    const token = opts.token;
    if (token.kind === 'unlog' || token.kind === 'restore') {
      const targetDeleted = token.kind === 'unlog' ? 1 : 0;
      for (const id of token.logIds) {
        const current = tx.select().from(foodLog).where(eq(foodLog.id, id)).get();
        if (!current) continue; // nothing to undo — never happened, or a hard delete that never occurs
        touch(current);
        if (current.deleted === targetDeleted) continue; // already in the target state
        tx.update(foodLog).set({ deleted: targetDeleted, updatedAt: opts.at }).where(eq(foodLog.id, id)).run();
      }
    } else {
      for (const previous of token.previous) {
        const current = tx.select().from(foodLog).where(eq(foodLog.id, previous.id)).get();
        if (!current) continue;
        touch(current);
        const same =
          current.qty === previous.qty &&
          current.grams === previous.grams &&
          current.kcal === previous.kcal &&
          current.protein === previous.protein &&
          current.slot === previous.slot;
        if (same) continue;
        tx.update(foodLog)
          .set({ qty: previous.qty, grams: previous.grams, kcal: previous.kcal, protein: previous.protein, slot: previous.slot, updatedAt: opts.at })
          .where(eq(foodLog.id, previous.id))
          .run();
      }
    }

    for (const foodId of touchedFoodIds) recomputeFoodUsage(tx, foodId);
    for (const mealId of touchedMealIds) recomputeMealUsage(tx, mealId);
  });
}
