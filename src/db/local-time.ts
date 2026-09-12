/**
 * The one audited place a UTC instant becomes a calendar day and a wall-clock minute.
 *
 * Issue #17 contract §0: "The data layer never reads the clock or the device timezone. Callers
 * pass both." Every function here is a pure function of `(at, timeZone)` — nothing reads
 * `Date.now()` or `Intl.DateTimeFormat().resolvedOptions()`. That is what lets a test pin 23:55,
 * 00:05 or a DST boundary just by choosing `at` and `timeZone`, with no clock mocking.
 *
 * `local_date`/`local_minute` are never derived from a UTC timestamp anywhere else in `src/db`;
 * every write goes through `localStamp`.
 */
import type { MealSlot } from './schema';

/** A calendar day in the user's timezone, `YYYY-MM-DD`. */
export type LocalDate = string;

/** When a user action happened. */
export interface Stamp {
  /** UTC ms epoch. */
  at: number;
}

/** When, and where on the calendar — needed for anything that reads the local day or hour. */
export interface When extends Stamp {
  /** IANA zone, e.g. `'Europe/London'`. */
  timeZone: string;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** `Intl.DateTimeFormat` construction is the expensive part of this module — one per zone, reused. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function wallClockAt(at: number, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(at));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl produced no "${type}" part for timezone "${timeZone}"`);
    return Number(part.value);
  };
  // `hour12: false` renders midnight as 24 in some ICU builds; fold it back to 0.
  const hour = read('hour') % 24;
  return { year: read('year'), month: read('month'), day: read('day'), hour, minute: read('minute') };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * `local_date` and `local_minute` for a write: the user's calendar day and minutes-after-midnight
 * at `at`, in `timeZone` — computed once, here, and stored literally (issue #17 contract §1.3).
 */
export function localStamp(at: number, timeZone: string): { localDate: LocalDate; localMinute: number } {
  const w = wallClockAt(at, timeZone);
  return {
    localDate: `${w.year}-${pad(w.month)}-${pad(w.day)}`,
    localMinute: w.hour * 60 + w.minute,
  };
}

/** The `local_date` half of `localStamp`, for callers ("today") that only need the day. */
export function localDateOf(at: number, timeZone: string): LocalDate {
  return localStamp(at, timeZone).localDate;
}

/**
 * Calendar arithmetic on the `local_date` string itself, never on a timestamp — a day count is a
 * property of the calendar, not of any particular timezone's offset, so this needs no `timeZone`
 * argument and no DST correction. Used to build the `local_date` windows `weightSummary` (issue #17
 * contract amendment) and `recentFoods` (issue #17 contract §3, #24) filter on.
 */
export function addLocalDays(localDate: LocalDate, days: number): LocalDate {
  const [y, m, d] = localDate.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y)) {
    throw new Error(`not a YYYY-MM-DD local date: ${localDate}`);
  }
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * The meal slot a log gets when the caller doesn't name one, from the local wall clock
 * (issue #17 contract §1.6): 04:00–10:59 breakfast · 11:00–14:59 lunch · 15:00–17:29 snack ·
 * 17:30–21:59 dinner · otherwise snack.
 */
export function inferSlot(localMinute: number): MealSlot {
  if (localMinute >= 240 && localMinute <= 659) return 'breakfast';
  if (localMinute >= 660 && localMinute <= 899) return 'lunch';
  if (localMinute >= 900 && localMinute <= 1049) return 'snack';
  if (localMinute >= 1050 && localMinute <= 1319) return 'dinner';
  return 'snack';
}
