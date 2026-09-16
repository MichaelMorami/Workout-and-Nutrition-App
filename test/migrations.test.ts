/**
 * The migration test.
 *
 * Two questions, and they are different questions:
 *   1. do the migrations build a correct database **from empty**? (a fresh install)
 *   2. do they carry an **existing database with data in it** forward? (every update after that)
 *
 * (2) is the one that loses people's history, and it is the one nobody writes. Running the full
 * folder against an empty file proves nothing about it: the destructive `ALTER TABLE` and the
 * table rebuild only misbehave when there are rows to lose.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { appliedMigrations, tableNames } from './db';
import { findMigrationsFolder, resolveSchemaSource } from './schema-source';

const FOLDER = findMigrationsFolder();

interface Journal {
  entries: { idx: number; tag: string; when: number; version: string; breakpoints: boolean }[];
  version: string;
  dialect: string;
}

function readJournal(folder: string): Journal {
  return JSON.parse(fs.readFileSync(path.join(folder, 'meta', '_journal.json'), 'utf8')) as Journal;
}

/**
 * A copy of the drizzle-kit output truncated to the first `count` migrations — i.e. the state a
 * user's phone is in before it takes the update. Copied to a temp dir so nothing is mutated.
 */
function folderAsOfVersion(folder: string, count: number): string {
  const journal = readJournal(folder);
  const entries = journal.entries.slice(0, count);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-migrations-'));
  fs.mkdirSync(path.join(out, 'meta'));
  for (const entry of entries) {
    fs.copyFileSync(path.join(folder, `${entry.tag}.sql`), path.join(out, `${entry.tag}.sql`));
    const snapshot = path.join(folder, 'meta', `${String(entry.idx).padStart(4, '0')}_snapshot.json`);
    if (fs.existsSync(snapshot)) {
      fs.copyFileSync(snapshot, path.join(out, 'meta', path.basename(snapshot)));
    }
  }
  fs.writeFileSync(path.join(out, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
  return out;
}

describe('the migrations', () => {
  if (!FOLDER) {
    it.failing('exist as drizzle-kit output', () => {
      throw new Error('no migrations folder found — run drizzle-kit generate');
    });
    return;
  }
  const folder: string = FOLDER;
  const journal = readJournal(folder);

  it('are the ones this repo actually ships', () => {
    // A migration test against a fixture nobody ships is theatre. Say out loud which folder ran.
    expect(journal.entries.length).toBeGreaterThan(1);
    expect(journal.dialect).toBe('sqlite');
    for (const entry of journal.entries) {
      expect(fs.existsSync(path.join(folder, `${entry.tag}.sql`))).toBe(true);
    }
  });

  it('run forward cleanly from an empty database', () => {
    const sqlite = new Database(':memory:');
    expect(() => migrate(drizzle(sqlite), { migrationsFolder: folder })).not.toThrow();

    expect(tableNames(sqlite)).toContain('foods');
    expect(appliedMigrations(sqlite)).toHaveLength(journal.entries.length);
    sqlite.close();
  });

  /**
   * `0002_foods_basis.sql` is the one custom, hand-written migration in this folder, and it is
   * deliberately destructive: issue #86, client ruling 1, decided there is no honest conversion from
   * "133 kcal per serving, serving weight unknown" to "kcal per 100 g", so a user's `foods` /
   * `food_log` / `meals` / `meal_items` rows are wiped rather than carried across. Everything else —
   * `body_metrics`, `settings` — is real data with nothing to do with this change and must survive.
   * Two tests, because "forward without losing data" and "forward while deliberately losing this
   * data" are different claims and a single one could hide either going wrong.
   */
  it('wipe foods, food_log, meals and meal_items when the basis migration lands (issue #86 ruling 1)', () => {
    const previous = folderAsOfVersion(folder, journal.entries.length - 1);
    const sqlite = new Database(':memory:');
    migrate(drizzle(sqlite), { migrationsFolder: previous });
    expect(appliedMigrations(sqlite)).toHaveLength(journal.entries.length - 1);

    // A user with history on the old, per-serving version.
    sqlite
      .prepare(
        'insert into foods (id, name, serving_label, kcal_per_serving, protein_per_serving, updated_at) values (?, ?, ?, ?, ?, ?)',
      )
      .run('food-1', 'Greek yoghurt', '1 pot', 133, 17, 1_700_000_000_000);
    sqlite.prepare('insert into meals (id, name, updated_at) values (?, ?, ?)').run('meal-1', 'Usual breakfast', 1_700_000_000_000);
    sqlite
      .prepare('insert into meal_items (id, meal_id, food_id, updated_at) values (?, ?, ?, ?)')
      .run('mitm-1', 'meal-1', 'food-1', 1_700_000_000_000);
    sqlite
      .prepare(
        'insert into food_log (id, logged_at, local_date, local_minute, food_id, kcal, protein, slot, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('log-1', 1_741_589_700_000, '2025-03-09', 1435, 'food-1', 214, 21, 'snack', 1_741_589_700_000);

    // They take the update.
    migrate(drizzle(sqlite), { migrationsFolder: folder });

    expect(appliedMigrations(sqlite)).toHaveLength(journal.entries.length);
    // Wiped, not converted — a surviving row with the old columns would mean drizzle-kit's table
    // rebuild ran instead of the hand-written wipe, silently carrying a per-serving number into a
    // per-100 column.
    expect(sqlite.prepare('select * from foods').all()).toEqual([]);
    expect(sqlite.prepare('select * from food_log').all()).toEqual([]);
    expect(sqlite.prepare('select * from meals').all()).toEqual([]);
    expect(sqlite.prepare('select * from meal_items').all()).toEqual([]);
    sqlite.close();
    fs.rmSync(previous, { recursive: true, force: true });
  });

  it('carry body_metrics and settings forward untouched by the basis migration', () => {
    const previous = folderAsOfVersion(folder, journal.entries.length - 1);
    const sqlite = new Database(':memory:');
    migrate(drizzle(sqlite), { migrationsFolder: previous });

    // Data with nothing to do with foods — the basis migration must not so much as touch it.
    sqlite
      .prepare(
        'insert into body_metrics (id, measured_at, local_date, weight, updated_at) values (?, ?, ?, ?, ?)',
      )
      .run('body-1', 1_741_589_700_000, '2025-03-09', 82.4, 1_741_589_700_000);
    sqlite
      .prepare(
        'insert into settings (id, kcal_target, protein_target, updated_at) values (?, ?, ?, ?)',
      )
      .run('settings-1', 2400, 170, 1_700_000_000_000);

    migrate(drizzle(sqlite), { migrationsFolder: folder });

    expect(appliedMigrations(sqlite)).toHaveLength(journal.entries.length);
    expect(sqlite.prepare('select * from body_metrics').all()).toEqual([
      expect.objectContaining({ id: 'body-1', local_date: '2025-03-09', weight: 82.4 }),
    ]);
    expect(sqlite.prepare('select * from settings').all()).toEqual([
      expect.objectContaining({ id: 'settings-1', kcal_target: 2400, protein_target: 170 }),
    ]);
    sqlite.close();
    fs.rmSync(previous, { recursive: true, force: true });
  });

  it('are idempotent — running them twice changes nothing', () => {
    const sqlite = new Database(':memory:');
    migrate(drizzle(sqlite), { migrationsFolder: folder });
    const after = appliedMigrations(sqlite);

    migrate(drizzle(sqlite), { migrationsFolder: folder });

    expect(appliedMigrations(sqlite)).toEqual(after);
    sqlite.close();
  });

  it('leave the database in the shape the current schema describes', () => {
    // The check that catches a hand-edited migration: schema and migrations must agree.
    const sqlite = new Database(':memory:');
    migrate(drizzle(sqlite), { migrationsFolder: folder });
    const columns = (sqlite.prepare('pragma table_info("foods")').all() as { name: string }[]).map((c) => c.name);

    expect(columns).toContain('hour_histogram'); // part of the first migration; the second only adds triggers
    expect(columns).toEqual(expect.arrayContaining(['id', 'updated_at', 'deleted']));
    sqlite.close();
  });

  it('report which schema they belong to, so nobody mistakes a stand-in for the app schema', () => {
    const source = resolveSchemaSource();
    expect(source.label).toContain('src/db');
  });
});
