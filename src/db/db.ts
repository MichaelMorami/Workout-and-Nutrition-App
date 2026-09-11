/**
 * The handle type every query function takes as its first argument.
 *
 * Both drivers the project runs on are synchronous `BaseSQLiteDatabase`s over the same schema:
 * `drizzle-orm/expo-sqlite` on the phone and `drizzle-orm/better-sqlite3` in tests. Typing queries
 * against the common base means one implementation, tested in Node, is the one the phone runs.
 */
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

export type VitalsSchema = typeof schema;

export type VitalsDb = BaseSQLiteDatabase<'sync', unknown, VitalsSchema>;
