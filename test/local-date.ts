/**
 * The reference implementation of invariant #1 (`docs/data-model.md`).
 *
 * `local_date` is a `YYYY-MM-DD` string in the *user's* timezone, stored beside the UTC timestamp.
 * Deriving a calendar day from a UTC timestamp — `new Date(ms).toISOString().slice(0, 10)` — puts a
 * 23:55 meal on the wrong day whenever the user's offset is behind UTC, and puts a whole day's
 * chart data in the wrong bucket after travel or a DST change.
 *
 * This module is what the custom matchers hold the app to. The app's own implementation lives in
 * `src/` and is owned by another agent; the point of having an independent one here is that a test
 * fails when the two disagree.
 */

/** A calendar day in the user's timezone, `YYYY-MM-DD`. */
export type LocalDate = string;

/** `Intl.DateTimeFormat` construction is the expensive part — one per timezone, reused. */
const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partFormatters.set(timeZone, fmt);
  }
  return fmt;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock reading a user in `timeZone` sees at `instant`. */
export function wallClockAt(instant: Date | number, timeZone: string = currentTimeZone()): WallClock {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl produced no "${type}" part for timezone ${timeZone}`);
    return Number(part.value);
  };
  // `hour12: false` renders midnight as 24 in some ICU versions; normalise it.
  const hour = read('hour') % 24;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * The `local_date` an instant belongs to.
 *
 *   localDateOf(Date.parse('2025-03-10T06:55:00Z'), 'America/Los_Angeles')  // '2025-03-09'
 *   localDateOf(Date.parse('2025-03-10T06:55:00Z'), 'Pacific/Auckland')     // '2025-03-10'
 */
export function localDateOf(instant: Date | number, timeZone: string = currentTimeZone()): LocalDate {
  const w = wallClockAt(instant, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/**
 * Offsets memoised per timezone per hour. Every real zone's UTC offset changes only on an hour
 * boundary, so an hour bucket is an exact cache, not an approximation — and it turns the seeder's
 * ~30,000 `Intl` lookups into a few hundred. Chart and query tests inherit the same win.
 */
const offsetCache = new Map<string, number>();

/** The timezone offset in milliseconds that `timeZone` had at `instant` (east of UTC is positive). */
export function offsetAt(instant: Date | number, timeZone: string): number {
  const ms = typeof instant === 'number' ? instant : instant.getTime();
  const key = `${timeZone}|${Math.floor(ms / 3_600_000)}`;
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;

  const w = wallClockAt(ms, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // Ignore the sub-second remainder so the difference is a whole number of seconds.
  const offset = asUtc - (ms - (((ms % 1000) + 1000) % 1000));
  offsetCache.set(key, offset);
  return offset;
}

/**
 * The UTC instant at which a user in `timeZone` sees the given wall-clock time.
 * Two passes, because the offset that applies depends on the instant we are solving for — this is
 * what makes the DST boundary correct rather than 60 minutes out.
 */
export function instantOfLocal(
  localDate: LocalDate,
  time: `${string}:${string}` = '00:00',
  timeZone: string = currentTimeZone(),
): number {
  const [y, m, d] = localDate.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y)) {
    throw new Error(`not a YYYY-MM-DD local date: ${localDate}`);
  }
  const wall = Date.UTC(y, m - 1, d, hh ?? 0, mm ?? 0, ss ?? 0);
  const firstGuess = wall - offsetAt(wall, timeZone);
  const corrected = wall - offsetAt(firstGuess, timeZone);
  return corrected;
}

/** `[startInclusive, endExclusive)` in ms epoch covering one `local_date` in `timeZone`. */
export function localDateBounds(
  localDate: LocalDate,
  timeZone: string = currentTimeZone(),
): [number, number] {
  const start = instantOfLocal(localDate, '00:00', timeZone);
  const nextDay = addLocalDays(localDate, 1);
  return [start, instantOfLocal(nextDay, '00:00', timeZone)];
}

/** Calendar arithmetic on the string itself — never on a timestamp, which DST would skew. */
export function addLocalDays(localDate: LocalDate, days: number): LocalDate {
  const [y, m, d] = localDate.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`not a YYYY-MM-DD local date: ${localDate}`);
  }
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Whole days between two `local_date`s, `b - a`. */
export function localDaysBetween(a: LocalDate, b: LocalDate): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday, computed from the string so it is timezone-independent. */
export function localDayOfWeek(localDate: LocalDate): number {
  return new Date(`${localDate}T00:00:00Z`).getUTCDay();
}

/** The timezone the process is currently running in — tests set `TZ` to control it. */
export function currentTimeZone(): string {
  return process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** `true` when the string is a syntactically valid, real calendar date. */
export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/**
 * The bug this harness exists to catch. Kept here, named, so nobody reinvents it by accident:
 * it derives the calendar day from the UTC timestamp instead of the user's timezone.
 *
 * Only `test/local-date-invariant.test.ts` uses it — as the thing being caught.
 */
export function naiveLocalDateOf(instant: Date | number): LocalDate {
  return new Date(instant).toISOString().slice(0, 10);
}
