/**
 * `formatTodayDate` — the Today date header's words, given a fixed instant and zone so the test
 * never depends on the machine's own clock.
 *
 * `.test.tsx`, not `.test.ts`: jest.config.js's "components" project only matches
 * `src/**\/*.test.tsx` (see `src/components/format/weight.test.tsx`'s note on the same rule).
 */
import { formatTodayDate } from './date-header';

// Wed 10 Sep 2025, 16:12 UTC.
const AT = Date.UTC(2025, 8, 10, 16, 12);

describe('formatTodayDate', () => {
  it('renders weekday, day and month with no comma, in the given zone', () => {
    expect(formatTodayDate(AT, 'UTC', 'en-GB')).toBe('Wed 10 Sept');
  });

  it('uses the given IANA zone, not the machine zone — a day can roll over across it', () => {
    // 16:12 UTC is 01:12 the next day in Auckland.
    expect(formatTodayDate(AT, 'Pacific/Auckland', 'en-GB')).toBe('Thu 11 Sept');
  });

  it('is locale-sensitive, like every other formatter in this app', () => {
    expect(formatTodayDate(AT, 'UTC', 'en-US')).toBe('Wed 10 Sep');
  });
});
