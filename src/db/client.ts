/**
 * Opens the app's database on the phone and brings it up to date.
 *
 *   const connection = openVitalsDb();
 *   await migrateVitalsDb(connection);   // once at startup, before the first query
 *   todayTotals(connection.db, localDate);
 *
 * No Node test imports this file: `expo-sqlite` is a native module. What it relies on is proven in
 * Node instead — the schema, constraints and triggers in `schema.test.ts`, and this exact bundle run
 * through drizzle's expo-sqlite migrator in `migrations.test.ts`.
 */
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { VitalsSchema } from './db';
import migrations from './migrations/bundle';
import * as schema from './schema';

export const DATABASE_NAME = 'vitals.db';

export interface VitalsConnection {
  /** The typed handle every query function takes. A `VitalsDb`. */
  db: ExpoSQLiteDatabase<VitalsSchema>;
  /** The raw expo-sqlite handle, for PRAGMAs. */
  sqlite: SQLiteDatabase;
}

/** Open (or create) the database with foreign keys enforced, the way the tests run. */
export function openVitalsDb(name: string = DATABASE_NAME): VitalsConnection {
  const sqlite = openDatabaseSync(name);
  sqlite.execSync('PRAGMA journal_mode = WAL;');
  sqlite.execSync('PRAGMA foreign_keys = ON;');
  return { db: drizzle(sqlite, { schema }), sqlite };
}

/**
 * Apply any migrations the database has not seen.
 *
 * Foreign keys are switched off for the duration, as SQLite's documented procedure for schema
 * changes requires: drizzle runs every pending migration inside one transaction, where a
 * `PRAGMA foreign_keys` statement is silently ignored, so a future table rebuild would otherwise
 * trip the constraint on its own `DROP TABLE`. Integrity is then verified before enforcement resumes.
 */
export async function migrateVitalsDb({ db, sqlite }: VitalsConnection): Promise<void> {
  sqlite.execSync('PRAGMA foreign_keys = OFF;');
  try {
    await migrate(db, migrations);
    const violations = sqlite.getAllSync('PRAGMA foreign_key_check;');
    if (violations.length > 0) {
      throw new Error(`migrations left ${violations.length} foreign key violation(s)`);
    }
  } finally {
    sqlite.execSync('PRAGMA foreign_keys = ON;');
  }
}
