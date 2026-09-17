/**
 * The single seam every screen renders a food amount through (CLAUDE.md, "units are canonical";
 * issue #124). Food is stored in grams (weight) or millilitres (volume), per `UNIT_OF_BASIS`
 * (`src/db/servings.ts`) — these round to a whole unit and localise the way every call site already
 * did by hand, so a future change to how a food amount is displayed is a change to these two
 * functions' bodies, not a sweep over `FoodForm`, `FoodList` and `PortionSheet`.
 */

/** Rounds to the nearest whole gram, localises the thousands separator, and appends " g". */
export function formatGrams(grams: number, locale?: string): string {
  return `${Math.round(grams).toLocaleString(locale)} g`;
}

/** Rounds to the nearest whole millilitre, localises the thousands separator, and appends " ml". */
export function formatMl(ml: number, locale?: string): string {
  return `${Math.round(ml).toLocaleString(locale)} ml`;
}
