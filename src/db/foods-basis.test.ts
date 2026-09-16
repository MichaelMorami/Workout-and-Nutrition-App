/**
 * Issue #86 — foods get a weight/volume basis, nutrition per 100 g/ml, and per-serving values that
 * are derived rather than stored.
 *
 * This file is the acceptance checklist, in order:
 *
 *   1. the migration rebuilds `foods` and `food_log` empty, with the new columns and CHECKs;
 *   2. the queries derive per-serving values from per-100 and never store them;
 *   3. a volume food logs `ml`, a weight food logs `grams`, and history stays immutable.
 *
 * The per-column and per-query detail lives next to the code it belongs to (`schema.test.ts`,
 * `queries/*.test.ts`); what is here is the contract the issue agreed, asserted end to end.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { makeTestDb } from '../../test/db';
import type { VitalsDb } from './db';
import { createFood, getFood, listFoods } from './queries/catalog';
import { dayLog, logFood, quickAddCandidates } from './queries/nutrition';
import { createFoodAndLog, searchFoods } from './queries/search';
import * as schema from './schema';
import { SERVING_PRESETS, servingOf } from './servings';
import type { FoodInput } from './types';

const FOLDER = path.join(__dirname, 'migrations');

/** 23:55 on Sunday 9 March 2025 in America/Los_Angeles — 06:55 UTC on the 10th, and a DST boundary. */
const LATE_SNACK_AT = 1_741_589_700_000;
const ZONE = 'America/Los_Angeles';
const when = { at: LATE_SNACK_AT, timeZone: ZONE };

/** A weight food: oats, 379 kcal / 100 g, one serving 60 g. */
const OATS: FoodInput = {
  name: 'Porridge oats',
  servingLabel: '60 g dry',
  basis: 'weight',
  servingAmount: 60,
  kcalPer100: 379,
  proteinPer100: 13.5,
};

/** A volume food: whey, facts per 100 ml, one scoop 25 ml. */
const WHEY: FoodInput = {
  name: 'Whey shake',
  brand: 'Bulk',
  servingLabel: '1 scoop',
  basis: 'volume',
  servingAmount: 25,
  kcalPer100: 390,
  proteinPer100: 80,
};

function db(): VitalsDb {
  return makeTestDb({ schema }).db as unknown as VitalsDb;
}

// -------------------------------------------------------------------------------------------
// 1. The migration.
// -------------------------------------------------------------------------------------------

describe('the 0002 migration', () => {
  /** A database as it stood before 0002, with a food, a meal, an item and a log row in it. */
  function beforeBasis(): Database.Database {
    const journal = JSON.parse(fs.readFileSync(path.join(FOLDER, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'vitals-86-'));
    fs.mkdirSync(path.join(out, 'meta'));
    const entries = journal.entries.slice(0, 2);
    for (const entry of entries) fs.copyFileSync(path.join(FOLDER, `${entry.tag}.sql`), path.join(out, `${entry.tag}.sql`));
    fs.writeFileSync(path.join(out, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));

    const sqlite = new Database(':memory:');
    migrate(drizzle(sqlite), { migrationsFolder: out });
    sqlite.pragma('foreign_keys = ON');
    sqlite
      .prepare('insert into foods (id, name, serving_label, serving_grams, kcal_per_serving, protein_per_serving, updated_at) values (?,?,?,?,?,?,?)')
      .run('food-1', 'Skyr', '1 pot', 170, 133, 17, 1);
    sqlite.prepare('insert into meals (id, name, updated_at) values (?,?,?)').run('meal-1', 'Breakfast', 1);
    sqlite.prepare('insert into meal_items (id, meal_id, food_id, qty, updated_at) values (?,?,?,?,?)').run('item-1', 'meal-1', 'food-1', 1, 1);
    sqlite
      .prepare('insert into food_log (id, logged_at, local_date, local_minute, food_id, qty, grams, kcal, protein, slot, updated_at) values (?,?,?,?,?,?,?,?,?,?,?)')
      .run('log-1', LATE_SNACK_AT, '2025-03-09', 1435, 'food-1', 1, 170, 133, 17, 'snack', LATE_SNACK_AT);
    fs.rmSync(out, { recursive: true, force: true });
    return sqlite;
  }

  it('rebuilds foods and food_log empty — existing rows are wiped, not converted (ruling 1)', () => {
    const sqlite = beforeBasis();

    migrate(drizzle(sqlite), { migrationsFolder: FOLDER });

    expect(sqlite.prepare('select count(*) as n from foods').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('select count(*) as n from food_log').get()).toEqual({ n: 0 });
    sqlite.close();
  });

  it('clears meals and meal_items too, so no meal item dangles off a wiped food', () => {
    const sqlite = beforeBasis();

    migrate(drizzle(sqlite), { migrationsFolder: FOLDER });

    expect(sqlite.prepare('select count(*) as n from meal_items').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('select count(*) as n from meals').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('pragma foreign_key_check').all()).toEqual([]);
    sqlite.close();
  });

  it('leaves body_metrics and settings untouched — only the food tables are test data', () => {
    const sqlite = beforeBasis();
    sqlite.prepare('insert into body_metrics (id, measured_at, local_date, weight, updated_at) values (?,?,?,?,?)').run('b-1', 1, '2025-03-09', 83.4, 1);
    sqlite.prepare('insert into settings (id, kcal_target, protein_target, week_start, updated_at) values (?,?,?,?,?)').run('s-1', 2400, 170, 1, 1);

    migrate(drizzle(sqlite), { migrationsFolder: FOLDER });

    expect(sqlite.prepare('select id, weight from body_metrics').all()).toEqual([{ id: 'b-1', weight: 83.4 }]);
    expect(sqlite.prepare('select id, kcal_target from settings').all()).toEqual([{ id: 's-1', kcal_target: 2400 }]);
    sqlite.close();
  });

  it('gives foods the basis columns and drops the per-serving ones', () => {
    const { sqlite } = makeTestDb({ schema });
    const columns = (sqlite.prepare('pragma table_info("foods")').all() as { name: string; notnull: number }[]);

    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['basis', 'serving_amount', 'kcal_per_100', 'protein_per_100', 'serving_label']),
    );
    expect(columns.map((c) => c.name)).not.toEqual(
      expect.arrayContaining(['serving_grams', 'kcal_per_serving', 'protein_per_serving']),
    );
    expect(columns.filter((c) => ['basis', 'serving_amount', 'kcal_per_100', 'protein_per_100'].includes(c.name)).every((c) => c.notnull === 1)).toBe(true);
  });

  it('gives food_log a nullable ml beside grams', () => {
    const { sqlite } = makeTestDb({ schema });
    const ml = (sqlite.prepare('pragma table_info("food_log")').all() as { name: string; type: string; notnull: number }[]).find((c) => c.name === 'ml');

    expect(ml).toMatchObject({ type: expect.stringMatching(/real/i), notnull: 0 });
  });

  it('re-creates the foods search_text triggers that DROP TABLE foods took with it', () => {
    const { sqlite, db: handle } = makeTestDb({ schema });
    handle.insert(schema.foods).values({ ...rawFood('a'), name: 'Crème fraîche', brand: 'Président' }).run();

    expect(sqlite.prepare(`select search_text from foods where id = 'a'`).get()).toEqual({ search_text: 'creme fraiche president' });
  });

  it('seeds no default quick-add foods — there are none to re-seed', () => {
    expect(listFoods(db())).toEqual([]);
  });
});

/** A raw new-format row, for the handful of tests that insert one directly. */
function rawFood(id: string): typeof schema.foods.$inferInsert {
  return {
    id,
    updatedAt: 1,
    deleted: 0,
    name: 'Skyr',
    brand: null,
    basis: 'weight',
    servingLabel: '100 g',
    servingAmount: 100,
    kcalPer100: 63,
    proteinPer100: 10,
  };
}

// -------------------------------------------------------------------------------------------
// 2. CHECK constraints.
// -------------------------------------------------------------------------------------------

describe('the new CHECK constraints', () => {
  it('rejects a basis that is neither weight nor volume', () => {
    const { db: handle } = makeTestDb({ schema });

    expect(() => handle.insert(schema.foods).values({ ...rawFood('a'), basis: 'mass' as 'weight' }).run()).toThrow(/CHECK constraint failed/);
  });

  it.each([
    ['serving_amount', 'servingAmount', 0],
    ['kcal_per_100', 'kcalPer100', -1],
    ['protein_per_100', 'proteinPer100', -1],
  ])('rejects a non-positive %s', (_column, key, value) => {
    const { db: handle } = makeTestDb({ schema });

    expect(() => handle.insert(schema.foods).values({ ...rawFood('a'), [key]: value }).run()).toThrow(/CHECK constraint failed/);
  });

  it('rejects a log row that claims both grams and ml', () => {
    const { sqlite } = makeTestDb({ schema });

    expect(() =>
      sqlite
        .prepare('insert into food_log (id, logged_at, local_date, local_minute, qty, grams, ml, kcal, protein, slot, updated_at) values (?,?,?,?,?,?,?,?,?,?,?)')
        .run('l', 1, '2025-03-09', 1435, 1, 60, 25, 100, 5, 'snack', 1),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects a non-positive ml', () => {
    const { sqlite } = makeTestDb({ schema });

    expect(() =>
      sqlite
        .prepare('insert into food_log (id, logged_at, local_date, local_minute, qty, ml, kcal, protein, slot, updated_at) values (?,?,?,?,?,?,?,?,?,?)')
        .run('l', 1, '2025-03-09', 1435, 1, 0, 100, 5, 'snack', 1),
    ).toThrow(/CHECK constraint failed/);
  });
});

// -------------------------------------------------------------------------------------------
// 3. Derived per-serving values.
// -------------------------------------------------------------------------------------------

describe('per-serving values', () => {
  it('are derived from per-100, never stored', () => {
    const { db: handle, sqlite } = makeTestDb({ schema });
    const food = createFood(handle as unknown as VitalsDb, { at: 1, food: OATS });

    // 379 kcal/100 g × 60 g = 227.4 kcal; 13.5 × 0.6 = 8.1 g protein.
    expect(food).toMatchObject({ kcalPerServing: 227.4, proteinPerServing: 8.1, servingGrams: 60, servingMl: null });
    // And nothing in the table holds either number.
    const columns = (sqlite.prepare('pragma table_info("foods")').all() as { name: string }[]).map((c) => c.name);
    expect(columns.filter((c) => c.includes('per_serving'))).toEqual([]);
  });

  it('give a volume food ml, not grams', () => {
    const food = createFood(db(), { at: 1, food: WHEY });

    expect(food).toMatchObject({ basis: 'volume', servingMl: 25, servingGrams: null, kcalPerServing: 97.5, proteinPerServing: 20 });
  });

  it('survive a round trip through per-100 without floating-point drift', () => {
    // 105 kcal over a 170 g serving is 61.764705… per 100 g. Derived back it must be 105, not
    // 104.99999999999999 — the number the user typed is the number the app shows.
    const handle = db();
    const food = createFood(handle, {
      at: 1,
      food: { name: 'Banana', servingLabel: '1 medium', basis: 'weight', servingAmount: 170, kcalPer100: (105 * 100) / 170, proteinPer100: (1.3 * 100) / 170 },
    });

    expect(food.kcalPerServing).toBe(105);
    expect(food.proteinPerServing).toBe(1.3);
    expect(getFood(handle, food.id)?.kcalPerServing).toBe(105);
  });

  it('are computed the same way wherever a food is read', () => {
    const handle = db();
    const food = createFood(handle, { at: 1, food: WHEY });
    const expected = servingOf(food);

    expect(getFood(handle, food.id)).toMatchObject(expected);
    expect(listFoods(handle)[0]).toMatchObject(expected);
    expect(quickAddCandidates(handle, when)[0]).toMatchObject({ kcal: expected.kcalPerServing, protein: expected.proteinPerServing });
    expect(searchFoods(handle, { ...when, query: 'whey' })[0]).toMatchObject({ kcal: expected.kcalPerServing, protein: expected.proteinPerServing });
  });

  it('move when the food is corrected — the catalogue row is a template', () => {
    const handle = db();
    const food = createFood(handle, { at: 1, food: OATS });

    handle.update(schema.foods).set({ kcalPer100: 400 }).where(eq(schema.foods.id, food.id)).run();

    expect(getFood(handle, food.id)?.kcalPerServing).toBe(240);
  });

  it('return [] on an empty database', () => {
    const handle = db();

    expect(listFoods(handle)).toEqual([]);
    expect(quickAddCandidates(handle, when)).toEqual([]);
    expect(searchFoods(handle, { ...when, query: 'oats' })).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------
// 4. Logging: grams for weight, ml for volume.
// -------------------------------------------------------------------------------------------

describe('logging', () => {
  it('fills grams and leaves ml null for a weight food', () => {
    const handle = db();
    const food = createFood(handle, { at: 1, food: OATS });

    const receipt = logFood(handle, { ...when, foodId: food.id });

    expect(receipt.entries[0]).toMatchObject({ qty: 1, grams: 60, ml: null, kcal: 227.4, protein: 8.1 });
  });

  it('fills ml and leaves grams null for a volume food', () => {
    const handle = db();
    const food = createFood(handle, { at: 1, food: WHEY });

    const receipt = logFood(handle, { ...when, foodId: food.id });

    expect(receipt.entries[0]).toMatchObject({ qty: 1, grams: null, ml: 25, kcal: 97.5, protein: 20 });
  });

  it('logs an exact ml amount against a volume food', () => {
    const handle = db();
    const food = createFood(handle, { at: 1, food: WHEY });

    const receipt = logFood(handle, { ...when, foodId: food.id, amount: { ml: 50 } });

    expect(receipt.entries[0]).toMatchObject({ qty: 2, grams: null, ml: 50, kcal: 195, protein: 40 });
  });

  it('refuses grams against a volume food and ml against a weight food', () => {
    const handle = db();
    const oats = createFood(handle, { at: 1, food: OATS });
    const whey = createFood(handle, { at: 1, food: WHEY });

    expect(() => logFood(handle, { ...when, foodId: whey.id, amount: { grams: 30 } })).toThrow(/invalid_input/);
    expect(() => logFood(handle, { ...when, foodId: oats.id, amount: { ml: 30 } })).toThrow(/invalid_input/);
  });

  it('lands a 23:55 log on the local day, not the UTC one', () => {
    const handle = db();
    const food = createFood(handle, { at: 1, food: WHEY });

    logFood(handle, { ...when, foodId: food.id });

    // 06:55 UTC on the 10th; the user's calendar day is still the 9th.
    expect(dayLog(handle, '2025-03-09').map((e) => ({ ml: e.ml, localDate: e.localDate }))).toEqual([{ ml: 25, localDate: '2025-03-09' }]);
    expect(dayLog(handle, '2025-03-10')).toEqual([]);
  });

  it('keeps a logged ml literal when the food is later corrected — history is immutable', () => {
    const handle = db();
    const food = createFood(handle, { at: 1, food: WHEY });
    logFood(handle, { ...when, foodId: food.id });

    handle.update(schema.foods).set({ servingAmount: 50, kcalPer100: 1 }).where(eq(schema.foods.id, food.id)).run();

    expect(dayLog(handle, '2025-03-09')[0]).toMatchObject({ ml: 25, kcal: 97.5, protein: 20 });
  });

  it('excludes a soft-deleted row from the day log', () => {
    const handle = db();
    const food = createFood(handle, { at: 1, food: WHEY });
    const receipt = logFood(handle, { ...when, foodId: food.id });

    handle.update(schema.foodLog).set({ deleted: 1 }).where(eq(schema.foodLog.id, receipt.entries[0]!.id)).run();

    expect(dayLog(handle, '2025-03-09')).toEqual([]);
  });

  it('creates and logs a volume food in one go', () => {
    const handle = db();

    const { food, receipt } = createFoodAndLog(handle, { ...when, food: WHEY, amount: { ml: 75 } });

    expect(food).toMatchObject({ basis: 'volume', servingMl: 25 });
    expect(receipt.entries[0]).toMatchObject({ qty: 3, grams: null, ml: 75, kcal: 292.5 });
  });
});

// -------------------------------------------------------------------------------------------
// 5. The metric preset table (ruling 5).
// -------------------------------------------------------------------------------------------

describe('SERVING_PRESETS', () => {
  it('is metric only, and each preset carries the basis it implies', () => {
    expect(SERVING_PRESETS).toEqual([
      { label: '100 g', basis: 'weight', amount: 100 },
      { label: '100 ml', basis: 'volume', amount: 100 },
      { label: '1 cup', basis: 'volume', amount: 250 },
      { label: '1 tbsp', basis: 'volume', amount: 15 },
      { label: '1 tsp', basis: 'volume', amount: 5 },
    ]);
  });
});
