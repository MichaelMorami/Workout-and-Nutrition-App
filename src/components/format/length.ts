/**
 * The single seam every screen renders a length through (CLAUDE.md, "units are canonical"; see
 * `docs/decisions.md` §3). Length is stored in cm everywhere. Today this only appends the unit —
 * a future inch switch is a change to this one function's body, not a search-and-replace over
 * every call site.
 */
export function formatLengthCm(cm: number): string {
  return `${cm} cm`;
}
