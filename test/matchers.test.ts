/**
 * The matchers, tested for what they *reject*.
 *
 * A matcher that only ever passes is a decoration. Every case below asserts the failing direction
 * as well as the passing one, and asserts on the failure message, because a matcher whose message
 * does not name the problem just moves the debugging somewhere else.
 */
import { makeLogEntry, tombstone } from './factories';
import { instantOfLocal } from './local-date';
import { withTimezone } from './time';

const SUNDAY = '2025-03-09';
const at = (time: `${string}:${string}`, day: string = SUNDAY): number =>
  instantOfLocal(day, time, 'America/Los_Angeles');

/** The message a matcher would print, without failing the test. */
function failureOf(assertion: () => void): string {
  try {
    assertion();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the assertion to fail, but it passed');
}

describe('toBeOnLocalDate', () => {
  it('passes for a row whose stored day and real day agree', () => {
    expect(makeLogEntry({ loggedAt: at('23:55'), localDate: SUNDAY })).toBeOnLocalDate(SUNDAY);
  });

  it('accepts a bare local_date string', () => {
    expect(SUNDAY).toBeOnLocalDate(SUNDAY);
  });

  it('accepts snake_case rows, as they come back from raw SQL', () => {
    expect({ local_date: SUNDAY, logged_at: at('23:55') }).toBeOnLocalDate(SUNDAY);
  });

  it('requires every row of an array to be on the day, and names the one that is not', () => {
    const rows = [
      makeLogEntry({ loggedAt: at('08:10'), localDate: SUNDAY }),
      makeLogEntry({ loggedAt: at('08:10', '2025-03-10'), localDate: '2025-03-10' }),
    ];
    expect(failureOf(() => expect(rows).toBeOnLocalDate(SUNDAY))).toMatch(/\[1\] local_date is "2025-03-10"/);
  });

  it('fails when the row has no local_date at all', () => {
    expect(failureOf(() => expect({ loggedAt: at('08:10') }).toBeOnLocalDate(SUNDAY))).toMatch(
      /has no local_date column/,
    );
  });

  it('fails when local_date is a timestamp rather than a YYYY-MM-DD string', () => {
    // The other half of invariant #1: storing a Date in the column defeats the point.
    expect(failureOf(() => expect({ localDate: at('08:10') }).toBeOnLocalDate(SUNDAY))).toMatch(
      /not a YYYY-MM-DD string/,
    );
  });

  it('fails when the stored day is right but the timestamp lands on another day', () => {
    const row = makeLogEntry({ loggedAt: at('23:55', '2025-03-10'), localDate: SUNDAY });
    expect(failureOf(() => expect(row).toBeOnLocalDate(SUNDAY))).toMatch(
      /the stored day and the real day disagree/,
    );
  });

  it('judges the timestamp in the timezone it is given, not the process one', () => {
    const row = makeLogEntry({ loggedAt: at('23:55'), localDate: SUNDAY });
    expect(row).toBeOnLocalDate(SUNDAY, { timeZone: 'America/Los_Angeles' });
    expect(failureOf(() => expect(row).toBeOnLocalDate(SUNDAY, { timeZone: 'Pacific/Auckland' }))).toMatch(
      /falls on 2025-03-10 in Pacific\/Auckland/,
    );
  });

  it('can be told to check only the string, and says so by passing where it otherwise would not', () => {
    const row = makeLogEntry({ loggedAt: at('23:55', '2025-03-10'), localDate: SUNDAY });
    expect(row).toBeOnLocalDate(SUNDAY, { checkTimestamp: false });
  });

  it('rejects an expected value that is not a real calendar date', () => {
    expect(failureOf(() => expect(SUNDAY).toBeOnLocalDate('2025-02-30'))).toMatch(/expects a YYYY-MM-DD date/);
    expect(failureOf(() => expect(SUNDAY).toBeOnLocalDate('9 March'))).toMatch(/expects a YYYY-MM-DD date/);
  });

  it('fails on an empty array rather than passing vacuously', () => {
    // The classic false green: "every row is on Sunday" is trivially true of no rows.
    expect(failureOf(() => expect([]).toBeOnLocalDate(SUNDAY))).toMatch(/to be a row \(or rows\) carrying local_date/);
  });

  it('fails on null and undefined', () => {
    expect(failureOf(() => expect(null).toBeOnLocalDate(SUNDAY))).toMatch(/to be a row/);
    expect(failureOf(() => expect(undefined).toBeOnLocalDate(SUNDAY))).toMatch(/to be a row/);
  });

  it('supports .not for the day a row must not be on', () => {
    expect(makeLogEntry({ loggedAt: at('23:55'), localDate: SUNDAY })).not.toBeOnLocalDate('2025-03-10');
  });
});

describe('toHaveDailyTotal', () => {
  const day = [
    makeLogEntry({ loggedAt: at('08:10'), localDate: SUNDAY, kcal: 520.5, protein: 32.1, slot: 'breakfast' }),
    makeLogEntry({ loggedAt: at('12:40'), localDate: SUNDAY, kcal: 730, protein: 55, slot: 'lunch' }),
    makeLogEntry({ loggedAt: at('19:20'), localDate: SUNDAY, kcal: 845.5, protein: 62.9, slot: 'dinner' }),
  ];

  it('sums the day’s kcal and protein', () => {
    expect(day).toHaveDailyTotal(SUNDAY, { kcal: 2096, protein: 150 });
  });

  it('checks kcal and protein independently', () => {
    expect(day).toHaveDailyTotal(SUNDAY, { kcal: 2096 });
    expect(day).toHaveDailyTotal(SUNDAY, { protein: 150 });
  });

  it('fails on a total that is off by one calorie', () => {
    // The tolerance exists for float noise, not for being wrong.
    expect(failureOf(() => expect(day).toHaveDailyTotal(SUNDAY, { kcal: 2097 }))).toMatch(
      /kcal: expected 2097, summed 2096/,
    );
  });

  it('tolerates float dust but not a real difference', () => {
    const dusty = [makeLogEntry({ localDate: SUNDAY, kcal: 0.1 + 0.2, protein: 0 })];
    expect(dusty).toHaveDailyTotal(SUNDAY, { kcal: 0.3 });
    expect(failureOf(() => expect(dusty).toHaveDailyTotal(SUNDAY, { kcal: 0.5 }))).toMatch(/kcal: expected 0.5/);
  });

  it('ignores rows from other days', () => {
    const withMonday = [...day, makeLogEntry({ localDate: '2025-03-10', kcal: 900, protein: 40 })];
    expect(withMonday).toHaveDailyTotal(SUNDAY, { kcal: 2096, protein: 150 });
    expect(withMonday).toHaveDailyTotal('2025-03-10', { kcal: 900, protein: 40 });
  });

  it('ignores tombstoned rows — a deleted meal must not count', () => {
    // Invariant #3 meets the totals: the row is still in the table, and must not be in the sum.
    const entry = makeLogEntry({ localDate: SUNDAY, kcal: 400, protein: 20 });
    expect([...day, tombstone(entry)]).toHaveDailyTotal(SUNDAY, { kcal: 2096, protein: 150 });
  });

  it('reports an empty day as zero, not as a pass', () => {
    expect([]).toHaveDailyTotal(SUNDAY, { kcal: 0, protein: 0 });
    expect(failureOf(() => expect([]).toHaveDailyTotal(SUNDAY, { kcal: 2096 }))).toMatch(/summed 0/);
  });

  it('says which days the rows are actually on when none match', () => {
    // The failure you get when a timezone bug moved the whole day. The message should point at it.
    const monday = [makeLogEntry({ localDate: '2025-03-10', kcal: 2096 })];
    expect(failureOf(() => expect(monday).toHaveDailyTotal(SUNDAY, { kcal: 2096 }))).toMatch(
      /no rows carry local_date 2025-03-09 — the 1 live row\(s\) are on 2025-03-10/,
    );
  });

  it('handles a single row and four hundred rows the same way', () => {
    expect([makeLogEntry({ localDate: SUNDAY, kcal: 12, protein: 1 })]).toHaveDailyTotal(SUNDAY, { kcal: 12 });
    const many = Array.from({ length: 400 }, () => makeLogEntry({ localDate: SUNDAY, kcal: 5, protein: 0.5 }));
    expect(many).toHaveDailyTotal(SUNDAY, { kcal: 2000, protein: 200 });
  });

  it('supports .not', () => {
    expect(day).not.toHaveDailyTotal(SUNDAY, { kcal: 1 });
  });
});

describe('the matchers under a different timezone', () => {
  it('still read the stored string, and only re-derive when asked to', () => {
    const row = makeLogEntry({ loggedAt: at('23:55'), localDate: SUNDAY });
    withTimezone('Pacific/Auckland', () => {
      expect([row]).toHaveDailyTotal(SUNDAY, { kcal: 133 });
      expect(failureOf(() => expect(row).toBeOnLocalDate(SUNDAY))).toMatch(/falls on 2025-03-10/);
    });
  });
});
