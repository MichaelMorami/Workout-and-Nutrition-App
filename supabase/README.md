# `supabase/` — the remote contract

Local SQLite is the source of truth. This directory describes the **replica**: the shape Vitals
expects a Supabase project to have, so that backup and multi-device restore are a copy, not a
translation.

## There is no hosted project yet

Nothing here has been applied to a cloud project. `migrations/` is checked-in SQL and is verified
the only way it can be verified without one — by parsing it and asserting the contract, in
`src/sync/contract/schema.test.ts`. Creating the project and running `supabase db push` is issue
#127.

Until then: no `supabase link`, no `db push`, no `db reset` against a remote. A destructive remote
command is not something a test can undo.

## The rules the migrations encode

| Rule | Where |
| --- | --- |
| The remote columns equal the local Drizzle columns, minus the device-local usage cache, plus `user_id` | asserted against `src/db/schema.ts` on every test run |
| RLS enabled **and** forced, per-user, in the same migration that creates the table | a later migration leaves a readable window; a table rebuild drops policies silently |
| No `DELETE` policy and no `DELETE` grant | deletes are tombstones (`deleted = 1`); a hard delete cannot be synced |
| No `TRUNCATE` grant either | a separate privilege that RLS does not police: one statement would empty `food_log` (#147) |
| `UPDATE` stays granted, owner-scoped | sync needs it to push an edit and to write a tombstone; history is immutable because `food_log` stores `kcal`/`protein` directly, not because the privilege is withheld |
| `updated_at` is a device-written `bigint`, never defaulted or triggered | last-write-wins compares device clock to device clock; a server stamp would make every pull win |
| `local_date` is `text`, CHECKed as `YYYY-MM-DD` | a calendar day is never derived from a UTC instant |

## Secrets

Nothing in this repository holds a credential. The project URL and the anon key come from
environment config; the anon key is public by design and is safe in a shipped app **because** RLS is
on every table. The service-role key is never used by the app, never committed, and never needed by
any script here — a leak of it bypasses every policy above.

`src/sync/contract/schema.test.ts` fails the build if a key, a JWT or a project URL appears in this
directory.
