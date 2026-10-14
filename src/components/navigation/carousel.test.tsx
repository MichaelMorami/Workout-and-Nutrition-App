/**
 * Pure math for the swipe-between-tabs carousel (issue #82), driven straight off `motion.carousel`
 * (issue #246/#249) — never a retyped literal. Kept pure and PanResponder-free so the arithmetic is
 * testable in milliseconds, with the gesture wiring itself (`useTabCarousel`) covered separately.
 */
import { motion } from '../../theme/tokens';
import {
  carouselCommit,
  carouselHandoffVelocity,
  carouselOffset,
  reachedCarouselEdgeStop,
  shouldActivateCarousel,
} from './carousel';

const { activation, commitFraction, commitVelocityPtPerS, edgeMaxTravelFraction, edgeResistance, releaseVelocity, trackingGain } =
  motion.carousel;
const releaseSpringDurationMs = motion.spring[motion.carousel.releaseSpring].duration;

describe('shouldActivateCarousel', () => {
  it('claims past distancePt, inside the axisRatio cone', () => {
    expect(shouldActivateCarousel(activation.distancePt + 1, 0, activation.distancePt, activation.axisRatio)).toBe(true);
  });

  it('does not claim at or under distancePt', () => {
    expect(shouldActivateCarousel(activation.distancePt, 0, activation.distancePt, activation.axisRatio)).toBe(false);
  });

  it('does not claim outside the axisRatio cone, however far it travelled', () => {
    // axisRatio 2 keeps the claim inside 26.6° of horizontal — a drag steeper than that is a scroll.
    expect(shouldActivateCarousel(20, 11, activation.distancePt, activation.axisRatio)).toBe(false);
  });

  it('reads its numbers from motion.carousel.activation, never a restated literal', () => {
    expect(activation.distancePt).toBe(12);
    expect(activation.axisRatio).toBe(2);
  });
});

describe('carouselOffset', () => {
  const pageWidthPt = 390;

  it('tracks the finger 1:1 in the middle of the tab order', () => {
    expect(carouselOffset(-50, true, true, pageWidthPt, edgeResistance, edgeMaxTravelFraction, trackingGain)).toBe(-50);
    expect(carouselOffset(50, true, true, pageWidthPt, edgeResistance, edgeMaxTravelFraction, trackingGain)).toBe(50);
  });

  it('actually multiplies by trackingGain, not just taking dx unscaled (B6: trackingGain had no consumer)', () => {
    // A trackingGain other than today's 1 must change the result — this is the test that catches
    // the token going uncomsumed, by using a gain where "identity" and "ignored" read differently.
    expect(carouselOffset(-50, true, true, pageWidthPt, edgeResistance, edgeMaxTravelFraction, 0.5)).toBe(-25);
    expect(carouselOffset(50, true, true, pageWidthPt, edgeResistance, edgeMaxTravelFraction, 2)).toBe(100);
  });

  it('resists past the last tab (no next screen) and stops at edgeMaxTravelFraction of the page', () => {
    const resisted = carouselOffset(-1000, true, false, pageWidthPt, edgeResistance, edgeMaxTravelFraction, trackingGain);
    expect(resisted).toBe(-(pageWidthPt * edgeMaxTravelFraction));
  });

  it('resists past the first tab (no previous screen) the same way, mirrored', () => {
    const resisted = carouselOffset(1000, false, true, pageWidthPt, edgeResistance, edgeMaxTravelFraction, trackingGain);
    expect(resisted).toBe(pageWidthPt * edgeMaxTravelFraction);
  });

  it('a small over-drag past the last tab is resisted, not clamped straight to the stop', () => {
    const dx = -40;
    const resisted = carouselOffset(dx, true, false, pageWidthPt, edgeResistance, edgeMaxTravelFraction, trackingGain);
    expect(resisted).toBe(dx * edgeResistance);
    expect(Math.abs(resisted)).toBeLessThan(pageWidthPt * edgeMaxTravelFraction);
  });

  it('reads its numbers from motion.carousel, never a restated literal', () => {
    expect(edgeResistance).toBe(0.3);
    expect(edgeMaxTravelFraction).toBe(0.1);
    expect(trackingGain).toBe(1);
  });
});

describe('reachedCarouselEdgeStop', () => {
  const pageWidthPt = 390;

  it('is false until the offset reaches the edge stop', () => {
    expect(reachedCarouselEdgeStop(-(pageWidthPt * edgeMaxTravelFraction) + 1, pageWidthPt, edgeMaxTravelFraction)).toBe(false);
  });

  it('is true once the offset reaches the edge stop, either side', () => {
    expect(reachedCarouselEdgeStop(-(pageWidthPt * edgeMaxTravelFraction), pageWidthPt, edgeMaxTravelFraction)).toBe(true);
    expect(reachedCarouselEdgeStop(pageWidthPt * edgeMaxTravelFraction, pageWidthPt, edgeMaxTravelFraction)).toBe(true);
  });
});

describe('carouselCommit', () => {
  const pageWidthPt = 390;

  it('commits "next" past commitFraction of the page width, dragged leftward', () => {
    const dx = -(pageWidthPt * commitFraction + 1);
    expect(carouselCommit(dx, 0, pageWidthPt, true, true, commitFraction, commitVelocityPtPerS)).toBe('next');
  });

  it('commits "previous" past commitFraction, dragged rightward', () => {
    const dx = pageWidthPt * commitFraction + 1;
    expect(carouselCommit(dx, 0, pageWidthPt, true, true, commitFraction, commitVelocityPtPerS)).toBe('previous');
  });

  it('does not commit short of commitFraction at low velocity — it springs back', () => {
    const dx = -(pageWidthPt * commitFraction - 1);
    expect(carouselCommit(dx, 0, pageWidthPt, true, true, commitFraction, commitVelocityPtPerS)).toBeNull();
  });

  it('commits on velocity alone, however little distance it covered', () => {
    const dx = -5;
    const vxPtPerS = -(commitVelocityPtPerS + 1);
    expect(carouselCommit(dx, vxPtPerS, pageWidthPt, true, true, commitFraction, commitVelocityPtPerS)).toBe('next');
  });

  it('never commits "next" past the last tab, however far or fast the drag', () => {
    const dx = -(pageWidthPt * commitFraction + 50);
    expect(carouselCommit(dx, -1000, pageWidthPt, true, false, commitFraction, commitVelocityPtPerS)).toBeNull();
  });

  it('never commits "previous" before the first tab, however far or fast the drag', () => {
    const dx = pageWidthPt * commitFraction + 50;
    expect(carouselCommit(dx, 1000, pageWidthPt, false, true, commitFraction, commitVelocityPtPerS)).toBeNull();
  });

  it('reads its numbers from motion.carousel, never a restated literal', () => {
    expect(commitFraction).toBe(0.22);
    expect(commitVelocityPtPerS).toBe(420);
  });
});

describe('carouselHandoffVelocity', () => {
  const releaseDurationMs = 220;

  it('carries the lift-off velocity toward the destination at full gain', () => {
    const remainingPt = -100;
    const vxPtPerS = -200; // same sign as remainingPt: toward the destination.
    const result = carouselHandoffVelocity(vxPtPerS, remainingPt, releaseDurationMs, releaseVelocity.carry, releaseVelocity.capSpringSpeeds, releaseVelocity.awayFromDestination);
    expect(result).toBe(vxPtPerS * releaseVelocity.carry);
  });

  it('caps the carried speed at the spring\'s own average speed for the distance left', () => {
    const remainingPt = -20; // ~130pt of finger left per the token's own doc at edgeResistance — small.
    const vxPtPerS = -2000; // a fast flick with almost nothing left to cover.
    const capPtPerS = releaseVelocity.capSpringSpeeds * (Math.abs(remainingPt) / (releaseDurationMs / 1000));
    const result = carouselHandoffVelocity(vxPtPerS, remainingPt, releaseDurationMs, releaseVelocity.carry, releaseVelocity.capSpringSpeeds, releaseVelocity.awayFromDestination);
    expect(Math.abs(result)).toBeLessThanOrEqual(capPtPerS);
    expect(result).toBeLessThan(0);
  });

  it('drops the velocity entirely when it points away from the destination and awayFromDestination is "drop"', () => {
    const remainingPt = -100; // destination is further negative (leftward).
    const vxPtPerS = 300; // finger was already reversing rightward at lift-off.
    const result = carouselHandoffVelocity(vxPtPerS, remainingPt, releaseDurationMs, releaseVelocity.carry, releaseVelocity.capSpringSpeeds, 'drop');
    expect(result).toBe(0);
  });

  it('is zero when there is nothing left to cover', () => {
    const result = carouselHandoffVelocity(500, 0, releaseDurationMs, releaseVelocity.carry, releaseVelocity.capSpringSpeeds, releaseVelocity.awayFromDestination);
    expect(result).toBe(0);
  });

  it('reads its numbers from motion.carousel.releaseVelocity, never a restated literal', () => {
    expect(releaseVelocity).toEqual({ carry: 1, capSpringSpeeds: 1, awayFromDestination: 'drop' });
  });
});
