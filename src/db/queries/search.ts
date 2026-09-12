/**
 * Search, recents and create-and-log — issue #37, against the binding contract on issue #17 §3
 * ("#24: search and log any food"). Consumer: #24 (the search sheet).
 *
 * No FTS: `LIKE` — here, a plain JS substring scan over a folded `search_text` already in memory —
 * over a library of a few hundred foods is instant (contract §1.5, decisions.md #4). The read side
 * (`quickAddCandidates`, `dayLog`, …) is `./nutrition`; catalogue CRUD and meals are `./catalog`;
 * neither is duplicated here — the shared bits (`rankingScore`, `liveMealAggregates`,
 * `resolveAmount`, `validateFoodInput`) are imported from them.
 */
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { VitalsDb } from '../db';
import { newId } from '../ids';
import { addLocalDays, inferSlot, localDateOf, localStamp, type When } from '../local-time';
import { foldSqlValue } from '../search-fold';
import { foodLog, foods, meals, type FoodLogRow, type FoodRow, type NewFoodRow } from '../schema';
import type { Amount, Candidate, FoodCandidate, FoodInput, LogReceipt, MealCandidate, MealSlot } from '../types';
import { recomputeFoodUsage } from '../usage';
import { validateFoodInput } from './catalog';
import { liveMealAggregates, rankingScore, resolveAmount } from './nutrition';

// ---------------------------------------------------------------------------------------------
// Matching — every token a substring of `search_text`; tier 0 when every token also matches at a
// word start (start of string, or right after a space — `search_text` folds punctuation to spaces).
// ---------------------------------------------------------------------------------------------

/** Whether `token` occurs anywhere in `searchText`, and whether some occurrence starts a word. */
function findToken(searchText: string, token: string): { any: boolean; wordStart: boolean } {
  let from = 0;
  let any = false;
  for (;;) {
    const i = searchText.indexOf(token, from);
    if (i < 0) break;
    any = true;
    if (i === 0 || searchText[i - 1] === ' ') return { any: true, wordStart: true };
    from = i + 1;
  }
  return { any, wordStart: false };
}

/** `null` when a row doesn't match every token; otherwise the tier (0 = every token at a word
 * start, 1 = otherwise) per issue #17 contract §3. */
function matchTier(searchText: string, tokens: readonly string[]): 0 | 1 | null {
  let everyWordStart = true;
  for (const token of tokens) {
    const found = findToken(searchText, token);
    if (!found.any) return null;
    if (!found.wordStart) everyWordStart = false;
  }
  return everyWordStart ? 0 : 1;
}

function compareByTierThenScore(
  a: { c: Candidate; tier: 0 | 1; s: number },
  b: { c: Candidate; tier: 0 | 1; s: number },
): number {
  return a.tier - b.tier || b.s - a.s || a.c.name.localeCompare(b.c.name) || a.c.id.localeCompare(b.c.id);
}

function toFoodCandidate(f: FoodRow): FoodCandidate {
  return {
    kind: 'food',
    id: f.id,
    name: f.name,
    brand: f.brand,
    servingLabel: f.servingLabel,
    servingGrams: f.servingGrams,
    kcal: f.kcalPerServing,
    protein: f.proteinPerServing,
    useCount: f.useCount,
    lastUsedAt: f.lastUsedAt,
  };
}

// ---------------------------------------------------------------------------------------------
// searchFoods
// ---------------------------------------------------------------------------------------------

/**
 * Foods and saved meals matching every whitespace-separated token of `query`, case- and
 * accent-insensitive (issue #17 §1.5). A blank query returns `[]` — the empty state is
 * `recentFoods`. Archived or tombstoned foods, tombstoned meals and meals with no live item are
 * excluded. Ordered by tier (word-start matches before plain substring matches), then the
 * quick-add score at `at`, then name, then id. `limit` defaults to 20.
 *
 * `query` is folded through the exact SQL expression `search_text`'s triggers use
 * (`foldSqlValue`, bound as a real parameter — never inlined, so `%`, `_` and `\` in a typed query
 * are never SQL-special: this is a plain JS substring scan, not a `LIKE`), so a stored value and a
 * typed query can never disagree about what "the same word" means.
 */
export function searchFoods(db: VitalsDb, opts: When & { query: string; limit?: number }): Candidate[] {
  const limit = opts.limit ?? 20;
  const trimmed = opts.query.trim();
  if (trimmed.length === 0) return [];

  const folded = db.get<{ folded: string }>(sql`select ${foldSqlValue(trimmed)} as folded`).folded;
  const tokens = folded.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [];

  const { localMinute } = localStamp(opts.at, opts.timeZone);
  const hour = Math.floor(localMinute / 60);

  const matches: { c: Candidate; tier: 0 | 1; s: number }[] = [];

  const foodRows = db
    .select()
    .from(foods)
    .where(and(eq(foods.deleted, 0), eq(foods.archived, 0)))
    .all();
  for (const f of foodRows) {
    const tier = matchTier(f.searchText, tokens);
    if (tier === null) continue;
    matches.push({ c: toFoodCandidate(f), tier, s: rankingScore(f.useCount, f.lastUsedAt, f.hourHistogram, hour, opts.at) });
  }

  const mealAgg = liveMealAggregates(db);
  const mealRows = db.select().from(meals).where(eq(meals.deleted, 0)).all();
  for (const m of mealRows) {
    const agg = mealAgg.get(m.id);
    if (!agg) continue; // no live item — never a search result (contract)
    const tier = matchTier(m.searchText, tokens);
    if (tier === null) continue;
    matches.push({
      c: {
        kind: 'meal',
        id: m.id,
        name: m.name,
        kcal: agg.kcal,
        protein: agg.protein,
        itemCount: agg.itemCount,
        useCount: m.useCount,
        lastUsedAt: m.lastUsedAt,
      } satisfies MealCandidate,
      tier,
      s: rankingScore(m.useCount, m.lastUsedAt, m.hourHistogram, hour, opts.at),
    });
  }

  return matches
    .sort(compareByTierThenScore)
    .slice(0, limit)
    .map((x) => x.c);
}

// ---------------------------------------------------------------------------------------------
// recentFoods
// ---------------------------------------------------------------------------------------------

/**
 * Distinct foods (direct logs) and meals (meal-logging actions) with a live log in the last `days`
 * calendar days by `local_date` — `[localDateOf(at) - (days - 1), localDateOf(at)]` — newest
 * last-log first, then name, then id. Archived or tombstoned foods, tombstoned meals, meals with
 * no live item and anything in `excludeIds` (the grid's six) are excluded. `limit` is not in the
 * contract's stated defaults; it defaults to 20 for consistency with `searchFoods` — announced on
 * issue #37 alongside the rest of this module, per the issue #17 contract's rule that an additive
 * default is announced before it lands.
 */
export function recentFoods(
  db: VitalsDb,
  opts: When & { days: number; excludeIds?: readonly string[]; limit?: number },
): Candidate[] {
  const limit = opts.limit ?? 20;
  const excludeIds = new Set(opts.excludeIds ?? []);
  const endDate = localDateOf(opts.at, opts.timeZone);
  const startDate = addLocalDays(endDate, -(opts.days - 1));

  const rows = db
    .select({ foodId: foodLog.foodId, mealId: foodLog.mealId, loggedAt: foodLog.loggedAt })
    .from(foodLog)
    .where(and(eq(foodLog.deleted, 0), gte(foodLog.localDate, startDate), lte(foodLog.localDate, endDate)))
    .all();

  const lastLoggedFood = new Map<string, number>();
  const lastLoggedMeal = new Map<string, number>();
  for (const row of rows) {
    // A row logged from a saved meal is "recent meal", not "recent food" — the same direct-log-only
    // rule the usage cache uses (contract §1.4): tapping "Usual breakfast" is not tapping "Porridge".
    if (row.mealId) {
      const prev = lastLoggedMeal.get(row.mealId);
      if (prev === undefined || row.loggedAt > prev) lastLoggedMeal.set(row.mealId, row.loggedAt);
    } else if (row.foodId) {
      const prev = lastLoggedFood.get(row.foodId);
      if (prev === undefined || row.loggedAt > prev) lastLoggedFood.set(row.foodId, row.loggedAt);
    }
  }

  const foodIds = [...lastLoggedFood.keys()].filter((id) => !excludeIds.has(id));
  const mealIds = [...lastLoggedMeal.keys()].filter((id) => !excludeIds.has(id));

  const results: { c: Candidate; lastLog: number }[] = [];

  if (foodIds.length > 0) {
    const foodRows = db
      .select()
      .from(foods)
      .where(and(inArray(foods.id, foodIds), eq(foods.deleted, 0), eq(foods.archived, 0)))
      .all();
    for (const f of foodRows) {
      const lastLog = lastLoggedFood.get(f.id);
      if (lastLog === undefined) continue; // unreachable: f.id came from lastLoggedFood's own keys
      results.push({ c: toFoodCandidate(f), lastLog });
    }
  }

  if (mealIds.length > 0) {
    const mealAgg = liveMealAggregates(db);
    const mealRows = db
      .select()
      .from(meals)
      .where(and(inArray(meals.id, mealIds), eq(meals.deleted, 0)))
      .all();
    for (const m of mealRows) {
      const agg = mealAgg.get(m.id);
      if (!agg) continue; // no live item
      const lastLog = lastLoggedMeal.get(m.id);
      if (lastLog === undefined) continue;
      results.push({
        c: {
          kind: 'meal',
          id: m.id,
          name: m.name,
          kcal: agg.kcal,
          protein: agg.protein,
          itemCount: agg.itemCount,
          useCount: m.useCount,
          lastUsedAt: m.lastUsedAt,
        } satisfies MealCandidate,
        lastLog,
      });
    }
  }

  return results
    .sort((a, b) => b.lastLog - a.lastLog || a.c.name.localeCompare(b.c.name) || a.c.id.localeCompare(b.c.id))
    .slice(0, limit)
    .map((x) => x.c);
}

// ---------------------------------------------------------------------------------------------
// createFoodAndLog
// ---------------------------------------------------------------------------------------------

/**
 * Creates a catalogue food and logs one serving (or `amount`) of it, in one transaction: a failed
 * log (e.g. an invalid `amount`) leaves no orphan food. `receipt.undo` is `unlog` — undoing it
 * removes the log and **keeps the food**, whose cache returns to `use_count 0`, `last_used_at
 * NULL`, `hour_histogram NULL` (issue #17 contract §3).
 */
export function createFoodAndLog(
  db: VitalsDb,
  opts: When & { food: FoodInput; amount?: Amount; slot?: MealSlot },
): { food: FoodRow; receipt: LogReceipt } {
  validateFoodInput(opts.food);

  return db.transaction((tx) => {
    // Validated before any write, so an invalid amount never leaves a food behind — belt, and the
    // transaction rollback below is the braces, for any failure after this point.
    const { qty, grams } = resolveAmount(opts.amount ?? { servings: 1 }, opts.food.servingGrams ?? null);

    const foodRow: NewFoodRow = {
      id: newId(),
      updatedAt: opts.at,
      deleted: 0,
      name: opts.food.name,
      brand: opts.food.brand ?? null,
      servingLabel: opts.food.servingLabel,
      servingGrams: opts.food.servingGrams ?? null,
      kcalPerServing: opts.food.kcalPerServing,
      proteinPerServing: opts.food.proteinPerServing,
      archived: 0,
    };
    tx.insert(foods).values(foodRow).run();

    const { localDate, localMinute } = localStamp(opts.at, opts.timeZone);
    const slot = opts.slot ?? inferSlot(localMinute);

    const logRow: FoodLogRow = {
      id: newId(),
      updatedAt: opts.at,
      deleted: 0,
      loggedAt: opts.at,
      localDate,
      localMinute,
      foodId: foodRow.id,
      mealId: null,
      qty,
      grams,
      kcal: qty * foodRow.kcalPerServing,
      protein: qty * foodRow.proteinPerServing,
      slot,
    };
    tx.insert(foodLog).values(logRow).run();
    recomputeFoodUsage(tx, foodRow.id);

    const insertedFood = tx.select().from(foods).where(eq(foods.id, foodRow.id)).get();
    if (!insertedFood) throw new Error(`unreachable: food ${foodRow.id} was just inserted`);

    return {
      food: insertedFood,
      receipt: {
        target: { kind: 'food', id: foodRow.id },
        entries: [logRow],
        portions: 1,
        undo: { kind: 'unlog', logIds: [logRow.id] },
      },
    };
  });
}
