/**
 * The Vitals SQLite schema — the same Drizzle `sqlite-core` tables on the phone (expo-sqlite) and in
 * Node tests (better-sqlite3). Migrations in `./migrations` are generated from this file by
 * drizzle-kit; the triggers that maintain `search_text` are a hand-written migration, because
 * drizzle cannot express triggers.
 *
 * The rules every table follows (docs/data-model.md, and the contract on issue #17):
 *
 *   - Sync fields. `id` (uuid text), `updated_at` (ms epoch), `deleted` (0/1 tombstone). Rows are
 *     never removed.
 *   - Dated rows store `local_date` (YYYY-MM-DD in the user's zone) next to their UTC timestamp.
 *     Nothing derives a calendar day from the timestamp.
 *   - Logs are facts. `food_log` holds literal `kcal`, `protein` and `grams`; catalogue rows are
 *     templates and editing one never touches a log.
 *   - Canonical units. Weight in kg, lengths in cm. Food has two canonical units and a `basis`
 *     column that says which one a row uses: grams for `basis = 'weight'`, millilitres for
 *     `basis = 'volume'` (docs/decisions.md, decision 3, amended by #113 and #86). That is not a
 *     unit tag — a column is either grams or millilitres, never "a number plus whatever the user
 *     typed", so there is still nothing to convert on a future lb/fl-oz switch.
 *   - Nutrition is stored per 100 g or per 100 ml, following the basis. Per-serving values are
 *     derived at read time by `./servings` and never stored, so correcting a food cannot leave a
 *     rounded per-serving number behind to drift from its source.
 *   - CHECK constraints encode true invariants only. Adding one later is a table rebuild, so they are
 *     here from the first migration; removing one is also a rebuild, so nothing speculative is.
 *
 * Only tables are exported as values. Anything else a query needs lives in its own module, so the
 * harness and drizzle can treat every value export here as a table.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Meal slots. Typed here, deliberately not a CHECK: a new slot must not cost a table rebuild. */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_SLOTS: readonly [MealSlot, ...MealSlot[]] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * How a food is measured (#86). `'weight'` means grams, `'volume'` means millilitres — the two
 * canonical food units. Unlike `MealSlot` this *is* a CHECK: every query branches on it, so a third
 * value would be a silent wrong answer rather than a new label, and the set is closed by the data
 * model rather than by product taste.
 */
export type FoodBasis = 'weight' | 'volume';
const FOOD_BASES: readonly [FoodBasis, ...FoodBasis[]] = ['weight', 'volume'];

/**
 * A column by its bare name, for CHECK constraints. Not `${t.column}`: drizzle renders that
 * table-qualified, and when drizzle-kit rebuilds a table it creates `__new_<table>`, where a
 * `"<table>"."column"` reference no longer resolves and the migration fails on the user's phone.
 */
const col = (column: { name: string }) => sql.identifier(column.name);

/** A `local_date` is exactly `YYYY-MM-DD`. Rejects the ISO timestamp a UTC-derived day would write. */
const LOCAL_DATE_GLOB = sql.raw(`'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`);

/** Fresh builders per table: `id`, `updated_at`, `deleted`. Invariant #3. */
const syncColumns = () => ({
  id: text('id').primaryKey(),
  /** ms epoch of the last user-authored change. Last-write-wins is keyed on it. */
  updatedAt: integer('updated_at').notNull(),
  /** Tombstone: 1 means deleted. */
  deleted: integer('deleted').notNull().default(0),
});

/**
 * The usage cache that ranks the quick-add grid, search and recents. Derived from live `food_log`
 * rows, recomputed by the data layer on every write that changes them, device-local, and never a
 * reason to bump `updated_at` — see the contract on #17, §1.4.
 */
const usageColumns = () => ({
  useCount: integer('use_count').notNull().default(0),
  lastUsedAt: integer('last_used_at'),
  /** JSON array of exactly 24 counts by local wall-clock hour; NULL when `use_count` is 0. */
  hourHistogram: text('hour_histogram'),
  /** Accent- and case-folded name (and brand). Maintained by triggers; never written by the app. */
  searchText: text('search_text').notNull().default(''),
});

/** Catalogue: a template for logging. Freely editable; history never reads it for nutrition. */
export const foods = sqliteTable(
  'foods',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    brand: text('brand'),
    /** Which canonical unit this food is measured in: grams or millilitres. */
    basis: text('basis', { enum: FOOD_BASES }).notNull(),
    /** What one serving is called: "1 pot", "1 scoop", "100 g". One serving per food (#86, ruling 3). */
    servingLabel: text('serving_label').notNull(),
    /** One serving in the canonical unit of `basis`: grams, or millilitres. Always > 0. */
    servingAmount: real('serving_amount').notNull(),
    /** kcal per 100 g, or per 100 ml — whichever `basis` says. The label on the packet. */
    kcalPer100: real('kcal_per_100').notNull(),
    /** Protein (g) per 100 g, or per 100 ml. */
    proteinPer100: real('protein_per_100').notNull(),
    /** 1 = hidden from the grid, search and recents; still resolvable from history and meals. */
    archived: integer('archived').notNull().default(0),
    ...usageColumns(),
  },
  (t) => [
    index('foods_use_count_idx').on(t.useCount),
    index('foods_last_used_at_idx').on(t.lastUsedAt),
    check('foods_deleted_check', sql`${col(t.deleted)} in (0, 1)`),
    check('foods_archived_check', sql`${col(t.archived)} in (0, 1)`),
    check('foods_basis_check', sql`${col(t.basis)} in ('weight', 'volume')`),
    check('foods_serving_amount_check', sql`${col(t.servingAmount)} > 0`),
    check('foods_kcal_check', sql`${col(t.kcalPer100)} >= 0`),
    check('foods_protein_check', sql`${col(t.proteinPer100)} >= 0`),
    check('foods_use_count_check', sql`${col(t.useCount)} >= 0`),
  ],
);

/** A saved combination of foods. Shares the quick-add grid with foods, so it carries the usage cache. */
export const meals = sqliteTable(
  'meals',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    ...usageColumns(),
  },
  (t) => [
    check('meals_deleted_check', sql`${col(t.deleted)} in (0, 1)`),
    check('meals_use_count_check', sql`${col(t.useCount)} >= 0`),
  ],
);

/** One food in a saved meal. `qty` is servings of that food per portion of the meal. */
export const mealItems = sqliteTable(
  'meal_items',
  {
    ...syncColumns(),
    mealId: text('meal_id')
      .notNull()
      .references(() => meals.id),
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    qty: real('qty').notNull().default(1),
  },
  (t) => [
    index('meal_items_meal_id_idx').on(t.mealId),
    index('meal_items_food_id_idx').on(t.foodId),
    check('meal_items_deleted_check', sql`${col(t.deleted)} in (0, 1)`),
    check('meal_items_qty_check', sql`${col(t.qty)} > 0`),
  ],
);

/**
 * A fact about the past. `kcal`, `protein` and the amount (`grams` or `ml`) are literal values at log
 * time — never a join. `local_date` and `local_minute` are the user's calendar day and wall clock at
 * `logged_at`, in the zone they were in, computed once at write time.
 */
export const foodLog = sqliteTable(
  'food_log',
  {
    ...syncColumns(),
    /** UTC instant, ms epoch. */
    loggedAt: integer('logged_at').notNull(),
    localDate: text('local_date').notNull(),
    /** Minutes after local midnight, 0–1439. Feeds the hour histogram; unrecoverable from UTC later. */
    localMinute: integer('local_minute').notNull(),
    foodId: text('food_id').references(() => foods.id),
    /** Set when the row was written by logging a saved meal. */
    mealId: text('meal_id').references(() => meals.id),
    /** Servings of the food as it was at log time. */
    qty: real('qty').notNull().default(1),
    /** Canonical amount for a weight food: `qty × serving_amount` at log time. NULL otherwise. */
    grams: real('grams'),
    /** Canonical amount for a volume food: `qty × serving_amount` at log time. NULL otherwise. */
    ml: real('ml'),
    kcal: real('kcal').notNull(),
    protein: real('protein').notNull(),
    slot: text('slot', { enum: MEAL_SLOTS }).notNull(),
  },
  (t) => [
    index('food_log_local_date_idx').on(t.localDate),
    index('food_log_food_id_idx').on(t.foodId),
    index('food_log_meal_id_idx').on(t.mealId),
    check('food_log_deleted_check', sql`${col(t.deleted)} in (0, 1)`),
    check('food_log_local_date_check', sql`${col(t.localDate)} glob ${LOCAL_DATE_GLOB}`),
    check('food_log_local_minute_check', sql`${col(t.localMinute)} between 0 and 1439`),
    check('food_log_qty_check', sql`${col(t.qty)} > 0`),
    check('food_log_grams_check', sql`${col(t.grams)} is null or ${col(t.grams)} > 0`),
    check('food_log_ml_check', sql`${col(t.ml)} is null or ${col(t.ml)} > 0`),
    // Grams and millilitres are mutually exclusive: a row records one canonical amount, following
    // the food's `basis` at log time. Deliberately not "exactly one" — `grams` has always been
    // nullable and rows with neither exist (a food logged by servings before #86), so the stricter
    // form would make old history un-insertable and could only be relaxed by another table rebuild.
    // "Exactly one, matching the basis" is enforced in `queries/nutrition.ts`, where the basis is known.
    check('food_log_amount_check', sql`${col(t.grams)} is null or ${col(t.ml)} is null`),
    check('food_log_kcal_check', sql`${col(t.kcal)} >= 0`),
    check('food_log_protein_check', sql`${col(t.protein)} >= 0`),
  ],
);

/** One weigh-in per calendar day. Weight in kg, lengths in cm. Queries arrive in Sprint 2. */
export const bodyMetrics = sqliteTable(
  'body_metrics',
  {
    ...syncColumns(),
    /** UTC instant of the measurement, ms epoch. */
    measuredAt: integer('measured_at').notNull(),
    localDate: text('local_date').notNull(),
    weight: real('weight').notNull(),
    bodyFatPct: real('body_fat_pct'),
    waist: real('waist'),
    chest: real('chest'),
    arm: real('arm'),
  },
  (t) => [
    uniqueIndex('body_metrics_local_date_idx').on(t.localDate),
    check('body_metrics_deleted_check', sql`${col(t.deleted)} in (0, 1)`),
    check('body_metrics_local_date_check', sql`${col(t.localDate)} glob ${LOCAL_DATE_GLOB}`),
    check('body_metrics_weight_check', sql`${col(t.weight)} > 0`),
    check('body_metrics_body_fat_pct_check', sql`${col(t.bodyFatPct)} is null or ${col(t.bodyFatPct)} between 0 and 100`),
    check('body_metrics_waist_check', sql`${col(t.waist)} is null or ${col(t.waist)} > 0`),
    check('body_metrics_chest_check', sql`${col(t.chest)} is null or ${col(t.chest)} > 0`),
    check('body_metrics_arm_check', sql`${col(t.arm)} is null or ${col(t.arm)} > 0`),
  ],
);

/** The singleton settings row. No unit columns: kg and cm only (docs/decisions.md, decision 3). */
export const settings = sqliteTable(
  'settings',
  {
    ...syncColumns(),
    kcalTarget: real('kcal_target').notNull(),
    proteinTarget: real('protein_target').notNull(),
    /** 0 = Sunday, 1 = Monday. */
    weekStart: integer('week_start').notNull().default(1),
  },
  (t) => [
    check('settings_deleted_check', sql`${col(t.deleted)} in (0, 1)`),
    check('settings_kcal_target_check', sql`${col(t.kcalTarget)} >= 0`),
    check('settings_protein_target_check', sql`${col(t.proteinTarget)} >= 0`),
    check('settings_week_start_check', sql`${col(t.weekStart)} between 0 and 6`),
  ],
);

/**
 * The stored food row. What the *queries* hand out is `FoodRow` from `./types` — this row plus the
 * per-serving values derived from it. Kept separate so nothing can accidentally persist a derived
 * number by assigning a `FoodRow` back into the table.
 */
export type FoodTableRow = typeof foods.$inferSelect;
export type NewFoodRow = typeof foods.$inferInsert;
export type MealRow = typeof meals.$inferSelect;
export type NewMealRow = typeof meals.$inferInsert;
export type MealItemRow = typeof mealItems.$inferSelect;
export type NewMealItemRow = typeof mealItems.$inferInsert;
export type FoodLogRow = typeof foodLog.$inferSelect;
export type NewFoodLogRow = typeof foodLog.$inferInsert;
export type BodyMetricRow = typeof bodyMetrics.$inferSelect;
export type NewBodyMetricRow = typeof bodyMetrics.$inferInsert;
export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;
