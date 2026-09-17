/**
 * Search, recents and create-and-log (issue #37) — against the binding contract on issue #17 §1.5
 * and §3 ("#24: search and log any food"). Every case here traces to #37's acceptance criteria:
 * word-prefix ranks above substring, case/accents ignored, archived and tombstoned rows excluded,
 * recents exclude the six, create-and-log is atomic, and the 500-food/50ms search budget.
 */
import { eq } from 'drizzle-orm';
import { performance } from 'node:perf_hooks';
import { makeTestDb } from '../../../test/db';
import { makeMeal, makeMealItem } from '../../../test/factories';
import { makeFood } from '../test-support/foods';
import { VitalsDbError, type VitalsDbErrorCode } from '../errors';
import * as schema from '../schema';
import type { FoodInput, MealCandidate } from '../types';
import { undo } from './nutrition';
import { createFoodAndLog, libraryByUsage, recentFoods, searchFoods, searchFoodsOnly } from './search';

const LA = 'America/Los_Angeles';
const AT = Date.parse('2025-03-09T16:00:00.000Z'); // 08:00 America/Los_Angeles

function setup() {
  const { db, sqlite } = makeTestDb({ schema });
  return { db, sqlite };
}

/**
 * `Meal` (`test/model.ts`) doesn't carry the usage-cache columns yet — same gap `nutrition.test.ts`
 * documents its own copy of this helper against (issue #17 deviation 6: `use_count`/`last_used_at`
 * landed on the schema without a matching update to the qa-owned factory type). `schema.meals`'s
 * own insert type has them, so splicing them onto a factory-built row after the fact is exactly as
 * valid an insert as the factory's own fields.
 */
function makeMealWithUsage(
  overrides: Partial<Parameters<typeof makeMeal>[0]> & { useCount?: number; lastUsedAt?: number | null } = {},
): typeof schema.meals.$inferInsert {
  const { useCount, lastUsedAt, ...rest } = overrides;
  return {
    ...makeMeal(rest),
    ...(useCount !== undefined ? { useCount } : {}),
    ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
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
// searchFoods
// -------------------------------------------------------------------------------------------

describe('searchFoods', () => {
  it('on an empty database, returns []', () => {
    const { db } = setup();
    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'anything' })).toEqual([]);
  });

  it('a blank query returns [] — the empty state is recentFoods', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ name: 'Porridge oats' })).run();
    expect(searchFoods(db, { at: AT, timeZone: LA, query: '' })).toEqual([]);
    expect(searchFoods(db, { at: AT, timeZone: LA, query: '   ' })).toEqual([]);
  });

  it('word-prefix ranks above substring', () => {
    const { db } = setup();
    // "app" is a word start in "Apple pie" but only a mid-word substring in "Pineapple".
    const midWord = makeFood({ name: 'Pineapple' });
    const wordStart = makeFood({ name: 'Apple pie' });
    db.insert(schema.foods).values([midWord, wordStart]).run();

    const result = searchFoods(db, { at: AT, timeZone: LA, query: 'app' });
    expect(result.map((c) => c.name)).toEqual(['Apple pie', 'Pineapple']);
  });

  it('case and accents are ignored: "creme" finds "Crème fraîche"', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Crème fraîche' });
    db.insert(schema.foods).values(food).run();

    const result = searchFoods(db, { at: AT, timeZone: LA, query: 'creme' });
    expect(result.map((c) => c.id)).toEqual([food.id]);
  });

  it('is case-insensitive the other way too: an upper-case query finds a lower-case name', () => {
    const { db } = setup();
    const food = makeFood({ name: 'porridge oats' });
    db.insert(schema.foods).values(food).run();
    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'PORRIDGE' }).map((c) => c.id)).toEqual([food.id]);
  });

  it('matches brand as well as name', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Greek yoghurt', brand: 'Fage' });
    db.insert(schema.foods).values(food).run();
    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'fage' }).map((c) => c.id)).toEqual([food.id]);
  });

  it('every whitespace-separated token must match', () => {
    const { db } = setup();
    const both = makeFood({ name: 'Greek yoghurt', brand: 'Fage' });
    const onlyOne = makeFood({ name: 'Greek salad' });
    db.insert(schema.foods).values([both, onlyOne]).run();

    const result = searchFoods(db, { at: AT, timeZone: LA, query: 'greek fage' });
    expect(result.map((c) => c.id)).toEqual([both.id]);
  });

  it('excludes archived foods', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ name: 'Archived oats', archived: 1 })).run();
    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'oats' })).toEqual([]);
  });

  it('excludes tombstoned foods', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ name: 'Deleted oats', deleted: 1 })).run();
    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'oats' })).toEqual([]);
  });

  it('excludes tombstoned meals', () => {
    const { db } = setup();
    const food = makeFood({ archived: 1 }); // isolate the meal exclusion from its own food candidate
    const meal = makeMeal({ name: 'Usual oats breakfast', deleted: 1 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'oats' })).toEqual([]);
  });

  it('excludes a meal with no live items — all items tombstoned', () => {
    const { db } = setup();
    const food = makeFood({ archived: 1 });
    const meal = makeMeal({ name: 'Usual oats breakfast' });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id, deleted: 1 })).run();

    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'oats' })).toEqual([]);
  });

  it('excludes a meal whose only item points at a tombstoned food', () => {
    const { db } = setup();
    const food = makeFood({ deleted: 1 });
    const meal = makeMeal({ name: 'Usual oats breakfast' });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'oats' })).toEqual([]);
  });

  it('a live meal matches by name and comes back as a MealCandidate, aggregated from current food values', () => {
    const { db } = setup();
    const oats = makeFood({ name: 'Oats', kcalPerServing: 200, proteinPerServing: 8 });
    const milk = makeFood({ name: 'Milk', kcalPerServing: 100, proteinPerServing: 7 });
    const meal = makeMeal({ name: 'Usual breakfast' });
    db.insert(schema.foods).values([oats, milk]).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems)
      .values([
        makeMealItem({ mealId: meal.id, foodId: oats.id, qty: 1 }),
        makeMealItem({ mealId: meal.id, foodId: milk.id, qty: 2 }),
      ])
      .run();

    const result = searchFoods(db, { at: AT, timeZone: LA, query: 'usual' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'meal',
      id: meal.id,
      kcal: 200 + 200,
      protein: 8 + 14,
      itemCount: 2,
    } satisfies Partial<MealCandidate>);
  });

  it('both foods and meals can match the same query, both as Candidate', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Chicken breast' });
    const meal = makeMeal({ name: 'Chicken and rice' });
    const other = makeFood({ name: 'Rice', archived: 1 }); // just a meal item, isolated from the grid
    db.insert(schema.foods).values([food, other]).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: other.id })).run();

    const result = searchFoods(db, { at: AT, timeZone: LA, query: 'chicken' });
    expect(result.map((c) => ({ kind: c.kind, id: c.id })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { kind: 'food' as const, id: food.id },
        { kind: 'meal' as const, id: meal.id },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it('ties within a tier break by the quick-add score, then name, then id', () => {
    const { db } = setup();
    // Same tier (both word-start), different use_count: the higher-scoring one sorts first.
    const heavilyUsed = makeFood({ name: 'App heavy', useCount: 10, lastUsedAt: AT });
    const neverUsed = makeFood({ name: 'App light', useCount: 0, lastUsedAt: null });
    db.insert(schema.foods).values([neverUsed, heavilyUsed]).run();

    const result = searchFoods(db, { at: AT, timeZone: LA, query: 'app' });
    expect(result.map((c) => c.id)).toEqual([heavilyUsed.id, neverUsed.id]);
  });

  it('ties on tier and score break by name, then id', () => {
    const { db } = setup();
    const banana = makeFood({ name: 'App Banana' });
    const apple = makeFood({ name: 'App Apple' });
    db.insert(schema.foods).values([banana, apple]).run();

    const result = searchFoods(db, { at: AT, timeZone: LA, query: 'app' });
    expect(result.map((c) => c.name)).toEqual(['App Apple', 'App Banana']);
  });

  it('limit defaults to 20', () => {
    const { db } = setup();
    for (let i = 0; i < 25; i += 1) {
      db.insert(schema.foods).values(makeFood({ name: `Oats variant ${i}` })).run();
    }
    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'oats' })).toHaveLength(20);
  });

  it('respects an explicit limit', () => {
    const { db } = setup();
    for (let i = 0; i < 5; i += 1) {
      db.insert(schema.foods).values(makeFood({ name: `Oats variant ${i}` })).run();
    }
    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'oats', limit: 3 })).toHaveLength(3);
  });

  it('a typed "%" is literal, not a wildcard', () => {
    const { db } = setup();
    const literalMatch = makeFood({ name: '50% Cocoa bar' });
    // If "%" were a LIKE wildcard, "50%cocoa" would also match this decoy via the wildcard's
    // "any characters" behaviour — it must not.
    const decoy = makeFood({ name: '50X Cocoa bar' });
    db.insert(schema.foods).values([literalMatch, decoy]).run();

    const result = searchFoods(db, { at: AT, timeZone: LA, query: '50%' });
    expect(result.map((c) => c.id)).toEqual([literalMatch.id]);
  });

  it('a typed "_" is literal, not a single-character wildcard', () => {
    const { db } = setup();
    const literalMatch = makeFood({ name: 'a_b testfood' });
    const decoy = makeFood({ name: 'aXb testfood' });
    db.insert(schema.foods).values([literalMatch, decoy]).run();

    const result = searchFoods(db, { at: AT, timeZone: LA, query: 'a_b' });
    expect(result.map((c) => c.id)).toEqual([literalMatch.id]);
  });
});

// -------------------------------------------------------------------------------------------
// searchFoodsOnly — issue #98: the meal-ingredient picker searches the whole food library, never
// meals. Same fold/tokenise/tier/ranking rules as searchFoods (shared implementation) — this suite
// only re-proves the two things a foods-only caller adds on top: meals never come back, and the
// result is a plain FoodCandidate (a serving amount to show, not a Candidate union to narrow).
// -------------------------------------------------------------------------------------------

describe('searchFoodsOnly', () => {
  it('on an empty database, returns []', () => {
    const { db } = setup();
    expect(searchFoodsOnly(db, { at: AT, timeZone: LA, query: 'anything' })).toEqual([]);
  });

  it('a blank query returns [] — the empty state is recentFoods', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ name: 'Porridge oats' })).run();
    expect(searchFoodsOnly(db, { at: AT, timeZone: LA, query: '' })).toEqual([]);
    expect(searchFoodsOnly(db, { at: AT, timeZone: LA, query: '   ' })).toEqual([]);
  });

  it('matches a food by name', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Porridge oats' });
    db.insert(schema.foods).values(food).run();
    expect(searchFoodsOnly(db, { at: AT, timeZone: LA, query: 'oats' }).map((c) => c.id)).toEqual([food.id]);
  });

  it('a live meal matching the query is never returned — foods only, per the #98 ruling', () => {
    const { db } = setup();
    const food = makeFood({ archived: 1 }); // isolate the meal exclusion from its own food candidate
    const meal = makeMeal({ name: 'Usual oats breakfast' });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    expect(searchFoodsOnly(db, { at: AT, timeZone: LA, query: 'oats' })).toEqual([]);
  });

  it('when a food and a meal both match, only the food comes back', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Chicken breast' });
    const meal = makeMeal({ name: 'Chicken and rice' });
    const other = makeFood({ name: 'Rice', archived: 1 });
    db.insert(schema.foods).values([food, other]).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: other.id })).run();

    const result = searchFoodsOnly(db, { at: AT, timeZone: LA, query: 'chicken' });
    expect(result.map((c) => ({ kind: c.kind, id: c.id }))).toEqual([{ kind: 'food', id: food.id }]);
  });

  it('excludes archived foods', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ name: 'Archived oats', archived: 1 })).run();
    expect(searchFoodsOnly(db, { at: AT, timeZone: LA, query: 'oats' })).toEqual([]);
  });

  it('excludes tombstoned foods', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ name: 'Deleted oats', deleted: 1 })).run();
    expect(searchFoodsOnly(db, { at: AT, timeZone: LA, query: 'oats' })).toEqual([]);
  });

  it('word-prefix ranks above substring, same as searchFoods', () => {
    const { db } = setup();
    const midWord = makeFood({ name: 'Pineapple' });
    const wordStart = makeFood({ name: 'Apple pie' });
    db.insert(schema.foods).values([midWord, wordStart]).run();

    const result = searchFoodsOnly(db, { at: AT, timeZone: LA, query: 'app' });
    expect(result.map((c) => c.name)).toEqual(['Apple pie', 'Pineapple']);
  });

  it('returns the serving shape an ingredient amount control needs', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Oats', basis: 'weight', servingAmount: 40, kcalPerServing: 150, proteinPerServing: 5 });
    db.insert(schema.foods).values(food).run();

    const [result] = searchFoodsOnly(db, { at: AT, timeZone: LA, query: 'oats' });
    expect(result).toMatchObject({
      kind: 'food',
      basis: 'weight',
      servingAmount: 40,
      servingGrams: 40,
      servingMl: null,
      kcal: 150,
      protein: 5,
    });
  });

  it('limit defaults to 20', () => {
    const { db } = setup();
    for (let i = 0; i < 25; i += 1) {
      db.insert(schema.foods).values(makeFood({ name: `Oats variant ${i}` })).run();
    }
    expect(searchFoodsOnly(db, { at: AT, timeZone: LA, query: 'oats' })).toHaveLength(20);
  });

  it('respects an explicit limit', () => {
    const { db } = setup();
    for (let i = 0; i < 5; i += 1) {
      db.insert(schema.foods).values(makeFood({ name: `Oats variant ${i}` })).run();
    }
    expect(searchFoodsOnly(db, { at: AT, timeZone: LA, query: 'oats', limit: 3 })).toHaveLength(3);
  });
});

// -------------------------------------------------------------------------------------------
// recentFoods
// -------------------------------------------------------------------------------------------

describe('recentFoods', () => {
  it('on an empty database, returns []', () => {
    const { db } = setup();
    expect(recentFoods(db, { at: AT, timeZone: LA, days: 14 })).toEqual([]);
  });

  it('returns a directly-logged food, newest last-log first', () => {
    const { db } = setup();
    const older = makeFood({ name: 'Older food' });
    const newer = makeFood({ name: 'Newer food' });
    db.insert(schema.foods).values([older, newer]).run();
    db.insert(schema.foodLog)
      .values([
        { id: 'log-1', updatedAt: AT, deleted: 0, loggedAt: AT - 60_000, localDate: '2025-03-09', localMinute: 480, foodId: older.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' },
        { id: 'log-2', updatedAt: AT, deleted: 0, loggedAt: AT, localDate: '2025-03-09', localMinute: 500, foodId: newer.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' },
      ])
      .run();

    const result = recentFoods(db, { at: AT, timeZone: LA, days: 14 });
    expect(result.map((c) => c.id)).toEqual([newer.id, older.id]);
  });

  it('a meal logged via logMeal appears as a meal, not as its constituent food', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Oats' });
    const meal = makeMeal({ name: 'Usual breakfast' });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();
    db.insert(schema.foodLog)
      .values({ id: 'log-1', updatedAt: AT, deleted: 0, loggedAt: AT, localDate: '2025-03-09', localMinute: 480, foodId: food.id, mealId: meal.id, qty: 1, grams: null, kcal: 200, protein: 8, slot: 'breakfast' })
      .run();

    const result = recentFoods(db, { at: AT, timeZone: LA, days: 14 });
    expect(result).toEqual([expect.objectContaining({ kind: 'meal', id: meal.id })]);
  });

  it('distinct: a food logged twice appears once, at its most recent log', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Oats' });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.foodLog)
      .values([
        { id: 'log-1', updatedAt: AT, deleted: 0, loggedAt: AT - 86_400_000, localDate: '2025-03-08', localMinute: 480, foodId: food.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' },
        { id: 'log-2', updatedAt: AT, deleted: 0, loggedAt: AT, localDate: '2025-03-09', localMinute: 480, foodId: food.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' },
      ])
      .run();

    expect(recentFoods(db, { at: AT, timeZone: LA, days: 14 })).toHaveLength(1);
  });

  it('the window is [localDateOf(at) - (days - 1), localDateOf(at)] by local_date — a log just inside counts, one day earlier does not', () => {
    const { db } = setup();
    const inWindow = makeFood({ name: 'In window' });
    const outOfWindow = makeFood({ name: 'Out of window' });
    db.insert(schema.foods).values([inWindow, outOfWindow]).run();
    // at = 2025-03-09 08:00 America/Los_Angeles; days: 3 -> window is [2025-03-07, 2025-03-09].
    db.insert(schema.foodLog)
      .values([
        { id: 'log-in', updatedAt: AT, deleted: 0, loggedAt: AT, localDate: '2025-03-07', localMinute: 480, foodId: inWindow.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' },
        { id: 'log-out', updatedAt: AT, deleted: 0, loggedAt: AT, localDate: '2025-03-06', localMinute: 480, foodId: outOfWindow.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' },
      ])
      .run();

    const result = recentFoods(db, { at: AT, timeZone: LA, days: 3 });
    expect(result.map((c) => c.id)).toEqual([inWindow.id]);
  });

  it('a 23:55 log and a 00:05 log the next UTC day land on the local_date they were written with', () => {
    const { db } = setup();
    const lateNight = makeFood({ name: 'Late night snack' });
    db.insert(schema.foods).values(lateNight).run();
    // 2025-03-09 is the spring-forward cut for America/Los_Angeles, so by 23:55 that evening the
    // zone is already PDT (UTC-7): 2025-03-09 23:55 local is 2025-03-10 06:55 UTC.
    const loggedAt = Date.parse('2025-03-10T06:55:00.000Z');
    db.insert(schema.foodLog)
      .values({ id: 'log-late', updatedAt: loggedAt, deleted: 0, loggedAt, localDate: '2025-03-09', localMinute: 23 * 60 + 55, foodId: lateNight.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'snack' })
      .run();

    // "Today" a few minutes later, still 2025-03-09 local — the row must be in range.
    const nowAt = Date.parse('2025-03-10T06:59:00.000Z');
    const result = recentFoods(db, { at: nowAt, timeZone: LA, days: 1 });
    expect(result.map((c) => c.id)).toEqual([lateNight.id]);
  });

  it('excludes an archived food even if it was logged in the window', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Archived', archived: 1 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.foodLog)
      .values({ id: 'log-1', updatedAt: AT, deleted: 0, loggedAt: AT, localDate: '2025-03-09', localMinute: 480, foodId: food.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' })
      .run();

    expect(recentFoods(db, { at: AT, timeZone: LA, days: 14 })).toEqual([]);
  });

  it('excludes a tombstoned meal even if it was logged in the window', () => {
    const { db } = setup();
    const food = makeFood({ archived: 1 });
    const meal = makeMeal({ name: 'Deleted meal', deleted: 1 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();
    db.insert(schema.foodLog)
      .values({ id: 'log-1', updatedAt: AT, deleted: 0, loggedAt: AT, localDate: '2025-03-09', localMinute: 480, foodId: food.id, mealId: meal.id, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' })
      .run();

    expect(recentFoods(db, { at: AT, timeZone: LA, days: 14 })).toEqual([]);
  });

  it('excludes a meal with no live items even if it was logged in the window', () => {
    const { db } = setup();
    const food = makeFood({ archived: 1 });
    const meal = makeMeal({ name: 'Emptied meal' });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id, deleted: 1 })).run();
    db.insert(schema.foodLog)
      .values({ id: 'log-1', updatedAt: AT, deleted: 0, loggedAt: AT, localDate: '2025-03-09', localMinute: 480, foodId: food.id, mealId: meal.id, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' })
      .run();

    expect(recentFoods(db, { at: AT, timeZone: LA, days: 14 })).toEqual([]);
  });

  it('excludes a soft-deleted log entry — a deleted log is not a recent use', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Undone' });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.foodLog)
      .values({ id: 'log-1', updatedAt: AT, deleted: 1, loggedAt: AT, localDate: '2025-03-09', localMinute: 480, foodId: food.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' })
      .run();

    expect(recentFoods(db, { at: AT, timeZone: LA, days: 14 })).toEqual([]);
  });

  it('issue #95: a food on the quick-add grid still appears in Recent — no exclusion', () => {
    const { db } = setup();
    const gridFood = makeFood({ name: 'On the grid' });
    const otherFood = makeFood({ name: 'Not on the grid' });
    db.insert(schema.foods).values([gridFood, otherFood]).run();
    db.insert(schema.foodLog)
      .values([
        { id: 'log-1', updatedAt: AT, deleted: 0, loggedAt: AT - 1_000, localDate: '2025-03-09', localMinute: 480, foodId: gridFood.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' },
        { id: 'log-2', updatedAt: AT, deleted: 0, loggedAt: AT, localDate: '2025-03-09', localMinute: 480, foodId: otherFood.id, mealId: null, qty: 1, grams: null, kcal: 100, protein: 5, slot: 'breakfast' },
      ])
      .run();

    // The ruling on #95 is that Recent never excludes grid items.
    const result = recentFoods(db, { at: AT, timeZone: LA, days: 14 });
    expect(result.map((c) => c.id)).toEqual([otherFood.id, gridFood.id]);
  });

  it('limit defaults to 20', () => {
    const { db } = setup();
    const rows = Array.from({ length: 25 }, (_, i) => makeFood({ name: `Food ${i}` }));
    db.insert(schema.foods).values(rows).run();
    db.insert(schema.foodLog)
      .values(
        rows.map((food, i) => ({
          id: `log-${i}`,
          updatedAt: AT,
          deleted: 0,
          loggedAt: AT - i * 1_000,
          localDate: '2025-03-09',
          localMinute: 480,
          foodId: food.id,
          mealId: null,
          qty: 1,
          grams: null,
          kcal: 100,
          protein: 5,
          slot: 'breakfast' as const,
        })),
      )
      .run();

    expect(recentFoods(db, { at: AT, timeZone: LA, days: 14 })).toHaveLength(20);
  });

  it('respects an explicit limit', () => {
    const { db } = setup();
    const rows = Array.from({ length: 5 }, (_, i) => makeFood({ name: `Food ${i}` }));
    db.insert(schema.foods).values(rows).run();
    db.insert(schema.foodLog)
      .values(
        rows.map((food, i) => ({
          id: `log-${i}`,
          updatedAt: AT,
          deleted: 0,
          loggedAt: AT - i * 1_000,
          localDate: '2025-03-09',
          localMinute: 480,
          foodId: food.id,
          mealId: null,
          qty: 1,
          grams: null,
          kcal: 100,
          protein: 5,
          slot: 'breakfast' as const,
        })),
      )
      .run();

    expect(recentFoods(db, { at: AT, timeZone: LA, days: 14, limit: 2 })).toHaveLength(2);
  });
});

// -------------------------------------------------------------------------------------------
// libraryByUsage — issue #96 ruling: with no query, if nothing was logged in the recent-days
// window but the library has foods or meals, the blank-query list falls back to the whole
// library, most used first. It is never blank while any food exists.
// -------------------------------------------------------------------------------------------

describe('libraryByUsage', () => {
  it('on an empty database, returns []', () => {
    const { db } = setup();
    expect(libraryByUsage(db, {})).toEqual([]);
  });

  it('an archived-only library (no live food or meal) returns []', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ name: 'Archived', archived: 1 })).run();
    expect(libraryByUsage(db, {})).toEqual([]);
  });

  it('a food with all-zero use counts still appears — "the whole library" includes never-used items', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Never logged', useCount: 0, lastUsedAt: null });
    db.insert(schema.foods).values(food).run();

    const result = libraryByUsage(db, {});
    expect(result.map((c) => c.id)).toEqual([food.id]);
  });

  it('orders by use_count descending', () => {
    const { db } = setup();
    const lessUsed = makeFood({ name: 'Less used', useCount: 1 });
    const moreUsed = makeFood({ name: 'More used', useCount: 5 });
    db.insert(schema.foods).values([lessUsed, moreUsed]).run();

    const result = libraryByUsage(db, {});
    expect(result.map((c) => c.id)).toEqual([moreUsed.id, lessUsed.id]);
  });

  it('ties on use_count are broken by last_used_at descending, most recent first', () => {
    const { db } = setup();
    const older = makeFood({ name: 'Older use', useCount: 3, lastUsedAt: AT - 10_000 });
    const newer = makeFood({ name: 'Newer use', useCount: 3, lastUsedAt: AT });
    db.insert(schema.foods).values([older, newer]).run();

    const result = libraryByUsage(db, {});
    expect(result.map((c) => c.id)).toEqual([newer.id, older.id]);
  });

  it('a null last_used_at sorts after any real timestamp at the same use_count', () => {
    const { db } = setup();
    // Both start at use_count 0 by default, so a never-used food's null last_used_at must not
    // out-rank a used food's real timestamp were use_count ever to tie some other way.
    const neverUsed = makeFood({ name: 'Never used', useCount: 2, lastUsedAt: null });
    const used = makeFood({ name: 'Used once', useCount: 2, lastUsedAt: AT - 1_000 });
    db.insert(schema.foods).values([neverUsed, used]).run();

    const result = libraryByUsage(db, {});
    expect(result.map((c) => c.id)).toEqual([used.id, neverUsed.id]);
  });

  it('ties on use_count and last_used_at are broken by name, then id', () => {
    const { db } = setup();
    const a = makeFood({ id: 'food-a', name: 'Same name', useCount: 0, lastUsedAt: null });
    const b = makeFood({ id: 'food-b', name: 'Same name', useCount: 0, lastUsedAt: null });
    db.insert(schema.foods).values([b, a]).run();

    const result = libraryByUsage(db, {});
    expect(result.map((c) => c.id)).toEqual(['food-a', 'food-b']);
  });

  it('excludes an archived food', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Archived', archived: 1, useCount: 9 });
    db.insert(schema.foods).values(food).run();
    expect(libraryByUsage(db, {})).toEqual([]);
  });

  it('excludes a tombstoned food', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Deleted', deleted: 1, useCount: 9 });
    db.insert(schema.foods).values(food).run();
    expect(libraryByUsage(db, {})).toEqual([]);
  });

  it('includes a saved meal with at least one live item', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Oats' });
    const meal = makeMealWithUsage({ name: 'Usual breakfast', useCount: 2 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    const result = libraryByUsage(db, {});
    expect(result).toContainEqual(expect.objectContaining({ kind: 'meal', id: meal.id }));
  });

  it('excludes a meal whose every item is deleted (no live item)', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Oats' });
    const meal = makeMealWithUsage({ name: 'Emptied meal', useCount: 9 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id, deleted: 1 })).run();

    const result = libraryByUsage(db, {});
    expect(result.find((c) => c.id === meal.id)).toBeUndefined();
  });

  it('excludes a tombstoned meal even with a live item', () => {
    const { db } = setup();
    // Archived so only the meal itself is under test here — same pattern `recentFoods`'s own
    // equivalent case uses.
    const food = makeFood({ name: 'Oats', archived: 1 });
    const meal = makeMealWithUsage({ name: 'Deleted meal', deleted: 1, useCount: 9 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    expect(libraryByUsage(db, {})).toEqual([]);
  });

  it('foods and meals are ranked together by the same use_count/last_used_at order', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Low use food', useCount: 1 });
    const meal = makeMealWithUsage({ name: 'High use meal', useCount: 5 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    const result = libraryByUsage(db, {});
    expect(result.map((c) => c.id)).toEqual([meal.id, food.id]);
  });

  it('limit defaults to 20', () => {
    const { db } = setup();
    const rows = Array.from({ length: 25 }, (_, i) => makeFood({ name: `Food ${i}`, useCount: i }));
    db.insert(schema.foods).values(rows).run();

    expect(libraryByUsage(db, {})).toHaveLength(20);
  });

  it('respects an explicit limit', () => {
    const { db } = setup();
    const rows = Array.from({ length: 5 }, (_, i) => makeFood({ name: `Food ${i}`, useCount: i }));
    db.insert(schema.foods).values(rows).run();

    expect(libraryByUsage(db, { limit: 2 })).toHaveLength(2);
  });
});

// -------------------------------------------------------------------------------------------
// createFoodAndLog
// -------------------------------------------------------------------------------------------

describe('createFoodAndLog', () => {
  // 2 cakes = 18 g, 70 kcal and 1.5 g protein a serving — expressed per 100 g, the way the packet
  // prints it and the way `foods` now stores it (#86).
  const VALID_FOOD: FoodInput = {
    name: 'Rice cakes',
    basis: 'weight',
    servingLabel: '2 cakes',
    servingAmount: 18,
    kcalPer100: (70 * 100) / 18,
    proteinPer100: (1.5 * 100) / 18,
  };

  it('inserts the food and logs one serving by default', () => {
    const { db } = setup();
    const { food, receipt } = createFoodAndLog(db, { at: AT, timeZone: LA, food: VALID_FOOD });

    expect(food).toMatchObject({ ...VALID_FOOD, kcalPerServing: 70, proteinPerServing: 1.5 });
    expect(receipt.entries).toHaveLength(1);
    expect(receipt.entries[0]).toMatchObject({ foodId: food.id, qty: 1, kcal: 70, protein: 1.5 });
    expect(receipt.undo).toEqual({ kind: 'unlog', logIds: [receipt.entries[0]?.id] });

    const stored = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(stored?.useCount).toBe(1);
  });

  it('logs a specific amount when given', () => {
    const { db } = setup();
    const { receipt } = createFoodAndLog(db, { at: AT, timeZone: LA, food: VALID_FOOD, amount: { grams: 36 } });
    expect(receipt.entries[0]).toMatchObject({ qty: 2, grams: 36, kcal: 140, protein: 3 });
  });

  it('infers the slot from local time when none is given', () => {
    const { db } = setup(); // AT is 08:00 America/Los_Angeles -> breakfast
    const { receipt } = createFoodAndLog(db, { at: AT, timeZone: LA, food: VALID_FOOD });
    expect(receipt.entries[0]?.slot).toBe('breakfast');
  });

  it('an explicit slot overrides inference', () => {
    const { db } = setup();
    const { receipt } = createFoodAndLog(db, { at: AT, timeZone: LA, food: VALID_FOOD, slot: 'dinner' });
    expect(receipt.entries[0]?.slot).toBe('dinner');
  });

  it('is atomic: invalid food input throws invalid_input and inserts no food', () => {
    const { db } = setup();
    expectDbError(
      () => createFoodAndLog(db, { at: AT, timeZone: LA, food: { ...VALID_FOOD, name: '  ' } }),
      'invalid_input',
    );
    expect(db.select().from(schema.foods).all()).toEqual([]);
  });

  it('is atomic: an invalid amount throws invalid_input and leaves no orphan food', () => {
    const { db } = setup();
    // A volume food cannot be logged in grams — `resolveAmount` rejects it before anything is written.
    const byVolume: FoodInput = { ...VALID_FOOD, basis: 'volume' };
    expectDbError(
      () => createFoodAndLog(db, { at: AT, timeZone: LA, food: byVolume, amount: { grams: 50 } }),
      'invalid_input',
    );
    expect(db.select().from(schema.foods).all()).toEqual([]);
    expect(db.select().from(schema.foodLog).all()).toEqual([]);
  });

  it('undoing the receipt removes the log and keeps the food, with use stats reset to zero', () => {
    const { db } = setup();
    const { food, receipt } = createFoodAndLog(db, { at: AT, timeZone: LA, food: VALID_FOOD });

    undo(db, { at: AT + 1_000, token: receipt.undo });

    const storedFood = db.select().from(schema.foods).where(eq(schema.foods.id, food.id)).get();
    expect(storedFood).toBeDefined();
    expect(storedFood?.deleted).toBe(0);
    expect(storedFood?.useCount).toBe(0);
    expect(storedFood?.lastUsedAt).toBeNull();
    expect(storedFood?.hourHistogram).toBeNull();

    const storedLog = db.select().from(schema.foodLog).where(eq(schema.foodLog.foodId, food.id)).get();
    expect(storedLog?.deleted).toBe(1);
  });

  it('the new food is searchable immediately — search_text comes from the insert trigger', () => {
    const { db } = setup();
    const { food } = createFoodAndLog(db, { at: AT, timeZone: LA, food: { ...VALID_FOOD, name: 'Crème brûlée' } });
    expect(searchFoods(db, { at: AT, timeZone: LA, query: 'creme brulee' }).map((c) => c.id)).toEqual([food.id]);
  });
});

// -------------------------------------------------------------------------------------------
// Performance — search over 500 foods, well under 50ms.
// -------------------------------------------------------------------------------------------

describe('performance', () => {
  it('searchFoods over 500 foods returns in well under 50ms', () => {
    const { db } = setup();
    const rows = Array.from({ length: 500 }, (_, i) => makeFood({ name: `Catalogue food number ${i}`, useCount: i % 7, lastUsedAt: i % 7 > 0 ? AT - i * 1_000 : null }));
    db.insert(schema.foods).values(rows).run();

    searchFoods(db, { at: AT, timeZone: LA, query: 'food' }); // warm
    const started = performance.now();
    const result = searchFoods(db, { at: AT, timeZone: LA, query: 'food' });
    const elapsed = performance.now() - started;

    expect(result.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });

  it('libraryByUsage over 500 foods returns in well under 50ms', () => {
    const { db } = setup();
    const rows = Array.from({ length: 500 }, (_, i) => makeFood({ name: `Catalogue food number ${i}`, useCount: i % 7, lastUsedAt: i % 7 > 0 ? AT - i * 1_000 : null }));
    db.insert(schema.foods).values(rows).run();

    libraryByUsage(db, {}); // warm
    const started = performance.now();
    const result = libraryByUsage(db, {});
    const elapsed = performance.now() - started;

    expect(result.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });
});
