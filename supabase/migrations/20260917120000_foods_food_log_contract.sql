-- Vitals — the remote contract for `foods` and `food_log`. Issue #114.
--
-- Local SQLite is the source of truth; this schema is a replica for backup and multi-device. It
-- mirrors the Drizzle schema in `src/db/schema.ts` column for column, minus the device-local usage
-- cache, plus `user_id`. `src/sync/contract/schema.test.ts` asserts that parity on every run, so
-- this file and the phone's schema cannot drift apart silently.
--
-- No hosted project is touched by this migration. Applying it to one is issue #127.
--
-- Three rules this file encodes, in the order they matter:
--
--   1. RLS is enabled, FORCEd and per-user, declared in the same statement block that creates the
--      table. A policy added in a later migration leaves a window where the table is readable, and
--      a table rebuild drops policies without a word.
--   2. There is no DELETE policy, and neither DELETE nor TRUNCATE is granted. Deletes are
--      tombstones (`deleted = 1`): a hard delete cannot be synced, because the absence of a row is
--      indistinguishable from a row that has not arrived yet. TRUNCATE is a separate privilege that
--      RLS does not police at all, so it is revoked by name (#147).
--   3. `updated_at` is a bigint the *device* wrote, and nothing here touches it — no DEFAULT, no
--      `now()`, no trigger. Last-write-wins is decided by `src/sync`, which compares a device clock
--      to a device clock; a server-stamped value would make every pull look newer than local and
--      quietly overwrite unsynced edits.

-- ---------------------------------------------------------------------------------------------
-- foods — the catalogue. Freely editable; history never reads it for nutrition.
-- ---------------------------------------------------------------------------------------------

create table public.foods (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  updated_at bigint not null,
  deleted smallint not null default 0,
  name text not null,
  brand text,
  -- Which canonical unit this food is measured in: 'weight' = grams, 'volume' = millilitres.
  basis text not null,
  serving_label text not null,
  -- One serving in the canonical unit of `basis`. Per-serving nutrition is derived from the
  -- per-100 values (`per_100 * serving_amount / 100`) and is deliberately never stored (#86).
  serving_amount double precision not null,
  kcal_per_100 double precision not null,
  protein_per_100 double precision not null,
  archived smallint not null default 0,
  constraint foods_deleted_check check (deleted in (0, 1)),
  constraint foods_archived_check check (archived in (0, 1)),
  constraint foods_basis_check check (basis in ('weight', 'volume')),
  constraint foods_serving_amount_check check (serving_amount > 0),
  constraint foods_kcal_check check (kcal_per_100 >= 0),
  constraint foods_protein_check check (protein_per_100 >= 0)
);

-- The pull query is "my rows changed since T", in exactly this order.
create index foods_user_updated_idx on public.foods (user_id, updated_at);

alter table public.foods enable row level security;
-- FORCE covers the table owner too, so a future SECURITY DEFINER function cannot read across users.
alter table public.foods force row level security;

create policy foods_select_own on public.foods
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy foods_insert_own on public.foods
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- USING decides which rows may be updated; WITH CHECK stops an update moving a row to another user.
create policy foods_update_own on public.foods
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No DELETE policy, and the grant is revoked as well: two locks, because losing history to a
-- stray `.delete()` is the one failure the user cannot undo. Tombstone instead.
revoke delete on public.foods from authenticated;
-- TRUNCATE is a separate privilege in Postgres: revoking DELETE leaves it untouched, and RLS does
-- not apply to it at all. One statement would empty the catalogue. Revoked on its own line (#147).
revoke truncate on public.foods from authenticated;

-- ---------------------------------------------------------------------------------------------
-- food_log — facts about the past. Immutable nutrition, literal amounts, a local calendar day.
-- ---------------------------------------------------------------------------------------------

create table public.food_log (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  updated_at bigint not null,
  deleted smallint not null default 0,
  -- UTC instant, ms epoch.
  logged_at bigint not null,
  -- The user's calendar day and wall clock at `logged_at`, in the zone they were in, computed once
  -- at write time on the device. Never derived from `logged_at` here or anywhere else: a 23:30 meal
  -- in Los Angeles is tomorrow in UTC, and re-deriving would move it to the wrong day on every pull.
  local_date text not null,
  local_minute integer not null,
  -- No foreign key to public.foods or public.meals on purpose. Sync arrives out of order, so a log
  -- can reach the server before the food it names; a foreign key would reject a valid row and cost
  -- the user a meal. The local database holds the referential truth.
  food_id uuid,
  meal_id uuid,
  qty double precision not null default 1,
  -- Canonical amount, following the food's `basis` at log time: grams for weight, ml for volume.
  -- Mutually exclusive, not "exactly one" — rows predating #86 have neither.
  grams double precision,
  ml double precision,
  -- Literal at log time. Correcting a food must never rewrite past logs.
  kcal double precision not null,
  protein double precision not null,
  slot text not null,
  constraint food_log_deleted_check check (deleted in (0, 1)),
  constraint food_log_local_date_check check (local_date ~ '^[0-9]{4}-[0-1][0-9]-[0-3][0-9]$'),
  constraint food_log_local_minute_check check (local_minute between 0 and 1439),
  constraint food_log_qty_check check (qty > 0),
  constraint food_log_grams_check check (grams is null or grams > 0),
  constraint food_log_ml_check check (ml is null or ml > 0),
  constraint food_log_amount_check check (grams is null or ml is null),
  constraint food_log_kcal_check check (kcal >= 0),
  constraint food_log_protein_check check (protein >= 0)
);

create index food_log_user_updated_idx on public.food_log (user_id, updated_at);
create index food_log_user_local_date_idx on public.food_log (user_id, local_date);

alter table public.food_log enable row level security;
alter table public.food_log force row level security;

create policy food_log_select_own on public.food_log
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy food_log_insert_own on public.food_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy food_log_update_own on public.food_log
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke delete on public.food_log from authenticated;
-- And TRUNCATE, which would take every log the user has ever written in one statement (#147).
revoke truncate on public.food_log from authenticated;
