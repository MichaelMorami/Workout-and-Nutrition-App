/**
 * The Today date header's words: today's calendar day, in the device's own zone and locale.
 *
 * Kept pure and apart from `TodayHeader.tsx` so the formatting can be asserted against a fixed
 * `at`/`timeZone` pair without rendering anything (`CLAUDE.md` — never derive a calendar day from a
 * UTC timestamp; here `timeZone` is threaded through to `Intl` explicitly, the same discipline
 * `src/db/local-time.ts` uses for storage).
 *
 * The three parts are formatted separately and joined with plain spaces, rather than asking `Intl`
 * for `weekday`+`day`+`month` in one call: most locales insert a comma ("Wed, 10 Sept") that the
 * design canvas's header never carries ("Wed 10 Sep").
 */
export function formatTodayDate(at: number, timeZone: string, locale?: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(at);
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone }).format(at);
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone }).format(at);
  return `${weekday} ${day} ${month}`;
}
