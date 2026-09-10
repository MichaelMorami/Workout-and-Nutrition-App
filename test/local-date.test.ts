/**
 * The reference implementation of invariant #1, tested against the cases that break naive
 * implementations. Everything else in the harness — the matchers, the factories, the seeder —
 * trusts this module, so it gets held to the boundaries rather than the happy path.
 */
import {
  addLocalDays,
  instantOfLocal,
  isLocalDate,
  localDateBounds,
  localDateOf,
  localDaysBetween,
  localDayOfWeek,
  naiveLocalDateOf,
  offsetAt,
} from './local-date';

const LA = 'America/Los_Angeles';
const AUCKLAND = 'Pacific/Auckland';
const KATHMANDU = 'Asia/Kathmandu'; // UTC+05:45 — the half-hour assumption killer

describe('localDateOf', () => {
  it('gives the user’s calendar day, not UTC’s', () => {
    const at = Date.parse('2025-03-10T06:55:00Z');
    expect(localDateOf(at, LA)).toBe('2025-03-09');
    expect(localDateOf(at, 'Europe/London')).toBe('2025-03-10');
    expect(localDateOf(at, AUCKLAND)).toBe('2025-03-10');
    expect(naiveLocalDateOf(at)).toBe('2025-03-10');
  });

  it('handles a zone with a 45-minute offset', () => {
    expect(localDateOf(Date.parse('2025-03-09T18:20:00Z'), KATHMANDU)).toBe('2025-03-10');
    expect(localDateOf(Date.parse('2025-03-09T18:10:00Z'), KATHMANDU)).toBe('2025-03-09');
  });

  it('is stable across the exact instant of local midnight', () => {
    const midnight = instantOfLocal('2025-06-01', '00:00', LA);
    expect(localDateOf(midnight, LA)).toBe('2025-06-01');
    expect(localDateOf(midnight - 1, LA)).toBe('2025-05-31');
  });

  it('accepts a Date as readily as a number', () => {
    const at = Date.parse('2025-03-10T06:55:00Z');
    expect(localDateOf(new Date(at), LA)).toBe(localDateOf(at, LA));
  });

  it('crosses month and year boundaries correctly', () => {
    expect(localDateOf(Date.parse('2025-01-01T07:30:00Z'), LA)).toBe('2024-12-31');
    expect(localDateOf(Date.parse('2025-03-01T07:30:00Z'), LA)).toBe('2025-02-28');
  });
});

describe('instantOfLocal', () => {
  it('round-trips with localDateOf', () => {
    for (const day of ['2025-01-15', '2025-03-09', '2025-11-02', '2024-02-29']) {
      for (const time of ['00:00', '12:00', '23:55'] as const) {
        expect(localDateOf(instantOfLocal(day, time, LA), LA)).toBe(day);
      }
    }
  });

  it('lands on the right instant on the day the clocks go forward', () => {
    // 9 March 2025, 02:00 → 03:00 in Los Angeles. 23:55 is 22h55m after midnight, not 23h55m.
    const midnight = instantOfLocal('2025-03-09', '00:00', LA);
    expect(instantOfLocal('2025-03-09', '23:55', LA) - midnight).toBe((22 * 60 + 55) * 60_000);
    expect(instantOfLocal('2025-03-10', '00:00', LA) - midnight).toBe(23 * 3_600_000);
  });

  it('lands on the right instant on the day the clocks go back', () => {
    // 2 November 2025 is a 25-hour day.
    const midnight = instantOfLocal('2025-11-02', '00:00', LA);
    expect(instantOfLocal('2025-11-03', '00:00', LA) - midnight).toBe(25 * 3_600_000);
  });

  it('defaults to midnight when no time is given', () => {
    expect(instantOfLocal('2025-03-09', undefined, LA)).toBe(instantOfLocal('2025-03-09', '00:00', LA));
  });

  it('rejects a string that is not a local date', () => {
    expect(() => instantOfLocal('not a date', '00:00', LA)).toThrow(/not a YYYY-MM-DD local date/);
  });
});

describe('localDateBounds', () => {
  it('covers exactly the instants that belong to the day', () => {
    const [start, end] = localDateBounds('2025-06-15', LA);
    expect(localDateOf(start, LA)).toBe('2025-06-15');
    expect(localDateOf(end - 1, LA)).toBe('2025-06-15');
    expect(localDateOf(end, LA)).toBe('2025-06-16');
  });

  it('is 23 hours wide on the spring-forward day and 25 on the autumn one', () => {
    // A `[start, start + 24h)` range would include an hour of the next day, or miss one.
    const [springStart, springEnd] = localDateBounds('2025-03-09', LA);
    const [autumnStart, autumnEnd] = localDateBounds('2025-11-02', LA);
    expect(springEnd - springStart).toBe(23 * 3_600_000);
    expect(autumnEnd - autumnStart).toBe(25 * 3_600_000);
  });
});

describe('calendar arithmetic', () => {
  it('adds days on the string, so DST cannot skew it', () => {
    expect(addLocalDays('2025-03-08', 1)).toBe('2025-03-09');
    expect(addLocalDays('2025-03-09', 1)).toBe('2025-03-10');
    expect(addLocalDays('2025-11-01', 1)).toBe('2025-11-02');
  });

  it('crosses months, years and leap days', () => {
    expect(addLocalDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addLocalDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addLocalDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(addLocalDays('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('goes backwards', () => {
    expect(addLocalDays('2025-03-09', -399)).toBe('2024-02-04');
    expect(addLocalDays('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('counts whole days between two dates', () => {
    expect(localDaysBetween('2025-03-09', '2025-03-10')).toBe(1);
    expect(localDaysBetween('2025-03-10', '2025-03-09')).toBe(-1);
    expect(localDaysBetween('2024-02-04', '2025-03-09')).toBe(399);
    // Across the DST boundary, where a 23-hour day would round to 0.958 and floor to 0.
    expect(localDaysBetween('2025-03-08', '2025-03-10')).toBe(2);
  });

  it('names the weekday without consulting a timezone', () => {
    expect(localDayOfWeek('2025-03-09')).toBe(0); // Sunday
    expect(localDayOfWeek('2025-03-10')).toBe(1);
    expect(localDayOfWeek('2025-03-15')).toBe(6);
  });
});

describe('isLocalDate', () => {
  it('accepts a real calendar day', () => {
    expect(isLocalDate('2025-03-09')).toBe(true);
    expect(isLocalDate('2024-02-29')).toBe(true);
  });

  it('rejects a day that does not exist', () => {
    expect(isLocalDate('2025-02-30')).toBe(false);
    expect(isLocalDate('2025-13-01')).toBe(false);
    expect(isLocalDate('2025-00-10')).toBe(false);
  });

  it('rejects anything that is not a YYYY-MM-DD string', () => {
    expect(isLocalDate('9 March 2025')).toBe(false);
    expect(isLocalDate('2025-3-9')).toBe(false);
    expect(isLocalDate('2025-03-09T00:00:00Z')).toBe(false);
    expect(isLocalDate(20250309)).toBe(false);
    expect(isLocalDate(new Date())).toBe(false);
    expect(isLocalDate(null)).toBe(false);
    expect(isLocalDate(undefined)).toBe(false);
  });
});

describe('offsetAt', () => {
  it('reports the offset a zone had at that instant, not the one it has today', () => {
    expect(offsetAt(Date.parse('2025-01-15T12:00:00Z'), LA)).toBe(-8 * 3_600_000);
    expect(offsetAt(Date.parse('2025-07-15T12:00:00Z'), LA)).toBe(-7 * 3_600_000);
    expect(offsetAt(Date.parse('2025-03-09T12:00:00Z'), KATHMANDU)).toBe(5 * 3_600_000 + 45 * 60_000);
  });

  it('is memoised without becoming wrong across a DST transition', () => {
    // The cache buckets by hour; the transition happens on an hour boundary, so both sides must
    // still report their own offset no matter which was asked for first.
    const after = Date.parse('2025-03-09T11:00:00Z'); // 04:00 PDT
    const before = Date.parse('2025-03-09T09:00:00Z'); // 01:00 PST
    expect(offsetAt(after, LA)).toBe(-7 * 3_600_000);
    expect(offsetAt(before, LA)).toBe(-8 * 3_600_000);
    expect(offsetAt(after, LA)).toBe(-7 * 3_600_000);
  });

  it('is zero for UTC', () => {
    expect(offsetAt(Date.parse('2025-03-09T12:00:00Z'), 'UTC')).toBe(0);
  });
});
