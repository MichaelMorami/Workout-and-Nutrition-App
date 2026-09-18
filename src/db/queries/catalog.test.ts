/**
 * The catalogue and meals — issue #36's acceptance criteria: `createFood`, `updateFood`,
 * `setFoodArchived`, `getFood`, `listFoods` (live, name order; archived only when asked);
 * `createMeal`, `listMeals`, `getMeal`. Plus: editing a food never changes past `food_log` rows,
 * and archived foods leave `listFoods` but their logs stay.
 *
 * Issue #153 (the data-layer slice of #100) adds `mealsContainingFood` — the saved meals that
 * still reference a food, live meals and live items only — and confirms `setFoodArchived` is
 * already an undo-able path: archiving hides a food from the grid, search and recents;
 * un-archiving (the same function, `archived: false`) restores it to all three, and neither
 * direction ever touches a past `food_log` row.
 *
 * Issue #154 (the data-layer slice of #101) adds `updateMeal` (rename and/or replace the item
 * set in one transaction — add/remove/change are all the same "give me the new list" write) and
 * `deleteMeal` (tombstones the meal and its live items). `restoreMeal` is the undo path deleteMeal
 * needs: it takes back exactly the item ids that call tombstoned, never an item an earlier
 * `updateMeal` already removed on purpose. Both `updateMeal` and `deleteMeal` never touch
 * `food_log` — a row logged from a meal already holds its own literal `kcal`/`protein`.
 */
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '../../../test/db';
import { makeMeal, makeMealItem } from '../../../test/factories';
import { makeFood } from '../test-support/foods';
import { VitalsDbError, type VitalsDbErrorCode } from '../errors';
import * as schema from '../schema';
import type { FoodBasis } from '../schema';
import { quickAddCandidates, dayLog, logFood, logMeal, todayTotals } from './nutrition';
import { recentFoods, searchFoods, searchFoodsOnly } from './search';
import {
  createFood,
  createMeal,
  deleteMeal,
  getFood,
  getMeal,
  listFoods,
  listMeals,
  mealsContainingFood,
  restoreMeal,
  setFoodArchived,
  updateFood,
  updateMeal,
} from './catalog';

function setup() {
  const { db } = makeTestDb({ schema });
  return { db };
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
// createFood
// -------------------------------------------------------------------------------------------

describe('createFood', () => {
  it('inserts a food with sync fields and a zeroed usage cache', () => {
    const { db } = setup();
    const row = createFood(db, {
      at: 1_000,
      food: {
        name: 'Skyr',
        brand: 'Arla',
        basis: 'weight',
        servingLabel: '1 pot',
        servingAmount: 170,
        kcalPer100: (120 * 100) / 170,
        proteinPer100: (15 * 100) / 170,
      },
    });

    expect(row).toMatchObject({
      name: 'Skyr',
      brand: 'Arla',
      basis: 'weight',
      servingLabel: '1 pot',
      servingAmount: 170,
      // Derived, never stored — and snapped back to the numbers the packet prints.
      servingGrams: 170,
      servingMl: null,
      kcalPerServing: 120,
      proteinPerServing: 15,
      archived: 0,
      deleted: 0,
      updatedAt: 1_000,
      useCount: 0,
      lastUsedAt: null,
    });
    expect(typeof row.id).toBe('string');
  });

  it('defaults brand to null when omitted, and a volume food has no serving grams', () => {
    const { db } = setup();
    const row = createFood(db, {
      at: 1_000,
      food: { name: 'Black coffee', basis: 'volume', servingLabel: '1 cup', servingAmount: 250, kcalPer100: 0.8, proteinPer100: 0.12 },
    });
    expect(row.brand).toBeNull();
    expect(row.servingGrams).toBeNull();
    expect(row.servingMl).toBe(250);
  });

  it('rejects an empty name', () => {
    const { db } = setup();
    expectDbError(
      () =>
        createFood(db, {
          at: 1_000,
          food: { name: '  ', basis: 'weight', servingLabel: '1 pot', servingAmount: 100, kcalPer100: 1, proteinPer100: 1 },
        }),
      'invalid_input',
    );
  });

  it('rejects a negative kcalPer100 or proteinPer100', () => {
    const { db } = setup();
    const base = { name: 'X', basis: 'weight', servingLabel: '1', servingAmount: 100 } as const;
    expectDbError(
      () => createFood(db, { at: 1_000, food: { ...base, kcalPer100: -1, proteinPer100: 0 } }),
      'invalid_input',
    );
    expectDbError(
      () => createFood(db, { at: 1_000, food: { ...base, kcalPer100: 0, proteinPer100: -1 } }),
      'invalid_input',
    );
  });

  it('rejects a non-positive servingAmount', () => {
    const { db } = setup();
    const base = { name: 'X', basis: 'weight', servingLabel: '1', kcalPer100: 1, proteinPer100: 1 } as const;
    expectDbError(() => createFood(db, { at: 1_000, food: { ...base, servingAmount: 0 } }), 'invalid_input');
    expectDbError(() => createFood(db, { at: 1_000, food: { ...base, servingAmount: -5 } }), 'invalid_input');
  });

  it('rejects a basis that is neither weight nor volume', () => {
    const { db } = setup();
    expectDbError(
      () =>
        createFood(db, {
          at: 1_000,
          // The column has a CHECK too; this proves the query layer refuses before SQLite has to.
          food: { name: 'X', basis: 'mass' as FoodBasis, servingLabel: '1', servingAmount: 100, kcalPer100: 1, proteinPer100: 1 },
        }),
      'invalid_input',
    );
  });
});

// -------------------------------------------------------------------------------------------
// updateFood
// -------------------------------------------------------------------------------------------

describe('updateFood', () => {
  it('patches only the given fields, leaving the rest untouched', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Skyr', brand: 'Arla', kcalPerServing: 120, proteinPerServing: 15 });
    db.insert(schema.foods).values(food).run();

    const updated = updateFood(db, { at: 2_000, id: food.id, patch: { kcalPer100: (130 * 100) / 170 } });

    expect(updated).toMatchObject({ name: 'Skyr', brand: 'Arla', kcalPerServing: 130, proteinPerServing: 15, updatedAt: 2_000 });
  });

  it('never changes a past food_log row — history is immutable', () => {
    const { db } = setup();
    const food = makeFood({ kcalPerServing: 100, proteinPerServing: 10 });
    db.insert(schema.foods).values(food).run();
    const receipt = logFood(db, { at: 1_000, timeZone: 'America/Los_Angeles', foodId: food.id });

    updateFood(db, { at: 2_000, id: food.id, patch: { kcalPer100: 999, proteinPer100: 999 } });

    const row = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, receipt.entries[0]!.id)).get();
    expect(row).toMatchObject({ kcal: 100, protein: 10 });
  });

  it('can set brand to null explicitly', () => {
    const { db } = setup();
    const food = makeFood({ brand: 'Arla' });
    db.insert(schema.foods).values(food).run();

    const updated = updateFood(db, { at: 2_000, id: food.id, patch: { brand: null } });
    expect(updated.brand).toBeNull();
  });

  it('throws not_found for a missing food', () => {
    const { db } = setup();
    expectDbError(() => updateFood(db, { at: 1_000, id: 'no-such-food', patch: {} }), 'not_found');
  });

  it('throws not_found for a tombstoned food', () => {
    const { db } = setup();
    const food = makeFood({ deleted: 1 });
    db.insert(schema.foods).values(food).run();
    expectDbError(() => updateFood(db, { at: 1_000, id: food.id, patch: { name: 'New' } }), 'not_found');
  });

  it('rejects a patch that would make kcalPer100 negative', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    expectDbError(() => updateFood(db, { at: 1_000, id: food.id, patch: { kcalPer100: -5 } }), 'invalid_input');
  });
});

// -------------------------------------------------------------------------------------------
// setFoodArchived
// -------------------------------------------------------------------------------------------

describe('setFoodArchived', () => {
  it('archives a food', () => {
    const { db } = setup();
    const food = makeFood({ archived: 0 });
    db.insert(schema.foods).values(food).run();

    const updated = setFoodArchived(db, { at: 2_000, id: food.id, archived: true });
    expect(updated.archived).toBe(1);
    expect(updated.updatedAt).toBe(2_000);
  });

  it('un-archives a food', () => {
    const { db } = setup();
    const food = makeFood({ archived: 1 });
    db.insert(schema.foods).values(food).run();

    const updated = setFoodArchived(db, { at: 2_000, id: food.id, archived: false });
    expect(updated.archived).toBe(0);
  });

  it('archived foods leave listFoods but their logs stay', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Discontinued', kcalPerServing: 50, proteinPerServing: 5 });
    db.insert(schema.foods).values(food).run();
    logFood(db, { at: Date.parse('2025-03-09T16:00:00.000Z'), timeZone: 'America/Los_Angeles', foodId: food.id });

    setFoodArchived(db, { at: 2_000, id: food.id, archived: true });

    expect(listFoods(db).map((f) => f.id)).not.toContain(food.id);
    const [entry] = dayLog(db, '2025-03-09');
    expect(entry).toMatchObject({ foodId: food.id, kcal: 50, protein: 5 });
  });

  it('throws not_found for a missing or tombstoned food', () => {
    const { db } = setup();
    expectDbError(() => setFoodArchived(db, { at: 1_000, id: 'nope', archived: true }), 'not_found');
    const food = makeFood({ deleted: 1 });
    db.insert(schema.foods).values(food).run();
    expectDbError(() => setFoodArchived(db, { at: 1_000, id: food.id, archived: true }), 'not_found');
  });

  // Issue #153: archive is undo-able — the same function, called with `archived: false`, restores
  // the food to every surface that hides an archived one.
  it('is undo-able: un-archiving restores the food to the grid, search and recents', () => {
    const { db } = setup();
    const at = Date.parse('2025-03-09T16:00:00.000Z');
    const timeZone = 'America/Los_Angeles';
    const food = makeFood({ name: 'Skyr', useCount: 1, lastUsedAt: at });
    db.insert(schema.foods).values(food).run();
    logFood(db, { at, timeZone, foodId: food.id });

    setFoodArchived(db, { at: at + 1, id: food.id, archived: true });
    expect(quickAddCandidates(db, { at, timeZone }).map((c) => c.id)).not.toContain(food.id);
    expect(searchFoodsOnly(db, { at, timeZone, query: 'Skyr' }).map((c) => c.id)).not.toContain(food.id);
    expect(recentFoods(db, { at, timeZone, days: 7 }).map((c) => c.id)).not.toContain(food.id);
    expect(listFoods(db).map((f) => f.id)).not.toContain(food.id);

    setFoodArchived(db, { at: at + 2, id: food.id, archived: false });
    expect(quickAddCandidates(db, { at, timeZone }).map((c) => c.id)).toContain(food.id);
    expect(searchFoodsOnly(db, { at, timeZone, query: 'Skyr' }).map((c) => c.id)).toContain(food.id);
    expect(recentFoods(db, { at, timeZone, days: 7 }).map((c) => c.id)).toContain(food.id);
    expect(listFoods(db).map((f) => f.id)).toContain(food.id);
  });

  it('archiving (and un-archiving) never changes a past food_log row or past totals', () => {
    const { db } = setup();
    const at = Date.parse('2025-03-09T16:00:00.000Z');
    const food = makeFood({ name: 'Discontinued', kcalPerServing: 50, proteinPerServing: 5 });
    db.insert(schema.foods).values(food).run();
    logFood(db, { at, timeZone: 'America/Los_Angeles', foodId: food.id });

    const before = todayTotals(db, '2025-03-09');
    setFoodArchived(db, { at: at + 1, id: food.id, archived: true });
    setFoodArchived(db, { at: at + 2, id: food.id, archived: false });
    const after = todayTotals(db, '2025-03-09');

    expect(after).toEqual(before);
    const [entry] = dayLog(db, '2025-03-09');
    expect(entry).toMatchObject({ foodId: food.id, kcal: 50, protein: 5 });
  });
});

// -------------------------------------------------------------------------------------------
// getFood
// -------------------------------------------------------------------------------------------

describe('getFood', () => {
  it('on an empty database, returns null', () => {
    const { db } = setup();
    expect(getFood(db, 'no-such-id')).toBeNull();
  });

  it('returns a live food', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Skyr' });
    db.insert(schema.foods).values(food).run();
    expect(getFood(db, food.id)).toMatchObject({ name: 'Skyr' });
  });

  it('returns null for a tombstoned food', () => {
    const { db } = setup();
    const food = makeFood({ deleted: 1 });
    db.insert(schema.foods).values(food).run();
    expect(getFood(db, food.id)).toBeNull();
  });

  it('returns an archived food — archived is not the same as deleted', () => {
    const { db } = setup();
    const food = makeFood({ archived: 1 });
    db.insert(schema.foods).values(food).run();
    expect(getFood(db, food.id)).not.toBeNull();
  });
});

// -------------------------------------------------------------------------------------------
// listFoods
// -------------------------------------------------------------------------------------------

describe('listFoods', () => {
  it('on an empty database, returns []', () => {
    const { db } = setup();
    expect(listFoods(db)).toEqual([]);
  });

  it('live, name order', () => {
    const { db } = setup();
    db.insert(schema.foods).values([makeFood({ name: 'Banana' }), makeFood({ name: 'Apple' })]).run();
    expect(listFoods(db).map((f) => f.name)).toEqual(['Apple', 'Banana']);
  });

  it('excludes tombstoned foods always', () => {
    const { db } = setup();
    db.insert(schema.foods).values(makeFood({ deleted: 1 })).run();
    expect(listFoods(db)).toEqual([]);
    expect(listFoods(db, { includeArchived: true })).toEqual([]);
  });

  it('excludes archived foods by default, includes them when asked', () => {
    const { db } = setup();
    const archived = makeFood({ name: 'Archived', archived: 1 });
    const live = makeFood({ name: 'Live' });
    db.insert(schema.foods).values([archived, live]).run();

    expect(listFoods(db).map((f) => f.id)).toEqual([live.id]);
    expect(listFoods(db, { includeArchived: true }).map((f) => f.name).sort()).toEqual(['Archived', 'Live']);
  });
});

// -------------------------------------------------------------------------------------------
// createMeal
// -------------------------------------------------------------------------------------------

describe('createMeal', () => {
  it('creates a meal and its items in one transaction, returning a MealDetail', () => {
    const { db } = setup();
    const oats = makeFood({ name: 'Oats', kcalPerServing: 200, proteinPerServing: 8 });
    const milk = makeFood({ name: 'Milk', kcalPerServing: 100, proteinPerServing: 7 });
    db.insert(schema.foods).values([oats, milk]).run();

    const detail = createMeal(db, {
      at: 1_000,
      name: 'Usual breakfast',
      items: [{ foodId: oats.id, qty: 1 }, { foodId: milk.id, qty: 2 }],
    });

    expect(detail.name).toBe('Usual breakfast');
    expect(detail.itemCount).toBe(2);
    expect(detail.kcal).toBe(200 * 1 + 100 * 2);
    expect(detail.protein).toBe(8 * 1 + 7 * 2);
    expect(detail.items).toHaveLength(2);

    const mealRow = db.select().from(schema.meals).where(eq(schema.meals.id, detail.id)).get();
    expect(mealRow).toMatchObject({ name: 'Usual breakfast', updatedAt: 1_000 });
  });

  it('throws empty_meal for an empty item list', () => {
    const { db } = setup();
    expectDbError(() => createMeal(db, { at: 1_000, name: 'Empty', items: [] }), 'empty_meal');
  });

  it('rejects a non-positive qty', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    expectDbError(() => createMeal(db, { at: 1_000, name: 'Bad', items: [{ foodId: food.id, qty: 0 }] }), 'invalid_input');
  });

  it('throws not_found when an item references a missing food, and writes nothing', () => {
    const { db } = setup();
    expectDbError(() => createMeal(db, { at: 1_000, name: 'Bad', items: [{ foodId: 'no-such-food', qty: 1 }] }), 'not_found');
    expect(db.select().from(schema.meals).all()).toEqual([]);
  });

  it('throws not_found when an item references a tombstoned food', () => {
    const { db } = setup();
    const food = makeFood({ deleted: 1 });
    db.insert(schema.foods).values(food).run();
    expectDbError(() => createMeal(db, { at: 1_000, name: 'Bad', items: [{ foodId: food.id, qty: 1 }] }), 'not_found');
  });

  it('rejects an empty name', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    expectDbError(() => createMeal(db, { at: 1_000, name: '  ', items: [{ foodId: food.id, qty: 1 }] }), 'invalid_input');
  });
});

// -------------------------------------------------------------------------------------------
// listMeals
// -------------------------------------------------------------------------------------------

describe('listMeals', () => {
  it('on an empty database, returns []', () => {
    const { db } = setup();
    expect(listMeals(db)).toEqual([]);
  });

  it('live meals, name order, summed over live items against live foods', () => {
    const { db } = setup();
    const food = makeFood({ kcalPerServing: 100, proteinPerServing: 10 });
    db.insert(schema.foods).values(food).run();
    const zebra = makeMeal({ name: 'Zebra' });
    const apple = makeMeal({ name: 'Apple meal' });
    db.insert(schema.meals).values([zebra, apple]).run();
    db.insert(schema.mealItems)
      .values([makeMealItem({ mealId: zebra.id, foodId: food.id }), makeMealItem({ mealId: apple.id, foodId: food.id })])
      .run();

    expect(listMeals(db).map((m) => m.name)).toEqual(['Apple meal', 'Zebra']);
    expect(listMeals(db).map((m) => m.kcal)).toEqual([100, 100]);
  });

  it('excludes tombstoned meals', () => {
    const { db } = setup();
    db.insert(schema.meals).values(makeMeal({ deleted: 1 })).run();
    expect(listMeals(db)).toEqual([]);
  });

  it('excludes tombstoned items and items whose food is tombstoned from the total', () => {
    const { db } = setup();
    const meal = makeMeal();
    const live = makeFood({ kcalPerServing: 100, proteinPerServing: 10 });
    const goneItem = makeFood({ kcalPerServing: 500, proteinPerServing: 50 });
    const goneFood = makeFood({ kcalPerServing: 999, proteinPerServing: 99, deleted: 1 });
    db.insert(schema.foods).values([live, goneItem, goneFood]).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems)
      .values([
        makeMealItem({ mealId: meal.id, foodId: live.id, qty: 1 }),
        makeMealItem({ mealId: meal.id, foodId: goneItem.id, qty: 1, deleted: 1 }),
        makeMealItem({ mealId: meal.id, foodId: goneFood.id, qty: 1 }),
      ])
      .run();

    const [summary] = listMeals(db);
    expect(summary).toMatchObject({ itemCount: 1, kcal: 100, protein: 10 });
  });

  it('a meal with no live items still appears, zeroed', () => {
    const { db } = setup();
    const meal = makeMeal({ name: 'Empty now' });
    db.insert(schema.meals).values(meal).run();

    expect(listMeals(db)).toEqual([{ id: meal.id, name: 'Empty now', itemCount: 0, kcal: 0, protein: 0 }]);
  });
});

// -------------------------------------------------------------------------------------------
// getMeal
// -------------------------------------------------------------------------------------------

describe('getMeal', () => {
  it('on an empty database, returns null', () => {
    const { db } = setup();
    expect(getMeal(db, 'no-such-id')).toBeNull();
  });

  it('returns a MealDetail with items paired to their current food', () => {
    const { db } = setup();
    const meal = makeMeal({ name: 'Post-gym shake' });
    const food = makeFood({ name: 'Whey', kcalPerServing: 120, proteinPerServing: 24 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id, qty: 2 })).run();

    const detail = getMeal(db, meal.id);
    expect(detail).toMatchObject({ id: meal.id, name: 'Post-gym shake', itemCount: 1, kcal: 240, protein: 48 });
    expect(detail?.items[0]).toMatchObject({ item: { qty: 2 }, food: { name: 'Whey' } });
  });

  it('returns null for a tombstoned meal', () => {
    const { db } = setup();
    const meal = makeMeal({ deleted: 1 });
    db.insert(schema.meals).values(meal).run();
    expect(getMeal(db, meal.id)).toBeNull();
  });
});

// -------------------------------------------------------------------------------------------
// mealsContainingFood — issue #153: which saved meals still reference a food, for the "these
// meals still have it" notice shown when archiving.
// -------------------------------------------------------------------------------------------

describe('mealsContainingFood', () => {
  it('on an empty database, returns []', () => {
    const { db } = setup();
    expect(mealsContainingFood(db, 'no-such-food')).toEqual([]);
  });

  it('returns a food with no meals as []', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    expect(mealsContainingFood(db, food.id)).toEqual([]);
  });

  it('returns live meals with a live item referencing the food, name order', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const zebra = makeMeal({ name: 'Zebra' });
    const apple = makeMeal({ name: 'Apple meal' });
    db.insert(schema.meals).values([zebra, apple]).run();
    db.insert(schema.mealItems)
      .values([makeMealItem({ mealId: zebra.id, foodId: food.id }), makeMealItem({ mealId: apple.id, foodId: food.id })])
      .run();

    expect(mealsContainingFood(db, food.id)).toEqual([
      { id: apple.id, name: 'Apple meal' },
      { id: zebra.id, name: 'Zebra' },
    ]);
  });

  it('excludes a meal referencing a different food', () => {
    const { db } = setup();
    const [target, other] = [makeFood({ name: 'Target' }), makeFood({ name: 'Other' })];
    db.insert(schema.foods).values([target, other]).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: other.id })).run();

    expect(mealsContainingFood(db, target.id)).toEqual([]);
  });

  it('excludes a tombstoned meal', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal({ deleted: 1 });
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    expect(mealsContainingFood(db, food.id)).toEqual([]);
  });

  it('excludes a tombstoned item — the meal is live but no longer contains the food', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id, deleted: 1 })).run();

    expect(mealsContainingFood(db, food.id)).toEqual([]);
  });

  it('lists a meal once even when the food appears in it more than once', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal({ name: 'Double up' });
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems)
      .values([
        makeMealItem({ mealId: meal.id, foodId: food.id, qty: 1 }),
        makeMealItem({ mealId: meal.id, foodId: food.id, qty: 2 }),
      ])
      .run();

    expect(mealsContainingFood(db, food.id)).toEqual([{ id: meal.id, name: 'Double up' }]);
  });
});

// -------------------------------------------------------------------------------------------
// updateMeal — issue #154: rename and/or replace the item set in one transaction. `patch.items`,
// when given, fully replaces the live set — add, remove and change-qty are all the same write.
// -------------------------------------------------------------------------------------------

describe('updateMeal', () => {
  it('renames a meal, bumping updated_at, leaving its items untouched', () => {
    const { db } = setup();
    const food = makeFood({ kcalPerServing: 100, proteinPerServing: 10 });
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal({ name: 'Old name', updatedAt: 1_000 });
    db.insert(schema.meals).values(meal).run();
    const item = makeMealItem({ mealId: meal.id, foodId: food.id, qty: 2, updatedAt: 1_000 });
    db.insert(schema.mealItems).values(item).run();

    const updated = updateMeal(db, { at: 2_000, id: meal.id, patch: { name: 'New name' } });

    expect(updated).toMatchObject({ name: 'New name', itemCount: 1, kcal: 200, protein: 20 });
    const mealRow = db.select().from(schema.meals).where(eq(schema.meals.id, meal.id)).get();
    expect(mealRow).toMatchObject({ updatedAt: 2_000 });
    const itemRow = db.select().from(schema.mealItems).where(eq(schema.mealItems.id, item.id)).get();
    expect(itemRow).toMatchObject({ deleted: 0, updatedAt: 1_000 });
  });

  it('replacing items tombstones the removed ones and inserts the rest live — add, remove and change-qty in one patch', () => {
    const { db } = setup();
    const oats = makeFood({ name: 'Oats', kcalPerServing: 200, proteinPerServing: 8 });
    const milk = makeFood({ name: 'Milk', kcalPerServing: 100, proteinPerServing: 7 });
    const honey = makeFood({ name: 'Honey', kcalPerServing: 60, proteinPerServing: 0 });
    db.insert(schema.foods).values([oats, milk, honey]).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    const oatsItem = makeMealItem({ mealId: meal.id, foodId: oats.id, qty: 1 });
    const milkItem = makeMealItem({ mealId: meal.id, foodId: milk.id, qty: 1 }); // will be removed
    db.insert(schema.mealItems).values([oatsItem, milkItem]).run();

    const updated = updateMeal(db, {
      at: 2_000,
      id: meal.id,
      // oats: qty changed 1 -> 2; milk: removed; honey: added.
      patch: { items: [{ foodId: oats.id, qty: 2 }, { foodId: honey.id, qty: 1 }] },
    });

    expect(updated.itemCount).toBe(2);
    expect(updated.kcal).toBe(200 * 2 + 60 * 1);

    const liveItems = db
      .select()
      .from(schema.mealItems)
      .where(and(eq(schema.mealItems.mealId, meal.id), eq(schema.mealItems.deleted, 0)))
      .all();
    const byFood = new Map(liveItems.map((i) => [i.foodId, i]));
    expect(byFood.size).toBe(2);
    expect(byFood.get(oats.id)).toMatchObject({ qty: 2 });
    expect(byFood.get(honey.id)).toMatchObject({ qty: 1 });
    expect(byFood.has(milk.id)).toBe(false);

    const oldOatsRow = db.select().from(schema.mealItems).where(eq(schema.mealItems.id, oatsItem.id)).get();
    const milkRow = db.select().from(schema.mealItems).where(eq(schema.mealItems.id, milkItem.id)).get();
    expect(oldOatsRow).toMatchObject({ deleted: 1, updatedAt: 2_000 });
    expect(milkRow).toMatchObject({ deleted: 1, updatedAt: 2_000 });
  });

  it('a patch with only items given leaves the name untouched', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal({ name: 'Keep me' });
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    const updated = updateMeal(db, { at: 2_000, id: meal.id, patch: { items: [{ foodId: food.id, qty: 1 }] } });
    expect(updated.name).toBe('Keep me');
  });

  it('bumps updated_at even for an empty patch', () => {
    const { db } = setup();
    const meal = makeMeal({ updatedAt: 1_000 });
    db.insert(schema.meals).values(meal).run();

    updateMeal(db, { at: 2_000, id: meal.id, patch: {} });
    const mealRow = db.select().from(schema.meals).where(eq(schema.meals.id, meal.id)).get();
    expect(mealRow).toMatchObject({ updatedAt: 2_000 });
  });

  it('throws empty_meal when the items patch is empty, and changes nothing', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    const item = makeMealItem({ mealId: meal.id, foodId: food.id });
    db.insert(schema.mealItems).values(item).run();

    expectDbError(() => updateMeal(db, { at: 2_000, id: meal.id, patch: { items: [] } }), 'empty_meal');
    const itemRow = db.select().from(schema.mealItems).where(eq(schema.mealItems.id, item.id)).get();
    expect(itemRow).toMatchObject({ deleted: 0 });
  });

  it('rejects a non-positive qty in the items patch', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();

    expectDbError(
      () => updateMeal(db, { at: 2_000, id: meal.id, patch: { items: [{ foodId: food.id, qty: 0 }] } }),
      'invalid_input',
    );
  });

  it('throws not_found when an item patch references a missing food, and changes nothing', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    const item = makeMealItem({ mealId: meal.id, foodId: food.id });
    db.insert(schema.mealItems).values(item).run();

    expectDbError(
      () => updateMeal(db, { at: 2_000, id: meal.id, patch: { items: [{ foodId: 'no-such-food', qty: 1 }] } }),
      'not_found',
    );
    const itemRow = db.select().from(schema.mealItems).where(eq(schema.mealItems.id, item.id)).get();
    expect(itemRow).toMatchObject({ deleted: 0 });
  });

  it('throws not_found when an item patch references a tombstoned food', () => {
    const { db } = setup();
    const gone = makeFood({ deleted: 1 });
    db.insert(schema.foods).values(gone).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();

    expectDbError(
      () => updateMeal(db, { at: 2_000, id: meal.id, patch: { items: [{ foodId: gone.id, qty: 1 }] } }),
      'not_found',
    );
  });

  it('rejects an empty name', () => {
    const { db } = setup();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    expectDbError(() => updateMeal(db, { at: 2_000, id: meal.id, patch: { name: '  ' } }), 'invalid_input');
  });

  it('throws not_found for a missing meal', () => {
    const { db } = setup();
    expectDbError(() => updateMeal(db, { at: 2_000, id: 'no-such-meal', patch: { name: 'X' } }), 'not_found');
  });

  it('throws not_found for a tombstoned meal', () => {
    const { db } = setup();
    const meal = makeMeal({ deleted: 1 });
    db.insert(schema.meals).values(meal).run();
    expectDbError(() => updateMeal(db, { at: 2_000, id: meal.id, patch: { name: 'X' } }), 'not_found');
  });

  it('never changes a past food_log row — history is immutable', () => {
    const { db } = setup();
    const oats = makeFood({ name: 'Oats', kcalPerServing: 200, proteinPerServing: 8 });
    const honey = makeFood({ name: 'Honey', kcalPerServing: 60, proteinPerServing: 0 });
    db.insert(schema.foods).values([oats, honey]).run();
    const meal = makeMeal({ name: 'Breakfast' });
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: oats.id, qty: 1 })).run();
    const receipt = logMeal(db, { at: 1_000, timeZone: 'America/Los_Angeles', mealId: meal.id });
    const loggedRow = receipt.entries[0]!;

    updateMeal(db, {
      at: 2_000,
      id: meal.id,
      patch: { name: 'Renamed', items: [{ foodId: honey.id, qty: 5 }] },
    });

    const row = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, loggedRow.id)).get();
    expect(row).toMatchObject({ kcal: 200, protein: 8, foodId: oats.id });
  });

  it('a tombstoned item — one an update removed — is absent from getMeal', () => {
    const { db } = setup();
    const oats = makeFood({ name: 'Oats' });
    const milk = makeFood({ name: 'Milk' });
    db.insert(schema.foods).values([oats, milk]).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems)
      .values([makeMealItem({ mealId: meal.id, foodId: oats.id }), makeMealItem({ mealId: meal.id, foodId: milk.id })])
      .run();

    updateMeal(db, { at: 2_000, id: meal.id, patch: { items: [{ foodId: oats.id, qty: 1 }] } });

    const detail = getMeal(db, meal.id);
    expect(detail?.items.map((i) => i.food.id)).toEqual([oats.id]);
  });
});

// -------------------------------------------------------------------------------------------
// deleteMeal — issue #154: tombstones the meal and its live items, never a row removal.
// -------------------------------------------------------------------------------------------

describe('deleteMeal', () => {
  it('tombstones a meal and its live items, bumping updated_at on both', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    const item = makeMealItem({ mealId: meal.id, foodId: food.id });
    db.insert(schema.mealItems).values(item).run();

    const receipt = deleteMeal(db, { at: 2_000, id: meal.id });

    expect(receipt).toEqual({ mealId: meal.id, itemIds: [item.id] });
    const mealRow = db.select().from(schema.meals).where(eq(schema.meals.id, meal.id)).get();
    expect(mealRow).toMatchObject({ deleted: 1, updatedAt: 2_000 });
    const itemRow = db.select().from(schema.mealItems).where(eq(schema.mealItems.id, item.id)).get();
    expect(itemRow).toMatchObject({ deleted: 1, updatedAt: 2_000 });
  });

  it('throws not_found for a missing meal', () => {
    const { db } = setup();
    expectDbError(() => deleteMeal(db, { at: 2_000, id: 'no-such-meal' }), 'not_found');
  });

  it('throws not_found for an already-tombstoned meal', () => {
    const { db } = setup();
    const meal = makeMeal({ deleted: 1 });
    db.insert(schema.meals).values(meal).run();
    expectDbError(() => deleteMeal(db, { at: 2_000, id: meal.id }), 'not_found');
  });

  it('a deleted meal is absent from listMeals, getMeal, search and quick-add', () => {
    const { db } = setup();
    const at = Date.parse('2025-03-09T16:00:00.000Z');
    const timeZone = 'America/Los_Angeles';
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal({ name: 'Post-gym shake' });
    db.insert(schema.meals).values({ ...meal, useCount: 1, lastUsedAt: at }).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    deleteMeal(db, { at: at + 1, id: meal.id });

    expect(listMeals(db).map((m) => m.id)).not.toContain(meal.id);
    expect(getMeal(db, meal.id)).toBeNull();
    expect(searchFoods(db, { at, timeZone, query: 'Post-gym' }).map((c) => c.id)).not.toContain(meal.id);
    expect(quickAddCandidates(db, { at, timeZone }).map((c) => c.id)).not.toContain(meal.id);
  });

  it('never changes a past food_log row — history is immutable', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Oats', kcalPerServing: 200, proteinPerServing: 8 });
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id, qty: 1 })).run();
    const receipt = logMeal(db, { at: 1_000, timeZone: 'America/Los_Angeles', mealId: meal.id });
    const loggedRow = receipt.entries[0]!;

    deleteMeal(db, { at: 2_000, id: meal.id });

    const row = db.select().from(schema.foodLog).where(eq(schema.foodLog.id, loggedRow.id)).get();
    expect(row).toMatchObject({ kcal: 200, protein: 8, foodId: food.id, mealId: meal.id });
  });
});

// -------------------------------------------------------------------------------------------
// restoreMeal — issue #154: deleteMeal's undo. Takes back exactly the item ids that call
// tombstoned, never an item an earlier updateMeal already removed on purpose.
// -------------------------------------------------------------------------------------------

describe('restoreMeal', () => {
  it('undoes deleteMeal: restores the meal and exactly the items that call tombstoned', () => {
    const { db } = setup();
    const food = makeFood({ name: 'Whey', kcalPerServing: 120, proteinPerServing: 24 });
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal({ name: 'Shake' });
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id, qty: 2 })).run();
    const receipt = deleteMeal(db, { at: 2_000, id: meal.id });

    const restored = restoreMeal(db, { at: 3_000, mealId: receipt.mealId, itemIds: receipt.itemIds });

    expect(restored).toMatchObject({ name: 'Shake', itemCount: 1, kcal: 240, protein: 48 });
    expect(getMeal(db, meal.id)).not.toBeNull();
    const mealRow = db.select().from(schema.meals).where(eq(schema.meals.id, meal.id)).get();
    expect(mealRow).toMatchObject({ deleted: 0, updatedAt: 3_000 });
  });

  it('does not resurrect an item an earlier updateMeal already removed', () => {
    const { db } = setup();
    const oats = makeFood({ name: 'Oats' });
    const milk = makeFood({ name: 'Milk' });
    db.insert(schema.foods).values([oats, milk]).run();
    const meal = makeMeal();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems)
      .values([makeMealItem({ mealId: meal.id, foodId: oats.id }), makeMealItem({ mealId: meal.id, foodId: milk.id })])
      .run();
    // Milk is removed by an edit, well before the meal is ever deleted.
    updateMeal(db, { at: 1_500, id: meal.id, patch: { items: [{ foodId: oats.id, qty: 1 }] } });

    const receipt = deleteMeal(db, { at: 2_000, id: meal.id });
    restoreMeal(db, { at: 3_000, mealId: receipt.mealId, itemIds: receipt.itemIds });

    const detail = getMeal(db, meal.id);
    expect(detail?.items.map((i) => i.food.id)).toEqual([oats.id]);
  });

  it('throws not_found for a meal id that never existed', () => {
    const { db } = setup();
    expectDbError(() => restoreMeal(db, { at: 3_000, mealId: 'no-such-meal', itemIds: [] }), 'not_found');
  });

  it('is idempotent: restoring an already-live meal changes nothing', () => {
    const { db } = setup();
    const food = makeFood();
    db.insert(schema.foods).values(food).run();
    const meal = makeMeal({ updatedAt: 1_000 });
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();

    restoreMeal(db, { at: 3_000, mealId: meal.id, itemIds: [] });

    const mealRow = db.select().from(schema.meals).where(eq(schema.meals.id, meal.id)).get();
    expect(mealRow).toMatchObject({ deleted: 0, updatedAt: 1_000 });
  });
});
