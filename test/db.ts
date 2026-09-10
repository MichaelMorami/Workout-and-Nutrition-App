/**
 * The data-layer test harness.
 *
 * Drizzle's `sqlite-core` schema runs on both the `expo-sqlite` driver (the phone) and the
 * `better-sqlite3` driver (Node), so a data-layer test can run against the *same schema* and the
 * *same migrations* the phone runs — in Node, in microseconds, with no simulator.
 *
 *   import { makeTestDb } from '@/test/db';
 *   import * as schema from '@/src/db/schema';
 *
 *   const { db } = makeTestDb({ schema });   // typed against your schema
 *   await db.insert(schema.foodLog).values(makeLogEntry({ localDate: '2025-03-09' }));
 *
 * ## Why it is fast
 *
 * Running the migrations is the expensive part (reading files, parsing SQL, creating tables) and it
 * produces the same bytes every time. So the harness runs them **once per worker process**, calls
 * `sqlite.serialize()` to snapshot the migrated database into a Buffer, and gives each test a fresh
 * database deserialised from that Buffer. Deserialising is a memcpy: tens of microseconds, versus
 * milliseconds to re-migrate. `test/harness-speed.test.ts` measures it and fails if it regresses.
 *
 * Each test therefore gets a genuinely independent database — no shared state, no truncation
 * between tests, no ordering hazards — for less than the cost of one `expect`.
 */
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getTableConfig, SQLiteSyncDialect, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { resolveSchemaSource } from './schema-source';

export type TestSchema = Record<string, unknown>;

export interface MakeTestDbOptions<TSchema extends TestSchema> {
  /**
   * The Drizzle schema module. Pass `import * as schema from '@/src/db/schema'` to get a fully
   * typed handle. Omitted, the harness discovers the app schema at runtime and falls back to the
   * throwaway fixture in `test/fixtures/` while `src/db/` is still empty.
   */
  schema?: TSchema;
  /**
   * drizzle-kit output folder. Discovered from `src/db/migrations`, `src/db/drizzle` or `drizzle/`
   * when omitted. Pass `null` to skip migrations and derive the DDL from `schema` instead — useful
   * in the minutes between writing a table and running `drizzle-kit generate`.
   */
  migrationsFolder?: string | null;
  /**
   * Skip the snapshot cache and run the migrations for real. Costs milliseconds; only the migration
   * test needs it.
   */
  fresh?: boolean;
  /** Enforce `FOREIGN KEY` constraints. Default `true` — the phone should run with them on too. */
  foreignKeys?: boolean;
  /**
   * Extra work to do **inside the snapshot** — seeding, mostly. It runs once per worker, and every
   * test after that gets its result for the price of a memcpy:
   *
   *   makeTestDb({ schema, cacheKey: 'seed-400', prepare: (t) => seedTestDb(t, { days: 400 }) })
   *
   * `cacheKey` is required alongside it, because the harness cannot tell two different `prepare`
   * functions apart. Anything the callback returns is discarded; the database bytes are the output.
   */
  prepare?: (target: { db: BetterSQLite3Database<TSchema>; sqlite: Database.Database; schema: TSchema }) => void;
  /** Distinguishes one `prepare` from another in the snapshot cache. Required with `prepare`. */
  cacheKey?: string;
}

export interface TestDb<TSchema extends TestSchema> {
  /** The typed Drizzle handle. */
  db: BetterSQLite3Database<TSchema>;
  /** The raw driver, for `PRAGMA`, `EXPLAIN QUERY PLAN` and migration assertions. */
  sqlite: Database.Database;
  /** The schema this handle was built from. */
  schema: TSchema;
  /** Release the database. Idempotent. Also runs automatically at the end of the test file. */
  close: () => void;
  /** `using db = makeTestDb()` closes at end of scope. */
  [Symbol.dispose]: () => void;
}

/** One migrated-and-serialised snapshot per (migrations folder | schema shape), per worker. */
const snapshots = new Map<string, Buffer>();

/** Everything handed out and not yet closed, so a test file cannot leak a connection. */
const open = new Set<Database.Database>();

const dialect = new SQLiteSyncDialect();

/**
 * Build a migrated in-memory database and snapshot its bytes.
 * Runs at most once per worker process per cache key.
 */
function snapshotFor(key: string, apply: (sqlite: Database.Database) => void): Buffer {
  const cached = snapshots.get(key);
  if (cached) return cached;
  const sqlite = new Database(':memory:');
  try {
    apply(sqlite);
    const buffer = sqlite.serialize();
    snapshots.set(key, buffer);
    return buffer;
  } finally {
    sqlite.close();
  }
}

/**
 * Create an isolated, migrated, in-memory database.
 *
 * Synchronous on purpose: a test that has to `await` its fixture invites `beforeEach` soup, and
 * `better-sqlite3` is synchronous anyway.
 */
export function makeTestDb<TSchema extends TestSchema = TestSchema>(
  options: MakeTestDbOptions<TSchema> = {},
): TestDb<TSchema> {
  const source = options.schema === undefined ? resolveSchemaSource() : undefined;
  const schema = (options.schema ?? source?.schema) as TSchema;

  const migrationsFolder =
    options.migrationsFolder === null
      ? undefined
      : (options.migrationsFolder ?? source?.migrationsFolder ?? discoverMigrationsFor());

  if (options.prepare && !options.cacheKey) {
    throw new Error('makeTestDb({ prepare }) needs a cacheKey — otherwise every test re-runs it');
  }

  const base = migrationsFolder ?? `ddl:${ddlFromSchema(schema).join('\n')}`;
  const key = options.cacheKey ? `${base}#${options.cacheKey}` : base;
  const build = (sqlite: Database.Database): void => {
    if (migrationsFolder) {
      migrate(drizzle(sqlite), { migrationsFolder });
    } else {
      for (const statement of ddlFromSchema(schema)) sqlite.exec(statement);
    }
    if (options.prepare) {
      const prepared = drizzle(sqlite, { schema }) as BetterSQLite3Database<TSchema>;
      options.prepare({ db: prepared, sqlite, schema });
    }
  };

  const sqlite = options.fresh
    ? (() => {
        const fresh = new Database(':memory:');
        build(fresh);
        return fresh;
      })()
    : new Database(snapshotFor(key, build));

  sqlite.pragma(`foreign_keys = ${options.foreignKeys === false ? 'OFF' : 'ON'}`);

  const db = drizzle(sqlite, { schema }) as BetterSQLite3Database<TSchema>;
  open.add(sqlite);

  const close = (): void => {
    if (open.delete(sqlite)) sqlite.close();
  };

  return { db, sqlite, schema, close, [Symbol.dispose]: close };
}

/** Close every database this file opened. Registered as a global `afterEach` in `test/setup/`. */
export function closeAllTestDbs(): void {
  for (const sqlite of open) sqlite.close();
  open.clear();
}

/** Forget the migrated snapshots — only needed by tests that change what the migrations are. */
export function resetTestDbCache(): void {
  snapshots.clear();
}

/** Rows currently in a table, tombstones included. Convenience for assertions. */
export function countRows(sqlite: Database.Database, table: string): number {
  const row = sqlite.prepare(`select count(*) as n from "${table}"`).get() as { n: number };
  return row.n;
}

/** Table names in the database, excluding SQLite's and Drizzle's own bookkeeping. */
export function tableNames(sqlite: Database.Database): string[] {
  const rows = sqlite
    .prepare(`select name from sqlite_master where type = 'table' order by name`)
    .all() as { name: string }[];
  return rows.map((r) => r.name).filter((n) => !n.startsWith('sqlite_') && !n.startsWith('__drizzle'));
}

/** The migration tags recorded as applied, oldest first. */
export function appliedMigrations(sqlite: Database.Database): number[] {
  const exists = sqlite
    .prepare(`select name from sqlite_master where type='table' and name='__drizzle_migrations'`)
    .get();
  if (!exists) return [];
  const rows = sqlite
    .prepare(`select created_at from __drizzle_migrations order by created_at`)
    .all() as { created_at: number }[];
  return rows.map((r) => r.created_at);
}

/** The caller passed a schema but no folder — use whatever drizzle-kit output the repo has. */
function discoverMigrationsFor(): string | undefined {
  return resolveSchemaSource().migrationsFolder;
}

/**
 * DDL derived straight from the Drizzle table objects — the bridge for the window between
 * `db-engineer` writing a table and running `drizzle-kit generate`. Real migrations always win
 * when they exist; this deliberately covers only what a Drizzle SQLite schema can express in
 * `CREATE TABLE`: columns, defaults, primary keys, uniques, foreign keys and indexes.
 */
export function ddlFromSchema(schema: TestSchema): string[] {
  const tables = Object.values(schema).filter(
    (value): value is SQLiteTable => value instanceof SQLiteTable,
  );
  const creates: string[] = [];
  const indexes: string[] = [];

  for (const table of tables) {
    const config = getTableConfig(table);
    const parts: string[] = [];

    for (const column of config.columns) {
      let def = `"${column.name}" ${column.getSQLType()}`;
      if (column.primary) def += ' PRIMARY KEY';
      if (column.notNull) def += ' NOT NULL';
      if (column.hasDefault && column.default !== undefined) {
        def += ` DEFAULT ${literal(column.default)}`;
      }
      parts.push(def);
    }

    for (const pk of config.primaryKeys) {
      parts.push(`PRIMARY KEY (${pk.columns.map((c) => `"${c.name}"`).join(', ')})`);
    }
    for (const unique of config.uniqueConstraints) {
      parts.push(`UNIQUE (${unique.columns.map((c) => `"${c.name}"`).join(', ')})`);
    }
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      const from = ref.columns.map((c) => `"${c.name}"`).join(', ');
      const to = ref.foreignColumns.map((c) => `"${c.name}"`).join(', ');
      const target = getTableConfig(ref.foreignTable).name;
      parts.push(`FOREIGN KEY (${from}) REFERENCES "${target}" (${to})`);
    }

    creates.push(`CREATE TABLE "${config.name}" (\n  ${parts.join(',\n  ')}\n)`);

    for (const index of config.indexes) {
      const cfg = index.config;
      const columns = cfg.columns
        .map((c) => ('name' in c ? `"${String(c.name)}"` : dialect.sqlToQuery(c).sql))
        .join(', ');
      indexes.push(
        `CREATE ${cfg.unique ? 'UNIQUE ' : ''}INDEX "${cfg.name}" ON "${config.name}" (${columns})`,
      );
    }
  }

  return [...creates, ...indexes];
}

function literal(value: unknown): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === 'object' && value !== null && 'queryChunks' in value) {
    return dialect.sqlToQuery(value as ReturnType<typeof sql.raw>).sql;
  }
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}
