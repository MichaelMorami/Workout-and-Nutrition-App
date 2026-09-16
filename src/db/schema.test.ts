/**
 * What the schema promises, proven against the real migrations on real SQLite.
 *
 * Every test here runs the drizzle-kit output in `src/db/migrations/` (the same SQL the phone runs),
 * not DDL derived from the TypeScript. A constraint that exists in `schema.ts` but not in a
 * migration is a constraint the phone does not have.
 */
import type Database from 'better-sqlite3';
import { eq, getTableName } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { makeTestDb, tableNames } from '../../test/db';
import { makeBodyMetric, makeLogEntry, makeMeal, makeMealItem } from '../../test/factories';
// `foods` rows come from the #86 fixture: `test/factories.ts` is qa-engineer's and still builds the
// pre-#86 per-serving shape. `test/db.test.ts` is the drift alarm that catches that; see the PR body.
import { makeFood } from './test-support/foods';
import * as schema from './schema';
import { foldSql } from './search-fold';

/** 23:55 on Sunday 9 March 2025 in America/Los_Angeles — 06:55 UTC on the 10th. */
const LATE_SNACK_AT = 1_741_589_700_000;

const schemaTables = Object.values(schema as Record<string, unknown>).filter(
  (value): value is SQLiteTable => value instanceof SQLiteTable,
);

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/** Column metadata, with the declared type lower-cased: SQLite reports it in whatever case it likes. */
const columnsOf = (sqlite: Database.Database, table: string): ColumnInfo[] =>
  (sqlite.prepare(`pragma table_info("${table}")`).all() as ColumnInfo[]).map((c) => ({ ...c, type: c.type.toLowerCase() }));

/**
 * A minimal valid row for every table, as raw column values. Used where a test is about one
 * column's constraint and needs every *other* column to be fine.
 */
function validRow(table: string, id: string): Record<string, unknown> {
  const sync = { id, updated_at: LATE_SNACK_AT, deleted: 0 };
  switch (table) {
    case 'foods':
      return { ...sync, name: 'Skyr', basis: 'weight', serving_label: '1 pot', serving_amount: 170, kcal_per_100: 70.6, protein_per_100: 11.8 };
    case 'meals':
      return { ...sync, name: 'Usual breakfast' };
    case 'meal_items':
      return { ...sync, meal_id: 'meal-1', food_id: 'food-1', qty: 1 };
    case 'food_log':
      return { ...sync, logged_at: LATE_SNACK_AT, local_date: '2025-03-09', local_minute: 1435, qty: 1, kcal: 214, protein: 21, slot: 'snack' };
    case 'body_metrics':
      return { ...sync, measured_at: LATE_SNACK_AT, local_date: '2025-03-09', weight: 83.4 };
    case 'settings':
      return { ...sync, kcal_target: 2400, protein_target: 170, week_start: 1 };
    default:
      throw new Error(`no valid row defined for table ${table} — add one when you add the table`);
  }
}

function insertRaw(sqlite: Database.Database, table: string, row: Record<string, unknown>): void {
  const keys = Object.keys(row);
  sqlite
    .prepare(`insert into "${table}" (${keys.map((k) => `"${k}"`).join(', ')}) values (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map((k) => row[k]));
}

describe('the tables', () => {
  it('are the Sprint 1 nutrition tables, settings, and body_metrics', () => {
    const { sqlite } = makeTestDb({ schema });
    expect(tableNames(sqlite).sort()).toEqual(['body_metrics', 'food_log', 'foods', 'meal_items', 'meals', 'settings']);
  });

  it('are exactly the tables the schema module exports, so neither side has a stray one', () => {
    const { sqlite } = makeTestDb({ schema });
    const exported = schemaTables.map((t) => getTableName(t)).sort();
    expect(exported).toEqual(tableNames(sqlite).sort());
  });

  it.each(['body_metrics', 'food_log', 'foods', 'meal_items', 'meals', 'settings'])(
    '%s carries id, updated_at and deleted, the way sync needs every table to',
    (table) => {
      const { sqlite } = makeTestDb({ schema });
      const columns = new Map(columnsOf(sqlite, table).map((c) => [c.name, c]));

      expect(columns.get('id')).toMatchObject({ type: 'text', pk: 1, notnull: 1 });
      expect(columns.get('updated_at')).toMatchObject({ type: 'integer', notnull: 1 });
      expect(columns.get('deleted')).toMatchObject({ type: 'integer', notnull: 1, dflt_value: '0' });
    },
  );

  it.each(['body_metrics', 'food_log', 'foods', 'meal_items', 'meals', 'settings'])(
    '%s refuses a deleted flag that is not 0 or 1',
    (table) => {
      const { sqlite } = makeTestDb({ schema, foreignKeys: false });

      expect(() => insertRaw(sqlite, table, { ...validRow(table, 'a'), deleted: 1 })).not.toThrow();
      expect(() => insertRaw(sqlite, table, { ...validRow(table, 'b'), deleted: 2 })).toThrow(/CHECK constraint failed/);
    },
  );

  it('accept the rows the harness factories build, with only the new required columns added', () => {
    const { db } = makeTestDb({ schema });
    const food = makeFood();
    const meal = makeMeal();
    db.insert(schema.foods).values(food).run();
    db.insert(schema.meals).values(meal).run();
    db.insert(schema.mealItems).values(makeMealItem({ mealId: meal.id, foodId: food.id })).run();
    db.insert(schema.foodLog).values({ ...makeLogEntry({ foodId: food.id }), localMinute: 1435 }).run();
    db.insert(schema.bodyMetrics).values({ ...makeBodyMetric(), measuredAt: LATE_SNACK_AT }).run();

    expect(db.select().from(schema.foodLog).all()).toHaveLength(1);
    expect(db.select().from(schema.bodyMetrics).all()).toHaveLength(1);
  });
});

describe('foreign keys', () => {
  it('are declared on every reference', () => {
    const { sqlite } = makeTestDb({ schema });
    const refs = (table: string): string[] =>
      (sqlite.prepare(`pragma foreign_key_list("${table}")`).all() as { from: string; table: string; to: string }[])
        .map((f) => `${f.from} -> ${f.table}.${f.to}`)
        .sort();

    expect(refs('meal_items')).toEqual(['food_id -> foods.id', 'meal_id -> meals.id']);
    expect(refs('food_log')).toEqual(['food_id -> foods.id', 'meal_id -> meals.id']);
    expect(refs('foods')).toEqual([]);
    expect(refs('meals')).toEqual([]);
    expect(refs('body_metrics')).toEqual([]);
    expect(refs('settings')).toEqual([]);
  });

  it.each([
    ['food_log', 'food_id'],
    ['food_log', 'meal_id'],
    ['meal_items', 'food_id'],
    ['meal_items', 'meal_id'],
  ])('are enforced: %s.%s cannot point at a row that does not exist', (table, column) => {
    const { sqlite } = makeTestDb({ schema });
    insertRaw(sqlite, 'foods', validRow('foods', 'food-1'));
    insertRaw(sqlite, 'meals', validRow('meals', 'meal-1'));
    const base = table === 'food_log' ? { ...validRow(table, 'x'), food_id: 'food-1', meal_id: 'meal-1' } : validRow(table, 'x');

    expect(() => insertRaw(sqlite, table, { ...base, id: 'fine' })).not.toThrow();
    expect(() => insertRaw(sqlite, table, { ...base, id: 'orphan', [column]: 'no-such-row' })).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('let a log row stand on its own, with no food and no meal', () => {
    // Invariant #2: a log is a fact, not a join.
    const { db } = makeTestDb({ schema });
    expect(() => db.insert(schema.foodLog).values({ ...makeLogEntry(), localMinute: 0 }).run()).not.toThrow();
  });
});

describe('indexes', () => {
  const expected: [table: string, index: string, columns: string[], unique: boolean][] = [
    ['food_log', 'food_log_local_date_idx', ['local_date'], false],
    ['food_log', 'food_log_food_id_idx', ['food_id'], false],
    ['food_log', 'food_log_meal_id_idx', ['meal_id'], false],
    ['foods', 'foods_use_count_idx', ['use_count'], false],
    ['foods', 'foods_last_used_at_idx', ['last_used_at'], false],
    ['meal_items', 'meal_items_meal_id_idx', ['meal_id'], false],
    ['meal_items', 'meal_items_food_id_idx', ['food_id'], false],
    ['body_metrics', 'body_metrics_local_date_idx', ['local_date'], true],
  ];

  it.each(expected)('%s has %s on (%s)', (table, index, columns, unique) => {
    const { sqlite } = makeTestDb({ schema });
    const list = sqlite.prepare(`pragma index_list("${table}")`).all() as { name: string; unique: number }[];
    const info = sqlite.prepare(`pragma index_info("${index}")`).all() as { name: string }[];

    expect(list.find((i) => i.name === index)).toMatchObject({ unique: unique ? 1 : 0 });
    expect(info.map((c) => c.name)).toEqual(columns);
  });

  it.each([
    ['food_log', 'food_log_local_date_idx'],
    ['body_metrics', 'body_metrics_local_date_idx'],
  ])('a day read on %s uses %s rather than scanning', (table, index) => {
    const { sqlite } = makeTestDb({ schema });
    const plan = sqlite
      .prepare(`explain query plan select * from "${table}" where deleted = 0 and local_date between ? and ?`)
      .all('2024-02-04', '2025-03-09') as { detail: string }[];

    expect(plan.map((p) => p.detail).join(' ')).toMatch(new RegExp(`USING INDEX ${index}`));
  });

  it('allows one weigh-in per calendar day, a tombstoned one included', () => {
    // Two rows for one day would double-count on every chart. A tombstone still holds its day, so
    // re-weighing after a delete must revive that row rather than insert a second one.
    const { sqlite } = makeTestDb({ schema });
    insertRaw(sqlite, 'body_metrics', { ...validRow('body_metrics', 'a'), deleted: 1 });

    expect(() => insertRaw(sqlite, 'body_metrics', validRow('body_metrics', 'b'))).toThrow(/UNIQUE constraint failed/);
  });
});

describe('dated rows', () => {
  it.each([
    ['food_log', 'logged_at'],
    ['body_metrics', 'measured_at'],
  ])('%s stores local_date next to its UTC timestamp %s', (table, timestamp) => {
    const { sqlite } = makeTestDb({ schema });
    const columns = new Map(columnsOf(sqlite, table).map((c) => [c.name, c]));

    expect(columns.get('local_date')).toMatchObject({ type: 'text', notnull: 1 });
    expect(columns.get(timestamp)).toMatchObject({ type: 'integer', notnull: 1 });
  });

  it('has no table with a local_date and no UTC timestamp beside it', () => {
    const { sqlite } = makeTestDb({ schema });
    const TIMESTAMPS = ['logged_at', 'measured_at'];
    for (const table of tableNames(sqlite)) {
      const names = columnsOf(sqlite, table).map((c) => c.name);
      if (names.includes('local_date')) {
        expect([table, names.some((n) => TIMESTAMPS.includes(n))]).toEqual([table, true]);
      }
    }
  });

  it.each([
    ['food_log', '2025-03-10T06:55:00.000Z'],
    ['food_log', '2025-3-9'],
    ['food_log', '09/03/2025'],
    ['body_metrics', '2025-03-10T06:55:00.000Z'],
    ['body_metrics', ''],
  ])('%s refuses %j as a local_date — the UTC-derived-day bug, caught by the database', (table, localDate) => {
    const { sqlite } = makeTestDb({ schema });
    expect(() => insertRaw(sqlite, table, { ...validRow(table, 'x'), local_date: localDate })).toThrow(
      /CHECK constraint failed/,
    );
  });

  it('keeps food_log.local_minute on the wall clock: 0 to 1439 and nothing else', () => {
    const { sqlite } = makeTestDb({ schema });
    const row = (id: string, localMinute: number) => ({ ...validRow('food_log', id), local_minute: localMinute });

    expect(() => insertRaw(sqlite, 'food_log', row('midnight', 0))).not.toThrow();
    expect(() => insertRaw(sqlite, 'food_log', row('23:59', 1439))).not.toThrow();
    expect(() => insertRaw(sqlite, 'food_log', row('past', 1440))).toThrow(/CHECK constraint failed/);
    expect(() => insertRaw(sqlite, 'food_log', row('before', -1))).toThrow(/CHECK constraint failed/);
  });
});

describe('history is immutable', () => {
  it('keeps a log row’s literal kcal and protein when the food is corrected afterwards', () => {
    const { db } = makeTestDb({ schema });
    const food = makeFood({ name: 'Protein bar', kcalPerServing: 214, proteinPerServing: 21 });
    db.insert(schema.foods).values(food).run();
    db.insert(schema.foodLog)
      .values({ ...makeLogEntry({ foodId: food.id, kcal: 214, protein: 21, qty: 1 }), localMinute: 1435, grams: 60 })
      .run();
    const before = db.select().from(schema.foodLog).all();

    db.update(schema.foods)
      .set({ name: 'Protein bar (new recipe)', kcalPer100: 360, proteinPer100: 36.4, servingAmount: 55, updatedAt: LATE_SNACK_AT + 1 })
      .where(eq(schema.foods.id, food.id))
      .run();

    expect(db.select().from(schema.foodLog).all()).toEqual(before);
    expect(before[0]).toMatchObject({ kcal: 214, protein: 21, grams: 60 });
  });

  it.each([
    ['qty', 0],
    ['qty', -1],
    ['kcal', -0.1],
    ['protein', -0.1],
    ['grams', 0],
  ])('refuses a food_log.%s of %d', (column, value) => {
    const { sqlite } = makeTestDb({ schema });
    expect(() => insertRaw(sqlite, 'food_log', { ...validRow('food_log', 'x'), [column]: value })).toThrow(
      /CHECK constraint failed/,
    );
  });

  it.each([
    ['foods', 'serving_amount', 0],
    ['foods', 'serving_amount', -1],
    ['foods', 'kcal_per_100', -1],
    ['foods', 'protein_per_100', -1],
    ['foods', 'archived', 2],
    ['foods', 'use_count', -1],
    ['meal_items', 'qty', 0],
    ['body_metrics', 'weight', 0],
    ['body_metrics', 'body_fat_pct', 101],
    ['body_metrics', 'waist', 0],
    ['settings', 'kcal_target', -1],
    ['settings', 'week_start', 7],
  ])('refuses %s.%s = %d', (table, column, value) => {
    const { sqlite } = makeTestDb({ schema, foreignKeys: false });
    expect(() => insertRaw(sqlite, table, { ...validRow(table, 'x'), [column]: value })).toThrow(/CHECK constraint failed/);
  });

  it('stores canonical grams on the log and leaves it null for a food with no serving weight', () => {
    const { sqlite } = makeTestDb({ schema });
    expect(() => insertRaw(sqlite, 'food_log', { ...validRow('food_log', 'no-grams'), grams: null })).not.toThrow();
    expect(columnsOf(sqlite, 'food_log').find((c) => c.name === 'grams')).toMatchObject({ type: 'real', notnull: 0 });
  });
});

describe('settings', () => {
  it('holds the targets and the week start, and no unit switch (decision 3: kg and cm only)', () => {
    const { sqlite } = makeTestDb({ schema });
    const names = columnsOf(sqlite, 'settings').map((c) => c.name).sort();

    expect(names).toEqual(['deleted', 'id', 'kcal_target', 'protein_target', 'updated_at', 'week_start']);
  });
});

describe('search_text', () => {
  const searchTextOf = (sqlite: Database.Database, table: string, id: string): string =>
    (sqlite.prepare(`select search_text from "${table}" where id = ?`).get(id) as { search_text: string }).search_text;

  it('is folded from name and brand the moment a food is inserted', () => {
    const { db, sqlite } = makeTestDb({ schema });
    db.insert(schema.foods).values(makeFood({ id: 'a', name: 'Crème Fraîche', brand: 'Président' })).run();
    db.insert(schema.foods).values(makeFood({ id: 'b', name: 'Boiled eggs', brand: null })).run();

    expect(searchTextOf(sqlite, 'foods', 'a')).toBe('creme fraiche president');
    expect(searchTextOf(sqlite, 'foods', 'b')).toBe('boiled eggs');
  });

  it('follows every change to the name or the brand', () => {
    const { db, sqlite } = makeTestDb({ schema });
    db.insert(schema.foods).values(makeFood({ id: 'a', name: 'Skyr', brand: 'Arla' })).run();

    db.update(schema.foods).set({ name: 'Skyr Vanille' }).where(eq(schema.foods.id, 'a')).run();
    expect(searchTextOf(sqlite, 'foods', 'a')).toBe('skyr vanille arla');

    db.update(schema.foods).set({ brand: 'Isey Skyr' }).where(eq(schema.foods.id, 'a')).run();
    expect(searchTextOf(sqlite, 'foods', 'a')).toBe('skyr vanille isey skyr');

    db.update(schema.foods).set({ brand: null }).where(eq(schema.foods.id, 'a')).run();
    expect(searchTextOf(sqlite, 'foods', 'a')).toBe('skyr vanille');
  });

  it('is maintained even for a writer that sets it to something else, like a sync upsert', () => {
    const { sqlite } = makeTestDb({ schema });
    insertRaw(sqlite, 'foods', { ...validRow('foods', 'a'), name: 'Açaí bowl', search_text: 'stale' });
    expect(searchTextOf(sqlite, 'foods', 'a')).toBe('acai bowl');

    sqlite.prepare(`update foods set name = 'Pâté', search_text = 'stale' where id = 'a'`).run();
    expect(searchTextOf(sqlite, 'foods', 'a')).toBe('pate');
  });

  it('is folded from the name on meals, on insert and on rename', () => {
    const { db, sqlite } = makeTestDb({ schema });
    db.insert(schema.meals).values(makeMeal({ id: 'm', name: 'Petit-déjeuner' })).run();
    expect(searchTextOf(sqlite, 'meals', 'm')).toBe('petit dejeuner');

    db.update(schema.meals).set({ name: 'Post-gym Shake' }).where(eq(schema.meals.id, 'm')).run();
    expect(searchTextOf(sqlite, 'meals', 'm')).toBe('post gym shake');
  });

  const CORPUS: [input: string, folded: string][] = [
    ['CRÈME FRAÎCHE', 'creme fraiche'],
    ['Smørrebrød', 'smorrebrod'],
    ['Käsespätzle', 'kasespatzle'],
    ['Weißwurst', 'weisswurst'],
    ['Œufs brouillés', 'oeufs brouilles'],
    ['Jalapeño', 'jalapeno'],
    ['Żurek łódzki', 'zurek lodzki'],
    ['Créme', 'creme'], // decomposed: e + combining acute, as some keyboards type it
    ['Semi-skimmed (1.7%)', 'semi skimmed  1 7% '], // punctuation becomes a word break, not nothing
    ["M&M's", 'm m s'],
    ['Ben & Jerry’s', 'ben   jerry s'], // U+2019: iOS Smart Punctuation turns ' into ’ by default
    ['‘Nduja', ' nduja'], // U+2018
    ['Coca–Cola', 'coca cola'], // U+2013 en dash
    ['Coca—Cola', 'coca cola'], // U+2014 em dash
    ['"Lite" yogurt', ' lite  yogurt'],
    ['“Lite” yogurt', ' lite  yogurt'], // U+201C/U+201D: Smart Punctuation again
  ];

  it.each([
    [['Coca-Cola', 'Coca–Cola', 'Coca—Cola'], ['coca', 'cola']],
    [['Lite yogurt', '"Lite" yogurt', '“Lite” yogurt'], ['lite', 'yogurt']],
  ])('folds every spelling of %j to the same search words', (spellings, words) => {
    // A search splits the query on whitespace (§3), so words are what has to agree, not spaces.
    const { sqlite } = makeTestDb({ schema });
    spellings.forEach((name, i) => insertRaw(sqlite, 'foods', { ...validRow('foods', `f${i}`), name }));

    expect(spellings.map((_, i) => searchTextOf(sqlite, 'foods', `f${i}`).split(/\s+/).filter(Boolean))).toEqual(
      spellings.map(() => words),
    );
  });

  it.each([
    ['typed on an iPhone (’), searched with a straight apostrophe', 'Ben & Jerry’s', "jerry's"],
    ['typed with a straight apostrophe, searched on an iPhone (’)', "Ben & Jerry's", 'jerry’s'],
  ])('matches a food %s', (_, name, query) => {
    const { sqlite } = makeTestDb({ schema });
    insertRaw(sqlite, 'foods', { ...validRow('foods', 'a'), name });
    const hits = sqlite.prepare(`select id from foods where search_text like '%' || ${foldSql('?')} || '%'`).all(query);

    expect(searchTextOf(sqlite, 'foods', 'a')).toBe('ben   jerry s');
    expect(hits).toEqual([{ id: 'a' }]);
  });

  it.each(CORPUS)('folds %j to %j', (input, folded) => {
    const { sqlite } = makeTestDb({ schema });
    insertRaw(sqlite, 'foods', { ...validRow('foods', 'a'), name: input });
    expect(searchTextOf(sqlite, 'foods', 'a')).toBe(folded);
  });

  it.each(CORPUS)('folds %j in the trigger exactly as foldSql() folds a query string', (input) => {
    // The query side and the write side must be the same function, or a search silently misses.
    const { sqlite } = makeTestDb({ schema });
    insertRaw(sqlite, 'foods', { ...validRow('foods', 'a'), name: input });
    const query = sqlite.prepare(`select ${foldSql('?')} as folded`).get(input) as { folded: string };

    expect(searchTextOf(sqlite, 'foods', 'a')).toBe(query.folded);
  });
});
