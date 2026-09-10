/**
 * THROWAWAY FIXTURE SCHEMA — not the app schema.
 *
 * `src/db/**` belongs to `db-engineer` and is empty until Sprint 1. The harness needs *something*
 * real to migrate and query so that it can be tested (and so that its speed can be measured)
 * before the app schema exists.
 *
 * This is a deliberately small, honest subset of `docs/data-model.md` that exercises all three
 * project invariants:
 *   1. `local_date` (YYYY-MM-DD, user timezone) next to a UTC timestamp — `food_log`, `body_metrics`
 *   2. logs store literal `kcal`/`protein` — `food_log` copies, never joins for, nutrition
 *   3. deletes are tombstones — every table carries `id` / `updated_at` / `deleted`
 *
 * DELETE THIS DIRECTORY when `src/db/schema.ts` lands. Nothing in `test/` imports it directly:
 * `resolveSchemaSource()` in `test/schema-source.ts` prefers the real schema the moment it exists,
 * and callers can always pass their own via `makeTestDb({ schema })`.
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Catalogue row: a template, freely editable, never a historical fact. */
export const foods = sqliteTable(
  'foods',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    brand: text('brand'),
    servingLabel: text('serving_label').notNull(),
    servingGrams: real('serving_grams'),
    kcalPerServing: real('kcal_per_serving').notNull(),
    proteinPerServing: real('protein_per_serving').notNull(),
    useCount: integer('use_count').notNull().default(0),
    lastUsedAt: integer('last_used_at'),
    /** Added in migration 0001 so the harness has a second migration to run forward through. */
    hourHistogram: text('hour_histogram'),
    archived: integer('archived').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
    deleted: integer('deleted').notNull().default(0),
  },
  (t) => [index('foods_last_used_at_idx').on(t.lastUsedAt), index('foods_use_count_idx').on(t.useCount)],
);

/** Log row: a fact about the past. `kcal` and `protein` are literal copies, not a join. */
export const foodLog = sqliteTable(
  'food_log',
  {
    id: text('id').primaryKey(),
    loggedAt: integer('logged_at').notNull(),
    localDate: text('local_date').notNull(),
    foodId: text('food_id').references(() => foods.id),
    qty: real('qty').notNull().default(1),
    kcal: real('kcal').notNull(),
    protein: real('protein').notNull(),
    slot: text('slot').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deleted: integer('deleted').notNull().default(0),
  },
  (t) => [index('food_log_local_date_idx').on(t.localDate)],
);

/** One row per calendar day, keyed by `local_date` — never by a UTC timestamp. */
export const bodyMetrics = sqliteTable(
  'body_metrics',
  {
    id: text('id').primaryKey(),
    localDate: text('local_date').notNull(),
    weight: real('weight').notNull(),
    bodyFatPct: real('body_fat_pct'),
    updatedAt: integer('updated_at').notNull().default(sql`0`),
    deleted: integer('deleted').notNull().default(0),
  },
  (t) => [uniqueIndex('body_metrics_local_date_idx').on(t.localDate)],
);
