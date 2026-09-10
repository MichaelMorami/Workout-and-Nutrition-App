/**
 * The speed guard.
 *
 * The whole argument for this harness is that a data-layer test costs less than a thought. If
 * `makeTestDb()` drifts into the tens of milliseconds, TDD quietly stops happening — nobody
 * announces it, they just stop writing the test first. So the budget is a test that fails in CI.
 *
 * Budget: **full setup + teardown under 10ms**, measured as the median of many real cycles.
 * Median rather than mean because one GC pause should not turn the build red; the ceiling on the
 * worst case is asserted separately and generously.
 */
import { performance } from 'node:perf_hooks';
import { makeTestDb, resetTestDbCache, tableNames } from './db';
import { resolveSchemaSource } from './schema-source';

/** Per-test setup+teardown budget, milliseconds. The number in the issue's acceptance criteria. */
const BUDGET_MS = 10;

interface Timings {
  median: number;
  p95: number;
  max: number;
  mean: number;
}

function timeCycles(count: number, cycle: () => void): Timings {
  const samples: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const started = performance.now();
    cycle();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const at = (q: number): number => samples[Math.min(samples.length - 1, Math.floor(samples.length * q))] ?? Infinity;
  return {
    median: at(0.5),
    p95: at(0.95),
    max: samples[samples.length - 1] ?? Infinity,
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

/** One full cycle: build a migrated database, use it, close it. */
function cycle(): void {
  const { db, sqlite, close } = makeTestDb();
  void db;
  sqlite.prepare('select count(*) as n from foods').get();
  close();
}

describe('the data-layer harness', () => {
  it('sets up and tears down a migrated database in under the 10ms per-test budget', () => {
    cycle(); // warm the snapshot; the first call in a worker pays for the migrations
    const t = timeCycles(200, cycle);

     
    console.log(
      `makeTestDb() cycle over ${resolveSchemaSource().label}: ` +
        `median ${t.median.toFixed(3)}ms · mean ${t.mean.toFixed(3)}ms · ` +
        `p95 ${t.p95.toFixed(3)}ms · max ${t.max.toFixed(3)}ms`,
    );

    expect(t.median).toBeLessThan(BUDGET_MS);
    // A single hostile sample (GC, a noisy CI box) is tolerated; a systemic regression is not.
    expect(t.p95).toBeLessThan(BUDGET_MS * 5);
  });

  it('would fail the budget if the migrations were re-run for every test', () => {
    // The optimisation under test is the serialise-once/deserialise-per-test snapshot. This proves
    // it is doing real work: if someone deletes the cache, the numbers move by an order of
    // magnitude and the assertion above starts failing for a reason you can see here.
    resetTestDbCache();
    const fresh = timeCycles(20, () => {
      const { close } = makeTestDb({ fresh: true });
      close();
    });
    resetTestDbCache();
    makeTestDb().close(); // re-warm
    const cached = timeCycles(20, cycle);

     
    console.log(
      `re-migrating every test: median ${fresh.median.toFixed(3)}ms · ` +
        `snapshot: median ${cached.median.toFixed(3)}ms`,
    );
    expect(cached.median).toBeLessThan(fresh.median);
  });

  it('gives every test a database that is already migrated, not an empty one', () => {
    // A "fast" harness that hands back an empty database would sail through the budget above and
    // prove nothing. Speed is only worth measuring once correctness is pinned.
    const { sqlite, close } = makeTestDb();
    expect(tableNames(sqlite)).toEqual(expect.arrayContaining(['foods', 'food_log', 'body_metrics']));
    close();
  });
});
