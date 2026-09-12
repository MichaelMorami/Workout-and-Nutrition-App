/**
 * `weightSummary` — every case from the issue #17 contract amendment (2026-09-11): an empty DB,
 * one weigh-in, both windows populated (delta against a hand-computed difference of means), a
 * tombstoned weigh-in excluded, the window boundaries at exactly `localDate - 6`, `- 7` and `- 13`,
 * and a weigh-in dated after `localDate` ignored.
 */
import { performance } from 'node:perf_hooks';
import { addLocalDays } from '../local-time';
import { makeTestDb } from '../../../test/db';
import { makeBodyMetric } from '../../../test/factories';
import { makeSeededTestDb } from '../../../test/seed';
import * as schema from '../schema';
import { weightSummary } from './weight';

const TODAY = '2025-03-09';

function setup() {
  const { db } = makeTestDb({ schema });
  return { db };
}

function weighIn(localDate: string, weight: number, overrides: Partial<Parameters<typeof makeBodyMetric>[0]> = {}) {
  return makeBodyMetric({ localDate, weight, measuredAt: Date.parse(`${localDate}T07:00:00.000Z`), ...overrides });
}

describe('weightSummary', () => {
  it('on an empty database, every field is null', () => {
    const { db } = setup();
    expect(weightSummary(db, TODAY)).toEqual({ latest: null, avg7: null, avg7PrevWeek: null, weeklyDelta: null });
  });

  it('one weigh-in: latest is set, weeklyDelta is null', () => {
    const { db } = setup();
    const row = weighIn(TODAY, 83.4);
    db.insert(schema.bodyMetrics).values(row).run();

    const summary = weightSummary(db, TODAY);
    expect(summary.latest).toEqual({ localDate: TODAY, weight: 83.4, measuredAt: row.measuredAt });
    expect(summary.avg7).toBe(83.4);
    expect(summary.avg7PrevWeek).toBeNull();
    expect(summary.weeklyDelta).toBeNull();
  });

  it('both windows populated: weeklyDelta equals a hand-computed difference of means', () => {
    const { db } = setup();
    // This week: localDate-6..localDate. Previous week: localDate-13..localDate-7.
    const thisWeek = [
      weighIn(addLocalDays(TODAY, -6), 84.0),
      weighIn(addLocalDays(TODAY, -3), 83.5),
      weighIn(TODAY, 83.0),
    ];
    const prevWeek = [weighIn(addLocalDays(TODAY, -13), 86.0), weighIn(addLocalDays(TODAY, -7), 85.0)];
    db.insert(schema.bodyMetrics).values([...thisWeek, ...prevWeek]).run();

    const expectedAvg7 = (84.0 + 83.5 + 83.0) / 3;
    const expectedAvg7Prev = (86.0 + 85.0) / 2;

    const summary = weightSummary(db, TODAY);
    expect(summary.avg7).toBeCloseTo(expectedAvg7, 10);
    expect(summary.avg7PrevWeek).toBeCloseTo(expectedAvg7Prev, 10);
    expect(summary.weeklyDelta).toBeCloseTo(expectedAvg7 - expectedAvg7Prev, 10);
    expect(summary.latest).toMatchObject({ localDate: TODAY, weight: 83.0 });
  });

  it('a tombstoned weigh-in is excluded from latest and from both means', () => {
    const { db } = setup();
    db.insert(schema.bodyMetrics)
      .values([weighIn(addLocalDays(TODAY, -1), 90.0, { deleted: 1 }), weighIn(addLocalDays(TODAY, -2), 80.0)])
      .run();

    const summary = weightSummary(db, TODAY);
    expect(summary.latest).toMatchObject({ localDate: addLocalDays(TODAY, -2), weight: 80.0 });
    expect(summary.avg7).toBe(80.0);
  });

  it('the this-week window boundary at exactly localDate - 6 is included; localDate - 7 is not', () => {
    const { db } = setup();
    db.insert(schema.bodyMetrics)
      .values([weighIn(addLocalDays(TODAY, -6), 80.0), weighIn(addLocalDays(TODAY, -7), 999)])
      .run();

    expect(weightSummary(db, TODAY).avg7).toBe(80.0);
  });

  it('the previous-week window boundary at exactly localDate - 7 and localDate - 13 are both included', () => {
    const { db } = setup();
    db.insert(schema.bodyMetrics)
      .values([weighIn(addLocalDays(TODAY, -7), 80.0), weighIn(addLocalDays(TODAY, -13), 82.0), weighIn(addLocalDays(TODAY, -14), 999)])
      .run();

    expect(weightSummary(db, TODAY).avg7PrevWeek).toBe((80.0 + 82.0) / 2);
  });

  it('a weigh-in dated after localDate is ignored entirely', () => {
    const { db } = setup();
    db.insert(schema.bodyMetrics)
      .values([weighIn(TODAY, 80.0), weighIn(addLocalDays(TODAY, 1), 999)])
      .run();

    const summary = weightSummary(db, TODAY);
    expect(summary.latest).toMatchObject({ localDate: TODAY, weight: 80.0 });
    expect(summary.avg7).toBe(80.0);
  });

  it('picks the greatest local_date not after localDate as latest', () => {
    const { db } = setup();
    db.insert(schema.bodyMetrics)
      .values([weighIn(addLocalDays(TODAY, -5), 82.0), weighIn(addLocalDays(TODAY, -1), 81.0)])
      .run();

    expect(weightSummary(db, TODAY).latest).toMatchObject({ localDate: addLocalDays(TODAY, -1), weight: 81.0 });
  });
});

describe('weightSummary performance over 400 seeded days', () => {
  it('returns in well under 200ms', () => {
    const seeded = makeSeededTestDb({ schema, days: 400, endDate: TODAY });
    const db = seeded.db;

    weightSummary(db, TODAY); // warm
    const started = performance.now();
    weightSummary(db, TODAY);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(200);
  });
});
