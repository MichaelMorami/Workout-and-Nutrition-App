/**
 * `weightSummary` — the Today weight chip (issue #17 contract amendment, 2026-09-11), landed with
 * #36. Reads `body_metrics`, which #17 pulled forward schema-only; this is its first query.
 */
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { VitalsDb } from '../db';
import { addLocalDays, type LocalDate } from '../local-time';
import { bodyMetrics } from '../schema';
import type { WeightSummary } from '../types';

/** Mean `weight` (kg) over live weigh-ins with `local_date` in `[start, end]` inclusive, or `null`
 * when the window holds none — no interpolation, the mean is over what's actually there. */
function meanWeight(db: VitalsDb, start: LocalDate, end: LocalDate): number | null {
  const rows = db
    .select({ weight: bodyMetrics.weight })
    .from(bodyMetrics)
    .where(and(eq(bodyMetrics.deleted, 0), gte(bodyMetrics.localDate, start), lte(bodyMetrics.localDate, end)))
    .all();
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.weight, 0) / rows.length;
}

/**
 * `latest` is the live weigh-in with the greatest `local_date <= localDate`. `avg7` and
 * `avg7PrevWeek` are means over the two preceding 7-day calendar windows; `weeklyDelta` is their
 * difference, `null` when either window is empty. Windows are calendar days by `local_date` only —
 * no timestamp arithmetic (issue #17 contract amendment).
 */
export function weightSummary(db: VitalsDb, localDate: LocalDate): WeightSummary {
  const latestRow = db
    .select({ localDate: bodyMetrics.localDate, weight: bodyMetrics.weight, measuredAt: bodyMetrics.measuredAt })
    .from(bodyMetrics)
    .where(and(eq(bodyMetrics.deleted, 0), lte(bodyMetrics.localDate, localDate)))
    .orderBy(desc(bodyMetrics.localDate))
    .limit(1)
    .get();

  const avg7 = meanWeight(db, addLocalDays(localDate, -6), localDate);
  const avg7PrevWeek = meanWeight(db, addLocalDays(localDate, -13), addLocalDays(localDate, -7));
  const weeklyDelta = avg7 !== null && avg7PrevWeek !== null ? avg7 - avg7PrevWeek : null;

  return {
    latest: latestRow
      ? { localDate: latestRow.localDate, weight: latestRow.weight, measuredAt: latestRow.measuredAt }
      : null,
    avg7,
    avg7PrevWeek,
    weeklyDelta,
  };
}
