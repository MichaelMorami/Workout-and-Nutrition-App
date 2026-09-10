/**
 * Domain matchers. They exist so a test reads like the invariant it is defending, and so the
 * failure message tells you what actually went wrong instead of `expected 2100 to be 1850`.
 *
 *   expect(row).toBeOnLocalDate('2025-03-09');
 *   expect(rows).toHaveDailyTotal('2025-03-09', { kcal: 2100, protein: 150 });
 *
 * Registered globally by `test/setup/`; nothing needs to import them.
 */
import { expect } from '@jest/globals';
import { isLocalDate, localDateOf, type LocalDate } from './local-date';
import { DEFAULT_TEST_TZ } from './time';

export interface LocalDateOptions {
  /** The user's timezone. Defaults to `process.env.TZ`. */
  timeZone?: string;
  /**
   * Also check the row's UTC timestamp really falls on that day. Default `true` — turning it off
   * only checks the string, which is exactly the bug this matcher exists to catch.
   */
  checkTimestamp?: boolean;
}

export interface DailyTotal {
  kcal?: number;
  protein?: number;
  /** Absolute tolerance, because kcal are floats. Default `0.01`. */
  tolerance?: number;
}

/** Anything with a `local_date` — a Drizzle row, a factory object, or the bare string. */
type DatedRow = Record<string, unknown>;

const TIMESTAMP_KEYS = ['loggedAt', 'logged_at', 'startedAt', 'started_at', 'at', 'recordedAt'];
const LOCAL_DATE_KEYS = ['localDate', 'local_date'];

function readLocalDate(row: DatedRow): unknown {
  for (const key of LOCAL_DATE_KEYS) {
    if (key in row) return row[key];
  }
  return undefined;
}

function readTimestamp(row: DatedRow): number | undefined {
  for (const key of TIMESTAMP_KEYS) {
    const value = row[key];
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
  }
  return undefined;
}

function asRows(received: unknown): DatedRow[] {
  if (Array.isArray(received)) return received as DatedRow[];
  if (typeof received === 'string') return [{ localDate: received }];
  if (typeof received === 'object' && received !== null) return [received as DatedRow];
  return [];
}

function isTombstoned(row: DatedRow): boolean {
  return row['deleted'] === 1 || row['deleted'] === true;
}

expect.extend({
  toBeOnLocalDate(received: unknown, expected: LocalDate, options: LocalDateOptions = {}) {
    const timeZone = options.timeZone ?? process.env.TZ ?? DEFAULT_TEST_TZ;
    const checkTimestamp = options.checkTimestamp !== false;
    const rows = asRows(received);

    if (!isLocalDate(expected)) {
      return {
        pass: false,
        message: () => `toBeOnLocalDate expects a YYYY-MM-DD date, got ${this.utils.printExpected(expected)}`,
      };
    }
    if (rows.length === 0) {
      return {
        pass: false,
        message: () =>
          `expected ${this.utils.printReceived(received)} to be a row (or rows) carrying local_date`,
      };
    }

    const problems: string[] = [];
    rows.forEach((row, i) => {
      const where = rows.length > 1 ? `[${i}] ` : '';
      const actual = readLocalDate(row);
      if (actual === undefined) {
        problems.push(`${where}has no local_date column — invariant #1 says every dated row carries one`);
        return;
      }
      if (!isLocalDate(actual)) {
        problems.push(`${where}local_date is ${this.utils.printReceived(actual)}, not a YYYY-MM-DD string`);
        return;
      }
      if (actual !== expected) {
        problems.push(`${where}local_date is ${this.utils.printReceived(actual)}`);
        return;
      }
      if (!checkTimestamp) return;
      const ts = readTimestamp(row);
      if (ts === undefined) return;
      const derived = localDateOf(ts, timeZone);
      if (derived !== expected) {
        problems.push(
          `${where}local_date says ${expected} but its timestamp ${new Date(ts).toISOString()} ` +
            `falls on ${derived} in ${timeZone} — the stored day and the real day disagree`,
        );
      }
    });

    const pass = problems.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `expected rows not to be on local_date ${this.utils.printExpected(expected)}`
          : `expected every row to be on local_date ${this.utils.printExpected(expected)} (timezone ${timeZone}):\n  ` +
            problems.join('\n  '),
    };
  },

  toHaveDailyTotal(received: unknown, localDate: LocalDate, expected: DailyTotal) {
    const tolerance = expected.tolerance ?? 0.01;
    const rows = asRows(received).filter((row) => !isTombstoned(row));
    const onDay = rows.filter((row) => readLocalDate(row) === localDate);

    const sum = (key: string): number =>
      onDay.reduce((acc, row) => acc + (typeof row[key] === 'number' ? (row[key] as number) : 0), 0);

    const actual: { kcal: number; protein: number } = { kcal: sum('kcal'), protein: sum('protein') };
    const problems: string[] = [];

    for (const key of ['kcal', 'protein'] as const) {
      const want = expected[key];
      if (want === undefined) continue;
      if (Math.abs(actual[key] - want) > tolerance) {
        problems.push(
          `${key}: expected ${this.utils.printExpected(want)}, summed ${this.utils.printReceived(actual[key])}`,
        );
      }
    }

    if (onDay.length === 0 && problems.length > 0) {
      const days = [...new Set(rows.map((row) => String(readLocalDate(row))))].sort();
      problems.push(
        `no rows carry local_date ${localDate} — the ${rows.length} live row(s) are on ${days.join(', ')}`,
      );
    }

    const pass = problems.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `expected ${localDate} not to total ${this.utils.printExpected(expected)}`
          : `expected ${onDay.length} row(s) on ${localDate} to total:\n  ` + problems.join('\n  '),
    };
  },
});

/** Imported for its side effect; this keeps bundlers and linters from treating it as dead. */
export const matchersRegistered = true;
