/**
 * Frozen time and controllable timezone.
 *
 * Nothing in the suite may assert on `Date.now()`: a test that passes at 09:00 and fails at
 * midnight is worse than no test. `test/setup/` freezes the clock for every suite, and every
 * factory and seed default reads it, so the same run produces the same bytes on every machine.
 */
import { instantOfLocal, localDateOf, type LocalDate } from './local-date';

/**
 * The instant every test starts at: **Sunday 9 March 2025, 23:55 local**.
 *
 * Chosen on purpose. In `America/Los_Angeles` that is 06:55 UTC on the 10th — so any code that
 * derives the calendar day from the UTC timestamp is off by one from the first line of every test,
 * and the US spring-forward transition happened earlier the same day.
 */
export const FROZEN_NOW_ISO = '2025-03-10T06:55:00.000Z';

/** `FROZEN_NOW_ISO` as ms epoch. */
export const FROZEN_NOW = Date.parse(FROZEN_NOW_ISO);

/** The timezone tests run in unless one is set explicitly. */
export const DEFAULT_TEST_TZ = 'America/Los_Angeles';

/**
 * `hrtime` and `performance` stay real so the harness can measure itself; everything a test could
 * accidentally depend on is faked.
 */
const DO_NOT_FAKE = ['hrtime', 'performance', 'nextTick', 'queueMicrotask'] as const;

/** Freeze the clock at `at` (default `FROZEN_NOW`). Safe to call repeatedly. */
export function freezeTime(at: number | string = FROZEN_NOW): void {
  const now = typeof at === 'string' ? Date.parse(at) : at;
  jest.useFakeTimers({ now, doNotFake: [...DO_NOT_FAKE] });
}

/** Hand the clock back. */
export function unfreezeTime(): void {
  jest.useRealTimers();
}

/** Move the frozen clock forward without letting real time pass. */
export function advanceTime(ms: number): void {
  jest.setSystemTime(Date.now() + ms);
}

/** Move the clock to a wall-clock time in a timezone — "the user opens the app at 23:55". */
export function setLocalTime(
  localDate: LocalDate,
  time: `${string}:${string}` = '00:00',
  timeZone: string = currentTz(),
): number {
  const instant = instantOfLocal(localDate, time, timeZone);
  jest.setSystemTime(instant);
  return instant;
}

/**
 * Run `body` as if the user were in `timeZone`, then put the process back.
 *
 * Node re-reads `process.env.TZ` on every `Date` construction, so this genuinely relocates the
 * user — which is the only honest way to test that a `local_date` survives travel.
 */
export function withTimezone<T>(timeZone: string, body: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return body();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

/** `describe`-level equivalent of `withTimezone`, for whole suites that live in one timezone. */
export function useTimezone(timeZone: string): void {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.TZ;
    process.env.TZ = timeZone;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

/** The `local_date` the frozen clock is currently on, in the current timezone. */
export function today(timeZone: string = currentTz()): LocalDate {
  return localDateOf(Date.now(), timeZone);
}

function currentTz(): string {
  return process.env.TZ ?? DEFAULT_TEST_TZ;
}
