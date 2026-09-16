/**
 * The catalogue and meals — issue #36, against the binding contract on issue #17 §3 ("#22:
 * catalogue, meals, settings, delete + undo"). `updateSettings` and `weightSummary`, also #36's,
 * live in `./settings` and `./weight` — the read side of nutrition logging (issue #35) is
 * `./nutrition`; neither is imported here.
 */
import { and, asc, eq } from 'drizzle-orm';
import type { VitalsDb } from '../db';
import { VitalsDbError } from '../errors';
import { newId } from '../ids';
import type { Stamp } from '../local-time';
import { foods, mealItems, meals, type MealItemRow, type MealRow, type NewFoodRow, type NewMealRow } from '../schema';
import { servingOf, withServing } from '../servings';
import type { FoodInput, FoodRow, MealDetail, MealItemInput, MealSummary } from '../types';

// ---------------------------------------------------------------------------------------------
// Foods — createFood, updateFood, setFoodArchived, getFood, listFoods.
// ---------------------------------------------------------------------------------------------

/** Mirrors the schema's CHECK constraints, so a bad value throws `VitalsDbError` here rather than a
 * raw driver exception at the CHECK (issue #17 contract §0: every function throws `VitalsDbError`).
 * Exported for reuse by `./search`'s `createFoodAndLog` (issue #37), which inserts a food the same
 * way `createFood` does. */
export function validateFoodInput(input: FoodInput): void {
  if (input.name.trim().length === 0) throw new VitalsDbError('invalid_input', 'name must not be empty');
  if (input.servingLabel.trim().length === 0) throw new VitalsDbError('invalid_input', 'servingLabel must not be empty');
  if (input.basis !== 'weight' && input.basis !== 'volume') {
    throw new VitalsDbError('invalid_input', `basis must be 'weight' or 'volume'`);
  }
  if (!(input.servingAmount > 0)) throw new VitalsDbError('invalid_input', 'servingAmount must be > 0');
  if (input.kcalPer100 < 0) throw new VitalsDbError('invalid_input', 'kcalPer100 must be >= 0');
  if (input.proteinPer100 < 0) throw new VitalsDbError('invalid_input', 'proteinPer100 must be >= 0');
}

function mustGetFood(db: VitalsDb, id: string): FoodRow {
  const row = db.select().from(foods).where(eq(foods.id, id)).get();
  if (!row) throw new VitalsDbError('not_found', `food ${id} not found`);
  return withServing(row);
}

/** Inserts a new catalogue food. `search_text` comes back from the insert trigger (issue #17 §1.5). */
export function createFood(db: VitalsDb, opts: Stamp & { food: FoodInput }): FoodRow {
  validateFoodInput(opts.food);

  return db.transaction((tx) => {
    const row: NewFoodRow = {
      id: newId(),
      updatedAt: opts.at,
      deleted: 0,
      name: opts.food.name,
      brand: opts.food.brand ?? null,
      basis: opts.food.basis,
      servingLabel: opts.food.servingLabel,
      servingAmount: opts.food.servingAmount,
      kcalPer100: opts.food.kcalPer100,
      proteinPer100: opts.food.proteinPer100,
      archived: 0,
    };
    tx.insert(foods).values(row).run();
    return mustGetFood(tx, row.id);
  });
}

/**
 * Patches a catalogue food. Never touches `food_log` — a `food_log` row holds its own literal
 * `kcal`/`protein`/`grams`, so correcting a food's nutrition here can never rewrite a past log
 * (invariant: history is immutable).
 */
export function updateFood(db: VitalsDb, opts: Stamp & { id: string; patch: Partial<FoodInput> }): FoodRow {
  return db.transaction((tx) => {
    const current = tx.select().from(foods).where(eq(foods.id, opts.id)).get();
    if (!current || current.deleted === 1) throw new VitalsDbError('not_found', `food ${opts.id} not found`);

    const { patch } = opts;
    const next: FoodInput = {
      name: patch.name ?? current.name,
      brand: 'brand' in patch ? (patch.brand ?? null) : current.brand,
      basis: patch.basis ?? current.basis,
      servingLabel: patch.servingLabel ?? current.servingLabel,
      servingAmount: patch.servingAmount ?? current.servingAmount,
      kcalPer100: patch.kcalPer100 ?? current.kcalPer100,
      proteinPer100: patch.proteinPer100 ?? current.proteinPer100,
    };
    validateFoodInput(next);

    tx.update(foods)
      .set({ ...next, updatedAt: opts.at })
      .where(eq(foods.id, opts.id))
      .run();
    return mustGetFood(tx, opts.id);
  });
}

/**
 * Archived hides a food from the grid, search and recents (issue #17 contract, #22 section). It
 * still shows in the day log and is still loggable from a saved meal it belongs to.
 */
export function setFoodArchived(db: VitalsDb, opts: Stamp & { id: string; archived: boolean }): FoodRow {
  return db.transaction((tx) => {
    const current = tx.select().from(foods).where(eq(foods.id, opts.id)).get();
    if (!current || current.deleted === 1) throw new VitalsDbError('not_found', `food ${opts.id} not found`);

    tx.update(foods)
      .set({ archived: opts.archived ? 1 : 0, updatedAt: opts.at })
      .where(eq(foods.id, opts.id))
      .run();
    return mustGetFood(tx, opts.id);
  });
}

/** A live food by id, or `null` — a tombstoned or missing food reads back as not there. */
export function getFood(db: VitalsDb, id: string): FoodRow | null {
  const row = db
    .select()
    .from(foods)
    .where(and(eq(foods.id, id), eq(foods.deleted, 0)))
    .get();
  return row ? withServing(row) : null;
}

/** Live foods, name order (then id). Archived foods are excluded unless `includeArchived`. */
export function listFoods(db: VitalsDb, opts: { includeArchived?: boolean } = {}): FoodRow[] {
  const conditions = opts.includeArchived ? [eq(foods.deleted, 0)] : [eq(foods.deleted, 0), eq(foods.archived, 0)];
  return db
    .select()
    .from(foods)
    .where(and(...conditions))
    .orderBy(asc(foods.name), asc(foods.id))
    .all()
    .map(withServing);
}

// ---------------------------------------------------------------------------------------------
// Meals — createMeal, listMeals, getMeal.
// ---------------------------------------------------------------------------------------------

interface MealItemWithFood {
  item: MealItemRow;
  food: FoodRow;
}

/** Live `meal_items` for one meal whose food is also live, food-name order — same exclusion as the
 * quick-add ranking's meal aggregate (issue #17 §1.4: tombstoned foods excluded from a meal's total). */
function liveMealItemsWithFood(db: VitalsDb, mealId: string): MealItemWithFood[] {
  return db
    .select({ item: mealItems, food: foods })
    .from(mealItems)
    .innerJoin(foods, eq(mealItems.foodId, foods.id))
    .where(and(eq(mealItems.mealId, mealId), eq(mealItems.deleted, 0), eq(foods.deleted, 0)))
    .orderBy(asc(foods.name), asc(mealItems.id))
    .all()
    .map(({ item, food }) => ({ item, food: withServing(food) }));
}

function summaryOf(meal: MealRow, items: readonly MealItemWithFood[]): MealSummary {
  let kcal = 0;
  let protein = 0;
  for (const { item, food } of items) {
    kcal += item.qty * food.kcalPerServing;
    protein += item.qty * food.proteinPerServing;
  }
  return { id: meal.id, name: meal.name, itemCount: items.length, kcal, protein };
}

/** Creates a meal and its items in one transaction. Throws `empty_meal` for an empty item list and
 * `not_found` for an item referencing a food that doesn't exist or is tombstoned. */
export function createMeal(db: VitalsDb, opts: Stamp & { name: string; items: readonly MealItemInput[] }): MealDetail {
  if (opts.name.trim().length === 0) throw new VitalsDbError('invalid_input', 'name must not be empty');
  if (opts.items.length === 0) throw new VitalsDbError('empty_meal', 'a meal needs at least one item');
  for (const item of opts.items) {
    if (item.qty <= 0) throw new VitalsDbError('invalid_input', 'qty must be > 0');
  }

  return db.transaction((tx) => {
    for (const item of opts.items) {
      const food = tx.select().from(foods).where(eq(foods.id, item.foodId)).get();
      if (!food || food.deleted === 1) throw new VitalsDbError('not_found', `food ${item.foodId} not found`);
    }

    const mealId = newId();
    const mealRow: NewMealRow = { id: mealId, updatedAt: opts.at, deleted: 0, name: opts.name };
    tx.insert(meals).values(mealRow).run();
    tx.insert(mealItems)
      .values(
        opts.items.map((item) => ({
          id: newId(),
          updatedAt: opts.at,
          deleted: 0,
          mealId,
          foodId: item.foodId,
          qty: item.qty,
        })),
      )
      .run();

    const insertedMeal = tx.select().from(meals).where(eq(meals.id, mealId)).get();
    if (!insertedMeal) throw new Error(`unreachable: meal ${mealId} was just inserted`);
    const items = liveMealItemsWithFood(tx, mealId);
    return { ...summaryOf(insertedMeal, items), items };
  });
}

/** Live meals, name order (then id), each summed over its live items against live foods. */
export function listMeals(db: VitalsDb): MealSummary[] {
  const mealRows = db.select().from(meals).where(eq(meals.deleted, 0)).orderBy(asc(meals.name), asc(meals.id)).all();
  if (mealRows.length === 0) return [];

  const itemRows = db
    .select({
      mealId: mealItems.mealId,
      qty: mealItems.qty,
      basis: foods.basis,
      servingAmount: foods.servingAmount,
      kcalPer100: foods.kcalPer100,
      proteinPer100: foods.proteinPer100,
    })
    .from(mealItems)
    .innerJoin(foods, eq(mealItems.foodId, foods.id))
    .where(and(eq(mealItems.deleted, 0), eq(foods.deleted, 0)))
    .all();

  const agg = new Map<string, { itemCount: number; kcal: number; protein: number }>();
  for (const row of itemRows) {
    const prev = agg.get(row.mealId) ?? { itemCount: 0, kcal: 0, protein: 0 };
    const serving = servingOf(row);
    agg.set(row.mealId, {
      itemCount: prev.itemCount + 1,
      kcal: prev.kcal + row.qty * serving.kcalPerServing,
      protein: prev.protein + row.qty * serving.proteinPerServing,
    });
  }

  return mealRows.map((meal) => {
    const a = agg.get(meal.id) ?? { itemCount: 0, kcal: 0, protein: 0 };
    return { id: meal.id, name: meal.name, itemCount: a.itemCount, kcal: a.kcal, protein: a.protein };
  });
}

/** A live meal by id, with its live items and their current foods, or `null`. */
export function getMeal(db: VitalsDb, id: string): MealDetail | null {
  const meal = db
    .select()
    .from(meals)
    .where(and(eq(meals.id, id), eq(meals.deleted, 0)))
    .get();
  if (!meal) return null;

  const items = liveMealItemsWithFood(db, id);
  return { ...summaryOf(meal, items), items };
}
