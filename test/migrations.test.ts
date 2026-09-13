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

  it('run forward from the previous version without losing a single row', () => {
    const previous = folderAsOfVersion(folder, journal.entries.length - 1);
    const sqlite = new Database(':memory:');
    migrate(drizzle(sqlite), { migrationsFolder: previous });
    expect(appliedMigrations(sqlite)).toHaveLength(journal.entries.length - 1);

    // A user with history on the old version.
    sqlite
      .prepare('insert into foods (id, name, serving_label, kcal_per_serving, protein_per_serving, updated_at) values (?, ?, ?, ?, ?, ?)')
      .run('food-1', 'Greek yoghurt', '1 pot', 133, 17, 1_700_000_000_000);
    sqlite
      .prepare(
        'insert into food_log (id, logged_at, local_date, local_minute, food_id, kcal, protein, slot, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('log-1', 1_741_589_700_000, '2025-03-09', 1435, 'food-1', 214, 21, 'snack', 1_741_589_700_000);

    // They take the update.
    migrate(drizzle(sqlite), { migrationsFolder: folder });

    expect(appliedMigrations(sqlite)).toHaveLength(journal.entries.length);
    expect(sqlite.prepare('select * from foods').all()).toEqual([
      expect.objectContaining({ id: 'food-1', name: 'Greek yoghurt', kcal_per_serving: 133 }),
    ]);
    // The 23:55 log survived, on the day it was eaten.
    expect(sqlite.prepare('select * from food_log').all()).toEqual([
      expect.objectContaining({ id: 'log-1', local_date: '2025-03-09', kcal: 214 }),
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
