/**
 * The nutrition read side, logging, portions and undo (issue #35) — against the binding contract
 * on issue #17 §3. Every case here traces to the acceptance criteria on #35: ranking guarantees,
 * `local_date`-only day reads, literal history at write time, exact usage-cache round-trips
 * through undo (in any order, not only LIFO), and the 400-day performance budget.
 */
import { eq } from 'drizzle-orm';
import { performance } from 'node:perf_hooks';
import { makeTestDb } from '../../../test/db';
import { makeFood, makeMeal, makeMealItem } from '../../../test/factories';
import { makeSeededTestDb } from '../../../test/seed';
import { VitalsDbError, type VitalsDbErrorCode } from '../errors';
import * as schema from '../schema';
import type { FoodCandidate, MealCandidate } from '../types';
import { DEFAULT_SETTINGS, SETTINGS_ID } from './settings';
import {
  addPortion,
  dayLog,
  logFood,
  logMeal,
  quickAddCandidates,
  softDeleteLogEntries,
  todayTotals,
  undo,
  updateLogEntry,
} from './nutrition';

const LA = 'America/Los_Angeles';
const AUCKLAND = 'Pacific/Auckland';
/** Noon, America/Los_Angeles, 2025-03-09 (after that day's spring-forward cut) — an unambiguous
 * instant to hang a `local_date` assertion on, distinct from any raw epoch-ms offset from 1970. */
const AT_2025_03_09 = Date.parse('2025-03-09T19:00:00.000Z');

/** An `hour_histogram` with `count` uses at exactly `hour` and nothing elsewhere — for pinning the
 * hour-affinity term of the ranking score in isolation from use_count and recency. */
function histogramAt(hour: number, count: number): string {
  const hist = Array.from({ length: 24 }, () => 0);
  hist[hour] = count;
  return JSON.stringify(hist);
}

function setup() {
  const { db, sqlite } = makeTestDb({ schema });
  return { db, sqlite };
}

/**
 * `Meal` (`test/model.ts`) doesn't carry the usage-cache columns yet — issue #17 deviation 6 landed
 * them on the schema (`use_count`, `last_used_at`, `hour_histogram`) without a matching update to
 * the qa-owned factory type. `schema.meals`'s own insert type has them, so splicing them onto a
 * factory-built row after the fact is exactly as valid an insert as the factory's own fields.
 */
function makeMealWithUsage(
  overrides: Partial<Parameters<typeof makeMeal>[0]> & { useCount?: number; lastUsedAt?: number | null; hourHistogram?: string | null } = {},
): typeof schema.meals.$inferInsert {
  const { useCount, lastUsedAt, hourHistogram, ...rest } = overrides;
  return {
    ...makeMeal(rest),
    ...(useCount !== undefined ? { useCount } : {}),
    ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
    ...(hourHistogram !== undefined ? { hourHistogram } : {}),
  };
}

/** Every write throws `VitalsDbError`, never a raw `Error` — assert the code, not just "it threw". */
function expectDbError(fn: () => unknown, code: VitalsDbErrorCode): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(VitalsDbError);
  expect((caught as VitalsDbError).code).toBe(code);
}

// -------------------------------------------------------------------------------------------
// quickAddCandidates
// -------------------------------------------------------------------------------------------

describe('quickAddCandidates', () => {
  it('on an empty database, returns []', () => {
    const { db } = setup();
    expect(quickAddCandidates(db, { at: 1_000, timeZone: LA })).toEqual([]);
  });

  it('defaults to six', () => {
    const { db } = setup();
    for (let i = 0; i < 8; i += 1) {
      db.insert(schema.foods)
        .values(makeFood({ name: `Food ${i}`, useCount: i + 1, lastUsedAt: 1_000, hourHistogram: null }))
        .run();
    }
    expect(quickAddCandidates(db, { at: 1_000, timeZone: LA })).toHaveLength(6);
  });

  it('respects an explicit limit', () => {
    const { db } = setup();
    for (let i = 0; i < 3; i += 1) {
      db.insert(schema.foods)
        .values(makeFood({ name: `Food ${i}`, useCount: i + 1, lastUsedAt: 1_000 }))
        .run();
    }
    expect(quickAddCandidates(db, { at: 1_000, timeZone: LA, limit: 2 })).toHaveLength(2);
  });

  it('fewer matches return fewer rows, not padded', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ useCount: 1, lastUsedAt: 1_000 })).run();
    expect(quickAddCandidates(db, { at: 1_000, timeZone: LA })).toHaveLength(1);
  });

  it('ranks the top-limit by log-scaled use_count when hour affinity and recency are equal', () => {
    const { db } = setup();
    // Same lastUsedAt, no histogram (so hour affinity is 0 for all): use_count is the only thing
    // that varies, so highest use_count must sort first, guaranteed by the contract.
    for (let i = 0; i < 8; i += 1) {
      db.insert(schema.foods)
        .values(makeFood({ name: `Food ${i}`, useCount: i + 1, lastUsedAt: 1_000, hourHistogram: null }))
        .run();
    }
    const result = quickAddCandidates(db, { at: 1_000, timeZone: LA });
    expect(result.map((c) => c.name)).toEqual(['Food 7', 'Food 6', 'Food 5', 'Food 4', 'Food 3', 'Food 2']);
  });

  it('is deterministic: calling twice on the same data gives the same order', () => {
    const { db } = setup();
    for (let i = 0; i < 5; i += 1) {
      db.insert(schema.foods).values(makeFood({ name: `Food ${i}`, useCount: i, lastUsedAt: i > 0 ? 1_000 : null })).run();
    }
    const a = quickAddCandidates(db, { at: 1_000, timeZone: LA }).map((c) => c.id);
    const b = quickAddCandidates(db, { at: 1_000, timeZone: LA }).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('never-used foods rank below used ones', () => {
    const { db } = setup();
    const used = makeFood({ name: 'Used', useCount: 1, lastUsedAt: 1_000 });
    const unused = makeFood({ name: 'Unused', useCount: 0, lastUsedAt: null });
    db.insert(schema.foods).values([unused, used]).run();

    const result = quickAddCandidates(db, { at: 1_000, timeZone: LA });
    expect(result.map((c) => c.id)).toEqual([used.id, unused.id]);
  });

  it('ties break by name, then id', () => {
    const { db } = setup();
    // Equal use_count (0), equal lastUsedAt (null): the score is exactly 0 for both.
    const b = makeFood({ name: 'Banana' });
    const a = makeFood({ name: 'Apple' });
    db.insert(schema.foods).values([b, a]).run();

    const result = quickAddCandidates(db, { at: 1_000, timeZone: LA });
    expect(result.map((c) => c.name)).toEqual(['Apple', 'Banana']);
  });

  it('ties on name break by id', () => {
    const { db } = setup();
    const first = makeFood({ id: '00000001-0000-4000-8000-000000000000', name: 'Same' });
    const second = makeFood({ id: '00000002-0000-4000-8000-000000000000', name: 'Same' });
    db.insert(schema.foods).values([second, first]).run();

    const result = quickAddCandidates(db, { at: 1_000, timeZone: LA });
    expect(result.map((c) => c.id)).toEqual([first.id, second.id]);
  });

  it('excludes archived foods', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ useCount: 99, lastUsedAt: 1_000, archived: 1 })).run();
    expect(quickAddCandidates(db, { at: 1_000, timeZone: LA })).toEqual([]);
  });

  it('excludes tombstoned foods', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ useCount: 99, lastUsedAt: 1_000, deleted: 1 })).run();
    expect(quickAddCandidates(db, { at: 1_000, timeZone: LA })).toEqual([]);
  });

  it('excludes tombstoned meals', () => {
    const { db } = setup();
    // The constituent food is archived, not merely live — otherwise it would appear as its own
    // food candidate and the assertion below would no longer be isolating the meal exclusion.
    const meal = makeMealWithUsage({ useCount: 99, lastUsedAt: 1_000, deleted: 1 });
    const food = makeFood({ archived: 1 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    expect(quickAddCandidates(db, { at: 1_000, timeZone: LA })).toEqual([]);
  });

  it('excludes a meal with no live items — all items tombstoned', () => {
    const { db } = setup();
    const meal = makeMealWithUsage({ useCount: 5, lastUsedAt: 1_000 });
    const food = makeFood({ archived: 1 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id, deleted: 1 })).run();

    expect(quickAddCandidates(db, { at: 1_000, timeZone: LA })).toEqual([]);
  });

  it('excludes a meal whose only item points at a tombstoned food', () => {
    const { db } = setup();
    const meal = makeMealWithUsage({ useCount: 5, lastUsedAt: 1_000 });
    const food = makeFood({ deleted: 1 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    expect(quickAddCandidates(db, { at: 1_000, timeZone: LA })).toEqual([]);
  });

  it('a meal with a live item still appears, aggregated from current food values', () => {
    const { db } = setup();
    const meal = makeMealWithUsage({ name: 'Usual breakfast', useCount: 3, lastUsedAt: 1_000 });
    const oats = makeFood({ name: 'Oats', kcalPerServing: 200, proteinPerServing: 8 });
    const milk = makeFood({ name: 'Milk', kcalPerServing: 100, proteinPerServing: 7 });
    db.insert(schema.foods).values([oats, milk]).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems)
      .values([
        makeMealItem({ mealId: meal.id, foodId: oats.id, qty: 1 }),
        makeMealItem({ mealId: meal.id, foodId: milk.id, qty: 2 }),
      ])
      .run();

    const [candidate] = quickAddCandidates(db, { at: 1_000, timeZone: LA });
    expect(candidate).toMatchObject({
      kind: 'meal',
      id: meal.id,
      name: 'Usual breakfast',
      kcal: 200 * 1 + 100 * 2,
      protein: 8 * 1 + 7 * 2,
      itemCount: 2,
    } satisfies Partial<MealCandidate>);
  });

  it('archived does not hide a food from a meal it belongs to — the meal item still counts', () => {
    const { db } = setup();
    const meal = makeMealWithUsage({ useCount: 1, lastUsedAt: 1_000 });
    const food = makeFood({ archived: 1, kcalPerServing: 50, proteinPerServing: 2 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id, qty: 1 })).run();

    const result = quickAddCandidates(db, { at: 1_000, timeZone: LA });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'meal', kcal: 50, protein: 2, itemCount: 1 });
  });

  it('carries the food fields a tile needs — brand, servingLabel, servingGrams', () => {
    const { db } = setup();
    const food = makeFood({ brand: 'Fage', servingLabel: '170 g pot', servingGrams: 170, useCount: 1, lastUsedAt: 1_000 });
    db.insert(schema.foods).values(food).run();

    const [candidate] = quickAddCandidates(db, { at: 1_000, timeZone: LA });
    expect(candidate).toMatchObject({
      kind: 'food',
      brand: 'Fage',
      servingLabel: '170 g pot',
      servingGrams: 170,
    } satisfies Partial<FoodCandidate>);
  });

  it('hour affinity beats raw use count: a rarely-used food logged at this hour outranks a heavily-used one logged at a different hour', () => {
    const { db } = setup();
    const at = Date.parse('2025-03-09T16:00:00.000Z'); // 08:00 America/Los_Angeles
    // A: used 20 times, always at hour 3 — nothing like the query hour (8).
    const heavyWrongHour = makeFood({
      name: 'Heavy, wrong hour',
      useCount: 20,
      lastUsedAt: at,
      hourHistogram: histogramAt(3, 20),
    });
    // B: used only 3 times, always at hour 8 — exactly the query hour.
    const lightRightHour = makeFood({
      name: 'Light, right hour',
      useCount: 3,
      lastUsedAt: at,
      hourHistogram: histogramAt(8, 3),
    });
    db.insert(schema.foods).values([heavyWrongHour, lightRightHour]).run();

    const result = quickAddCandidates(db, { at, timeZone: LA });
    expect(result.map((c) => c.name)).toEqual(['Light, right hour', 'Heavy, wrong hour']);
  });

  it('the ranking hour is local: the same instant ranks differently in two timezones with different local hours', () => {
    const { db } = setup();
    const at = Date.parse('2025-03-09T20:00:00.000Z');
    // 13:00 in America/Los_Angeles, 09:00 in Pacific/Auckland at this instant — far enough apart
    // that neither food's histogram (hour ± 1) bleeds into the other's peak.
    const laHour = 13;
    const aucklandHour = 9;

    const laPeak = makeFood({ name: 'LA peak', useCount: 5, lastUsedAt: at, hourHistogram: histogramAt(laHour, 5) });
    const aucklandPeak = makeFood({ name: 'Auckland peak', useCount: 5, lastUsedAt: at, hourHistogram: histogramAt(aucklandHour, 5) });
    db.insert(schema.foods).values([laPeak, aucklandPeak]).run();

    const inLA = quickAddCandidates(db, { at, timeZone: LA });
    expect(inLA[0]?.name).toBe('LA peak');

    const inAuckland = quickAddCandidates(db, { at, timeZone: AUCKLAND });
    expect(inAuckland[0]?.name).toBe('Auckland peak');
  });

  it('recency orders equal use counts: the more recently used of two equally-used, never-matching-hour foods ranks first', () => {
    const { db } = setup();
    const at = Date.parse('2025-03-09T16:00:00.000Z');
    // No histogram on either (hour term is 0 for both). Names are chosen so that a fallback to the
    // name/id tie-break — which is what a zeroed-out recency term would produce — picks the *other*
    // food, so this test can only pass because recency actually orders them.
    const recent = makeFood({ name: 'Z recently used', useCount: 4, lastUsedAt: at, hourHistogram: null });
    const stale = makeFood({ name: 'A staler use', useCount: 4, lastUsedAt: at - 30 * 86_400_000, hourHistogram: null });
    db.insert(schema.foods).values([stale, recent]).run();

    const result = quickAddCandidates(db, { at, timeZone: LA });
    expect(result.map((c) => c.name)).toEqual(['Z recently used', 'A staler use']);
  });
});

// -------------------------------------------------------------------------------------------
// todayTotals
// -------------------------------------------------------------------------------------------

describe('todayTotals', () => {
  it('on an empty database, sums to zero against DEFAULT_SETTINGS targets', () => {
    const { db } = setup();
    expect(todayTotals(db, '2025-03-09')).toEqual({
      localDate: '2025-03-09',
      kcal: 0,
      protein: 0,
      kcalTarget: DEFAULT_SETTINGS.kcalTarget,
      proteinTarget: DEFAULT_SETTINGS.proteinTarget,
      entryCount: 0,
    });
  });

  it('sums only live rows on that local_date', () => {
    const { db } = setup();
    logFood(db, { at: AT_2025_03_09, timeZone: LA, foodId: seedFood(db, { kcalPerServing: 100, proteinPerServing: 10 }) });
    logFood(db, { at: AT_2025_03_09 + 1_000, timeZone: LA, foodId: seedFood(db, { kcalPerServing: 50, proteinPerServing: 5 }) });

    const totals = todayTotals(db, '2025-03-09');
    expect(totals.kcal).toBe(150);
    expect(totals.protein).toBe(15);
    expect(totals.entryCount).toBe(2);
  });

  it('excludes soft-deleted rows', () => {
    const { db } = setup();
    const foodId = seedFood(db, { kcalPerServing: 100, proteinPerServing: 10 });
    const receipt = logFood(db, { at: AT_2025_03_09, timeZone: LA, foodId });
    softDeleteLogEntries(db, { at: AT_2025_03_09 + 1_000, ids: [receipt.entries[0]!.id] });

    expect(todayTotals(db, '2025-03-09')).toMatchObject({ kcal: 0, protein: 0, entryCount: 0 });
  });

  it('excludes rows on other local_dates', () => {
    const { db } = setup();
    const foodId = seedFood(db, { kcalPerServing: 100, proteinPerServing: 10 });
    logFood(db, { at: AT_2025_03_09, timeZone: LA, foodId });
    db.insert(schema.foodLog)
      .values({
        id: 'other-day',
        updatedAt: 1_000,
        deleted: 0,
        loggedAt: 1_000,
        localDate: '2025-03-08',
        localMinute: 100,
        foodId,
        qty: 1,
        kcal: 999,
        protein: 999,
        slot: 'breakfast',
      })
      .run();

    expect(todayTotals(db, '2025-03-09').kcal).toBe(100);
  });

  it('reads targets from getSettings, not a hard-coded default, once a row exists', () => {
    const { db } = setup();
    db.insert(schema.settings).values({ id: SETTINGS_ID, updatedAt: 1, deleted: 0, kcalTarget: 2500, proteinTarget: 180, weekStart: 0 }).run();

    expect(todayTotals(db, '2025-03-09')).toMatchObject({ kcalTarget: 2500, proteinTarget: 180 });
  });

  it('a 23:55 America/Los_Angeles log lands on the local day, not the UTC day', () => {
    const { db } = setup();
    const foodId = seedFood(db, { kcalPerServing: 111, proteinPerServing: 9 });
    // 2025-03-10T06:55:00Z is 2025-03-09 23:55 in America/Los_Angeles.
    logFood(db, { at: Date.parse('2025-03-10T06:55:00.000Z'), timeZone: LA, foodId });

    expect(todayTotals(db, '2025-03-09').kcal).toBe(111);
    expect(todayTotals(db, '2025-03-10').kcal).toBe(0);
  });

  it('a 00:05 Pacific/Auckland log lands on the correct day in a zone ahead of UTC', () => {
    const { db } = setup();
    const foodId = seedFood(db, { kcalPerServing: 77, proteinPerServing: 3 });
    // 2025-03-09T11:05:00Z is 2025-03-10 00:05 in Pacific/Auckland.
    logFood(db, { at: Date.parse('2025-03-09T11:05:00.000Z'), timeZone: AUCKLAND, foodId });

    expect(todayTotals(db, '2025-03-10').kcal).toBe(77);
    expect(todayTotals(db, '2025-03-09').kcal).toBe(0);
  });

  it('both sides of the US spring-forward DST cut land on the same local day', () => {
    const { db } = setup();
    const foodId = seedFood(db, { kcalPerServing: 10, proteinPerServing: 1 });
    // 09:59 UTC = 01:59 PST; 10:00 UTC = 03:00 PDT (the clock has just jumped from 2:00 to 3:00).
    logFood(db, { at: Date.parse('2025-03-09T09:59:00.000Z'), timeZone: LA, foodId });
    logFood(db, { at: Date.parse('2025-03-09T10:00:00.000Z'), timeZone: LA, foodId });

    expect(todayTotals(db, '2025-03-09')).toMatchObject({ kcal: 20, entryCount: 2 });
  });
});

// -------------------------------------------------------------------------------------------
// dayLog
// -------------------------------------------------------------------------------------------

describe('dayLog', () => {
  it('on an empty database, returns []', () => {
    const { db } = setup();
    expect(dayLog(db, '2025-03-09')).toEqual([]);
  });

  it('orders by logged_at ascending, then id', () => {
    const { db } = setup();
    const foodId = seedFood(db);
    logFood(db, { at: AT_2025_03_09 + 3_000, timeZone: LA, foodId });
    logFood(db, { at: AT_2025_03_09 + 1_000, timeZone: LA, foodId });
    logFood(db, { at: AT_2025_03_09 + 2_000, timeZone: LA, foodId });

    const entries = dayLog(db, '2025-03-09');
    expect(entries.map((e) => e.loggedAt)).toEqual([AT_2025_03_09 + 1_000, AT_2025_03_09 + 2_000, AT_2025_03_09 + 3_000]);
  });

  it('excludes soft-deleted rows', () => {
    const { db } = setup();
    const foodId = seedFood(db);
    const receipt = logFood(db, { at: AT_2025_03_09, timeZone: LA, foodId });
    softDeleteLogEntries(db, { at: AT_2025_03_09 + 1_000, ids: [receipt.entries[0]!.id] });

    expect(dayLog(db, '2025-03-09')).toEqual([]);
  });

  it('carries current catalogue labels for display, alongside the row’s literal amounts', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Skyr', brand: 'Arla', servingLabel: '1 pot', kcalPerServing: 120, proteinPerServing: 15 });
    db.insert(schema.foods).values(food).run();
    logFood(db, { at: AT_2025_03_09, timeZone: LA, foodId: food.id });

    const [entry] = dayLog(db, '2025-03-09');
    expect(entry).toMatchObject({ foodName: 'Skyr', brand: 'Arla', servingLabel: '1 pot', kcal: 120, protein: 15 });
  });

  it('still shows the food’s name for a row logged before the food was tombstoned — history is immutable', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Discontinued snack' });
    db.insert(schema.foods).values(food).run();
    logFood(db, { at: AT_2025_03_09, timeZone: LA, foodId: food.id });
    db.update(schema.foods).set({ deleted: 1, updatedAt: AT_2025_03_09 + 1_000 }).where(eq(schema.foods.id, food.id)).run();

    const [entry] = dayLog(db, '2025-03-09');
    expect(entry?.foodName).toBe('Discontinued snack');
  });

  it('correcting a food’s nutrition never rewrites the past log row', () => {
    const { db } = setup();
    const food = makeFood({ kcalPerServing: 100, proteinPerServing: 10 });
    db.insert(schema.foods).values(food).run();
    logFood(db, { at: AT_2025_03_09, timeZone: LA, foodId: food.id });
    db.update(schema.foods)
      .set({ kcalPerServing: 999, proteinPerServing: 999, updatedAt: AT_2025_03_09 + 1_000 })
      .where(eq(schema.foods.id, food.id))
      .run();

    const [entry] = dayLog(db, '2025-03-09');
    expect(entry).toMatchObject({ kcal: 100, protein: 10 });
  });

  it('shows which rows belong to a meal via mealName', () => {
    const { db } = setup();
    const food = makeFood();
    const meal = makeMeal({ name: 'Post-gym shake' });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();
    logMeal(db, { at: AT_2025_03_09, timeZone: LA, mealId: meal.id });

    const [entry] = dayLog(db, '2025-03-09');
    expect(entry?.mealName).toBe('Post-gym shake');
  });
});

// -------------------------------------------------------------------------------------------
// logFood
// -------------------------------------------------------------------------------------------

describe('logFood', () => {
  it('defaults amount to one serving, writes literal kcal/protein/grams, and infers the slot', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: 170, kcalPerServing: 133, proteinPerServing: 17 });
    db.insert(schema.foods).values(food).run();

    // 08:00 local is within the breakfast window.
    const at = Date.parse('2025-03-09T16:00:00.000Z'); // 08:00 PST
    const receipt = logFood(db, { at, timeZone: LA, foodId: food.id });

    expect(receipt.entries).toHaveLength(1);
    expect(receipt.entries[0]).toMatchObject({
      foodId: food.id,
      mealId: null,
      qty: 1,
      grams: 170,
      kcal: 133,
      protein: 17,
      slot: 'breakfast',
      localDate: '2025-03-09',
    });
    expect(receipt.target).toEqual({ kind: 'food', id: food.id });
    expect(receipt.portions).toBe(1);
    expect(receipt.undo).toEqual({ kind: 'unlog', logIds: [receipt.entries[0]!.id] });
  });

  it('an explicit slot overrides the inferred one', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const at = Date.parse('2025-03-09T16:00:00.000Z'); // 08:00 PST -> would infer breakfast

    const receipt = logFood(db, { at, timeZone: LA, foodId: food.id, slot: 'snack' });
    expect(receipt.entries[0]?.slot).toBe('snack');
  });

  it('scales qty/kcal/protein/grams for an explicit servings amount', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: 100, kcalPerServing: 200, proteinPerServing: 20 });
    db.insert(schema.foods).values(food).run();

    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id, amount: { servings: 1.5 } });
    expect(receipt.entries[0]).toMatchObject({ qty: 1.5, grams: 150, kcal: 300, protein: 30 });
  });

  it('an exact grams amount round-trips: { grams: 137 } stores grams = 137', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: 170, kcalPerServing: 133, proteinPerServing: 17 });
    db.insert(schema.foods).values(food).run();

    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id, amount: { grams: 137 } });
    expect(receipt.entries[0]?.grams).toBe(137);
    expect(receipt.entries[0]?.qty).toBeCloseTo(137 / 170, 10);
    expect(receipt.entries[0]?.kcal).toBeCloseTo(133 * (137 / 170), 10);
  });

  it('grams is null when the food has no serving_grams', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: null });
    db.insert(schema.foods).values(food).run();

    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id, amount: { servings: 2 } });
    expect(receipt.entries[0]?.grams).toBeNull();
  });

  it('a food with no serving_grams cannot be logged by grams — invalid_input', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: null });
    db.insert(schema.foods).values(food).run();

    expectDbError(() => logFood(db, { at: 1_000, timeZone: LA, foodId: food.id, amount: { grams: 100 } }), 'invalid_input');
  });

  it('rejects a non-positive amount', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    expectDbError(() => logFood(db, { at: 1_000, timeZone: LA, foodId: food.id, amount: { servings: 0 } }), 'invalid_input');
    expectDbError(() => logFood(db, { at: 1_000, timeZone: LA, foodId: food.id, amount: { grams: -1 } }), 'invalid_input');
  });

  it('throws not_found for a missing food', () => {
    const { db } = setup();
    expectDbError(() => logFood(db, { at: 1_000, timeZone: LA, foodId: 'no-such-food' }), 'not_found');
  });

  it('throws not_found for a tombstoned food', () => {
    const { db } = setup();
    const food = makeFood({ deleted: 1 });
    db.insert(schema.foods).values(food).run();
    expectDbError(() => logFood(db, { at: 1_000, timeZone: LA, foodId: food.id }), 'not_found');
  });

  it('logging an archived food is allowed', () => {
    const { db } = setup();
    const food = makeFood({ archived: 1 });
    db.insert(schema.foods).values(food).run();
    expect(() => logFood(db, { at: 1_000, timeZone: LA, foodId: food.id })).not.toThrow();
  });

  it('recomputes the food’s usage cache in the same write', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const at = Date.parse('2025-03-09T16:00:00.000Z'); // 08:00 PST

    logFood(db, { at, timeZone: LA, foodId: food.id });

    const row = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(row?.useCount).toBe(1);
    expect(row?.lastUsedAt).toBe(at);
  });

  it('never bumps foods.updated_at — a log is not a catalogue edit', () => {
    const { db } = setup();
    const food = makeFood({ updatedAt: 42 });
    db.insert(schema.foods).values(food).run();
    logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });

    const row = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(row?.updatedAt).toBe(42);
  });

  it('stores the local wall clock, not the UTC one: 23:55 America/Los_Angeles is local_minute 1435, hour bucket 23', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    // 2025-03-10T06:55:00Z is 2025-03-09 23:55 in America/Los_Angeles (UTC hour 6, minute 55 —
    // a UTC-derived local_minute would wrongly be 415, not 1435).
    const at = Date.parse('2025-03-10T06:55:00.000Z');

    const receipt = logFood(db, { at, timeZone: LA, foodId: food.id });

    expect(receipt.entries[0]?.localMinute).toBe(23 * 60 + 55);
    const row = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    const histogram = JSON.parse(row?.hourHistogram ?? 'null') as number[];
    expect(histogram[23]).toBe(1);
  });
});

// -------------------------------------------------------------------------------------------
// logMeal
// -------------------------------------------------------------------------------------------

describe('logMeal', () => {
  it('writes one row per live item, sharing logged_at/local_date/local_minute/slot/meal_id', () => {
    const { db } = setup();
    const meal = makeMeal();
    const oats = makeFood({ name: 'Oats', servingGrams: 60, kcalPerServing: 228, proteinPerServing: 8.4 });
    const milk = makeFood({ name: 'Milk', servingGrams: 200, kcalPerServing: 98, proteinPerServing: 7 });
    db.insert(schema.foods).values([oats, milk]).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems)
      .values([makeMealItem({ mealId: meal.id, foodId: oats.id, qty: 1 }), makeMealItem({ mealId: meal.id, foodId: milk.id, qty: 2 })])
      .run();

    const at = Date.parse('2025-03-09T16:00:00.000Z'); // 08:00 PST
    const receipt = logMeal(db, { at, timeZone: LA, mealId: meal.id });

    expect(receipt.entries).toHaveLength(2);
    for (const entry of receipt.entries) {
      expect(entry.mealId).toBe(meal.id);
      expect(entry.loggedAt).toBe(at);
      expect(entry.localDate).toBe('2025-03-09');
      expect(entry.slot).toBe('breakfast');
    }
    const byFood = new Map(receipt.entries.map((e) => [e.foodId, e]));
    expect(byFood.get(oats.id)).toMatchObject({ qty: 1, kcal: 228, protein: 8.4, grams: 60 });
    expect(byFood.get(milk.id)).toMatchObject({ qty: 2, kcal: 196, protein: 14, grams: 400 });
    expect(receipt.target).toEqual({ kind: 'meal', id: meal.id });
    expect(receipt.portions).toBe(1);
    expect(receipt.undo).toEqual({ kind: 'unlog', logIds: receipt.entries.map((e) => e.id) });
  });

  it('scales every item by portions', () => {
    const { db } = setup();
    const meal = makeMeal();
    const food = makeFood({ kcalPerServing: 100, proteinPerServing: 10 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id, qty: 1 })).run();

    const receipt = logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id, portions: 3 });
    expect(receipt.entries[0]).toMatchObject({ qty: 3, kcal: 300, protein: 30 });
    expect(receipt.portions).toBe(3);
  });

  it('excludes a tombstoned meal_item', () => {
    const { db } = setup();
    const meal = makeMeal();
    const live = makeFood({ name: 'Live' });
    const gone = makeFood({ name: 'Gone' });
    db.insert(schema.foods).values([live, gone]).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems)
      .values([makeMealItem({ mealId: meal.id, foodId: live.id }), makeMealItem({ mealId: meal.id, foodId: gone.id, deleted: 1 })])
      .run();

    const receipt = logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id });
    expect(receipt.entries).toHaveLength(1);
    expect(receipt.entries[0]?.foodId).toBe(live.id);
  });

  it('excludes an item whose food is tombstoned', () => {
    const { db } = setup();
    const meal = makeMeal();
    const live = makeFood({ name: 'Live' });
    const gone = makeFood({ name: 'Gone', deleted: 1 });
    db.insert(schema.foods).values([live, gone]).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values([makeMealItem({ mealId: meal.id, foodId: live.id }), makeMealItem({ mealId: meal.id, foodId: gone.id })]).run();

    const receipt = logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id });
    expect(receipt.entries).toHaveLength(1);
    expect(receipt.entries[0]?.foodId).toBe(live.id);
  });

  it('still logs an item whose food is archived', () => {
    const { db } = setup();
    const meal = makeMeal();
    const food = makeFood({ archived: 1 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    const receipt = logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id });
    expect(receipt.entries).toHaveLength(1);
  });

  it('throws empty_meal when no item is loggable', () => {
    const { db } = setup();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    expectDbError(() => logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id }), 'empty_meal');
  });

  it('throws empty_meal when every item’s food is tombstoned', () => {
    const { db } = setup();
    const meal = makeMeal();
    const food = makeFood({ deleted: 1 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();
    expectDbError(() => logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id }), 'empty_meal');
  });

  it('throws not_found for a missing meal', () => {
    const { db } = setup();
    expectDbError(() => logMeal(db, { at: 1_000, timeZone: LA, mealId: 'no-such-meal' }), 'not_found');
  });

  it('throws not_found for a tombstoned meal', () => {
    const { db } = setup();
    const meal = makeMeal({ deleted: 1 });
    db.insert(schema.meals).values(meal).run();
    expectDbError(() => logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id }), 'not_found');
  });

  it('rejects non-positive portions', () => {
    const { db } = setup();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    expectDbError(() => logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id, portions: 0 }), 'invalid_input');
  });

  it('recomputes the meal’s usage cache but not the constituent foods’', () => {
    const { db } = setup();
    const meal = makeMeal();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id });

    const mealRow = db.select().from(schema.meals).where(eq(schema.meals.id, meal.id)).get();
    const foodRow = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(mealRow?.useCount).toBe(1);
    expect(foodRow?.useCount).toBe(0);
  });

  it('stores the local wall clock, not the UTC one: 23:55 America/Los_Angeles is local_minute 1435, hour bucket 23', () => {
    const { db } = setup();
    const meal = makeMeal();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();
    // 2025-03-10T06:55:00Z is 2025-03-09 23:55 in America/Los_Angeles (UTC hour 6, minute 55 —
    // a UTC-derived local_minute would wrongly be 415, not 1435).
    const at = Date.parse('2025-03-10T06:55:00.000Z');

    const receipt = logMeal(db, { at, timeZone: LA, mealId: meal.id });

    expect(receipt.entries[0]?.localMinute).toBe(23 * 60 + 55);
    const mealRow = db.select().from(schema.meals).where(eq(schema.meals.id, meal.id)).get();
    const histogram = JSON.parse(mealRow?.hourHistogram ?? 'null') as number[];
    expect(histogram[23]).toBe(1);
  });
});

// -------------------------------------------------------------------------------------------
// addPortion
// -------------------------------------------------------------------------------------------

describe('addPortion', () => {
  it('doubles a single-food receipt on the first double-tap', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: 100, kcalPerServing: 200, proteinPerServing: 20 });
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });

    const doubled = addPortion(db, { at: 2_000, receipt });
    expect(doubled.portions).toBe(2);
    expect(doubled.entries[0]).toMatchObject({ qty: 2, grams: 200, kcal: 400, protein: 40 });
  });

  it('scales a meal receipt as a whole', () => {
    const { db } = setup();
    const meal = makeMeal();
    const a = makeFood({ kcalPerServing: 100, proteinPerServing: 10 });
    const b = makeFood({ kcalPerServing: 50, proteinPerServing: 5 });
    db.insert(schema.foods).values([a, b]).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values([makeMealItem({ mealId: meal.id, foodId: a.id }), makeMealItem({ mealId: meal.id, foodId: b.id })]).run();
    const receipt = logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id });

    const doubled = addPortion(db, { at: 2_000, receipt });
    expect(doubled.entries.map((e) => e.kcal).sort()).toEqual([100, 200]);
    expect(doubled.entries.map((e) => e.protein).sort()).toEqual([10, 20]);
  });

  it('applies the right factor on a third tap: portions 2 -> 3', () => {
    const { db } = setup();
    const food = makeFood({ kcalPerServing: 100, proteinPerServing: 10 });
    db.insert(schema.foods).values(food).run();
    const first = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    const second = addPortion(db, { at: 2_000, receipt: first });

    const third = addPortion(db, { at: 3_000, receipt: second });
    expect(third.portions).toBe(3);
    expect(third.entries[0]).toMatchObject({ qty: 3, kcal: 300, protein: 30 });
  });

  it('leaves the usage cache unchanged — it is still one pick', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    const before = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();

    addPortion(db, { at: 2_000, receipt });

    const after = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(after?.useCount).toBe(before?.useCount);
    expect(after?.lastUsedAt).toBe(before?.lastUsedAt);
    expect(after?.hourHistogram).toBe(before?.hourHistogram);
  });

  it('returns a revert undo that restores the exact previous values', () => {
    const { db } = setup();
    const food = makeFood({ kcalPerServing: 100, proteinPerServing: 10 });
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    const before = { ...receipt.entries[0]! };

    const doubled = addPortion(db, { at: 2_000, receipt });
    undo(db, { at: 3_000, token: doubled.undo });

    const row = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, before.id)).get();
    expect(row).toMatchObject({ qty: before.qty, grams: before.grams, kcal: before.kcal, protein: before.protein, slot: before.slot });
  });

  it('throws not_found when an entry in the receipt no longer exists', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    softDeleteLogEntries(db, { at: 2_000, ids: [receipt.entries[0]!.id] });

    expectDbError(() => addPortion(db, { at: 3_000, receipt }), 'not_found');
  });
});

// -------------------------------------------------------------------------------------------
// updateLogEntry
// -------------------------------------------------------------------------------------------

describe('updateLogEntry', () => {
  it('an exact grams amount round-trips: { grams: 137 } stores grams = 137', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: 170, kcalPerServing: 133, proteinPerServing: 17 });
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });

    const { entry } = updateLogEntry(db, { at: 2_000, id: receipt.entries[0]!.id, amount: { grams: 137 } });
    expect(entry.grams).toBe(137);
    expect(entry.kcal).toBeCloseTo(133 * (137 / 170), 10);
    expect(entry.protein).toBeCloseTo(17 * (137 / 170), 10);
  });

  it('rescales from the row’s own ratios, never from foods — still works after the food changes', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: 100, kcalPerServing: 200, proteinPerServing: 20 });
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id }); // qty 1, kcal 200, protein 20, grams 100
    db.update(schema.foods).set({ kcalPerServing: 999, proteinPerServing: 999, updatedAt: 1_500 }).where(eq(schema.foods.id, food.id)).run();

    const { entry } = updateLogEntry(db, { at: 2_000, id: receipt.entries[0]!.id, amount: { servings: 2 } });
    expect(entry).toMatchObject({ qty: 2, kcal: 400, protein: 40, grams: 200 });
  });

  it('still works after the food is tombstoned', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: 100, kcalPerServing: 200, proteinPerServing: 20 });
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    db.update(schema.foods).set({ deleted: 1, updatedAt: 1_500 }).where(eq(schema.foods.id, food.id)).run();

    expect(() => updateLogEntry(db, { at: 2_000, id: receipt.entries[0]!.id, amount: { servings: 3 } })).not.toThrow();
  });

  it('changes only the slot when no amount is given', () => {
    const { db } = setup();
    const food = makeFood({ kcalPerServing: 200, proteinPerServing: 20 });
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id, slot: 'breakfast' });

    const { entry } = updateLogEntry(db, { at: 2_000, id: receipt.entries[0]!.id, slot: 'dinner' });
    expect(entry).toMatchObject({ slot: 'dinner', qty: 1, kcal: 200, protein: 20 });
  });

  it('throws invalid_input updating by grams on an entry with no grams ratio', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: null });
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });

    expectDbError(() => updateLogEntry(db, { at: 2_000, id: receipt.entries[0]!.id, amount: { grams: 50 } }), 'invalid_input');
  });

  it('throws not_found for a missing entry', () => {
    const { db } = setup();
    expectDbError(() => updateLogEntry(db, { at: 1_000, id: 'no-such-entry' }), 'not_found');
  });

  it('throws not_found for a tombstoned entry', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    softDeleteLogEntries(db, { at: 2_000, ids: [receipt.entries[0]!.id] });

    expectDbError(() => updateLogEntry(db, { at: 3_000, id: receipt.entries[0]!.id, amount: { servings: 2 } }), 'not_found');
  });

  it('returns a revert undo that restores the exact previous row', () => {
    const { db } = setup();
    const food = makeFood({ servingGrams: 100, kcalPerServing: 200, proteinPerServing: 20 });
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    const before = { ...receipt.entries[0]! };

    const { undo: token } = updateLogEntry(db, { at: 2_000, id: before.id, amount: { grams: 55 } });
    undo(db, { at: 3_000, token });

    const row = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, before.id)).get();
    expect(row).toMatchObject({ qty: before.qty, grams: before.grams, kcal: before.kcal, protein: before.protein, slot: before.slot });
  });
});

// -------------------------------------------------------------------------------------------
// softDeleteLogEntries
// -------------------------------------------------------------------------------------------

describe('softDeleteLogEntries', () => {
  it('tombstones the row — it is never removed', () => {
    const { db, sqlite } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });

    softDeleteLogEntries(db, { at: 2_000, ids: [receipt.entries[0]!.id] });

    const row = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, receipt.entries[0]!.id)).get();
    expect(row?.deleted).toBe(1);
    expect(row?.updatedAt).toBe(2_000);
    const count = sqlite.prepare('select count(*) as n from food_log').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('recomputes the touched food’s usage cache', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });

    softDeleteLogEntries(db, { at: 2_000, ids: [receipt.entries[0]!.id] });

    const row = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(row?.useCount).toBe(0);
    expect(row?.lastUsedAt).toBeNull();
  });

  it('deletes a whole meal’s rows as one action and recomputes only the meal’s cache', () => {
    const { db } = setup();
    const meal = makeMeal();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();
    const receipt = logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id });

    softDeleteLogEntries(db, { at: 2_000, ids: receipt.entries.map((e) => e.id) });

    const mealRow = db.select().from(schema.meals).where(eq(schema.meals.id, meal.id)).get();
    const foodRow = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(mealRow?.useCount).toBe(0);
    expect(foodRow?.useCount).toBe(0); // was already 0: a meal log never touches its foods' caches
  });

  it('throws not_found for a missing id, leaving nothing tombstoned (atomic)', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });

    expectDbError(() => softDeleteLogEntries(db, { at: 2_000, ids: [receipt.entries[0]!.id, 'no-such-id'] }), 'not_found');

    const row = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, receipt.entries[0]!.id)).get();
    expect(row?.deleted).toBe(0);
  });

  it('throws not_found for an already-deleted id', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    softDeleteLogEntries(db, { at: 2_000, ids: [receipt.entries[0]!.id] });

    expectDbError(() => softDeleteLogEntries(db, { at: 3_000, ids: [receipt.entries[0]!.id] }), 'not_found');
  });

  it('returns a restore undo token with the same ids', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });

    const { undo: token } = softDeleteLogEntries(db, { at: 2_000, ids: [receipt.entries[0]!.id] });
    expect(token).toEqual({ kind: 'restore', logIds: [receipt.entries[0]!.id] });
  });
});

// -------------------------------------------------------------------------------------------
// undo
// -------------------------------------------------------------------------------------------

describe('undo', () => {
  it('unlog then round-trips the usage cache byte-identical to before logging', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const before = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();

    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    undo(db, { at: 2_000, token: receipt.undo });

    const after = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(after?.useCount).toBe(before?.useCount);
    expect(after?.lastUsedAt).toBe(before?.lastUsedAt);
    expect(after?.hourHistogram).toBe(before?.hourHistogram);
  });

  it('unlog tombstones the logged rows', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });

    undo(db, { at: 2_000, token: receipt.undo });

    const row = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, receipt.entries[0]!.id)).get();
    expect(row?.deleted).toBe(1);
  });

  it('restore un-tombstones the deleted rows and recomputes the cache exactly', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    const second = logFood(db, { at: 2_000, timeZone: LA, foodId: food.id });
    const beforeDelete = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();

    const { undo: token } = softDeleteLogEntries(db, { at: 3_000, ids: [second.entries[0]!.id] });
    undo(db, { at: 4_000, token });

    const after = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(after?.useCount).toBe(beforeDelete?.useCount);
    expect(after?.lastUsedAt).toBe(beforeDelete?.lastUsedAt);
    expect(after?.hourHistogram).toBe(beforeDelete?.hourHistogram);
  });

  it('is exact in any order, not only LIFO — undoing the first of two logs, not the last', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const first = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    logFood(db, { at: 2_000, timeZone: LA, foodId: food.id });

    undo(db, { at: 3_000, token: first.undo });

    const row = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(row?.useCount).toBe(1);
    expect(row?.lastUsedAt).toBe(2_000); // the surviving (second) log
  });

  it('recomputes the meal’s cache when undoing a meal log, not the constituent foods’', () => {
    const { db } = setup();
    const meal = makeMeal();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();
    const receipt = logMeal(db, { at: 1_000, timeZone: LA, mealId: meal.id });

    undo(db, { at: 2_000, token: receipt.undo });

    const mealRow = db.select().from(schema.meals).where(eq(schema.meals.id, meal.id)).get();
    expect(mealRow?.useCount).toBe(0);
    expect(mealRow?.lastUsedAt).toBeNull();
  });

  it('revert restores the exact previous literal values', () => {
    const { db } = setup();
    const food = makeFood({ kcalPerServing: 100, proteinPerServing: 10 });
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    const before = { ...receipt.entries[0]! };
    updateLogEntry(db, { at: 2_000, id: before.id, amount: { servings: 5 } });

    undo(db, { at: 3_000, token: { kind: 'revert', previous: [{ id: before.id, qty: before.qty, grams: before.grams, kcal: before.kcal, protein: before.protein, slot: before.slot }] } });

    const row = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, before.id)).get();
    expect(row).toMatchObject({ qty: before.qty, grams: before.grams, kcal: before.kcal, protein: before.protein, slot: before.slot });
  });

  it('is idempotent: a row already in the target state is left untouched, and a second call bumps nothing', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });

    undo(db, { at: 2_000, token: receipt.undo });
    const afterFirst = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, receipt.entries[0]!.id)).get();

    undo(db, { at: 3_000, token: receipt.undo });
    const afterSecond = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, receipt.entries[0]!.id)).get();

    // Second call is a no-op: updated_at is not bumped again.
    expect(afterSecond?.updatedAt).toBe(afterFirst?.updatedAt);
  });

  it('skips a logId that no longer exists rather than throwing', () => {
    const { db } = setup();
    expect(() => undo(db, { at: 1_000, token: { kind: 'unlog', logIds: ['never-existed'] } })).not.toThrow();
  });

  it('the toast can hold an older token: an earlier receipt still undoes correctly after a later one', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const first = logFood(db, { at: 1_000, timeZone: LA, foodId: food.id });
    const second = logFood(db, { at: 2_000, timeZone: LA, foodId: food.id });

    undo(db, { at: 3_000, token: second.undo });
    undo(db, { at: 4_000, token: first.undo });

    const row = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(row?.useCount).toBe(0);
    expect(row?.lastUsedAt).toBeNull();
    expect(row?.hourHistogram).toBeNull();
  });
});

// -------------------------------------------------------------------------------------------
// Performance — 400 seeded days, well under the 200ms budget.
// -------------------------------------------------------------------------------------------

describe('performance over 400 seeded days', () => {
  const END = '2025-03-09';

  it('quickAddCandidates returns in well under 200ms', () => {
    const seeded = makeSeededTestDb({ schema, days: 400, endDate: END });
    const db = seeded.db;

    quickAddCandidates(db, { at: Date.parse(`${END}T16:00:00.000Z`), timeZone: LA }); // warm
    const started = performance.now();
    const result = quickAddCandidates(db, { at: Date.parse(`${END}T16:00:00.000Z`), timeZone: LA });
    const elapsed = performance.now() - started;

    expect(result.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });

  it('todayTotals returns in well under 200ms', () => {
    const seeded = makeSeededTestDb({ schema, days: 400, endDate: END });
    const db = seeded.db;

    todayTotals(db, END); // warm
    const started = performance.now();
    todayTotals(db, END);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(200);
  });

  it('dayLog returns in well under 200ms', () => {
    const seeded = makeSeededTestDb({ schema, days: 400, endDate: END });
    const db = seeded.db;

    dayLog(db, END); // warm
    const started = performance.now();
    dayLog(db, END);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(200);
  });

  it('logFood on an already-seeded database returns in well under 200ms', () => {
    const seeded = makeSeededTestDb({ schema, days: 400, endDate: END });
    const db = seeded.db;
    const food = db.select().from(schema.foods).limit(1).get();
    if (!food) throw new Error('unreachable: seed always writes foods');

    const started = performance.now();
    logFood(db, { at: Date.parse(`${END}T16:00:00.000Z`), timeZone: LA, foodId: food.id });
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(200);
  });
});

/** Insert a bare-bones live food and return its id — for tests that only need a foreign key. */
function seedFood(db: ReturnType<typeof setup>['db'], overrides: Partial<Parameters<typeof makeFood>[0]> = {}): string {
  const food = makeFood(overrides);
  db.insert(schema.foods).values(food).run();
  return food.id;
}
