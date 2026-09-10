/**
 * THE WORKED EXAMPLE.
 *
 * This file exists to answer one question: *does this harness actually catch a real bug, or does it
 * just go green?* So it takes the single most likely data bug in the whole app — deriving the
 * calendar day from the UTC timestamp — writes it into a database exactly the way a real
 * implementation would, and shows the harness failing on it.
 *
 * The bug: the user logs a snack at **23:55 on Sunday 9 March 2025** in `America/Los_Angeles`.
 * That instant is `2025-03-10T06:55Z`. `new Date(ms).toISOString().slice(0, 10)` returns
 * `'2025-03-10'`. The snack lands on Monday. The user's Sunday total is short by 214 kcal, Monday's
 * is over by 214, and the "yesterday vs today" comparison on the Today screen is wrong for both
 * days — silently, with no error anywhere.
 *
 * Every assertion below is written so that it *fails* if the naive implementation is used, and the
 * last test proves that by using it.
 */
import { eq } from 'drizzle-orm';
import { makeTestDb } from './db';
import { makeLogEntry } from './factories';
import * as schema from './schema';
import { instantOfLocal, localDateOf, naiveLocalDateOf } from './local-date';
import { setLocalTime, useTimezone, withTimezone } from './time';

/** The instant under test, in the words a bug report would use. */
const SUNDAY = '2025-03-09';
const MONDAY = '2025-03-10';
const LATE_SNACK = '23:55';

/** What the app would write if it used the correct implementation. */
function logLateSnack(at: number, localDate: string) {
  return makeLogEntry({
    loggedAt: at,
    localDate,
    kcal: 214,
    protein: 21,
    slot: 'snack',
  });
}

describe('a 23:55 snack', () => {
  useTimezone('America/Los_Angeles');

  it('belongs to the day the user was living in, not the day UTC had already reached', () => {
    const at = setLocalTime(SUNDAY, LATE_SNACK);

    expect(new Date(at).toISOString()).toBe('2025-03-10T06:55:00.000Z');
    expect(localDateOf(at)).toBe(SUNDAY);
    expect(naiveLocalDateOf(at)).toBe(MONDAY); // the bug, stated as a fact
  });

  it('is counted in Sunday’s totals and not in Monday’s', () => {
    const { db } = makeTestDb({ schema });
    const at = instantOfLocal(SUNDAY, LATE_SNACK);

    db.insert(schema.foodLog).values(logLateSnack(at, localDateOf(at))).run();

    const rows = db.select().from(schema.foodLog).all();
    expect(rows).toBeOnLocalDate(SUNDAY);
    expect(rows).toHaveDailyTotal(SUNDAY, { kcal: 214, protein: 21 });
    expect(rows).toHaveDailyTotal(MONDAY, { kcal: 0, protein: 0 });
  });

  it('is still on Sunday after the row has been through SQLite and back', () => {
    // Round-tripping matters: a `local_date` that is correct in memory and re-derived on read is
    // not an invariant, it is a coincidence waiting for a refactor.
    const { db } = makeTestDb({ schema });
    const at = instantOfLocal(SUNDAY, LATE_SNACK);
    db.insert(schema.foodLog).values(logLateSnack(at, localDateOf(at))).run();

    const row = db.select().from(schema.foodLog).where(eq(schema.foodLog.localDate, SUNDAY)).get();
    expect(row).toBeDefined();
    expect(row).toBeOnLocalDate(SUNDAY);
  });

  it('is caught by the matcher when the implementation derives the day from UTC', () => {
    // The proof. This is what a real regression looks like from the outside.
    const { db } = makeTestDb({ schema });
    const at = instantOfLocal(SUNDAY, LATE_SNACK);

    db.insert(schema.foodLog).values(logLateSnack(at, naiveLocalDateOf(at))).run();
    const rows = db.select().from(schema.foodLog).all();

    expect(() => expect(rows).toBeOnLocalDate(SUNDAY)).toThrow(/local_date is "2025-03-10"/);
    expect(() => expect(rows).toHaveDailyTotal(SUNDAY, { kcal: 214 })).toThrow(/summed 0/);

    // And the specific damage: a day the user never ate on now has 214 kcal in it.
    expect(rows).toHaveDailyTotal(MONDAY, { kcal: 214 });
  });

  it('is caught even when the stored day is right but the timestamp disagrees with it', () => {
    // The subtler variant: someone fixes `local_date` but computes the timestamp in the wrong
    // timezone, or backfills the wrong instant. The string alone would pass; the pair does not.
    const { db } = makeTestDb({ schema });
    const wrongInstant = instantOfLocal(MONDAY, LATE_SNACK);

    db.insert(schema.foodLog).values(logLateSnack(wrongInstant, SUNDAY)).run();
    const rows = db.select().from(schema.foodLog).all();

    expect(() => expect(rows).toBeOnLocalDate(SUNDAY)).toThrow(/the stored day and the real day disagree/);
  });
});

describe('a local_date that has already been stored', () => {
  it('does not move when the user travels', () => {
    // Invariant #1's real payoff. The Sunday snack was eaten on Sunday; landing in Auckland must
    // not retroactively move it to Monday, which is exactly what re-deriving from UTC would do.
    const { db } = makeTestDb({ schema });
    const at = instantOfLocal(SUNDAY, LATE_SNACK, 'America/Los_Angeles');
    db.insert(schema.foodLog).values(logLateSnack(at, SUNDAY)).run();

    withTimezone('Pacific/Auckland', () => {
      const rows = db.select().from(schema.foodLog).all();
      expect(rows).toHaveDailyTotal(SUNDAY, { kcal: 214 });
      // The stored string is untouched; only a *re-derivation* would have moved it.
      expect(localDateOf(at, 'Pacific/Auckland')).toBe(MONDAY);
      expect(rows[0]?.localDate).toBe(SUNDAY);
    });
  });
});

describe('the day the clocks go forward', () => {
  useTimezone('America/Los_Angeles');

  it('still has a 23:55 slot, and it is 23 hours after its own midnight', () => {
    // 9 March 2025 is a 23-hour day in Los Angeles. Anything that computes "start of day + 23h55m"
    // by arithmetic on a timestamp lands an hour out; going through the wall clock does not.
    const at = instantOfLocal(SUNDAY, LATE_SNACK);
    const midnight = instantOfLocal(SUNDAY, '00:00');

    expect(localDateOf(at)).toBe(SUNDAY);
    expect(at - midnight).toBe((22 * 60 + 55) * 60_000); // 23:55 wall clock, 22h55m elapsed
    expect(instantOfLocal(MONDAY, '00:00') - midnight).toBe(23 * 3_600_000);
  });
});
