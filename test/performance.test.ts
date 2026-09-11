/**
 * The performance guard for priority #3: "years of data, instant graphs".
 *
 * Every query a chart runs, over 400 days of seeded history, must come back in under 200ms — the
 * threshold above which a screen transition stops feeling instant. These run against the real
 * schema and the real migrations in `src/db/`, so a missing index cannot ship without this failing.
 *
 * The numbers are printed, not just asserted, so a slow drift is visible in CI output long before
 * it crosses the line.
 */
import { performance } from 'node:perf_hooks';
import { countRows } from './db';
import { addLocalDays } from './local-date';
import { makeSeededTestDb } from './seed';
import * as schema from './schema';

/** The budget from the product priorities. */
const BUDGET_MS = 200;
const END = '2025-03-09';
const START = addLocalDays(END, -399);

function measure(name: string, run: () => unknown): number {
  run(); // warm the statement cache, the way a second chart render would be warm
  const started = performance.now();
  const rows = run();
  const elapsed = performance.now() - started;
   
  console.log(`${name}: ${elapsed.toFixed(2)}ms (${Array.isArray(rows) ? rows.length : 1} rows)`);
  return elapsed;
}

/**
 * A fresh 400-day database, per test. Deliberately *not* hoisted into a `describe` body or a
 * `beforeAll`: `test/setup/common.ts` closes every handle after each test, so a shared one would be
 * dead by the second. At ~0.1ms a call there is no reason to share it.
 */
const seedDb = () => makeSeededTestDb({ schema, days: 400, endDate: END });

describe('charts over 400 days of history', () => {

  it('has 400 days of data to be slow over', () => {
    // Guards the guard. A budget met against an empty table proves nothing.
    const seeded = seedDb();
    expect(countRows(seeded.sqlite, 'food_log')).toBeGreaterThan(3000);
    expect(countRows(seeded.sqlite, 'body_metrics')).toBeGreaterThan(250);
    expect(new Set((seeded.sqlite.prepare('select local_date from food_log').all() as { local_date: string }[])
      .map((r) => r.local_date)).size).toBeGreaterThan(380);
  });

  it('returns a full calorie history in under 200ms', () => {
    const seeded = seedDb();
    const elapsed = measure('daily kcal, 400 days', () =>
      seeded.sqlite
        .prepare(
          `select local_date, sum(kcal) as kcal, sum(protein) as protein
             from food_log
            where deleted = 0 and local_date between ? and ?
            group by local_date
            order by local_date`,
        )
        .all(START, END),
    );
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('returns a full weight history in under 200ms', () => {
    const seeded = seedDb();
    const elapsed = measure('weight, 400 days', () =>
      seeded.sqlite
        .prepare(
          `select local_date, weight, body_fat_pct
             from body_metrics
            where deleted = 0 and local_date between ? and ?
            order by local_date`,
        )
        .all(START, END),
    );
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('returns a single day’s log in under 200ms', () => {
    // The Today screen's own query. It is the one that runs on every app open.
    const seeded = seedDb();
    const elapsed = measure('one day', () =>
      seeded.sqlite
        .prepare('select * from food_log where deleted = 0 and local_date = ? order by logged_at')
        .all(END),
    );
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('returns the quick-add ranking in under 200ms', () => {
    // Priority #2 depends on this being instant: the grid has to be on screen before the user
    // has finished deciding what to tap.
    const seeded = seedDb();
    const elapsed = measure('quick-add ranking', () =>
      seeded.sqlite
        .prepare(
          `select id, name, use_count, last_used_at, hour_histogram
             from foods
            where deleted = 0 and archived = 0
            order by use_count desc, last_used_at desc
            limit 6`,
        )
        .all(),
    );
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('returns a 7-day rolling average in under 200ms', () => {
    const seeded = seedDb();
    const elapsed = measure('7-day rolling average', () =>
      seeded.sqlite
        .prepare(
          `select local_date,
                  avg(sum(kcal)) over (order by local_date rows between 6 preceding and current row) as avg7
             from food_log
            where deleted = 0
            group by local_date
            order by local_date`,
        )
        .all(),
    );
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('uses the local_date index rather than scanning the table', () => {
    // The assertion that survives a faster laptop. A timing budget alone would go green on a
    // full table scan of 4,000 rows and only fail years later on a real user's data.
    const seeded = seedDb();
    const plan = seeded.sqlite
      .prepare('explain query plan select * from food_log where local_date between ? and ?')
      .all(START, END) as { detail: string }[];

    expect(plan.map((p) => p.detail).join(' ')).toMatch(/USING INDEX food_log_local_date_idx/);
  });

  it('gets its 400 days of fixture for effectively free', () => {
    // If seeding cost 100ms per test, nobody would seed, and the guard above would be run against
    // toy data. The snapshot cache is what makes the realistic fixture the convenient one.
    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const started = performance.now();
      const t = makeSeededTestDb({ schema, days: 400, endDate: END });
      t.sqlite.prepare('select count(*) as n from food_log').get();
      t.close();
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const median = samples[10] ?? Infinity;
     
    console.log(`makeSeededTestDb(400 days): median ${median.toFixed(3)}ms`);
    expect(median).toBeLessThan(10);
  });
});
