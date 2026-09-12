import type { When } from '../db';

/**
 * The device's current instant and IANA zone — the `When` every write and every "today" read
 * needs (`src/db`'s contract). Deliberately not memoised: called fresh at the moment it matters —
 * the tap that logs a food, the query that loads today's candidates — so a screen left open across
 * midnight or a timezone change never argues with the clock it started with.
 */
export function deviceWhen(): When {
  return { at: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}
