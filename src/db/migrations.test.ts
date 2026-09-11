/**
 * The migrations, asked the two questions that matter:
 *
 *   1. do they build a correct database from empty?              (a fresh install)
 *   2. do they carry a database with history in it forward?     (every update after that)
 *
 * and a third, because the phone does not run the Node migrator:
 *
 *   3. does the bundle the phone imports produce the *same* database, through drizzle's own
 *      expo-sqlite migrator?
 *
 * Question 2 is generic on purpose. It migrates to every earlier version, fills every table with a
 * row using whichever columns existed at that version, migrates to the current one and asserts that
 * not a single value moved. A future migration that rebuilds a table and drops history fails here
 * without anyone having to remember to write a test for it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate as migrateOnPhone } from 'drizzle-orm/expo-sqlite/migrator';
import { appliedMigrations, ddlFromSchema, tableNames } from '../../test/db';
import bundle from './migrations/bundle';
import * as schema from './schema';
import { foldSql, SEARCH_TRIGGERS, searchTriggerSql } from './search-fold';

const FOLDER = path.join(__dirname, 'migrations');

interface Journal {
  version: string;
  dialect: string;
  entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
}

const journal = JSON.parse(fs.readFileSync(path.join(FOLDER, 'meta', '_journal.json'), 'utf8')) as Journal;

/** The drizzle-kit folder as it stood after the first `count` migrations: a phone on an older build. */
function folderAtVersion(count: number): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-db-migrations-'));
  fs.mkdirSync(path.join(out, 'meta'));
  const entries = journal.entries.slice(0, count);
  for (const entry of entries) {
    fs.copyFileSync(path.join(FOLDER, `${entry.tag}.sql`), path.join(out, `${entry.tag}.sql`));
  }
  fs.writeFileSync(path.join(out, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
  return out;
}

function migrated(folder: string = FOLDER): Database.Database {
  const sqlite = new Database(':memory:');
  migrate(drizzle(sqlite), { migrationsFolder: folder });
  return sqlite;
}

/** Everything about a database's structure that a query could depend on. */
function shapeOf(sqlite: Database.Database): unknown {
  return tableNames(sqlite).map((table) => ({
    table,
    columns: (sqlite.prepare(`pragma table_info("${table}")`).all() as { name: string; type: string; notnull: number; pk: number }[])
      .map((c) => `${c.name} ${c.type}${c.notnull ? ' NOT NULL' : ''}${c.pk ? ' PK' : ''}`)
      .sort(),
    foreignKeys: (sqlite.prepare(`pragma foreign_key_list("${table}")`).all() as { from: string; table: string; to: string }[])
      .map((f) => `${f.from} -> ${f.table}.${f.to}`)
      .sort(),
    indexes: (sqlite.prepare(`pragma index_list("${table}")`).all() as { name: string; unique: number }[])
      .filter((i) => !i.name.startsWith('sqlite_'))
      .map((i) => {
        const cols = (sqlite.prepare(`pragma index_info("${i.name}")`).all() as { name: string }[]).map((c) => c.name);
        return `${i.name}(${cols.join(',')})${i.unique ? ' unique' : ''}`;
      })
      .sort(),
  }));
}

/** Every schema object's DDL, minus drizzle's bookkeeping table (whose hash differs by migrator). */
function ddlOf(sqlite: Database.Database): { type: string; name: string; sql: string | null }[] {
  return sqlite
    .prepare(`select type, name, sql from sqlite_master where name not like '__drizzle%' and name not like 'sqlite_%' order by type, name`)
    .all() as { type: string; name: string; sql: string | null }[];
}

/** A full row per table, one value per current column. Older versions insert the subset they have. */
const HISTORY: Record<string, Record<string, unknown>[]> = {
  foods: [
    {
      id: 'food-1', name: 'Crème fraîche', brand: 'Président', serving_label: '30 g', serving_grams: 30,
      kcal_per_serving: 87, protein_per_serving: 0.7, archived: 0, use_count: 1, last_used_at: 1_741_589_700_000,
      hour_histogram: JSON.stringify([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
      updated_at: 1_700_000_000_000, deleted: 0,
    },
  ],
  meals: [{ id: 'meal-1', name: 'Petit-déjeuner', use_count: 0, last_used_at: null, hour_histogram: null, updated_at: 1_700_000_000_000, deleted: 0 }],
  meal_items: [{ id: 'item-1', meal_id: 'meal-1', food_id: 'food-1', qty: 1.5, updated_at: 1_700_000_000_000, deleted: 0 }],
  food_log: [
    {
      id: 'log-1', logged_at: 1_741_589_700_000, local_date: '2025-03-09', local_minute: 1435, food_id: 'food-1',
      meal_id: null, qty: 1, grams: 30, kcal: 87, protein: 0.7, slot: 'snack', updated_at: 1_741_589_700_000, deleted: 0,
    },
  ],
  body_metrics: [
    {
      id: 'body-1', measured_at: 1_741_530_600_000, local_date: '2025-03-09', weight: 83.4, body_fat_pct: 17.2,
      waist: 84, chest: 102, arm: 36, updated_at: 1_741_530_600_000, deleted: 0,
    },
  ],
  settings: [{ id: '00000000-0000-4000-8000-000000000001', kcal_target: 2400, protein_target: 170, week_start: 1, updated_at: 1_700_000_000_000, deleted: 0 }],
};

/** Parents before children, so the history inserts with foreign keys on. */
const INSERT_ORDER = ['foods', 'meals', 'meal_items', 'food_log', 'body_metrics', 'settings'];

describe('the migrations', () => {
  it('are drizzle-kit sqlite output, with a .sql file for every journal entry', () => {
    expect(journal.dialect).toBe('sqlite');
    expect(journal.entries.length).toBeGreaterThan(0);
    for (const entry of journal.entries) {
      expect([entry.tag, fs.existsSync(path.join(FOLDER, `${entry.tag}.sql`))]).toEqual([entry.tag, true]);
    }
  });

  it('run forward cleanly from an empty database', () => {
    const sqlite = new Database(':memory:');

    expect(() => migrate(drizzle(sqlite), { migrationsFolder: FOLDER })).not.toThrow();
    expect(tableNames(sqlite).sort()).toEqual(['body_metrics', 'food_log', 'foods', 'meal_items', 'meals', 'settings']);
    expect(appliedMigrations(sqlite)).toHaveLength(journal.entries.length);
    expect(sqlite.prepare('pragma foreign_key_check').all()).toEqual([]);
    sqlite.close();
  });

  it.each(journal.entries.map((_, i) => i))(
    'carry a database at version %i forward to the current version without moving a single value',
    (version) => {
      const previous = folderAtVersion(version);
      const sqlite = migrated(previous);
      sqlite.pragma('foreign_keys = ON');

      const present = new Set(tableNames(sqlite));
      const written: Record<string, Record<string, unknown>[]> = {};
      for (const table of INSERT_ORDER.filter((t) => present.has(t))) {
        const columns = new Set((sqlite.prepare(`pragma table_info("${table}")`).all() as { name: string }[]).map((c) => c.name));
        written[table] = (HISTORY[table] ?? []).map((row) => {
          const subset = Object.fromEntries(Object.entries(row).filter(([key]) => columns.has(key)));
          const keys = Object.keys(subset);
          sqlite
            .prepare(`insert into "${table}" (${keys.map((k) => `"${k}"`).join(', ')}) values (${keys.map(() => '?').join(', ')})`)
            .run(...keys.map((k) => subset[k]));
          return subset;
        });
      }

      migrate(drizzle(sqlite), { migrationsFolder: FOLDER });

      expect(appliedMigrations(sqlite)).toHaveLength(journal.entries.length);
      for (const [table, rows] of Object.entries(written)) {
        const after = sqlite.prepare(`select * from "${table}" order by id`).all() as Record<string, unknown>[];
        expect([table, after.map((row, i) => Object.fromEntries(Object.keys(rows[i] ?? {}).map((k) => [k, row[k]])))]).toEqual([
          table,
          rows,
        ]);
      }
      // A food that existed before search_text was maintained is searchable after the update.
      if (written['foods']) {
        expect(sqlite.prepare(`select search_text from foods where id = 'food-1'`).get()).toEqual({
          search_text: 'creme fraiche president',
        });
      }
      expect(sqlite.prepare('pragma foreign_key_check').all()).toEqual([]);

      sqlite.close();
      fs.rmSync(previous, { recursive: true, force: true });
    },
  );

  it('are idempotent — running them again changes nothing', () => {
    const sqlite = migrated();
    const before = { applied: appliedMigrations(sqlite), ddl: ddlOf(sqlite) };

    migrate(drizzle(sqlite), { migrationsFolder: FOLDER });

    expect({ applied: appliedMigrations(sqlite), ddl: ddlOf(sqlite) }).toEqual(before);
    sqlite.close();
  });

  it('leave the database in exactly the shape src/db/schema.ts describes', () => {
    // Catches a hand-edited migration, and a schema change nobody ran drizzle-kit generate for.
    const fromMigrations = migrated();
    const fromSchema = new Database(':memory:');
    for (const statement of ddlFromSchema(schema)) fromSchema.exec(statement);

    expect(shapeOf(fromMigrations)).toEqual(shapeOf(fromSchema));
    fromMigrations.close();
    fromSchema.close();
  });

  it('install the triggers that keep search_text folded, built from the same fold as the queries', () => {
    const sqlite = migrated();
    const triggers = sqlite
      .prepare(`select name, tbl_name, sql from sqlite_master where type = 'trigger' order by name`)
      .all() as { name: string; tbl_name: string; sql: string }[];

    expect(triggers.map((t) => `${t.tbl_name}.${t.name}`)).toEqual([
      'foods.foods_search_text_insert',
      'foods.foods_search_text_update',
      'meals.meals_search_text_insert',
      'meals.meals_search_text_update',
    ]);
    // The whole trigger, not a substring: a hand edit to the event, the WHEN guard or the SET clause
    // of 0001 fails here. Regenerate with src/db/tools/search-triggers.mjs instead of editing it.
    expect(triggers.map((t) => [t.name, t.tbl_name, t.sql])).toEqual(
      SEARCH_TRIGGERS.map((t) => [t.name, t.table, searchTriggerSql(t)]),
    );
    // And the renderer folds in both places that matter: the WHEN guard and the SET.
    for (const trigger of SEARCH_TRIGGERS) {
      expect([trigger.name, searchTriggerSql(trigger).split(foldSql(trigger.source)).length - 1]).toEqual([trigger.name, 2]);
    }
    sqlite.close();
  });
});

describe('the migrations on the phone', () => {
  it('ship as a bundle identical to the drizzle-kit output — regenerate it if this fails', () => {
    // src/db/migrations/bundle.ts is what expo-sqlite imports. It is generated, so this is the guard
    // that it was: `node src/db/tools/bundle-migrations.mjs` after every `drizzle-kit generate`.
    expect(bundle.journal).toEqual(journal);
    expect(Object.keys(bundle.migrations).sort()).toEqual(
      journal.entries.map((e) => `m${String(e.idx).padStart(4, '0')}`).sort(),
    );
    for (const entry of journal.entries) {
      const key = `m${String(entry.idx).padStart(4, '0')}` as keyof typeof bundle.migrations;
      expect([entry.tag, bundle.migrations[key]]).toEqual([
        entry.tag,
        fs.readFileSync(path.join(FOLDER, `${entry.tag}.sql`), 'utf8'),
      ]);
    }
  });

  it('build the same database through drizzle’s expo-sqlite migrator as through the Node one', async () => {
    const phone = new Database(':memory:');
    // The expo migrator only touches `db.dialect` and `db.session`, which every synchronous drizzle
    // SQLite handle shares — so the phone's exact migration code runs here against real SQLite.
    await migrateOnPhone(drizzle(phone) as unknown as ExpoSQLiteDatabase, bundle);
    const node = migrated();

    expect(ddlOf(phone)).toEqual(ddlOf(node));
    expect(appliedMigrations(phone)).toEqual(appliedMigrations(node));
    phone.close();
    node.close();
  });
});
