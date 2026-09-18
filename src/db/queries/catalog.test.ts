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
 */
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../../test/db';
import { makeMeal, makeMealItem } from '../../../test/factories';
import { makeFood } from '../test-support/foods';
import { VitalsDbError, type VitalsDbErrorCode } from '../errors';
import * as schema from '../schema';
import type { FoodBasis } from '../schema';
import { quickAddCandidates, dayLog, logFood, todayTotals } from './nutrition';
import { recentFoods, searchFoodsOnly } from './search';
import {
  createFood,
  createMeal,
  getFood,
  getMeal,
  listFoods,
  listMeals,
  mealsContainingFood,
  setFoodArchived,
  updateFood,
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
