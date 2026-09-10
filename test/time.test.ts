/**
 * Determinism. A suite that passes at 09:00 and fails at midnight, or passes in London and fails in
 * Auckland, is not a suite — it is a rumour.
 *
 * The last block in this file is a standing guard on *everyone else's* tests: it reads the repo's
 * test sources and fails if any of them assert on the real clock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { makeFood, makeLogEntry } from './factories';
import { localDateOf } from './local-date';
import { REPO_ROOT } from './schema-source';
import {
  advanceTime,
  DEFAULT_TEST_TZ,
  freezeTime,
  FROZEN_NOW,
  FROZEN_NOW_ISO,
  setLocalTime,
  today,
  useTimezone,
  withTimezone,
} from './time';

describe('the clock in a test', () => {
  it('is frozen at the same instant at the start of every test', () => {
    expect(Date.now()).toBe(FROZEN_NOW);
    expect(new Date().toISOString()).toBe(FROZEN_NOW_ISO);
  });

  it('is frozen at that same instant in this test too, whatever order they run in', () => {
    expect(Date.now()).toBe(FROZEN_NOW);
  });

  it('does not advance on its own', () => {
    const before = Date.now();
    for (let i = 0; i < 1_000_000; i += 1) Math.sqrt(i); // burn real milliseconds
    expect(Date.now()).toBe(before);
  });

  it('advances only when a test asks it to', () => {
    advanceTime(90_000);
    expect(Date.now()).toBe(FROZEN_NOW + 90_000);
  });

  it('does not leak an advance into the next test', () => {
    expect(Date.now()).toBe(FROZEN_NOW);
  });

  it('can be moved to a wall-clock time in the user’s timezone', () => {
    const at = setLocalTime('2025-03-09', '23:55', 'America/Los_Angeles');
    expect(Date.now()).toBe(at);
    expect(new Date(at).toISOString()).toBe('2025-03-10T06:55:00.000Z');
  });

  it('can be frozen somewhere else entirely', () => {
    freezeTime('2020-01-01T00:00:00.000Z');
    expect(Date.now()).toBe(Date.parse('2020-01-01T00:00:00.000Z'));
  });

  it('leaves performance.now() real, so the harness can still time itself', () => {
    const before = performance.now();
    for (let i = 0; i < 1_000_000; i += 1) Math.sqrt(i);
    expect(performance.now()).toBeGreaterThan(before);
  });
});

describe('the timezone in a test', () => {
  it('is the same on every machine, whatever TZ the developer’s laptop is set to', () => {
    expect(process.env.TZ).toBe(process.env.VITALS_TEST_TZ ?? DEFAULT_TEST_TZ);
  });

  it('puts the frozen instant on the day the user is living in', () => {
    // 06:55 UTC on the 10th is 23:55 on the 9th in Los Angeles. `today()` must say the 9th.
    expect(today()).toBe('2025-03-09');
    expect(new Date(FROZEN_NOW).toISOString().slice(0, 10)).toBe('2025-03-10');
  });

  it('can be relocated for one block and is put back afterwards', () => {
    const before = process.env.TZ;
    const inAuckland = withTimezone('Pacific/Auckland', () => localDateOf(Date.now()));

    expect(inAuckland).toBe('2025-03-10');
    expect(process.env.TZ).toBe(before);
  });

  it('is put back even when the block throws', () => {
    const before = process.env.TZ;
    expect(() =>
      withTimezone('Pacific/Auckland', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(process.env.TZ).toBe(before);
  });
});

describe('a whole describe block in another timezone', () => {
  useTimezone('Europe/London');

  it('sees the frozen instant as the London calendar day', () => {
    expect(today()).toBe('2025-03-10');
    expect(makeLogEntry()).toBeOnLocalDate('2025-03-10');
  });
});

describe('back outside that block', () => {
  it('is on Los Angeles time again', () => {
    expect(today()).toBe('2025-03-09');
  });
});

describe('two runs of the same test', () => {
  it('produce byte-identical rows', () => {
    // The whole point of the frozen clock and the id counter, stated as an assertion.
    const first = JSON.stringify([makeFood(), makeLogEntry()]);
    freezeTime();
    // `resetFactories` is what `test/setup/common.ts` does; do it by hand to replay the test.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./factories') as { resetFactories: () => void }).resetFactories();
    expect(JSON.stringify([makeFood(), makeLogEntry()])).toBe(first);
  });
});

describe('the suite as a whole', () => {
  /** Every test file in the repo, excluding other agents' in-progress worktrees. */
  function testFiles(dir: string, found: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.worktrees', '.expo', 'dist', 'coverage'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) testFiles(full, found);
      else if (/\.test\.tsx?$/.test(entry.name)) found.push(full);
    }
    return found;
  }

  const files = testFiles(REPO_ROOT);

  /**
   * This file is the one place allowed to touch the clock directly: it is the test *of* the frozen
   * clock, so it has to be able to read it and move it. Everywhere else, `Date.now()` in an
   * assertion means someone is asserting on wall time.
   */
  const OWNS_THE_CLOCK = 'test/time.test.ts';
  const others = files.filter((file) => path.relative(REPO_ROOT, file) !== OWNS_THE_CLOCK);

  it('has test files to check', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.map((f) => path.relative(REPO_ROOT, f))).toContain(OWNS_THE_CLOCK);
  });

  it('contains no test that asserts a value equals the current clock reading', () => {
    // The rule, precisely: `expect(Date.now()).toBe(FROZEN_NOW)` is fine — it asserts *that* the
    // clock is frozen, which is this file's job. `expect(row.updatedAt).toBe(Date.now())` is not:
    // it reads as "should be now", it passes only because of a global setup the author may not
    // know about, and it turns flaky the instant anyone unfreezes the clock in that file. Assert
    // against `FROZEN_NOW`, or against a value you moved the clock to yourself.
    const BAD = /\.(toBe|toEqual|toStrictEqual|toBeCloseTo|toBeGreaterThan\w*|toBeLessThan\w*)\(\s*Date\.now\(\)/;
    // `others` excludes this file: it defines the pattern and its own counter-examples, which the
    // regex would otherwise match. `test/time.test.ts` is the one file allowed to touch the clock.
    const offenders = others.flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => BAD.test(line))
        .map(({ n }) => `${path.relative(REPO_ROOT, file)}:${n}`),
    );

    expect(offenders).toEqual([]);
  });

  it('has a guard that would actually catch such an assertion', () => {
    // The guard above is a regex over source text. Proving it matches the shape it claims to
    // match is the difference between a guard and a comment.
    const BAD = /\.(toBe|toEqual|toStrictEqual|toBeCloseTo|toBeGreaterThan\w*|toBeLessThan\w*)\(\s*Date\.now\(\)/;
    expect(BAD.test('expect(row.updatedAt).toBe(Date.now());')).toBe(true);
    expect(BAD.test('expect(rows).toEqual( Date.now() );')).toBe(true);
    expect(BAD.test('expect(at).toBeGreaterThanOrEqual(Date.now());')).toBe(true);
    expect(BAD.test('expect(Date.now()).toBe(FROZEN_NOW);')).toBe(false);
    expect(BAD.test('const at = Date.now();')).toBe(false);
  });

  it('contains no test that reaches for the real timers', () => {
    // `jest.useRealTimers()` inside a test file undoes the frozen clock for everything after it in
    // that file. If a test genuinely needs it, it belongs behind `test/time.ts`.
    const offenders = others
      .filter((file) => /use(Real|Fake)Timers\s*\(/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });
});
