/**
 * The seeder, judged on the only thing that matters: is the data realistic enough that a chart
 * built on it can be *wrong* in a way you would notice?
 *
 * Random numbers make a chart that looks plausible and proves nothing. These tests pin the
 * properties a chart test actually leans on — a trend, gaps, weekends, a training split, late-night
 * meals — and pin determinism, so a failure is a real change and not a reroll.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { countRows, makeTestDb, tableNames } from './db';
import { addLocalDays, localDateOf, localDayOfWeek, naiveLocalDateOf } from './local-date';
import type { SeedData } from './model';
import { insertSeed, makeSeededTestDb, seedData, seedSummary, seedTestDb, seedToFile } from './seed';
import * as schema from './schema';

const YEAR: SeedData = seedData({ days: 400 });

const dailyKcal = (data: SeedData): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const row of data.foodLog) {
    if (row.deleted) continue;
    totals.set(row.localDate, (totals.get(row.localDate) ?? 0) + row.kcal);
  }
  return totals;
};

describe('the seeder', () => {
  it('produces the same bytes on every run and every machine', () => {
    // Without this, every other assertion in this file is a coin toss.
    expect(seedData({ days: 30 })).toEqual(seedData({ days: 30 }));
  });

  it('produces a different-but-still-deterministic user for a different seed', () => {
    expect(seedData({ days: 30, seed: 7 })).not.toEqual(seedData({ days: 30 }));
    expect(seedData({ days: 30, seed: 7 })).toEqual(seedData({ days: 30, seed: 7 }));
  });

  it('covers every table the data model defines', () => {
    const summary = seedSummary(YEAR);
    for (const [table, count] of Object.entries(summary)) {
      expect([table, count > 0]).toEqual([table, true]);
    }
  });

  it('generates the number of days it was asked for, ending on the day requested', () => {
    const data = seedData({ days: 400, endDate: '2025-03-09' });
    const days = [...new Set(data.foodLog.map((r) => r.localDate))].sort();
    expect(days[days.length - 1]).toBe('2025-03-09');
    expect(days[0]?.localeCompare(addLocalDays('2025-03-09', -399)) ?? -1).toBeGreaterThanOrEqual(0);
    expect(days.length).toBeGreaterThan(380); // some days are deliberately unlogged
  });

  it('handles the degenerate sizes without special-casing', () => {
    expect(seedData({ days: 0 }).foodLog).toEqual([]);
    const oneDay = seedData({ days: 1 });
    expect(new Set(oneDay.foodLog.map((r) => r.localDate)).size).toBeLessThanOrEqual(1);
  });
});

describe('seeded nutrition', () => {
  it('averages close to the user’s calorie target rather than drifting below it', () => {
    // The bug this caught: portions picked at random made the average intake 1722 against a 2400
    // target, which quietly turned the weight chart into a 27kg crash diet.
    const totals = [...dailyKcal(YEAR).values()];
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(mean).toBeGreaterThan(2400 * 0.9);
    expect(mean).toBeLessThan(2400 * 1.1);
  });

  it('varies day to day by a realistic amount, neither flat nor wild', () => {
    // A flat series makes any smoothing bug invisible; a wild one makes any trend assertion pass.
    // The spread is pinned from both sides on purpose.
    const totals = [...dailyKcal(YEAR).values()];
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    const sd = Math.sqrt(totals.reduce((a, b) => a + (b - mean) ** 2, 0) / totals.length);

    expect(sd).toBeGreaterThan(150);
    expect(sd).toBeLessThan(700);
    expect(Math.min(...totals)).toBeLessThan(2400 * 0.8);
    expect(Math.max(...totals)).toBeGreaterThan(2400 * 1.15);
  });

  it('eats more at weekends, so a week-over-week chart has something to show', () => {
    const totals = dailyKcal(YEAR);
    const mean = (predicate: (day: string) => boolean): number => {
      const values = [...totals].filter(([day]) => predicate(day)).map(([, kcal]) => kcal);
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    const weekend = mean((d) => [0, 6].includes(localDayOfWeek(d)));
    const weekday = mean((d) => ![0, 6].includes(localDayOfWeek(d)));
    expect(weekend).toBeGreaterThan(weekday * 1.05);
  });

  it('leaves some days unlogged, because real histories have holes', () => {
    // "Average over the last 7 days" that divides by 7 regardless is the bug this data exposes.
    const logged = dailyKcal(YEAR).size;
    expect(logged).toBeLessThan(400);
    expect(logged).toBeGreaterThan(360);
  });

  it('spreads meals across all four slots', () => {
    const slots = new Set(YEAR.foodLog.map((r) => r.slot));
    expect([...slots].sort()).toEqual(['breakfast', 'dinner', 'lunch', 'snack']);
  });

  it('logs plausible portions rather than fractions nobody would enter', () => {
    const quantities = [...new Set(YEAR.foodLog.map((r) => r.qty))].sort((a, b) => a - b);
    expect(quantities.every((q) => q >= 0.5 && q <= 3 && Math.round(q * 2) === q * 2)).toBe(true);
  });

  it('copies kcal and protein onto the log row rather than leaving a join to do it', () => {
    // Invariant #2, in the fixture data itself.
    expect(YEAR.foodLog.every((r) => typeof r.kcal === 'number' && typeof r.protein === 'number')).toBe(true);
    expect(YEAR.foodLog.every((r) => r.kcal > 0)).toBe(true);
  });

  it('puts every log row on the local_date its own timestamp falls on', () => {
    const wrong = YEAR.foodLog.filter((r) => localDateOf(r.loggedAt, 'America/Los_Angeles') !== r.localDate);
    expect(wrong).toEqual([]);
  });

  it('includes late-night meals that a UTC-derived day would file under tomorrow', () => {
    // The seeded data walks into the trap on purpose, so anyone charting it walks into it too.
    const late = YEAR.foodLog.filter((r) => naiveLocalDateOf(r.loggedAt) !== r.localDate);
    expect(late.length).toBeGreaterThan(100);
    const after2330 = YEAR.foodLog.filter((r) => r.localDate === localDateOf(r.loggedAt) && r.slot === 'snack');
    expect(after2330.length).toBeGreaterThan(0);
  });

  it('builds each food’s hour histogram from the hours it was actually logged at', () => {
    // The quick-add grid ranks on this. A histogram that disagrees with `food_log` would make the
    // ranking untestable — it would be scoring a history that never happened.
    const byFood = new Map<string, number[]>();
    for (const row of YEAR.foodLog) {
      if (!row.foodId) continue;
      const hours = byFood.get(row.foodId) ?? new Array<number>(24).fill(0);
      const hour = Number(
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit' })
          .format(new Date(row.loggedAt)),
      ) % 24;
      hours[hour] = (hours[hour] ?? 0) + 1;
      byFood.set(row.foodId, hours);
    }
    for (const food of YEAR.foods) {
      const hours = byFood.get(food.id);
      // The canonical encoding (issue #17 contract, §1.4): NULL when the food was never logged
      // directly, exactly the 24-count JSON array otherwise — never 24 zeros.
      expect([food.name, food.hourHistogram]).toEqual([food.name, hours ? JSON.stringify(hours) : null]);
    }
  });

  it('never encodes an unused food’s histogram as 24 zeros', () => {
    // A short seed is the case that actually exercises this: 400 days uses every catalogue item at
    // least once, but a 2-day seed leaves most of the catalogue untouched.
    const short = seedData({ days: 2 });
    const untouched = short.foods.filter((f) => f.useCount === 0);
    expect(untouched.length).toBeGreaterThan(0);
    for (const food of untouched) {
      expect([food.name, food.hourHistogram]).toEqual([food.name, null]);
    }
  });

  it('counts each food’s uses to match the log', () => {
    const counts = new Map<string, number>();
    for (const row of YEAR.foodLog) {
      if (row.foodId) counts.set(row.foodId, (counts.get(row.foodId) ?? 0) + 1);
    }
    for (const food of YEAR.foods) {
      expect([food.name, food.useCount]).toEqual([food.name, counts.get(food.id) ?? 0]);
    }
  });
});

describe('seeded bodyweight', () => {
  const weights = YEAR.bodyMetrics.map((m) => m.weight);

  it('trends over the year rather than wandering at random', () => {
    const first = weights.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
    const last = weights.slice(-20).reduce((a, b) => a + b, 0) / 20;
    expect(first - last).toBeGreaterThan(3);
  });

  it('trends by an amount a human could actually lose in 400 days', () => {
    // The other half. A 27kg loss is as useless a fixture as no trend at all — it makes any
    // rate-of-change assertion pass.
    const first = weights.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
    const last = weights.slice(-20).reduce((a, b) => a + b, 0) / 20;
    expect(first - last).toBeLessThan(20);
  });

  it('is jagged day to day, so a smoothed line differs from the raw one', () => {
    // If the raw series were already smooth, a broken moving average would still look right.
    const deltas = weights.slice(1).map((w, i) => Math.abs(w - (weights[i] ?? w)));
    const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    expect(meanDelta).toBeGreaterThan(0.2);
  });

  it('skips weigh-ins on some days, and never records two for one day', () => {
    const days = YEAR.bodyMetrics.map((m) => m.localDate);
    expect(new Set(days).size).toBe(days.length);
    expect(days.length).toBeLessThan(400);
    expect(days.length).toBeGreaterThan(250);
  });
});

describe('seeded training', () => {
  it('follows a four-day split with realistic adherence, not a perfect record', () => {
    const trained = new Set(YEAR.sessions.map((s) => localDayOfWeek(s.localDate)));
    expect([...trained].sort()).toEqual([1, 2, 4, 5]);
    expect(YEAR.sessions.length).toBeGreaterThan(400 * (4 / 7) * 0.7);
    expect(YEAR.sessions.length).toBeLessThan(400 * (4 / 7));
  });

  it('gets stronger over the year', () => {
    const squat = YEAR.exercises.find((e) => e.name === 'Back squat');
    const working = YEAR.sets.filter((s) => s.exerciseId === squat?.id && !s.isWarmup);
    const first = working.slice(0, 10).reduce((a, s) => a + s.weight, 0) / 10;
    const last = working.slice(-10).reduce((a, s) => a + s.weight, 0) / 10;
    expect(last).toBeGreaterThan(first);
  });

  it('loads the bar in 2.5kg jumps, the way a real gym does', () => {
    expect(YEAR.sets.every((s) => Math.round(s.weight / 2.5) * 2.5 === s.weight)).toBe(true);
  });

  it('includes deload weeks, so a PR chart has plateaus to get wrong', () => {
    expect(YEAR.sessions.some((s) => s.notes === 'deload week')).toBe(true);
  });

  it('gives every set a session that exists and a sane set index', () => {
    const sessionIds = new Set(YEAR.sessions.map((s) => s.id));
    expect(YEAR.sets.every((s) => sessionIds.has(s.sessionId))).toBe(true);
    expect(YEAR.sets.every((s) => s.setIndex >= 0 && s.reps > 0)).toBe(true);
  });

  it('marks warm-up sets so they can be excluded from volume', () => {
    expect(YEAR.sets.some((s) => s.isWarmup === 1)).toBe(true);
    expect(YEAR.sets.every((s) => (s.isWarmup === 1 ? s.rpe === null : typeof s.rpe === 'number'))).toBe(true);
  });
});

describe('referential integrity of the seed', () => {
  it('points every foreign key at a row that exists', () => {
    const foods = new Set(YEAR.foods.map((f) => f.id));
    const exercises = new Set(YEAR.exercises.map((e) => e.id));
    const meals = new Set(YEAR.meals.map((m) => m.id));
    const routines = new Set(YEAR.routines.map((r) => r.id));

    expect(YEAR.foodLog.every((r) => r.foodId === null || foods.has(r.foodId))).toBe(true);
    expect(YEAR.mealItems.every((r) => meals.has(r.mealId) && foods.has(r.foodId))).toBe(true);
    expect(YEAR.routineItems.every((r) => routines.has(r.routineId) && exercises.has(r.exerciseId))).toBe(true);
    expect(YEAR.sessions.every((s) => s.routineId === null || routines.has(s.routineId))).toBe(true);
    expect(YEAR.sets.every((s) => exercises.has(s.exerciseId))).toBe(true);
  });

  it('gives every row a unique id across the whole dataset', () => {
    const ids = Object.values(YEAR).flatMap((rows) => (rows as { id: string }[]).map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every row the three sync fields', () => {
    for (const rows of Object.values(YEAR)) {
      for (const row of rows as { id: string; updatedAt: number; deleted: number }[]) {
        expect(typeof row.updatedAt).toBe('number');
        expect(row.deleted).toBe(0);
      }
    }
  });
});

describe('loading the seed into a database', () => {
  it('inserts every table the schema knows about and skips the ones it does not', () => {
    const target = makeTestDb({ schema });
    const data = seedTestDb(target, { days: 30 });

    expect(countRows(target.sqlite, 'foods')).toBe(data.foods.length);
    expect(countRows(target.sqlite, 'food_log')).toBe(data.foodLog.length);
    expect(countRows(target.sqlite, 'body_metrics')).toBe(data.bodyMetrics.length);
  });

  it('leaves foreign key enforcement on afterwards', () => {
    // Seeding turns FKs off to insert table-by-table. If it forgot to turn them back on, every
    // test that seeded would silently stop checking them.
    const target = makeTestDb({ schema });
    seedTestDb(target, { days: 5 });
    expect(target.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('round-trips values unchanged through SQLite', () => {
    const target = makeTestDb({ schema });
    const data = seedTestDb(target, { days: 3 });
    const rows = target.sqlite
      .prepare('select id, logged_at, local_date, kcal, protein, qty, slot from food_log order by logged_at')
      .all() as { id: string; logged_at: number; local_date: string; kcal: number }[];

    const expected = [...data.foodLog].sort((a, b) => a.loggedAt - b.loggedAt);
    expect(rows.map((r) => [r.id, r.logged_at, r.local_date, r.kcal])).toEqual(
      expected.map((r) => [r.id, r.loggedAt, r.localDate, r.kcal]),
    );
  });

  it('works through the plain Drizzle path too, for callers without a raw handle', () => {
    const target = makeTestDb({ schema });
    const data = seedData({ days: 10 });
    const counts = insertSeed(target.db as never, schema, data);

    expect(counts['foodLog']).toBe(data.foodLog.length);
    expect(countRows(target.sqlite, 'food_log')).toBe(data.foodLog.length);
  });

  it('gives makeSeededTestDb a database that is already full', () => {
    const { sqlite } = makeSeededTestDb({ schema, days: 400 });
    expect(countRows(sqlite, 'food_log')).toBe(YEAR.foodLog.length);
    expect(countRows(sqlite, 'body_metrics')).toBe(YEAR.bodyMetrics.length);
  });

  it('gives two makeSeededTestDb handles independent copies', () => {
    const a = makeSeededTestDb({ schema, days: 30 });
    const b = makeSeededTestDb({ schema, days: 30 });
    const before = countRows(b.sqlite, 'food_log');
    a.sqlite.prepare('delete from food_log').run();

    expect(countRows(a.sqlite, 'food_log')).toBe(0);
    expect(countRows(b.sqlite, 'food_log')).toBe(before);
  });
});

describe('the seed CLI', () => {
  // `scripts/seed.sh <days>` runs this. If it throws, the demo has no data and nobody finds out
  // until someone tries to show the app to the client.
  it('writes a real SQLite file with the migrations applied and the history in it', () => {
    const out = path.join(os.tmpdir(), `vitals-seed-${process.pid}.db`);
    const result = seedToFile({ out, days: 30 });

    expect(fs.existsSync(result.path)).toBe(true);
    expect(result.summary['foodLog']).toBeGreaterThan(200);
    expect(result.label).toBe('src/db/schema.ts');

    const sqlite = new Database(result.path, { readonly: true });
    try {
      expect(tableNames(sqlite)).toEqual(expect.arrayContaining(['foods', 'food_log', 'body_metrics']));
      expect(countRows(sqlite, 'food_log')).toBe(result.summary['foodLog']);
      const days = sqlite.prepare('select distinct local_date from food_log order by local_date').all() as {
        local_date: string;
      }[];
      expect(days[days.length - 1]?.local_date).toBe('2025-03-09');
    } finally {
      sqlite.close();
      fs.rmSync(result.path, { force: true });
    }
  });

  it('overwrites a previous run rather than appending to it', () => {
    const out = path.join(os.tmpdir(), `vitals-seed-twice-${process.pid}.db`);
    const first = seedToFile({ out, days: 10 });
    const second = seedToFile({ out, days: 10 });

    const sqlite = new Database(second.path, { readonly: true });
    try {
      expect(countRows(sqlite, 'food_log')).toBe(first.summary['foodLog']);
    } finally {
      sqlite.close();
      fs.rmSync(second.path, { force: true });
    }
  });
});
