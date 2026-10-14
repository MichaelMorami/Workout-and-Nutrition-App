/**
 * Pure math for the swipe-between-tabs carousel (issue #82), parameterized entirely off
 * `motion.carousel` (issue #246, arbitration ruling #249) — every number a caller passes in here is
 * a token value, never a literal reinvented in this file. Kept pure and gesture-free so it is
 * testable in milliseconds; `useTabCarousel` (the `PanResponder` + reanimated wiring) is the only
 * caller and owns translating `GestureResponderEvent`/`PanResponderGestureState` into these calls.
 *
 * See `motion.carousel`'s own doc block in `src/theme/tokens.ts` for the reasoning behind every
 * number these functions take — this file restates none of it, only the arithmetic.
 */

/**
 * Whether the pager claims a drag — `motion.carousel.activation`. Strictly past `distancePt` of
 * travel, and inside the `axisRatio` cone of horizontal, so a steep flick up the day log (a scroll)
 * is never mistaken for a tab change.
 */
export function shouldActivateCarousel(dx: number, dy: number, distancePt: number, axisRatio: number): boolean {
  return Math.abs(dx) > distancePt && Math.abs(dx) > axisRatio * Math.abs(dy);
}

/**
 * Where the dragged screen sits for a given finger travel `dx`. `trackingGain` content points per
 * point of finger travel in the middle of the tab order (1 today — "the screen's position is
 * `trackingGain ×` the finger's", per `motion.carousel`'s own doc); resisted toward `edgeResistance`
 * and hard-stopped at `edgeMaxTravelFraction` of the page width past the first or last tab, where
 * there is no screen to bring in — resistance and the stop apply to the gained travel, not the raw
 * finger travel, so a future `trackingGain` retune still clamps at the same page fraction.
 */
export function carouselOffset(
  dx: number,
  hasPrevious: boolean,
  hasNext: boolean,
  pageWidthPt: number,
  edgeResistance: number,
  edgeMaxTravelFraction: number,
  trackingGain: number,
): number {
  const tracked = dx * trackingGain;
  const stopPt = pageWidthPt * edgeMaxTravelFraction;
  if (tracked < 0 && !hasNext) return Math.max(tracked * edgeResistance, -stopPt);
  if (tracked > 0 && !hasPrevious) return Math.min(tracked * edgeResistance, stopPt);
  return tracked;
}

/** Whether the drag has reached the hard stop past an edge — the one instant `edgeHaptic` fires at. */
export function reachedCarouselEdgeStop(offset: number, pageWidthPt: number, edgeMaxTravelFraction: number): boolean {
  return Math.abs(offset) >= pageWidthPt * edgeMaxTravelFraction;
}

/** The outcome of a release: which neighbour commits, or `null` to spring back to the current tab. */
export type CarouselCommit = 'next' | 'previous' | null;

/**
 * `commitFraction` OR `commitVelocityPtPerS` — either is enough to commit, and a commit toward a tab
 * that does not exist (past the first or last) never happens, however far or fast the drag.
 */
export function carouselCommit(
  dx: number,
  vxPtPerS: number,
  pageWidthPt: number,
  hasPrevious: boolean,
  hasNext: boolean,
  commitFraction: number,
  commitVelocityPtPerS: number,
): CarouselCommit {
  const passesDistance = Math.abs(dx) > commitFraction * pageWidthPt;
  const passesVelocity = Math.abs(vxPtPerS) > commitVelocityPtPerS;
  if (!passesDistance && !passesVelocity) return null;

  const sign = dx !== 0 ? Math.sign(dx) : Math.sign(vxPtPerS);
  if (sign < 0) return hasNext ? 'next' : null;
  if (sign > 0) return hasPrevious ? 'previous' : null;
  return null;
}

/**
 * The velocity handed to the release spring at lift-off — `motion.carousel.releaseVelocity`. Carries
 * the finger's own speed (`carry`) so a fast flick continues through the release instead of halting
 * for a frame; capped at the spring's own average speed for the distance left (`capSpringSpeeds`) so
 * the hand-off can only remove the jerk at lift-off, never add travel the spring did not plan for;
 * and dropped to zero when the finger was already reversing away from the destination at lift-off
 * (`awayFromDestination: 'drop'`), so the screen is never walked backwards and then hauled forwards.
 */
export function carouselHandoffVelocity(
  vxPtPerS: number,
  remainingPt: number,
  releaseDurationMs: number,
  carry: number,
  capSpringSpeeds: number,
  awayFromDestination: 'drop' | 'carry',
): number {
  if (remainingPt === 0) return 0;

  const towardSign = Math.sign(remainingPt);
  const carried = vxPtPerS * carry;
  const isAway = Math.sign(carried) !== 0 && Math.sign(carried) !== towardSign;
  const effective = isAway && awayFromDestination === 'drop' ? 0 : carried;
  if (effective === 0) return 0;

  const capPtPerS = capSpringSpeeds * (Math.abs(remainingPt) / (releaseDurationMs / 1000));
  return Math.sign(effective) * Math.min(Math.abs(effective), capPtPerS);
}
