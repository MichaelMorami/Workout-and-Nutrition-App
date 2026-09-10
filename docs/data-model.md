# Data model

SQLite on the device, mirrored to Postgres. **Every table** carries `id` (uuid text), `updated_at`
(integer, ms epoch) and `deleted` (0/1 tombstone) so the sync engine can treat all tables uniformly.

## Nutrition

| Table | Columns |
| --- | --- |
| `foods` | `name`, `brand`, `serving_label` ("1 pot", "100 g"), `serving_grams`, `kcal_per_serving`, `protein_per_serving`, `use_count`, `last_used_at`, `hour_histogram` (json), `archived` |
| `meals` | `name` — a saved combination |
| `meal_items` | `meal_id` → `meals`, `food_id` → `foods`, `qty` |
| `food_log` | `logged_at`, `local_date`, `food_id` → `foods`, `qty`, **`kcal`**, **`protein`**, `slot` |

`use_count`, `last_used_at` and `hour_histogram` are what power the one-tap quick-add grid: the six
foods most likely *for this hour of this day* are already on screen.

## Workouts

| Table | Columns |
| --- | --- |
| `exercises` | `name`, `muscle_group`, `unit` (kg/lb/bodyweight/time) |
| `routines` | `name` |
| `routine_items` | `routine_id`, `exercise_id`, `order_index`, `target_sets` |
| `sessions` | `started_at`, `ended_at`, `local_date`, `routine_id?`, `notes` |
| `sets` | `session_id` → `sessions`, `exercise_id`, `set_index`, `reps`, `weight`, `rpe?`, `is_warmup` |

## Body and settings

| Table | Columns |
| --- | --- |
| `body_metrics` | `local_date` (unique), `weight`, `body_fat_pct?`, `waist?`, `chest?`, `arm?` |
| `settings` | singleton — `kcal_target`, `protein_target`, `weight_unit`, `length_unit`, `week_start` |
| `sync_state` | `table_name`, `last_pulled_at`, `last_pushed_at` |

## Three invariants

These are the decisions that are cheap now and expensive later. They are enforced in review.

**1. `local_date` on every dated row.** A `YYYY-MM-DD` string in the user's timezone, stored beside
the UTC timestamp, and used by every date query. Deriving a calendar day from a UTC timestamp puts a
23:30 meal on the wrong day after travel or a DST change, and then every graph is quietly wrong.

**2. `food_log` stores literal `kcal` and `protein`.** If the user later corrects a food's nutrition,
their history must not silently change. Logs are facts about the past; catalogue rows are templates.
The same principle applies to `sets` and `body_metrics`.

**3. Deletes are tombstones.** `deleted = 1`, never a row removal — a hard delete cannot be
synchronised, and would resurrect on the next pull from the other device.

## Indexing

`local_date` on `food_log`, `sessions` and `body_metrics`; `(exercise_id, session_id)` on `sets`;
`last_used_at` and `use_count` on `foods`. Every column a chart or list filters by gets an index.

## Sync

Last-write-wins per row, keyed on `updated_at`. One user, so genuine conflicts are rare — but they
are *defined* rather than accidental, and every case (both edited, one deleted, clock skew,
first-login restore, interrupted sync) has a named test. Row-level security in Postgres keys every
table by `user_id`.
