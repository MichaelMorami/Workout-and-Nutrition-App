/**
 * The arc maths, tested without rendering anything.
 *
 * Every number below is hand-computed from the ring in `design/build-canvas.mjs`, not copied out of
 * a previous run: diameter 118, stroke 10 -> radius (118 - 10) / 2 = 54, circumference 2 * PI * 54.
 * If a fixture here and the drawing disagree, the drawing is wrong.
 *
 * This file is `.tsx` on purpose: `jest.config.js` runs `src/**` tests only in the `components`
 * project, which matches `*.test.tsx`. A `.test.ts` here would silently never run.
 */
import {
  arcCaption,
  arcModel,
  arcStatus,
  dashOffset,
  firstLapFraction,
  overLapFraction,
  ringGeometry,
  targetTickLine,
} from './arc-math';

const DIAMETER = 118;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * 54; // 339.29200658769766

describe('ringGeometry', () => {
  it('derives radius from the stroke, so the ring sits inside its box', () => {
    const g = ringGeometry(DIAMETER, STROKE);
    expect(g.radius).toBe(54);
    expect(g.center).toBe(59);
    expect(g.circumference).toBeCloseTo(339.292, 3);
    expect(g.diameter).toBe(118);
    expect(g.stroke).toBe(10);
  });

  it('never produces a negative radius when the stroke is thicker than the ring', () => {
    expect(ringGeometry(20, 40).radius).toBe(0);
    expect(ringGeometry(20, 40).circumference).toBe(0);
  });

  it('survives nonsense input instead of emitting NaN into the SVG', () => {
    // The rule is "a non-finite number is treated as 0": a hairline ring is recoverable, NaN is not.
    expect(ringGeometry(Number.NaN, STROKE).radius).toBe(0);
    expect(ringGeometry(Number.NaN, STROKE).circumference).toBe(0);
    expect(ringGeometry(DIAMETER, Number.POSITIVE_INFINITY).radius).toBe(59);
    expect(Number.isFinite(ringGeometry(DIAMETER, Number.NaN).circumference)).toBe(true);
  });
});

describe('arcStatus', () => {
  it.each([
    ['zero', 0, 2400, 'under'],
    ['partial', 1240, 2400, 'under'],
    ['one under', 2399, 2400, 'under'],
    ['exactly at target', 2400, 2400, 'met'],
    ['one over', 2401, 2400, 'over'],
    ['well over', 2580, 2400, 'over'],
  ])('%s reads as %s', (_name, value, target, expected) => {
    expect(arcStatus(value, target)).toBe(expected);
  });

  it('has no opinion when there is no target', () => {
    expect(arcStatus(1240, 0)).toBe('noTarget');
    expect(arcStatus(1240, -5)).toBe('noTarget');
    expect(arcStatus(1240, Number.NaN)).toBe('noTarget');
  });

  it('treats a negative or broken value as zero rather than drawing backwards', () => {
    expect(arcStatus(-100, 2400)).toBe('under');
    expect(arcStatus(Number.NaN, 2400)).toBe('under');
  });
});

describe('firstLapFraction / overLapFraction', () => {
  it('fills the first lap in proportion to the target', () => {
    expect(firstLapFraction(0, 2400)).toBe(0);
    expect(firstLapFraction(1240, 2400)).toBeCloseTo(0.5166667, 7);
    expect(firstLapFraction(2400, 2400)).toBe(1);
  });

  it('holds the first lap full once past target — the overage is a separate lap', () => {
    expect(firstLapFraction(2580, 2400)).toBe(1);
    expect(overLapFraction(2580, 2400)).toBeCloseTo(0.075, 7); // 180 / 2400
  });

  it('is zero on the second lap until the target is actually passed', () => {
    expect(overLapFraction(0, 2400)).toBe(0);
    expect(overLapFraction(2399, 2400)).toBe(0);
    expect(overLapFraction(2400, 2400)).toBe(0);
  });

  it('clamps a double-target day to one full second lap, never a third', () => {
    expect(overLapFraction(5000, 2400)).toBe(1);
    expect(overLapFraction(24000, 2400)).toBe(1);
  });

  it('is zero with no target, so the ring renders empty instead of NaN', () => {
    expect(firstLapFraction(1240, 0)).toBe(0);
    expect(overLapFraction(1240, 0)).toBe(0);
  });
});

describe('dashOffset', () => {
  it('offsets by the unfilled remainder, so 0 draws nothing and 1 draws the full ring', () => {
    expect(dashOffset(CIRCUMFERENCE, 0)).toBeCloseTo(CIRCUMFERENCE, 10);
    expect(dashOffset(CIRCUMFERENCE, 1)).toBe(0);
  });

  it('matches the hand-computed offset for a half-ish ring', () => {
    // 1240 / 2400 filled -> 0.4833333 unfilled -> 339.292007 * 0.4833333
    expect(dashOffset(CIRCUMFERENCE, firstLapFraction(1240, 2400))).toBeCloseTo(163.9911, 4);
  });

  it('matches the hand-computed offset for the over-target second lap', () => {
    // 180 / 2400 = 0.075 filled -> 339.292007 * 0.925
    expect(dashOffset(CIRCUMFERENCE, overLapFraction(2580, 2400))).toBeCloseTo(313.8451, 4);
  });
});

describe('targetTickLine', () => {
  it('crosses the ring at 12 o’clock, clamped to the box so it is never half-clipped', () => {
    const g = ringGeometry(DIAMETER, STROKE);
    const tick = targetTickLine(g, 16);
    // Drawn in the ring's own (pre-rotation) space: centred on the stroke centre line, r = 54.
    expect(tick.x1).toBe(105); // 59 + 54 - 8
    expect(tick.x2).toBe(118); // 59 + 54 + 8 = 121, clamped to the 118 pt box edge
    expect(tick.y1).toBe(59);
    expect(tick.y2).toBe(59);
  });

  it('spans the full stroke width, so it reads as a tick and not a speck', () => {
    const g = ringGeometry(DIAMETER, STROKE);
    const tick = targetTickLine(g, 16);
    expect(tick.x2 - tick.x1).toBeGreaterThanOrEqual(STROKE);
  });
});

describe('arcCaption — the words that carry "over" without colour', () => {
  const cap = (metric: 'kcal' | 'protein', value: number, target: number) =>
    arcCaption({ metric, value, target, locale: 'en-GB' });

  it('counts calories down to the target, then names the overage', () => {
    expect(cap('kcal', 0, 2400)).toBe('2,400 left');
    expect(cap('kcal', 1240, 2400)).toBe('1,160 left');
    expect(cap('kcal', 2400, 2400)).toBe('Target hit');
    expect(cap('kcal', 2580, 2400)).toBe('180 over');
    expect(cap('kcal', 5000, 2400)).toBe('2,600 over');
  });

  it('uses protein’s own wording — past target is not a warning', () => {
    expect(cap('protein', 96, 180)).toBe('84 g left');
    expect(cap('protein', 180, 180)).toBe('Target hit');
    expect(cap('protein', 192, 180)).toBe('12 g past');
  });

  it('says so when there is no target to be under or over', () => {
    expect(cap('kcal', 1240, 0)).toBe('No target set');
  });

  it('rounds before deciding, so the words can never contradict the number shown', () => {
    // 2400.4 displays as "2,400" of "2,400" — "0 over" would read as a bug.
    expect(cap('kcal', 2400.4, 2400)).toBe('Target hit');
  });
});

describe('arcModel — one call, everything the renderer needs', () => {
  const model = (value: number, target: number, metric: 'kcal' | 'protein' = 'kcal') =>
    arcModel({ metric, value, target, diameter: DIAMETER, stroke: STROKE, locale: 'en-GB' });

  it('describes a partial calorie ring', () => {
    const m = model(1240, 2400);
    expect(m.status).toBe('under');
    expect(m.isOver).toBe(false);
    expect(m.valueText).toBe('1,240');
    expect(m.targetText).toBe('of 2,400');
    expect(m.caption).toBe('1,160 left');
    expect(m.firstLapOffset).toBeCloseTo(163.9911, 4);
    expect(m.ratio).toBeCloseTo(0.5166667, 7);
  });

  it('describes an over-target calorie ring, second lap and all', () => {
    const m = model(2580, 2400);
    expect(m.status).toBe('over');
    expect(m.isOver).toBe(true);
    expect(m.firstLapOffset).toBe(0);
    expect(m.overLapOffset).toBeCloseTo(313.8451, 4);
    expect(m.caption).toBe('180 over');
    expect(m.ratio).toBeCloseTo(1.075, 7);
  });

  it('describes a protein ring in grams', () => {
    const m = model(192, 180, 'protein');
    expect(m.valueText).toBe('192');
    expect(m.targetText).toBe('of 180 g');
    expect(m.caption).toBe('12 g past');
    expect(m.overLapOffset).toBeCloseTo(316.6725, 4);
  });

  it('clamps the animated ratio at two laps, so a huge day cannot spin the ring', () => {
    expect(model(24000, 2400).ratio).toBe(2);
  });

  it('reads out the exact numbers for a screen reader', () => {
    const m = model(1240, 2400);
    expect(m.accessibilityLabel).toBe('Calories');
    expect(m.accessibilityText).toBe('1,240 of 2,400 kcal, 1,160 left');
    expect(model(192, 180, 'protein').accessibilityText).toBe('192 of 180 g protein, 12 g past');
  });

  it('renders an empty ring rather than dividing by zero when no target is set', () => {
    const m = model(1240, 0);
    expect(m.status).toBe('noTarget');
    expect(m.ratio).toBe(0);
    expect(m.firstLapOffset).toBeCloseTo(CIRCUMFERENCE, 10);
    expect(m.caption).toBe('No target set');
  });

  it('says nothing about a target it does not have, rather than "of 0"', () => {
    // "of 0" would read as a target of zero the user never set — in print and to a screen reader.
    const m = model(1240, 0);
    expect(m.targetText).toBe('');
    expect(m.accessibilityText).toBe('1,240 kcal, No target set');
    expect(model(96, 0, 'protein').accessibilityText).toBe('96 protein, No target set');
  });
});
