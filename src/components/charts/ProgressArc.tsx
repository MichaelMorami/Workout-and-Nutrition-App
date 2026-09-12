/**
 * `<ProgressArc>` — the calorie and protein rings on Today.
 *
 * These are the first thing seen on opening the app, every day, so the states that matter are the
 * ones people actually hit: nothing logged yet, part-way, exactly on target, and past it.
 *
 * PAST TARGET IS NOT A FULL RING. A ring that simply fills up says "done" when the truth is "you
 * went past". Four cues say "over", and not one of them is a hue (issue #19, and the Arcs panel of
 * the design canvas):
 *   1. the completed first lap drops to its muted colour, so the ring stops reading as triumphant;
 *   2. the overage is drawn as a bright SECOND lap on top of it;
 *   3. that lap is knocked out of the lap beneath with a `arc.overKnockout` cut either side, so the
 *      overlap is visible as a shape in greyscale or a screenshot;
 *   4. a tick crosses the ring at 12 o'clock, and the caption changes from "left" to "over"/"past".
 *
 * HOW IT ANIMATES. One shared value — progress in laps — drives every layer through `useAnimatedProps`,
 * so the sweep runs on the UI thread at 60 fps and never touches React. `withTiming` retargets when
 * it is interrupted rather than queueing, which is what the motion spec asks of `arcSweep`. The
 * shared value starts AT the current ratio, so the ring does not sweep up from zero on every mount:
 * `arcSweep` is the response to a log, and `chartDraw` (the once-per-entry stroke-on) belongs to the
 * Charts tab, not here.
 *
 * REDUCE MOTION. The ring jumps to its final length (`motion.events.arcSweep.reduced` is `instant`).
 * Nothing is animation-only, so the value stays fully legible with no motion at all.
 *
 * The maths lives in `arc-math.ts` and is unit-tested there without rendering. The two worklets below
 * are the ONLY duplication of it — kept to inline arithmetic so they can run on the UI thread — and
 * `ProgressArc.test.tsx` asserts the rendered offsets against the same hand-computed fixtures, so the
 * two cannot drift apart unnoticed.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { motion, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { arcModel, type ArcMetric } from './arc-math';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressArcProps = {
  /** Which ring this is. Decides colour, unit and wording — never mix them. */
  readonly metric: ArcMetric;
  /** Today's total, in kcal or grams of protein. */
  readonly value: number;
  /** The target for the day. `0` renders an honest empty ring rather than dividing by zero. */
  readonly target: number;
  /** The resolved theme: `themes[resolveThemeName(preference, useColorScheme())]`. */
  readonly theme: Theme;
  /** Formatting locale. Defaults to the device's. */
  readonly locale?: string;
  readonly diameter?: number;
  readonly stroke?: number;
  readonly testID?: string;
};

/** A `TypeStyle` token as a React Native text style. `fontVariant` is copied because RN wants it mutable. */
function textStyle(token: TypeStyle, color: string): TextStyle {
  return {
    fontFamily: token.fontFamily,
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    textTransform: token.textTransform,
    fontVariant: token.fontVariant ? [...token.fontVariant] : undefined,
    color,
  };
}

/** Each metric owns its colours; protein is never drawn in calorie amber. */
function metricColors(theme: Theme, metric: ArcMetric) {
  const { arc } = theme.color;
  return metric === 'kcal'
    ? { lap: arc.kcal, overBase: arc.kcalOverBase, caption: arc.kcalText }
    : { lap: arc.protein, overBase: arc.proteinOverBase, caption: arc.proteinText };
}

export function ProgressArc({
  metric,
  value,
  target,
  theme,
  locale,
  diameter = size.arc.diameter,
  stroke = size.arc.stroke,
  testID = 'progress-arc',
}: ProgressArcProps) {
  const model = arcModel({
    metric,
    value,
    target,
    diameter,
    stroke,
    locale,
    tickLength: size.arc.targetTickLength,
  });
  const { center, radius, circumference } = model.geometry;
  const colors = metricColors(theme, metric);
  const reducedMotion = useReducedMotion();

  // Progress in laps: 0.52 is half a ring, 1.075 is 7.5% into a second lap.
  const laps = useSharedValue(model.ratio);

  useEffect(() => {
    if (reducedMotion) {
      laps.value = model.ratio;
      return;
    }
    laps.value = withTiming(model.ratio, {
      duration: motion.events.arcSweep.duration,
      easing: Easing.bezier(...motion.easing.standard),
    });
  }, [laps, reducedMotion, model.ratio]);

  // Mirrors `dashOffset(circumference, firstLapFraction(...))`, inline so it can run on the UI thread.
  const firstLapProps = useAnimatedProps(() => {
    'worklet';
    const filled = Math.min(1, Math.max(0, laps.value));
    return { strokeDashoffset: circumference * (1 - filled) };
  });

  // Mirrors `dashOffset(circumference, overLapFraction(...))`.
  const overLapProps = useAnimatedProps(() => {
    'worklet';
    const filled = Math.min(1, Math.max(0, laps.value - 1));
    return { strokeDashoffset: circumference * (1 - filled) };
  });

  const activeLapProps = model.isOver ? overLapProps : firstLapProps;
  /** One full lap of dash followed by one full lap of gap: a single offset then reveals any arc of it. */
  const lapDash = [circumference, circumference];
  const ring = { cx: center, cy: center, r: radius, fill: 'none' } as const;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={model.accessibilityLabel}
      // With no target there is no scale to be a fraction of: `now: 1240` of `max: 0` is nonsense to
      // a screen reader, so the spoken text carries the state on its own.
      accessibilityValue={
        model.status === 'noTarget'
          ? { text: model.accessibilityText }
          : { min: 0, max: model.target, now: model.value, text: model.accessibilityText }
      }
      style={styles.root}
    >
      <View style={{ width: diameter, height: diameter }}>
        <Svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
          {/* -90° puts zero at 12 o'clock, so the ring fills clockwise from the top. */}
          <G rotation={-90} originX={center} originY={center}>
            {theme.glow.ringOpacity > 0 ? (
              <AnimatedCircle
                testID="arc-glow"
                {...ring}
                stroke={colors.lap}
                strokeWidth={stroke + theme.glow.ringRadius}
                strokeLinecap="round"
                strokeDasharray={lapDash}
                opacity={theme.glow.ringOpacity}
                animatedProps={activeLapProps}
              />
            ) : null}

            {/* The ground: the empty track, or — once past target — the completed lap, muted. */}
            <Circle
              testID="arc-base"
              {...ring}
              stroke={model.isOver ? colors.overBase : theme.color.arc.track}
              strokeWidth={stroke}
            />

            {model.isOver ? (
              <>
                <AnimatedCircle
                  testID="arc-knockout"
                  {...ring}
                  stroke={theme.color.arc.overKnockout}
                  strokeWidth={stroke + 2 * size.arc.overKnockout}
                  strokeLinecap="round"
                  strokeDasharray={lapDash}
                  animatedProps={overLapProps}
                />
                <AnimatedCircle
                  testID="arc-over-lap"
                  {...ring}
                  stroke={colors.lap}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={lapDash}
                  animatedProps={overLapProps}
                />
                <Line
                  testID="arc-target-tick"
                  x1={model.tick.x1}
                  y1={model.tick.y1}
                  x2={model.tick.x2}
                  y2={model.tick.y2}
                  stroke={theme.color.arc.targetTickIcon}
                  strokeWidth={size.arc.targetTickWidth}
                  strokeLinecap="round"
                />
              </>
            ) : (
              <AnimatedCircle
                testID="arc-first-lap"
                {...ring}
                stroke={colors.lap}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={lapDash}
                animatedProps={firstLapProps}
              />
            )}
          </G>
        </Svg>

        <View style={styles.readout}>
          <Text style={textStyle(type.microSm, theme.color.arc.labelText)}>{model.label}</Text>
          <Text testID="arc-value" style={textStyle(type.displayXl, theme.color.arc.valueText)}>
            {model.valueText}
          </Text>
          {model.targetText ? (
            <Text testID="arc-target-text" style={textStyle(type.ringCaption, theme.color.arc.captionText)}>
              {model.targetText}
            </Text>
          ) : null}
        </View>
      </View>

      {/* The words that carry "left" vs "over" with no colour involved. */}
      <Text testID="arc-caption" style={[textStyle(type.label, colors.caption), styles.caption]}>
        {model.caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space[3] },
  readout: {
    // Spelled out rather than `StyleSheet.absoluteFill`: RN 0.86 types that as an opaque registered
    // style, and the readout must be a plain object here so the rest of the block merges into it.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    pointerEvents: 'none',
  },
  caption: { textAlign: 'center' },
});
