/**
 * `<QuickAddTile>` — one cell of the Today quick-add grid (issue #40).
 *
 * ONE TAP, NOTHING ELSE. `onLog` fires the instant the tile is tapped — no dialog, no save button,
 * no navigation. The tile itself never talks to the database: `QuickAddGrid` decides what a tap
 * means (`logFood` or `logMeal`) and this component only shows the result. That split is what lets
 * this file be tested with a plain jest mock for `onLog` and nothing SQLite-shaped in scope.
 *
 * THE LOGGED STATE IS THE ONLY CONFIRMATION. There is no save button, so the wash (`tile.bgLogged`,
 * `tile.borderLogged`) and the haptic are what tell the user something happened. It holds for
 * `interaction.tileLoggedHoldMs`, then reverts to the resting figures. A tap that lands mid-hold is
 * ignored — the double-tap-adds-a-portion gesture is issue #21's, not this one's, and swallowing a
 * fast double tap here is strictly safer than logging twice by accident.
 *
 * ARM'S-LENGTH SIZE. The name renders at `type.tileName` (16.5 pt) — decision 1 in
 * `docs/decisions.md`: six tiles, not nine, is what keeps this size instead of shrinking past the
 * point a gym floor in bad light can read it.
 *
 * PRESS FEEDBACK RUNS ON THE UI THREAD. The only thing that moves is the tile's scale
 * (`size.tile.pressScale`), driven by `motion.events.tilePressIn` / `tilePressOut` through
 * `react-native-reanimated`, same pattern as `ProgressArc`'s ring sweep.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Candidate } from '../../db';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { haptics, interaction, motion, radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';

/** The layered-plates glyph `tile.mealIcon` / `tile.loggedMealIcon` paints — a saved meal, not a
 * single food. Plain Unicode: no icon library is installed yet (`CLAUDE.md` — raise a native
 * dependency before adding one). */
const MEAL_GLYPH = '▤';

export type QuickAddTileProps = {
  /** The food or meal this tile logs. */
  readonly candidate: Candidate;
  /** Called the instant the tile is tapped, once per tap outside the logged hold. Whatever it does
   * (the actual `logFood` / `logMeal` write) is this component's caller's job, not this one's. */
  readonly onLog: (candidate: Candidate) => void;
  readonly theme: Theme;
  /** Formatting locale. Defaults to the device's. */
  readonly locale?: string;
  readonly testID?: string;
};

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

/** "1 pot" for a food, "3 items" for a meal — what one tap logs, bottom right. */
function servingLabelOf(candidate: Candidate): string {
  if (candidate.kind === 'food') return candidate.servingLabel;
  return `${candidate.itemCount} item${candidate.itemCount === 1 ? '' : 's'}`;
}

function accessibilityLabelOf(candidate: Candidate, kcal: string, protein: string): string {
  const kind = candidate.kind === 'meal' ? 'meal' : 'food';
  return `Log ${candidate.name}, ${kind}, ${kcal} kilocalories, ${protein} grams protein`;
}

export function QuickAddTile({ candidate, onLog, theme, locale, testID = 'quick-add-tile' }: QuickAddTileProps) {
  const { tile } = theme.color;
  const fireHaptic = useHapticFeedback();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const [logged, setLogged] = useState(false);
  // Finger down/up, tracked as plain state — the shared-value write it drives lives in the
  // `useEffect` below, not here, matching `ProgressArc`'s ring sweep: the React Compiler's
  // mutation check only recognises a shared-value write as safe inside a `useEffect`, not inside
  // an event handler passed straight to a `Pressable` prop.
  const [pressed, setPressed] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  useEffect(() => {
    // Always routed through `withTiming`, even for the reduce-motion case (`reduced.duration: 0`
    // — an instant jump, not a tween): `tilePressIn`/`tilePressOut` are pinned to a bezier curve
    // in tokens.ts, never `'spring'` — so no fallback is needed here.
    const eventName = pressed ? 'tilePressIn' : 'tilePressOut';
    const target = pressed ? size.tile.pressScale : 1;
    const event = motion.events[eventName];
    const duration = reducedMotion ? event.reduced.duration : event.duration;
    const curve = motion.easing[event.easing];
    scale.value = withTiming(target, { duration, easing: Easing.bezier(...curve) });
  }, [pressed, reducedMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = (): void => {
    // A tap mid-hold is swallowed, not queued — one tap, one log, per `docs/decisions.md`.
    if (logged) return;

    onLog(candidate);
    fireHaptic(haptics.foodLogged);
    setLogged(true);
    holdTimer.current = setTimeout(() => setLogged(false), interaction.tileLoggedHoldMs);
  };

  const kcalText = Math.round(candidate.kcal).toLocaleString(locale);
  const proteinText = Math.round(candidate.protein).toLocaleString(locale);
  const servingLabel = servingLabelOf(candidate);
  const isMeal = candidate.kind === 'meal';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        testID={testID}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={handlePress}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabelOf(candidate, kcalText, proteinText)}
        style={[
          styles.root,
          {
            height: size.tile.heightHit,
            minHeight: size.tapTargetMin,
            borderRadius: radius.lg,
            backgroundColor: logged ? tile.bgLogged : tile.bg,
            borderWidth: logged ? size.tile.borderLogged : StyleSheet.hairlineWidth,
            borderColor: logged ? tile.borderLogged : tile.border,
          },
        ]}
      >
        <View style={styles.header}>
          {isMeal ? (
            <Text
              testID={`${testID}-meal-icon`}
              style={{ fontSize: size.icon.sm, color: logged ? tile.loggedMealIcon : tile.mealIcon, marginRight: space[1] }}
            >
              {MEAL_GLYPH}
            </Text>
          ) : null}
          <Text testID={`${testID}-name`} numberOfLines={size.tile.nameLines} style={[textStyle(type.tileName, tile.nameText), styles.name]}>
            {candidate.name}
          </Text>
        </View>

        <View style={styles.footer}>
          {logged ? (
            <Text testID={`${testID}-logged`} style={textStyle(type.numeric, tile.loggedText)}>
              {'✓ Logged'}
            </Text>
          ) : (
            <View style={styles.figures}>
              <View style={styles.figureGroup}>
                <Text testID={`${testID}-kcal`} style={textStyle(type.numeric, tile.kcalText)}>
                  {kcalText}
                </Text>
                <Text style={textStyle(type.unit, tile.unitText)}> kcal</Text>
              </View>
              <View style={styles.figureGroup}>
                <Text testID={`${testID}-protein`} style={textStyle(type.numeric, tile.proteinText)}>
                  {proteinText}
                </Text>
                <Text style={textStyle(type.unit, tile.unitText)}> P</Text>
              </View>
            </View>
          )}
          <Text testID={`${testID}-serving`} style={textStyle(type.caption, logged ? tile.loggedServingText : tile.servingText)}>
            {servingLabel}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: space[5],
    paddingVertical: space[4],
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  name: {
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  figures: {
    flexDirection: 'row',
    gap: space[3],
  },
  figureGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
});
