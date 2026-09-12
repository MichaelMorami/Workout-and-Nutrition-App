/**
 * The single seam every screen renders a weight through (CLAUDE.md, "units are canonical"; see
 * `docs/decisions.md` §3). Weight is stored in kg everywhere. Today this only appends the unit —
 * a future lb switch is a change to this one function's body, not a search-and-replace over every
 * call site.
 */
export function formatWeightKg(kg: number): string {
  return `${kg} kg`;
}
