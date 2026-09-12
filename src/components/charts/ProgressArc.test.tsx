/**
 * `<ProgressArc>` — what it draws, in both themes.
 *
 * The assertions are on the SVG geometry and on token values looked up from the theme under test —
 * never on a hard-coded hex, which would pass while the ring rendered the wrong colour.
 *
 * Animations resolve to their end state in tests (see `test-support/reanimated-mock`), so what is
 * asserted here is the geometry the ring settles on.
 */
import { processColor } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { size, themes, type ThemeName } from '../../theme/tokens';
import { ProgressArc } from './ProgressArc';
import { __setReducedMotion } from './test-support/reanimated-mock';

// Hoisted above the imports by `babel-plugin-jest-hoist`, which is why the factory may not close
// over the import above and reaches for the module itself. See `test-support/reanimated-mock`.
jest.mock('react-native-reanimated', () => jest.requireActual('./test-support/reanimated-mock'));

const CIRCUMFERENCE = 2 * Math.PI * 54;

/**
 * A colour token as it appears on a rendered SVG node. `react-native-svg` does not keep the string:
 * it stores `{ type: 0, payload: <ARGB int> }`. Comparing against the raw hex fails even when the
 * ring is correct, and comparing against the integer would hard-code a colour — this keeps every
 * assertion written in terms of the token while checking what the node actually carries.
 */
const svgColor = (token: string) => ({ type: 0, payload: processColor(token) });

/**
 * The dash offset a node actually carries. `react-native-svg` stores a *falsy* offset as `null`
 * (`extractStroke`: `strokeDasharray && strokeDashoffset ? +strokeDashoffset || 0 : null`), and an
 * absent `stroke-dashoffset` means zero in SVG — so a completed lap reads `null`, not `0`, and the
 * two are the same ring. Normalising here keeps every offset assertion in real units.
 */
const dashOffsetOf = (testID: string): number => screen.getByTestId(testID).props.strokeDashoffset ?? 0;

afterEach(() => __setReducedMotion(false));

const renderArc = (props: Partial<ComponentProps<typeof ProgressArc>> = {}, themeName: ThemeName = 'dark') =>
  render(
    <ProgressArc
      metric="kcal"
      value={1240}
      target={2400}
      theme={themes[themeName]}
      locale="en-GB"
      {...props}
    />,
  );

describe('the four states the ring must get right', () => {
  it('zero: draws the track and nothing else', async () => {
    await renderArc({ value: 0 });

    expect(dashOffsetOf('arc-first-lap')).toBeCloseTo(CIRCUMFERENCE, 6);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('2,400 left')).toBeTruthy();
    expect(screen.queryByTestId('arc-target-tick')).toBeNull();
  });

  it('partial: fills in proportion to the target', async () => {
    await renderArc({ value: 1240 });

    expect(dashOffsetOf('arc-first-lap')).toBeCloseTo(163.9911, 4);
    expect(screen.getByText('1,240')).toBeTruthy();
    expect(screen.getByText('of 2,400')).toBeTruthy();
    expect(screen.getByText('1,160 left')).toBeTruthy();
  });

  it('exactly at target: one full bright lap, no second lap, no tick', async () => {
    await renderArc({ value: 2400 });
    const { color } = themes.dark;

    expect(dashOffsetOf('arc-first-lap')).toBe(0);
    expect(screen.getByTestId('arc-first-lap').props.stroke).toEqual(svgColor(color.arc.kcal));
    expect(screen.getByTestId('arc-base').props.stroke).toEqual(svgColor(color.arc.track));
    expect(screen.queryByTestId('arc-over-lap')).toBeNull();
    expect(screen.queryByTestId('arc-target-tick')).toBeNull();
    expect(screen.getByText('Target hit')).toBeTruthy();
  });

  it('over target: reads as over, not as a full ring', async () => {
    await renderArc({ value: 2580 });
    const { color } = themes.dark;

    // 1. the completed lap drops to muted, so the ring is not a triumphant full bright circle
    expect(screen.getByTestId('arc-base').props.stroke).toEqual(svgColor(color.arc.kcalOverBase));
    expect(screen.getByTestId('arc-base').props.stroke).not.toEqual(svgColor(color.arc.kcal));
    // 2. the overage is a bright second lap
    expect(dashOffsetOf('arc-over-lap')).toBeCloseTo(313.8451, 4);
    expect(screen.getByTestId('arc-over-lap').props.stroke).toEqual(svgColor(color.arc.kcal));
    // 3. knocked out of the lap beneath it, so the overlap is visible as a shape
    const knockout = screen.getByTestId('arc-knockout');
    expect(knockout.props.stroke).toEqual(svgColor(color.arc.overKnockout));
    expect(knockout.props.strokeWidth).toBe(size.arc.stroke + 2 * size.arc.overKnockout);
    // 4. a tick across the ring marks where the target was
    expect(screen.getByTestId('arc-target-tick')).toBeTruthy();
    // 5. and the caption says it in words
    expect(screen.getByText('180 over')).toBeTruthy();
  });

  it('over target: the first lap is not drawn twice over the muted base', async () => {
    await renderArc({ value: 2580 });
    expect(screen.queryByTestId('arc-first-lap')).toBeNull();
  });
});

describe('meaning never rests on colour alone', () => {
  it('keeps every over-target cue that survives greyscale', async () => {
    await renderArc({ value: 2580 });

    // Shape (a second lap with a knockout, a tick) and words — all readable with no hue at all.
    expect(screen.getByTestId('arc-over-lap')).toBeTruthy();
    expect(screen.getByTestId('arc-knockout')).toBeTruthy();
    expect(screen.getByTestId('arc-target-tick')).toBeTruthy();
    expect(screen.getByText('180 over')).toBeTruthy();
  });
});

describe('both themes', () => {
  it.each<ThemeName>(['dark', 'light'])('%s: draws with that theme’s tokens', async (themeName) => {
    await renderArc({ value: 2580 }, themeName);
    const { color } = themes[themeName];

    expect(screen.getByTestId('arc-over-lap').props.stroke).toEqual(svgColor(color.arc.kcal));
    expect(screen.getByTestId('arc-base').props.stroke).toEqual(svgColor(color.arc.kcalOverBase));
    expect(screen.getByTestId('arc-knockout').props.stroke).toEqual(svgColor(color.arc.overKnockout));
    expect(screen.getByTestId('arc-target-tick').props.stroke).toEqual(svgColor(color.arc.targetTickIcon));
  });

  it.each<ThemeName>(['dark', 'light'])('%s: the geometry is identical — only colour changes', async (themeName) => {
    await renderArc({ value: 1240 }, themeName);
    expect(dashOffsetOf('arc-first-lap')).toBeCloseTo(163.9911, 4);
  });

  it('dark: carries the ring bloom', async () => {
    await renderArc({ value: 1240 }, 'dark');
    expect(screen.queryByTestId('arc-glow')).not.toBeNull();
  });

  it('light: draws no bloom — on white it reads as a smudge', async () => {
    // `themes.light.glow.ringOpacity` is 0, so the layer is omitted entirely.
    await renderArc({ value: 1240 }, 'light');
    expect(screen.queryByTestId('arc-glow')).toBeNull();
  });
});

describe('reduce motion', () => {
  it('lands on exactly the same ring, with the value still legible', async () => {
    __setReducedMotion(true);
    await renderArc({ value: 1240 });

    expect(dashOffsetOf('arc-first-lap')).toBeCloseTo(163.9911, 4);
    expect(screen.getByText('1,240')).toBeTruthy();
    expect(screen.getByText('1,160 left')).toBeTruthy();
  });
});

describe('protein', () => {
  it('uses protein’s colour, unit and wording', async () => {
    await renderArc({ metric: 'protein', value: 192, target: 180 });
    const { color } = themes.dark;

    expect(screen.getByTestId('arc-over-lap').props.stroke).toEqual(svgColor(color.arc.protein));
    expect(screen.getByTestId('arc-base').props.stroke).toEqual(svgColor(color.arc.proteinOverBase));
    expect(screen.getByText('of 180 g')).toBeTruthy();
    expect(screen.getByText('12 g past')).toBeTruthy();
  });
});

describe('sizing and accessibility', () => {
  it('draws at the token diameter and stroke', async () => {
    await renderArc();
    const base = screen.getByTestId('arc-base');

    expect(base.props.r).toBe((size.arc.diameter - size.arc.stroke) / 2);
    expect(base.props.strokeWidth).toBe(size.arc.stroke);
    expect(base.props.cx).toBe(size.arc.diameter / 2);
  });

  it('reads out the exact value, not just a percentage', async () => {
    await renderArc();
    const arc = screen.getByTestId('progress-arc');

    expect(arc.props.accessibilityRole).toBe('progressbar');
    expect(arc.props.accessibilityLabel).toBe('Calories');
    expect(arc.props.accessibilityValue).toEqual({
      min: 0,
      max: 2400,
      now: 1240,
      text: '1,240 of 2,400 kcal, 1,160 left',
    });
  });

  it('renders an honest empty ring when no target is set', async () => {
    await renderArc({ target: 0 });

    expect(dashOffsetOf('arc-first-lap')).toBeCloseTo(CIRCUMFERENCE, 6);
    expect(screen.getByText('No target set')).toBeTruthy();
    expect(screen.queryByTestId('arc-target-tick')).toBeNull();
  });

  it('never prints "of 0" under the number when no target is set', async () => {
    await renderArc({ target: 0 });

    // "of 0" is worse than saying nothing: it invents a target of zero that the user never set.
    expect(screen.queryByText('of 0')).toBeNull();
    expect(screen.queryByTestId('arc-target-text')).toBeNull();
    expect(screen.getByText('1,240')).toBeTruthy();
  });

  it('does not announce a maximum of zero when no target is set', async () => {
    await renderArc({ target: 0 });
    const arc = screen.getByTestId('progress-arc');

    // A progressbar reporting now=1240 of max=0 is nonsense to a screen reader; the text carries it.
    expect(arc.props.accessibilityValue).toEqual({ text: '1,240 kcal, No target set' });
  });
});
