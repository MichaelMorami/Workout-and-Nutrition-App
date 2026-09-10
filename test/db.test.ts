/**
 * What `makeTestDb()` promises the rest of the team.
 *
 * These are the guarantees every other agent's data test silently depends on. If one of them
 * breaks, tests elsewhere start passing or failing for reasons that have nothing to do with the
 * code under test — the worst possible failure mode for a test suite.
 */
import { sql } from 'drizzle-orm';
import { countRows, ddlFromSchema, makeTestDb, tableNames } from './db';
import { makeFood, makeLogEntry, tombstone } from './factories';
import * as schema from './schema';

describe('a database from makeTestDb()', () => {
  it('has every table the migrations create', () => {
    const { sqlite } = makeTestDb({ schema });
    expect(tableNames(sqlite).sort()).toEqual(['body_metrics', 'food_log', 'foods']);
  });

  it('accepts and returns rows built by the factories without any translation', () => {
    // The factories and the schema are written by different people from the same document. This is
    // the test that fails when they drift apart.
    const { db } = makeTestDb({ schema });
    const food = makeFood({ name: 'Skyr', brand: 'Arla', kcalPerServing: 120, proteinPerServing: 20 });

    db.insert(schema.foods).values(food).run();

    expect(db.select().from(schema.foods).all()).toEqual([food]);
  });

  it('starts empty in every test, with no leakage from the test before it', () => {
    // Deliberately paired with the test below: whichever order Jest runs them in, both must pass.
    const { db } = makeTestDb({ schema });
    expect(db.select().from(schema.foods).all()).toEqual([]);
    db.insert(schema.foods).values(makeFood({ name: 'left over from the first test' })).run();
    expect(countRows(makeTestDb({ schema }).sqlite, 'foods')).toBe(0);
  });

  it('starts empty in this test too', () => {
    const { db } = makeTestDb({ schema });
    expect(db.select().from(schema.foods).all()).toEqual([]);
  });

  it('isolates two handles taken in the same test from each other', () => {
    const a = makeTestDb({ schema });
    const b = makeTestDb({ schema });
    a.db.insert(schema.foods).values(makeFood()).run();

    expect(countRows(a.sqlite, 'foods')).toBe(1);
    expect(countRows(b.sqlite, 'foods')).toBe(0);
  });

  it('enforces foreign keys, the way the phone does', () => {
    const { db } = makeTestDb({ schema });
    const orphan = makeLogEntry({ foodId: '00000000-0000-4000-8000-000000000000' });

    expect(() => db.insert(schema.foodLog).values(orphan).run()).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('can be told to relax foreign keys for a test that is about something else', () => {
    const { db } = makeTestDb({ schema, foreignKeys: false });
    const orphan = makeLogEntry({ foodId: '00000000-0000-4000-8000-000000000000' });

    expect(() => db.insert(schema.foodLog).values(orphan).run()).not.toThrow();
  });

  it('enforces the unique index on body_metrics.local_date', () => {
    // One weigh-in per calendar day. Two rows for one day would double-count on every chart.
    const { sqlite } = makeTestDb({ schema });
    const insert = sqlite.prepare(
      'insert into body_metrics (id, local_date, weight, updated_at, deleted) values (?, ?, ?, ?, 0)',
    );
    insert.run('a', '2025-03-09', 88.2, 1);

    expect(() => insert.run('b', '2025-03-09', 88.4, 2)).toThrow(/UNIQUE constraint failed/);
  });

  it('keeps a tombstoned row in the table rather than deleting it', () => {
    // Invariant #3, at the storage level: a hard delete cannot be synchronised.
    const { db, sqlite } = makeTestDb({ schema });
    const food = makeFood();
    db.insert(schema.foods).values(food).run();

    db.update(schema.foods).set(tombstone(food, 1_741_600_000_000)).run();

    expect(countRows(sqlite, 'foods')).toBe(1);
    expect(db.select().from(schema.foods).all()[0]).toMatchObject({ deleted: 1, updatedAt: 1_741_600_000_000 });
  });

  it('closes cleanly and refuses to be used afterwards', () => {
    const { db, close } = makeTestDb({ schema });
    close();
    close(); // idempotent

    expect(() => db.select().from(schema.foods).all()).toThrow(/database connection is not open/);
  });

  it('exposes the raw driver, so a query plan can be asserted on', () => {
    // Priority #3 is "instant graphs". An index that exists but is not used is not an index, and
    // this is how a chart test proves it is hitting one.
    const { sqlite } = makeTestDb({ schema });
    const plan = sqlite
      .prepare('explain query plan select * from food_log where local_date = ?')
      .all('2025-03-09') as { detail: string }[];

    expect(plan.map((p) => p.detail).join(' ')).toMatch(/USING INDEX food_log_local_date_idx/);
  });

  it('is left open for the whole test and closed for you afterwards', () => {
    // The handle here is deliberately never closed; `test/setup/common.ts` closes it. If it did
    // not, a long suite would run out of file handles and the failure would look like anything
    // except a missing `close()`.
    const { sqlite } = makeTestDb({ schema });
    expect(sqlite.open).toBe(true);
  });
});

describe('makeTestDb() without generated migrations', () => {
  it('builds the tables straight from the Drizzle schema instead', () => {
    // The window between `db-engineer` writing a table and running `drizzle-kit generate`. Without
    // this, the red step of a schema change is blocked on a code-generation step.
    const { sqlite } = makeTestDb({ schema, migrationsFolder: null });
    expect(tableNames(sqlite).sort()).toEqual(['body_metrics', 'food_log', 'foods']);
  });

  it('reproduces the columns, defaults, indexes and foreign keys the migrations produce', () => {
    const migrated = makeTestDb({ schema });
    const derived = makeTestDb({ schema, migrationsFolder: null });

    const shapeOf = (s: typeof migrated.sqlite): unknown =>
      tableNames(s).map((table) => ({
        table,
        columns: (s.prepare(`pragma table_info("${table}")`).all() as { name: string; type: string; notnull: number }[])
          .map((c) => `${c.name} ${c.type}${c.notnull ? ' NOT NULL' : ''}`)
          .sort(),
        foreignKeys: (s.prepare(`pragma foreign_key_list("${table}")`).all() as { table: string; from: string }[])
          .map((f) => `${f.from} -> ${f.table}`)
          .sort(),
        indexes: (s.prepare(`pragma index_list("${table}")`).all() as { name: string; unique: number }[])
          .filter((i) => !i.name.startsWith('sqlite_'))
          .map((i) => `${i.name}${i.unique ? ' unique' : ''}`)
          .sort(),
      }));

    expect(shapeOf(derived.sqlite)).toEqual(shapeOf(migrated.sqlite));
  });

  it('emits DDL for every table in the schema', () => {
    const statements = ddlFromSchema(schema);
    expect(statements.filter((s) => s.startsWith('CREATE TABLE'))).toHaveLength(3);
    expect(statements.some((s) => s.includes('CREATE UNIQUE INDEX "body_metrics_local_date_idx"'))).toBe(true);
    expect(statements.some((s) => s.includes('DEFAULT 0'))).toBe(true);
  });

  it('ignores exports from the schema module that are not tables', () => {
    const statements = ddlFromSchema({ ...schema, notATable: 42, alsoNot: sql`select 1` });
    expect(statements.filter((s) => s.startsWith('CREATE TABLE'))).toHaveLength(3);
  });
});
