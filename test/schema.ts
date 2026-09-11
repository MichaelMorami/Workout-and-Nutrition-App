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
 * It points at the real app schema, `src/db/schema.ts` (`db-engineer`'s path), and its generated
 * migrations under `src/db/migrations/`. `test/schema-source.ts` resolves the same module at
 * runtime for callers that build `makeTestDb()` with no `schema` argument — this re-export exists
 * purely so a caller that wants a *typed* handle does not have to reach across the repo to find it.
 *
 * There is no fixture behind this anymore: `test/fixtures/` — the throwaway three-table schema this
 * pointed at before Sprint 1's real schema landed on issue #17 — has been deleted. Every test in
 * `test/**` now runs against the same Drizzle schema and the same migrations the phone runs.
 */
export * from '../src/db/schema';
