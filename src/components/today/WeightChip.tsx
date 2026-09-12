/**
 * `<WeightChip>` — the Today weight chip (issue #41, the binding row spec on #20's comment thread).
 *
 * SELF-CONTAINED, LIKE `<QuickAddGrid>`. `weightSummary` is read once, in a lazy `useState`
 * initialiser — there is no tap on this screen that changes it (weight logging is a later issue),
 * so unlike `<TodayHeader>` there is nothing for a caller to keep live.
 *
 * EVERY NUMBER THROUGH THE #39 FORMATTER. `formatWeightKg` is the only seam this app renders a
 * weight through (`CLAUDE.md`, "units are canonical"). `weeklyDelta` is a mean of means and can
 * carry float noise no scale ever showed (e.g. `-0.4285714…`); it is rounded to one decimal —
 * the same precision a bathroom scale reports — before it reaches the formatter, which does no
 * rounding of its own.
 *
 * NEVER COLOUR ALONE. The delta always carries a spoken direction ("up"/"down") in the
 * accessibility label and a ↑/↓ glyph in the visible text, on top of `chip.weightAccentText` —
 * so the direction survives greyscale, a screenshot, or a screen reader (same doctrine as the
 * over-target arc cues in `ProgressArc.tsx`).
 *
 * ONE TAP, NO INTERMEDIATE SCREEN. Tapping always opens Charts — the tech-lead decision on #20 is
 * explicit that this holds in every state, including the empty one, and that a Sprint-1 Charts
 * placeholder is still the correct target.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { formatWeightKg } from '../format/weight';
import { localDateOf, weightSummary, type WeightSummary } from '../../db';
import { deviceWhen } from '../../hooks/deviceWhen';
import { useDb } from '../../hooks/useDb';
import { useTheme } from '../../hooks/useTheme';
import { radius, size, space, type, type TypeStyle } from '../../theme/tokens';

/** Plain Unicode, matching `QuickAddTile.tsx`'s `MEAL_GLYPH`: no icon library is installed yet
 * (`CLAUDE.md` — raise a native dependency before adding one). */
const SCALE_GLYPH = '⚖';

export type WeightChipProps = {
  /** Formatting locale, forwarded to nothing today (the weight formatter is locale-free) — kept
   * for parity with the app's other chips and for when it is not. */
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
    color,
  };
}

/** One decimal — a bathroom scale's precision, not the raw float mean-of-means. */
function roundKg(kg: number): number {
  return Math.round(kg * 10) / 10;
}

type Content = {
  readonly value: string;
  readonly delta: string | null;
  readonly accessibilityLabel: string;
};

function contentFor(summary: WeightSummary): Content {
  if (summary.latest === null) {
    return {
      value: 'No weigh-ins',
      delta: null,
      accessibilityLabel: 'Weight. No weigh-ins yet. Opens Charts.',
    };
  }

  const value = formatWeightKg(summary.latest.weight);
  if (summary.weeklyDelta === null) {
    return { value, delta: null, accessibilityLabel: `Weight ${value}. Opens Charts.` };
  }

  const rounded = roundKg(summary.weeklyDelta);
  // Zero counts as "up" — there is nothing to call a loss, and the sign only ever needs to pick
  // one of two glyphs.
  const isDown = rounded < 0;
  const arrow = isDown ? '↓' : '↑';
  const word = isDown ? 'down' : 'up';
  const magnitude = formatWeightKg(Math.abs(rounded));

  return {
    value,
    delta: `${arrow} ${magnitude}`,
    accessibilityLabel: `Weight ${value}, ${word} ${magnitude} this week. Opens Charts.`,
  };
}

export function WeightChip({ testID = 'weight-chip' }: WeightChipProps) {
  const db = useDb();
  const theme = useTheme();
  const router = useRouter();
  const { chip } = theme.color;

  const [when] = useState(deviceWhen);
  const [summary] = useState<WeightSummary>(() => weightSummary(db, localDateOf(when.at, when.timeZone)));
  const content = contentFor(summary);

  const handlePress = (): void => {
    router.push('/charts');
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={content.accessibilityLabel}
      style={({ pressed }) => [
        styles.root,
        {
          height: size.chip.height,
          minHeight: size.tapTargetMin,
          borderRadius: radius.lg,
          backgroundColor: pressed ? chip.bgPress : chip.bg,
        },
      ]}
    >
      <Text style={[styles.glyph, { color: chip.weightAccentText }]}>{SCALE_GLYPH}</Text>
      <View style={styles.body}>
        <Text testID={`${testID}-label`} style={textStyle(type.microSm, chip.labelText)}>
          Weight
        </Text>
        <View style={styles.valueRow}>
          <Text testID={`${testID}-value`} style={textStyle(type.numericMd, chip.valueText)}>
            {content.value}
          </Text>
          {content.delta ? (
            <Text testID={`${testID}-delta`} style={textStyle(type.caption, chip.weightAccentText)}>
              {content.delta}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingHorizontal: space[5],
  },
  glyph: {
    fontSize: size.icon.md,
  },
  body: {
    flex: 1,
    gap: space[1],
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space[2],
  },
});
