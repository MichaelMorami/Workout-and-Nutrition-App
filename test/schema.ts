/**
 * THE SCHEMA SWAP POINT — one line, and it is the line below.
 *
 * Every test in the repo that needs a *typed* Drizzle schema imports it from here:
 *
 *   import { makeTestDb } from '@/test/db';
 *   import * as schema from '@/test/schema';
 *
 *   const { db } = makeTestDb({ schema });
 *   db.insert(schema.foodLog).values(makeLogEntry({ localDate: '2025-03-09' })).run();
 *
 * Right now it points at the throwaway fixture in `test/fixtures/`, because `src/db/` belongs to
 * `db-engineer` and is empty until Sprint 1.
 *
 * ## Day one of Sprint 1
 *
 * When `src/db/schema.ts` and its generated migrations exist, change the re-export below to:
 *
 *     export * from '../src/db/schema';
 *
 * and delete `test/fixtures/`. Nothing else in `test/**` changes, and every existing test starts
 * running against the real schema and the real migrations.
 *
 * `db-engineer` cannot make that edit — `test/**` is `qa-engineer`'s path — so raise it on the
 * issue and it happens in the same PR. The *untyped* path needs no edit at all:
 * `test/schema-source.ts` discovers `src/db/schema.ts` at runtime and prefers it over the fixture
 * the moment it exists, so `makeTestDb()` with no arguments switches over on its own.
 */
export * from './fixtures/schema';
