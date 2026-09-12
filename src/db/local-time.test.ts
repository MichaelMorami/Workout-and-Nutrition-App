/**
 * `localStamp`/`localDateOf`/`inferSlot`: the one place a UTC instant becomes a local day, a local
 * minute and a meal slot. Every case here is picked from issue #35's acceptance criteria — 23:55,
 * 00:05, a DST boundary — and pinned against an independently-computed instant, never against this
 * module's own output.
 */
import { addLocalDays, inferSlot, localDateOf, localStamp } from './local-time';
import type { MealSlot } from './schema';

const LA = 'America/Los_Angeles';
const LONDON = 'Europe/London';
const AUCKLAND = 'Pacific/Auckland';

describe('localStamp', () => {
  it('puts a 23:55 instant on the day the user was living in, not the UTC day', () => {
    // 2025-03-09 23:55 America/Los_Angeles (UTC-7, after that day's spring-forward cut) is
    // 2025-03-10 06:55 UTC — the naive `toISOString().slice(0, 10)` bug lands this on the 10th.
    const at = Date.parse('2025-03-10T06:55:00.000Z');
    expect(localStamp(at, LA)).toEqual({ localDate: '2025-03-09', localMinute: 23 * 60 + 55 });
  });

  it('puts a 00:05 instant on the correct day in a zone ahead of UTC', () => {
    // 2025-03-10 00:05 Pacific/Auckland (UTC+13 in DST) is 2025-03-09 11:05 UTC.
    const at = Date.parse('2025-03-09T11:05:00.000Z');
    expect(localStamp(at, AUCKLAND)).toEqual({ localDate: '2025-03-10', localMinute: 5 });
  });

  it('reads correctly either side of the US spring-forward DST cut, 2025-03-09 in America/Los_Angeles', () => {
    // 09:59 UTC = 01:59 PST (UTC-8, before the cut at 2am local).
    expect(localStamp(Date.parse('2025-03-09T09:59:00.000Z'), LA)).toEqual({
      localDate: '2025-03-09',
      localMinute: 1 * 60 + 59,
    });
    // 10:00 UTC = 03:00 PDT (UTC-7, the clock has just jumped from 2:00 to 3:00).
    expect(localStamp(Date.parse('2025-03-09T10:00:00.000Z'), LA)).toEqual({
      localDate: '2025-03-09',
      localMinute: 3 * 60,
    });
  });

  it('agrees with a UTC-neighbouring zone across midnight, e.g. Europe/London', () => {
    const at = Date.parse('2025-06-15T23:30:00.000Z'); // BST (UTC+1) in June
    expect(localStamp(at, LONDON)).toEqual({ localDate: '2025-06-16', localMinute: 30 });
  });

  it('is a pure function: the same instant and zone always produce the same stamp', () => {
    const at = Date.parse('2025-03-09T18:00:00.000Z');
    expect(localStamp(at, LA)).toEqual(localStamp(at, LA));
  });
});

describe('localDateOf', () => {
  it('is the localDate half of localStamp', () => {
    const at = Date.parse('2025-03-10T06:55:00.000Z');
    expect(localDateOf(at, LA)).toBe(localStamp(at, LA).localDate);
    expect(localDateOf(at, LA)).toBe('2025-03-09');
  });
});

describe('inferSlot', () => {
  it.each<[number, MealSlot]>([
    [0, 'snack'],
    [239, 'snack'],
    [240, 'breakfast'],
    [10 * 60 + 59, 'breakfast'],
    [11 * 60, 'lunch'],
    [14 * 60 + 59, 'lunch'],
    [15 * 60, 'snack'],
    [17 * 60 + 29, 'snack'],
    [17 * 60 + 30, 'dinner'],
    [21 * 60 + 59, 'dinner'],
    [22 * 60, 'snack'],
    [1439, 'snack'],
  ])('localMinute %d infers %s', (localMinute, slot) => {
    expect(inferSlot(localMinute)).toBe(slot);
  });
});

describe('addLocalDays', () => {
  it('adds days within a month', () => {
    expect(addLocalDays('2025-03-09', 1)).toBe('2025-03-10');
  });

  it('subtracts days across a month boundary', () => {
    expect(addLocalDays('2025-03-01', -1)).toBe('2025-02-28');
  });

  it('crosses a year boundary', () => {
    expect(addLocalDays('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('crosses a leap-year February', () => {
    expect(addLocalDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('zero days is the identity', () => {
    expect(addLocalDays('2025-03-09', 0)).toBe('2025-03-09');
  });
});
