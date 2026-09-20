# Decisions

Client decisions and the reasoning behind them, recorded at the checkpoint where they were made.
A decision here is binding on every agent until the client changes it.

Read this before designing or building anything it touches. The reasoning matters as much as the
decision — it is what tells you whether a new situation falls inside or outside the ruling.

---

## Checkpoint 1 — the design canvas (Sprint 0)

Canvas: <https://claude.ai/code/artifact/1f3fe5f1-e823-4e1b-bb7b-1f6e1ee70b18> · issue #4 · PR #13

### 1. Six quick-add tiles, not nine

Six keeps the food name at 16.5 pt, the size that stays readable at arm's length on a gym floor in
bad light. Nine covers more of the day without a search, but shrinks names past the point where the
tile reads at a glance — which is the tile's entire purpose.

**Revisit at Checkpoint 2**, once there is real usage data on how often the client reaches past the
six.

### 2. Portions — all three mechanisms

They do not conflict. One tap stays the pure fast path; the rest cost something only when needed.

| Gesture | Behaviour |
| --- | --- |
| Tap | Log one serving. Haptic confirm. No dialog, no save button. |
| Long-press | Portion sheet with normalised presets (100 g, 1 tbsp, 1 pot) |
| **"Exact" control inside that sheet** | Swaps preset steps for a slider, for an arbitrary amount |
| Double-tap | Second tap within a few seconds adds another full portion |

**The exact control is not optional.** The client's reasoning: presets are normalised, real
consumption is not, and being trapped on 0.5 increments is precisely the problem. Do not ship the
portion sheet without it.

**Undo is required.** There is no save button anywhere, so the haptic is the only confirmation the
user gets — which makes a mistaken tap silent unless undo catches it. Currently designed as a
4-second toast above the tab bar. *Open question raised with the client: 4 s may be too short when
the phone is on the bench mid-set.*

### 3. kg and cm only — no unit switch

No lb/in in v1. That removes a settings section and a class of conversion bugs.

**But storage is canonical from day one:** weight in kg, lengths in cm, food in grams — or in
millilitres for a volume-basis food. Never store the number as typed alongside a unit tag.

**Amended 2026-09-16 (see #86): food has two canonical units, not one.** Most labels give their
facts per 100 g *or* per 100 ml, and a scoop or a cup is a volume, so forcing everything into grams
would mean storing a density the user does not have. A food therefore declares a `basis` of
`'weight'` or `'volume'`, and that basis fixes the unit of every amount on it: grams throughout, or
millilitres throughout. A `food_log` row fills `grams` or `ml` accordingly, never both.

This is still canonical storage, not a unit tag. A unit tag would mean one column holding a number
whose meaning varies row by row, so every query has to ask what the number means. Here the column
*is* the unit: `ml` is always millilitres, `grams` is always grams, and `basis` says which one a
food uses. Metric only — a cup is 250 ml, and no imperial volumes appear anywhere.

This is what keeps lb/in cheap to add later, and it costs nothing now because it is the right design
regardless. With canonical storage, adding a unit switch converts nothing — it *renders* the same
rows differently, so all history is instantly correct with no migration and nothing to get wrong.
The mixed-unit alternative would need a migration over every historical row and would make every
query unit-aware.

**The discipline that keeps it cheap, and the part that is expensive to retrofit:** every weight and
length renders through a formatter from the very first screen, even while that formatter does
nothing but append `" kg"`. If raw numbers get interpolated directly into thirty components, then
"add lb" later means finding all thirty and missing several. One function now; one function's body
later.

Client's own framing: *"it's not worth the extra hassle if it adds complexity"* — so the option is
preserved at zero cost rather than either built now or designed out.

---

## Sprint 1 dispatch — finding a food that isn't in the six

Raised by the client on 2026-09-11, before any screen was coded · issues #16, #17, #18, #23, #24

The question: *"Say I had boiled eggs and it's not in the top 6 — how do I find it?"* The approved
canvas had no answer. A 44 × 44 search button sat in the Today header but opened nothing, and no
artboard showed a search. Left alone, Checkpoint 2 could only ever log six foods.

### 4. One search bar, under the grid

A full-width **"Search foods"** bar directly under the quick-add grid. The header search button is
removed — there is one way in.

It sits in the thumb zone, so it works one-handed, and the six tiles keep their size — decision 1 is
untouched. Rejected: the header button (a stretch to reach one-handed on a large phone) and search as
the sixth tile (costs a quick-add food every day to save a tap on the rare one).

**How the sheet behaves — the same rules as a tile, so there is nothing new to learn:**

| Situation | Behaviour |
| --- | --- |
| Before typing | First row is always **+ Create new food**, opening a blank form. Below it, **Recent**: every food and meal logged in the last 14 days, newest first — including the ones already on the six quick-add tiles (amended 2026-09-16, see #95 and #97) |
| Before typing, nothing recent | Falls back to **Your foods** — every live, non-archived food and every meal with a live item, most-used first (ties: most recently logged, then name, then id). A food never logged still appears, at the bottom. The list is never blank while the library holds anything; only a genuinely empty library shows **No foods yet** (added 2026-09-18, see #96) |
| Typing | Filters the whole library, meals included; ignores case and accents; word-prefix matches first |
| Tap a row | Log one serving — haptic, undo toast, sheet closes |
| Long-press a row | The portion sheet, exact control included |
| Not in the library | While typing, last row is always **Create "‹query›"**, name pre-filled. With no query, the pinned first row opens the same form blank (amended 2026-09-16, see #97). Save stores the food *and* logs one serving. Undo removes the log but keeps the food |

**Tap budget**, enforced by the tap-count test (#23): a recent food in **2** taps · a food reached
through the **Your foods** fallback, neither recent nor on a tile, also in **2** taps with no typing
(added 2026-09-18, see #96) · a known food in **2** taps plus a few letters · a brand-new food in **3** taps plus its name and numbers — and, from
the pinned blank-sheet row, the same **3** taps with *no query text at all* (amended 2026-09-16, see
#97).

The blank-sheet route does not lower the tap count; it removes the throwaway query. Before #97 the
Create row existed only while typing, so reaching a blank form meant inventing letters first. Three
fixed taps is the budget either way — bar, Create, Save.

No full-text-search index: a `LIKE` over a library of a few hundred foods is instant. Add one only
with a measurement that says otherwise.

### 5. It ships in Sprint 1

Checkpoint 2 is the client logging their real food for two or three days. Real eating does not stay
inside six foods, so a checkpoint without search would test the grid and nothing else.

---

## Sprint 1 dispatch — the Today status row

Decided by the client on 2026-09-11 · issues #17 (contract amendment), #18, #20

The row under the grid used to show a last weight and a routine name, with no defined behaviour.
The client specified what each half is for.

### 6. Weight: today's weight and the weekly change in its 7-day average; tap opens Charts

- **The big number** is the latest weigh-in, the number the scale showed.
- **The change** is this week's 7-day average minus last week's.
  - Windows: `[today − 6, today]` against `[today − 13, today − 7]`, by `local_date`.
  - The average is over the weigh-ins actually present, with no interpolation.
- **Tapping the chip** switches to the Charts tab, where the full trend lives. There is no intermediate screen.

**Why the average and not yesterday's number:** day-to-day weight swings with water and salt, often by more
than a week of real change. A delta between two single weigh-ins mostly reports noise. The weekly
change of a 7-day average is the signal, the same reason the Charts tab smooths the trend line.

**Sprint 1:** the chip ships now. It reads `body_metrics`, and shows an honest empty state until there
are weigh-ins.

### 7. Workout: today's expected or completed workout, and play starts it

- **The chip shows** the workout expected today, or the one already done.
- **Play** drops straight into the running session, with last session's numbers pre-filled. From
  Today to logging the first set is one tap. That is priority #2 applied to training.

**Sprint 3:** the chip ships with sessions and routines. Until then the row shows the weight chip only;
nothing on screen looks tappable and does nothing.

**Open question for Sprint 3 planning:** what "expected" means.
- **Rotation:** the next routine after the last one completed, e.g. Push → Pull → Legs, whatever the
  weekday.
- **Fixed weekday schedule:** Monday is Push, and so on.

This is a data-model decision (routines need an order, or a weekday), so it is put to the client
before the workout schema is designed.

---

## Sprint 1 review — the same day, weighed on two devices

Raised by `code-reviewer` on PR #30 (suggestion 3), carried into issue #46 · no change to the local
SQLite schema · binding on the sync engine and the Supabase schema when they are built, and on
Sprint 2's weight writes before then

### 8. `body_metrics` resolves on `local_date`, not on `id`

**The situation.** `body_metrics_local_date_idx` is UNIQUE **including tombstones** — the #17
contract fixed it that way, and it is what makes a deleted weigh-in resurrect rather than duplicate.
So a device holds **at most one `body_metrics` row per `local_date`, alive or dead**. Sync's identity,
meanwhile, is `id`. The two disagree the moment the user weighs in on the phone and on the tablet on
the same day while both are offline: two uuids, one date.

Applying that pull by `id` inserts a second row for the date and fails with
`UNIQUE constraint failed: body_metrics.local_date`. `INSERT OR REPLACE` "fixes" it by physically
deleting the existing row, which breaks invariant 3 (deletes are tombstones) and can drop a
tombstone the other device still needs. Neither is acceptable, so the rule below is not an
optimisation — it is the only correct way to apply a `body_metrics` pull.

**The match key.** The sync engine carries a **match key per table**: `id` everywhere, `local_date`
on `body_metrics`. Any table whose natural key differs from `id` must declare one, or its pull fails
on a unique index instead of resolving. Today `body_metrics` is the only such table.

**`local_date` never changes once written.** A new invariant, stated here because nothing else
states it. A `body_metrics` row's `local_date` is fixed for the life of the row, on every device;
correcting the date of a weigh-in is a tombstone on the old date plus a write on the new one, never
an `UPDATE` of `local_date`. Without it the apply below can violate the primary key: device A moves
row `X` from 03-09 to 03-10, device B still holds `X` on 03-09 and its own `Y` on 03-10, and B's
merge for 03-10 runs `set id = 'X'` while `X` already sits on B's 03-09 row —
`UNIQUE constraint failed: body_metrics.id`. With the invariant, a uuid is bound to one date for its
whole life, so the winner's `id` can only ever be on the date being merged. If an apply does hit
that violation, the invariant was broken upstream: fail that row, leave local state untouched, and
surface it. Never route around it with `INSERT OR REPLACE`.

**The winner, for one `local_date`.** Compare the two candidate rows on the pair
`(updated_at, id)`:

1. the higher `updated_at` wins;
2. on an exact tie, the **smaller** `id` wins.

`id` is a canonical **lowercase** uuid (8-4-4-12 hex), compared **byte for byte** — SQLite's default
`BINARY`, Postgres `collate "C"`. Both halves matter: a locale collation or a mixed-case uuid makes
two devices disagree about which is smaller (`'A…' < 'a…'` under `BINARY`), and the totality this
whole ruling rests on is gone. Nothing in the schema enforces the case today — `syncColumns()`
declares `id: text('id').primaryKey()` with no CHECK — so it is a writer rule for now; a CHECK is
worth adding when a migration next touches these tables (`db-engineer`'s call).

`deleted` does not take part: a tombstone is just another version of the row, so a newer remote
tombstone correctly beats an older local weigh-in, and a newer local weigh-in correctly beats an
older remote tombstone. The comparison is a **total order**, so every device reaches the same winner
from any arrival order — including a first-login restore into an empty database, where both uuids
arrive in whatever order the page returns them.

**Applying it.** One statement, and it may rewrite the row's `id`. Resolution is **whole-row**: every
column takes the winning row's value, including its `NULL`s. There is no field-level merge — taking
the winner's `weight` and keeping the loser's `waist` produces a row that no later sync will ever
reconcile, because `updated_at` now says it is settled.

```
update body_metrics
   set id           = :winner_id,
       measured_at  = :winner_measured_at,
       weight       = :winner_weight,
       body_fat_pct = :winner_body_fat_pct,
       waist        = :winner_waist,
       chest        = :winner_chest,
       arm          = :winner_arm,
       updated_at   = :winner_updated_at,
       deleted      = :winner_deleted
 where local_date   = :date
```

That is every column of the table except `local_date` itself, which is the match key and equal on
both rows by construction. A column added to `body_metrics` later must be added here too.

- Only when **no** row holds that `local_date` is the remote row inserted, under its own `id` — and
  that includes a remote **tombstone** for a date this device has never seen. Insert it as a
  tombstone. Skipping it as a no-op leaves the date free, and the next page carrying an older *live*
  version of it inserts a live row: a resurrected weigh-in, the exact bug this ruling exists to
  prevent.
- A pulled row that **loses** is discarded and never inserted — under its own id it would violate the
  unique index anyway.
- Never `delete`, never `insert or replace`, never delete-then-insert. The row's physical existence
  is continuous; only its identity column changes. Nothing references `body_metrics` by foreign key,
  so rewriting `id` is safe.

**The losing uuid is superseded, not deleted — and that holds only because push runs before pull.**
The in-place `UPDATE` overwrites the loser's columns, so the loser survives only as its copy on the
server. Three rules, together, guarantee that copy exists:

1. **Push before pull, per table, per cycle.** A cycle pushes everything with
   `updated_at > last_pushed_at` and only then applies a pulled page. If the push fails, that table's
   pull does not run this cycle — it waits for the next one. Retrying costs nothing; the alternative
   costs a measurement.
2. **The server upsert is itself last-writer-wins:**
   `on conflict (id) do update … where excluded.updated_at > body_metrics.updated_at`. That is what
   makes pushing first safe — an older local row can never clobber a newer remote one.
3. **The remote `body_metrics` carries no unique constraint on `(user_id, local_date)`.** The replica
   is allowed to hold both uuids for a contested date; resolution happens on the device, which is the
   source of truth. A unique constraint there would reject the very push that keeps the loser's
   measurement alive.

With those, the superseded row really does go on existing in Supabase and can never win again on any
device, in any order, including a full restore — so cleanup (pushing a tombstone for a superseded id)
is optional housekeeping and must never be load-bearing. **Without them, this rule loses data:**
phone logs 88.2 kg offline as `Y`, has not synced, the tablet's `X` for the same day arrives first,
and `Y`'s columns are overwritten by a row the user never saw — the measurement now exists nowhere.
The ordering is not an optimisation.

**Ordering across clock skew.** `updated_at` is the writing device's wall clock at the moment of the
user's edit, in ms epoch. It is the only ordering key we have, and it is trusted for ordering only
under these three rules:

- **Strictly greater wins.** An equal `updated_at` never overwrites; it falls to the `id` tiebreak.
  That is what keeps the outcome independent of arrival order, so skew can never turn a merge into a
  coin flip decided by which device happened to sync first.
- **A pulled row keeps the `updated_at` it arrived with.** Never stamp it with local receive time — a
  pulled row would then beat its own source on the next round and the two devices would ping-pong
  forever.
- **A device's own write to a row uses `max(now, existing.updated_at + 1)`.** The user's newer edit
  then always beats the value they were editing, even when the clock has jumped backwards after an
  NTP correction or a timezone change.

**Sprint 2's weight writes follow the same rule, before any sync code exists.** They are what
produces the rows the engine will have to merge, so they must never create a state the rule cannot
resolve:

- One row per date: `insert … on conflict(local_date) do update`, which keeps the **existing** row's
  `id` and sets `deleted = 0`. Never `insert or replace`. On that update,
  `updated_at = max(now, existing.updated_at + 1)` — the same max rule as above, restated because
  this bullet is the one an implementer copies, and `updated_at = now` silently loses an edit made
  after a backwards clock jump.
- Never mint a second uuid for a date that already has a row, live **or** tombstoned.
- `local_date` is never updated. Moving a weigh-in to another day is a tombstone on the old date and
  an upsert on the new one, per the invariant above.
- Mint `id` as a canonical lowercase uuid.
- Deleting a weigh-in sets `deleted = 1` and leaves the date occupied — the date's row *is* the
  tombstone. Re-logging that day resurrects the same row and the same `id`.
- The seeder and the test factories follow this too, or they will manufacture duplicates the app
  itself cannot produce.

**Named tests the sync engine owes**, over the pure `(localRows, remoteRows) => plan` merge:

- same date, two uuids, the remote newer · the same with the local newer;
- an exact `updated_at` tie resolved by the smaller lowercase `id`;
- a remote tombstone against a live local row · a live local row against an older remote tombstone;
- **a remote tombstone for a date with no local row is inserted as a tombstone**, not skipped —
  the resurrection case above, and the most valuable test in this list;
- a restore into an empty database applying both uuids in **both** orders, converging;
- **three uuids for one date, in all six arrival orders.** Two-row convergence follows from the total
  order, but an implementation that folds the local row against only the *first* remote candidate
  passes every other test here;
- **idempotence:** applying the same page twice changes nothing and bumps no `updated_at`. Pulls are
  at-least-once in practice;
- a backwards clock jump that must not let an older edit win;
- a local row that has never been pushed is **pushed before** a pulled page can supersede it.

## Sprint 2 review — what the remote contract may and may not promise

Raised by the opus review of PR #144 (issue #135), settled across issues #147 and the review of
PR #155 · binds the Supabase schema and the RLS contract test · no change to the local SQLite schema

### 9. `DELETE` and `TRUNCATE` are revoked; `UPDATE` stays granted, owner-scoped

**The situation.** The contract asserted that `DELETE` was revoked for `authenticated` and said
nothing about `TRUNCATE`. `TRUNCATE` is a separate Postgres privilege, RLS does not police it *at
all*, and one statement erases a history table. A migration granting it — directly, or via
`grant all privileges` — passed the contract green.

**The decision.** The destructive set is `DELETE` + `TRUNCATE`, revoked and asserted for
`authenticated` **and** `anon`. `service_role` is deliberately out of scope: its key never ships, it
exists to bypass RLS server-side, and revoking there would only force the contract to be loosened
again at the first backfill script. `postgres` owns the tables and may `TRUNCATE` regardless of
grants, so guarding it would be theatre. `TRIGGER` is a known open gap — `grant all` hands it over —
recorded in the docblock rather than implemented, because exploiting it also needs `create` on
`public` and a function to point at.

**`UPDATE` stays granted.** Revoking it breaks sync outright. The push step upserts by `id`: an
edited row already on the server is an `UPDATE`, and **a tombstone is an `UPDATE` too**
(`deleted = 1`, new `updated_at`) — never a row removal, by the tombstone rule. Every second push of
a row would fail, the client swallows push errors by design, and the replica would freeze at each
row's first version. The revoke would destroy exactly the history it was meant to protect.

**What that costs us, stated plainly.** `UPDATE` **can** rewrite a historical `kcal`, and nothing in
the remote contract prevents it.
`update food_log set kcal = 0 where local_date < '2026-01-01'` is accepted by the owner-scoped
policy: `using` and `with check` constrain *which rows*, never *which columns*.

**Two guarantees, different jobs — do not blur them.** "`food_log` stores `kcal`/`protein` directly"
protects past logs from a **food edit**. That is the `CLAUDE.md` invariant, and it is airtight. It
protects nothing against a direct write to a past row. What contains *that* today is that the client
never issues such a write, and that last-write-wins means a remote rewrite only reaches the device if
it carries a newer `updated_at`. **Client convention, not a database guarantee** — acceptable, but
labelled as what it is.

**What would change this.** If immutability ever needs real enforcement, the mechanism is
column-level `grant update (deleted, updated_at, ...) on public.food_log to authenticated`:
tombstones and edits keep working while `kcal`/`protein` become unwritable at the database. **It does
not fit today**, because editing a log's amount legitimately recomputes `kcal`. It is still the shape
of the answer, and it is the reason not to reach for a blanket revoke.

The rule the whole section reduces to: **revoke what erases, constrain what edits.**

In-repo copies: `supabase/README.md`, and the `DESTRUCTIVE_PRIVILEGES` / `GUARDED_ROLES` docblocks in
`src/sync/contract/schema.test.ts`.

---

## Phone QA — where a meal is logged, and where it is managed

Ruled by the client on 2026-09-15 in issue #101, landed in PRs #157 and #166 · binds
`src/components/meals/**` and `app/meals/**` · no change to the data model

### 10. The Settings meal list is for managing meals, not logging them

**The situation.** Tapping a row in Settings → Meals used to log the meal. That left nowhere to
edit or delete one, and the client reported from the phone that saved meals couldn't be changed at
all.

**The ruling.** In Settings → Meals, **a tap opens the meal's edit screen** (`/meals/[id]`, the meal
form pre-filled) and **a swipe left deletes it**, with the undo toast. Nothing in that list logs a
meal. Meals are logged from the **quick-add grid and search**, the same places as foods.

**Why it costs no taps.** Logging never needed a trip into Settings: the grid and search already put a
meal on the log in one tap. The Settings path was a second way to do the same
thing, and it took the only gesture that could have opened the editor. Giving that tap to editing
means logging keeps its one-tap path, and managing a meal gets a path it didn't have before.

**How to read it for a new case.** Settings lists are for **curating the catalogue**: rename, fix
the ingredients, delete. The daily log is fed from Today's surfaces. If a Settings list ever seems to
need a "log this" action, the catalogue item is probably missing from the grid or search, so fix it
there. The foods list in Settings (#100) follows the same rule.

Deleting a meal tombstones the meal and its items. It never touches past `food_log` rows, because
they store their own `kcal`/`protein` (see `CLAUDE.md`, "History is immutable").

## Exact numbers — typing is allowed, and the step is not the escape hatch

Ruled by the client on 2026-09-15 in issue #87, landed in PR #184 · binds
`src/components/food-form/Stepper.tsx` and every screen that uses it · no change to the data model

### 11. A number field is allowed when the stepper is the slow path, not the fast one

**The situation.** The original doctrine was "never a keyboard number field": every amount moved in
+/- taps on a five-unit grid, on the reasoning that a keyboard is slower than a tap and that a grid
keeps a value tidy. The client's bug report (6.4) measured what that cost on real food. A nut butter
at 600 kcal per 100 g took **120 taps** to log; a plain 100 g serving took 20. A label reading 37 g
could not be entered at all — only 35 or 40.

**The ruling.** Three changes, everywhere `Stepper` is used:

- **Tap the value to type it.** A `decimal-pad` opens with the current value selected, so typing
  replaces it. An empty or invalid entry reverts in silence; nothing is ever half-committed.
- **+/- steps by 1** (protein by 0.1) **in the food form**, so a correction of one gram is one tap.
- **Holding +/-** repeats and then accelerates, for a long run in one gesture.

**Targets and meal portions keep their own step sizes** (50 kcal / 5 g, and 0.5 servings). Their
steps were never the problem — reaching an exact number was, and typing now covers that. Dropping a
2,400 kcal target to steps of 1 would have made the common case worse to fix the rare one.

**Why it costs no taps.** The grid was defending tidiness, not speed. Typing is *fewer* taps
whenever the target is more than a few steps away, and the stepper is still there for the small
correction, which is the case it was always good at. Tap-to-type raises the ceiling and lowers
nothing: setting an arbitrary kcal value goes from ~120 taps to one tap plus typing.

**How to read it for a new case.** A stepper is right when the value moves by a step or two from
where it already is. The moment a real value on a real label needs more than a handful of taps, the
control needs a way to be told the number outright. That is not a licence for a bare text field:
the typed path is an *addition* to the stepper, keeps the same clamping and validation, and reverts
rather than storing nonsense. #94 applies the same rule to the portion sheet's quantity readout.
